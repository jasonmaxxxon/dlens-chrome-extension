import assert from "node:assert/strict";
import test from "node:test";

import type { AnalysisSnapshot, CaptureSnapshot, JobSnapshot } from "../src/contracts/ingest.ts";
import {
  advancePopupWorkspaceState,
  DEFAULT_POPUP_WIDTH,
  EXPANDED_COMPARE_POPUP_WIDTH,
  hasNearReadyItems,
  getItemReadinessStatus,
  getPollingDelayMs,
  getProcessingStripUiState,
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
  const failedAnalysis = buildItem("succeeded", "failed");
  const ready = buildItem("succeeded", "succeeded");
  session.items.push(saved, queued, running, analyzing, failedAnalysis, ready);

  const summary = summarizeSessionProcessing(session);

  assert.deepEqual(summary, {
    total: 6,
    ready: 1,
    crawling: 2,
    analyzing: 1,
    pending: 1,
    failed: 1,
    hasReadyPair: false,
    hasInflight: true
  });
});

test("getItemReadinessStatus distinguishes ready from analyzing", () => {
  assert.equal(getItemReadinessStatus(buildItem("succeeded", "succeeded")), "ready");
  assert.equal(getItemReadinessStatus(buildItem("succeeded", "running")), "analyzing");
  assert.equal(getItemReadinessStatus(buildItem("succeeded", "failed")), "failed");
  assert.equal(getItemReadinessStatus(buildItem("queued")), "crawling");
  assert.equal(getItemReadinessStatus(buildItem("saved")), "saved");
});

test("resolveInitialPopupMode prefers compare, then library", () => {
  const compareSession = createSessionRecord("Compare", "2026-03-28T08:00:00.000Z");
  compareSession.items.push(buildItem("succeeded", "succeeded"), buildItem("succeeded", "succeeded"));
  assert.equal(resolveInitialPopupMode(summarizeSessionProcessing(compareSession)), "compare");

  const librarySession = createSessionRecord("Library", "2026-03-28T08:00:00.000Z");
  librarySession.items.push(buildItem("queued"), buildItem("succeeded", "running"));
  assert.equal(resolveInitialPopupMode(summarizeSessionProcessing(librarySession)), "library");

  const idleSession = createSessionRecord("Idle", "2026-03-28T08:00:00.000Z");
  idleSession.items.push(buildItem("saved"), buildItem("failed"));
  assert.equal(resolveInitialPopupMode(summarizeSessionProcessing(idleSession)), "library");
});

test("expanded compare/result popup width gives the reading page more room than the compact shell", () => {
  assert.equal(DEFAULT_POPUP_WIDTH, 440);
  assert.equal(EXPANDED_COMPARE_POPUP_WIDTH, 560);
});

test("getProcessingStripUiState uses compact compare-forward copy", () => {
  const compareReady = summarizeSessionProcessing([
    buildItem("succeeded", "succeeded"),
    buildItem("succeeded", "succeeded")
  ]);
  const compareState = getProcessingStripUiState("draining", compareReady);
  assert.equal(compareState.phaseLabel, "Ready to compare");
  assert.equal(compareState.progressMode, "ready");
  assert.match(compareState.progressHint, /Compare/);

  const analyzingState = getProcessingStripUiState("idle", {
    total: 2,
    ready: 1,
    crawling: 0,
    analyzing: 1,
    pending: 0,
    failed: 0,
    hasReadyPair: false,
    hasInflight: true
  });
  assert.equal(analyzingState.phaseLabel, "Waiting for analysis");
  assert.equal(analyzingState.progressMode, "analyzing");
  assert.match(analyzingState.progressHint, /Library/i);
  assert.doesNotMatch(analyzingState.progressHint, /clusters|comments|pending/i);

  const idleState = getProcessingStripUiState("idle", {
    total: 1,
    ready: 0,
    crawling: 0,
    analyzing: 0,
    pending: 1,
    failed: 0,
    hasReadyPair: false,
    hasInflight: false
  });
  assert.equal(idleState.phaseLabel, "Waiting to start");
  assert.equal(idleState.progressMode, "queued");
  assert.match(idleState.progressHint, /Library/i);
});

test("getProcessingStripUiState stays compare-forward when a ready pair exists alongside inflight work", () => {
  const compareReadyWithInflight = getProcessingStripUiState("draining", {
    total: 4,
    ready: 2,
    crawling: 1,
    analyzing: 1,
    pending: 0,
    failed: 0,
    hasReadyPair: true,
    hasInflight: true
  });

  assert.equal(compareReadyWithInflight.phaseLabel, "Ready to compare");
  assert.equal(compareReadyWithInflight.progressMode, "ready");
});

test("getProcessingStripUiState keeps the idle state action-forward", () => {
  const idleState = getProcessingStripUiState("idle", {
    total: 0,
    ready: 0,
    crawling: 0,
    analyzing: 0,
    pending: 0,
    failed: 0,
    hasReadyPair: false,
    hasInflight: false
  });

  assert.equal(idleState.phaseLabel, "Go to Collect or Library");
  assert.equal(idleState.progressMode, "idle");
  assert.match(idleState.progressHint, /Collect|Library/);
});

test("hasNearReadyItems only treats analyzing as near-ready", () => {
  const analyzingSession = createSessionRecord("Signals", "2026-03-28T08:00:00.000Z");
  analyzingSession.items.push(buildItem("succeeded", "running"));
  assert.equal(hasNearReadyItems(summarizeSessionProcessing(analyzingSession)), true);

  const crawlingSession = createSessionRecord("Signals", "2026-03-28T08:00:00.000Z");
  crawlingSession.items.push(buildItem("queued"));
  assert.equal(hasNearReadyItems(summarizeSessionProcessing(crawlingSession)), false);
});

test("advancePopupWorkspaceState recomputes smart entry after close and reopen", () => {
  const readySession = createSessionRecord("Ready", "2026-03-28T08:00:00.000Z");
  readySession.items.push(buildItem("succeeded", "succeeded"), buildItem("succeeded", "succeeded"));
  const readySummary = summarizeSessionProcessing(readySession);

  const staleClosedState = {
    currentMode: "library" as const,
    popupOpen: false,
    modeLocked: false
  };

  const reopenedState = advancePopupWorkspaceState(readySummary, staleClosedState, true);
  assert.deepEqual(reopenedState, {
    currentMode: "compare",
    popupOpen: true,
    modeLocked: true
  });

  const activeState = advancePopupWorkspaceState(readySummary, reopenedState, false);
  assert.deepEqual(activeState, {
    currentMode: "compare",
    popupOpen: false,
    modeLocked: false
  });

  const reopenedAgain = advancePopupWorkspaceState(readySummary, activeState, true);
  assert.deepEqual(reopenedAgain, {
    currentMode: "compare",
    popupOpen: true,
    modeLocked: true
  });
});

test("getLibraryItemUiState derives user-facing crawl labels from backend queued/running states", async () => {
  const { getLibraryItemUiState } = await import("../src/state/processing-state.ts");

  const queuedUi = getLibraryItemUiState(buildItem("queued"));
  const failedUi = getLibraryItemUiState(buildItem("failed"));

  assert.equal(queuedUi.statusLabel, "crawling");
  assert.equal(queuedUi.statusTone, "running");
  assert.equal(failedUi.statusLabel, "failed");
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
  assert.equal(DEFAULT_POPUP_WIDTH, 440);
  assert.equal(EXPANDED_COMPARE_POPUP_WIDTH, 560);
});
