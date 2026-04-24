import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AnalysisSnapshot, CaptureSnapshot } from "../src/contracts/ingest.ts";
import { compareViewTestables, CompareView } from "../src/ui/CompareView.tsx";
import type { ExtensionSettings, SessionRecord } from "../src/state/types.ts";
import { createDefaultSettings } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { buildTechniqueReadingSnapshot, STATIC_TECHNIQUE_DEFINITIONS } from "../src/compare/technique-reading.ts";
import type { Topic } from "../src/state/types.ts";

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

test("CompareView renders an analysis sheet before support data", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /留言區聲量結構/);
  assert.match(html, /代表性原文/);
  assert.match(html, /驗證數據/);
  assert.match(html, /support this policy/);
  assert.doesNotMatch(html, /Cluster #1/);
});

test("CompareView keeps support data collapsed while preserving navigation affordances", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /驗證數據/);
  assert.match(html, /叢集圖・方法論/);
  assert.doesNotMatch(html, /叢集分佈圖/);
  assert.ok(html.indexOf("代表性原文") < html.indexOf("驗證數據"));
});

// The support-data dock now uses semantic cluster titles instead of the older 群組 A/B copy.
test("CompareView renders side-specific support-data tabs with semantic cluster labels", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /代表性原文/);
  assert.match(html, /support/);
  assert.match(html, /harmful/);
});

test("CompareView uses placeholder avatars and engagement metrics in representative evidence cards", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /data-result-evidence-avatar="placeholder"/);
  assert.match(html, /data-evidence-metrics-row="single-line"/);
  assert.match(html, /data-evidence-metric="likes"/);
  assert.match(html, /data-evidence-metric="comments"/);
});

test("CompareView can render topic breadcrumb and attach-to-topic controls without altering the main sheet", () => {
  const session = buildSession();
  const topic: Topic = {
    id: "topic-1",
    sessionId: "session-1",
    name: "航班爭議",
    description: "",
    status: "watching",
    tags: [],
    signalIds: [],
    pairIds: [],
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-23T10:00:00.000Z"
  };

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session,
      settings: createDefaultSettings(),
      forcedSelection: {
        itemAId: session.items[0]!.id,
        itemBId: session.items[1]!.id
      },
      hideSelector: true,
      fromTopicId: "topic-1",
      fromTopicName: "航班爭議",
      topics: [topic],
      activeResultId: "result-1",
      attachedTopicIds: [],
      onReturnToTopic: () => undefined,
      onAttachToTopic: () => undefined
    })
  );

  assert.match(html, /案例本/);
  assert.match(html, /航班爭議/);
  assert.match(html, /成對檢視/);
  assert.match(html, /附加至案例/);
});

test("ResultTrustStrip keeps only the new cluster distribution graph when the validation drawer is open", () => {
  const session = buildSession();
  const analysisA = session.items[0]!.latestCapture!.analysis!;
  const analysisB = session.items[1]!.latestCapture!.analysis!;
  const leftSurfaces = compareViewTestables.buildClusterSummaries(analysisA, 5, 4, "cap-a").map((summary) =>
    compareViewTestables.resolveClusterSurface(summary, "left", new Map(), new Map())
  );
  const rightSurfaces = compareViewTestables.buildClusterSummaries(analysisB, 5, 4, "cap-b").map((summary) =>
    compareViewTestables.resolveClusterSurface(summary, "right", new Map(), new Map())
  );
  const html = renderToStaticMarkup(
    React.createElement(compareViewTestables.ResultTrustStrip, {
      analysisA,
      analysisB,
      capturedA: 10,
      capturedB: 10,
      leftClusterNodes: compareViewTestables.layoutClusterMapNodes(leftSurfaces),
      rightClusterNodes: compareViewTestables.layoutClusterMapNodes(rightSurfaces),
      defaultOpen: true
    })
  );

  assert.match(html, /叢集分佈圖/);
  assert.match(html, /資料覆蓋/);
  assert.match(html, /結構特徵/);
  assert.match(html, /平時慢速漂移，靠近時出現局部場域偏移/);
  assert.doesNotMatch(html, /互動叢集圖/);
  assert.doesNotMatch(html, /移動滑鼠可互動/);
  assert.doesNotMatch(html, /主流聲量/);
  assert.doesNotMatch(html, /高互動群/);
  assert.doesNotMatch(html, /Showing 3 most significant/);
});

