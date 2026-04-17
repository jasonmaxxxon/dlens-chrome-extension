import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SessionProcessingSummary, WorkerStatus } from "../src/state/processing-state.ts";
import type { SessionItem, SessionRecord, TechniqueReadingSnapshot } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { LibraryView } from "../src/ui/LibraryView.tsx";

function buildSession(): SessionRecord {
  const session = createSessionRecord("Signals", "2026-03-24T07:00:00.000Z");
  session.items.push(
    createSessionItem(
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
    )
  );
  return session;
}

function buildPreparationSession(): SessionRecord {
  const session = createSessionRecord("Signals", "2026-03-24T07:00:00.000Z");
  const ready = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@alpha/post/ready",
      post_url: "https://www.threads.net/@alpha/post/ready",
      author_hint: "ready-author",
      text_snippet: "ready item",
      time_token_hint: "1h",
      dom_anchor: "card-ready",
      engagement: { likes: 10, comments: 5, reposts: 1, forwards: 0, views: 100 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  ready.status = "succeeded";
  ready.latestCapture = {
    id: "cap-ready",
    source_type: "threads",
    capture_type: "post",
    source_page_url: ready.descriptor.page_url,
    source_post_url: ready.descriptor.post_url,
    canonical_target_url: ready.descriptor.post_url,
    author_hint: ready.descriptor.author_hint,
    text_snippet: ready.descriptor.text_snippet,
    time_token_hint: ready.descriptor.time_token_hint,
    dom_anchor: ready.descriptor.dom_anchor,
    engagement: {},
    client_context: {},
    raw_payload: {},
    ingestion_status: "succeeded",
    captured_at: "2026-03-24T07:22:21.000Z",
    created_at: "2026-03-24T07:22:21.000Z",
    updated_at: "2026-03-24T07:22:21.000Z",
    job: null,
    result: null,
    analysis: {
      id: "analysis-ready",
      capture_id: "cap-ready",
      status: "succeeded",
      stage: "final",
      analysis_version: "v1",
      source_comment_count: 10,
      clusters: [],
      evidence: [],
      metrics: {},
      generated_at: null,
      last_error: null,
      created_at: "2026-03-24T07:22:21.000Z",
      updated_at: "2026-03-24T07:22:21.000Z"
    }
  };

  const analyzing = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@alpha/post/analyzing",
      post_url: "https://www.threads.net/@alpha/post/analyzing",
      author_hint: "analysis-author",
      text_snippet: "analysis item",
      time_token_hint: "2h",
      dom_anchor: "card-analyzing",
      engagement: { likes: 8, comments: 2, reposts: 0, forwards: 0, views: 80 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  analyzing.status = "succeeded";
  analyzing.latestCapture = {
    ...ready.latestCapture!,
    id: "cap-analyzing",
    capture_id: undefined as never,
    source_page_url: analyzing.descriptor.page_url,
    source_post_url: analyzing.descriptor.post_url,
    canonical_target_url: analyzing.descriptor.post_url,
    author_hint: analyzing.descriptor.author_hint,
    text_snippet: analyzing.descriptor.text_snippet,
    dom_anchor: analyzing.descriptor.dom_anchor,
    analysis: {
      ...ready.latestCapture!.analysis!,
      id: "analysis-analyzing",
      capture_id: "cap-analyzing",
      status: "running"
    }
  };

  const queued = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@alpha/post/queued",
      post_url: "https://www.threads.net/@alpha/post/queued",
      author_hint: "queued-author",
      text_snippet: "queued item",
      time_token_hint: "3h",
      dom_anchor: "card-queued",
      engagement: { likes: 4, comments: 1, reposts: 0, forwards: 0, views: 20 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  queued.status = "queued";

  const saved = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@alpha/post/saved",
      post_url: "https://www.threads.net/@alpha/post/saved",
      author_hint: "saved-author",
      text_snippet: "saved item",
      time_token_hint: "4h",
      dom_anchor: "card-saved",
      engagement: { likes: 2, comments: 0, reposts: 0, forwards: 0, views: 10 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  saved.status = "saved";

  session.items.push(ready, analyzing, queued, saved);
  return session;
}

test("LibraryView renders a casebook section with saved technique reading cards", () => {
  const session = buildSession();
  const summary: SessionProcessingSummary = {
    total: 1,
    ready: 1,
    crawling: 0,
    analyzing: 0,
    pending: 0,
    failed: 0,
    hasReadyPair: false,
    hasInflight: false
  };
  const techniqueReadings: TechniqueReadingSnapshot[] = [
    {
      id: "reading-1",
      sessionId: "session-1",
      itemId: "item-1",
      side: "A",
      clusterKey: "cap-a:0",
      clusterTitle: "Support cluster",
      thesis: "Audience keeps reframing the thread as practical rather than controversial.",
      techniques: [
        { key: "deflection", title: "焦點轉移", summary: "把討論帶去較安全的旁支話題。", whyItMatters: "可能讓原本的指控被稀釋。", alias: "Deflection" },
        { key: "fear-framing", title: "恐懼框架", summary: "用風險與損害語言拉高情緒反應。", whyItMatters: "容易放大讀者的威脅感。", alias: "Fear framing" },
        { key: "normalization", title: "常態化", summary: "把某種立場說成已經是常識。", whyItMatters: "會降低讀者對爭議性的警覺。", alias: "Normalization" },
        { key: "echo", title: "回聲放大", summary: "重複同一反應模式，幾乎沒有新增論點。", whyItMatters: "可能代表留言場正在快速同質化。", alias: "Echo" },
        { key: "narrative-shift", title: "敘事轉向", summary: "把討論重心改寫到另一個議題。", whyItMatters: "會改變大家以什麼角度理解事件。", alias: "Narrative shift" }
      ],
      evidence: [
        { commentId: "c-1", author: "u1", text: "this is useful", likes: 4, comments: 1, reposts: 0, forwards: 0 },
        { commentId: "c-2", author: "u2", text: "keep it practical", likes: 3, comments: 0, reposts: 0, forwards: 0 }
      ],
      savedAt: "2026-04-04T10:32:00.000Z"
    }
  ];

  const html = renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem: session.items[0] as SessionItem,
      optimisticQueuedIds: [],
      workerStatus: "idle" as WorkerStatus | null,
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
      techniqueReadings,
      initialSection: "casebook"
    })
  );

  assert.match(html, /Casebook/);
  assert.match(html, /data-casebook-section="visible"/);
  assert.match(html, /data-technique-card="reading-1"/);
  assert.match(html, /Support cluster/);
  assert.match(html, /Audience keeps reframing the thread as practical rather than controversial\./);
  assert.match(html, /焦點轉移/);
  assert.match(html, /恐懼框架/);
  assert.match(html, /2 evidence items/);
  assert.doesNotMatch(html, /Saved posts \(1\)/);
});

test("LibraryView prioritizes preparation zones above pending inventory", () => {
  const session = buildPreparationSession();
  const html = renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem: session.items[0] as SessionItem,
      optimisticQueuedIds: [],
      workerStatus: "idle" as WorkerStatus | null,
      isStartingProcessing: false,
      processAllLabel: "Process All",
      processingSummary: {
        total: 4,
        ready: 1,
        crawling: 1,
        analyzing: 1,
        pending: 1,
        failed: 0,
        hasReadyPair: false,
        hasInflight: true
      },
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

  assert.match(html, /data-library-zone="ready"/);
  assert.match(html, /data-library-zone="near-ready"/);
  assert.match(html, /data-library-zone="in-progress"/);
  assert.match(html, /data-library-zone="inventory"/);
  assert.match(html, /data-library-table="ready"/);
  assert.match(html, /data-library-table="near-ready"/);
  assert.match(html, /data-library-table="in-progress"/);
  assert.match(html, /data-library-table="inventory"/);
  assert.match(html, /Ready now/);
  assert.match(html, /Almost ready/);
  assert.match(html, /Moving/);
  assert.match(html, /Later/);
  assert.doesNotMatch(html, /Ready to compare/);
  assert.doesNotMatch(html, /Analyzing now/);
});

test("LibraryView hides empty preparation zones instead of rendering empty panels", () => {
  const session = createSessionRecord("Signals", "2026-03-24T07:00:00.000Z");
  const ready = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@alpha/post/ready-only",
      post_url: "https://www.threads.net/@alpha/post/ready-only",
      author_hint: "ready-only",
      text_snippet: "ready only item",
      time_token_hint: "1h",
      dom_anchor: "card-ready-only",
      engagement: { likes: 10, comments: 5, reposts: 1, forwards: 0, views: 100 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-03-24T07:22:21.000Z"
    },
    "2026-03-24T07:22:21.000Z"
  );
  ready.status = "succeeded";
  ready.latestCapture = {
    id: "cap-ready-only",
    source_type: "threads",
    capture_type: "post",
    source_page_url: ready.descriptor.page_url,
    source_post_url: ready.descriptor.post_url,
    canonical_target_url: ready.descriptor.post_url,
    author_hint: ready.descriptor.author_hint,
    text_snippet: ready.descriptor.text_snippet,
    time_token_hint: ready.descriptor.time_token_hint,
    dom_anchor: ready.descriptor.dom_anchor,
    engagement: {},
    client_context: {},
    raw_payload: {},
    ingestion_status: "succeeded",
    captured_at: "2026-03-24T07:22:21.000Z",
    created_at: "2026-03-24T07:22:21.000Z",
    updated_at: "2026-03-24T07:22:21.000Z",
    job: null,
    result: null,
    analysis: {
      id: "analysis-ready-only",
      capture_id: "cap-ready-only",
      status: "succeeded",
      stage: "final",
      analysis_version: "v1",
      source_comment_count: 10,
      clusters: [],
      evidence: [],
      metrics: {},
      generated_at: null,
      last_error: null,
      created_at: "2026-03-24T07:22:21.000Z",
      updated_at: "2026-03-24T07:22:21.000Z"
    }
  };
  session.items.push(ready);

  const html = renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem: ready,
      optimisticQueuedIds: [],
      workerStatus: "idle" as WorkerStatus | null,
      isStartingProcessing: false,
      processAllLabel: "Process All",
      processingSummary: {
        total: 1,
        ready: 1,
        crawling: 0,
        analyzing: 0,
        pending: 0,
        failed: 0,
        hasReadyPair: false,
        hasInflight: false
      },
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

  assert.match(html, /data-library-zone="ready"/);
  assert.match(html, /data-library-table="ready"/);
  assert.doesNotMatch(html, /data-library-zone="near-ready"/);
  assert.doesNotMatch(html, /data-library-zone="in-progress"/);
  assert.doesNotMatch(html, /data-library-zone="inventory"/);
  assert.doesNotMatch(html, /Analyzing now/);
  assert.doesNotMatch(html, /Still moving/);
  assert.doesNotMatch(html, /Saved inventory/);
});

test("LibraryView exposes compare affordance and keeps folder context secondary", () => {
  const session = buildPreparationSession();
  const html = renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem: session.items[0] as SessionItem,
      optimisticQueuedIds: [],
      workerStatus: "idle" as WorkerStatus | null,
      isStartingProcessing: false,
      processAllLabel: "Process All",
      processingSummary: {
        total: 4,
        ready: 1,
        crawling: 1,
        analyzing: 1,
        pending: 1,
        failed: 0,
        hasReadyPair: false,
        hasInflight: true
      },
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

  assert.match(html, /data-library-folder-context="secondary"/);
  assert.match(html, /Use in Compare|Open in Compare/);
  assert.match(html, /data-library-row-action="compare"/);
});
