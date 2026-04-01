import assert from "node:assert/strict";
import test from "node:test";

import type { CaptureSnapshot, JobSnapshot } from "../src/contracts/ingest.ts";
import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { createEmptyGlobalState } from "../src/state/types.ts";
import {
  createSessionRecord,
  createSessionItem,
  deleteSession,
  markSessionItemQueued,
  needsCaptureRefresh,
  reconcileSessionItem,
  saveDescriptorToSession,
  setActiveSession,
  updateSessionItem
} from "../src/state/store-helpers.ts";

function buildDescriptor(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    target_type: "post",
    page_url: "https://www.threads.net/@alpha/post/abc",
    post_url: "https://www.threads.net/@alpha/post/abc",
    author_hint: "alpha",
    text_snippet: "First post",
    time_token_hint: "2h",
    dom_anchor: "article:nth-of-type(1)",
    engagement: {
      likes: 12,
      comments: 3,
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
    captured_at: "2026-03-24T07:22:21.000Z",
    ...overrides
  };
}

function buildJob(overrides: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    id: "job-1",
    capture_id: "cap-1",
    job_type: "threads_post_comments_crawl",
    status: "succeeded",
    priority: 1,
    attempt_count: 1,
    max_attempts: 3,
    scheduled_at: "2026-03-24T07:22:21.000Z",
    claimed_at: "2026-03-24T07:22:22.000Z",
    started_at: "2026-03-24T07:22:23.000Z",
    finished_at: "2026-03-24T07:22:30.000Z",
    lease_expires_at: null,
    worker_token: "worker-1",
    last_error_kind: null,
    last_error: null,
    last_error_at: null,
    created_at: "2026-03-24T07:22:21.000Z",
    updated_at: "2026-03-24T07:22:30.000Z",
    ...overrides
  };
}

function buildCapture(overrides: Partial<CaptureSnapshot> = {}): CaptureSnapshot {
  return {
    id: "cap-1",
    source_type: "threads",
    capture_type: "post",
    source_page_url: "https://www.threads.net/@alpha/post/abc",
    source_post_url: "https://www.threads.net/@alpha/post/abc",
    canonical_target_url: "https://www.threads.net/@alpha/post/abc",
    author_hint: "alpha",
    text_snippet: "First post",
    time_token_hint: "2h",
    dom_anchor: "article:nth-of-type(1)",
    engagement: {},
    client_context: {},
    raw_payload: {},
    ingestion_status: "succeeded",
    captured_at: "2026-03-24T07:22:21.000Z",
    created_at: "2026-03-24T07:22:21.000Z",
    updated_at: "2026-03-24T07:22:30.000Z",
    job: null,
    analysis: null,
    result: {
      id: "result-1",
      job_id: "job-1",
      capture_id: "cap-1",
      source_type: "threads",
      canonical_target_url: "https://www.threads.net/@alpha/post/abc",
      canonical_post: {},
      comments: [
        { id: "c1", text: "less liked", like_count: 2, author_username: "u1" },
        { id: "c2", text: "most liked", like_count: 9, author_username: "u2" },
        { id: "c3", text: "middle", like_count: 4, author_username: "u3" }
      ],
      crawl_meta: {},
      raw_payload: {},
      fetched_at: "2026-03-24T07:22:30.000Z",
      created_at: "2026-03-24T07:22:30.000Z"
    },
    ...overrides
  };
}

test("saveDescriptorToSession dedupes by normalized post_url within the same session", () => {
  const session = createSessionRecord("Topic A", "2026-03-24T07:00:00.000Z");
  const globalState = setActiveSession(
    {
      ...createEmptyGlobalState(),
      sessions: [session]
    },
    session.id
  );

  const firstSave = saveDescriptorToSession(globalState, session.id, buildDescriptor());
  const secondSave = saveDescriptorToSession(firstSave.globalState, session.id, buildDescriptor({ post_url: "https://www.threads.net/@alpha/post/abc/" }));

  const savedSession = secondSave.globalState.sessions[0];
  assert.equal(savedSession.items.length, 1);
});

test("the same post can exist in different sessions", () => {
  const sessionA = createSessionRecord("Topic A", "2026-03-24T07:00:00.000Z");
  const sessionB = createSessionRecord("Topic B", "2026-03-24T07:00:00.000Z");
  let globalState = {
    ...createEmptyGlobalState(),
    sessions: [sessionA, sessionB],
    activeSessionId: sessionA.id
  };

  globalState = saveDescriptorToSession(globalState, sessionA.id, buildDescriptor()).globalState;
  globalState = saveDescriptorToSession(globalState, sessionB.id, buildDescriptor()).globalState;

  assert.equal(globalState.sessions[0].items.length, 1);
  assert.equal(globalState.sessions[1].items.length, 1);
});

