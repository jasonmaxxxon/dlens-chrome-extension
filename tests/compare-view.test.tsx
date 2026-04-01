import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AnalysisSnapshot, CaptureSnapshot } from "../src/contracts/ingest.ts";
import { CompareView } from "../src/ui/CompareView.tsx";
import type { ExtensionSettings, SessionRecord } from "../src/state/types.ts";
import { createDefaultSettings } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";

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

function buildSession(): SessionRecord {
  const session = createSessionRecord("Signals", "2026-03-24T07:00:00.000Z");
  const itemA = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@alpha/post/a",
      post_url: "https://www.threads.net/@alpha/post/a",
      author_hint: "alpha",
      text_snippet: "A",
      time_token_hint: "1h",
      dom_anchor: "card-a",
      engagement: { likes: 10, comments: 5, reposts: 1, forwards: 0, views: 100 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  const itemB = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@beta/post/b",
      post_url: "https://www.threads.net/@beta/post/b",
      author_hint: "beta",
      text_snippet: "B",
      time_token_hint: "1h",
      dom_anchor: "card-b",
      engagement: { likes: 8, comments: 3, reposts: 0, forwards: 0, views: 70 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  itemA.status = "succeeded";
  itemB.status = "succeeded";
  itemA.captureId = "cap-a";
  itemB.captureId = "cap-b";
  itemA.latestCapture = buildCapture("cap-a", "support", "support this policy");
  itemB.latestCapture = buildCapture("cap-b", "harmful", "this is terrible");
  session.items.push(itemA, itemB);
  return session;
}

function buildPendingSession(): SessionRecord {
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

test("CompareView renders analysis cards and evidence when analysis is available", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /Audience Clusters/i);
  assert.match(html, /support this policy/);
  assert.match(html, /this is terrible/);
  assert.match(html, /support/);
  assert.match(html, /harmful/);
  assert.match(html, /這群回應主要圍繞/);
});

test("createDefaultSettings includes empty one-liner settings by default", () => {
  const settings: ExtensionSettings = createDefaultSettings();

  assert.equal(settings.oneLinerProvider, "google");
  assert.equal(settings.openaiApiKey, "");
  assert.equal(settings.claudeApiKey, "");
  assert.equal(settings.googleApiKey, "");
});

test("CompareView renders readiness board when fewer than two items are ready", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildPendingSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /Waiting for 2 ready posts/i);
  assert.match(html, /Ready/);
  assert.match(html, /Analyzing/);
});

test("CompareView uses the shared dominance thresholds for analysis summary labels", () => {
  const session = buildSession();
  session.items[0]!.latestCapture = buildCapture("cap-a", "support", "support this policy", {
    metrics: {
      n_clusters: 1,
      dominance_ratio_top1: 0.68,
      gini_like_share: 0.1
    }
  });

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session,
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /高度集中\(68%\)/);
});

test("CompareView ranks clusters and evidence using the stable analysis helpers", () => {
  const session = buildSession();
  session.items[0]!.latestCapture = buildCapture("cap-a", "support", "support this policy", {
    clusters: [
      { cluster_key: 9, size_share: 0.2, like_share: 0.15, keywords: ["smaller-cluster"] },
      { cluster_key: 3, size_share: 0.7, like_share: 0.75, keywords: ["largest-cluster"] }
    ],
    evidence: [
      {
        cluster_key: 3,
        comments: [
          { comment_id: "c-low", text: "low priority evidence", like_count: 1 },
          { comment_id: "c-top", text: "top evidence first", like_count: 9 }
        ]
      },
      {
        cluster_key: 9,
        comments: [{ comment_id: "c-small", text: "small cluster evidence", like_count: 3 }]
      }
    ]
  });

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session,
      settings: createDefaultSettings()
    })
  );

  assert.ok(html.indexOf("largest-cluster") < html.indexOf("smaller-cluster"));
  assert.ok(html.indexOf("top evidence first") < html.indexOf("low priority evidence"));
});

test("CompareView limits cluster example evidence to two comments per side", () => {
  const session = buildSession();
  session.items[0]!.latestCapture = buildCapture("cap-a", "support", "support this policy", {
    evidence: [
      {
        cluster_key: 0,
        comments: [
          { comment_id: "c-1", text: "first evidence", like_count: 9 },
          { comment_id: "c-2", text: "second evidence", like_count: 7 },
          { comment_id: "c-3", text: "third evidence", like_count: 5 }
        ]
      }
    ]
  });

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session,
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /first evidence/);
  assert.match(html, /second evidence/);
  assert.doesNotMatch(html, /third evidence/);
});

test("CompareView separates raw totals from age-adjusted velocity and labels missing metrics", () => {
  const session = buildSession();
  session.items[0]!.descriptor.time_token_hint = "2h";
  session.items[1]!.descriptor.time_token_hint = "3d";
  session.items[0]!.descriptor.engagement.views = null;
  session.items[0]!.descriptor.engagement_present.views = false;

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session,
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /Raw engagement/i);
  assert.match(html, /Age-adjusted velocity/i);
  assert.match(html, /Approx\. 2h old/);
  assert.match(html, /Approx\. 3d old/);
  assert.match(html, /Partial metrics only/);
  assert.match(html, /Not captured/);
});

test("CompareView renders expandable evidence details with captured metrics", () => {
  const session = buildSession();
  const capture = session.items[0]!.latestCapture!;
  capture.result = {
    ...capture.result!,
    comments: [
      {
        id: "comment-cap-a",
        text: "support this policy",
        like_count: 5,
        reply_count: 2,
        repost_count: 1,
        forward_count: 0,
        author_username: "u1"
      }
    ]
  };

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session,
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /Evidence details/);
  assert.match(html, /Comments 2/);
  assert.match(html, /Reposts 1/);
  assert.match(html, /Forwards 0/);
});

test("CompareView auto-selects a distinct ready pair", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /selected="">#1 alpha/);
  assert.match(html, /selected="">#2 beta/);
});
