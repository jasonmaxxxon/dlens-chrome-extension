import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildProductAgentTaskPromptHash } from "../src/compare/product-agent-task-feedback.ts";
import type { SessionProcessingSummary, WorkerStatus } from "../src/state/processing-state.ts";
import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import type { SavedAnalysisSnapshot, SessionItem, SessionRecord, TechniqueReadingSnapshot } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { CollectView } from "../src/ui/CollectView.tsx";
import { InPageCollectorFolderControls } from "../src/ui/InPageCollectorFolderControls.tsx";
import { LibraryView } from "../src/ui/LibraryView.tsx";
import { ProductSignalView, PRODUCT_SIGNAL_MOTION_CSS } from "../src/ui/ProductSignalViews.tsx";
import { SettingsView } from "../src/ui/SettingsView.tsx";
import {
  ModeRail,
  UtilityEdge,
  WorkspaceShell,
  surfaceCardStyle
} from "../src/ui/components.tsx";
import { modeThemeStyle, tokens } from "../src/ui/tokens.ts";

function buildSession(): SessionRecord {
  const session = createSessionRecord("Signals", "2026-03-24T07:00:00.000Z");
  const item = createSessionItem(
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
  item.status = "succeeded";
  item.latestCapture = {
    id: "cap-a",
    source_type: "threads",
    capture_type: "post",
    source_page_url: "https://www.threads.net/@alpha/post/a",
    source_post_url: "https://www.threads.net/@alpha/post/a",
    canonical_target_url: "https://www.threads.net/@alpha/post/a",
    author_hint: "alpha",
    text_snippet: "A",
    time_token_hint: "1h",
    dom_anchor: "card-a",
    engagement: {},
    client_context: {},
    raw_payload: {},
    ingestion_status: "succeeded",
    captured_at: "2026-03-24T07:22:21.000Z",
    created_at: "2026-03-24T07:22:21.000Z",
    updated_at: "2026-03-24T07:22:30.000Z",
    job: null,
    result: null,
    analysis: {
      id: "analysis-a",
      capture_id: "cap-a",
      status: "succeeded",
      stage: "final",
      analysis_version: "v1",
      source_comment_count: 10,
      clusters: [
        { cluster_key: 0, size_share: 0.6, like_share: 0.7, keywords: ["support", "policy", "budget"] }
      ],
      evidence: [],
      metrics: {},
      generated_at: "2026-03-24T07:22:30.000Z",
      last_error: null,
      created_at: "2026-03-24T07:22:30.000Z",
      updated_at: "2026-03-24T07:22:30.000Z"
    }
  };
  session.items.push(item);
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

function buildSavedAnalysis(): SavedAnalysisSnapshot {
  return {
    resultId: "result_123",
    compareKey: "item-a::item-b",
    itemAId: "item-a",
    itemBId: "item-b",
    sourceLabelA: "@openai_tw",
    sourceLabelB: "@tec_journalist",
    headline: "焦慮是主調，但理性聲音正在集結",
    deck: "兩篇貼文的留言區呈現截然不同的反應結構。",
    primaryTensionSummary: "A 群量大，B 群互動更高。",
    groupSummary: "3 群組",
    totalComments: 847,
    dateRangeLabel: "3/28–4/4",
    savedAt: "2026-04-13T13:00:00.000Z",
    analysisVersion: "v1",
    briefVersion: "v5",
    briefSource: "ai"
  };
}

function buildTechniqueReading(): TechniqueReadingSnapshot {
  return {
    id: "reading-1",
    sessionId: "session-1",
    itemId: "item-a",
    side: "A",
    clusterKey: "cap-a:0",
    clusterTitle: "Ownership",
    thesis: "Readers keep circling back to ownership and accountability.",
    techniques: [
      {
        key: "contrast",
        title: "Contrast framing",
        summary: "Frames the issue through explicit before/after contrast."
      }
    ],
    evidence: [],
    savedAt: "2026-04-13T13:00:00.000Z"
  };
}

test("surfaceCardStyle uses the editorial paper defaults", () => {
  const style = surfaceCardStyle();

  assert.equal(
    style.background,
    `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`
  );
  assert.equal(style.borderRadius, tokens.radius.card);
  assert.equal(style.border, `1px solid ${tokens.color.line}`);
  assert.equal(style.boxShadow, tokens.shadow.shell);
});

test("tokens keep the lighter Ming-style editorial direction", () => {
  assert.match(tokens.font.sans, /Noto Serif TC|Songti TC/);
  assert.match(tokens.font.serifCjk, /Noto Serif TC|Songti TC/);
  assert.equal(tokens.color.canvas, "#f7f4ec");
  assert.equal(tokens.color.surface, "#fbf8f1");
  assert.equal(tokens.color.elevated, "#fdfbf6");
  assert.equal(tokens.radius.card, 8);
  assert.equal(tokens.radius.lg, 12);
});

test("mode themes keep topic and product visually separate", () => {
  const topicStyle = modeThemeStyle("topic");
  const productStyle = modeThemeStyle("product");

  assert.equal(topicStyle["--dlens-mode-accent"], tokens.color.cyan);
  assert.notEqual(productStyle["--dlens-mode-accent"], topicStyle["--dlens-mode-accent"]);
  assert.match(topicStyle["--dlens-mode-hover-border-strong"], /63,90,59/);
  assert.match(productStyle["--dlens-mode-hover-border-strong"], /35,79,122/);
});

test("WorkspaceShell keeps the processing strip outside the primary mode rail", () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkspaceShell, {
      mode: "library",
      header: React.createElement(
        React.Fragment,
        null,
        React.createElement(ModeRail, {
          activeMode: "library",
          onSelect: () => undefined
        }),
        React.createElement(UtilityEdge, {
          active: false,
          onSelect: () => undefined
        })
      ),
      contextStrip: React.createElement("div", null, "Processing"),
      children: React.createElement("div", null, "Library body")
    })
  );

  const modeRailIndex = html.indexOf('data-mode-rail="primary"');
  const processingStripIndex = html.indexOf('data-shell-context-strip="processing"');
  const settingsIndex = html.indexOf("設定");

  assert.match(html, /data-workspace-shell="compare-first"/);
  assert.match(html, /data-shell-masthead="editorial"/);
  assert.match(html, /data-shell-header="workspace"/);
  assert.match(html, /data-shell-context-strip="processing"/);
  assert.match(html, /data-workspace-mode="library"/);
  assert.ok(modeRailIndex >= 0);
  assert.ok(processingStripIndex > modeRailIndex);
  assert.ok(settingsIndex > modeRailIndex);
});

