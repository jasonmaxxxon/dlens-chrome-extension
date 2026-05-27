import { useEffect, useMemo, useRef, useState } from "react";

import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import type {
  FolderMode,
  PopupPage,
  ProductSignalAnalysis,
  SavedAnalysisSnapshot,
  SessionRecord,
  Signal,
  SignalTagsRecord,
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
    signals.map((signal) => {
      const descriptor = signal.itemId ? lookup.get(signal.itemId)?.descriptor : null;
      if (signal.itemId && !descriptor) {
        return [signal.id, "資料不完整的 Threads 訊號"] as const;
      }
      const text = descriptor?.text_snippet?.trim();
      if (text) return [signal.id, text] as const;
      const author = descriptor?.author_hint?.trim();
      const url = descriptor?.post_url || descriptor?.page_url || "";
      if (author && url) return [signal.id, `@${author.replace(/^@/, "")} · ${url}`] as const;
      if (url) return [signal.id, url] as const;
      if (author) return [signal.id, `@${author.replace(/^@/, "")}`] as const;
      return [signal.id, ""] as const;
    })
  );
}

export function findSignalsMissingBackingItems(activeFolder: SessionRecord | null, signals: Signal[]): Signal[] {
  const itemById = new Map(activeFolder?.items.map((item) => [item.id, item]) ?? []);
  return signals.filter((signal) => {
    if (!signal.itemId) {
      return false;
    }
    const descriptor = itemById.get(signal.itemId)?.descriptor;
    return !descriptor || !(
      descriptor.text_snippet?.trim() ||
      descriptor.post_url ||
      descriptor.page_url ||
      descriptor.author_hint?.trim()
    );
  });
}

export function filterSignalsWithBackingItems(activeFolder: SessionRecord | null, signals: Signal[]): Signal[] {
  const orphanIds = new Set(findSignalsMissingBackingItems(activeFolder, signals).map((signal) => signal.id));
  return signals.filter((signal) => !orphanIds.has(signal.id));
}

export function resolveTopicCollectionTargetId(
  topics: Topic[],
  selectedTopicId: string | null | undefined,
  storedTopicId: string | null | undefined
): string | null {
  const hasTopic = (topicId: string | null | undefined) => Boolean(topicId && topics.some((topic) => topic.id === topicId));
  if (hasTopic(selectedTopicId)) {
    return selectedTopicId!;
  }
  if (hasTopic(storedTopicId)) {
    return storedTopicId!;
  }
  if (!selectedTopicId && !storedTopicId && topics.length === 1) {
    return topics[0]?.id ?? null;
  }
  return null;
}