test("Technique reading snapshot captures cluster, technique, and evidence context", () => {
  const session = buildSession();
  const detail = compareViewTestables.selectedClusterDetailFromSurface(
    compareViewTestables.resolveClusterSurface(
      compareViewTestables.buildClusterSummaries(session.items[0]!.latestCapture!.analysis!, 5, 4, "cap-a")[0]!,
      "left",
      new Map(),
      new Map()
    ),
    null,
    "Post A stance"
  );

  assert.ok(detail);

  const snapshot = buildTechniqueReadingSnapshot({
    sessionId: session.id,
    itemId: session.items[0]!.id,
    side: "A",
    clusterKey: "cap-a:0",
    detail: detail!,
    techniques: STATIC_TECHNIQUE_DEFINITIONS,
    now: "2026-04-04T10:00:00.000Z"
  });

  assert.equal(snapshot.sessionId, session.id);
  assert.equal(snapshot.side, "A");
  assert.equal(snapshot.clusterTitle, detail!.clusterTitle);
  assert.equal(snapshot.thesis, detail!.thesis);
  assert.equal(snapshot.techniques.length, 5);
  assert.equal(snapshot.evidence.length, detail!.audienceEvidence.length);
  assert.equal(snapshot.savedAt, "2026-04-04T10:00:00.000Z");
});

test("keyword evidence filter narrows receipts to the matching side when the keyword is specific", () => {
  const session = buildSession();
  const leftSurface = compareViewTestables.resolveClusterSurface(
    compareViewTestables.buildClusterSummaries(session.items[0]!.latestCapture!.analysis!, 5, 4, "cap-a")[0]!,
    "left",
    new Map(),
    new Map()
  );
  const rightSurface = compareViewTestables.resolveClusterSurface(
    compareViewTestables.buildClusterSummaries(session.items[1]!.latestCapture!.analysis!, 5, 4, "cap-b")[0]!,
    "right",
    new Map(),
    new Map()
  );
  const detailA = compareViewTestables.selectedClusterDetailFromSurface(leftSurface, null, "Post A stance");
  const detailB = compareViewTestables.selectedClusterDetailFromSurface(rightSurface, null, "Post B stance");

  assert.equal(
    compareViewTestables.resolveEvidenceKeywordFilter("support", detailA, detailB, "Post A 較靠近「support」", "Post B 較靠近「harmful」"),
    "A"
  );
  assert.equal(
    compareViewTestables.resolveEvidenceKeywordFilter("harmful", detailA, detailB, "Post A 較靠近「support」", "Post B 較靠近「harmful」"),
    "B"
  );
  assert.equal(
    compareViewTestables.resolveEvidenceKeywordFilter("support vs harmful", detailA, detailB, "Post A 較靠近「support」", "Post B 較靠近「harmful」"),
    "all"
  );
});

test("createDefaultSettings includes empty one-liner settings by default", () => {
  const settings: ExtensionSettings = createDefaultSettings();

  assert.equal(settings.oneLinerProvider, "google");
  assert.equal(settings.openaiApiKey, "");
  assert.equal(settings.claudeApiKey, "");
  assert.equal(settings.googleApiKey, "");
  assert.equal(settings.productProfile, null);
});

test("CompareView renders a Compare-language bridge when fewer than two items are ready", () => {
  let navigated = false;
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildPendingSession(),
      settings: createDefaultSettings(),
      onGoToLibrary: () => {
        navigated = true;
      }
    })
  );

  assert.equal(navigated, false);
  assert.match(html, /data-compare-bridge="unavailable"/);
  assert.match(html, /Compare needs two ready posts/i);
  assert.match(html, /Go to Library/i);
  assert.match(html, /1 ready and 1 near-ready/i);
  assert.doesNotMatch(html, /data-compare-section-rail="sticky"/);
});

test("CompareView keeps the unavailable bridge as hero-language, not a readiness dashboard", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildPendingSession(),
      settings: createDefaultSettings(),
      onGoToLibrary: () => undefined
    })
  );

  assert.match(html, /data-compare-bridge="unavailable"/);
  assert.match(html, /Compare needs two ready posts/i);
  assert.match(html, /Go to Library/i);
  assert.doesNotMatch(html, />Ready</);
  assert.doesNotMatch(html, />Analyzing</);
  assert.doesNotMatch(html, />In progress</);
  assert.doesNotMatch(html, />Failed</);
});

