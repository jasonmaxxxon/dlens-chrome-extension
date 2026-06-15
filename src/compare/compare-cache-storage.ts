export interface CompareCacheStorageArea {
  set(items: Record<string, unknown>): Promise<void>;
}

export async function saveCompareCacheMap<T extends Record<string, unknown>>(
  storageArea: CompareCacheStorageArea,
  storageKey: string,
  cache: T
): Promise<void> {
  await storageArea.set({ [storageKey]: cache });
}
