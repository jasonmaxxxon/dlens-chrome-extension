import { useEffect, useMemo, useState } from "react";

import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import type {
  FolderMode,
  PopupPage,
  SavedAnalysisSnapshot,
  SessionRecord,
  Signal,
  Topic,
  TriageAction
} from "../state/types";
import { sendExtensionMessage } from "./controller";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;

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

  const activeTopic = useMemo(
    () => topics.find((topic) => topic.id === selectedTopicId) ?? null,
    [selectedTopicId, topics]
  );
  const signalPreviewById = useMemo(
    () => buildSignalPreviewById(activeFolder, signals),
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
      return;
    }

    let cancelled = false;
    void Promise.all([
      sendExtensionMessage<{ ok: true; topics?: Topic[] } | { ok: false; error: string }>({
        type: "topic/list",
        sessionId: activeFolder.id
      }),
      sendExtensionMessage<{ ok: true; signals?: Signal[] } | { ok: false; error: string }>({
        type: "signal/list",
        sessionId: activeFolder.id
      })
    ])
      .then(([topicsResponse, signalsResponse]) => {
        if (cancelled) {
          return;
        }
        setTopics(topicsResponse.ok ? (topicsResponse.topics ?? []) : []);
        setSignals(signalsResponse.ok ? (signalsResponse.signals ?? []) : []);
      })
      .catch(() => {
        if (!cancelled) {
          setTopics([]);
          setSignals([]);
        }
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
    const response = await sendExtensionMessage<{ ok: true; topics?: Topic[] } | { ok: false; error: string }>({
      type: "topic/create",
      sessionId: activeFolder.id,
      name: name.trim()
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
        description: patch.description
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
    topicJudgmentById,
    resultTopicContext,
    clearResultTopicContext,
    onSessionModeChange,
    onCreateTopic,
    onNavigateToTopic,
    onBackFromTopicDetail,
    onUpdateTopic,
    onSignalTriaged,
    onOpenTopicPair,
    onReturnToTopic,
    onAttachActiveResultToTopic
  };
}