// Library now uses a compact readiness bar instead of the older readiness-table support copy.
test("LibraryView keeps Process All visible inside the compact readiness bar", () => {
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
  assert.match(html, /1 篇等待處理/);
  assert.match(html, /Signals/);
  assert.match(html, /data-library-row="card"/);
});

test("LibraryView renders top-cluster keyword chips and removes the old fingerprint block", () => {
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

  assert.match(html, /support/);
  assert.match(html, /policy/);
  assert.match(html, /budget/);
  assert.match(html, /可比較/);
  assert.doesNotMatch(html, /data-library-fingerprint="bar"/);
});

test("LibraryView exposes item phase and pending skeleton outlets for active work", () => {
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
  assert.match(html, /data-library-row="card"/);
  assert.match(html, /data-library-card-skeleton="visible"/);
  assert.match(html, /crawling/);
});

// The Library home surface no longer renders raw comment preview tables after the three-page workspace split.
test("LibraryView no longer renders raw comments preview tables on the home surface", () => {
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

  assert.doesNotMatch(html, /Comments \(/);
  assert.doesNotMatch(html, /comment-01/);
  assert.doesNotMatch(html, /comment-11/);
});

test("LibraryView renders Casebook as a collapsible section when readings exist", () => {
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
      techniqueReadings: [buildTechniqueReading()],
      initialSection: "posts"
    })
  );

  assert.match(html, /Casebook · 1 條筆記/);
  assert.doesNotMatch(html, /data-library-subpage=/);
  assert.doesNotMatch(html, /data-library-subpage-button=/);
});

test("LibraryView renders a saved analyses section on the home surface", () => {
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
      savedAnalyses: [buildSavedAnalysis()],
      initialSection: "posts"
    })
  );

  assert.match(html, /Casebook · Snapshot/);
  assert.match(html, /焦慮是主調，但理性聲音正在集結/);
  assert.match(html, /@openai_tw/);
  assert.match(html, /@tec_journalist/);
  assert.match(html, /主要張力/);
  assert.match(html, /A 群量大，B 群互動更高/);
  assert.match(html, /OPEN · 進入比對 →/);
  assert.doesNotMatch(html, />3 群組</);
});

test("CollectView keeps the preview card and collect toggle visible with current Chinese copy", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: buildDescriptor(),
      folderName: "Signals",
      mode: "archive",
      isSaved: false,
      selectionMode: true,
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined
    })
  );

  assert.match(html, /data-mode-header="collect"/);
  assert.match(html, /指向 Threads 貼文即可預覽，按下存入資料庫。/);
  assert.doesNotMatch(html, /decision surface/);
  assert.match(html, /Signals/);
  assert.match(html, /預覽中/);
  assert.match(html, /儲存到資料庫/);
  assert.match(html, /收集模式：開啟/);
  assert.match(html, /關閉/);
});

test("CollectView uses product inbox language in product mode", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: buildDescriptor(),
      folderName: "Signals",
      mode: "product",
      isSaved: false,
      selectionMode: false,
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined
    })
  );

  assert.match(html, /加入產品訊號收件匣/);
  assert.match(html, /產品訊號收件匣/);
  assert.match(html, /加入產品訊號/);
  assert.doesNotMatch(html, /資料夾/);
});

test("Product mode workspace strip hides folder controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(InPageCollectorFolderControls, {
      app: {
        activeFolderMode: "product",
        activeFolder: { items: [] },
        signals: [],
        productSignalAnalyses: []
      } as any
    })
  );

  assert.match(html, /data-workspace-product-strip="compact"/);
  assert.match(html, /Product workspace/);
  assert.match(html, /不以資料夾分類/);
  assert.doesNotMatch(html, /Select a folder/);
  assert.doesNotMatch(html, /Rename folder/);
  assert.doesNotMatch(html, /Create folder/);
});

