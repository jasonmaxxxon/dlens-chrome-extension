import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { providerTestables } from "../src/compare/provider.ts";
import {
  generateCompareOneLiner,
  generateProductSignalAnalysis,
  generateTopicAuditEnvelope
} from "../src/compare/provider.ts";
import { TopicAuditEnvelopeError } from "../src/compare/topic-audit-envelope-contract.ts";

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

test("ProductSignalAnalyzer v21 provider payloads share one Product Reading schema", () => {
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

  const openAiSchema = openAiBody.response_format.json_schema.schema;
  const googleSchema = googleBody.generationConfig.responseJsonSchema;
  const claudeSchema = claudeBody.tools[0].input_schema;
  assert.deepEqual(googleSchema, openAiSchema);
  assert.deepEqual(claudeSchema, openAiSchema);
  assert.equal(openAiSchema.additionalProperties, false);
  assert.ok(openAiSchema.required.includes("product_reading"));
  assert.equal(openAiSchema.required.includes("application_suggestions"), false);
  assert.equal(openAiSchema.required.includes("watch_guidance"), false);
  assert.equal(openAiSchema.properties.application_suggestions, undefined);
  assert.equal(openAiSchema.properties.watch_guidance, undefined);
  assert.deepEqual(openAiSchema.properties.product_reading, {
    type: ["object", "null"],
    additionalProperties: false,
    required: ["headline", "body", "support_refs"],
    properties: {
      headline: { type: "string" },
      body: { type: "string" },
      support_refs: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: { type: "string" }
      }
    }
  });
  assert.equal(googleBody.generationConfig.maxOutputTokens, 2800);
  assert.equal(claudeBody.max_tokens, 2800);
});

