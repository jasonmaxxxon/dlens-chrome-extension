import assert from "node:assert/strict";
import test from "node:test";

import type { AnalysisSnapshot, CaptureSnapshot } from "../src/contracts/ingest.ts";
import type { CompareBrief } from "../src/compare/brief.ts";
import { buildCompareViewModel } from "../src/viewmodel/compare.ts";
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
  const itemQueued = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@queued/post/q",
      post_url: "https://www.threads.net/@queued/post/q",
      author_hint: "queued",
      text_snippet: "Q",
      time_token_hint: "1h",
      dom_anchor: "card-q",
      engagement: {},
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  const itemFailed = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@failed/post/f",
      post_url: "https://www.threads.net/@failed/post/f",
      author_hint: "failed",
      text_snippet: "F",
      time_token_hint: "1h",
      dom_anchor: "card-f",
      engagement: {},
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );

  itemA.status = "succeeded";
  itemB.status = "succeeded";
  itemQueued.status = "queued";
  itemFailed.status = "failed";
  itemA.captureId = "cap-a";
  itemB.captureId = "cap-b";
  itemA.latestCapture = buildCapture("cap-a", "support", "support this policy");
  itemB.latestCapture = buildCapture("cap-b", "harmful", "this is terrible");
  session.items.push(itemQueued, itemFailed, itemB, itemA);
  return session;
}

function settingsWithProvider(): ExtensionSettings {
  return {
    ...createDefaultSettings(),
    oneLinerProvider: "google",
    googleApiKey: "test-key"
  };
}

function makeBrief(source: CompareBrief["source"]): CompareBrief {
  return {
    source,
    headline: source === "ai" ? "AI headline" : "Fallback headline",
    relation: "A and B diverge",
    supportingObservations: [],
    aReading: "A reading",
    bReading: "B reading",
    whyItMatters: "It changes the creator decision.",
    creatorCue: "Use A for proof and B for risk.",
    keywords: ["proof", "risk", "decision"],
    audienceAlignmentLeft: "Align",
    audienceAlignmentRight: "Oppose",
    confidence: "medium"
  };
}

test("Compare VM absorbs readiness counts and A/B selection from the session snapshot", () => {
  const session = buildSession();
  const vm = buildCompareViewModel({
    session,
    settings: createDefaultSettings(),
    selectedAId: "",
    selectedBId: ""
  });

  assert.equal(vm.sessionId, session.id);
  assert.equal(vm.availability.ready, true);
  assert.equal(vm.readiness.readyCount, 2);
  assert.equal(vm.readiness.inflightCount, 1);
  assert.equal(vm.readiness.failedCount, 1);
  assert.deepEqual(vm.readyItemOptions.map((item) => item.id), [session.items[2]!.id, session.items[3]!.id]);
  assert.equal(vm.selection.itemA?.id, session.items[2]!.id);
  assert.equal(vm.selection.itemB?.id, session.items[3]!.id);
  assert.equal(vm.actions.some((action) => action.kind === "fetchBrief"), false);
});

test("Compare VM composes async fetched brief state with AI provenance", () => {
  const vm = buildCompareViewModel({
    session: buildSession(),
    settings: settingsWithProvider(),
    fetched: {
      briefState: "ready",
      brief: makeBrief("ai"),
      clusterInterpretations: [],
      evidenceAnnotations: []
    }
  });

  assert.equal(vm.brief.state, "ready");
  assert.equal(vm.brief.loadState, "ready");
  assert.equal(vm.brief.provenance, "ai");
  assert.equal(vm.brief.provenanceLabel, "AI 生成");
  assert.equal(vm.brief.derivedRecord.state, "fresh");
  assert.equal(vm.brief.visibleBrief?.headline, "AI headline");
  assert.equal(vm.actions.some((action) => action.kind === "fetchBrief"), true);
});

test("Compare VM keeps fallback provenance explicit for fetched fallback records", () => {
  const vm = buildCompareViewModel({
    session: buildSession(),
    settings: settingsWithProvider(),
    fetched: {
      briefState: "fallback",
      brief: makeBrief("fallback"),
      clusterInterpretations: [],
      evidenceAnnotations: []
    }
  });

  assert.equal(vm.brief.state, "fallback");
  assert.equal(vm.brief.loadState, "ready");
  assert.equal(vm.brief.provenance, "fallback");
  assert.equal(vm.brief.provenanceLabel, "本機 fallback");
  assert.equal(vm.brief.visibleBrief?.headline, "Fallback headline");
});

test("Compare VM exposes local fallback while async brief is idle or loading", () => {
  for (const briefState of ["idle", "loading"] as const) {
    const vm = buildCompareViewModel({
      session: buildSession(),
      settings: settingsWithProvider(),
      fetched: {
        briefState,
        brief: null,
        clusterInterpretations: [],
        evidenceAnnotations: []
      }
    });

    assert.equal(vm.brief.state, briefState);
    assert.equal(vm.brief.provenance, "fallback");
    assert.equal(vm.brief.visibleBrief?.source, "fallback");
    assert.equal(vm.brief.loadState, briefState === "loading" ? "loading" : "ready");
  }
});