test("SettingsView exposes Google provider and save action", () => {
  const html = renderToStaticMarkup(
    React.createElement(SettingsView, {
      sessionMode: "product",
      canEditSessionMode: true,
      draftBaseUrl: "http://127.0.0.1:8000",
      draftProvider: "google",
      draftOpenAiKey: "",
      draftClaudeKey: "",
      draftGoogleKey: "AIza-test",
      draftProductProfile: {
        name: "DLens",
        category: "Creator analysis",
        audience: "Threads creators",
        contextText: "README context",
        contextFiles: [
          {
            id: "file_readme",
            name: "README.md",
            kind: "readme",
            importedAt: "2026-04-27T00:00:00.000Z",
            charCount: 14
          }
        ]
      },
      compiledProductContext: {
        productPromise: "DLens turns Threads posts into product decisions.",
        targetAudience: "Threads creators",
        agentRoles: ["collector", "analyst"],
        coreWorkflows: ["capture", "classify"],
        currentCapabilities: ["Chrome extension"],
        explicitConstraints: ["local-first"],
        nonGoals: ["native app"],
        preferredTechDirection: "extension first",
        evaluationCriteria: ["small experiment"],
        unknowns: ["mobile"],
        compiledAt: "2026-04-27T08:00:00.000Z",
        sourceFileIds: ["file_readme"],
        promptVersion: "v1"
      },
      settingsSaveStatus: {
        kind: "success",
        message: "Settings 已儲存，ProductContext 已編譯。"
      },
      onDraftBaseUrlChange: () => undefined,
      onDraftProviderChange: () => undefined,
      onDraftOpenAiKeyChange: () => undefined,
      onDraftClaudeKeyChange: () => undefined,
      onDraftGoogleKeyChange: () => undefined,
      onDraftProductProfileChange: () => undefined,
      onProductProfileSeedTextChange: () => undefined,
      onInitProductProfile: () => undefined,
      onSessionModeChange: () => undefined,
      onSaveSettings: () => undefined
    })
  );

  assert.match(html, /data-mode-header="settings"/);
  assert.match(html, /連線設定與 API 金鑰存於本機，不會上傳。/);
  assert.doesNotMatch(html, /field drawer/);
  assert.match(html, /data-settings-surface="drawer"/);
  assert.match(html, /data-settings-group="folder"/);
  assert.match(html, /data-settings-group="connection"/);
  assert.match(html, /data-settings-group="keys"/);
  assert.match(html, /data-settings-group="product"/);
  assert.match(html, /資料夾類型/);
  assert.match(html, /產品觀察（Product）/);
  assert.match(html, /Connection/);
  assert.match(html, /AI provider/);
  assert.match(html, /產品脈絡/);
  assert.match(html, /產品名稱/);
  assert.match(html, /類別/);
  assert.match(html, /目標受眾/);
  assert.match(html, /DLens/);
  assert.match(html, /Creator analysis/);
  assert.match(html, /Threads creators/);
  assert.match(html, /一鍵初始化/);
  assert.match(html, /取得建議/);
  assert.match(html, /產品文件/);
  assert.match(html, /data-product-context-source-card="readme"/);
  assert.match(html, /data-product-context-source-card="agents"/);
  assert.match(html, /data-product-context-source-card="ai-agents"/);
  assert.match(html, /匯入 README.md/);
  assert.match(html, /匯入 AGENTS.md/);
  assert.match(html, /匯入 AI agents 檔案/);
  assert.match(html, /README\.md 已載入/);
  assert.match(html, /AGENTS\.md 尚未載入/);
  assert.match(html, /AI agents 檔案\s*尚未載入/);
  assert.match(html, /readme · 14 chars/);
  assert.doesNotMatch(html, /data-product-context-file="loaded"/);
  assert.doesNotMatch(html, /README context/);
  assert.match(html, /1\/3 files/);
  assert.match(html, /系統理解/);
  assert.match(html, /DLens turns Threads posts into product decisions/);
  assert.match(html, /capture/);
  assert.match(html, /local-first/);
  assert.match(html, /Save settings/);
  assert.match(html, /data-settings-save-status="success"/);
  assert.match(html, /ProductContext 已編譯/);
  assert.doesNotMatch(html, /Welcome|Get started/);
});

test("ProductSignalView shows real readiness state without fake AI results", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProductSignalView as any, {
      kind: "classification",
      signals: [
        {
          id: "signal_a",
          sessionId: "session_a",
          itemId: "item_a",
          source: "threads",
          inboxStatus: "unprocessed",
          capturedAt: "2026-04-27T00:00:00.000Z"
        }
      ],
      productProfile: {
        name: "DLens",
        category: "Creator analysis",
        audience: "Threads creators",
        contextText: "README context",
        contextFiles: [
          {
            id: "file_readme",
            name: "README.md",
            kind: "readme",
            importedAt: "2026-04-27T00:00:00.000Z",
            charCount: 14
          }
        ]
      },
      analyses: [],
      signalPreviewById: {},
      signalReadinessById: {
        signal_a: {
          status: "saved",
          itemStatus: "saved"
        }
      },
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-product-signal-view="classification"/);
  assert.match(html, /分類整理/);
  assert.match(html, /1 signals/);
  assert.match(html, /0 analyses/);
  assert.match(html, /ProductProfile/);
  assert.match(html, /ProductContext/);
  assert.match(html, /尚未抓取/);
  assert.match(html, /按分析會先送出抓取請求/);
  assert.match(html, /尚未有 AI 分析結果/);
  assert.doesNotMatch(html, /航班觀察|fixture|score/i);
});