export function navigateToTopicImmediately({
  topicId,
  setSelectedTopicId,
  persistCollectionTarget,
  onNavigate
}: {
  topicId: string;
  setSelectedTopicId: (topicId: string) => void;
  persistCollectionTarget: (topicId: string) => Promise<unknown>;
  onNavigate: (page: PopupPage) => Promise<void>;
}): Promise<void> {
  setSelectedTopicId(topicId);
  void persistCollectionTarget(topicId).catch(() => undefined);
  return onNavigate("topic-detail");
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
  collectionTopicId,
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
  collectionTopicId?: string | null;
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
  const [signalTagsByItemId, setSignalTagsByItemId] = useState<Record<string, SignalTagsRecord>>({});
  const orphanCleanupAttemptedIdsRef = useRef<Set<string>>(new Set());

  const activeTopic = useMemo(
    () => topics.find((topic) => topic.id === selectedTopicId) ?? null,
    [selectedTopicId, topics]
  );
  const displaySignals = useMemo(
    () => filterSignalsWithBackingItems(activeFolder, signals),
    [activeFolder, signals]
  );
  const orphanSignals = useMemo(
    () => findSignalsMissingBackingItems(activeFolder, signals),
    [activeFolder, signals]
  );
  const signalPreviewById = useMemo(
    () => buildSignalPreviewById(activeFolder, displaySignals),
    [activeFolder, displaySignals]
  );
  const signalUrlById = useMemo(
    () => buildSignalUrlById(activeFolder, displaySignals),
    [activeFolder, displaySignals]
  );
  const productSignalEvidenceById = useMemo(
    () => buildProductSignalEvidenceById(activeFolder, displaySignals),
    [activeFolder, displaySignals]
  );
  const productSignalReadinessById = useMemo(
    () => buildProductSignalReadinessById(activeFolder, displaySignals),
    [activeFolder, displaySignals]
  );
  const activeTopicSignals = useMemo(
    () => displaySignals.filter((signal) => signal.topicId === activeTopic?.id),
    [activeTopic?.id, displaySignals]
  );
  const activeTopicItemIds = useMemo(
    () => Array.from(new Set(activeTopicSignals.map((signal) => signal.itemId).filter((itemId): itemId is string => Boolean(itemId)))),
    [activeTopicSignals]
  );
  const allSignalItemIds = useMemo(
    () => Array.from(new Set(displaySignals.map((signal) => signal.itemId).filter((itemId): itemId is string => Boolean(itemId)))),
    [displaySignals]
  );
  const activeTopicPairs = useMemo(
    () => savedAnalyses.filter((pair) => activeTopic?.pairIds.includes(pair.resultId)),
    [activeTopic?.pairIds, savedAnalyses]
  );
  const topicJudgmentById = useMemo(
    () => buildTopicJudgmentById(topics, savedAnalyses),
    [savedAnalyses, topics]
  );
  const collectionTargetId = useMemo(
    () => resolveTopicCollectionTargetId(topics, selectedTopicId, collectionTopicId),
    [collectionTopicId, selectedTopicId, topics]
  );

  useEffect(() => {
    if (!popupOpen || !activeFolder?.id || activeFolderMode === "archive") {
      setTopics([]);
      setSignals([]);
      setSelectedTopicId(null);
      setTopicSignalReadingsBySignalId({});
      setSignalTagsByItemId({});
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
    if (!collectionTargetId) {
      return;
    }
    if (selectedTopicId !== collectionTargetId) {
      setSelectedTopicId(collectionTargetId);
    }
  }, [collectionTargetId, selectedTopicId]);

  useEffect(() => {
    orphanCleanupAttemptedIdsRef.current.clear();
  }, [activeFolder?.id]);

  useEffect(() => {
    if (!popupOpen || !activeFolder?.id || activeFolderMode === "archive" || orphanSignals.length === 0) {
      return;
    }

    for (const orphan of orphanSignals) {
      if (orphanCleanupAttemptedIdsRef.current.has(orphan.id)) {
        continue;
      }
      orphanCleanupAttemptedIdsRef.current.add(orphan.id);
      void onRemoveSignal(orphan.id).catch(() => {
        // Keep the corrupt row hidden locally even if storage cleanup is delayed.
      });
    }
  }, [activeFolder?.id, activeFolderMode, orphanSignals, popupOpen]);

  useEffect(() => {
    if (!popupOpen || activeFolderMode !== "topic" || !collectionTargetId || collectionTopicId === collectionTargetId) {
      return;
    }
    void sendAndSync({ type: "topic/set-collection-target", topicId: collectionTargetId });
  }, [activeFolderMode, collectionTargetId, collectionTopicId, popupOpen, sendAndSync]);

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

  useEffect(() => {
    if (allSignalItemIds.length === 0) {
      setSignalTagsByItemId({});
      return;
    }
    let cancelled = false;
    const itemIds = allSignalItemIds;
    void sendExtensionMessage<{ ok: true; signalTags?: SignalTagsRecord[] } | { ok: false; error: string }>({
      type: "signal/list-tags",
      itemIds
    }).then((response) => {
      if (cancelled || !response.ok) {
        return;
      }
      const itemIdSet = new Set(itemIds);
      const map: Record<string, SignalTagsRecord> = {};
      for (const record of response.signalTags ?? []) {
        if (itemIdSet.has(record.itemId)) {
          map[record.itemId] = record;
        }
      }
      setSignalTagsByItemId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [allSignalItemIds.join("|")]);

  useEffect(() => {
    if (!selectedTopicId || activeTopicItemIds.length === 0) {
      return;
    }
    let cancelled = false;
    const itemIds = activeTopicItemIds;
    const mergeRecords = (records: SignalTagsRecord[]) => {
      if (cancelled) {
        return;
      }
      setSignalTagsByItemId((previous) => {
        const next = { ...previous };
        for (const record of records) {
          next[record.itemId] = record;
        }
        return next;
      });
    };

    void sendExtensionMessage<{ ok: true; signalTags?: SignalTagsRecord[] } | { ok: false; error: string }>({
      type: "signal/list-tags",
      itemIds
    }).then((response) => {
      if (cancelled || !response.ok) {
        return;
      }
      const records = response.signalTags ?? [];
      mergeRecords(records);
      const tagged = new Set(records.map((record) => record.itemId));
      const hasMissing = itemIds.some((itemId) => !tagged.has(itemId));
      if (!hasMissing) {
        return;
      }
      void sendExtensionMessage<{ ok: true; signalTags?: SignalTagsRecord[] } | { ok: false; error: string }>({
        type: "topic/generate-missing-signal-tags",
        topicId: selectedTopicId
      }).then((generateResponse) => {
        if (!cancelled && generateResponse.ok) {
          mergeRecords(generateResponse.signalTags ?? []);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTopicItemIds.join("|"), selectedTopicId]);

  async function onSessionModeChange(mode: FolderMode) {
    if (!activeFolder) {
      return null;
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
    return response;
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
      const nextTopics = response.topics ?? [];
      setTopics(nextTopics);
      const createdTopic = nextTopics.find((topic) => !topics.some((previous) => previous.id === topic.id)) ?? nextTopics[0];
      const nextTopicId = createdTopic?.id ?? null;
      setSelectedTopicId(nextTopicId);
      if (nextTopicId) {
        await sendAndSync({ type: "topic/set-collection-target", topicId: nextTopicId });
      }
    }
  }

  function onSelectTopicTarget(topicId: string) {
    setSelectedTopicId(topicId);
    void sendAndSync({ type: "topic/set-collection-target", topicId });
  }

  async function onNavigateToTopic(topicId: string) {
    await navigateToTopicImmediately({
      topicId,
      setSelectedTopicId,
      persistCollectionTarget: (nextTopicId) => sendAndSync({ type: "topic/set-collection-target", topicId: nextTopicId }),
      onNavigate
    });
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

  async function onCreateTopicFromSignals(signalIds: string[]) {
    if (!activeFolder || signalIds.length < 3) {
      return;
    }
    const name = window.prompt("新主題名稱");
    if (!name?.trim()) {
      return;
    }
    const [firstSignalId, ...restSignalIds] = signalIds;
    const firstResponse = await sendExtensionMessage<{ ok: true; signals?: Signal[]; topics?: Topic[] } | { ok: false; error: string }>({
      type: "signal/triage",
      signalId: firstSignalId!,
      action: { kind: "create-topic", name: name.trim() }
    });
    if (!firstResponse.ok) {
      return;
    }
    const topicId = firstResponse.topics?.find((topic) => topic.signalIds.includes(firstSignalId!))?.id;
    if (!topicId) {
      setSignals(firstResponse.signals ?? signals);
      setTopics(firstResponse.topics ?? topics);
      return;
    }
    let latestSignals = firstResponse.signals ?? signals;
    let latestTopics = firstResponse.topics ?? topics;
    for (const signalId of restSignalIds) {
      const response = await sendExtensionMessage<{ ok: true; signals?: Signal[]; topics?: Topic[] } | { ok: false; error: string }>({
        type: "signal/triage",
        signalId,
        action: { kind: "assign", topicId }
      });
      if (response.ok) {
        latestSignals = response.signals ?? latestSignals;
        latestTopics = response.topics ?? latestTopics;
      }
    }
    setSignals(latestSignals);
    setTopics(latestTopics);
    setSelectedTopicId(topicId);
    await sendAndSync({ type: "topic/set-collection-target", topicId });
    await onNavigate("topic-detail");
  }

  async function onRemoveSignal(signalId: string) {
    const response = await sendAndSync<{
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
    await onNavigate("topic-detail");
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
    void onNavigate("topics");
  }

  function clearResultTopicContext() {
    setResultTopicContext(null);
  }

  return {
    topics,
    signals: displaySignals,
    selectedTopicId,
    activeTopic,
    activeTopicSignals,
    activeTopicPairs,
    signalPreviewById,
    signalUrlById,
    signalTagsByItemId,
    productSignalEvidenceById,
    productSignalReadinessById,
    topicSignalReadingsBySignalId,
    topicJudgmentById,
    resultTopicContext,
    clearResultTopicContext,
    onSessionModeChange,
    onCreateTopic,
    onSelectTopicTarget,
    onNavigateToTopic,
    onBackFromTopicDetail,
    onUpdateTopic,
    onSignalTriaged,
    onCreateTopicFromSignals,
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