test("CompareView keeps dominance labels in support data instead of the hero", () => {
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

  const metrics = compareViewTestables.analysisMetrics(session.items[0]!.latestCapture!.analysis!);
  assert.equal(metrics.dominance, 0.68);
  assert.match(html, /留言區聲量結構/);
  assert.doesNotMatch(html, /高度集中\(68%\)/);
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

  const summaries = compareViewTestables.buildClusterSummaries(
    session.items[0]!.latestCapture!.analysis!,
    5,
    4,
    "cap-a"
  );

  assert.equal(summaries[0]?.cluster.keywords[0], "largest-cluster");
  assert.equal(summaries[0]?.evidence[0]?.text, "top evidence first");
});

test("CompareView surfaces up to four audience evidence items in the selected cluster panel", () => {
  const session = buildSession();
  session.items[0]!.latestCapture = buildCapture("cap-a", "support", "support this policy", {
    evidence: [
      {
        cluster_key: 0,
        comments: [
          { comment_id: "c-1", text: "first evidence", like_count: 9 },
          { comment_id: "c-2", text: "second evidence", like_count: 7 },
          { comment_id: "c-3", text: "third evidence", like_count: 5 },
          { comment_id: "c-4", text: "fourth evidence", like_count: 3 },
          { comment_id: "c-5", text: "fifth evidence", like_count: 1 }
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
  assert.doesNotMatch(html, /fourth evidence/);
  assert.doesNotMatch(html, /fifth evidence/);
});

test("CompareView keeps engagement collapsed by default while preserving age context", () => {
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

  assert.match(html, /留言區聲量結構/);
  assert.doesNotMatch(html, /Raw engagement/i);
  assert.doesNotMatch(html, /Momentum/i);
  assert.doesNotMatch(html, /likes\/hr/i);
});

test("CompareView renders audience evidence with inline captured metrics", () => {
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

  assert.match(html, /data-evidence-metric="likes"/);
  assert.match(html, /data-evidence-metric="comments"/);
  assert.match(html, /support this policy/);
});

test("CompareView uses comments captured copy instead of ambiguous crawled label", () => {
  const session = buildSession();
  session.items[0]!.latestCapture!.analysis!.source_comment_count = 9;
  session.items[1]!.latestCapture!.analysis!.source_comment_count = 6;

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session,
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /則留言/);
  assert.doesNotMatch(html, /comments crawled/);
});

test("CompareView merges canonical metrics with local extracted engagement when canonical metrics are partial", () => {
  const session = buildSession();
  session.items[0]!.latestCapture = buildCapture("cap-a", "support", "support this policy");
  session.items[0]!.latestCapture!.result!.canonical_post = {
    author: "alpha",
    text: "post cap-a",
    metrics: { likes: 161 }
  };
  session.items[0]!.descriptor.engagement = {
    likes: 150,
    comments: 14,
    reposts: 3,
    forwards: 1,
    views: 900
  };
  session.items[0]!.descriptor.engagement_present = {
    likes: true,
    comments: true,
    reposts: true,
    forwards: true,
    views: true
  };

  const post = compareViewTestables.getPost(session.items[0]!);

  assert.equal(post.metrics?.likes, 161);
  assert.equal(post.metrics?.comments, 14);
  assert.equal(post.metrics?.reposts, 3);
  assert.equal(post.metrics?.forwards, 1);
  assert.equal(post.metrics?.views, 900);
  assert.equal(post.metricPresent?.likes, true);
  assert.equal(post.metricPresent?.comments, true);
  assert.equal(post.metricPresent?.views, true);
});

test("CompareView hides the alert rail when there are no compare alerts yet", () => {
  const settings = createDefaultSettings();
  settings.googleApiKey = "AIza-test";

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings
    })
  );

  assert.doesNotMatch(html, /Rare insights/i);
  assert.doesNotMatch(html, /No alerts yet/i);
  assert.doesNotMatch(html, /data-alert-rail/);
});

test("CompareView suppresses sparse micro-clusters in the audience navigator", () => {
  const session = buildSession();
  session.items[0]!.latestCapture = buildCapture("cap-a", "support", "support this policy", {
    source_comment_count: 6,
    clusters: [
      { cluster_key: 0, size_share: 0.67, like_share: 0.84, keywords: ["support"] },
      { cluster_key: 1, size_share: 0.17, like_share: 0.1, keywords: ["general"] }
    ],
    metrics: {
      n_clusters: 2,
      dominance_ratio_top1: 0.7,
      gini_like_share: 0.1
    },
    evidence: [
      { cluster_key: 0, comments: [{ comment_id: "a-1", text: "dominant support", like_count: 9 }] },
      { cluster_key: 1, comments: [{ comment_id: "a-2", text: "one-off reply", like_count: 1 }] }
    ]
  });
  session.items[1]!.latestCapture = buildCapture("cap-b", "ownership", "ownership matters", {
    source_comment_count: 6,
    clusters: [
      { cluster_key: 7, size_share: 0.7, like_share: 0.9, keywords: ["ownership"] },
      { cluster_key: 8, size_share: 0.15, like_share: 0.05, keywords: ["general"] }
    ],
    metrics: {
      n_clusters: 2,
      dominance_ratio_top1: 0.7,
      gini_like_share: 0.1
    },
    evidence: [
      { cluster_key: 7, comments: [{ comment_id: "b-1", text: "dominant ownership", like_count: 8 }] },
      { cluster_key: 8, comments: [{ comment_id: "b-2", text: "tiny aside", like_count: 1 }] }
    ]
  });

  const leftSummaries = compareViewTestables.buildClusterSummaries(
    session.items[0]!.latestCapture!.analysis!,
    5,
    4,
    "cap-a"
  );
  const rightSummaries = compareViewTestables.buildClusterSummaries(
    session.items[1]!.latestCapture!.analysis!,
    5,
    4,
    "cap-b"
  );

  assert.equal(leftSummaries.length, 1);
  assert.equal(rightSummaries.length, 1);
  assert.equal(compareViewTestables.visibleClusterCountLabel(leftSummaries.length), "Showing 1 dominant cluster");
  assert.equal(
    compareViewTestables.hiddenClusterCountLabel(compareViewTestables.analysisMetrics(session.items[0]!.latestCapture!.analysis!).nClusters, leftSummaries.length),
    "1 additional low-signal clusters hidden"
  );
  assert.equal(
    compareViewTestables.hiddenClusterCountLabel(compareViewTestables.analysisMetrics(session.items[1]!.latestCapture!.analysis!).nClusters, rightSummaries.length),
    "1 additional low-signal clusters hidden"
  );
  assert.doesNotMatch(leftSummaries[0]!.evidence.map((item) => item.text).join(" "), /one-off reply/);
  assert.doesNotMatch(rightSummaries[0]!.evidence.map((item) => item.text).join(" "), /tiny aside/);
});

test("CompareView derives hidden cluster copy from the cluster array, not stale metrics.n_clusters", () => {
  const session = buildSession();
  session.items[0]!.latestCapture = buildCapture("cap-a", "ownership", "ownership matters", {
    source_comment_count: 6,
    clusters: [
      { cluster_key: 0, size_share: 0.7, like_share: 0.9, keywords: ["ownership"] },
      { cluster_key: 1, size_share: 0.15, like_share: 0.05, keywords: ["general"] }
    ],
    metrics: {
      n_clusters: 45,
      dominance_ratio_top1: 0.7,
      gini_like_share: 0.1
    },
    evidence: [
      { cluster_key: 0, comments: [{ comment_id: "a-1", text: "dominant support", like_count: 9 }] },
      { cluster_key: 1, comments: [{ comment_id: "a-2", text: "one-off reply", like_count: 1 }] }
    ]
  });
  session.items[1]!.latestCapture = buildCapture("cap-b", "ownership", "ownership matters");

  const summaries = compareViewTestables.buildClusterSummaries(
    session.items[0]!.latestCapture!.analysis!,
    5,
    4,
    "cap-a"
  );
  const visibleCount = summaries.length;
  const hiddenLabel = compareViewTestables.hiddenClusterCountLabel(
    compareViewTestables.analysisMetrics(session.items[0]!.latestCapture!.analysis!).nClusters,
    visibleCount
  );

  assert.equal(compareViewTestables.visibleClusterCountLabel(visibleCount), "Showing 1 dominant cluster");
  assert.equal(hiddenLabel, "1 additional low-signal clusters hidden");
  assert.notEqual(hiddenLabel, "44 additional low-signal clusters hidden");
});

// The selected detail panel now stays on semantic cluster titles and no longer surfaces the legacy 群組 A/B related-cluster copy.
test("CompareView keeps selected detail copy on semantic cluster labels", () => {
  const session = buildSession();
  session.items[0]!.latestCapture = buildCapture("cap-a", "ownership", "ownership matters");
  session.items[1]!.latestCapture = buildCapture("cap-b", "ownership", "ownership feels missing");

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session,
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /ownership/);
  assert.doesNotMatch(html, /群組 A/);
  assert.doesNotMatch(html, /群組 B/);
  assert.doesNotMatch(html, /Related cluster on Post B/);
  assert.doesNotMatch(html, /not a hard stance classifier/i);
});

