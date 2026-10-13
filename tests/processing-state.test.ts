import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AnalysisSnapshot,CaptureSnapshot,JobSnapshot } from "../src/contracts/ingest.ts";
import {
advancePopupWorkspaceState,
getItemReadinessStatus,
getPollingDelayMs,
hasNearReadyItems,
projectBackendReachability,
projectBackendWorkStatus,
resolveInitialPopupMode,
sameBackendWorkUiState,
shouldRefreshProcessingFolder,
summarizeSessionProcessing,
type BackendWorkUiState
} from "../src/state/processing-state.ts";
import { createSessionItem,createSessionRecord } from "../src/state/store-helpers.ts";

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

test("initial sidepanel destination stays collection regardless of processing", () => {
  const compareSession = createSessionRecord("Compare", "2026-03-28T08:00:00.000Z");
  compareSession.items.push(buildItem("succeeded", "succeeded"), buildItem("succeeded", "succeeded"));
  assert.equal(resolveInitialPopupMode(summarizeSessionProcessing(compareSession)), "collection");

  const librarySession = createSessionRecord("Library", "2026-03-28T08:00:00.000Z");
  librarySession.items.push(buildItem("queued"), buildItem("succeeded", "running"));
  assert.equal(resolveInitialPopupMode(summarizeSessionProcessing(librarySession)), "collection");

  const idleSession = createSessionRecord("Idle", "2026-03-28T08:00:00.000Z");
  idleSession.items.push(buildItem("saved"), buildItem("failed"));
  assert.equal(resolveInitialPopupMode(summarizeSessionProcessing(idleSession)), "collection");
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
    currentMode: "collection" as const,
    popupOpen: false,
    modeLocked: false
  };

  const reopenedState = advancePopupWorkspaceState(readySummary, staleClosedState, true);
  assert.deepEqual(reopenedState, {
    currentMode: "collection",
    popupOpen: true,
    modeLocked: true
  });

  const activeState = advancePopupWorkspaceState(readySummary, reopenedState, false);
  assert.deepEqual(activeState, {
    currentMode: "collection",
    popupOpen: false,
    modeLocked: false
  });

  const reopenedAgain = advancePopupWorkspaceState(readySummary, activeState, true);
  assert.deepEqual(reopenedAgain, {
    currentMode: "collection",
    popupOpen: true,
    modeLocked: true
  });
});

test("getPollingDelayMs follows the shared coordinator rules and backoff", () => {
  assert.equal(getPollingDelayMs({ workerStatus: "draining", hasInflight: true, failureCount: 0 }), 4000);
  assert.equal(getPollingDelayMs({ workerStatus: "draining", hasInflight: true, failureCount: 1 }), 8000);
  assert.equal(getPollingDelayMs({ workerStatus: "draining", hasInflight: true, failureCount: 3 }), 15000);
  assert.equal(getPollingDelayMs({ workerStatus: "idle", hasInflight: true, failureCount: 0 }), 8000);
});

test("getPollingDelayMs keeps an idle heartbeat so passive surfaces notice a dead backend", () => {
  // B-03: idle must not stop polling entirely, or readiness/stamp keep
  // showing 已就緒 after the backend dies until the user clicks analyze.
  assert.equal(getPollingDelayMs({ workerStatus: "idle", hasInflight: false, failureCount: 0 }), 12000);
  // Heartbeat stays flat under failures — recovery is noticed within one beat.
  assert.equal(getPollingDelayMs({ workerStatus: "idle", hasInflight: false, failureCount: 3 }), 12000);
});

test("projectBackendReachability suppresses one timeout and escalates by streak", () => {
  assert.equal(projectBackendReachability(0), "reachable");
  assert.equal(projectBackendReachability(1), "reachable");
  assert.equal(projectBackendReachability(2), "slow");
  assert.equal(projectBackendReachability(3), "unreachable");
  assert.equal(projectBackendReachability(8), "unreachable");
});

test("processing coordinator does not restart polling just because workerStatus state changed", () => {
  const source = readFileSync(new URL("../src/ui/useProcessingCoordinator.ts", import.meta.url), "utf8");
  assert.match(source, /lastKnownWorkerStatusRef/);
  assert.match(source, /\[popupOpen,\s*activeFolderId,\s*hasInflight,\s*sendAndSync\]/);
  assert.doesNotMatch(source, /\[popupOpen,\s*activeFolderId,\s*hasInflight,\s*sendAndSync,\s*workerStatus\]/);
});

