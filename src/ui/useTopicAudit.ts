import { useEffect, useMemo, useRef, useState } from "react";

import type { EvidencePacket, TopicAuditEpisode, TopicAuditReport, TopicAuditStageName } from "../compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../compare/topic-audit-validator.ts";
import type { ExtensionMessage, ExtensionResponse } from "../state/messages.ts";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace.ts";
import {
  buildReconcileIgnoredEvent,
  createRequestReconciler,
  type RequestReconcileDecision,
  type RequestReconcileTarget,
  type RequestReconcileToken
} from "../state/request-reconcile.ts";
import { deriveDerivedRecordStaleness } from "../state/derived-record.ts";
import type { SessionRecord, Topic } from "../state/types.ts";
import { isTopicAuditPublicationCompatible, type TopicAuditMemoBundle } from "../state/topic-audit-storage.ts";
import { sendExtensionMessage } from "./controller.tsx";
import type { TopicAuditSummary } from "./topic-audit-components.tsx";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;

export interface TopicAuditUiState {
  auditEvidence: EvidencePacket[];
  auditMemos: TopicAuditMemoBundle | null;
  auditReport: TopicAuditReport | null;
  auditEpisodes: TopicAuditEpisode[];
  auditValidatorFlags: TopicAuditValidationFlag[];
  summary: TopicAuditSummary;
}

export interface LoadedTopicAuditState {
  evidence: EvidencePacket[];
  memos: TopicAuditMemoBundle | null;
  report: TopicAuditReport | null;
  episodes: TopicAuditEpisode[];
  flags: TopicAuditValidationFlag[];
}

export type LoadedTopicAuditByTopicId = Record<string, LoadedTopicAuditState>;

interface LocalRunState {
  status: "running" | "failed";
  stage: TopicAuditStageName;
  error?: string;
}

export function shouldClearTopicAuditRunState(settled: RequestReconcileDecision | null): boolean {
  return settled === null || settled.accepted || settled.reason === "target-mismatch";
}

export function shouldClearTopicAuditP1Running(settled: RequestReconcileDecision | null): boolean {
  return settled === null || settled.accepted || settled.reason === "target-mismatch";
}

export function applyTopicAuditRunResult(
  current: LoadedTopicAuditByTopicId,
  topicId: string,
  response: ExtensionResponse,
  settled: RequestReconcileDecision
): LoadedTopicAuditByTopicId {
  if (!settled.accepted || !response.ok) {
    return current;
  }
  return {
    ...current,
    [topicId]: {
      evidence: response.auditEvidence ?? current[topicId]?.evidence ?? [],
      memos: response.auditMemos ?? current[topicId]?.memos ?? null,
      report: response.auditReport ?? current[topicId]?.report ?? null,
      episodes: response.auditEpisodes ?? current[topicId]?.episodes ?? [],
      flags: response.auditValidatorFlags ?? current[topicId]?.flags ?? []
    }
  };
}

export function applyTopicAuditP1Result(
  current: LoadedTopicAuditByTopicId,
  topicId: string,
  response: ExtensionResponse,
  settled: RequestReconcileDecision
): LoadedTopicAuditByTopicId {
  if (!settled.accepted || !response.ok) {
    return current;
  }
  return {
    ...current,
    [topicId]: {
      evidence: response.auditEvidence ?? current[topicId]?.evidence ?? [],
      memos: response.auditMemos ?? current[topicId]?.memos ?? null,
      report: null,
      episodes: current[topicId]?.episodes ?? [],
      flags: []
    }
  };
}

export function invalidateTopicAuditPublication(
  current: LoadedTopicAuditByTopicId,
  topicId: string
): LoadedTopicAuditByTopicId {
  const loaded = current[topicId];
  if (!loaded) {
    return current;
  }
  return {
    ...current,
    [topicId]: {
      ...loaded,
      report: null,
      flags: []
    }
  };
}

function stageNumber(stage: TopicAuditStageName): number {
  switch (stage) {
    case "comment-shard-reading": return 0;
    case "p1-signal-reading": return 1;
    case "lexicon": return 2;
    case "narrative": return 3;
    case "audience": return 4;
    case "absence": return 5;
    case "final": return 6;
  }
}

function inferLatestStage(memos: TopicAuditMemoBundle | null): TopicAuditStageName {
  const latest = memos?.lensMemos.at(-1)?.stageName;
  return latest ?? (memos?.signalReadings.length ? "p1-signal-reading" : "p1-signal-reading");
}

