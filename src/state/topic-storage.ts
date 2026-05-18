import type {
  Signal,
  SignalInboxStatus,
  SignalSource,
  Topic,
  TopicStatus,
  TopicSynthesis,
  TopicSynthesisCluster,
  TopicSynthesisMeme,
  TopicSynthesisObservation,
  TopicSynthesisOutlier,
  TriageAction
} from "./types.ts";
import { TOPIC_SYNTHESIS_VERSION } from "../compare/topic-synthesis.ts";

export const TOPICS_STORAGE_KEY = "dlens:v1:topics";
export const SIGNALS_STORAGE_KEY = "dlens:v1:signals";

export interface StorageAreaLike {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  return value
    .map((item) => readString(item).trim())
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

function readTopicStatus(value: unknown): TopicStatus {
  return value === "pending" || value === "watching" || value === "learning" || value === "testing" || value === "archived"
    ? value
    : "pending";
}

function readSignalSource(value: unknown): SignalSource | null {
  return value === "threads" || value === "manual" ? value : null;
}

function readSignalInboxStatus(value: unknown): SignalInboxStatus {
  return value === "unprocessed" || value === "assigned" || value === "archived" || value === "rejected"
    ? value
    : "unprocessed";
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSynthesisObservations(value: unknown): TopicSynthesisObservation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const text = readString(raw.text).trim();
      if (!text) return null;
      return { text, evidenceSignalIds: readStringArray(raw.evidenceSignalIds) };
    })
    .filter((entry): entry is TopicSynthesisObservation => entry !== null);
}

function normalizeSynthesisClusters(value: unknown): TopicSynthesisCluster[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const keyword = readString(raw.keyword).trim();
      if (!keyword) return null;
      return {
        keyword,
        signalCount: readNumber(raw.signalCount),
        exampleSignalIds: readStringArray(raw.exampleSignalIds)
      };
    })
    .filter((entry): entry is TopicSynthesisCluster => entry !== null);
}

function normalizeSynthesisMemes(value: unknown): TopicSynthesisMeme[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const phrase = readString(raw.phrase).trim();
      if (!phrase) return null;
      return { phrase, occurrences: readNumber(raw.occurrences) };
    })
    .filter((entry): entry is TopicSynthesisMeme => entry !== null);
}

function normalizeSynthesisOutliers(value: unknown): TopicSynthesisOutlier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const signalId = readString(raw.signalId).trim();
      const reason = readString(raw.reason).trim();
      if (!signalId || !reason) return null;
      return { signalId, reason };
    })
    .filter((entry): entry is TopicSynthesisOutlier => entry !== null);
}

export function normalizeTopicSynthesis(value: unknown): TopicSynthesis | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const generatedAt = readString(raw.generatedAt).trim();
  const generatorVersion = readString(raw.generatorVersion).trim();
  if (!generatedAt) return null;
  if (generatorVersion !== TOPIC_SYNTHESIS_VERSION) return null;
  return {
    observations: normalizeSynthesisObservations(raw.observations),
    commonClusters: normalizeSynthesisClusters(raw.commonClusters),
    verbalTechniques: readStringArray(raw.verbalTechniques),
    memes: normalizeSynthesisMemes(raw.memes),
    sentimentNarrative: readString(raw.sentimentNarrative).trim(),
    outliers: normalizeSynthesisOutliers(raw.outliers),
    generatedFromCount: readNumber(raw.generatedFromCount),
    totalSignalCount: readNumber(raw.totalSignalCount),
    generatedAt,
    generator: "deterministic",
    generatorVersion: TOPIC_SYNTHESIS_VERSION
  };
}

export function normalizeTopic(value: unknown): Topic | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = readString(raw.id).trim();
  const sessionId = readString(raw.sessionId).trim();
  const name = readString(raw.name).trim();
  if (!id || !sessionId || !name) {
    return null;
  }

  return {
    id,
    sessionId,
    name,
    description: readString(raw.description).trim(),
    status: readTopicStatus(raw.status),
    tags: readStringArray(raw.tags),
    signalIds: readStringArray(raw.signalIds),
    pairIds: readStringArray(raw.pairIds),
    createdAt: readString(raw.createdAt, "1970-01-01T00:00:00.000Z").trim() || "1970-01-01T00:00:00.000Z",
    updatedAt: readString(raw.updatedAt, "1970-01-01T00:00:00.000Z").trim() || "1970-01-01T00:00:00.000Z",
    synthesis: normalizeTopicSynthesis(raw.synthesis)
  };
}

