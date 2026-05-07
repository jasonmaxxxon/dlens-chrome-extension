import assert from "node:assert/strict";
import test from "node:test";

import { generateProductProfileSuggestion } from "../src/compare/product-profile-init.ts";

test("Product Profile Init retries transient OpenAI failures and uses strict schema", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  const requestBodies: any[] = [];
  let attempts = 0;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    attempts += 1;
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")));
    if (attempts === 1) {
      return new Response("rate limited", { status: 429 });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        name: "DLens",
        category: "Chrome extension",
        audience: "product builders"
      }) } }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    queueMicrotask(callback);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;

  try {
    const profile = await generateProductProfileSuggestion("openai", "test-key", "DLens helps builders read Threads.");
    assert.equal(profile.name, "DLens");
    assert.equal(attempts, 2);

    const openAiBody = requestBodies.at(-1);
    assert.equal(openAiBody.response_format.type, "json_schema");
    assert.equal(openAiBody.response_format.json_schema.strict, true);
    assert.deepEqual(openAiBody.response_format.json_schema.schema.required, ["name", "category", "audience"]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
