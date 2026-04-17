import type { SavedAnalysisSnapshot } from "../state/types.ts";

export const SAVED_ANALYSES_STORAGE_KEY = "dlens:v1:saved-analyses";

interface StorageAreaLike {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export async function loadSavedAnalyses(storageArea: StorageAreaLike): Promise<SavedAnalysisSnapshot[]> {
  const raw = await storageArea.get(SAVED_ANALYSES_STORAGE_KEY);
  return (raw[SAVED_ANALYSES_STORAGE_KEY] || []) as SavedAnalysisSnapshot[];
}

export async function saveSavedAnalysis(
  storageArea: StorageAreaLike,
  snapshot: SavedAnalysisSnapshot
): Promise<SavedAnalysisSnapshot[]> {
  const existing = await loadSavedAnalyses(storageArea);
  const deduped = existing.filter((entry) => entry.resultId !== snapshot.resultId);
  const next = [snapshot, ...deduped].slice(0, 100);
  await storageArea.set({ [SAVED_ANALYSES_STORAGE_KEY]: next });
  return next;
}
