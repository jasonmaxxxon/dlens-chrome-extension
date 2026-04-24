import assert from "node:assert/strict";
import test from "node:test";

import { createLlmCallWrapper, type ProviderConfig } from "../src/compare/llm-call-wrapper.ts";

type CacheEntry = {
  value: string;
  generatedAt: string;
  lastAccessedAt?: string;
};

function buildProvider(provider = "google"): ProviderConfig {
  return {
    provider: provider as ProviderConfig["provider"],
    apiKey: "test-key"
  };
}

test("createLlmCallWrapper returns the immediate fallback before touching cache when provider is unavailable", async () => {
  let loadCacheCalls = 0;

  const wrapper = createLlmCallWrapper({
    maxEntries: 5,
    resolveRequest: async () => ({ kind: "return" as const, value: "fallback" }),
    buildCacheKey: () => "cache-key",
    loadCache: async () => {
      loadCacheCalls += 1;
      return {};
    },
    saveCache: async () => undefined,
    readCachedValue: () => undefined,
    generate: async () => "live",
    buildCacheEntry: () => null
  });

  const result = await wrapper({}, { id: "request-1" });

  assert.equal(result, "fallback");
  assert.equal(loadCacheCalls, 0);
});

test("createLlmCallWrapper touches cache entries and skips generation on cache hit", async () => {
  let generateCalls = 0;
  let savedCache: Record<string, CacheEntry> | null = null;

  const wrapper = createLlmCallWrapper<object, { id: string }, string, CacheEntry, {}>
  ({
    maxEntries: 5,
    resolveRequest: async () => ({
      kind: "continue" as const,
      providerConfig: buildProvider(),
      context: {}
    }),
    buildCacheKey: () => "cache-key",
    loadCache: async () => ({
      "cache-key": {
        value: "cached",
        generatedAt: "2026-04-21T10:00:00.000Z"
      }
    }),
    saveCache: async (cache) => {
      savedCache = cache;
    },
    readCachedValue: (entry) => entry?.value,
    generate: async () => {
      generateCalls += 1;
      return "live";
    },
    buildCacheEntry: () => null
  });

  const result = await wrapper({}, { id: "request-1" });

  assert.equal(result, "cached");
  assert.equal(generateCalls, 0);
  assert.ok(savedCache?.["cache-key"]?.lastAccessedAt);
});

test("createLlmCallWrapper uses onError fallback when generation fails", async () => {
  const wrapper = createLlmCallWrapper<object, { id: string }, string, CacheEntry, { fallback: string }>({
    maxEntries: 5,
    resolveRequest: async () => ({
      kind: "continue" as const,
      providerConfig: buildProvider(),
      context: { fallback: "fallback" }
    }),
    buildCacheKey: () => "cache-key",
    loadCache: async () => ({}),
    saveCache: async () => undefined,
    readCachedValue: () => undefined,
    generate: async () => {
      throw new Error("boom");
    },
    buildCacheEntry: () => null,
    onError: async (_error, context) => context.context.fallback
  });

  const result = await wrapper({}, { id: "request-1" });

  assert.equal(result, "fallback");
});

test("createLlmCallWrapper rethrows when generation fails and no error fallback is configured", async () => {
  const wrapper = createLlmCallWrapper<object, { id: string }, string, CacheEntry, {}>({
    maxEntries: 5,
    resolveRequest: async () => ({
      kind: "continue" as const,
      providerConfig: buildProvider(),
      context: {}
    }),
    buildCacheKey: () => "cache-key",
    loadCache: async () => ({}),
    saveCache: async () => undefined,
    readCachedValue: () => undefined,
    generate: async () => {
      throw new Error("boom");
    },
    buildCacheEntry: () => null
  });

  await assert.rejects(() => wrapper({}, { id: "request-1" }), /boom/);
});

test("createLlmCallWrapper skips cache writes when buildCacheEntry returns null", async () => {
  let saveCacheCalls = 0;

  const wrapper = createLlmCallWrapper<object, { id: string }, string, CacheEntry, {}>({
    maxEntries: 5,
    resolveRequest: async () => ({
      kind: "continue" as const,
      providerConfig: buildProvider(),
      context: {}
    }),
    buildCacheKey: () => "cache-key",
    loadCache: async () => ({}),
    saveCache: async () => {
      saveCacheCalls += 1;
    },
    readCachedValue: () => undefined,
    generate: async () => "",
    buildCacheEntry: () => null
  });

  const result = await wrapper({}, { id: "request-1" });

  assert.equal(result, "");
  assert.equal(saveCacheCalls, 0);
});