test("shouldRefreshProcessingFolder keeps refreshing during and just after worker drain", () => {
  assert.equal(shouldRefreshProcessingFolder({
    workerStatus: "draining",
    previousWorkerStatus: "idle",
    hasInflight: false
  }), true);
  assert.equal(shouldRefreshProcessingFolder({
    workerStatus: "idle",
    previousWorkerStatus: "draining",
    hasInflight: false
  }), true);
  assert.equal(shouldRefreshProcessingFolder({
    workerStatus: "idle",
    previousWorkerStatus: "idle",
    hasInflight: false
  }), false);
});

test("projectBackendWorkStatus maps a fully idle backend to idle", () => {
  const state = projectBackendWorkStatus({ status: "idle" });
  assert.deepEqual(state, { kind: "idle" });
});

test("projectBackendWorkStatus maps a busy idle backend with only retry backoff to retry_waiting", () => {
  const state = projectBackendWorkStatus({
    status: "idle",
    retry_scheduled_jobs: 2,
    earliest_retry_at: "2026-06-16T10:30:00.000Z",
    next_due_at: null
  });
  assert.equal(state.kind, "retry_waiting");
  if (state.kind === "retry_waiting") {
    assert.equal(state.count, 2);
    assert.equal(state.earliestRetryAt, "2026-06-16T10:30:00.000Z");
  }
});

test("projectBackendWorkStatus prioritizes expired_running over retry_waiting and analysis_failed", () => {
  const state = projectBackendWorkStatus({
    status: "draining",
    retry_scheduled_jobs: 3,
    expired_running_jobs: 1,
    failed_analyses: 2
  });
  assert.equal(state.kind, "expired_running");
  if (state.kind === "expired_running") {
    assert.equal(state.count, 1);
  }
});

test("projectBackendWorkStatus surfaces analysis_failed when no expired-running but failed analyses exist", () => {
  const state = projectBackendWorkStatus({
    status: "idle",
    retry_scheduled_jobs: 2,
    failed_analyses: 1
  });
  assert.equal(state.kind, "analysis_failed");
  if (state.kind === "analysis_failed") {
    assert.equal(state.count, 1);
  }
});

test("projectBackendWorkStatus surfaces analysis_waiting when only pending/running analyses exist", () => {
  const state = projectBackendWorkStatus({
    status: "idle",
    pending_analyses: 1,
    running_analyses: 2
  });
  assert.equal(state.kind, "analysis_waiting");
  if (state.kind === "analysis_waiting") {
    assert.equal(state.count, 3);
  }
});

test("projectBackendWorkStatus reports draining when the worker thread is alive and no blocker exists", () => {
  const state = projectBackendWorkStatus({
    status: "draining",
    pending_due_jobs: 1,
    running_jobs: 1
  });
  assert.equal(state.kind, "draining");
});

test("projectBackendWorkStatus reports backend_error with the highest priority", () => {
  const state = projectBackendWorkStatus({
    status: "draining",
    expired_running_jobs: 1,
    failed_analyses: 1,
    last_drain_error: "db unavailable"
  });
  assert.equal(state.kind, "backend_error");
  if (state.kind === "backend_error") {
    assert.equal(state.message, "db unavailable");
  }
});

