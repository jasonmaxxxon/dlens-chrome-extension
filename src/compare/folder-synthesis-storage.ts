import type { StorageAreaLike } from "../state/topic-storage.ts";
import type {
  FolderSynthesis,
  FolderSynthesisCluster,
  FolderSynthesisMeme,
  FolderSynthesisTopicCoverage,
  TopicSynthesisObservation
} from "../state/types.ts";
import { FOLDER_SYNTHESIS_MIN_TOPICS, FOLDER_SYNTHESIS_VERSION } from "./folder-synthesis.ts";

export const FOLDER_SYNTHESIS_STORAGE_KEY = "dlens:v1:folder-synthesis";

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((entry) => readString(entry).trim())
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function normalizeObservations(value: unknown): TopicSynthesisObservation[] {
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

function normalizeClusters(value: unknown): FolderSynthesisCluster[] {
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
        topicCount: readNumber(raw.topicCount),
        topicIds: readStringArray(raw.topicIds)
      };
    })
    .filter((entry): entry is FolderSynthesisCluster => entry !== null);
}

function normalizeMemes(value: unknown): FolderSynthesisMeme[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const phrase = readString(raw.phrase).trim();
      if (!phrase) return null;
      return {
        phrase,
        occurrences: readNumber(raw.occurrences),
        topicIds: readStringArray(raw.topicIds)
      };
    })
    .filter((entry): entry is FolderSynthesisMeme => entry !== null);
}

function normalizeCoverage(value: unknown): FolderSynthesisTopicCoverage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const topicId = readString(raw.topicId).trim();
      const topicName = readString(raw.topicName).trim();
      if (!topicId) return null;
      return {
        topicId,
        topicName,
        analyzedCount: readNumber(raw.analyzedCount),
        totalCount: readNumber(raw.totalCount)
      };
    })
    .filter((entry): entry is FolderSynthesisTopicCoverage => entry !== null);
}

export function normalizeFolderSynthesis(value: unknown): FolderSynthesis | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const sessionId = readString(raw.sessionId).trim();
  const generatedAt = readString(raw.generatedAt).trim();
  const generatorVersion = readString(raw.generatorVersion).trim();
  const contributingTopicCount = readNumber(raw.contributingTopicCount);
  if (!sessionId || !generatedAt) return null;
  if (generatorVersion !== FOLDER_SYNTHESIS_VERSION) return null;
  if (contributingTopicCount < FOLDER_SYNTHESIS_MIN_TOPICS) return null;
  return {
    sessionId,
    observations: normalizeObservations(raw.observations),
    commonClusters: normalizeClusters(raw.commonClusters),
    memes: normalizeMemes(raw.memes),
    verbalTechniques: readStringArray(raw.verbalTechniques),
    sentimentNarrative: readString(raw.sentimentNarrative).trim(),
    topicCoverage: normalizeCoverage(raw.topicCoverage),
    generatedFromCount: readNumber(raw.generatedFromCount),
    totalSignalCount: readNumber(raw.totalSignalCount),
    contributingTopicCount,
    generatedAt,
    generator: "deterministic",
    generatorVersion: FOLDER_SYNTHESIS_VERSION
  };
}

async function readAll(storageArea: StorageAreaLike): Promise<FolderSynthesis[]> {
  const raw = await storageArea.get(FOLDER_SYNTHESIS_STORAGE_KEY);
  const entries = Array.isArray(raw[FOLDER_SYNTHESIS_STORAGE_KEY]) ? raw[FOLDER_SYNTHESIS_STORAGE_KEY] : [];
  return entries
    .map((entry) => normalizeFolderSynthesis(entry))
    .filter((entry): entry is FolderSynthesis => entry !== null);
}

async function writeAll(storageArea: StorageAreaLike, records: FolderSynthesis[]): Promise<FolderSynthesis[]> {
  await storageArea.set({ [FOLDER_SYNTHESIS_STORAGE_KEY]: records });
  return records;
}

export async function loadFolderSynthesis(
  storageArea: StorageAreaLike,
  sessionId: string
): Promise<FolderSynthesis | null> {
  const records = await readAll(storageArea);
  return records.find((entry) => entry.sessionId === sessionId) ?? null;
}

export async function saveFolderSynthesis(
  storageArea: StorageAreaLike,
  record: FolderSynthesis
): Promise<FolderSynthesis> {
  const normalized = normalizeFolderSynthesis(record);
  if (!normalized) {
    throw new Error("Invalid folder synthesis");
  }
  const records = await readAll(storageArea);
  const next = [normalized, ...records.filter((entry) => entry.sessionId !== normalized.sessionId)];
  await writeAll(storageArea, next);
  return normalized;
}

export async function clearFolderSynthesis(
  storageArea: StorageAreaLike,
  sessionId: string
): Promise<void> {
  const records = await readAll(storageArea);
  const next = records.filter((entry) => entry.sessionId !== sessionId);
  await writeAll(storageArea, next);
}