function topicAuditSourceTotal({
  topic
}: {
  topic: Topic;
}): number {
  return topic.signalIds.length;
}

function topicAuditAnalyzedCount({
  inventorySignalIds,
  evidence,
  memos
}: {
  inventorySignalIds: string[];
  evidence: EvidencePacket[];
  memos: TopicAuditMemoBundle | null;
}): number {
  const inventory = new Set(inventorySignalIds);
  const usableEvidence = new Set(evidence.map((packet) => packet.signalId));
  const readSignalIds = new Set((memos?.signalReadings ?? []).map((reading) => reading.signalId));
  return [...readSignalIds].filter((signalId) => (
    inventory.has(signalId)
    && (usableEvidence.size === 0 || usableEvidence.has(signalId))
  )).length;
}

function topicAuditCoverageLabel(analyzedCount: number, sourceTotal: number): string | undefined {
  return sourceTotal > 0 ? `${analyzedCount}/${sourceTotal}` : undefined;
}

/** First sentence of the report's overall section, markdown-stripped — the topic card gist. */
function topicAuditHeadline(report: TopicAuditReport | null): string | undefined {
  const overall = report?.sections.overall;
  if (!overall) return undefined;
  const plain = overall
    .replace(/^[#>\-*\s]+/gm, "")
    .replace(/\*\*/g, "")
    .trim();
  if (!plain) return undefined;
  const firstLine = plain.split("\n")[0]?.trim() ?? "";
  const sentence = firstLine.match(/^[^。！？]{2,}[。！？]/)?.[0] ?? firstLine;
  if (!sentence) return undefined;
  return sentence.length > 64 ? `${sentence.slice(0, 63)}…` : sentence;
}

function makeSummary({
  topic,
  evidence,
  memos,
  report,
  flags,
  local
}: {
  topic: Topic;
  evidence: EvidencePacket[];
  memos: TopicAuditMemoBundle | null;
  report: TopicAuditReport | null;
  flags: TopicAuditValidationFlag[];
  local?: LocalRunState;
}): TopicAuditSummary {
  const sourceTotal = topicAuditSourceTotal({ topic });
  const analyzedCount = topicAuditAnalyzedCount({
    inventorySignalIds: topic.signalIds,
    evidence,
    memos
  });
  const pendingCount = Math.max(0, sourceTotal - analyzedCount);
  const coverage = topicAuditCoverageLabel(analyzedCount, sourceTotal);
  if (local?.status === "running") {
    return {
      reportStatus: "running",
      analyzedCount,
      queuedCount: pendingCount,
      runningStage: stageNumber(local.stage),
      coverage,
      flags
    };
  }
  if (local?.status === "failed") {
    return {
      reportStatus: "failed",
      analyzedCount,
      queuedCount: pendingCount,
      failedStage: stageNumber(local.stage),
      failedReason: local.error,
      coverage,
      flags
    };
  }
  if (
    isTopicAuditPublicationCompatible(report, memos, evidence)
    && report
    && memos
  ) {
    const generatedSignals = report.generatedFrom.filter((entry) => entry.endsWith(":p1")).length;
    const added = sourceTotal > generatedSignals ? sourceTotal - generatedSignals : 0;
    const removed = generatedSignals > sourceTotal ? generatedSignals - sourceTotal : 0;
    const staleness = deriveDerivedRecordStaleness({
      record: {
        generatedAt: report.generatedAt,
        generatorVersion: report.promptVersion
      },
      sourceCount: generatedSignals,
      currentSourceCount: sourceTotal,
      sourceDeltaThreshold: 1,
      currentUpdatedAt: topic.updatedAt
    });
    const isStale = staleness.state === "stale";
    return {
      reportStatus: isStale ? "stale" : "ready",
      analyzedCount,
      queuedCount: pendingCount,
      staleDelta: isStale ? { added, removed } : undefined,
      generatedAt: report.generatedAt,
      coverage,
      flags,
      headline: topicAuditHeadline(report)
    };
  }
  return {
    reportStatus: "none",
    analyzedCount,
    queuedCount: pendingCount,
    coverage,
    flags
  };
}

async function loadAuditState(topicId: string): Promise<{
  evidence: EvidencePacket[];
  memos: TopicAuditMemoBundle | null;
  report: TopicAuditReport | null;
  episodes: TopicAuditEpisode[];
  flags: TopicAuditValidationFlag[];
}> {
  const getResponse = await sendExtensionMessage<ExtensionResponse>({ type: "topic/audit/get", topicId });
  if (!getResponse.ok) {
    throw new Error(getResponse.error);
  }
  return {
    evidence: getResponse.auditEvidence ?? [],
    memos: getResponse.auditMemos ?? null,
    report: getResponse.auditReport ?? null,
    episodes: getResponse.auditEpisodes ?? [],
    flags: getResponse.auditValidatorFlags ?? []
  };
}

export function useTopicAudit({
  popupOpen,
  activeFolder,
  topics,
  sendAndSync
}: {
  popupOpen: boolean;
  activeFolder: SessionRecord | null;
  topics: Topic[];
  sendAndSync: SendAndSync;
}) {
  const [loadedByTopicId, setLoadedByTopicId] = useState<LoadedTopicAuditByTopicId>({});
  const [localRunByTopicId, setLocalRunByTopicId] = useState<Record<string, LocalRunState>>({});
  const [p1RunningByKey, setP1RunningByKey] = useState<Record<string, true>>({});
  const [p1ErrorByKey, setP1ErrorByKey] = useState<Record<string, string>>({});
  const requestReconcilerRef = useRef(createRequestReconciler());
  const activeFolderIdRef = useRef(activeFolder?.id ?? "");
  activeFolderIdRef.current = activeFolder?.id ?? "";
  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);

  const p1Key = (topicId: string, signalId: string) => `${topicId}::${signalId}`;
  const settleTopicAuditResponse = (
    token: RequestReconcileToken,
    currentTarget: RequestReconcileTarget
  ): RequestReconcileDecision => {
    const decision = requestReconcilerRef.current.complete(token, { currentTarget });
    if (!decision.accepted) {
      emitPipelineEvent(buildReconcileIgnoredEvent(token, decision));
    }
    return decision;
  };

  useEffect(() => {
    if (!popupOpen || activeFolder?.mode !== "topic" || topics.length === 0) {
      return;
    }
    let cancelled = false;
    void Promise.all(topics.map(async (topic) => [topic.id, await loadAuditState(topic.id)] as const))
      .then((entries) => {
        if (cancelled) return;
        setLoadedByTopicId(Object.fromEntries(entries));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeFolder?.id, activeFolder?.mode, popupOpen, topics.map((topic) => `${topic.id}:${topic.updatedAt}`).join("|")]);

  const auditByTopicId = useMemo(() => {
    const next: Record<string, TopicAuditUiState> = {};
    for (const topic of topics) {
      const loaded = loadedByTopicId[topic.id] ?? { evidence: [], memos: null, report: null, episodes: [], flags: [] };
      next[topic.id] = {
        auditEvidence: loaded.evidence,
        auditMemos: loaded.memos,
        auditReport: loaded.report,
        auditEpisodes: loaded.episodes,
        auditValidatorFlags: loaded.flags,
        summary: makeSummary({
          topic,
          evidence: loaded.evidence,
          memos: loaded.memos,
          report: loaded.report,
          flags: loaded.flags,
          local: localRunByTopicId[topic.id]
        })
      };
    }
    return next;
  }, [loadedByTopicId, localRunByTopicId, topics]);

  async function refreshTopicAudit(topicId: string) {
    const loaded = await loadAuditState(topicId);
    setLoadedByTopicId((current) => ({ ...current, [topicId]: loaded }));
  }

  async function runTopicAudit(topicId: string, fromStage?: TopicAuditStageName, force?: boolean) {
    if (!activeFolder?.id) {
      return;
    }
    const startStage = fromStage ?? inferLatestStage(loadedByTopicId[topicId]?.memos ?? null);
    const requestId = createPipelineRequestId("topic-audit-run");
    const token = requestReconcilerRef.current.begin({
      lane: `topic.audit.run:${topicId}`,
      requestId,
      target: { sessionId: activeFolder.id, topicId }
    });
    let settled: RequestReconcileDecision | null = null;
    setLocalRunByTopicId((current) => ({ ...current, [topicId]: { status: "running", stage: startStage } }));
    try {
      const response = await sendAndSync({
        type: "topic/audit/run",
        requestId,
        sessionId: activeFolder.id,
        topicId,
        ...(fromStage ? { fromStage } : {}),
        ...(force ? { force: true } : {})
      });
      settled = settleTopicAuditResponse(token, { sessionId: activeFolderIdRef.current, topicId });
      if (!settled.accepted) {
        return;
      }
      if (!response.ok) {
        throw new Error(response.error);
      }
      const acceptedSettled = settled;
      setLoadedByTopicId((current) => applyTopicAuditRunResult(current, topicId, response, acceptedSettled));
      setLocalRunByTopicId((current) => {
        const next = { ...current };
        delete next[topicId];
        return next;
      });
    } catch (error) {
      if (settled === null) {
        settled = settleTopicAuditResponse(token, { sessionId: activeFolderIdRef.current, topicId });
      }
      if (!settled.accepted) {
        return;
      }
      setLocalRunByTopicId((current) => ({
        ...current,
        [topicId]: {
          status: "failed",
          stage: startStage,
          error: error instanceof Error ? error.message : String(error)
        }
      }));
    }
  }

  function openAuditReport(topicId: string, stale = false) {
    const query = new URLSearchParams({ topicId });
    if (stale) query.set("stale", "1");
    const path = `audit-report.html?${query.toString()}`;
    void sendExtensionMessage<ExtensionResponse>({ type: "extension/open-page", path }).catch(() => {
      if (typeof chrome !== "undefined" && chrome.runtime?.getURL && typeof window !== "undefined") {
        window.open(chrome.runtime.getURL(path), "_blank", "noopener,noreferrer");
      }
    });
  }

  async function runP1ForSignal(topicId: string, signalId: string) {
    if (!activeFolder?.id) return { ok: false as const, error: "尚未開啟資料夾" };
    const key = p1Key(topicId, signalId);
    const requestId = createPipelineRequestId("topic-audit-p1");
    const token = requestReconcilerRef.current.begin({
      lane: `topic.audit.p1:${topicId}:${signalId}`,
      requestId,
      target: { sessionId: activeFolder.id, topicId, signalId }
    });
    let settled: RequestReconcileDecision | null = null;
    setP1RunningByKey((current) => ({ ...current, [key]: true }));
    setP1ErrorByKey((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      const response = await sendAndSync({
        type: "topic/audit/p1-signal",
        requestId,
        sessionId: activeFolder.id,
        topicId,
        signalId
      });
      settled = settleTopicAuditResponse(token, { sessionId: activeFolderIdRef.current, topicId, signalId });
      if (!settled.accepted) {
        return { ok: true as const };
      }
      if (!response.ok) {
        throw new Error(response.error);
      }
      const acceptedSettled = settled;
      setLoadedByTopicId((current) => applyTopicAuditP1Result(current, topicId, response, acceptedSettled));
      return { ok: true as const };
    } catch (error) {
      if (settled === null) {
        settled = settleTopicAuditResponse(token, { sessionId: activeFolderIdRef.current, topicId, signalId });
      }
      if (!settled.accepted) {
        return { ok: true as const };
      }
      const message = error instanceof Error ? error.message : String(error);
      setLoadedByTopicId((current) => invalidateTopicAuditPublication(current, topicId));
      setP1ErrorByKey((current) => ({ ...current, [key]: message }));
      return { ok: false as const, error: message };
    } finally {
      if (shouldClearTopicAuditP1Running(settled)) {
        setP1RunningByKey((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
    }
  }

  const p1RunningBySignalId = useMemo(() => {
    const result: Record<string, Record<string, true>> = {};
    for (const key of Object.keys(p1RunningByKey)) {
      const [topicId, signalId] = key.split("::");
      if (!topicId || !signalId) continue;
      if (!result[topicId]) result[topicId] = {};
      result[topicId][signalId] = true;
    }
    return result;
  }, [p1RunningByKey]);

  const p1ErrorBySignalId = useMemo(() => {
    const result: Record<string, Record<string, string>> = {};
    for (const [key, message] of Object.entries(p1ErrorByKey)) {
      const [topicId, signalId] = key.split("::");
      if (!topicId || !signalId) continue;
      if (!result[topicId]) result[topicId] = {};
      result[topicId][signalId] = message;
    }
    return result;
  }, [p1ErrorByKey]);

  return {
    auditByTopicId,
    activeTopicAudit: topicById.size ? null : null,
    refreshTopicAudit,
    runTopicAudit,
    runP1ForSignal,
    p1RunningBySignalId,
    p1ErrorBySignalId,
    openAuditReport
  };
}
