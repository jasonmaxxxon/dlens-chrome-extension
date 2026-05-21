import type { TopicSignalReading, TopicSignalStance } from "../state/types.ts";

export const TOPIC_SIGNAL_READINGS_STORAGE_KEY = "dlens:v1:topic-signal-readings";

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

function storageKey(signalId: string, topicId: string): string {
  return `${topicId}::${signalId}`;
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readTextString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(readTrimmedString).filter(Boolean);
}

function readStatus(value: unknown): TopicSignalReading["status"] | null {
  return value === "complete" || value === "error" ? value : null;
}

function readStance(value: unknown): TopicSignalStance | null {
  return value === "central" || value === "adjacent" || value === "off-topic" ? value : null;
}

function normalizeTopicSignalReading(value: unknown): TopicSignalReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Partial<TopicSignalReading>;
  const signalId = readTrimmedString(raw.signalId);
  const topicId = readTrimmedString(raw.topicId);
  const status = readStatus(raw.status);
  const stance = readStance(raw.stance);
  const reading = readTextString(raw.reading);
  const audienceSignal = readTextString(raw.audienceSignal);
  const promptVersion = readTrimmedString(raw.promptVersion);
  const generatedAt = readTrimmedString(raw.generatedAt);
  if (!signalId || !topicId || !status || !stance || !reading || !audienceSignal || !promptVersion || !generatedAt) {
    return null;
  }

  const model = readTrimmedString(raw.model);
  const errorMessage = readTextString(raw.errorMessage);
  return {
    signalId,
    topicId,
    status,
    stance,
    reading,
    audienceSignal,
    evidenceRefs: readStringArray(raw.evidenceRefs).slice(0, 5),
    uncertainties: readStringArray(raw.uncertainties).slice(0, 3),
    promptVersion,
    model,
    generatedAt,
    ...(errorMessage ? { errorMessage } : {})
  };
}

async function readReadingMap(storageArea: StorageAreaLike): Promise<Record<string, TopicSignalReading>> {
  const raw = await storageArea.get(TOPIC_SIGNAL_READINGS_STORAGE_KEY);
  const entries = raw[TOPIC_SIGNAL_READINGS_STORAGE_KEY];
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(entries as Record<string, unknown>)
      .map(([key, value]) => [key, normalizeTopicSignalReading(value)] as const)
      .filter((entry): entry is readonly [string, TopicSignalReading] => entry[1] !== null)
  );
}

export async function saveTopicSignalReading(
  storageArea: StorageAreaLike,
  reading: TopicSignalReading
): Promise<Record<string, TopicSignalReading>> {
  const normalized = normalizeTopicSignalReading(reading);
  if (!normalized) {
    throw new Error("Invalid topic signal reading");
  }
  const map = await readReadingMap(storageArea);
  const next = {
    ...map,
    [storageKey(normalized.signalId, normalized.topicId)]: normalized
  };
  await storageArea.set({ [TOPIC_SIGNAL_READINGS_STORAGE_KEY]: next });
  return next;
}

export async function loadTopicSignalReading(
  storageArea: StorageAreaLike,
  signalId: string,
  topicId: string
): Promise<TopicSignalReading | null> {
  const map = await readReadingMap(storageArea);
  return map[storageKey(signalId, topicId)] ?? null;
}

export async function listTopicSignalReadings(
  storageArea: StorageAreaLike,
  topicId?: string
): Promise<TopicSignalReading[]> {
  const map = await readReadingMap(storageArea);
  return Object.values(map)
    .filter((reading) => !topicId || reading.topicId === topicId)
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
}

export const topicSignalReadingStorageTestables = {
  normalizeTopicSignalReading
};
