/** Per-item keys avoid read/modify/write races between the panel and Threads tabs. */
export const OPENED_READING_PREFIX = "dlens:v1:reading-opened:";
export type OpenedReadings = Record<string, string>;
interface OpenedStorage {
  get(keys: null): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}
export function openedItemId(key: string): string | null {
  if (!key.startsWith(OPENED_READING_PREFIX)) return null;
  try { return decodeURIComponent(key.slice(OPENED_READING_PREFIX.length)) || null; } catch { return null; }
}
export function normalizeOpenedReadings(values: Record<string, unknown>): OpenedReadings {
  return Object.fromEntries(Object.entries(values).flatMap(([key, value]) =>
    openedItemId(key) && typeof value === "string" && Number.isFinite(Date.parse(value))
      ? [[openedItemId(key)!, value]] : []));
}
export async function loadOpenedReadings(storage: OpenedStorage): Promise<OpenedReadings> {
  return normalizeOpenedReadings(await storage.get(null));
}
export function markReadingOpened(storage: Pick<OpenedStorage, "set">, itemId: string, at: string): Promise<void> {
  return storage.set({ [OPENED_READING_PREFIX + encodeURIComponent(itemId)]: at });
}