test("CompareView promotes why-matters copy over support metric pills on the first screen", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /為什麼重要/);
  // DictionaryCard compact mode: 剖析 block absent when no AI annotations present
  assert.doesNotMatch(html, /剖析/);
  assert.doesNotMatch(html, />Captured</);
  assert.doesNotMatch(html, />Replies</);
});

test("ResultWhyCard renders both side readings when brief includes A and B readings", () => {
  const html = renderToStaticMarkup(
    React.createElement(compareViewTestables.ResultWhyCard, {
      brief: {
        source: "ai",
        relation: "A 跟 B 在責任歸因上分叉。",
        headline: "兩邊留言走向不同",
        supportingObservations: [],
        aReading: "A 端把事件讀成服務失誤。",
        bReading: "B 端把事件讀成品牌信任問題。",
        whyItMatters: "同一事件會導向不同回應策略。",
        creatorCue: "先分清楚要回應操作問題還是信任問題。",
        confidence: "medium",
        keywords: []
      }
    })
  );

  assert.match(html, /A 端把事件讀成服務失誤/);
  assert.match(html, /B 端把事件讀成品牌信任問題/);
});

test("annotation request key helper resets when request disappears", () => {
  const request = {
    quotes: [
      {
        commentId: "c2",
        side: "B" as const,
        postAuthor: "beta",
        postText: "post b",
        clusterLabel: "harmful",
        clusterObservation: "B observation",
        quoteText: "quote b",
        likeCount: 2
      },
      {
        commentId: "c1",
        side: "A" as const,
        postAuthor: "alpha",
        postText: "post a",
        clusterLabel: "support",
        clusterObservation: "A observation",
        quoteText: "quote a",
        likeCount: 1
      }
    ]
  };

  assert.equal(compareViewTestables.resolveAnnotationRequestKey(null, request).shouldRequest, true);
  assert.equal(compareViewTestables.resolveAnnotationRequestKey("c1|c2", request).shouldRequest, false);
  assert.deepEqual(compareViewTestables.resolveAnnotationRequestKey("c1|c2", null), {
    requestKey: null,
    shouldRequest: false
  });
});

