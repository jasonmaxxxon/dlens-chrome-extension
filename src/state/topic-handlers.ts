import type { ExtensionMessage, ExtensionSuccessResponse } from "./messages";
import type { SessionItem, SessionRecord, Signal, Topic } from "./types";
import {
  deleteTopic,
  loadSignals,
  loadTopics,
  normalizeSignal,
  normalizeTopic,
  saveSignal,
  saveSignals,
  saveTopic,
  SIGNALS_STORAGE_KEY,
  type StorageAreaLike,
  TOPICS_STORAGE_KEY,
  triageSignal
} from "./topic-storage";

type TopicHandlerMessage = Extract<
  ExtensionMessage,
  | { type: "topic/list" }
  | { type: "topic/create" }
  | { type: "topic/update" }
  | { type: "topic/delete" }
  | { type: "topic/add-pair" }
  | { type: "topic/remove-pair" }
  | { type: "signal/list" }
  | { type: "signal/triage" }
>;

type TopicHandlerResult = Pick<ExtensionSuccessResponse, "topics" | "signals">;

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

async function readAllTopics(storageArea: StorageAreaLike): Promise<Topic[]> {
  const raw = await storageArea.get(TOPICS_STORAGE_KEY);
  const entries = Array.isArray(raw[TOPICS_STORAGE_KEY]) ? raw[TOPICS_STORAGE_KEY] : [];
  return entries
    .map((entry) => normalizeTopic(entry))
    .filter((entry): entry is Topic => entry !== null);
}

async function readAllSignals(storageArea: StorageAreaLike): Promise<Signal[]> {
  const raw = await storageArea.get(SIGNALS_STORAGE_KEY);
  const entries = Array.isArray(raw[SIGNALS_STORAGE_KEY]) ? raw[SIGNALS_STORAGE_KEY] : [];
  return entries
    .map((entry) => normalizeSignal(entry))
    .filter((entry): entry is Signal => entry !== null);
}

function cleanTopicPatch(patch: TopicHandlerMessage & { type: "topic/update" }): Partial<Pick<Topic, "name" | "status" | "tags" | "description">> {
  const next: Partial<Pick<Topic, "name" | "status" | "tags" | "description">> = {};
  if (typeof patch.patch.name === "string") {
    next.name = patch.patch.name;
  }
  if (typeof patch.patch.description === "string") {
    next.description = patch.patch.description;
  }
  if (patch.patch.status) {
    next.status = patch.patch.status;
  }
  if (Array.isArray(patch.patch.tags)) {
    next.tags = patch.patch.tags;
  }
  return next;
}

export async function ensureSignalForSavedItem(
  storageArea: StorageAreaLike,
  session: SessionRecord,
  item: SessionItem
): Promise<void> {
  if (session.mode === "archive") {
    return;
  }

  const existing = await loadSignals(storageArea, session.id);
  if (existing.some((signal) => signal.itemId === item.id)) {
    return;
  }

  await saveSignal(storageArea, {
    id: createId("signal"),
    sessionId: session.id,
    itemId: item.id,
    source: "threads",
    inboxStatus: "unprocessed",
    suggestedTopicIds: [],
    capturedAt: new Date().toISOString()
  });
}

export async function handleTopicMessage(
  storageArea: StorageAreaLike,
  message: TopicHandlerMessage
): Promise<TopicHandlerResult> {
  switch (message.type) {
    case "topic/list":
      return {
        topics: await loadTopics(storageArea, message.sessionId)
      };
    case "topic/create": {
      const now = new Date().toISOString();
      await saveTopic(storageArea, {
        id: createId("topic"),
        sessionId: message.sessionId,
        name: message.name.trim(),
        description: message.description?.trim() || "",
        status: "pending",
        tags: [],
        signalIds: [],
        pairIds: [],
        createdAt: now,
        updatedAt: now
      });
      return {
        topics: await loadTopics(storageArea, message.sessionId)
      };
    }
    case "topic/update": {
      const topics = await readAllTopics(storageArea);
      const topic = topics.find((entry) => entry.id === message.id);
      if (!topic) {
        throw new Error("Topic not found");
      }
      await saveTopic(storageArea, {
        ...topic,
        ...cleanTopicPatch(message),
        updatedAt: new Date().toISOString()
      });
      return {
        topics: await loadTopics(storageArea, topic.sessionId)
      };
    }
    case "topic/delete": {
      const topics = await readAllTopics(storageArea);
      const topic = topics.find((entry) => entry.id === message.id);
      if (!topic) {
        throw new Error("Topic not found");
      }
      await deleteTopic(storageArea, message.id);
      const sessionSignals = await loadSignals(storageArea, topic.sessionId);
      const now = new Date().toISOString();
      const toUnassign = sessionSignals
        .filter((signal) => signal.topicId === message.id)
        .map((signal) => ({
          ...signal,
          inboxStatus: "unprocessed" as const,
          topicId: undefined,
          triagedAt: now
        }));
      if (toUnassign.length) {
        await saveSignals(storageArea, toUnassign);
      }
      return {
        topics: await loadTopics(storageArea, topic.sessionId)
      };
    }
    case "topic/add-pair": {
      const topics = await readAllTopics(storageArea);
      const topic = topics.find((entry) => entry.id === message.topicId);
      if (!topic) {
        throw new Error("Topic not found");
      }
      await saveTopic(storageArea, {
        ...topic,
        pairIds: Array.from(new Set([...topic.pairIds, message.resultId])),
        updatedAt: new Date().toISOString()
      });
      return {
        topics: await loadTopics(storageArea, topic.sessionId)
      };
    }
    case "topic/remove-pair": {
      const topics = await readAllTopics(storageArea);
      const topic = topics.find((entry) => entry.id === message.topicId);
      if (!topic) {
        throw new Error("Topic not found");
      }
      await saveTopic(storageArea, {
        ...topic,
        pairIds: topic.pairIds.filter((pairId) => pairId !== message.resultId),
        updatedAt: new Date().toISOString()
      });
      return {
        topics: await loadTopics(storageArea, topic.sessionId)
      };
    }
    case "signal/list":
      return {
        signals: await loadSignals(storageArea, message.sessionId, message.status)
      };
    case "signal/triage": {
      const signals = await readAllSignals(storageArea);
      const signal = signals.find((entry) => entry.id === message.signalId);
      if (!signal) {
        throw new Error("Signal not found");
      }
      await triageSignal(storageArea, storageArea, message.signalId, message.action, signal.sessionId);
      return {
        signals: await loadSignals(storageArea, signal.sessionId),
        topics: await loadTopics(storageArea, signal.sessionId)
      };
    }
  }
}
