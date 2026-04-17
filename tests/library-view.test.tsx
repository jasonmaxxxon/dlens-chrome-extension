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

// Library now exposes Casebook as a collapsible header instead of the older always-open casebook card list.
test("LibraryView renders a collapsible casebook section when saved readings exist", () => {
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
  assert.match(html, /Casebook · 1 條筆記/);
  assert.doesNotMatch(html, /data-casebook-section=/);
  assert.doesNotMatch(html, /data-technique-card=/);
  assert.doesNotMatch(html, /Saved posts \(1\)/);
});

// The old preparation-zone tables were replaced by a single compact readiness bar plus row-level phase chips.
test("LibraryView summarizes mixed readiness work in the compact readiness bar", () => {
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

  assert.match(html, /Signals/);
  assert.match(html, /1 篇可以比較/);
  assert.match(html, /data-item-phase="ready"/);
  assert.match(html, /data-item-phase="analyzing"/);
  assert.match(html, /data-item-phase="crawling"/);
  assert.match(html, /data-item-phase="idle"/);
});

test("LibraryView omits legacy preparation zone chrome when only ready items exist", () => {
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

  assert.match(html, /1 篇可以比較/);
  assert.match(html, /data-item-phase="ready"/);
  assert.doesNotMatch(html, /data-library-zone=/);
  assert.doesNotMatch(html, /data-library-table=/);
});

test("LibraryView exposes compare affordance in the top bar and keeps legacy folder chrome out", () => {
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
        ready: 2,
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
      initialSection: "posts",
      onGoToCompare: () => undefined
    })
  );

  assert.match(html, /Compare →/);
  assert.match(html, /Signals/);
  assert.doesNotMatch(html, /data-library-folder-context=/);
  assert.doesNotMatch(html, /data-library-row-action="compare"/);
});
