import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildProductSignalEvidenceCatalogFromCapture } from "../src/compare/product-signal-analysis.ts";
import { projectCapturedPostFromCapture } from "../src/state/captured-post.ts";
import type { CaptureSnapshot } from "../src/contracts/ingest.ts";

const FIXTURE_PATH = new URL("./fixtures/thread-readmodel-projection-golden.json", import.meta.url);

const EXPECTED_CASES = new Set([
  "duplicate-root",
  "op-continuation-chain",
  "op-self-reply",
  "discussion-reply",
  "nested-reply",
  "orphan-reply",
  "quote-repost-ambiguity"
]);

interface ProjectionFixtureCase {
  name: string;
  thread_read_model: Record<string, unknown>;
  expected: {
    opContinuationIds: string[];
    replies: Array<{
      id: string;
      role: string;
      isOrphan: boolean;
      parentId: string | null;
      resolvedParentId: string | null;
    }>;
    evidence: Array<{
      ref: string;
      id: string;
      role: string;
      isOrphan: boolean;
      parentId: string | null;
      resolvedParentId: string | null;
    }>;
  };
}

function loadCases(): ProjectionFixtureCase[] {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ProjectionFixtureCase[];
}

function buildCapture(threadReadModel: Record<string, unknown>): CaptureSnapshot {
  return {
    source_type: "threads",
    capture_type: "post",
    source_page_url: "https://www.threads.net/@alice/post/abc123",
    source_post_url: "https://www.threads.net/@alice/post/abc123",
    canonical_target_url: "https://www.threads.net/@alice/post/abc123",
    author_hint: "alice",
    text_snippet: "fallback",
    time_token_hint: null,
    dom_anchor: null,
    engagement: {},
    client_context: {},
    raw_payload: {},
    ingestion_status: "succeeded",
    captured_at: "2026-06-15T00:00:00.000Z",
    result: {
      id: "result-1",
      capture_id: "cap-1",
      job_id: "job-1",
      source_type: "threads",
      canonical_target_url: "https://www.threads.net/@alice/post/abc123",
      canonical_post: {},
      comments: [],
      thread_read_model: threadReadModel,
      crawl_meta: {},
      raw_payload: {},
      fetched_at: "2026-06-15T00:00:00.000Z"
    }
  } as CaptureSnapshot;
}

test("thread read-model projection fixture cases are complete", () => {
  assert.deepEqual(new Set(loadCases().map((entry) => entry.name)), EXPECTED_CASES);
});

test("thread read-model projection fixtures preserve roles and evidence metadata", () => {
  for (const fixture of loadCases()) {
    const capture = buildCapture(fixture.thread_read_model);
    const post = projectCapturedPostFromCapture(capture);
    const evidence = buildProductSignalEvidenceCatalogFromCapture(capture);

    assert.deepEqual(post.opContinuations.map((fragment) => fragment.id), fixture.expected.opContinuationIds, fixture.name);
    assert.deepEqual(
      post.replies.map((fragment) => ({
        id: fragment.id,
        role: fragment.role,
        isOrphan: fragment.isOrphan,
        parentId: fragment.parentId,
        resolvedParentId: fragment.resolvedParentId
      })),
      fixture.expected.replies,
      fixture.name
    );
    assert.deepEqual(
      evidence.map((entry) => ({
        ref: entry.ref,
        id: entry.id,
        role: entry.role,
        isOrphan: entry.isOrphan,
        parentId: entry.parentId,
        resolvedParentId: entry.resolvedParentId
      })),
      fixture.expected.evidence,
      fixture.name
    );
  }
});
