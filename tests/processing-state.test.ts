import assert from "node:assert/strict";
import test from "node:test";

import type { AnalysisSnapshot, CaptureSnapshot, JobSnapshot } from "../src/contracts/ingest.ts";
import {
  DEFAULT_POPUP_WIDTH,
  EXPANDED_COMPARE_POPUP_WIDTH,
  hasNearReadyItems,
  getItemReadinessStatus,
  getPollingDelayMs,
  pickCompareSelection,
  resolveInitialPopupMode,
  summarizeSessionProcessing
} from "../src/state/processing-state.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";

function buildItem(status: "saved" | "queued" | "running" | "succeeded" | "failed", analysisStatus?: AnalysisSnapshot["status"] | null) {
  const item = createSessionItem(
    {
      target_type: "post",
      page_url: `https://www.threads.net/@alpha/post/${status}`,
      post_url: `https://www.threads.net/@alpha/post/${status}`,
      author_hint: status,
      text_snippet: status,
      time_token_hint: "1h",
      dom_anchor: `card-${status}`,
      engagement: { likes: 1, comments: 1, reposts: 0, forwards: 0, views: 1 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-28T08:00:00.000Z"
    },
    "2026-03-28T08:00:00.000Z"
  );
  item.status = status;
  item.queuedAt = "2026-03-28T08:01:00.000Z";
  item.lastStatusAt = "2026-03-28T08:02:00.000Z";
  item.latestJob = {
    id: `job-${status}`,
    capture_id: `cap-${status}`,
    job_type: "threads_post_comments_crawl",
    status: status === "queued" ? "pending" : status === "running" ? "running" : "succeeded",
    priority: 1,
    attempt_count: 1,
    max_attempts: 3,
    scheduled_at: "2026-03-28T08:01:00.000Z",
    claimed_at: "2026-03-28T08:01:10.000Z",
    started_at: "2026-03-28T08:01:15.000Z",
    finished_at: null,
    lease_expires_at: null,
    worker_token: "worker-1",
    last_error_kind: null,
    last_error: null,
    last_error_at: null,
    created_at: "2026-03-28T08:01:00.000Z",
    updated_at: "2026-03-28T08:02:00.000Z"
  } satisfies JobSnapshot;
  item.latestCapture = {
    id: `cap-${status}`,
    source_type: "threads",
    capture_type: "post",
    source_page_url: `https://www.threads.net/@alpha/post/${status}`,
    source_post_url: `https://www.threads.net/@alpha/post/${status}`,
    canonical_target_url: `https://www.threads.net/@alpha/post/${status}`,
    author_hint: status,
    text_snippet: status,
    time_token_hint: "1h",
    dom_anchor: `card-${status}`,
    engagement: {},
    client_context: {},
    raw_payload: {},
    ingestion_status: status === "failed" ? "failed" : status === "saved" ? "queued" : "succeeded",
    captured_at: "2026-03-28T08:00:00.000Z",
    created_at: "2026-03-28T08:01:00.000Z",
    updated_at: "2026-03-28T08:02:00.000Z",
    job: null,
    result: null,
    analysis:
      analysisStatus == null
        ? null
        : ({
            id: `analysis-${status}`,
            capture_id: `cap-${status}`,
            status: analysisStatus,
            stage: "final",
            analysis_version: "v1",
            source_comment_count: 10,
            clusters: [],
            evidence: [],
            metrics: {},
            generated_at: null,
            last_error: null,
            created_at: "2026-03-28T08:02:00.000Z",
            updated_at: "2026-03-28T08:02:00.000Z"
          } satisfies AnalysisSnapshot)
  } satisfies CaptureSnapshot;
  return item;
}

test("summarizeSessionProcessing counts ready, crawling, analyzing, and pending items", () => {
  const session = createSessionRecord("Signals", "2026-03-28T08:00:00.000Z");
  const saved = buildItem("saved");
  const queued = buildItem("queued");
  const running = buildItem("running");
  const analyzing = buildItem("succeeded", "running");
  const ready = buildItem("succeeded", "succeeded");
  session.items.push(saved, queued, running, analyzing, ready);

  const summary = summarizeSessionProcessing(session);

  assert.deepEqual(summary, {
    total: 6,
    ready: 1,
    crawling: 2,
    analyzing: 1,
    pending: 2,
    failed: 1,
    hasReadyPair: false,
    hasInflight: true
  });
});

test("getItemReadinessStatus distinguishes ready from analyzing", () => {
  assert.equal(getItemReadinessStatus(buildItem("succeeded", "succeeded")), "ready");
  assert.equal(getItemReadinessStatus(buildItem("succeeded", "running")), "analyzing");
  assert.equal(getItemReadinessStatus(buildItem("queued")), "crawling");
  assert.equal(getItemReadinessStatus(buildItem("saved")), "saved");
});

test("resolveInitialPopupMode prefers compare, then library, then collect", () => {
  const compareSession = createSessionRecord("Compare", "2026-03-28T08:00:00.000Z");
  compareSession.items.push(buildItem("succeeded", "succeeded"), buildItem("succeeded", "succeeded"));
  assert.equal(resolveInitialPopupMode(summarizeSessionProcessing(compareSession)), "compare");

  const librarySession = createSessionRecord("Library", "2026-03-28T08:00:00.000Z");
  librarySession.items.push(buildItem("queued"), buildItem("succeeded", "running"));
  assert.equal(resolveInitialPopupMode(summarizeSessionProcessing(librarySession)), "library");

  const collectSession = createSessionRecord("Collect", "2026-03-28T08:00:00.000Z");
  collectSession.items.push(buildItem("saved"), buildItem("failed"));
  assert.equal(resolveInitialPopupMode(summarizeSessionProcessing(collectSession)), "collect");
});

test("hasNearReadyItems only treats analyzing as near-ready", () => {
  const analyzingSession = createSessionRecord("Signals", "2026-03-28T08:00:00.000Z");
  analyzingSession.items.push(buildItem("succeeded", "running"));
  assert.equal(hasNearReadyItems(summarizeSessionProcessing(analyzingSession)), true);

  const crawlingSession = createSessionRecord("Signals", "2026-03-28T08:00:00.000Z");
  crawlingSession.items.push(buildItem("queued"));
  assert.equal(hasNearReadyItems(summarizeSessionProcessing(crawlingSession)), false);
});

test("pickCompareSelection auto-fills the first legal pair and repairs invalid selections", () => {
  const session = createSessionRecord("Signals", "2026-03-28T08:00:00.000Z");
  const itemA = buildItem("succeeded", "succeeded");
  const itemB = buildItem("succeeded", "succeeded");
  const itemC = buildItem("succeeded", "succeeded");
  session.items.push(itemA, itemB, itemC);

  assert.deepEqual(pickCompareSelection(session.items, "", ""), {
    selectedA: itemA.id,
    selectedB: itemB.id
  });
  assert.deepEqual(pickCompareSelection(session.items, itemA.id, itemA.id), {
    selectedA: itemA.id,
    selectedB: itemB.id
  });
  assert.deepEqual(pickCompareSelection(session.items, itemC.id, "missing"), {
    selectedA: itemC.id,
    selectedB: itemA.id
  });
});

test("getPollingDelayMs follows the shared coordinator rules and backoff", () => {
  assert.equal(getPollingDelayMs({ workerStatus: "draining", hasInflight: true, failureCount: 0 }), 4000);
  assert.equal(getPollingDelayMs({ workerStatus: "draining", hasInflight: true, failureCount: 1 }), 8000);
  assert.equal(getPollingDelayMs({ workerStatus: "draining", hasInflight: true, failureCount: 3 }), 15000);
  assert.equal(getPollingDelayMs({ workerStatus: "idle", hasInflight: true, failureCount: 0 }), 8000);
  assert.equal(getPollingDelayMs({ workerStatus: "idle", hasInflight: false, failureCount: 0 }), null);
});

test("popup width constants keep compare expanded while other pages stay compact", () => {
  assert.equal(DEFAULT_POPUP_WIDTH, 348);
  assert.equal(EXPANDED_COMPARE_POPUP_WIDTH, 504);
});