test("markSessionItemQueued and reconcileSessionItem map lifecycle and capture links", () => {
  const item = createSessionItem(buildDescriptor(), "2026-03-24T07:22:21.000Z");
  const queued = markSessionItemQueued(
    item,
    {
      capture_id: "cap-1",
      job_id: "job-1",
      status: "queued",
      job_type: "threads_post_comments_crawl",
      canonical_target_url: "https://www.threads.net/@alpha/post/abc"
    },
    buildJob({ status: "pending" })
  );

  assert.equal(queued.status, "queued");
  assert.equal(queued.captureId, "cap-1");
  assert.equal(queued.jobId, "job-1");

  const reconciled = reconcileSessionItem(queued, buildJob({ status: "succeeded" }), buildCapture());
  assert.equal(reconciled.status, "succeeded");
  assert.equal(reconciled.commentsPreview[0]?.text, "most liked");
  assert.equal(reconciled.commentsPreview.length, 3);
});

test("reconcileSessionItem hides comments for non-succeeded states", () => {
  const item = createSessionItem(buildDescriptor(), "2026-03-24T07:22:21.000Z");
  const running = reconcileSessionItem(item, buildJob({ status: "running" }), buildCapture({ ingestion_status: "running" }));
  assert.equal(running.status, "running");
  assert.deepEqual(running.commentsPreview, []);
});

test("needsCaptureRefresh stays true after crawl success until analysis snapshot settles", () => {
  const item = createSessionItem(buildDescriptor(), "2026-03-24T07:22:21.000Z");
  const queued = markSessionItemQueued(
    item,
    {
      capture_id: "cap-1",
      job_id: "job-1",
      status: "queued",
      job_type: "threads_post_comments_crawl",
      canonical_target_url: "https://www.threads.net/@alpha/post/abc"
    },
    buildJob({ status: "pending" })
  );

  const crawlSucceededWithoutAnalysis = reconcileSessionItem(
    queued,
    buildJob({ status: "succeeded" }),
    buildCapture({ analysis: null })
  );
  assert.equal(needsCaptureRefresh(crawlSucceededWithoutAnalysis), true);

  const analysisRunning = reconcileSessionItem(
    queued,
    buildJob({ status: "succeeded" }),
    buildCapture({
      analysis: {
        id: "analysis-1",
        capture_id: "cap-1",
        status: "running",
        stage: "final",
        analysis_version: "v1",
        source_comment_count: 3,
        clusters: [],
        evidence: [],
        metrics: {},
        generated_at: null,
        last_error: null,
        created_at: "2026-03-24T07:22:31.000Z",
        updated_at: "2026-03-24T07:22:31.000Z"
      }
    })
  );
  assert.equal(needsCaptureRefresh(analysisRunning), true);

  const analysisSucceeded = reconcileSessionItem(
    queued,
    buildJob({ status: "succeeded" }),
    buildCapture({
      analysis: {
        id: "analysis-1",
        capture_id: "cap-1",
        status: "succeeded",
        stage: "final",
        analysis_version: "v1",
        source_comment_count: 3,
        clusters: [],
        evidence: [],
        metrics: {},
        generated_at: "2026-03-24T07:22:40.000Z",
        last_error: null,
        created_at: "2026-03-24T07:22:31.000Z",
        updated_at: "2026-03-24T07:22:40.000Z"
      }
    })
  );
  assert.equal(needsCaptureRefresh(analysisSucceeded), false);
});

test("updateSessionItem updates only the targeted item", () => {
  const session = createSessionRecord("Topic A", "2026-03-24T07:00:00.000Z");
  let globalState = {
    ...createEmptyGlobalState(),
    sessions: [session],
    activeSessionId: session.id
  };
  const first = saveDescriptorToSession(globalState, session.id, buildDescriptor({ post_url: "https://www.threads.net/@alpha/post/1" }));
  const second = saveDescriptorToSession(
    first.globalState,
    session.id,
    buildDescriptor({ post_url: "https://www.threads.net/@alpha/post/2", text_snippet: "Second post" })
  );
  const firstItemId = second.globalState.sessions[0].items[0].id;
  const updated = updateSessionItem(second.globalState, session.id, firstItemId, (item) => ({
    ...item,
    status: "queued"
  }));

  assert.equal(updated.sessions[0].items[0].status, "queued");
  assert.equal(updated.sessions[0].items[1].status, "saved");
});

test("deleteSession falls back to the next available folder", () => {
  const sessionA = createSessionRecord("Alpha", "2026-03-24T07:00:00.000Z");
  const sessionB = createSessionRecord("Beta", "2026-03-24T07:00:00.000Z");
  const globalState = {
    ...createEmptyGlobalState(),
    sessions: [sessionA, sessionB],
    activeSessionId: sessionA.id
  };

  const nextState = deleteSession(globalState, sessionA.id);

  assert.equal(nextState.sessions.length, 1);
  assert.equal(nextState.sessions[0].id, sessionB.id);
  assert.equal(nextState.activeSessionId, sessionB.id);
});

test("deleteSession clears active folder when removing the last folder", () => {
  const session = createSessionRecord("Solo", "2026-03-24T07:00:00.000Z");
  const globalState = {
    ...createEmptyGlobalState(),
    sessions: [session],
    activeSessionId: session.id
  };

  const nextState = deleteSession(globalState, session.id);

  assert.equal(nextState.sessions.length, 0);
  assert.equal(nextState.activeSessionId, null);
});
