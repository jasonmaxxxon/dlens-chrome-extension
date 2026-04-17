import assert from "node:assert/strict";
import test from "node:test";

import { buildCaptureTargetRequest, fetchWorkerStatus, submitCaptureTarget, triggerWorkerDrain } from "../src/ingest/client.ts";
import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";

function makeDescriptor(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    target_type: "post",
    page_url: "https://www.threads.net/@alpha/post/abc",
    post_url: "https://www.threads.net/@alpha/post/abc",
    author_hint: "alpha",
    text_snippet: "alpha post",
    time_token_hint: "2h",
    dom_anchor: "article:nth-of-type(1)",
    engagement: {
      likes: 10,
      comments: 5,
      reposts: 1,
      forwards: 0,
      views: 100
    },
    engagement_present: {
      likes: true,
      comments: true,
      reposts: true,
      forwards: true,
      views: true
    },
    captured_at: "2026-03-25T10:00:00.000Z",
    ...overrides
  };
}

test("buildCaptureTargetRequest forwards the active folder name via client_context", () => {
  const request = buildCaptureTargetRequest(makeDescriptor(), "Signals");

  assert.equal(request.client_context.folder_name, "Signals");
});

test("submitCaptureTarget posts the active folder name in client_context", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(
      JSON.stringify({
        capture_id: "cap-1",
        job_id: "job-1",
        status: "queued",
        job_type: "threads_post_comments_crawl",
        canonical_target_url: "https://www.threads.net/@alpha/post/abc"
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" }
      }
    );
  }) as typeof fetch;

  try {
    await submitCaptureTarget("http://127.0.0.1:8000", makeDescriptor(), "Signals");
    assert.equal(calls.length, 1);
    assert.match(String(calls[0]?.init?.body), /"folder_name":"Signals"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

test("triggerWorkerDrain surfaces a clear backend-unavailable error when fetch throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => triggerWorkerDrain("http://127.0.0.1:8000"),
      /Optional ingest backend unavailable/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWorkerStatus surfaces a clear backend-unavailable error when fetch throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchWorkerStatus("http://127.0.0.1:8000"),
      /Optional ingest backend unavailable/i
    );
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
