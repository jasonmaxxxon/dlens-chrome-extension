import assert from "node:assert/strict";
import test from "node:test";

import type { AnalysisSnapshot, CaptureSnapshot } from "../src/contracts/ingest.ts";
import { buildCompareBriefRequest } from "../src/compare/brief-request.ts";
import { createSessionItem } from "../src/state/store-helpers.ts";
import type { SessionItem } from "../src/state/types.ts";

function buildCapture(
  id: string,
  clusterKeyword: string,
  evidenceText: string,
  analysisOverrides: Partial<AnalysisSnapshot> = {}
): CaptureSnapshot {
  const analysis: AnalysisSnapshot = {
    id: `analysis-${id}`,
    capture_id: id,
    status: "succeeded",
    stage: "final",
    analysis_version: "v1",
    source_comment_count: 10,
    clusters: [{ cluster_key: 0, size_share: 0.6, like_share: 0.7, keywords: [clusterKeyword] }],
    evidence: [{ cluster_key: 0, comments: [{ comment_id: `comment-${id}`, text: evidenceText, like_count: 5 }] }],
    metrics: {
      n_clusters: 1,
      dominance_ratio_top1: 0.7,
      gini_like_share: 0.1,
      cluster_like_share: [{ cluster_id: 0, share: 0.7 }],
      cluster_size_share: [{ cluster_id: 0, share: 0.6 }],
      battlefield: { top_flows: [], health: { total_replies: 0, orphans: 0, coverage_rate: 1, n_roots: 1 } }
    },
    generated_at: "2026-03-24T07:22:30.000Z",
    last_error: null,
    created_at: "2026-03-24T07:22:30.000Z",
    updated_at: "2026-03-24T07:22:30.000Z",
    ...analysisOverrides
  };

  return {
    id,
    source_type: "threads",
    capture_type: "post",
    source_page_url: `https://www.threads.net/@alpha/post/${id}`,
    source_post_url: `https://www.threads.net/@alpha/post/${id}`,
    canonical_target_url: `https://www.threads.net/@alpha/post/${id}`,
    author_hint: "alpha",
    text_snippet: `snippet ${id}`,
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
    result: {
      id: `result-${id}`,
      job_id: `job-${id}`,
      capture_id: id,
      source_type: "threads",
      canonical_target_url: `https://www.threads.net/@alpha/post/${id}`,
      canonical_post: { author: "alpha", text: `post ${id}`, metrics: { likes: 10, comments: 5 } },
      comments: [{ id: `comment-${id}`, text: evidenceText, like_count: 5, author_username: "u1" }],
      crawl_meta: {},
      raw_payload: {},
      fetched_at: "2026-03-24T07:22:30.000Z",
      created_at: "2026-03-24T07:22:30.000Z"
    },
    analysis
  };
}

function buildReadyItem(id: string, author: string, snippet: string, captureId: string, keyword: string, evidenceText: string): SessionItem {
  const item = createSessionItem(
    {
      target_type: "post",
      page_url: `https://www.threads.net/@${author}/post/${id}`,
      post_url: `https://www.threads.net/@${author}/post/${id}`,
      author_hint: author,
      text_snippet: snippet,
      time_token_hint: "1h",
      dom_anchor: `card-${id}`,
      engagement: { likes: 10, comments: 5, reposts: 1, forwards: 0, views: 100 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  item.status = "succeeded";
  item.captureId = captureId;
  item.latestCapture = buildCapture(captureId, keyword, evidenceText);
  return item;
}

test("buildCompareBriefRequest reshapes ready session items into the compare brief contract", () => {
  const left = buildReadyItem("a", "alpha", "A", "cap-a", "support", "support this policy");
  const right = buildReadyItem("b", "beta", "B", "cap-b", "harmful", "this is terrible");

  const request = buildCompareBriefRequest(left, right);

  assert.ok(request);
  assert.equal(request?.left.captureId, "cap-a");
  assert.equal(request?.right.captureId, "cap-b");
  assert.equal(request?.left.author, "alpha");
  assert.equal(request?.right.author, "alpha");
  assert.equal(request?.left.metricsCoverageLabel, "All core metrics captured");
  assert.equal(request?.left.sourceCommentCount, 10);
  assert.equal(request?.left.velocity.likesPerHour, 10);
  assert.deepEqual(request?.left.clusters[0]?.keywords, ["support"]);
  assert.equal(request?.left.clusters[0]?.evidenceCandidates[0]?.comment_id, "comment-cap-a");
});

test("buildCompareBriefRequest returns null when either side is missing a succeeded analysis", () => {
  const left = buildReadyItem("a", "alpha", "A", "cap-a", "support", "support this policy");
  const right = buildReadyItem("b", "beta", "B", "cap-b", "harmful", "this is terrible");
  right.latestCapture = { ...right.latestCapture!, analysis: null } as SessionItem["latestCapture"];

  assert.equal(buildCompareBriefRequest(left, right), null);
});
