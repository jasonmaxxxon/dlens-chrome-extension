import { createDiscourseTopic } from "./topic-discourse-controller";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import { emitPipelineEvent, type PipelineEventInput } from "../state/pipeline-trace";
import { SIGNALS_STORAGE_KEY, TOPICS_STORAGE_KEY } from "../state/topic-storage";
import type { FolderMode, SessionRecord, Signal, Topic, TriageAction } from "../state/types";
import { sendExtensionMessage } from "./controller";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;
type TopicListResponse = { ok: true; topics?: Topic[] } | { ok: false; error: string };
type SignalListResponse = { ok: true; signals?: Signal[] } | { ok: false; error: string };
type TopicHydrateTraceEventKind = "skip" | "request" | "response" | "error";

export function buildTopicHydrateTraceEvent({
  event,
  sessionId,
  result,
  detail
}: {
  event: TopicHydrateTraceEventKind;
  sessionId?: string;
  result: PipelineEventInput["result"];
  detail?: unknown;
}): PipelineEventInput {
  return {
    phase: "ui.ready",
    step: `popup.topic.hydrate.${event}`,
    target: { sessionId },
    result,
    ...(detail === undefined ? {} : { detail })
  };
}

export function buildTopicHydrateTraceTerminalSequence({
  sessionId,
  terminal
}: {
  sessionId: string;
  terminal: "response" | "error";
}): PipelineEventInput[] {
  return [
    buildTopicHydrateTraceEvent({
      event: "request",
      sessionId,
      result: "pending"
    }),
    buildTopicHydrateTraceEvent({
      event: terminal,
      sessionId,
      result: terminal === "response" ? "ok" : "error"
    })
  ];
}

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

export function findSignalsMissingBackingItems(activeFolder: SessionRecord | null, signals: Signal[]): Signal[] {
  if (!activeFolder?.id) {
    return [];
  }
  const itemById = new Map(activeFolder?.items.map((item) => [item.id, item]) ?? []);
  return signals.filter((signal) => {
    if (signal.sessionId !== activeFolder.id) {
      return false;
    }
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
  if (!activeFolder?.id) {
    return [];
  }
  const orphanIds = new Set(findSignalsMissingBackingItems(activeFolder, signals).map((signal) => signal.id));
  return signals.filter((signal) => signal.sessionId === activeFolder.id && !orphanIds.has(signal.id));
}
export function useTopicState({ popupOpen, activeFolder, activeFolderMode, stateUpdatedAt, sendAndSync }: { popupOpen: boolean; activeFolder: SessionRecord | null; activeFolderMode: FolderMode; stateUpdatedAt: string | null | undefined; sendAndSync: SendAndSync; }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const orphanCleanupAttemptedIdsRef = useRef<Set<string>>(new Set());
  const displaySignals = useMemo(
    () => filterSignalsWithBackingItems(activeFolder, signals),
    [activeFolder, signals]
  );
  const orphanSignals = useMemo(
    () => findSignalsMissingBackingItems(activeFolder, signals),
    [activeFolder, signals]
  );

  // Cards on Threads sort posts into topics directly; re-read when those writes land so the side panel refreshes its manual topic assignments.
  const [topicStoreVersion, setTopicStoreVersion] = useState(0);
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && (TOPICS_STORAGE_KEY in changes || SIGNALS_STORAGE_KEY in changes)) setTopicStoreVersion((version) => version + 1);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  useEffect(() => {
    if (!popupOpen || !activeFolder?.id || activeFolderMode !== "topic") {
      emitPipelineEvent({
        phase: "ui.ready",
        step: "popup.topic.hydrate.skip",
        target: { sessionId: activeFolder?.id },
        result: "ok",
        detail: {
          popupOpen,
          mode: activeFolderMode
        }
      });
      setTopics([]);
      setSignals([]);

      return;
    }

    let cancelled = false;

    emitPipelineEvent({
      phase: "ui.ready",
      step: "popup.topic.hydrate.request",
      target: { sessionId: activeFolder.id },
      result: "pending",
      detail: {
        mode: activeFolderMode
      }
    });
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
        emitPipelineEvent({
          phase: "ui.ready",
          step: "popup.topic.hydrate.response",
          target: { sessionId: activeFolder.id },
          result: topicsResponse.ok && signalsResponse.ok ? "ok" : "error",
          detail: {
            mode: activeFolderMode,
            topicsOk: topicsResponse.ok,
            signalsOk: signalsResponse.ok,
            topicCount: topicsResponse.ok ? topicsResponse.topics?.length ?? 0 : null,
            signalCount: signalsResponse.ok ? signalsResponse.signals?.length ?? 0 : null
          }
        });

        applyTopicListResponses({ topicsResponse, signalsResponse, setTopics, setSignals });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        emitPipelineEvent({
          phase: "ui.ready",
          step: "popup.topic.hydrate.error",
          target: { sessionId: activeFolder.id },
          result: "error",
          detail: {
            mode: activeFolderMode
          }
        });
        // Keep the current topic detail mounted through transient storage/runtime errors.
      });

    return () => {
      cancelled = true;
    };
  }, [activeFolder?.id, activeFolderMode, popupOpen, stateUpdatedAt, topicStoreVersion]);

  useEffect(() => {
    orphanCleanupAttemptedIdsRef.current.clear();
  }, [activeFolder?.id]);

  useEffect(() => {
    if (!popupOpen || !activeFolder?.id || activeFolderMode !== "topic" || orphanSignals.length === 0) {
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

  /** Create a topic from a typed name (the discourse view's inline field), without the prompt dialogs. */
  async function onCreateTopicNamed(name: string, researchQuestion = "", signalId?: string) {
    if (!activeFolder || !name.trim()) return;
    const result = await createDiscourseTopic(sendExtensionMessage, activeFolder.id, name, researchQuestion, signalId);
    setTopics(result.topics ?? topics);
    if (result.signals) setSignals(result.signals);
  }

  async function onDeleteTopic(topicId: string) {
    const topic = topics.find((entry) => entry.id === topicId);
    if (!topic) {
      return;
    }
    if (!window.confirm(`移除議題「${topic.name}」？訊號會回到未分流狀態。`)) {
      return;
    }
    const response = await sendAndSync<{ ok: true; topics?: Topic[] } | { ok: false; error: string }>({
      type: "topic/delete",
      id: topicId
    });
    if (!response.ok) {
      throw new Error(response.error ?? "移除議題失敗");
    }
    setTopics(response.topics ?? topics.filter((entry) => entry.id !== topicId));
  }

  async function onUpdateTopic(patch: Partial<Topic>, topicId?: string) {
    if (!topicId) {
      return;
    }
    const response = await sendExtensionMessage<{ ok: true; topics?: Topic[] } | { ok: false; error: string }>({
      type: "topic/update",
      id: topicId,
      patch: {
        name: patch.name,
        status: patch.status,
        tags: patch.tags,
        description: patch.description,
        context: patch.context
      }
    });
    if (!response.ok) throw new Error(response.error);
    setTopics(response.topics ?? []);
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
    const response = await sendAndSync<{
      ok: true;
      signals?: Signal[];
      topics?: Topic[];
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
  return { topics, signals: displaySignals, onCreateTopicNamed, onUpdateTopic, onDeleteTopic, onSignalTriaged, onSignalDeleted };
}