test("ProductSignalView gives each product page a distinct information shape", () => {
  const baseProps = {
    signals: [
      {
        id: "signal_a",
        sessionId: "session_a",
        itemId: "item_a",
        source: "threads" as const,
        inboxStatus: "unprocessed" as const,
        capturedAt: "2026-04-27T00:00:00.000Z"
      }
    ],
    analyses: [
      {
        signalId: "signal_a",
        signalType: "demand" as const,
        signalSubtype: "mobile_share_extension",
        contentType: "mixed" as const,
        contentSummary: "Users want a one-tap mobile save flow.",
        relevance: 5 as const,
        relevantTo: ["coreWorkflows" as const],
        whyRelevant: "It maps directly to DLens collect flow.",
        verdict: "try" as const,
        reason: "The workflow is concrete enough for a small test.",
        experimentHint: "Prototype a share URL intake.",
        agentTaskSpec: {
          targetAgent: "codex" as const,
          taskPrompt: "You are helping prototype a share URL intake.\n\nTask:\n1. Inspect the extension collect flow.\n2. Draft the smallest implementation plan.\n\nSuccess: a two-week test plan is ready.\nStop condition: missing repo access.",
          requiredContext: ["repo access", "current README"]
        },
        evidenceRefs: ["e1"],
        productContextHash: "ctx_1",
        promptVersion: "v1",
        analyzedAt: "2026-04-27T01:00:00.000Z",
        status: "complete" as const
      }
    ],
    productProfile: {
      name: "DLens",
      category: "Creator analysis",
      audience: "Threads creators",
      contextText: "README context",
      contextFiles: [
        {
          id: "file_readme",
          name: "README.md",
          kind: "readme" as const,
          importedAt: "2026-04-27T00:00:00.000Z",
          charCount: 14
        }
      ]
    },
    signalPreviewById: { signal_a: "Threads post preview" },
    evidenceBySignalId: {
      signal_a: [
        {
          ref: "e1",
          id: "reply_1",
          author: "builder",
          text: "A one-tap mobile save flow would fit my day.",
          likeCount: 7
        }
      ]
    },
    onAnalyze: () => undefined
  };

  const classificationHtml = renderToStaticMarkup(
    React.createElement(ProductSignalView, {
      ...baseProps,
      kind: "classification"
    })
  );
  const actionableHtml = renderToStaticMarkup(
    React.createElement(ProductSignalView, {
      ...baseProps,
      kind: "actionable-filter"
    })
  );

  assert.match(classificationHtml, /分類構成/);
  assert.match(classificationHtml, /系統挑出的內容/);
  assert.match(classificationHtml, /討論串內容/);
  assert.match(classificationHtml, /AI 摘要/);
  assert.match(classificationHtml, /AI 建議分類/);
  assert.doesNotMatch(classificationHtml, /Agent 任務卡|實驗假設草稿/);
  assert.match(classificationHtml, /值得嘗試/);
  assert.doesNotMatch(classificationHtml, /R5/);

  assert.match(actionableHtml, /1 則訊號已評估/);
  assert.match(actionableHtml, /可直接試的做法/);
  assert.match(actionableHtml, /A one-tap mobile save flow would fit my day/);
  assert.doesNotMatch(actionableHtml, /儲存至行動清單|>\+<\/span> 儲存/);
  assert.match(actionableHtml, /AI 實驗建議（輔助）/);
  assert.match(actionableHtml, /AI 判斷依據/);
  assert.match(actionableHtml, /Agent 任務（可複製）/);
  assert.doesNotMatch(actionableHtml, /Agent 任務卡 ·/);
  assert.match(actionableHtml, /這個任務建議/);
  assert.match(actionableHtml, /已採用/);
  assert.match(actionableHtml, /需要改寫/);
  assert.match(actionableHtml, /不相關/);
  assert.match(actionableHtml, /先忽略/);
  assert.match(actionableHtml, /current README/);
  assert.match(actionableHtml, /Prototype a share URL intake/);
  assert.doesNotMatch(actionableHtml, /\d+\s+likes/);
  assert.doesNotMatch(actionableHtml, /R5/);
  // experiment panel visual identity
  assert.match(actionableHtml, /data-product-panel="experiment"/);
  assert.match(actionableHtml, /data-product-panel-badge="experiment"/);
  assert.match(actionableHtml, /試驗/);
  assert.match(actionableHtml, /border-left:2px solid/);
  // agent task card visual identity
  assert.match(actionableHtml, /data-agent-task-card="true"/);
  assert.match(actionableHtml, /data-agent-task-badge="true"/);
  assert.match(actionableHtml, /CODEX/);
  // source quotes intentionally keeps no badge
  assert.doesNotMatch(actionableHtml, /data-product-panel-badge="source-quotes"/);
  // Feedback row exposes pressable buttons via the dedicated data attribute
  assert.match(actionableHtml, /data-agent-task-feedback-row="true"/);
  // Motion: CSS injected via document.head in content script, NOT as React-rendered <style>.
  // Only className / data hooks need to exist in the HTML.
  assert.doesNotMatch(actionableHtml, /data-dlens-product-motion/);
  assert.match(actionableHtml, /class="dlens-card-lift"/);
  assert.match(actionableHtml, /class="dlens-feedback-btn"/);
  assert.match(actionableHtml, /class="dlens-copy-btn"/);
  assert.match(actionableHtml, /class="dlens-details-smooth"/);
  assert.match(actionableHtml, /data-dlens-motion-card="true"/);
  assert.match(actionableHtml, /data-dlens-motion-button="feedback"/);
  assert.match(actionableHtml, /data-dlens-motion-button="copy"/);
  assert.match(actionableHtml, /data-dlens-smooth-details="true"/);
  // The exported CSS constant must include reduced-motion and grid-template-rows animation
  assert.ok(PRODUCT_SIGNAL_MOTION_CSS.includes("prefers-reduced-motion"), "CSS must guard reduced-motion");
  assert.ok(PRODUCT_SIGNAL_MOTION_CSS.includes("grid-template-rows"), "CSS must animate details panel");
  assert.ok(!PRODUCT_SIGNAL_MOTION_CSS.includes("::details-content"), "CSS must not use ::details-content");
});

