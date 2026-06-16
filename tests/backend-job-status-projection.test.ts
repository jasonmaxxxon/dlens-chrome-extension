import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { CaptureSnapshot, JobSnapshot, WorkerStatusResponse } from "../src/contracts/ingest.ts";
import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import {
  getItemReadinessStatus,
  projectBackendWorkStatus,
  type BackendWorkUiState
} from "../src/state/processing-state.ts";
import { createSessionItem, reconcileSessionItem } from "../src/state/store-helpers.ts";

interface FixtureCase {
  description: string;
  worker_status: WorkerStatusResponse;
  expected_projection: BackendWorkUiState;
  item_state_seed: {
    job: Partial<JobSnapshot> | null;
    capture: Partial<CaptureSnapshot> | null;
  };
  expected_item_readiness: ReturnType<typeof getItemReadinessStatus>;
  expected_last_error_kind?: string | null;
  expected_last_error_match?: string;
}

interface FixtureFile {
  shared_case_names: string[];
  cases: Record<string, FixtureCase>;
}

const REQUIRED_CASE_NAMES = [
  "retry-scheduled-crawl",
  "expired-running-lease",
  "missing-analysis-after-crawl-success",
  "failed-analysis-after-crawl-success",
  "terminal-dead-crawl"
] as const;

const fixturePath = path.join(import.meta.dirname, "fixtures", "backend-job-status-negative-cases.json");
const fixture: FixtureFile = JSON.parse(readFileSync(fixturePath, "utf8"));

function descriptor(label: string): TargetDescriptor {
  return {
    target_type: "post",
    page_url: `https://www.threads.net/@x/post/${label}`,
    post_url: `https://www.threads.net/@x/post/${label}`,
    author_hint: "x",
    text_snippet: label,
    time_token_hint: "1h",
    dom_anchor: `card-${label}`,
    engagement: { likes: 0, comments: 0, reposts: 0, forwards: 0, views: 0 },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
    captured_at: "2026-06-16T09:00:00.000Z"
  };
}

function buildJob(overrides: Partial<JobSnapshot>): JobSnapshot {
  return {
    id: "job-1",
    capture_id: "cap-1",
    job_type: "threads_post_comments_crawl",
    status: "pending",
    priority: 1,
    attempt_count: 0,
    max_attempts: 3,
    scheduled_at: "2026-06-16T09:00:00.000Z",
    claimed_at: null,
    started_at: null,
    finished_at: null,
    lease_expires_at: null,
    worker_token: null,
    last_error_kind: null,
    last_error: null,
    last_error_at: null,
    created_at: "2026-06-16T09:00:00.000Z",
    updated_at: "2026-06-16T09:00:00.000Z",
    ...overrides
  };
}

function buildCapture(overrides: Partial<CaptureSnapshot>): CaptureSnapshot {
  return {
    id: "cap-1",
    source_type: "threads",
    capture_type: "post",
    source_page_url: "https://www.threads.net/@x/post/seed",
    source_post_url: "https://www.threads.net/@x/post/seed",
    canonical_target_url: "https://www.threads.net/@x/post/seed",
    author_hint: "x",
    text_snippet: "seed",
    time_token_hint: "1h",
    dom_anchor: "card-seed",
    engagement: {},
    client_context: {},
    raw_payload: {},
    ingestion_status: "succeeded",
    captured_at: "2026-06-16T09:00:00.000Z",
    created_at: "2026-06-16T09:00:00.000Z",
    updated_at: "2026-06-16T09:00:00.000Z",
    job: null,
    result: null,
    analysis: null,
    ...overrides
  };
}

function buildAnalysisOverride(seed: Partial<CaptureSnapshot["analysis"] & object> | null | undefined) {
  if (seed === undefined) {
    return undefined;
  }
  if (seed === null) {
    return null;
  }
  return {
    id: "analysis-1",
    capture_id: "cap-1",
    status: "failed" as const,
    stage: "final" as const,
    analysis_version: "v1",
    source_comment_count: null,
    clusters: [],
    evidence: [],
    metrics: {},
    generated_at: null,
    last_error: null,
    created_at: "2026-06-16T09:30:00.000Z",
    updated_at: "2026-06-16T09:30:00.000Z",
    ...seed
  };
}

test("negative fixture file declares exactly the required case names", () => {
  assert.deepEqual(
    [...fixture.shared_case_names].sort(),
    [...REQUIRED_CASE_NAMES].sort()
  );
  assert.deepEqual(
    Object.keys(fixture.cases).sort(),
    [...REQUIRED_CASE_NAMES].sort()
  );
});

for (const caseName of REQUIRED_CASE_NAMES) {
  test(`projection: ${caseName}`, () => {
    const fixtureCase = fixture.cases[caseName];
    assert.ok(fixtureCase, `missing fixture case ${caseName}`);

    const projection = projectBackendWorkStatus(fixtureCase.worker_status);
    assert.deepEqual(projection, fixtureCase.expected_projection);
  });

  test(`item readiness: ${caseName}`, () => {
    const fixtureCase = fixture.cases[caseName];
    const item = createSessionItem(descriptor(caseName), "2026-06-16T09:00:00.000Z");
    const job = fixtureCase.item_state_seed.job ? buildJob(fixtureCase.item_state_seed.job) : null;
    const capture = fixtureCase.item_state_seed.capture
      ? buildCapture({
          ...fixtureCase.item_state_seed.capture,
          analysis: buildAnalysisOverride(fixtureCase.item_state_seed.capture.analysis) ?? null
        })
      : null;

    const reconciled = reconcileSessionItem(item, job, capture);
    assert.equal(getItemReadinessStatus(reconciled), fixtureCase.expected_item_readiness);

    if ("expected_last_error_kind" in fixtureCase) {
      assert.equal(reconciled.lastErrorKind, fixtureCase.expected_last_error_kind);
    }
    if (fixtureCase.expected_last_error_match) {
      assert.match(String(reconciled.lastError), new RegExp(fixtureCase.expected_last_error_match, "i"));
    }
  });
}