export function normalizeSignal(value: unknown): Signal | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = readString(raw.id).trim();
  const sessionId = readString(raw.sessionId).trim();
  const source = readSignalSource(raw.source);
  if (!id || !sessionId || !source) {
    return null;
  }

  const itemId = readString(raw.itemId).trim();
  const topicId = readString(raw.topicId).trim();
  const triagedAt = readString(raw.triagedAt).trim();

  return {
    id,
    sessionId,
    itemId: itemId || undefined,
    source,
    inboxStatus: readSignalInboxStatus(raw.inboxStatus),
    topicId: topicId || undefined,
    suggestedTopicIds: readStringArray(raw.suggestedTopicIds),
    capturedAt: readString(raw.capturedAt, "1970-01-01T00:00:00.000Z").trim() || "1970-01-01T00:00:00.000Z",
    triagedAt: triagedAt || undefined
  };
}

async function readTopics(storageArea: StorageAreaLike): Promise<Topic[]> {
  const raw = await storageArea.get(TOPICS_STORAGE_KEY);
  const entries = Array.isArray(raw[TOPICS_STORAGE_KEY]) ? raw[TOPICS_STORAGE_KEY] : [];
  return entries
    .map((entry) => normalizeTopic(entry))
    .filter((entry): entry is Topic => entry !== null);
}

async function writeTopics(storageArea: StorageAreaLike, topics: Topic[]): Promise<Topic[]> {
  await storageArea.set({ [TOPICS_STORAGE_KEY]: topics });
  return topics;
}

async function readSignals(storageArea: StorageAreaLike): Promise<Signal[]> {
  const raw = await storageArea.get(SIGNALS_STORAGE_KEY);
  const entries = Array.isArray(raw[SIGNALS_STORAGE_KEY]) ? raw[SIGNALS_STORAGE_KEY] : [];
  return entries
    .map((entry) => normalizeSignal(entry))
    .filter((entry): entry is Signal => entry !== null);
}

async function writeSignals(storageArea: StorageAreaLike, signals: Signal[]): Promise<Signal[]> {
  await storageArea.set({ [SIGNALS_STORAGE_KEY]: signals });
  return signals;
}

export async function loadTopics(storageArea: StorageAreaLike, sessionId: string): Promise<Topic[]> {
  const topics = await readTopics(storageArea);
  return topics.filter((topic) => topic.sessionId === sessionId);
}

export async function loadTopicById(storageArea: StorageAreaLike, topicId: string): Promise<Topic | null> {
  const topics = await readTopics(storageArea);
  return topics.find((topic) => topic.id === topicId) ?? null;
}

export async function saveTopic(storageArea: StorageAreaLike, topic: Topic): Promise<Topic[]> {
  const normalized = normalizeTopic(topic);
  if (!normalized) {
    throw new Error("Invalid topic");
  }

  const topics = await readTopics(storageArea);
  const next = [normalized, ...topics.filter((entry) => entry.id !== normalized.id)];
  return writeTopics(storageArea, next);
}

export async function deleteTopic(storageArea: StorageAreaLike, topicId: string): Promise<Topic[]> {
  const topics = await readTopics(storageArea);
  const next = topics.filter((topic) => topic.id !== topicId);
  return writeTopics(storageArea, next);
}

export async function loadSignals(
  storageArea: StorageAreaLike,
  sessionId: string,
  status?: SignalInboxStatus
): Promise<Signal[]> {
  const signals = await readSignals(storageArea);
  return signals.filter((signal) => signal.sessionId === sessionId && (!status || signal.inboxStatus === status));
}

export async function saveSignal(storageArea: StorageAreaLike, signal: Signal): Promise<Signal[]> {
  const normalized = normalizeSignal(signal);
  if (!normalized) {
    throw new Error("Invalid signal");
  }

  const signals = await readSignals(storageArea);
  const next = [normalized, ...signals.filter((entry) => entry.id !== normalized.id)];
  return writeSignals(storageArea, next);
}

