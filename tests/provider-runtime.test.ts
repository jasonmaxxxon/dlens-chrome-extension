import assert from "node:assert/strict";
import test from "node:test";

import { providerTestables } from "../src/compare/provider.ts";
import { generateCompareOneLiner } from "../src/compare/provider.ts";

test("fetchWithRetry retries transient fetch failures before succeeding", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  const delays: number[] = [];
  let attempts = 0;

  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new TypeError("fetch failed");
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number) => {
    delays.push(delay ?? 0);
    queueMicrotask(callback);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;

  try {
    const response = await providerTestables.fetchWithRetry("OpenAI", "https://example.com/test", {
      method: "POST"
    });
    assert.equal(response.status, 200);
    assert.equal(attempts, 3);
    assert.deepEqual(
      delays.filter((delay) => delay !== 30000),
      [250, 500]
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("fetchWithRetry aborts stalled requests and surfaces a timeout error", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  let attempts = 0;
  const delays: number[] = [];

  globalThis.fetch = (((_input: string | URL | Request, init?: RequestInit) => {
    attempts += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  }) as typeof fetch);

  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number) => {
    delays.push(delay ?? 0);
    queueMicrotask(callback);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;

  try {
    await assert.rejects(
      () => providerTestables.fetchWithRetry("Google", "https://example.com/timeout", { method: "POST" }),
      /Google request timed out/i
    );
    assert.equal(attempts, 3);
    assert.ok(delays.includes(30000));
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("provider payloads use structured schema for ProductSignalAnalyzer", () => {
  const openAiBody = providerTestables.buildProductSignalAnalysisBody("openai", "system", "prompt");
  assert.equal(openAiBody.response_format.type, "json_schema");
  assert.equal(openAiBody.response_format.json_schema.strict, true);
  assert.equal(openAiBody.response_format.json_schema.name, "product_signal_analysis");

  const googleBody = providerTestables.buildProductSignalAnalysisBody("google", "system", "prompt");
  assert.equal(googleBody.generationConfig.responseMimeType, "application/json");
  assert.equal(googleBody.generationConfig.responseJsonSchema.type, "object");

  const claudeBody = providerTestables.buildProductSignalAnalysisBody("claude", "system", "prompt");
  assert.equal(claudeBody.tool_choice.name, "record_product_signal_analysis");
  assert.equal(claudeBody.tools[0].input_schema.type, "object");
});

test("OpenAI compare one-liner caps completion tokens", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({
      choices: [{ message: { content: "A 比 B 更集中在行動線索。" } }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    await generateCompareOneLiner("openai", "test-key", {
      left: {
        captureId: "a",
        analysisUpdatedAt: null,
        author: "ann",
        text: "Post A",
        engagement: { likes: 1, replies: 2 },
        clusters: [],
        evidence: []
      },
      right: {
        captureId: "b",
        analysisUpdatedAt: null,
        author: "ben",
        text: "Post B",
        engagement: { likes: 3, replies: 4 },
        clusters: [],
        evidence: []
      }
    });
    assert.equal(requestBody.max_tokens, 120);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