// sameBackendWorkUiState is the identity-preservation gate: an idle backend
// polled every 12s must not mint a fresh UI state object when nothing changed,
// so the comparison has to be exhaustive over every union member and field.
const sameBackendWorkUiStateCases: Array<{
  name: string;
  left: BackendWorkUiState | null;
  right: BackendWorkUiState | null;
  expected: boolean;
}> = [
  // Null / value / kind edges.
  { name: "null vs null", left: null, right: null, expected: true },
  { name: "null vs value", left: null, right: { kind: "idle" }, expected: false },
  { name: "value vs null", left: { kind: "idle" }, right: null, expected: false },
  { name: "kind mismatch idle vs draining", left: { kind: "idle" }, right: { kind: "draining" }, expected: false },
  {
    name: "kind mismatch analysis_waiting vs analysis_failed (same count)",
    left: { kind: "analysis_waiting", count: 2 },
    right: { kind: "analysis_failed", count: 2 },
    expected: false
  },

  // idle — no fields.
  { name: "idle identical", left: { kind: "idle" }, right: { kind: "idle" }, expected: true },

  // draining — no fields.
  { name: "draining identical", left: { kind: "draining" }, right: { kind: "draining" }, expected: true },

  // retry_waiting — count, earliestRetryAt, nextDueAt.
  {
    name: "retry_waiting identical",
    left: { kind: "retry_waiting", count: 2, earliestRetryAt: "2026-06-16T10:30:00.000Z", nextDueAt: "2026-06-16T10:35:00.000Z" },
    right: { kind: "retry_waiting", count: 2, earliestRetryAt: "2026-06-16T10:30:00.000Z", nextDueAt: "2026-06-16T10:35:00.000Z" },
    expected: true
  },
  {
    name: "retry_waiting flipped count",
    left: { kind: "retry_waiting", count: 2, earliestRetryAt: "2026-06-16T10:30:00.000Z", nextDueAt: null },
    right: { kind: "retry_waiting", count: 3, earliestRetryAt: "2026-06-16T10:30:00.000Z", nextDueAt: null },
    expected: false
  },
  {
    name: "retry_waiting flipped earliestRetryAt",
    left: { kind: "retry_waiting", count: 2, earliestRetryAt: "2026-06-16T10:30:00.000Z", nextDueAt: null },
    right: { kind: "retry_waiting", count: 2, earliestRetryAt: "2026-06-16T10:31:00.000Z", nextDueAt: null },
    expected: false
  },
  {
    name: "retry_waiting flipped earliestRetryAt null vs value",
    left: { kind: "retry_waiting", count: 2, earliestRetryAt: null, nextDueAt: null },
    right: { kind: "retry_waiting", count: 2, earliestRetryAt: "2026-06-16T10:30:00.000Z", nextDueAt: null },
    expected: false
  },
  {
    name: "retry_waiting flipped nextDueAt",
    left: { kind: "retry_waiting", count: 2, earliestRetryAt: null, nextDueAt: "2026-06-16T10:35:00.000Z" },
    right: { kind: "retry_waiting", count: 2, earliestRetryAt: null, nextDueAt: "2026-06-16T10:36:00.000Z" },
    expected: false
  },
  {
    name: "retry_waiting flipped nextDueAt value vs null",
    left: { kind: "retry_waiting", count: 2, earliestRetryAt: null, nextDueAt: "2026-06-16T10:35:00.000Z" },
    right: { kind: "retry_waiting", count: 2, earliestRetryAt: null, nextDueAt: null },
    expected: false
  },

  // expired_running — count.
  { name: "expired_running identical", left: { kind: "expired_running", count: 1 }, right: { kind: "expired_running", count: 1 }, expected: true },
  { name: "expired_running flipped count", left: { kind: "expired_running", count: 1 }, right: { kind: "expired_running", count: 2 }, expected: false },

  // analysis_waiting — count.
  { name: "analysis_waiting identical", left: { kind: "analysis_waiting", count: 3 }, right: { kind: "analysis_waiting", count: 3 }, expected: true },
  { name: "analysis_waiting flipped count", left: { kind: "analysis_waiting", count: 3 }, right: { kind: "analysis_waiting", count: 4 }, expected: false },

  // analysis_failed — count.
  { name: "analysis_failed identical", left: { kind: "analysis_failed", count: 1 }, right: { kind: "analysis_failed", count: 1 }, expected: true },
  { name: "analysis_failed flipped count", left: { kind: "analysis_failed", count: 1 }, right: { kind: "analysis_failed", count: 2 }, expected: false },

  // backend_error — message.
  { name: "backend_error identical", left: { kind: "backend_error", message: "db unavailable" }, right: { kind: "backend_error", message: "db unavailable" }, expected: true },
  { name: "backend_error flipped message", left: { kind: "backend_error", message: "db unavailable" }, right: { kind: "backend_error", message: "queue full" }, expected: false }
];

test("sameBackendWorkUiState compares every union member and field structurally", () => {
  for (const testCase of sameBackendWorkUiStateCases) {
    assert.equal(
      sameBackendWorkUiState(testCase.left, testCase.right),
      testCase.expected,
      `${testCase.name}: expected ${testCase.expected}`
    );
    // Comparison must be symmetric.
    assert.equal(
      sameBackendWorkUiState(testCase.right, testCase.left),
      testCase.expected,
      `${testCase.name} (reversed): expected ${testCase.expected}`
    );
  }
});

test("sameBackendWorkUiState short-circuits on reference identity", () => {
  const shared: BackendWorkUiState = { kind: "retry_waiting", count: 5, earliestRetryAt: null, nextDueAt: null };
  assert.equal(sameBackendWorkUiState(shared, shared), true);
  assert.equal(sameBackendWorkUiState(null, null), true);
});

test("sameBackendWorkUiState treats structurally equal distinct objects as equal", () => {
  const first: BackendWorkUiState = { kind: "idle" };
  const second: BackendWorkUiState = { kind: "idle" };
  assert.notEqual(first, second);
  assert.equal(sameBackendWorkUiState(first, second), true);
});
