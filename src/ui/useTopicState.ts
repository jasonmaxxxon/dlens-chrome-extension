import { useEffect, useMemo, useState } from "react";

import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import type {
  FolderMode,
  PopupPage,
  ProductSignalAnalysis,
  SavedAnalysisSnapshot,
  SessionRecord,
  Signal,
  Topic,
  TopicSignalReading,
  TriageAction
} from "../state/types";
import { sendExtensionMessage } from "./controller";
import {
  buildProductSignalEvidenceCatalogFromCapture,
  type ProductSignalEvidenceEntry
} from "../compare/product-signal-analysis";
import {
  buildProductSignalReadinessById,
  type ProductSignalReadiness
} from "./product-signal-readiness";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;
type TopicListResponse = { ok: true; topics?: Topic[] } | { ok: false; error: string };
type SignalListResponse = { ok: true; signals?: Signal[] } | { ok: false; error: string };

export function applyTopicListResponses({
  topicsResponse,
  signalsResponse,
  setTopics,
  setSignals
}: {
  topicsResponse: TopicListResponse;
  signalsResponse: SignalListResponse;
  setTopics: (topics: Topic[]) => void;
  setSignals: (signals: Signal[]) => void;
}) {
  if (topicsResponse.ok) {
    setTopics(topicsResponse.topics ?? []);
  }
  if (signalsResponse.ok) {
    setSignals(signalsResponse.signals ?? []);
  }
}

export function pickPrimaryJudgmentPair(pairs: SavedAnalysisSnapshot[]): SavedAnalysisSnapshot | null {
  if (!pairs.length) {
    return null;
  }
  return [...pairs].sort((left, right) => {
    const relevanceDelta = (right.judgmentResult?.relevance ?? 0) - (left.judgmentResult?.relevance ?? 0);
    if (relevanceDelta !== 0) {
      return relevanceDelta;
    }
    return Date.parse(right.savedAt) - Date.parse(left.savedAt);
  })[0] ?? null;
}

export function buildSignalPreviewById(activeFolder: SessionRecord | null, signals: Signal[]): Record<string, string> {
  const lookup = new Map(activeFolder?.items.map((item) => [item.id, item]) ?? []);
  return Object.fromEntries(
    signals.map((signal) => [
      signal.id,
      signal.itemId ? (lookup.get(signal.itemId)?.descriptor.text_snippet || "") : ""
    ])
  );
}

export function buildSignalUrlById(activeFolder: SessionRecord | null, signals: Signal[]): Record<string, string> {
  const lookup = new Map(activeFolder?.items.map((item) => [item.id, item]) ?? []);
  return Object.fromEntries(
    signals.map((signal) => {
      const descriptor = signal.itemId ? lookup.get(signal.itemId)?.descriptor : null;
      return [signal.id, descriptor?.post_url || descriptor?.page_url || ""] as const;
    })
  );
}

export function buildProductSignalEvidenceById(
  activeFolder: SessionRecord | null,
  signals: Signal[]
): Record<string, ProductSignalEvidenceEntry[]> {
  const lookup = new Map(activeFolder?.items.map((item) => [item.id, item]) ?? []);
  return Object.fromEntries(
    signals.map((signal) => {
      const item = signal.itemId ? lookup.get(signal.itemId) : null;
      return [signal.id, buildProductSignalEvidenceCatalogFromCapture(item?.latestCapture)] as const;
    })
  );
}

export function buildTopicJudgmentById(
  topics: Topic[],
  savedAnalyses: SavedAnalysisSnapshot[]
): Record<string, { relevance: number; recommendedState: string }> {
  return Object.fromEntries(
    topics.flatMap((topic) => {
      const pair = pickPrimaryJudgmentPair(savedAnalyses.filter((entry) => topic.pairIds.includes(entry.resultId)));
      return pair?.judgmentResult
        ? [[topic.id, {
            relevance: pair.judgmentResult.relevance,
            recommendedState: pair.judgmentResult.recommendedState
          }] as const]
        : [];
    })
  );
}

