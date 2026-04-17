import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AnalysisSnapshot, CaptureSnapshot } from "../src/contracts/ingest.ts";
import type { SessionProcessingSummary, WorkerStatus } from "../src/state/processing-state.ts";
import type { ExtensionSettings, SessionRecord } from "../src/state/types.ts";
import { createDefaultSettings } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { CompareView } from "../src/ui/CompareView.tsx";
import { LibraryView } from "../src/ui/LibraryView.tsx";

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

function buildLibraryPendingSession(): SessionRecord {
  const session = createSessionRecord("Signals", "2026-03-24T07:00:00.000Z");
  const item = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@alpha/post/pending",
      post_url: "https://www.threads.net/@alpha/post/pending",
      author_hint: "alpha",
      text_snippet: "Pending text should be skeletonized",
      time_token_hint: "1h",
      dom_anchor: "card-pending",
      engagement: { likes: 10, comments: 5, reposts: 1, forwards: 0, views: 100 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  item.status = "queued";
  session.items.push(item);
  return session;
}

function buildPendingCompareSession(): SessionRecord {
  const session = createSessionRecord("Signals", "2026-03-24T07:00:00.000Z");
  const itemReady = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@alpha/post/ready",
      post_url: "https://www.threads.net/@alpha/post/ready",
      author_hint: "alpha",
      text_snippet: "Ready item",
      time_token_hint: "1h",
      dom_anchor: "card-ready",
      engagement: { likes: 10, comments: 5, reposts: 1, forwards: 0, views: 100 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  const itemAnalyzing = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@beta/post/analyzing",
      post_url: "https://www.threads.net/@beta/post/analyzing",
      author_hint: "beta",
      text_snippet: "Analyzing item",
      time_token_hint: "1h",
      dom_anchor: "card-analyzing",
      engagement: { likes: 8, comments: 3, reposts: 0, forwards: 0, views: 70 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );

  itemReady.status = "succeeded";
  itemReady.captureId = "cap-ready";
  itemReady.latestCapture = buildCapture("cap-ready", "support", "support this policy");
  itemAnalyzing.status = "succeeded";
  itemAnalyzing.captureId = "cap-analyzing";
  itemAnalyzing.latestCapture = {
    ...buildCapture("cap-analyzing", "mixed", "waiting on analysis"),
    analysis: {
      ...buildCapture("cap-analyzing", "mixed", "waiting on analysis").analysis!,
      status: "running"
    }
  };

  session.items.push(itemReady, itemAnalyzing);
  return session;
}

test("LibraryView shows shimmer placeholders for pending rows", () => {
  const session = buildLibraryPendingSession();
  const summary: SessionProcessingSummary = {
    total: 1,
    ready: 0,
    crawling: 1,
    analyzing: 0,
    pending: 0,
    failed: 0,
    hasReadyPair: false,
    hasInflight: true
  };

  const html = renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem: session.items[0]!,
      optimisticQueuedIds: [],
      workerStatus: "draining" as WorkerStatus | null,
      isStartingProcessing: false,
      processAllLabel: "Process All",
      processingSummary: summary,
      canPrev: false,
      canNext: false,
      onSelectItem: () => undefined,
      onProcessAll: () => undefined,
      onMoveSelection: () => undefined,
      onQueueItem: () => undefined,
      renderMetrics: () => null,
      techniqueReadings: [],
      initialSection: "posts"
    })
  );

  assert.match(html, /data-library-card-skeleton="visible"/);
  assert.match(html, /dlens-popup-shimmer/);
});

test("CompareView shows a pending result hero skeleton while analysis is still inflight", () => {
  const settings: ExtensionSettings = createDefaultSettings();

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildPendingCompareSession(),
      settings
    })
  );

  assert.match(html, /data-compare-bridge="unavailable"/);
  assert.match(html, /data-result-hero-skeleton="visible"/);
  assert.match(html, /data-result-hero-pending-status="analyzing"/);
});