test("CompareView frames primary evidence as receipts before interpretation", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /代表性原文/);
  // DictionaryCard compact mode: 剖析 block absent when no AI annotations present
  assert.doesNotMatch(html, /剖析/);
  assert.match(html, /為什麼重要/);
  assert.ok(html.indexOf("代表性原文") < html.indexOf("為什麼重要"));
  assert.doesNotMatch(html, /text-transform:uppercase/);
});

test("CompareView places primary evidence ahead of support data", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  const evidenceIndex = html.indexOf("代表性原文");
  const trustIndex = html.indexOf("驗證數據");

  assert.ok(evidenceIndex >= 0);
  assert.ok(trustIndex >= 0);
  assert.ok(evidenceIndex < trustIndex);
});

test("CompareView keeps evidence cards collapsed by default", () => {
  const session = buildSession();
  session.items[0]!.latestCapture = buildCapture("cap-a", "support", "support this policy", {
    evidence: [
      {
        cluster_key: 0,
        comments: [
          { comment_id: "c-top", text: "top evidence stays visible inside the selected dock", like_count: 9 },
          { comment_id: "c-collapsed", text: "collapsed summary should not expose the full detailed audience evidence text by default", like_count: 4 }
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

  assert.match(html, /top evidence stays visible inside the selected dock/);
  // DictionaryCard compact mode: 剖析 block and empty-state copy are not
  // rendered when annotation is absent. SelectedClusterDetailPanel only renders
  // EvidenceReasonRow after user selects a cluster, so it does not appear here.
  assert.doesNotMatch(html, /尚未個別分析此留言/);
  assert.doesNotMatch(html, /剖析/);
  assert.doesNotMatch(html, /像這則留言強化了/);
});

test("CompareView selected cluster detail does not fabricate per-quote evidence prose", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  // EvidenceReasonRow (SelectedClusterDetailPanel) only renders after user
  // selects a cluster — not in the default static render. DictionaryCard
  // compact mode removes the italic fallback entirely, so this string is absent.
  assert.doesNotMatch(html, /尚未個別分析此留言/);
  assert.doesNotMatch(html, /支撐這個群組/);
  assert.doesNotMatch(html, /講得像同一路線的延伸/);
});

test("DictionaryCard renders full card when analysis and effectiveness are both present", () => {
  const html = renderToStaticMarkup(
    React.createElement(compareViewTestables.DictionaryCard, {
      rank: 1,
      handle: "testuser",
      quote: "representative evidence text",
      side: "A" as const,
      marks: [],
      analysis: "this is the writer meaning analysis",
      effectiveness: {
        discussionFunction: "discussion function text",
        relationToCluster: "relation to cluster text",
        whyEffective: "why effective text"
      }
    })
  );
  assert.match(html, /representative evidence text/);
  assert.match(html, /剖析/);
  assert.match(html, /this is the writer meaning analysis/);
  assert.match(html, /為什麼被挑出來/);
});

test("DictionaryCard compound effectiveness shows 為什麼被挑出來 label when effectiveness present", () => {
  const html = renderToStaticMarkup(
    React.createElement(compareViewTestables.DictionaryCard, {
      rank: 1,
      handle: "user",
      quote: "quote",
      side: "B" as const,
      marks: [],
      analysis: "writer meaning",
      effectiveness: {
        discussionFunction: "plays anchor role in thread",
        relationToCluster: "extends main cluster thesis",
        whyEffective: "rhetorical contrast amplifies point"
      }
    })
  );
  // Expander button always renders in initial (collapsed) state
  assert.match(html, /為什麼被挑出來/);
  assert.doesNotMatch(html, /為什麼有效/);
});

test("CompareView uses visibly different bubble sizes for multi-cluster navigators", () => {
  const session = buildSession();
  session.items[1]!.latestCapture = buildCapture("cap-b", "ownership", "ownership matters", {
    clusters: [
      { cluster_key: 1, size_share: 0.48, like_share: 0.52, keywords: ["ownership"] },
      { cluster_key: 2, size_share: 0.27, like_share: 0.28, keywords: ["culture"] },
      { cluster_key: 3, size_share: 0.14, like_share: 0.1, keywords: ["minor"] }
    ],
    evidence: [
      { cluster_key: 1, comments: [{ comment_id: "b-1", text: "ownership cluster", like_count: 8 }] },
      { cluster_key: 2, comments: [{ comment_id: "b-2", text: "culture cluster", like_count: 5 }] },
      { cluster_key: 3, comments: [{ comment_id: "b-3", text: "minor cluster", like_count: 2 }] }
    ],
    metrics: {
      n_clusters: 3,
      dominance_ratio_top1: 0.48,
      gini_like_share: 0.2
    }
  });

  const summaries = compareViewTestables.buildClusterSummaries(
    session.items[1]!.latestCapture!.analysis!,
    5,
    4,
    "cap-b"
  );
  const surfaces = summaries.map((summary) =>
    compareViewTestables.resolveClusterSurface(summary, "right", new Map(), new Map())
  );
  const widths = compareViewTestables.layoutClusterMapNodes(surfaces).map((node) => node.r);
  assert.equal(widths.length, 2);
  assert.ok(new Set(widths).size >= 2);
});

test("CompareView shows semantic cluster labels inside bubble hover previews", () => {
  const html = renderToStaticMarkup(
    React.createElement(compareViewTestables.ClusterBubbleMap, {
      side: "right",
      label: "Post B clusters",
      nodes: [
        {
          captureId: "cap-b",
          clusterKey: 1,
          title: "ownership",
          sizeShare: 0.48,
          supportCount: 5,
          likeShare: 0.52,
          x: 34,
          y: 48,
          r: 42,
          toneVariant: "primary",
          isMinorBucket: false
        }
      ],
      countLabel: "Showing 1 dominant cluster",
      hiddenLabel: null,
      selectedKey: null,
      hoveredKey: "cap-b:1",
      onHover: () => {},
      onLeave: () => {},
      onSelect: () => {}
    })
  );

  assert.match(html, /ownership · 48%/);
  assert.match(html, />48%<\/span>/);
  assert.match(html, /5 comments/);
  assert.doesNotMatch(html, /48% replies · 5 comments/);
});

test("CompareView keeps bubble maps behind support data instead of the hero", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /驗證數據/);
  assert.doesNotMatch(html, /叢集分佈圖/);
  assert.ok(html.indexOf("代表性原文") < html.indexOf("驗證數據"));
});

test("CompareView keeps section anchors while deferring cluster jump targets until support data opens", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /留言區聲量結構/);
  assert.match(html, /代表性原文/);
  assert.doesNotMatch(html, /data-jump-target="dlens-selected-cluster-a"/);
  assert.doesNotMatch(html, /data-jump-target="dlens-selected-cluster-b"/);
});

