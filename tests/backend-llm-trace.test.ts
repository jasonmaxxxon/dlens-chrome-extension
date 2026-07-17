import assert from "node:assert/strict";
import test from "node:test";

import { fetchWorkerStatus } from "../src/ingest/client.ts";
import { fetchWithRetry, generateTopicAuditEnvelope } from "../src/compare/provider.ts";
import { readPipelineTrace } from "../src/state/pipeline-trace.ts";

function enableProcessTrace() {
  (globalThis as any).__DLENS_QA_TRACE_ENABLED__ = true;
  (globalThis as any).__DLENS_QA_TRACE__ = [];
  (globalThis as any).__DLENS_QA_TRACE_SEQ__ = 0;
}

function disableProcessTrace() {
  delete (globalThis as any).__DLENS_QA_TRACE_ENABLED__;
  delete (globalThis as any).__DLENS_QA_TRACE__;
  delete (globalThis as any).__DLENS_QA_TRACE_SEQ__;
}

test("ingest client emits backend.request trace events around backend fetches", async () => {
  const originalFetch = globalThis.fetch;
  const originalDebug = console.debug;
  enableProcessTrace();
  console.debug = () => undefined;
  try {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ status: "idle" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    const status = await fetchWorkerStatus("http://127.0.0.1:8000");

    assert.equal(status.status, "idle");
    assert.deepEqual(calls, ["http://127.0.0.1:8000/worker/status"]);
    const trace = readPipelineTrace();
    assert.equal(trace.length, 2);
    assert.deepEqual(trace.map((entry) => entry.phase), ["backend.request", "backend.request"]);
    assert.deepEqual(trace.map((entry) => entry.result), ["pending", "ok"]);
    assert.equal(trace[0]?.step, "backend.worker-status.request");
    assert.equal(trace[1]?.step, "backend.worker-status.response");
    assert.equal(trace[0]?.requestId, trace[1]?.requestId);
    assert.deepEqual(trace[1]?.detail, {
      method: "GET",
      path: "/worker/status",
      status: 200,
      ok: true
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.debug = originalDebug;
    disableProcessTrace();
  }
});

test("ingest client emits one terminal error trace when a request times out", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalDebug = console.debug;
  enableProcessTrace();
  console.debug = () => undefined;
  globalThis.setTimeout = ((callback: TimerHandler) => {
    queueMicrotask(() => {
      if (typeof callback === "function") callback();
    });
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"status":'));
        const abort = () => controller.error(signal?.reason);
        if (signal?.aborted) {
          abort();
        } else {
          signal?.addEventListener("abort", abort, { once: true });
        }
      }
    });
    return Promise.resolve(new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
  }) as typeof fetch;

  try {
    await assert.rejects(() => fetchWorkerStatus("http://127.0.0.1:8000"), /timed out after 30000 ms/i);

    const trace = readPipelineTrace();
    assert.equal(trace.length, 2);
    assert.deepEqual(trace.map((entry) => entry.result), ["pending", "error"]);
    assert.equal(trace[0]?.requestId, trace[1]?.requestId);
    assert.deepEqual(trace[1]?.detail, {
      method: "GET",
      path: "/worker/status",
      ok: false,
      error: "Ingest backend request timed out after 30000 ms at /worker/status.",
      timeoutMs: 30000,
      timedOut: true
    });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    console.debug = originalDebug;
    disableProcessTrace();
  }
});

test("provider fetchWithRetry emits llm.call trace events with provider provenance", async () => {
  const originalFetch = globalThis.fetch;
  const originalDebug = console.debug;
  enableProcessTrace();
  console.debug = () => undefined;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;

    const response = await fetchWithRetry("Google", "https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent?key=secret", {
      method: "POST",
      body: "{}"
    });

    assert.equal(response.status, 200);
    const trace = readPipelineTrace();
    assert.equal(trace.length, 2);
    assert.deepEqual(trace.map((entry) => entry.phase), ["llm.call", "llm.call"]);
    assert.deepEqual(trace.map((entry) => entry.result), ["pending", "ok"]);
    assert.equal(trace[0]?.step, "direct-llm.Google.request");
    assert.equal(trace[1]?.step, "direct-llm.Google.response");
    assert.equal(trace[0]?.requestId, trace[1]?.requestId);
    assert.deepEqual(trace[1]?.detail, {
      provider: "Google",
      method: "POST",
      host: "generativelanguage.googleapis.com",
      status: 200,
      ok: true,
      attempt: 1,
      maxRetries: 2,
      timeoutMs: 30000
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.debug = originalDebug;
    disableProcessTrace();
  }
});

test("Topic Audit envelope telemetry keeps only scalar metadata", async () => {
  const originalFetch = globalThis.fetch;
  const originalDebug = console.debug;
  const rawOutput = '{"prose":"raw-output-sentinel","evidenceRefs":[],"caveats":[]}';
  enableProcessTrace();
  console.debug = () => undefined;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: rawOutput }] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  try {
    await generateTopicAuditEnvelope("google", "key-sentinel", "final", "prompt-sentinel", 3200);
    const trace = readPipelineTrace();
    const envelopeAttempt = trace.find((entry) => entry.step === "topic-audit.envelope.attempt");
    assert.deepEqual(envelopeAttempt?.detail, {
      provider: "google",
      model: "google:gemini-3.1-flash-lite",
      stageName: "final",
      attempt: 1,
      outputTokenCeiling: 3200,
      finishReason: "STOP",
      outputChars: rawOutput.length,
      result: "success"
    });
    assert.equal(envelopeAttempt?.result, "ok");
    assert.doesNotMatch(JSON.stringify(trace), /key-sentinel|prompt-sentinel|raw-output-sentinel/);
  } finally {
    globalThis.fetch = originalFetch;
    console.debug = originalDebug;
    disableProcessTrace();
  }
});