test("ProductSignalView surfaces legacy optional fields when present", () => {
  const v3Props = {
    signals: [
      {
        id: "signal_v3",
        sessionId: "session_v3",
        itemId: "item_v3",
        source: "threads" as const,
        inboxStatus: "unprocessed" as const,
        capturedAt: "2026-04-28T00:00:00.000Z"
      }
    ],
    analyses: [
      {
        signalId: "signal_v3",
        signalType: "demand" as const,
        signalSubtype: "pm_document_generation",
        contentType: "discussion_starter" as const,
        contentSummary: "PM 想把 Threads 討論轉成可交付文件。",
        relevance: 5 as const,
        relevantTo: ["coreWorkflows" as const],
        whyRelevant: "對應 product mode 的核心承諾。",
        verdict: "try" as const,
        reason: "高互動 reply 都在問可交付格式。",
        experimentHint: "做一個 release note 模板。",
        whyNow: "競品上週剛 ship，現在試最不會被搶先。",
        validationMetric: "兩週內看是否有 3 位 PM 重複使用模板。",
        blockers: ["缺 Confluence webhook", "需要授權"],
        agentTaskSpec: {
          targetAgent: "claude" as const,
          taskTitle: "競品 Release 監控",
          taskPrompt: "You are helping monitor competitor releases.",
          requiredContext: ["RSS feed", "Notion target"]
        },
        evidenceRefs: ["e1"],
        evidenceNotes: [
          {
            ref: "e1",
            quoteSummary: "提到 Claude Skill 取代 Slack tickets。",
            whyItMatters: "直接驗證 PM document workflow。",
            reusablePattern: "多來源工作流轉文件",
            whyItWorks: "把資料來源、處理邏輯和交付物分清楚。",
            copyableTemplate: "Slack/Jira -> Claude Skill -> Release note",
            workflowStack: ["Claude Skill", "Slack", "Jira", "Metabase", "Confluence"],
            copyRecipeMarkdown: "- 讀取 Slack thread 與 Jira tickets\n- 交給 Claude Skill 摘要\n- 輸出 Release Note / Confluence 文件",
            tradeoff: "需要各工具授權與資料讀取權限。"
          }
        ],
        productContextHash: "ctx_v3",
        promptVersion: "v3",
        analyzedAt: "2026-04-28T01:00:00.000Z",
        status: "complete" as const
      }
    ],
    productProfile: {
      name: "DLens",
      category: "Product intelligence",
      audience: "Indie PMs",
      contextText: "README context",
      contextFiles: [
        {
          id: "file_readme",
          name: "README.md",
          kind: "readme" as const,
          importedAt: "2026-04-28T00:00:00.000Z",
          charCount: 14
        }
      ]
    },
    evidenceBySignalId: {
      signal_v3: [
        {
          ref: "e1",
          id: "reply_1",
          author: "ikigai.hito",
          text: "用 Claude Skill 讀 Slack 和 Jira tickets，寫 release note。",
          likeCount: 3
        }
      ]
    },
    onAnalyze: () => undefined
  };

  const actionableHtml = renderToStaticMarkup(
    React.createElement(ProductSignalView, {
      ...v3Props,
      kind: "actionable-filter"
    })
  );

  assert.match(actionableHtml, /可借用 workflow/);
  assert.equal((actionableHtml.match(/可借用 workflow/g) ?? []).length, 1);
  assert.match(actionableHtml, /data-actionable-title="workflow"[^>]*>多來源工作流轉文件/);
  assert.doesNotMatch(actionableHtml, /data-actionable-title="workflow"[^>]*>用 Claude Skill 讀 Slack/);
  assert.match(actionableHtml, /如何照抄/);
  assert.match(actionableHtml, /為什麼可以這樣做/);
  assert.match(actionableHtml, /多來源工作流轉文件/);
  assert.match(actionableHtml, /引用理由：直接驗證 PM document workflow/);
  assert.doesNotMatch(actionableHtml, /AI 摘要：PM 想把 Threads 討論轉成可交付文件/);
  assert.match(actionableHtml, /讀取 Slack thread 與 Jira tickets/);
  assert.match(actionableHtml, /輸出 Release Note \/ Confluence 文件/);
  assert.match(actionableHtml, /限制/);
  assert.match(actionableHtml, /需要各工具授權與資料讀取權限/);
  assert.match(actionableHtml, /把資料來源、處理邏輯和交付物分清楚/);
  assert.match(actionableHtml, /Stack/);
  assert.match(actionableHtml, /Slack/);
  assert.match(actionableHtml, /Jira/);
  assert.match(actionableHtml, /Metabase/);
  assert.match(actionableHtml, /Confluence/);
  assert.match(actionableHtml, /Claude Skill/);
  assert.match(actionableHtml, /text-transform:uppercase/);
  assert.doesNotMatch(actionableHtml, /可用做法（留言原文）/);
  assert.match(actionableHtml, /AI 判斷依據/);
  assert.match(actionableHtml, /競品上週剛 ship/);
  assert.match(actionableHtml, /兩週內看是否有 3 位 PM 重複使用模板/);
  assert.match(actionableHtml, /阻礙/);
  assert.match(actionableHtml, /缺 Confluence webhook/);
  assert.match(actionableHtml, /競品 Release 監控/);
  // 產品比對 降級為 footnote — 用 ↳ glyph + "對應" 短句，不再用獨立 section header
  assert.match(actionableHtml, /↳/);
  assert.match(actionableHtml, /對應 核心流程/);
  assert.doesNotMatch(actionableHtml, /<strong>產品比對<\/strong>/);

  // Raw quote is no longer the visible hero; it lives behind the disclosure.
  assert.match(actionableHtml, /查看原文與模型判讀\s*→/);
  assert.doesNotMatch(actionableHtml, /顯示原文與引用理由/);
  assert.doesNotMatch(actionableHtml, /data-evidence-quote-body="true"/);
  assert.doesNotMatch(actionableHtml, /inset 0 1px 0 rgba\(255,255,255,0\.55\)/);

  // Hierarchy tokens (A-D) — lock the deliberate "subtraction" pass
  // B: author renders in serifCjk italic + subInk + 13px (same voice as h3 title)
  assert.match(actionableHtml, /data-evidence-quote-author="true"[^>]*style="[^"]*font-style:italic[^"]*"/);
  assert.match(actionableHtml, /data-evidence-quote-author="true"[^>]*style="[^"]*font-size:13px[^"]*"/);
  // C: Evidence section label drops weight 900 → 700 (still uppercase wayfinding, no longer competing as heading)
  assert.match(actionableHtml, /data-evidence-section-label="true"[^>]*style="[^"]*font-weight:700[^"]*"/);
  assert.doesNotMatch(actionableHtml, /data-evidence-section-label="true"[^>]*style="[^"]*font-weight:900[^"]*"/);
  // C: details summary loses uppercase, becomes italic reading hint
  assert.doesNotMatch(actionableHtml, /查看原文與模型判讀[^<]*<\/[^>]+>[^<]*text-transform:uppercase/);
  // D: number badge softens — 1px border + lineStrong, weight 500, subInk fill (no longer ink+600+1.5px)
  assert.match(actionableHtml, /data-dlens-number-badge="true"[^>]*style="[^"]*font-weight:500[^"]*"/);
  assert.match(actionableHtml, /data-dlens-number-badge="true"[^>]*style="[^"]*border:1px solid/);
  assert.doesNotMatch(actionableHtml, /data-dlens-number-badge="true"[^>]*style="[^"]*border:1\.5px/);
});

