import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SessionProcessingSummary, WorkerStatus } from "../src/state/processing-state.ts";
import { preservePopupWorkspaceMode } from "../src/state/processing-state.ts";
import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import type { SessionItem, SessionRecord } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { CollectView } from "../src/ui/CollectView.tsx";
import { LibraryView } from "../src/ui/LibraryView.tsx";
import { SettingsView } from "../src/ui/SettingsView.tsx";

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
      renderMetrics: () => null
    })
  );

  assert.match(html, /Process All/);
  assert.match(html, /Saved items are waiting for Process All/);
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
  assert.match(html, /Hover to preview\. Press S to save\. Press Esc to exit\./);
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

  assert.match(html, /Collector settings/);
  assert.match(html, /Google API key/);
  assert.match(html, /Save settings/);
});