test("CompareView explains alignment as a readable proxy instead of a hard classifier", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /共鳴放大型|分歧探索型|張力並存型/);
  assert.doesNotMatch(html, /not a hard stance classifier/i);
});

test("CompareView shows a small inline AI notice and keeps the fallback hero summary when no key is configured", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /AI summaries are off\. Add a Google, OpenAI, or Claude key in Settings to enable them\./);
  assert.match(html, /共鳴放大型|分歧探索型|張力並存型/);
  assert.match(html, /AI Brief/);
});

test("CompareView renders a compact judgment hero without risk chips", () => {
  const settings = createDefaultSettings();
  settings.googleApiKey = "AIza-test";

  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings
    })
  );

  assert.match(html, /共鳴放大型|分歧探索型|張力並存型/);
  assert.match(html, /AI Brief/);
  assert.doesNotMatch(html, /Representative evidence/i);
  assert.doesNotMatch(html, /Compare brief/i);
  assert.doesNotMatch(html, /data-risk-signals="subtle"/);
});

test("CompareView renders an editorial relation line and confidence stamp in the hero", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /同一議題都能聚攏反應/);
  assert.match(html, /A 收向support，B 則帶往harmful/);
  assert.match(html, /AI Brief|CONF|confidence|medium/i);
});

