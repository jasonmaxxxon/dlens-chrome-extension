import assert from "node:assert/strict";
import test from "node:test";

import { fetchWorkerStatus } from "../src/ingest/client.ts";
import { fetchWithRetry } from "../src/compare/provider.ts";
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
