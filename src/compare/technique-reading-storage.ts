import type { TechniqueReadingSnapshot } from "../state/types.ts";
import { TECHNIQUE_READING_STORAGE_KEY } from "./technique-reading.ts";

interface StorageAreaLike {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export async function loadTechniqueReadings(storageArea: StorageAreaLike): Promise<TechniqueReadingSnapshot[]> {
  const raw = await storageArea.get(TECHNIQUE_READING_STORAGE_KEY);
  return (raw[TECHNIQUE_READING_STORAGE_KEY] || []) as TechniqueReadingSnapshot[];
}

export async function saveTechniqueReading(
  storageArea: StorageAreaLike,
  snapshot: TechniqueReadingSnapshot
): Promise<TechniqueReadingSnapshot[]> {
  const existing = await loadTechniqueReadings(storageArea);
  const next = [snapshot, ...existing].slice(0, 100);
  await storageArea.set({ [TECHNIQUE_READING_STORAGE_KEY]: next });
  return next;
}