export function useTopicState({
  popupOpen,
  activeFolder,
  activeFolderMode,
  savedAnalyses,
  activeSavedAnalysis,
  stateUpdatedAt,
  sendAndSync,
  onNavigate,
  onOpenSavedAnalysis
}: {
  popupOpen: boolean;
  activeFolder: SessionRecord | null;
  activeFolderMode: FolderMode;
  savedAnalyses: SavedAnalysisSnapshot[];
  activeSavedAnalysis: SavedAnalysisSnapshot | null;
  stateUpdatedAt: string | null | undefined;
  sendAndSync: SendAndSync;
  onNavigate: (page: PopupPage) => Promise<void>;
  onOpenSavedAnalysis: (resultId: string) => Promise<void>;
}) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [resultTopicContext, setResultTopicContext] = useState<{ topicId: string; topicName: string } | null>(null);
  const [topicSignalReadingsBySignalId, setTopicSignalReadingsBySignalId] = useState<Record<string, TopicSignalReading>>({});

  const activeTopic = useMemo(
    () => topics.find((topic) => topic.id === selectedTopicId) ?? null,
    [selectedTopicId, topics]
  );
  const signalPreviewById = useMemo(
    () => buildSignalPreviewById(activeFolder, signals),
    [activeFolder, signals]
  );
  const signalUrlById = useMemo(
    () => buildSignalUrlById(activeFolder, signals),
    [activeFolder, signals]
  );
  const productSignalEvidenceById = useMemo(
    () => buildProductSignalEvidenceById(activeFolder, signals),
    [activeFolder, signals]
  );
  const productSignalReadinessById = useMemo(
    () => buildProductSignalReadinessById(activeFolder, signals),
    [activeFolder, signals]
  );
  const activeTopicSignals = useMemo(
    () => signals.filter((signal) => signal.topicId === activeTopic?.id),
    [activeTopic?.id, signals]
  );
  const activeTopicPairs = useMemo(
    () => savedAnalyses.filter((pair) => activeTopic?.pairIds.includes(pair.resultId)),
    [activeTopic?.pairIds, savedAnalyses]
  );
  const topicJudgmentById = useMemo(
    () => buildTopicJudgmentById(topics, savedAnalyses),
    [savedAnalyses, topics]
  );

  useEffect(() => {
    if (!popupOpen || !activeFolder?.id || activeFolderMode === "archive") {
      setTopics([]);
      setSignals([]);
      setSelectedTopicId(null);
      setTopicSignalReadingsBySignalId({});
      return;
    }

    let cancelled = false;
    void Promise.all([
      sendExtensionMessage<TopicListResponse>({
        type: "topic/list",
        sessionId: activeFolder.id
      }),
      sendExtensionMessage<SignalListResponse>({
        type: "signal/list",
        sessionId: activeFolder.id
      })
    ])
      .then(([topicsResponse, signalsResponse]) => {
        if (cancelled) {
          return;
        }
        applyTopicListResponses({ topicsResponse, signalsResponse, setTopics, setSignals });
      })
      .catch(() => {
        // Keep the current topic detail mounted through transient storage/runtime errors.
      });

    return () => {
      cancelled = true;
    };
  }, [activeFolder?.id, activeFolderMode, popupOpen, stateUpdatedAt]);

  useEffect(() => {
    if (activeTopic && !topics.some((topic) => topic.id === activeTopic.id)) {
      setSelectedTopicId(null);
    }
  }, [activeTopic, topics]);

  useEffect(() => {
    if (!selectedTopicId) {
      setTopicSignalReadingsBySignalId({});
      return;
    }
    let cancelled = false;
    void sendExtensionMessage<{ ok: true; topicSignalReadings?: TopicSignalReading[] } | { ok: false; error: string }>({
      type: "topic/list-signal-readings",
      topicId: selectedTopicId
    }).then((response) => {
      if (cancelled || !response.ok || !response.topicSignalReadings) {
        return;
      }
      const map: Record<string, TopicSignalReading> = {};
      for (const reading of response.topicSignalReadings) {
        map[reading.signalId] = reading;
      }
      setTopicSignalReadingsBySignalId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTopicId]);

  async function onSessionModeChange(mode: FolderMode) {
    if (!activeFolder) {
      return;
    }
    const response = await sendAndSync({
      type: "session/set-mode",
      sessionId: activeFolder.id,
      mode
    });
    if (response.ok && mode === "archive") {
      setSelectedTopicId(null);
      setResultTopicContext(null);
    }
  }

  async function onCreateTopic() {
    if (!activeFolder) {
      return;
    }
    const name = window.prompt("新主題名稱");
    if (!name?.trim()) {
      return;
    }
    const researchQuestion = window.prompt("研究問題（可留空）")?.trim() || "";
    const response = await sendExtensionMessage<{ ok: true; topics?: Topic[] } | { ok: false; error: string }>({
      type: "topic/create",
      sessionId: activeFolder.id,
      name: name.trim(),
      context: researchQuestion ? { researchQuestion } : null
    });
    if (response.ok) {
      setTopics(response.topics ?? []);
    }
  }

  async function onNavigateToTopic(topicId: string) {
    setSelectedTopicId(topicId);
    await onNavigate("casebook");
  }

  async function onUpdateTopic(patch: Partial<Topic>) {
    if (!activeTopic) {
      return;
    }
    const response = await sendExtensionMessage<{ ok: true; topics?: Topic[] } | { ok: false; error: string }>({
      type: "topic/update",
      id: activeTopic.id,
      patch: {
        name: patch.name,
        status: patch.status,
        tags: patch.tags,
        description: patch.description,
        context: patch.context
      }
    });
    if (response.ok) {
      setTopics(response.topics ?? []);
    }
  }

  async function onSignalTriaged(signalId: string, action: TriageAction) {
    const response = await sendExtensionMessage<{ ok: true; signals?: Signal[]; topics?: Topic[] } | { ok: false; error: string }>({
      type: "signal/triage",
      signalId,
      action
    });
    if (response.ok) {
      setSignals(response.signals ?? signals);
      setTopics(response.topics ?? topics);
    }
  }

  async function onRemoveSignal(signalId: string) {
    const response = await sendExtensionMessage<{
      ok: true;
      signals?: Signal[];
      topics?: Topic[];
      productSignalAnalyses?: ProductSignalAnalysis[];
    } | { ok: false; error: string }>({
      type: "signal/delete",
      signalId
    });
    if (response.ok) {
      setSignals(response.signals ?? signals.filter((signal) => signal.id !== signalId));
      setTopics(response.topics ?? topics.map((topic) => ({
        ...topic,
        signalIds: topic.signalIds.filter((id) => id !== signalId),
        ...(topic.signalIds.includes(signalId) ? { synthesis: null } : {})
      })));
    }
    return response;
  }

  async function onSignalDeleted(signalId: string): Promise<void> {
    const response = await onRemoveSignal(signalId);
    if (!response.ok) {
      throw new Error(response.error ?? "刪除失敗");
    }
  }

  async function onOpenTopicPair(resultId: string, topicId: string) {
    const topic = topics.find((entry) => entry.id === topicId);
    if (!topic) {
      return;
    }
    setSelectedTopicId(topicId);
    setResultTopicContext({ topicId, topicName: topic.name });
    await onOpenSavedAnalysis(resultId);
  }

  async function onReturnToTopic() {
    if (!resultTopicContext) {
      return;
    }
    setSelectedTopicId(resultTopicContext.topicId);
    await onNavigate("casebook");
  }

  async function onAttachActiveResultToTopic(topicId: string) {
    if (!activeSavedAnalysis) {
      return;
    }
    const response = await sendExtensionMessage<{ ok: true; topics?: Topic[] } | { ok: false; error: string }>({
      type: "topic/add-pair",
      topicId,
      resultId: activeSavedAnalysis.resultId
    });
    if (response.ok) {
      setTopics(response.topics ?? topics);
    }
  }

  async function onGenerateTopicSynthesis(topicId: string): Promise<{ ok: boolean; error?: string }> {
    const response = await sendExtensionMessage<{ ok: true; topics?: Topic[] } | { ok: false; error: string }>({
      type: "topic/synthesis/generate",
      topicId
    });
    if (response.ok) {
      setTopics(response.topics ?? topics);
      return { ok: true };
    }
    return { ok: false, error: response.error };
  }

  async function onGenerateTopicSignalReading(
    signalId: string,
    topicId: string
  ): Promise<{ ok: boolean; error?: string }> {
    const response = await sendExtensionMessage<{ ok: true; topicSignalReading?: TopicSignalReading } | { ok: false; error: string }>({
      type: "topic/generate-signal-reading",
      signalId,
      topicId
    });
    if (response.ok && response.topicSignalReading) {
      setTopicSignalReadingsBySignalId((previous) => ({
        ...previous,
        [signalId]: response.topicSignalReading!
      }));
      return { ok: true };
    }
    return { ok: false, error: response.ok ? "未收到判讀結果" : response.error };
  }

  function onBackFromTopicDetail() {
    setSelectedTopicId(null);
  }

  function clearResultTopicContext() {
    setResultTopicContext(null);
  }

  return {
    topics,
    signals,
    selectedTopicId,
    activeTopic,
    activeTopicSignals,
    activeTopicPairs,
    signalPreviewById,
    signalUrlById,
    productSignalEvidenceById,
    productSignalReadinessById,
    topicSignalReadingsBySignalId,
    topicJudgmentById,
    resultTopicContext,
    clearResultTopicContext,
    onSessionModeChange,
    onCreateTopic,
    onNavigateToTopic,
    onBackFromTopicDetail,
    onUpdateTopic,
    onSignalTriaged,
    onSignalDeleted,
    onRemoveSignal,
    onOpenTopicPair,
    onReturnToTopic,
    onAttachActiveResultToTopic,
    onGenerateTopicSynthesis,
    onGenerateTopicSignalReading
  };
}

export type { ProductSignalReadiness };
