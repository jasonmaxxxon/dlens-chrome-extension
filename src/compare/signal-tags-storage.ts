import type { StorageAreaLike } from "../state/topic-storage.ts";

export const SIGNAL_TAGS_STORAGE_KEY = "dlens:v1:signal-tags";

/** Legacy records have no reader; explicit deletion cleans only the matching owner. */
export async function deleteSignalTagsByItemId(storageArea: StorageAreaLike, itemId: string): Promise<void> {
  const raw = await storageArea.get(SIGNAL_TAGS_STORAGE_KEY);
  const records = raw[SIGNAL_TAGS_STORAGE_KEY];
  if (!records || typeof records !== "object" || Array.isArray(records)) return;
  const next = { ...records } as Record<string, unknown>;
  delete next[itemId];
  await storageArea.set({ [SIGNAL_TAGS_STORAGE_KEY]: next });
}
