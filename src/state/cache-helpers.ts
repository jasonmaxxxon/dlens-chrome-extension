export interface CacheEntryWithAccessMeta {
  generatedAt: string;
  lastAccessedAt?: string;
}

export function touchRecordCacheEntry<T extends CacheEntryWithAccessMeta>(
  cache: Record<string, T>,
  key: string,
  now = new Date().toISOString()
): Record<string, T> {
  const entry = cache[key];
  if (!entry) {
    return cache;
  }
  return {
    ...cache,
    [key]: {
      ...entry,
      lastAccessedAt: now
    }
  };
}

export function upsertRecordCacheEntry<T extends CacheEntryWithAccessMeta>(
  cache: Record<string, T>,
  key: string,
  entry: T,
  maxEntries: number,
  now = new Date().toISOString()
): Record<string, T> {
  const next: Record<string, T> = {
    ...cache,
    [key]: {
      ...entry,
      lastAccessedAt: now
    }
  };

  const orderedKeys = Object.entries(next)
    .sort((left, right) => {
      const leftTouched = left[1].lastAccessedAt || left[1].generatedAt;
      const rightTouched = right[1].lastAccessedAt || right[1].generatedAt;
      if (leftTouched === rightTouched) {
        return left[0].localeCompare(right[0]);
      }
      return rightTouched.localeCompare(leftTouched);
    })
    .slice(0, maxEntries)
    .map(([candidateKey]) => candidateKey);

  return orderedKeys.reduce<Record<string, T>>((acc, candidateKey) => {
    acc[candidateKey] = next[candidateKey]!;
    return acc;
  }, {});
}