test("ProductSignalView shows feedback-backed similar history without inflating current readiness", () => {
  const currentPrompt = "You are helping implement the current PM document workflow.";
  const historyPrompt = "You are helping implement the historical PM document workflow.";
  const baseAnalysis = {
    signalType: "demand" as const,
    signalSubtype: "pm_document_generation",
    contentType: "discussion_starter" as const,
    relevance: 5 as const,
    relevantTo: ["coreWorkflows" as const],
    whyRelevant: "對應 product mode 的核心承諾。",
    verdict: "try" as const,
    reason: "高互動 reply 都在問可交付格式。",
    evidenceRefs: ["e1"],
    productContextHash: "ctx_v3",
    promptVersion: "v4",
    analyzedAt: "2026-04-28T01:00:00.000Z",
    status: "complete" as const
  };

  const currentAnalysis = {
    ...baseAnalysis,
    signalId: "signal_current",
    contentSummary: "PM 想把 Threads 討論轉成可交付文件。",
    agentTaskSpec: {
      targetAgent: "codex" as const,
      taskTitle: "文件生成",
      taskPrompt: currentPrompt,
      requiredContext: ["repo"]
    }
  };
  const historicalAnalysis = {
    ...baseAnalysis,
    signalId: "signal_history",
    contentSummary: "歷史上已試過把討論轉成 release note。",
    agentTaskSpec: {
      targetAgent: "codex" as const,
      taskTitle: "歷史文件",
      taskPrompt: historyPrompt,
      requiredContext: ["repo"]
    }
  };
  const noFeedbackAnalysis = {
    ...baseAnalysis,
    signalId: "signal_no_feedback",
    contentSummary: "這筆相似但沒有回饋，不能顯示。",
    agentTaskSpec: {
      targetAgent: "codex" as const,
      taskTitle: "無回饋",
      taskPrompt: "You are helping without feedback.",
      requiredContext: ["repo"]
    }
  };

  const html = renderToStaticMarkup(
    React.createElement(ProductSignalView, {
      kind: "actionable-filter",
      signals: [
        { id: "signal_current", sessionId: "sess", itemId: "i1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-04-28T00:00:00.000Z" }
      ] as any,
      analyses: [currentAnalysis],
      historicalAnalyses: [currentAnalysis, historicalAnalysis, noFeedbackAnalysis],
      agentTaskFeedback: [
        {
          signalId: "signal_history",
          taskPromptHash: buildProductAgentTaskPromptHash(historyPrompt),
          feedback: "adopted",
          createdAt: "2026-04-28T02:00:00.000Z"
        }
      ],
      productProfile: {
        name: "DLens",
        category: "x",
        audience: "y",
        contextText: "z",
        contextFiles: [{ id: "f", name: "README.md", kind: "readme", importedAt: "2026-04-28T00:00:00.000Z", charCount: 1 }]
      } as any,
      evidenceBySignalId: {
        signal_current: [{ ref: "e1", id: "r1", author: "alpha", text: "需要 release note。", likeCount: 1 }]
      },
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /1 signals · 1 analyses/);
  assert.match(html, /相似歷史 · 1 則（1 次採用）/);
  assert.match(html, /歷史上已試過把討論轉成 release note/);
  assert.match(html, /已採用/);
  assert.doesNotMatch(html, /這筆相似但沒有回饋/);
});

test("merged candidate-action board keeps AI commentary collapsed on action route", () => {
  const v3Props = {
    signals: [
      { id: "s1", sessionId: "sess", itemId: "i1", source: "threads" as const, inboxStatus: "unprocessed" as const, capturedAt: "2026-04-28T00:00:00.000Z" },
      { id: "s2", sessionId: "sess", itemId: "i2", source: "threads" as const, inboxStatus: "unprocessed" as const, capturedAt: "2026-04-28T00:00:00.000Z" }
    ],
    analyses: ["s1", "s2"].map((id) => ({
      signalId: id,
      signalType: "demand" as const,
      signalSubtype: "shared_subtype",
      contentType: "discussion_starter" as const,
      contentSummary: `卡片 ${id}`,
      relevance: 5 as const,
      relevantTo: ["coreWorkflows" as const],
      whyRelevant: "相關。",
      verdict: "try" as const,
      reason: "理由。",
      evidenceRefs: ["e1"],
      evidenceNotes: [{ ref: "e1", quoteSummary: `${id} 摘錄。`, whyItMatters: `${id} 引用原因。` }],
      productContextHash: "ctx",
      promptVersion: "v3",
      analyzedAt: "2026-04-28T01:00:00.000Z",
      status: "complete" as const
    })),
    productProfile: {
      name: "DLens", category: "x", audience: "y", contextText: "z",
      contextFiles: [{ id: "f", name: "README.md", kind: "readme" as const, importedAt: "2026-04-28T00:00:00.000Z", charCount: 1 }]
    },
    evidenceBySignalId: {
      s1: [{ ref: "e1", id: "r1", author: "alpha", text: "raw 1", likeCount: 1 }],
      s2: [{ ref: "e1", id: "r2", author: "beta",  text: "raw 2", likeCount: 2 }]
    },
    onAnalyze: () => undefined
  };

  const html = renderToStaticMarkup(
    React.createElement(ProductSignalView, { ...v3Props, kind: "actionable-filter" })
  );

  const openDetails = html.match(/<details open=""[^]*?<\/details>/g) ?? [];

  assert.equal(openDetails.length, 0);
  assert.match(html, /候選行動/);
  assert.doesNotMatch(html, /儲存至行動清單|>\+<\/span> 儲存/);
  assert.match(html, /s1 摘錄。/);
  assert.match(html, /s2 摘錄。/);
});

test("citationsForAnalysis filters out refs missing both entry and note", () => {
  const v3Props = {
    signals: [
      { id: "s1", sessionId: "sess", itemId: "i1", source: "threads" as const, inboxStatus: "unprocessed" as const, capturedAt: "2026-04-28T00:00:00.000Z" }
    ],
    analyses: [{
      signalId: "s1",
      signalType: "demand" as const,
      signalSubtype: "subtype",
      contentType: "discussion_starter" as const,
      contentSummary: "summary",
      relevance: 5 as const,
      relevantTo: ["coreWorkflows" as const],
      whyRelevant: "相關。",
      verdict: "try" as const,
      reason: "理由。",
      evidenceRefs: ["e1", "e2", "e_dangling"],
      evidenceNotes: [
        { ref: "e1", quoteSummary: "e1 摘錄。", whyItMatters: "e1 原因。" }
      ],
      productContextHash: "ctx",
      promptVersion: "v3",
      analyzedAt: "2026-04-28T01:00:00.000Z",
      status: "complete" as const
    }],
    productProfile: {
      name: "DLens", category: "x", audience: "y", contextText: "z",
      contextFiles: [{ id: "f", name: "README.md", kind: "readme" as const, importedAt: "2026-04-28T00:00:00.000Z", charCount: 1 }]
    },
    evidenceBySignalId: {
      s1: [{ ref: "e2", id: "r2", author: "beta", text: "raw 2", likeCount: 2 }]
    },
    onAnalyze: () => undefined
  };

  const html = renderToStaticMarkup(
    React.createElement(ProductSignalView, { ...v3Props, kind: "actionable-filter" })
  );

  // e1 has note only, e2 has entry only → both render. e_dangling has neither → must be skipped.
  assert.match(html, /e1 摘錄。/);
  assert.match(html, /raw 2/);
  assert.match(html, /subtype/);
  assert.match(html, /2 則原文證據/);
  assert.doesNotMatch(html, /e_dangling/);
});

test("ProductSignalView tolerates legacy analysis records with missing optional arrays", () => {
  const legacyAnalysis = {
    signalId: "s_legacy",
    signalType: "demand",
    signalSubtype: "legacy_agent_task",
    contentType: "discussion_starter",
    contentSummary: "舊資料仍應可顯示。",
    relevance: 5,
    relevantTo: undefined,
    whyRelevant: "相關。",
    verdict: "try",
    reason: "理由。",
    experimentHint: "試一個小任務。",
    blockers: undefined,
    agentTaskSpec: {
      targetAgent: "claude",
      taskTitle: "舊任務",
      taskPrompt: "You are helping with a legacy task."
    },
    evidenceRefs: undefined,
    evidenceNotes: undefined,
    productContextHash: "ctx",
    promptVersion: "v3",
    analyzedAt: "2026-04-28T01:00:00.000Z",
    status: "complete"
  };

  const html = renderToStaticMarkup(
    React.createElement(ProductSignalView, {
      kind: "actionable-filter",
      signals: [
        { id: "s_legacy", sessionId: "sess", itemId: "i1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-04-28T00:00:00.000Z" }
      ] as any,
      analyses: [legacyAnalysis] as any,
      productProfile: {
        name: "DLens",
        category: "x",
        audience: "y",
        contextText: "z",
        contextFiles: [{ id: "f", name: "README.md", kind: "readme", importedAt: "2026-04-28T00:00:00.000Z", charCount: 1 }]
      } as any,
      evidenceBySignalId: { s_legacy: undefined } as any,
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /舊資料仍應可顯示/);
  assert.match(html, /這則訊號暫時沒有可顯示的原文證據/);
  assert.match(html, /Agent 任務（可複製）/);
  assert.match(html, /舊任務/);
});

test("ClassificationBoard selected post aside collapses long text behind 展開全文", () => {
  const longText = "1. 用 Claude Skill 讀 Slack thread 和 Jira tickets，寫 Release Note。接下來提到 Confluence、Metabase、SQL editor 等更多細節。然後又補充了一段。";
  const v3Props = {
    signals: [
      { id: "s1", sessionId: "sess", itemId: "i1", source: "threads" as const, inboxStatus: "unprocessed" as const, capturedAt: "2026-04-28T00:00:00.000Z" }
    ],
    analyses: [{
      signalId: "s1",
      signalType: "demand" as const,
      signalSubtype: "pm_doc",
      contentType: "discussion_starter" as const,
      contentSummary: longText,
      relevance: 5 as const,
      relevantTo: ["coreWorkflows" as const],
      whyRelevant: "相關。",
      verdict: "try" as const,
      reason: "理由。",
      evidenceRefs: [],
      productContextHash: "ctx",
      promptVersion: "v3",
      analyzedAt: "2026-04-28T01:00:00.000Z",
      status: "complete" as const
    }],
    productProfile: {
      name: "DLens", category: "x", audience: "y", contextText: "z",
      contextFiles: [{ id: "f", name: "README.md", kind: "readme" as const, importedAt: "2026-04-28T00:00:00.000Z", charCount: 1 }]
    },
    signalPreviewById: { s1: longText },
    onAnalyze: () => undefined
  };

  const html = renderToStaticMarkup(
    React.createElement(ProductSignalView, { ...v3Props, kind: "classification" })
  );

  assert.match(html, /展開全文/);
  // First sentence appears outside the details (always visible)
  assert.match(html, /1\. 用 Claude Skill 讀 Slack thread 和 Jira tickets/);
  assert.doesNotMatch(html, />1\.<\/div>/);
  // Rest of text is wrapped inside the controlled smooth disclosure, closed by default,
  // so the second/third sentences are not visible until user expands.
  const detailsBlocks = html.match(/data-dlens-smooth-details="true"[^]*?data-dlens-details-panel="true"[^]*?<\/div><\/div><\/div>/g) ?? [];
  assert.ok(detailsBlocks.some((block) => /data-dlens-details-open="false"/.test(block) && /Metabase/.test(block)));
});

test("ProductSignalView surfaces product analyzer readiness and errors", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProductSignalView, {
      kind: "classification",
      signals: [
        {
          id: "signal_a",
          sessionId: "session_a",
          itemId: "item_a",
          source: "threads",
          inboxStatus: "unprocessed",
          capturedAt: "2026-04-27T00:00:00.000Z"
        }
      ],
      analyses: [
        {
          signalId: "signal_a",
          signalType: "noise",
          signalSubtype: "analysis_error",
          contentType: "mixed",
          contentSummary: "產品訊號分析失敗。",
          relevance: 1,
          relevantTo: [],
          whyRelevant: "這次分析沒有產生可信結果。",
          verdict: "insufficient_data",
          reason: "Invalid product signal analysis payload",
          evidenceRefs: [],
          productContextHash: "ctx_error",
          promptVersion: "v6",
          analyzedAt: "2026-04-28T00:00:00.000Z",
          status: "error",
          error: "Invalid product signal analysis payload"
        }
      ],
      productProfile: {
        name: "DLens",
        category: "Creator analysis",
        audience: "Threads creators",
        contextText: "README context",
        contextFiles: [
          {
            id: "file_readme",
            name: "README.md",
            kind: "readme",
            importedAt: "2026-04-27T00:00:00.000Z",
            charCount: 14
          }
        ]
      },
      signalPreviewById: {},
      aiProviderReady: false,
      analysisError: "ProductSignalAnalyzer failed: Invalid product signal analysis payload",
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /尚未設定 AI key/);
  assert.match(html, /ProductSignalAnalyzer failed/);
  assert.match(html, /Invalid product signal analysis payload/);
  assert.match(html, /分析失敗/);
  assert.match(html, /需重試/);
});
