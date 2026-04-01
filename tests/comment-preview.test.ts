import assert from "node:assert/strict";
import test from "node:test";

import type { CaptureSnapshot } from "../src/contracts/ingest.ts";
import { extractCommentsPreview } from "../src/state/comment-preview.ts";

function buildCapture(comments: Array<Record<string, unknown>>): CaptureSnapshot {
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
      comments,
      crawl_meta: {},
      raw_payload: {},
      fetched_at: "2026-03-24T07:22:30.000Z",
      created_at: "2026-03-24T07:22:30.000Z"
    }
  };
}

test("extractCommentsPreview keeps deterministic top five comments by like_count", () => {
  const preview = extractCommentsPreview(
    buildCapture([
      { id: "c1", text: "one", like_count: 1, author_username: "one" },
      { id: "c2", text: "two", like_count: 7, author_username: "two" },
      { id: "c3", text: "three", like_count: 4, author_username: "three" },
      { id: "c4", text: "four", like_count: 6, author_username: "four" },
      { id: "c5", text: "five", like_count: 2, author_username: "five" },
      { id: "c6", text: "six", like_count: 3, author_username: "six" }
    ])
  );

  assert.deepEqual(
    preview.map((item) => item.id),
    ["c2", "c4", "c3", "c6", "c5"]
  );
});

test("extractCommentsPreview falls back to stable order when like_count is absent", () => {
  const preview = extractCommentsPreview(
    buildCapture([
      { id: "c1", text: "one", author_username: "one" },
      { id: "c2", text: "two", author_username: "two" }
    ])
  );

  assert.deepEqual(
    preview.map((item) => item.id),
    ["c1", "c2"]
  );
});
