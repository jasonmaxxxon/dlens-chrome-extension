import type { StorageAreaLike } from "../state/topic-storage.ts";

export const TOPIC_SIGNAL_READINGS_STORAGE_KEY = "dlens:v1:topic-signal-readings";

/** Legacy records have no reader; explicit deletion cleans only the matching owner. */
export async function deleteTopicSignalReadingsBySignalId(storageArea: StorageAreaLike, signalId: string): Promise<void> {
  const raw = await storageArea.get(TOPIC_SIGNAL_READINGS_STORAGE_KEY);
  const records = raw[TOPIC_SIGNAL_READINGS_STORAGE_KEY];
  if (!records || typeof records !== "object" || Array.isArray(records)) return;
  const next = Object.fromEntries(Object.entries(records).filter(([, record]) => !record || typeof record !== "object" || (record as Record<string, unknown>).signalId !== signalId));
  await storageArea.set({ [TOPIC_SIGNAL_READINGS_STORAGE_KEY]: next });
}