test("CompareView keeps result prose blocks wrap-safe inside the popup measure", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /word-break:break-word/);
});

test("CompareView uses lighter section anchors instead of uppercase chrome", () => {
  const html = renderToStaticMarkup(
    React.createElement(CompareView, {
      session: buildSession(),
      settings: createDefaultSettings()
    })
  );

  assert.match(html, /留言區聲量結構/);
  assert.match(html, /代表性原文/);
  assert.match(html, /為什麼重要/);
  assert.doesNotMatch(html, /text-transform:uppercase/);
});

test("CompareView uses 12px/600 label typography for section anchors", () => {
  const sectionHtml = renderToStaticMarkup(
    React.createElement(compareViewTestables.SectionLabel, { color: "#172033" }, "Receipts")
  );
  const headerHtml = renderToStaticMarkup(
    React.createElement(compareViewTestables.PostHeader, {
      post: {
        author: "alpha",
        text: "post cap-a",
        metrics: { comments: 5 },
        metricPresent: { likes: true, comments: true, reposts: true, forwards: true, views: true },
        postedAt: "2026-03-24T07:22:21.000Z",
        timeTokenHint: "1h"
      },
      label: "Post A",
      color: "rgba(79,70,229,0.07)",
      borderColor: "rgba(99,102,241,0.18)",
      commentCount: 5
    })
  );

  assert.match(sectionHtml, /font-size:12px;font-weight:600[^>]*letter-spacing:0\.02em[^>]*>Receipts</);
  assert.match(headerHtml, /font-size:12px;font-weight:600[^>]*letter-spacing:0\.02em[^>]*>Post A</);
  assert.doesNotMatch(sectionHtml, /text-transform:uppercase/);
  assert.doesNotMatch(headerHtml, /text-transform:uppercase/);
  assert.doesNotMatch(sectionHtml, /letter-spacing:0\.06em/);
  assert.doesNotMatch(headerHtml, /letter-spacing:0\.06em/);
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
