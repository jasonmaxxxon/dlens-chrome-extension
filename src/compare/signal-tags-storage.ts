import type { SignalTagsRecord } from "../state/types.ts";

export const SIGNAL_TAGS_STORAGE_KEY = "dlens:v1:signal-tags";

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readTextString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStatus(value: unknown): SignalTagsRecord["status"] | null {
  return value === "complete" || value === "error" ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  return value
    .map(readTrimmedString)
    .filter((entry) => {
      const normalized = entry.toLowerCase();
      if (!entry || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    })
    .slice(0, 5);
}

function normalizeSignalTags(value: unknown): SignalTagsRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Partial<SignalTagsRecord>;
  const itemId = readTrimmedString(raw.itemId);
  const status = readStatus(raw.status);
  const signalTags = readStringArray(raw.signalTags);
  const signalGist = readTextString(raw.signalGist);
  const promptVersion = readTrimmedString(raw.promptVersion);
  const generatedAt = readTrimmedString(raw.generatedAt);
  if (!itemId || !status || signalTags.length === 0 || !signalGist || !promptVersion || !generatedAt) {
    return null;
  }

  const model = readTrimmedString(raw.model);
  const errorMessage = readTextString(raw.errorMessage);
  return {
    itemId,
    status,
    signalTags,
    signalGist,
    promptVersion,
    model,
    generatedAt,
    ...(errorMessage ? { errorMessage } : {})
  };
}

async function readSignalTagsMap(storageArea: StorageAreaLike): Promise<Record<string, SignalTagsRecord>> {
  const raw = await storageArea.get(SIGNAL_TAGS_STORAGE_KEY);
  const entries = raw[SIGNAL_TAGS_STORAGE_KEY];
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(entries as Record<string, unknown>)
      .map(([key, value]) => [key, normalizeSignalTags(value)] as const)
      .filter((entry): entry is readonly [string, SignalTagsRecord] => entry[1] !== null)
  );
}

export async function saveSignalTags(
  storageArea: StorageAreaLike,
  record: SignalTagsRecord
): Promise<Record<string, SignalTagsRecord>> {
  const normalized = normalizeSignalTags(record);
  if (!normalized) {
    throw new Error("Invalid signal tags");
  }
  const map = await readSignalTagsMap(storageArea);
  const next = {
    ...map,
    [normalized.itemId]: normalized
  };
  await storageArea.set({ [SIGNAL_TAGS_STORAGE_KEY]: next });
  return next;
}

export async function loadSignalTags(
  storageArea: StorageAreaLike,
  itemId: string
): Promise<SignalTagsRecord | null> {
  const map = await readSignalTagsMap(storageArea);
  return map[itemId] ?? null;
}

export async function listSignalTags(
  storageArea: StorageAreaLike,
  itemIds?: readonly string[]
): Promise<SignalTagsRecord[]> {
  const map = await readSignalTagsMap(storageArea);
  const itemIdSet = itemIds ? new Set(itemIds) : null;
  return Object.values(map)
    .filter((record) => !itemIdSet || itemIdSet.has(record.itemId))
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
}

export const signalTagsStorageTestables = {
  normalizeSignalTags
};
