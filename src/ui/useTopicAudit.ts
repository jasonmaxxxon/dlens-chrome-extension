import { useEffect, useMemo, useState } from "react";

import type { EvidencePacket, TopicAuditReport, TopicAuditStageName } from "../compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../compare/topic-audit-validator.ts";
import type { ExtensionMessage, ExtensionResponse } from "../state/messages.ts";
import type { SessionRecord, Topic } from "../state/types.ts";
import type { TopicAuditMemoBundle } from "../state/topic-audit-storage.ts";
import { sendExtensionMessage } from "./controller.tsx";
import type { TopicAuditSummary } from "./topic-audit-components.tsx";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;

export interface TopicAuditUiState {
  auditEvidence: EvidencePacket[];
  auditMemos: TopicAuditMemoBundle | null;
  auditReport: TopicAuditReport | null;
  auditValidatorFlags: TopicAuditValidationFlag[];
  summary: TopicAuditSummary;
}

interface LocalRunState {
  status: "running" | "failed";
  stage: TopicAuditStageName;
  error?: string;
}

function stageNumber(stage: TopicAuditStageName): number {
  switch (stage) {
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
  topic,
  evidence,
  memos,
  report
}: {
  topic: Topic;
  evidence: EvidencePacket[];
  memos: TopicAuditMemoBundle | null;
  report: TopicAuditReport | null;
}): number {
  if (evidence.length > 0) {
    return evidence.length;
  }
  if (memos?.signalReadings.length) {
    return memos.signalReadings.length;
  }
  const generatedSignals = report?.generatedFrom.filter((entry) => entry.endsWith(":p1")).length ?? 0;
  if (generatedSignals > 0) {
    return generatedSignals;
  }
  return topic.signalIds.length;
}

function topicAuditAnalyzedCount({
  evidence,
  memos,
  report
}: {
  evidence: EvidencePacket[];
  memos: TopicAuditMemoBundle | null;
  report: TopicAuditReport | null;
}): number {
  if (evidence.length > 0) {
    const readSignalIds = new Set((memos?.signalReadings ?? []).map((reading) => reading.signalId));
    return evidence.filter((packet) => readSignalIds.has(packet.signalId)).length;
  }
  if (memos?.signalReadings.length) {
    return memos.signalReadings.length;
  }
  return report?.generatedFrom.filter((entry) => entry.endsWith(":p1")).length ?? 0;
}

function topicAuditCoverageLabel(evidence: EvidencePacket[], sourceTotal: number): string | undefined {
  return evidence.length > 0 ? `${evidence.length}/${sourceTotal}` : undefined;
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
  const sourceTotal = topicAuditSourceTotal({ topic, evidence, memos, report });
  const analyzedCount = topicAuditAnalyzedCount({ evidence, memos, report });
  const coverage = topicAuditCoverageLabel(evidence, sourceTotal);
  if (local?.status === "running") {
    return {
      reportStatus: "running",
      analyzedCount,
      queuedCount: sourceTotal - analyzedCount,
      runningStage: stageNumber(local.stage),
      coverage,
      flags
    };
  }
  if (local?.status === "failed") {
    return {
      reportStatus: "failed",
      analyzedCount,
      queuedCount: sourceTotal - analyzedCount,
      failedStage: stageNumber(local.stage),
      failedReason: local.error,
      coverage,
      flags
    };
  }
  if (report && memos) {
    const generatedSignals = topicAuditAnalyzedCount({ evidence, memos, report });
    const added = sourceTotal > generatedSignals ? sourceTotal - generatedSignals : 0;
    const removed = generatedSignals > sourceTotal ? generatedSignals - sourceTotal : 0;
    const isStale = added > 0 || removed > 0 || Date.parse(topic.updatedAt) > Date.parse(report.generatedAt);
    return {
      reportStatus: isStale ? "stale" : "ready",
      analyzedCount,
      queuedCount: sourceTotal - analyzedCount,
      staleDelta: isStale ? { added, removed } : undefined,
      generatedAt: report.generatedAt,
      coverage,
      flags
    };
  }
  return {
    reportStatus: "none",
    analyzedCount,
    queuedCount: sourceTotal,
    coverage,
    flags
  };
}

