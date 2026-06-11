import assert from "node:assert/strict";
import test from "node:test";

import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import type { Signal } from "../src/state/types.ts";
import { buildProductSignalReadinessById } from "../src/ui/product-signal-readiness.ts";

const descriptor = {
  target_type: "post" as const,
  page_url: "https://www.threads.net/@alpha",
  post_url: "https://www.threads.net/@alpha/post/abc",
  author_hint: "alpha",
  text_snippet: "alpha post",
  time_token_hint: "1h",
  dom_anchor: "card-1",
  engagement: { likes: 1 },
  engagement_present: { likes: true },
  captured_at: "2026-06-10T00:00:00.000Z"
};

function makeSignal(id: string, itemId: string): Signal {
  return {
    id,
    sessionId: "session-1",
    itemId,
    source: "threads",
    inboxStatus: "unprocessed",
    capturedAt: "2026-06-10T00:00:00.000Z"
  } as Signal;
}

test("buildProductSignalReadinessById carries the backend job error for crawling and failed items", () => {
  const folder = createSessionRecord("Product workspace", "2026-06-10T00:00:00.000Z", "product");
  const crawling = {
    ...createSessionItem(descriptor),
    id: "item-crawling",
    status: "queued" as const,
    lastError: "BrowserType.launch: Executable doesn't exist",
    lastErrorKind: "unexpected_runtime_error"
  };
  const failed = {
    ...createSessionItem(descriptor),
    id: "item-failed",
    status: "failed" as const,
    lastError: "crawl exhausted retries",
    lastErrorKind: "unexpected_runtime_error"
  };
  folder.items = [crawling, failed];

  const readiness = buildProductSignalReadinessById(folder, [
    makeSignal("sig-crawling", "item-crawling"),
    makeSignal("sig-failed", "item-failed")
  ]);

  assert.equal(readiness["sig-crawling"]?.status, "crawling");
  assert.equal(readiness["sig-crawling"]?.lastError, "BrowserType.launch: Executable doesn't exist");
  assert.equal(readiness["sig-failed"]?.status, "failed");
  assert.equal(readiness["sig-failed"]?.lastError, "crawl exhausted retries");
});
