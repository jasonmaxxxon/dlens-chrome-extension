import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SessionProcessingSummary, WorkerStatus } from "../src/state/processing-state.ts";
import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import type { SessionItem, SessionRecord } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { preservePopupWorkspaceMode } from "../src/state/processing-state.ts";
import { CollectView } from "../src/ui/CollectView.tsx";
import { LibraryView } from "../src/ui/LibraryView.tsx";
import { SettingsView } from "../src/ui/SettingsView.tsx";
import { surfaceCardStyle } from "../src/ui/components.tsx";
import { tokens } from "../src/ui/tokens.ts";

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

function buildDescriptor(): TargetDescriptor {
  return {
    target_type: "post",
    page_url: "https://www.threads.net/@alpha/post/a",
    post_url: "https://www.threads.net/@alpha/post/a",
    author_hint: "alpha",
    text_snippet: "A short snippet from the hovered post.",
    time_token_hint: "1h",
    dom_anchor: "card-a",
    engagement: { likes: 10, comments: 5, reposts: 1, forwards: 0, views: 100 },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
    captured_at: "2026-03-24T07:22:21.000Z"
  };
}

function buildComments(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `comment-${index + 1}`,
    author: `comment-${String(index + 1).padStart(2, "0")}`,
    text: `comment body ${index + 1}`,
    likeCount: index
  }));
}

test("surfaceCardStyle uses stronger white glass defaults", () => {
  const style = surfaceCardStyle();

  assert.equal(
    style.background,
    `linear-gradient(180deg, rgba(255,255,255,0.995), ${tokens.color.glassBg})`
  );
  assert.equal(style.border, `1px solid ${tokens.color.glassBorder}`);
  assert.match(String(style.boxShadow), /inset 0 1px 0 rgba\(255,255,255,0\.82\)/);
});

test("LibraryView keeps Process All visible without a selected item", () => {
  const session = buildSession();
  const summary: SessionProcessingSummary = {
    total: 1,
    ready: 0,
    crawling: 0,
    analyzing: 0,
    pending: 1,
    failed: 0,
    hasReadyPair: false,
    hasInflight: false
  };

  const html = renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem: null as SessionItem | null,
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
      techniqueReadings: [],
      initialSection: "posts"
    })
  );

  assert.match(html, /Process All/);
  assert.match(html, /Saved items waiting for Process All\./);
});

test("LibraryView exposes item phase and progress rail outlets for active work", () => {
  const session = buildSession();
  session.items[0]!.status = "queued";
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

  assert.match(html, /data-item-phase="crawling"/);
  assert.match(html, /data-progress-rail="running"/);
  assert.match(html, /data-selected-progress-mode="crawling"/);
});

test("LibraryView caps raw comments at 10 and labels truncated totals", () => {
  const session = buildSession();
  const activeItem = session.items[0]!;
  activeItem.status = "succeeded";
  activeItem.commentsPreview = buildComments(12);

  const html = renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem,
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

  assert.match(html, /Comments \(10\/12\)/);
  assert.equal((html.match(/comment-\d{2}/g) ?? []).length, 10);
  assert.ok(!html.includes("comment-11"));
  assert.ok(!html.includes("comment-12"));
});

test("LibraryView renders internal Posts / Casebook navigation", () => {
  const session = buildSession();
  const html = renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem: session.items[0]!,
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

  assert.match(html, /data-library-subpage="posts"/);
  assert.match(html, /data-library-subpage-button="posts"/);
  assert.match(html, /data-library-subpage-button="casebook"/);
});

test("CollectView keeps the preview card and collect toggle visible", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: buildDescriptor(),
      folderName: "Signals",
      isSaved: false,
      selectionMode: true,
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined
    })
  );

  assert.match(html, /Signals/);
  assert.match(html, /Exit collect mode/);
  assert.match(html, /save/);
  assert.match(html, /exit/);
});

test("popup workspace reopen path recomputes smart entry instead of stale mode", () => {
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

  assert.equal(
    preservePopupWorkspaceMode(summary, {
      popupOpen: true,
      entryLocked: false,
      currentMode: "compare"
    }),
    "library"
  );

  assert.equal(
    preservePopupWorkspaceMode(summary, {
      popupOpen: true,
      entryLocked: true,
      currentMode: "settings"
    }),
    "settings"
  );

  assert.equal(
    preservePopupWorkspaceMode(summary, {
      popupOpen: false,
      entryLocked: false,
      currentMode: "compare"
    }),
    "compare"
  );
});

test("SettingsView exposes Google provider and save action", () => {
  const html = renderToStaticMarkup(
    React.createElement(SettingsView, {
      draftBaseUrl: "http://127.0.0.1:8000",
      draftProvider: "google",
      draftOpenAiKey: "",
      draftClaudeKey: "",
      draftGoogleKey: "AIza-test",
      onDraftBaseUrlChange: () => undefined,
      onDraftProviderChange: () => undefined,
      onDraftOpenAiKeyChange: () => undefined,
      onDraftClaudeKeyChange: () => undefined,
      onDraftGoogleKeyChange: () => undefined,
      onSaveSettings: () => undefined
    })
  );

  assert.match(html, /Connection/);
  assert.match(html, /AI provider/);
  assert.match(html, /Save settings/);
});