test("ProductSignalAnalyzer repairs an ungrounded reading once before a coherent insufficient-data fallback", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  const ungroundedPayload = {
    signal_type: "learning",
    signal_subtype: "workflow_validation",
    content_type: "content",
    content_summary: "討論把產品假設收斂成小型驗證。",
    relevance: 5,
    relevant_to: ["coreWorkflows"],
    reference_type: "workflow_pattern",
    reference_label: "先驗證再擴張",
    reference_takeaway: "先用一條訊號驗證流程。",
    why_relevant: "方向與產品工作流相關。",
    usefulness: "useful",
    testability: "reversible_test",
    evidence_state: "text_sufficient",
    conflict_state: "none",
    reason: "表面上有可逆的小型測試。",
    experiment_hint: "先測一條訊號。",
    agent_task_spec: null,
    evidence_refs: ["root"],
    evidence_notes: [{
      ref: "root",
      quote_summary: "主文描述一個驗證流程。",
      why_it_matters: "可能支持產品流程。",
      grounding: "model_inferred",
      reusable_pattern: "先驗證再擴張",
      why_it_works: "仍缺直接文字支持。"
    }],
    product_reading: {
      headline: "先驗證單條流程",
      body: "主文可能支持小型驗證，但目前沒有文字 grounded evidence。",
      support_refs: ["root"]
    }
  };

  globalThis.fetch = (async () => {
    attempts += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(ungroundedPayload) } }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const analysis = await generateProductSignalAnalysis("openai", "test-key", {
      signalId: "signal-ungrounded",
      source: "threads",
      rootText: "主文描述一個驗證流程。",
      assembledContent: "主文描述一個驗證流程。",
      discussionReplies: [],
      productContext: {
        productPromise: "把 Threads 訊號變成產品判斷。",
        targetAudience: "indie builders",
        agentRoles: ["collector", "judge"],
        coreWorkflows: ["save post", "classify signal"],
        currentCapabilities: ["topic mode"],
        explicitConstraints: ["local-first"],
        nonGoals: ["multi-tenant SaaS"],
        preferredTechDirection: "Chrome extension first",
        evaluationCriteria: ["reduces manual reading"],
        unknowns: ["mobile reader"],
        compiledAt: "2026-04-27T00:00:00.000Z",
        sourceFileIds: ["file_readme"],
        promptVersion: "v1"
      },
      productContextHash: "context-hash"
    });

    assert.equal(attempts, 2);
    assert.equal(analysis.verdict, "insufficient_data");
    assert.equal(analysis.judgmentAxes.evidenceState, "insufficient");
    assert.ok(analysis.warnings.includes("reading_evidence_ungrounded"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ProductSignalAnalyzer downgrades a repeatedly missing reading support ref after one repair", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  const mismatchedPayload = {
    signal_type: "learning",
    signal_subtype: "workflow_validation",
    content_type: "content",
    content_summary: "討論把產品假設收斂成小型驗證。",
    relevance: 5,
    relevant_to: ["coreWorkflows"],
    reference_type: "workflow_pattern",
    reference_label: "先驗證再擴張",
    reference_takeaway: "先用一條訊號驗證流程。",
    why_relevant: "方向與產品工作流相關。",
    usefulness: "useful",
    testability: "reversible_test",
    evidence_state: "text_sufficient",
    conflict_state: "none",
    reason: "表面上有可逆的小型測試。",
    experiment_hint: "先測一條訊號。",
    agent_task_spec: null,
    evidence_refs: ["e1"],
    evidence_notes: [{
      ref: "e1",
      quote_summary: "第一則留言描述一個驗證流程。",
      why_it_matters: "可能支持產品流程。",
      grounding: "text_grounded",
      reusable_pattern: "先驗證再擴張",
      why_it_works: "留言直接描述驗證順序。"
    }],
    product_reading: {
      headline: "先驗證單條流程",
      body: "判讀錯誤地把第二則留言列為支持來源。",
      support_refs: ["e2"]
    }
  };

  globalThis.fetch = (async () => {
    attempts += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(mismatchedPayload) } }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const analysis = await generateProductSignalAnalysis("openai", "test-key", {
      signalId: "signal-missing-support",
      source: "threads",
      rootText: "主文描述一個驗證流程。",
      assembledContent: "主文描述一個驗證流程。",
      discussionReplies: [
        {
          id: "c1",
          author: "reader",
          text: "第一則留言描述一個驗證流程。",
          likeCount: 1,
          role: "audience",
          isOrphan: false,
          parentId: null,
          resolvedParentId: null
        },
        {
          id: "c2",
          author: "reader-2",
          text: "第二則留言未被建立 evidence note。",
          likeCount: 0,
          role: "audience",
          isOrphan: false,
          parentId: null,
          resolvedParentId: null
        }
      ],
      productContext: {
        productPromise: "把 Threads 訊號變成產品判斷。",
        targetAudience: "indie builders",
        agentRoles: ["collector", "judge"],
        coreWorkflows: ["save post", "classify signal"],
        currentCapabilities: ["topic mode"],
        explicitConstraints: ["local-first"],
        nonGoals: ["multi-tenant SaaS"],
        preferredTechDirection: "Chrome extension first",
        evaluationCriteria: ["reduces manual reading"],
        unknowns: ["mobile reader"],
        compiledAt: "2026-04-27T00:00:00.000Z",
        sourceFileIds: ["file_readme"],
        promptVersion: "v1"
      },
      productContextHash: "context-hash"
    });

    assert.equal(attempts, 2);
    assert.equal(analysis.verdict, "insufficient_data");
    assert.equal(analysis.judgmentAxes.evidenceState, "insufficient");
    assert.ok(analysis.warnings?.includes("reading_evidence_ungrounded"));
    assert.equal(analysis.productReading, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("Google requests keep the key in x-goog-api-key and out of the URL", async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ text: '{"prose":"ok","evidenceRefs":[],"caveats":[]}' }] }
      }]
    }), { status: 200 });
  }) as typeof fetch;

  try {
    await generateTopicAuditEnvelope("google", "sentinel-secret", "final", "prompt", 3200);
    assert.equal(calls[0]?.headers.get("x-goog-api-key"), "sentinel-secret");
    assert.doesNotMatch(calls[0]?.url ?? "", /sentinel-secret|[?&]key=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google Topic Audit errors do not echo the API key", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("sentinel-secret", { status: 400 })) as typeof fetch;

  try {
    await assert.rejects(
      () => generateTopicAuditEnvelope("google", "sentinel-secret", "final", "prompt", 3200),
      (error: unknown) => {
        assert.doesNotMatch((error as Error).message, /sentinel-secret/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider source keeps every Google generateContent key out of query URLs", async () => {
  const source = await readFile(new URL("../src/compare/provider.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /generateContent\?key=/);
  assert.doesNotMatch(source, /key=\$\{apiKey\}/);
});

test("Topic Audit uses native schemas only for Google and OpenAI", async () => {
  const bodies: Array<{ provider: string; body: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const provider = url.includes("generativelanguage.googleapis.com")
      ? "google"
      : url.includes("api.openai.com")
        ? "openai"
        : "claude";
    bodies.push({ provider, body: JSON.parse(String(init?.body)) });
    if (provider === "google") {
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"prose":"ok","evidenceRefs":[],"caveats":[]}' }] } }] }), { status: 200 });
    }
    if (provider === "openai") {
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"prose":"ok","evidenceRefs":[],"caveats":[]}' } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: '{"prose":"ok","evidenceRefs":[],"caveats":[]}' }] }), { status: 200 });
  }) as typeof fetch;

  try {
    for (const provider of ["google", "openai", "claude"] as const) {
      await generateTopicAuditEnvelope(provider, "test-key", "lexicon", "prompt", 2200);
    }
    const google = bodies.find(({ provider }) => provider === "google")?.body;
    const openai = bodies.find(({ provider }) => provider === "openai")?.body;
    const claude = bodies.find(({ provider }) => provider === "claude")?.body;
    assert.equal(google.generationConfig.responseMimeType, "application/json");
    // gemini-3.1-flash-lite runs away under responseJsonSchema on the audit
    // envelope (2026-07-18 truncated-final regression) — Google must stay
    // schema-free; shape is guarded by parse + repair retry.
    assert.equal(google.generationConfig.responseJsonSchema, undefined);
    assert.equal(openai.response_format.type, "json_schema");
    assert.equal(openai.response_format.json_schema.strict, false);
    assert.equal(openai.response_format.json_schema.schema.type, "object");
    assert.equal(claude.tools, undefined);
    assert.equal(claude.response_format, undefined);
    assert.equal(claude.generationConfig, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid Topic Audit envelope makes one semantic attempt", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"prose":"complete","evidenceRefs":[],"caveats":[]}' }] } }]
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await generateTopicAuditEnvelope("google", "secret", "final", "semantic prompt", 3200);
    assert.equal(result.prose, "complete");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("truncated Topic Audit output retries one stage once with a larger ceiling", async () => {
  const bodies: any[] = [];
  const attempts: number[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    const first = bodies.length === 1;
    return new Response(JSON.stringify({ candidates: [{
      finishReason: first ? "MAX_TOKENS" : "STOP",
      content: { parts: [{ text: first ? '{"prose":"cut' : '{"prose":"complete","evidenceRefs":[],"caveats":[]}' }] }
    }] }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await generateTopicAuditEnvelope("google", "secret", "final", "semantic prompt", 3200, {
      onAttempt: (attempt) => attempts.push(attempt)
    });
    assert.equal(result.prose, "complete");
    assert.deepEqual(attempts, [1, 2]);
    assert.equal(bodies[0].generationConfig.maxOutputTokens, 3200);
    assert.equal(bodies[1].generationConfig.maxOutputTokens, 4800);
    assert.match(bodies[1].contents[0].parts[0].text, /semantic prompt/);
    assert.match(bodies[1].contents[0].parts[0].text, /上一個回應不符合 JSON envelope contract/);
    assert.doesNotMatch(bodies[1].contents[0].parts[0].text, /\{"prose":"cut/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("two invalid Topic Audit envelopes stop after exactly two semantic attempts", async () => {
  const originalFetch = globalThis.fetch;
  const attempts: number[] = [];
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"evidenceRefs":[],"caveats":[]}' }] } }]
    }), { status: 200 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => generateTopicAuditEnvelope("google", "secret", "narrative", "semantic prompt", 2200, {
        onAttempt: (attempt) => attempts.push(attempt)
      }),
      (error: unknown) => {
        assert.ok(error instanceof TopicAuditEnvelopeError);
        assert.equal((error as Error).name, "TopicAuditEnvelopeError");
        const envelopeError = error as Record<string, unknown>;
        assert.equal(envelopeError.stage, "narrative");
        assert.equal(envelopeError.kind, "schema_mismatch");
        assert.equal(envelopeError.attempt, 2);
        assert.equal(envelopeError.finishReason, "STOP");
        assert.equal(envelopeError.outputChars, '{"evidenceRefs":[],"caveats":[]}'.length);
        return true;
      }
    );
    assert.equal(calls, 2);
    assert.deepEqual(attempts, [1, 2]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
