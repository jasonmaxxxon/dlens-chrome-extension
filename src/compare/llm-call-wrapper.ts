import {
  touchRecordCacheEntry,
  upsertRecordCacheEntry,
  type CacheEntryWithAccessMeta
} from "../state/cache-helpers";

export interface ProviderConfig {
  provider: "openai" | "claude" | "google";
  apiKey: string;
}

export type LlmWrapperContext<GlobalState, Request, Context> = {
  global: GlobalState;
  request: Request;
  providerConfig: ProviderConfig;
  context: Context;
};

type LlmWrapperResolution<Result, Context> =
  | { kind: "return"; value: Result }
  | { kind: "continue"; providerConfig: ProviderConfig; context: Context };

export function createLlmCallWrapper<
  GlobalState,
  Request,
  Result,
  CacheEntry extends CacheEntryWithAccessMeta,
  Context
>({
  maxEntries,
  resolveRequest,
  buildCacheKey,
  loadCache,
  saveCache,
  readCachedValue,
  generate,
  buildCacheEntry,
  onError
}: {
  maxEntries: number;
  resolveRequest: (
    global: GlobalState,
    request: Request
  ) => Promise<LlmWrapperResolution<Result, Context>> | LlmWrapperResolution<Result, Context>;
  buildCacheKey: (request: Request, provider: ProviderConfig["provider"]) => string;
  loadCache: () => Promise<Record<string, CacheEntry>>;
  saveCache: (cache: Record<string, CacheEntry>) => Promise<void>;
  readCachedValue: (
    entry: CacheEntry | undefined,
    context: LlmWrapperContext<GlobalState, Request, Context>
  ) => Result | undefined;
  generate: (
    providerConfig: ProviderConfig,
    request: Request,
    context: LlmWrapperContext<GlobalState, Request, Context>
  ) => Promise<Result>;
  buildCacheEntry: (
    result: Result,
    context: LlmWrapperContext<GlobalState, Request, Context>
  ) => CacheEntry | null;
  onError?: (
    error: unknown,
    context: LlmWrapperContext<GlobalState, Request, Context>
  ) => Promise<Result> | Result;
}) {
  return async function runLlmCallWrapper(global: GlobalState, request: Request): Promise<Result> {
    const resolution = await resolveRequest(global, request);
    if (resolution.kind === "return") {
      return resolution.value;
    }

    const context: LlmWrapperContext<GlobalState, Request, Context> = {
      global,
      request,
      providerConfig: resolution.providerConfig,
      context: resolution.context
    };

    const cacheKey = buildCacheKey(request, resolution.providerConfig.provider);
    const cache = await loadCache();
    const cachedValue = readCachedValue(cache[cacheKey], context);
    if (cachedValue !== undefined) {
      await saveCache(touchRecordCacheEntry(cache, cacheKey));
      return cachedValue;
    }

    try {
      const result = await generate(resolution.providerConfig, request, context);
      const cacheEntry = buildCacheEntry(result, context);
      if (cacheEntry) {
        const nextCache = upsertRecordCacheEntry(cache, cacheKey, cacheEntry, maxEntries);
        await saveCache(nextCache);
      }
      return result;
    } catch (error) {
      if (onError) {
        return onError(error, context);
      }
      throw error;
    }
  };
}
