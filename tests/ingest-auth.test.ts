import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchBackendHealth,
  fetchCapture,
  fetchJob,
  fetchThreadsAdvancedMetrics,
  fetchWorkerStatus,
  submitCaptureTarget,
  triggerWorkerDrain
} from "../src/ingest/client.ts";
import { classifyIngestBaseUrl } from "../src/ingest/host-permission.ts";
import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";

const TOKEN = "test-token-not-real";
const REMOTE = { baseUrl: "http://100.115.102.41:8000/", apiToken: ` ${TOKEN} ` };

function makeDescriptor(): TargetDescriptor {
  return {
    target_type: "post",
    page_url: "https://www.threads.net/@alpha/post/abc",
    post_url: "https://www.threads.net/@alpha/post/abc",
    author_hint: "alpha",
    text_snippet: "alpha post",
    time_token_hint: "2h",
    dom_anchor: "article:nth-of-type(1)",
    engagement: { likes: 1, comments: 1, reposts: 0, forwards: 0, views: 1 },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
    captured_at: "2026-03-25T10:00:00.000Z"
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("classifyIngestBaseUrl keeps loopback as the empty default and accepts a remote origin", () => {
  assert.deepEqual(classifyIngestBaseUrl(""), {
    ok: true,
    kind: "loopback",
    normalized: "http://127.0.0.1:8000"
  });
  assert.deepEqual(classifyIngestBaseUrl("http://100.115.102.41:8000/"), {
    ok: true,
    kind: "remote",
    normalized: "http://100.115.102.41:8000"
  });
  assert.equal(classifyIngestBaseUrl("javascript:alert(1)").ok, false);
  assert.equal(classifyIngestBaseUrl("http://user:secret@100.115.102.41:8000").ok, false);
  assert.equal(classifyIngestBaseUrl("http://127.0.0.1:8000/capture-target").ok, false);
});

test("every ingest call uses the configured origin and bearer token, and omits the header when unset", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    if (url.endsWith("/capture-target")) {
      return jsonResponse({
        capture_id: "cap-1",
        job_id: "job-1",
        status: "queued",
        job_type: "threads_post_comments_crawl",
        canonical_target_url: "https://www.threads.net/@alpha/post/abc"
      }, 202);
    }
    if (url.endsWith("/threads/advanced-metrics")) {
      return jsonResponse({ post_url: "https://www.threads.net/@alpha/post/abc", metrics: {}, fetched_at: "2026-10-29T00:00:00Z" });
    }
    if (url.includes("/captures/")) {
      return jsonResponse({ id: "cap-1", canonical_target_url: "https://www.threads.net/@alpha/post/abc" });
    }
    return jsonResponse({ status: "idle", uptime_seconds: 1, process_id: 1 });
  }) as typeof fetch;

  try {
    await submitCaptureTarget(REMOTE, makeDescriptor(), "Signals", []);
    await fetchJob(REMOTE, "job-1");
    await fetchCapture(REMOTE, "cap-1");
    await triggerWorkerDrain(REMOTE);
    await fetchWorkerStatus(REMOTE);
    await fetchBackendHealth(REMOTE);
    await fetchThreadsAdvancedMetrics(REMOTE, "https://www.threads.net/@alpha/post/abc");

    assert.deepEqual(calls.map((call) => call.url), [
      "http://100.115.102.41:8000/capture-target",
      "http://100.115.102.41:8000/jobs/job-1",
      "http://100.115.102.41:8000/captures/cap-1",
      "http://100.115.102.41:8000/worker/drain",
      "http://100.115.102.41:8000/worker/status",
      "http://100.115.102.41:8000/health",
      "http://100.115.102.41:8000/threads/advanced-metrics"
    ]);
    assert.ok(calls.every((call) => call.authorization === `Bearer ${TOKEN}`));
    assert.ok(calls.every((call) => !call.url.includes(TOKEN)));

    calls.length = 0;
    await fetchWorkerStatus("http://127.0.0.1:8000");
    assert.equal(calls[0]?.url, "http://127.0.0.1:8000/worker/status");
    assert.equal(calls[0]?.authorization, null);

    calls.length = 0;
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    await assert.rejects(
      () => fetchWorkerStatus(REMOTE),
      (error: Error) => {
        assert.match(error.message, /100\.115\.102\.41:8000/);
        assert.equal(error.message.includes(TOKEN), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
