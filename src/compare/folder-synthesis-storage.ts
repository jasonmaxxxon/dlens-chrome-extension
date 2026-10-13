import type { StorageAreaLike } from "../state/topic-storage.ts";

export const FOLDER_SYNTHESIS_STORAGE_KEY = "dlens:v1:folder-synthesis";

/** Legacy records have no reader; explicit deletion cleans only the matching owner. */
export async function clearFolderSynthesis(storageArea: StorageAreaLike, sessionId: string): Promise<void> {
  const raw = await storageArea.get(FOLDER_SYNTHESIS_STORAGE_KEY);
  const records = raw[FOLDER_SYNTHESIS_STORAGE_KEY];
  if (!Array.isArray(records)) return;
  const next = records.filter((record) => !record || typeof record !== "object" || record.sessionId !== sessionId);
  await storageArea.set({ [FOLDER_SYNTHESIS_STORAGE_KEY]: next });
}