async function loadAuditState(topicId: string): Promise<{
  evidence: EvidencePacket[];
  memos: TopicAuditMemoBundle | null;
  report: TopicAuditReport | null;
  flags: TopicAuditValidationFlag[];
}> {
  const getResponse = await sendExtensionMessage<ExtensionResponse>({ type: "topic/audit/get", topicId });
  if (!getResponse.ok) {
    throw new Error(getResponse.error);
  }
  let flags: TopicAuditValidationFlag[] = [];
  if (getResponse.auditReport) {
    const validateResponse = await sendExtensionMessage<ExtensionResponse>({ type: "topic/audit/validate", topicId });
    flags = validateResponse.ok ? validateResponse.auditValidatorFlags ?? [] : [];
  }
  return {
    evidence: getResponse.auditEvidence ?? [],
    memos: getResponse.auditMemos ?? null,
    report: getResponse.auditReport ?? null,
    flags
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
  const [loadedByTopicId, setLoadedByTopicId] = useState<Record<string, {
    evidence: EvidencePacket[];
    memos: TopicAuditMemoBundle | null;
    report: TopicAuditReport | null;
    flags: TopicAuditValidationFlag[];
  }>>({});
  const [localRunByTopicId, setLocalRunByTopicId] = useState<Record<string, LocalRunState>>({});
  const [p1RunningByKey, setP1RunningByKey] = useState<Record<string, true>>({});
  const [p1ErrorByKey, setP1ErrorByKey] = useState<Record<string, string>>({});
  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);

  const p1Key = (topicId: string, signalId: string) => `${topicId}::${signalId}`;

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
      const loaded = loadedByTopicId[topic.id] ?? { evidence: [], memos: null, report: null, flags: [] };
      next[topic.id] = {
        auditEvidence: loaded.evidence,
        auditMemos: loaded.memos,
        auditReport: loaded.report,
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

  async function runTopicAudit(topicId: string, fromStage?: TopicAuditStageName) {
    if (!activeFolder?.id) {
      return;
    }
    const startStage = fromStage ?? inferLatestStage(loadedByTopicId[topicId]?.memos ?? null);
    setLocalRunByTopicId((current) => ({ ...current, [topicId]: { status: "running", stage: startStage } }));
    try {
      const response = await sendAndSync({
        type: "topic/audit/run",
        sessionId: activeFolder.id,
        topicId,
        ...(fromStage ? { fromStage } : {})
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      setLoadedByTopicId((current) => ({
        ...current,
        [topicId]: {
          evidence: response.auditEvidence ?? current[topicId]?.evidence ?? [],
          memos: response.auditMemos ?? current[topicId]?.memos ?? null,
          report: response.auditReport ?? current[topicId]?.report ?? null,
          flags: response.auditValidatorFlags ?? current[topicId]?.flags ?? []
        }
      }));
      setLocalRunByTopicId((current) => {
        const next = { ...current };
        delete next[topicId];
        return next;
      });
    } catch (error) {
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
    setP1RunningByKey((current) => ({ ...current, [key]: true }));
    setP1ErrorByKey((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      const response = await sendAndSync({
        type: "topic/audit/p1-signal",
        sessionId: activeFolder.id,
        topicId,
        signalId
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      setLoadedByTopicId((current) => ({
        ...current,
        [topicId]: {
          evidence: response.auditEvidence ?? current[topicId]?.evidence ?? [],
          memos: response.auditMemos ?? current[topicId]?.memos ?? null,
          report: current[topicId]?.report ?? null,
          flags: current[topicId]?.flags ?? []
        }
      }));
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setP1ErrorByKey((current) => ({ ...current, [key]: message }));
      return { ok: false as const, error: message };
    } finally {
      setP1RunningByKey((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
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
