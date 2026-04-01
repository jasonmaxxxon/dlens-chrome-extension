import assert from "node:assert/strict";
import test from "node:test";

import { fetchWorkerStatus, triggerWorkerDrain } from "../src/ingest/client.ts";

test("triggerWorkerDrain posts to /worker/drain", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ status: "started" }), {
      status: 202,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const response = await triggerWorkerDrain("http://127.0.0.1:8000");
    assert.equal(response.status, "started");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, "http://127.0.0.1:8000/worker/drain");
    assert.equal(calls[0]?.init?.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWorkerStatus reads /worker/status", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ status: "draining" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const response = await fetchWorkerStatus("http://127.0.0.1:8000");
    assert.equal(response.status, "draining");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, "http://127.0.0.1:8000/worker/status");
    assert.equal(calls[0]?.init?.method, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