export async function saveSignals(storageArea: StorageAreaLike, signals: Signal[]): Promise<Signal[]> {
  const normalized = signals.map((signal) => normalizeSignal(signal));
  if (normalized.some((signal) => signal === null)) {
    throw new Error("Invalid signal");
  }

  const normalizedSignals = normalized as Signal[];
  const existing = await readSignals(storageArea);
  const ids = new Set(normalizedSignals.map((signal) => signal.id));
  const next = [...normalizedSignals, ...existing.filter((entry) => !ids.has(entry.id))];
  return writeSignals(storageArea, next);
}

export async function triageSignal(
  storageArea: StorageAreaLike,
  topicStorageArea: StorageAreaLike,
  signalId: string,
  action: TriageAction,
  sessionId: string
): Promise<{ signal: Signal; topic?: Topic }> {
  const signals = await readSignals(storageArea);
  const signalIndex = signals.findIndex((entry) => entry.id === signalId);
  if (signalIndex === -1) {
    throw new Error("Signal not found");
  }

  const now = new Date().toISOString();
  let nextTopic: Topic | undefined;
  const baseSignal = signals[signalIndex]!;
  let updatedSignal: Signal = {
    ...baseSignal,
    triagedAt: now
  };

  if (action.kind === "assign" || action.kind === "create-topic") {
    const topics = await readTopics(topicStorageArea);
    const topic = action.kind === "assign"
      ? topics.find((entry) => entry.id === action.topicId)
      : {
          id: createId("topic"),
          sessionId,
          name: action.name.trim(),
          description: action.description?.trim() || "",
          status: "pending" as const,
          tags: [],
          signalIds: [],
          pairIds: [],
          createdAt: now,
          updatedAt: now
        };

    if (!topic) {
      throw new Error("Topic not found");
    }

    nextTopic = {
      ...topic,
      signalIds: Array.from(new Set([...topic.signalIds, signalId])),
      updatedAt: now
    };
    const nextTopics = [
      nextTopic,
      ...topics
        .filter((entry) => entry.id !== nextTopic!.id)
        .map((entry) =>
          baseSignal.topicId && entry.id === baseSignal.topicId
            ? { ...entry, signalIds: entry.signalIds.filter((id) => id !== signalId), updatedAt: now }
            : entry
        )
    ];
    await writeTopics(topicStorageArea, nextTopics);
    updatedSignal = {
      ...updatedSignal,
      inboxStatus: "assigned",
      topicId: nextTopic.id
    };
  } else if (action.kind === "archive") {
    if (baseSignal.topicId) {
      const topics = await readTopics(topicStorageArea);
      await writeTopics(topicStorageArea, topics.map((topic) =>
        topic.id === baseSignal.topicId
          ? { ...topic, signalIds: topic.signalIds.filter((id) => id !== signalId), updatedAt: now }
          : topic
      ));
    }
    updatedSignal = {
      ...updatedSignal,
      inboxStatus: "archived",
      topicId: undefined
    };
  } else {
    if (baseSignal.topicId) {
      const topics = await readTopics(topicStorageArea);
      await writeTopics(topicStorageArea, topics.map((topic) =>
        topic.id === baseSignal.topicId
          ? { ...topic, signalIds: topic.signalIds.filter((id) => id !== signalId), updatedAt: now }
          : topic
      ));
    }
    updatedSignal = {
      ...updatedSignal,
      inboxStatus: "rejected",
      topicId: undefined
    };
  }

  await saveSignal(storageArea, updatedSignal);
  return { signal: updatedSignal, topic: nextTopic };
}

export async function deleteSignal(
  storageArea: StorageAreaLike,
  topicStorageArea: StorageAreaLike,
  signalId: string
): Promise<void> {
  const signals = await readSignals(storageArea);
  const signal = signals.find((entry) => entry.id === signalId);
  if (!signal) return;

  const topics = await readTopics(topicStorageArea);
  const now = new Date().toISOString();
  const hasOrphans = topics.some((topic) => topic.signalIds.includes(signalId));
  if (hasOrphans) {
    await writeTopics(topicStorageArea, topics.map((topic) =>
      topic.signalIds.includes(signalId)
        ? { ...topic, signalIds: topic.signalIds.filter((id) => id !== signalId), synthesis: null, updatedAt: now }
        : topic
    ));
  }

  await writeSignals(storageArea, signals.filter((s) => s.id !== signalId));
}
