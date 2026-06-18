import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildProductAgentTaskPromptHash } from "../src/compare/product-agent-task-feedback.ts";
import { SIGNAL_READING_PROMPT_VERSION } from "../src/compare/signal-reading.ts";
import type { SessionProcessingSummary, WorkerStatus } from "../src/state/processing-state.ts";
import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { prCampaignToDraft, type PrCampaign, type PrEvidenceRow } from "../src/state/pr-evidence-storage.ts";
import type { SavedAnalysisSnapshot, SessionItem, SessionRecord, TechniqueReadingSnapshot } from "../src/state/types.ts";
import { createDefaultSettings, createEmptyTabState } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import {
  buildProductSignalWorkspaceViewModel,
  type ProductSignalCommand,
  type ProductSignalViewModel,
  type ProductSignalWorkspaceViewModel
} from "../src/viewmodel/product-signal.ts";
import {
  buildPrEvidenceViewModel,
  type PrEvidenceResourceState,
  type PrEvidenceUiState,
  type PrEvidenceViewModel
} from "../src/viewmodel/pr-evidence.ts";
import { CollectView } from "../src/ui/CollectView.tsx";
import { InPageCollectorFolderControls, inPageCollectorFolderControlsTestables } from "../src/ui/InPageCollectorFolderControls.tsx";
import { inPageCollectorPopupTestables } from "../src/ui/InPageCollectorPopup.tsx";
import { LibraryView } from "../src/ui/LibraryView.tsx";
import { createPrEvidenceResource } from "../src/ui/pr-evidence-resource.ts";
import { PrEvidenceView, prEvidenceViewTestables } from "../src/ui/PrEvidenceViews.tsx";
import { ProductSignalView, DLENS_MOTION_CSS, productSignalViewTestables } from "../src/ui/ProductSignalViews.tsx";
import { SettingsView } from "../src/ui/SettingsView.tsx";
import {
  ModeRail,
  UtilityEdge,
  WorkspaceShell,
  surfaceCardStyle
} from "../src/ui/components.tsx";
import { modeThemeStyle, textStyles, tokens } from "../src/ui/tokens.ts";

function productTestProfile() {
  return {
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
  };
}

function itemStatusFromReadiness(readiness: any): SessionItem["status"] {
  if (readiness?.itemStatus) return readiness.itemStatus;
  if (readiness?.status === "saved") return "saved";
  if (readiness?.status === "crawling") return "running";
  if (readiness?.status === "failed") return "failed";
  return "succeeded";
}

function buildProductTestItem(signal: any, props: any): SessionItem | null {
  if (!signal.itemId) return null;
  const readiness = props.signalReadinessById?.[signal.id] ?? { status: "ready", itemStatus: "succeeded" };
  const preview = props.signalPreviewById?.[signal.id] || signal.id;
  const url = props.signalUrlById?.[signal.id] || `https://www.threads.net/@dlens/post/${signal.id}`;
  const item = createSessionItem(
    {
      target_type: "post",
      page_url: url,
      post_url: url,
      author_hint: "dlens",
      text_snippet: preview,
      time_token_hint: "",
      dom_anchor: signal.id,
      engagement: { likes: 0, comments: 0, reposts: null, forwards: null, views: null },
      engagement_present: { likes: false, comments: false, reposts: false, forwards: false, views: false },
      captured_at: signal.capturedAt || "2026-04-27T00:00:00.000Z"
    },
    signal.capturedAt || "2026-04-27T00:00:00.000Z"
  );
  item.id = signal.itemId;
  item.status = itemStatusFromReadiness(readiness);
  item.lastError = readiness.lastError ?? null;
  item.latestCapture = item.status === "succeeded" && readiness.status !== "missing_content"
    ? {
        id: `cap-${signal.id}`,
        source_type: "threads",
        capture_type: "post",
        source_page_url: url,
        source_post_url: url,
        canonical_target_url: url,
        author_hint: "dlens",
        text_snippet: preview,
        time_token_hint: "",
        dom_anchor: signal.id,
        engagement: {},
        client_context: {},
        raw_payload: {},
        ingestion_status: "succeeded",
        captured_at: signal.capturedAt || "2026-04-27T00:00:00.000Z",
        created_at: signal.capturedAt || "2026-04-27T00:00:00.000Z",
        updated_at: signal.capturedAt || "2026-04-27T00:00:00.000Z",
        job: null,
        result: {
          threadReadModel: {
            rootPost: { postId: signal.id, author: "dlens", text: preview, likeCount: 0 },
            opContinuations: [],
            discussionReplies: (props.evidenceBySignalId?.[signal.id] ?? []).map((entry: any) => ({
              commentId: entry.id || entry.ref,
              author: entry.author || "reader",
              text: entry.text || entry.quoteSummary || entry.ref,
              likeCount: entry.likeCount ?? null
            })),
            assembledContent: preview
          }
        },
        analysis: null
      } as SessionItem["latestCapture"]
    : null;
  return item;
}

function patchProductTestCapabilities(vm: ProductSignalWorkspaceViewModel, props: any): ProductSignalWorkspaceViewModel {
  const allowRemove = typeof props.onRemoveSignal === "function";
  const allowReading = typeof props.onSynthesizeSignalReading === "function";
  const patchSignal = (signal: ProductSignalViewModel): ProductSignalViewModel => {
    const preview = props.signalPreviewById?.[signal.signalId] ?? signal.sourcePreview.displayText;
    const url = props.signalUrlById?.[signal.signalId] ?? signal.sourcePreview.displayUrl;
    const readiness = props.signalReadinessById?.[signal.signalId] ?? signal.readiness;
    const evidence = props.evidenceBySignalId?.[signal.signalId] ?? signal.evidence;
    return {
      ...signal,
      title: preview || signal.title,
      sourcePreview: {
        ...signal.sourcePreview,
        text: preview || signal.sourcePreview.text,
        displayText: preview,
        sourceUrl: url || signal.sourcePreview.sourceUrl,
        displayUrl: url
      },
      readiness,
      evidence,
      actions: signal.actions.filter((action) => {
        if (action.kind === "remove") return allowRemove;
        if (action.kind === "generateReading") return allowReading;
        return true;
      })
    };
  };
  const signals = vm.signals.map(patchSignal);
  const byId = new Map(signals.map((signal) => [signal.signalId, signal]));
  const pendingSignals = vm.pendingSignals.map((signal) => byId.get(signal.signalId) ?? patchSignal(signal));
  const firstSynthesizableSignal = vm.firstSynthesizableSignal
    ? byId.get(vm.firstSynthesizableSignal.signalId) ?? patchSignal(vm.firstSynthesizableSignal)
    : null;
  return {
    ...vm,
    signals,
    pendingSignals,
    firstSynthesizableSignal,
    signalPreviewById: Object.fromEntries(signals.map((signal) => [signal.signalId, signal.sourcePreview.displayText] as const)),
    signalUrlById: Object.fromEntries(signals.map((signal) => [signal.signalId, signal.sourcePreview.displayUrl] as const)),
    signalReadinessById: Object.fromEntries(signals.map((signal) => [signal.signalId, signal.readiness] as const)),
    evidenceBySignalId: Object.fromEntries(signals.map((signal) => [signal.signalId, signal.evidence] as const)),
    actions: vm.actions.filter((action) => {
      if (action.kind === "openActionable") return typeof props.onGoToActionable === "function";
      if (action.kind === "exportSignalPackets") return typeof props.onExportSignalPackets === "function";
      return true;
    })
  };
}

function productSignalViewElement(props: any) {
  const signals = Array.isArray(props.signals) ? props.signals : [];
  const sessionId = signals[0]?.sessionId || props.activeFolderId || "session_product";
  const items = signals.map((signal: any) => buildProductTestItem(signal, props)).filter((item: SessionItem | null): item is SessionItem => Boolean(item));
  const session: SessionRecord = {
    id: sessionId,
    name: "Product test",
    mode: "product",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    items
  };
  const snapshot = {
    global: {
      settings: {
        ...createDefaultSettings(),
        productProfile: props.productProfile ?? productTestProfile(),
        layoutPreferences: {
          ...createDefaultSettings().layoutPreferences,
          productSignalCardLayout: props.cardLayout ?? "marginalia"
        }
      },
      sessions: [session],
      activeSessionId: session.id,
      updatedAt: "2026-04-27T00:00:00.000Z"
    },
    tab: createEmptyTabState()
  };
  const vm = patchProductTestCapabilities(
    buildProductSignalWorkspaceViewModel({
      kind: props.kind,
      snapshot,
      signals,
      analyses: props.analyses ?? [],
      historicalAnalyses: props.historicalAnalyses,
      agentTaskFeedback: props.agentTaskFeedback,
      signalReadings: props.signalReadings,
      productContext: null,
      aiProviderReady: props.aiProviderReady ?? true,
      cardLayout: props.cardLayout,
      backendError: props.backendError ?? null,
      analysisError: props.analysisError ?? null,
      analysisNotice: props.analysisNotice ?? null,
      isHydrating: props.isHydrating ?? false,
      isAnalyzing: props.isAnalyzing ?? false
    }),
    props
  );
  const onCommand = (command: ProductSignalCommand) => {
    switch (command.kind) {
      case "analyzeInbox":
        return props.onAnalyze?.();
      case "openActionable":
        return props.onGoToActionable?.();
      case "remove":
        return props.onRemoveSignal?.(command.target.signalId);
      case "generateReading":
        return props.onSynthesizeSignalReading
          ? props.onSynthesizeSignalReading(command.target.signalId, command.target.sessionId, command.force)
          : Promise.resolve({ ok: false, error: "missing synthesize handler" });
      case "reviewReading":
        return props.onReviewSignalReading
          ? props.onReviewSignalReading(command.target.cacheKey, command.decision, command.note)
          : Promise.resolve({ ok: false, error: "missing review handler" });
      case "exportSignalPackets":
        return props.onExportSignalPackets
          ? props.onExportSignalPackets({ sessionId: command.target.sessionId, format: command.format })
          : Promise.resolve({ ok: false, error: "missing export handler" });
      default:
        return undefined;
    }
  };
  return React.createElement(ProductSignalView, {
    viewModel: vm,
    exportFolders: props.exportFolders,
    onCommand
  });
}

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

const idlePrEvidenceUiState: PrEvidenceUiState = {
  activePane: "ledger",
  isSaving: false,
  isReadingBrief: false,
  isGeneratingCriteria: false,
  isMatching: false,
  isFetchingAdvancedMetrics: false,
  isGeneratingSummary: false
};

function buildPrEvidenceVm(
  resource: Partial<PrEvidenceResourceState> = {},
  uiState: Partial<PrEvidenceUiState> = {},
  sessionId = "session-pr"
): PrEvidenceViewModel {
  const baseResource = createPrEvidenceResource(sessionId);
  return buildPrEvidenceViewModel({
    sessionId,
    resource: { ...baseResource, ...resource },
    uiState: { ...idlePrEvidenceUiState, ...uiState }
  });
}

function renderPrEvidenceView(
  resource: Partial<PrEvidenceResourceState> = {},
  uiState: Partial<PrEvidenceUiState> = {}
): string {
  return renderToStaticMarkup(
    React.createElement(PrEvidenceView, {
      viewModel: buildPrEvidenceVm(resource, uiState),
      onCommand: () => undefined
    })
  );
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
  assert.equal(style.borderRadius, tokens.radius.cardLg);
  assert.equal(style.border, `1px solid ${tokens.color.cardEdge}`);
  assert.equal(style.boxShadow, tokens.shadow.shell);
});

test("tokens keep the design-system UI and editorial type split", () => {
  assert.match(tokens.font.sans, /Noto Sans TC/);
  assert.doesNotMatch(tokens.font.sans, /Noto Serif TC|Songti TC/);
  assert.match(tokens.font.serifCjk, /Noto Serif TC|Songti TC/);
  assert.equal(tokens.color.canvas, "#f7f4ec");
  assert.equal(tokens.color.surface, "#fbf8f1");
  assert.equal(tokens.color.elevated, "#fdfbf6");
  assert.equal(tokens.radius.card, 12);
  assert.equal(tokens.radius.lg, 12);
});

test("mode themes keep topic and product visually separate", () => {
  const topicStyle = modeThemeStyle("topic");
  const productStyle = modeThemeStyle("product");
  const prStyle = modeThemeStyle("pr-evidence");

  assert.equal(topicStyle["--dlens-mode-accent"], tokens.color.cyan);
  assert.notEqual(productStyle["--dlens-mode-accent"], topicStyle["--dlens-mode-accent"]);
  assert.match(topicStyle["--dlens-mode-hover-border-strong"], /63,90,59/);
  assert.match(productStyle["--dlens-mode-hover-border-strong"], /35,79,122/);
  assert.match(prStyle["--dlens-mode-hover-border-strong"], /122,32,48/);
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
  assert.match(html, /grid-template-rows:auto minmax\(0, 1fr\)/);
  assert.match(html, /min-height:100%/);
  assert.match(html, /data-shell-frame="editorial"[^>]*align-items:start/);
  assert.match(html, /data-shell-header="workspace"[^>]*align-self:start/);
  assert.ok(modeRailIndex >= 0);
  assert.ok(processingStripIndex > modeRailIndex);
  assert.ok(settingsIndex > modeRailIndex);
});

test("InPageCollectorPopup hides the global processing strip in Product and PR workspaces", () => {
  const shouldShow = inPageCollectorPopupTestables.shouldShowProcessingContextStrip;

  assert.equal(shouldShow("archive", "library"), true);
  assert.equal(shouldShow("topic", "library"), false);
  assert.equal(shouldShow("topic", "compare"), true);
  assert.equal(shouldShow("topic", "inbox"), false);
  assert.equal(shouldShow("topic", "casebook"), false);
  assert.equal(shouldShow("product", "saved-signals"), false);
  assert.equal(shouldShow("pr-evidence", "pr-evidence"), false);
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
  assert.match(html, /Topic workspace/);
  assert.match(html, /data-library-row="scan"/);
  assert.match(html, /data-scan-list="library"/);
  assert.match(html, /data-scan-row="true"/);
});

test("LibraryView scopes Topic library rows to Topic signals, not all backing saved items", () => {
  const session = buildSession();
  const leakedProductItem = createSessionItem({
    ...buildDescriptor(),
    post_url: "https://www.threads.net/@product/post/leaked",
    page_url: "https://www.threads.net/@product/post/leaked",
    author_hint: "product_author",
    text_snippet: "Product-only saved row"
  });
  session.mode = "topic";
  session.items.push(leakedProductItem);

  const html = renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem: null as SessionItem | null,
      optimisticQueuedIds: [],
      workerStatus: "idle" as WorkerStatus | null,
      isStartingProcessing: false,
      processAllLabel: "Process All",
      processingSummary: { total: 2, ready: 1, crawling: 0, analyzing: 0, pending: 1, failed: 0, hasReadyPair: false, hasInflight: false },
      canPrev: false,
      canNext: false,
      onSelectItem: () => undefined,
      onProcessAll: () => undefined,
      onMoveSelection: () => undefined,
      onQueueItem: () => undefined,
      renderMetrics: () => null,
      techniqueReadings: [],
      topicSignalItemIds: [session.items[0]!.id],
      topicInboxCount: 1,
      topicCount: 1
    })
  );

  assert.match(html, /1 未分流 · 1 主題/);
  assert.match(html, /@alpha/);
  assert.doesNotMatch(html, /Product-only saved row/);
  assert.doesNotMatch(html, /Product workspace/);
  assert.doesNotMatch(html, /篇可以比較/);
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
  assert.match(html, /data-library-row="scan"/);
  assert.match(html, /data-scan-row="true"/);
  assert.match(html, /data-library-card-skeleton="visible"/);
  assert.match(html, /crawling/);
});

test("LibraryView explains archive empty state without implying AI work", () => {
  const session = buildSession();
  session.mode = "archive";
  session.items = [];

  const html = renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem: null as SessionItem | null,
      optimisticQueuedIds: [],
      workerStatus: "idle" as WorkerStatus | null,
      isStartingProcessing: false,
      processAllLabel: "Process All",
      processingSummary: {
        total: 0,
        ready: 0,
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

  assert.match(html, /Archive 模式只保留原文，不自動分析。/);
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
  assert.match(html, /data-archive-no-ai-notice="collect"/);
  assert.match(html, /儲存為原文記錄，不跑 AI 分析/);
  assert.match(html, /收集模式：開啟/);
  assert.match(html, /關閉/);
});

test("CollectView renders captured engagement metrics in the hover preview", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: buildDescriptor(),
      folderName: "work",
      mode: "topic",
      isSaved: false,
      selectionMode: true,
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined
    })
  );

  assert.match(html, /data-collect-metric="likes"/);
  assert.match(html, /data-collect-metric="comments"/);
  assert.match(html, /data-collect-metric="reposts"/);
  assert.match(html, />10</);
  assert.match(html, />5</);
  assert.doesNotMatch(html, />Like</);
  assert.doesNotMatch(html, />Reply</);
  assert.doesNotMatch(html, />Repost</);
  assert.doesNotMatch(html, />Share</);
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

test("CollectView blocks PR Evidence saves until a campaign exists", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: buildDescriptor(),
      folderName: "PR workspace",
      mode: "pr-evidence",
      isSaved: false,
      canSavePreview: false,
      disabledReason: "先在 PR 頁建立 campaign，Collect 才能加入 evidence row。",
      selectionMode: false,
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined
    })
  );

  assert.match(html, /加入 PR evidence/);
  assert.match(html, /data-collect-disabled-reason="true"/);
  assert.match(html, /先在 PR 頁建立 campaign/);
  assert.match(html, /disabled=""/);
});

test("PrEvidenceView renders campaign setup and compact evidence ledger", () => {
  const html = renderPrEvidenceView();

  assert.match(html, /data-pr-evidence-view="true"/);
  assert.match(html, /data-pr-campaign-setup="true"/);
  assert.match(html, /data-pr-actions="true"/);
  assert.match(html, /data-pr-evidence-ledger="compact"/);
  assert.match(html, /批次判斷/);
  assert.match(html, /抓取進階指標/);
  assert.match(html, /匯出 CSV/);
  assert.match(html, /生成摘要/);
});

test("PrEvidenceView renders PR campaign and rows from the shared resource state", () => {
  const campaign: PrCampaign = {
    id: "campaign-shared",
    sessionId: "session-pr",
    name: "Shared campaign",
    briefText: "Shared brief",
    criteria: [
      { id: "c1", label: "Campaign" },
      { id: "c2", label: "Hashtag" },
      { id: "c3", label: "Message" },
      { id: "c4", label: "Venue" },
      { id: "c5", label: "Experience" },
      { id: "c6", label: "CTA" }
    ],
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z"
  };
  const row: PrEvidenceRow = {
    id: "row-shared",
    campaignId: "campaign-shared",
    itemId: "item-shared",
    postUrl: "https://www.threads.net/@shared/post/1",
    authorHandle: "shared_author",
    caption: "Shared row from app boundary",
    metrics: { likes: 12, comments: 3, reposts: 1 },
    criteriaMatches: { c1: true, c2: false, c3: true, c4: false, c5: false, c6: false },
    collectedAt: "2026-05-26T00:00:00.000Z"
  };

  const html = renderPrEvidenceView({
    campaign: prCampaignToDraft(campaign),
    rows: [row],
    setupCollapsed: true
  });

  assert.match(html, /Shared campaign/);
  assert.match(html, /shared_author/);
  assert.match(html, /Shared row from app boundary/);
  assert.match(html, /1 列/);
});

test("PrEvidenceView aligns the editorial PR structure to shared workspace tokens", () => {
  const html = renderPrEvidenceView();

  assert.match(html, /data-pr-editorial-v1="true"/);
  assert.match(html, /data-mode-header="pr-evidence"/);
  assert.match(html, /data-workspace-surface="utility"/);
  assert.match(html, /data-pr-working-area="true"/);
  assert.match(html, /證據帳本/);
  assert.match(html, /批次判斷/);
  assert.match(html, /抓取指標/);
  assert.match(html, /border-radius:20px/);
  assert.match(html, /0 4px 14px -4px rgba\(27,26,23,0\.07\)/);
});

test("PR Evidence setup copy is Chinese-first and avoids fake campaign examples", () => {
  const html = renderPrEvidenceView();

  assert.match(html, /活動名稱/);
  assert.match(html, /貼上新聞稿、message house 或 PR guideline，也可以上傳 PDF。/);
  assert.match(html, /PR 判斷條件/);
  assert.match(html, /儲存活動/);
  assert.match(html, /取消/);
  assert.match(html, /儲存後自動同步/);
  assert.doesNotMatch(html, /Mannings BoostUP Wellness Carnival/);
  assert.doesNotMatch(html, /Campaign name|Saved posts|Ledger|Auto-saves after Save/);
  assert.doesNotMatch(html, /criterion_1/);
});

test("PR Evidence ledger rows expose the original Threads post link", () => {
  const row: PrEvidenceRow = {
    id: "row-link",
    campaignId: "campaign-1",
    itemId: "item-1",
    postUrl: "https://www.threads.net/@alpha/post/1",
    authorHandle: "alpha",
    caption: "Source post that should be auditable from the ledger.",
    metrics: { likes: 12, comments: 3, reposts: 1 },
    criteriaMatches: { c1: false, c2: false, c3: false, c4: false, c5: false, c6: false },
    collectedAt: "2026-05-26T00:00:00.000Z"
  };
  const { EvidenceLedger } = prEvidenceViewTestables as unknown as {
    EvidenceLedger: (props: { rows: ReturnType<typeof buildPrEvidenceVm>["ledger"]["rows"] }) => React.ReactElement;
  };
  const campaign: PrCampaign = {
    id: "campaign-1",
    sessionId: "session-pr",
    name: "Launch",
    briefText: "Brief",
    criteria: [
      { id: "c1", label: "Campaign" },
      { id: "c2", label: "Hashtag" },
      { id: "c3", label: "Message" },
      { id: "c4", label: "Venue" },
      { id: "c5", label: "Experience" },
      { id: "c6", label: "CTA" }
    ],
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z"
  };
  const vm = buildPrEvidenceVm({
    campaign: prCampaignToDraft(campaign),
    rows: [row]
  });
  const html = renderToStaticMarkup(
    React.createElement(EvidenceLedger, {
      rows: vm.ledger.rows
    })
  );

  assert.match(html, /data-pr-evidence-source-link="true"/);
  assert.match(html, /href="https:\/\/www\.threads\.net\/@alpha\/post\/1"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /Open original Threads post by alpha/);
});

test("PR Evidence ledger rows use audit numbering and editorial quote blocks", () => {
  const campaign: PrCampaign = {
    id: "campaign-audit",
    sessionId: "session-pr",
    name: "Launch",
    briefText: "Brief",
    criteria: [
      { id: "c1", label: "Campaign" },
      { id: "c2", label: "Hashtag" },
      { id: "c3", label: "Message" },
      { id: "c4", label: "Venue" },
      { id: "c5", label: "Experience" },
      { id: "c6", label: "CTA" }
    ],
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z"
  };
  const rows: PrEvidenceRow[] = [
    {
      id: "row-audit-1",
      campaignId: "campaign-audit",
      itemId: "item-1",
      postUrl: "https://www.threads.net/@alpha/post/1",
      authorHandle: "alpha",
      caption: "Audience quote one with enough text to read like a PR evidence clipping.",
      metrics: { likes: 12, comments: 3, reposts: 1 },
      criteriaMatches: { c1: true, c2: false, c3: true, c4: false, c5: false, c6: false },
      collectedAt: "2026-05-26T00:00:00.000Z"
    },
    {
      id: "row-audit-2",
      campaignId: "campaign-audit",
      itemId: "item-2",
      postUrl: "https://www.threads.net/@beta/post/2",
      authorHandle: "beta",
      caption: "Second audience quote that should receive the 02 audit index.",
      metrics: { likes: 4, comments: 1, reposts: 0 },
      criteriaMatches: { c1: false, c2: true, c3: false, c4: false, c5: false, c6: false },
      collectedAt: "2026-05-26T00:01:00.000Z"
    }
  ];
  const vm = buildPrEvidenceVm({
    campaign: prCampaignToDraft(campaign),
    rows
  });
  const html = renderToStaticMarkup(
    React.createElement(prEvidenceViewTestables.EvidenceLedger, {
      rows: vm.ledger.rows
    })
  );

  assert.match(html, /data-pr-evidence-ledger-style="audit"/);
  assert.match(html, /data-pr-evidence-row="audit"/);
  assert.match(html, /data-pr-evidence-audit-number="01"/);
  assert.match(html, /data-pr-evidence-audit-number="02"/);
  assert.match(html, /data-quote-block="shared"/);
  assert.match(html, /font-style:italic/);
  assert.match(html, /grid-template-columns:34px minmax\(0, 1fr\)/);
  assert.doesNotMatch(html, /min-width:1320/);
});

test("PrEvidenceView keeps metrics actions prominent and avoids horizontal inspection tables", () => {
  const html = renderPrEvidenceView();
  const previewCampaign: PrCampaign = {
    id: "campaign-1",
    sessionId: "session-pr",
    name: "Launch",
    briefText: "Brief",
    criteria: [
      { id: "c1", label: "Campaign" },
      { id: "c2", label: "Hashtag" },
      { id: "c3", label: "Message" },
      { id: "c4", label: "Venue" },
      { id: "c5", label: "Experience" },
      { id: "c6", label: "CTA" }
    ],
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z"
  };
  const previewRows: PrEvidenceRow[] = [{
    id: "row-1",
    campaignId: "campaign-1",
    itemId: "item-1",
    postUrl: "https://www.threads.net/@alpha/post/1",
    authorHandle: "alpha",
    caption: "Launch post with enough text to inspect all CSV fields.",
    metrics: { likes: 12, comments: 3, reposts: 1, views: 4200, followers: 987 },
    criteriaMatches: { c1: true, c2: false, c3: true, c4: false, c5: false, c6: true },
    collectedAt: "2026-05-26T00:00:00.000Z"
  }];
  const previewVm = buildPrEvidenceVm({
    campaign: prCampaignToDraft(previewCampaign),
    rows: previewRows
  });
  const previewHtml = renderToStaticMarkup(
    React.createElement(prEvidenceViewTestables.CsvPreview, {
      preview: previewVm.csvPreview
    })
  );

  assert.match(html, /data-pr-metrics-action="toolbar"/);
  assert.match(html, /抓取進階指標/);
  assert.match(html, /data-pr-work-tab="metrics"/);
  assert.match(html, /data-pr-match-list="wrap"/);
  assert.match(html, /data-pr-metrics-list="wrap"/);
  assert.match(previewHtml, /data-pr-csv-preview-layout="wrap"/);
  assert.doesNotMatch(previewHtml, /min-width:1320/);
  assert.match(html, /padding-bottom:28px/);
});

test("PR Evidence compact rows use shared typography tokens instead of fractional font drift", () => {
  assert.equal(textStyles.metric.fontSize, 11);
  assert.equal(textStyles.metric.fontWeight, 700);
  assert.equal(textStyles.metric.fontVariantNumeric, "tabular-nums");

  const previewCampaign: PrCampaign = {
    id: "campaign-typography",
    sessionId: "session-pr",
    name: "Launch",
    briefText: "Brief",
    criteria: [
      { id: "c1", label: "Campaign" },
      { id: "c2", label: "Hashtag" },
      { id: "c3", label: "Message" },
      { id: "c4", label: "Venue" },
      { id: "c5", label: "Experience" },
      { id: "c6", label: "CTA" }
    ],
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z"
  };
  const row: PrEvidenceRow = {
    id: "row-typography",
    campaignId: "campaign-typography",
    itemId: "item-typography",
    postUrl: "https://www.threads.net/@alpha/post/1",
    authorHandle: "alpha",
    caption: "Launch post with enough text to inspect all CSV fields.",
    metrics: { likes: 12, comments: 3, reposts: 1, views: 4200, followers: 987 },
    criteriaMatches: { c1: true, c2: false, c3: true, c4: false, c5: false, c6: true },
    collectedAt: "2026-05-26T00:00:00.000Z"
  };

  const vm = buildPrEvidenceVm({
    campaign: prCampaignToDraft(previewCampaign),
    rows: [row]
  });
  const ledgerHtml = renderToStaticMarkup(
    React.createElement(prEvidenceViewTestables.EvidenceLedger, {
      rows: vm.ledger.rows
    })
  );
  const previewHtml = renderToStaticMarkup(
    React.createElement(prEvidenceViewTestables.CsvPreview, {
      preview: vm.csvPreview
    })
  );

  assert.doesNotMatch(`${ledgerHtml}${previewHtml}`, /font-size:(?:9\.5|10\.5|11\.5|12\.5)px/);
});

test("PR Evidence advanced metrics notice includes the first failure reason", () => {
  const notice = prEvidenceViewTestables.summarizeAdvancedMetricsNotice(
    { updated: 0, failed: 5 },
    [
      {
        id: "row-1",
        campaignId: "campaign-1",
        itemId: "item-1",
        postUrl: "https://threads.net/@a/post/1",
        authorHandle: "@a",
        caption: "A",
        metrics: {},
        expectedEngagement: "",
        criteriaMatches: { c1: false, c2: false, c3: false, c4: false, c5: false, c6: false },
        collectedAt: "2026-05-26T06:00:00.000Z",
        advancedMetricsError: "404 Not Found: {\"detail\":\"Not Found\"}"
      }
    ]
  );

  assert.match(notice, /0 列，5 列失敗/);
  assert.match(notice, /第一個錯誤：404 Not Found/);
});

test("Product and PR Evidence modes render no folder strip", () => {
  for (const activeFolderMode of ["product", "pr-evidence"] as const) {
    const html = renderToStaticMarkup(
      React.createElement(InPageCollectorFolderControls, {
        app: {
          activeFolderMode,
          activeFolder: { items: [] },
          signals: [],
          productSignalAnalyses: []
        } as any
      })
    );

    assert.equal(html, "", `${activeFolderMode} mode should render nothing`);
    assert.doesNotMatch(html, /Product workspace/);
    assert.doesNotMatch(html, /Select a folder/);
    assert.doesNotMatch(html, /Rename folder/);
    assert.doesNotMatch(html, /Create folder/);
  }
});

test("Topic strip uses real topics instead of generated workspace sessions", () => {
  const topicSession = {
    ...buildSession(),
    name: "work",
    mode: "topic" as const
  };
  const legacySession = {
    ...buildSession(),
    id: "legacy-session",
    name: "AI discussion",
    mode: "topic" as const
  };
  const html = renderToStaticMarkup(
    React.createElement(InPageCollectorFolderControls, {
      app: {
        activeFolderMode: "topic",
        activeFolder: topicSession,
        snapshot: {
          global: {
            sessions: [topicSession, legacySession],
            activeSessionId: topicSession.id
          }
        },
        topics: [
          { id: "topic-work", sessionId: topicSession.id, name: "work", description: "", status: "watching", tags: [], signalIds: [], pairIds: [], createdAt: "", updatedAt: "" },
          { id: "topic-love", sessionId: topicSession.id, name: "love", description: "", status: "pending", tags: [], signalIds: [], pairIds: [], createdAt: "", updatedAt: "" }
        ],
        selectedTopicId: "topic-love",
        signals: [
          { id: "signal-1", sessionId: topicSession.id, itemId: "item-1", source: "threads", inboxStatus: "unprocessed", capturedAt: "" },
          { id: "signal-2", sessionId: topicSession.id, itemId: "item-2", source: "threads", inboxStatus: "assigned", capturedAt: "" }
        ],
        showFolderPrompt: false,
        isRenamingFolder: false,
        editingFolderName: "",
        folderName: "",
        setIsRenamingFolder: () => undefined,
        setShowFolderPrompt: () => undefined,
        setEditingFolderName: () => undefined,
        setFolderName: () => undefined,
        onSetActiveSession: () => undefined,
        onSelectTopicTarget: () => undefined,
        onCreateTopic: () => undefined,
        onCreateFolder: () => undefined,
        onRenameFolder: () => undefined,
        onDeleteFolder: () => undefined
      } as any
    })
  );

  assert.match(html, /value="topic-work"/);
  assert.match(html, /work/);
  assert.match(html, /value="topic-love" selected="">love/);
  assert.match(html, /1 未分流/);
  assert.match(html, /2 主題/);
  assert.doesNotMatch(html, /Product workspace/);
  assert.doesNotMatch(html, /AI discussion/);
  assert.doesNotMatch(html, /Topic workspace/);
  assert.doesNotMatch(html, /42 saved/);
});

test("Topic folder strip counts inbox and topics instead of saved backing items", () => {
  const topicSession = { ...buildSession(), mode: "topic" as const };
  const archiveSession = { ...buildSession(), mode: "archive" as const, name: "Archive" };
  const { formatWorkspaceOptionLabel, formatTopicOptionLabel, buildTopicStatusBadges } = inPageCollectorFolderControlsTestables;

  assert.equal(formatWorkspaceOptionLabel(topicSession), "Topic workspace");
  assert.equal(formatTopicOptionLabel({ id: "topic-love", name: "love" } as any), "love");
  assert.equal(formatWorkspaceOptionLabel(archiveSession), "Archive (1)");
  assert.deepEqual(
    buildTopicStatusBadges({
      topics: [{ id: "topic-work" }],
      signals: [
        { id: "signal-1", inboxStatus: "unprocessed" },
        { id: "signal-2", inboxStatus: "assigned" }
      ]
    } as any),
    ["1 未分流", "1 主題"]
  );
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
      draftLayoutPreferences: {
        productSignalCardLayout: "marginalia",
        topicSynthesisLayout: "console",
        compareResultLayout: "chapters"
      },
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
      storageUsage: {
        bytesInUse: 2048,
        quotaBytes: 10 * 1024 * 1024
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
      onDraftLayoutPreferencesChange: () => undefined,
      onDraftProductProfileChange: () => undefined,
      onProductProfileSeedTextChange: () => undefined,
      onInitProductProfile: () => undefined,
      onSessionModeChange: () => undefined,
      onClearProductCache: () => undefined,
      createContextFileId: (kind, name) => `ctx_${kind}_${name}`,
      onSaveSettings: () => undefined
    })
  );

  assert.match(html, /data-mode-header="settings"/);
  assert.match(html, /連線設定與 API 金鑰存於本機，不會上傳。/);
  assert.doesNotMatch(html, /field drawer/);
  assert.match(html, /data-settings-surface="drawer"/);
  assert.match(html, /data-settings-group="folder"/);
  assert.doesNotMatch(html, /data-settings-group="layout"/);
  assert.match(html, /data-settings-group="connection"/);
  assert.match(html, /data-settings-group="keys"/);
  assert.match(html, /data-settings-group="product"/);
  assert.match(html, /data-settings-group="connection"[^>]*border-radius:20px/);
  assert.match(html, /data-settings-group="connection"[^>]*0 4px 14px -4px rgba\(27,26,23,0\.07\)/);
  assert.match(html, /資料夾類型/);
  assert.match(html, /產品觀察（Product）/);
  assert.doesNotMatch(html, /版面偏好/);
  assert.doesNotMatch(html, /Product signal card/);
  assert.doesNotMatch(html, /Topic synthesis/);
  assert.doesNotMatch(html, /Compare result/);
  assert.match(html, /Connection/);
  assert.match(html, /Storage 用量：2\.0 KB \/ 10 MB/);
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
  assert.match(html, /data-product-cache-reset="true"/);
  assert.match(html, /清除 Product cache/);
  assert.match(html, /只會移除 Product 分析、判讀與編譯脈絡/);
  assert.match(html, /Save settings/);
  assert.match(html, /data-settings-save-status="success"/);
  assert.match(html, /ProductContext 已編譯/);
  assert.doesNotMatch(html, /Welcome|Get started/);
});

test("ProductSignalView shows real readiness state without fake AI results", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "saved-signals",
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

  assert.match(html, /data-product-signal-view="saved-signals"/);
  assert.match(html, /已存訊號/);
  assert.match(html, /1 signals/);
  assert.match(html, /0 analyses/);
  assert.match(html, /ProductProfile/);
  assert.match(html, /ProductContext/);
  assert.match(html, /data-saved-signals-route="true"/);
  assert.match(html, /data-saved-signal-row="compact"/);
  assert.match(html, /data-product-pending-card="topic-card"/);
  assert.match(html, /data-product-pending-card="topic-card"[^>]*border:none/);
  assert.doesNotMatch(html, /data-saved-signals-batch-export="true"/);
  assert.match(html, /尚未抓取/);
  assert.match(html, /按分析會先送出抓取請求/);
  assert.doesNotMatch(html, /航班觀察|fixture|score/i);
});

test("ProductSignalView surfaces backend health errors even when analyses already exist", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "saved-signals",
      signals: [
        {
          id: "signal_backend",
          sessionId: "session_product",
          itemId: "item_backend",
          source: "threads",
          inboxStatus: "processed",
          capturedAt: "2026-06-10T00:00:00.000Z"
        }
      ],
      analyses: [
        {
          signalId: "signal_backend",
          signalType: "learning",
          signalSubtype: "browser_automation",
          contentType: "discussion_starter",
          contentSummary: "使用者想知道 extension backend 是否仍然可用。",
          relevance: 5,
          relevantTo: ["coreWorkflows"],
          whyRelevant: "直接影響 Product 分析流程。",
          verdict: "watch",
          reason: "需要持續觀察 backend 健康狀態。",
          experimentHint: "在主 UI 顯示 backend health。",
          evidenceRefs: ["e1"],
          productContextHash: "ctx",
          promptVersion: "v1",
          analyzedAt: "2026-06-10T00:00:00.000Z",
          status: "complete"
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
            importedAt: "2026-06-10T00:00:00.000Z",
            charCount: 14
          }
        ]
      },
      signalPreviewById: {},
      signalReadinessById: {
        signal_backend: {
          status: "ready",
          itemStatus: "succeeded"
        }
      },
      backendError: "Backend 無法連線。請到設定確認 backend URL，或先啟動 ingest backend。",
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /Backend 離線/);
  assert.match(html, /Backend 無法連線。請到設定確認 backend URL/);
  assert.doesNotMatch(html, /AI enabled|分析完成/);
  assert.doesNotMatch(html, /✓ 已就緒/);
});

test("ProductSignalView keeps existing analyses visible when signal inbox is empty", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "saved-signals",
      signals: [],
      analyses: [
        {
          signalId: "signal_orphan",
          signalType: "noise",
          signalSubtype: "mobile_capture",
          contentType: "mixed",
          contentSummary: "使用者想把 Threads 討論直接變成可執行任務。",
          relevance: 5,
          relevantTo: ["coreWorkflows"],
          whyRelevant: "對應 Product mode 的核心承諾。",
          verdict: "park",
          reason: "需求具體，適合先做小實驗。",
          experimentHint: "做一個 collect-to-task 的最小流程。",
          evidenceRefs: ["e1"],
          productContextHash: "ctx",
          promptVersion: "v1",
          analyzedAt: "2026-05-27T06:00:00.000Z",
          status: "complete"
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
            importedAt: "2026-05-27T00:00:00.000Z",
            charCount: 14
          }
        ]
      },
      signalPreviewById: {},
      signalReadinessById: {},
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-product-recovered-analyses="true"/);
  assert.match(html, /data-product-load-state="recovering"/);
  assert.match(html, /已有 1 筆既有分析，但目前 signal 清單是空的/);
  assert.match(html, /使用者想把 Threads 討論直接變成可執行任務。/);
  assert.match(html, /分析完成/);
  assert.match(html, /噪音/);
  assert.doesNotMatch(html, /前提不符/);
  assert.doesNotMatch(html, /signal_orphan/);
  assert.doesNotMatch(html, /尚未有 AI 分析結果/);
});

test("ProductSignalView shows hydration state instead of an empty result while product data loads", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "saved-signals",
      signals: [],
      analyses: [],
      isHydrating: true,
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
            importedAt: "2026-06-10T00:00:00.000Z",
            charCount: 14
          }
        ]
      },
      signalPreviewById: {},
      signalReadinessById: {},
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-product-hydrating="true"/);
  assert.match(html, /data-product-load-state="loading"/);
  assert.match(html, /讀取中/);
  assert.doesNotMatch(html, /No result|尚無結果/);
  assert.doesNotMatch(html, /尚未有 AI 分析結果/);
});

test("ProductSignalView action route uses recovered analyses when signal inbox is empty", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "actionable-filter",
      signals: [],
      analyses: [
        {
          signalId: "signal_recovered_action",
          signalType: "demand",
          signalSubtype: "agent_workflow",
          contentType: "mixed",
          contentSummary: "團隊想把討論整理成可交付的 agent brief。",
          relevance: 5,
          relevantTo: ["coreWorkflows"],
          whyRelevant: "直接對應產品工作流。",
          verdict: "try",
          reason: "可以先做小型 action board。",
          experimentHint: "整理候選行動。",
          evidenceRefs: ["e1"],
          productContextHash: "ctx",
          promptVersion: "v1",
          analyzedAt: "2026-05-27T07:00:00.000Z",
          status: "complete"
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
            importedAt: "2026-05-27T00:00:00.000Z",
            charCount: 14
          }
        ]
      },
      signalPreviewById: {},
      signalReadings: [],
      onReviewSignalReading: async () => ({ ok: false, error: "unused" }),
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-actionable-insights-board="true"/);
  assert.match(html, /團隊想把討論整理成可交付的 agent brief。/);
  assert.doesNotMatch(html, /data-signal-reading-review-workspace/);
  assert.doesNotMatch(html, /0 則訊號已評估/);
});

test("ProductSignalView only shows remove controls when delete is wired", () => {
  const baseProps = {
    kind: "saved-signals" as const,
    signals: [
      {
        id: "signal_a",
        sessionId: "session_a",
        itemId: "item_a",
        source: "threads" as const,
        inboxStatus: "unprocessed" as const,
        capturedAt: "2026-05-14T07:00:00.000Z"
      }
    ],
    productProfile: null,
    analyses: [],
    signalPreviewById: {
      signal_a: "User asks whether agents can turn research into usable output."
    },
    signalReadinessById: {
      signal_a: {
        status: "saved" as const,
        itemStatus: "saved" as const
      }
    },
    onAnalyze: () => undefined
  };

  const unwiredHtml = renderToStaticMarkup(
    productSignalViewElement( baseProps)
  );
  const wiredHtml = renderToStaticMarkup(
    productSignalViewElement( {
      ...baseProps,
      onRemoveSignal: () => undefined
    })
  );

  assert.doesNotMatch(unwiredHtml, /aria-label="移除此訊號"/);
  assert.match(wiredHtml, /aria-label="移除此訊號"/);
});

test("ProductSignalView keeps Agent export off Product action pages", () => {
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
    onAnalyze: () => undefined
  };

  const savedHtml = renderToStaticMarkup(
    productSignalViewElement( { ...baseProps, kind: "saved-signals", onGoToActionable: () => undefined })
  );
  const actionableHtml = renderToStaticMarkup(
    productSignalViewElement( {
      ...baseProps,
      kind: "actionable-filter",
      activeFolderId: "session_a",
      exportFolders: [
        { id: "session_a", name: "DLens Signals", itemCount: 3 },
        { id: "session_b", name: "AI Workflow Watchlist", itemCount: 2 }
      ],
      onExportSignalPackets: async () => ({
        ok: true,
        exportResult: {
          format: "html",
          content: "<!doctype html>",
          filename: "dlens.html",
          mimeType: "text/html;charset=utf-8",
          packetCount: 1,
          generatedAt: "2026-05-19T08:30:00.000Z"
        }
      })
    })
  );

  assert.match(savedHtml, /data-saved-signals-batch-export="true"/);
  assert.match(savedHtml, /行動簡報匯出/);
  assert.match(savedHtml, /原文優先/);
  assert.match(savedHtml, /精簡決策/);
  assert.match(savedHtml, /複製行動簡報/);
  assert.match(savedHtml, /data-product-action-cta="true"[^>]*border-radius:20px/);
  assert.match(actionableHtml, /data-actionable-insights-board="true"/);
  assert.doesNotMatch(actionableHtml, /data-saved-signals-batch-export="true"/);
  assert.doesNotMatch(actionableHtml, /Agent export/);
  assert.doesNotMatch(actionableHtml, /原文優先/);
  assert.doesNotMatch(actionableHtml, /精簡決策/);
  assert.doesNotMatch(actionableHtml, /複製 Agent Brief|複製行動簡報/);
  assert.doesNotMatch(actionableHtml, /data-signal-packet-html-export="true"/);
  assert.doesNotMatch(actionableHtml, /data-signal-packet-format-option="html"/);
  assert.doesNotMatch(actionableHtml, /data-signal-packet-format-option="jsonl"/);
  assert.doesNotMatch(actionableHtml, /匯出 HTML Reading/);
  assert.doesNotMatch(actionableHtml, /JSONL Packet/);
  assert.doesNotMatch(actionableHtml, /data-agent-brief-copy-status/);
  assert.doesNotMatch(actionableHtml, /data-batch-export-selection-row="true"/);
  assert.doesNotMatch(actionableHtml, /# Agent Brief/);
});

test("PendingSignalCard surfaces the backend job error while a crawl is retrying", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "saved-signals",
      signals: [
        {
          id: "signal_fetching",
          sessionId: "session_a",
          itemId: "item_fetching",
          source: "threads",
          inboxStatus: "unprocessed",
          capturedAt: "2026-04-27T00:00:00.000Z"
        }
      ],
      analyses: [],
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
      signalReadinessById: {
        signal_fetching: {
          status: "crawling",
          itemStatus: "queued",
          lastError: "BrowserType.launch: Executable doesn't exist at /Users/tung/Library/Caches/ms-playwright/chromium"
        }
      },
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /抓取中（重試中）/);
  assert.match(html, /backend 回報錯誤/);
  assert.match(html, /BrowserType\.launch/);
  assert.doesNotMatch(html, /等待 backend 完成 ThreadReadModel/);
});

test("ProductSignalView shows a spinner for crawling pending signals", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "saved-signals",
      signals: [
        {
          id: "signal_fetching",
          sessionId: "session_a",
          itemId: "item_fetching",
          source: "threads",
          inboxStatus: "unprocessed",
          capturedAt: "2026-04-27T00:00:00.000Z"
        }
      ],
      analyses: [],
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
      signalReadinessById: {
        signal_fetching: {
          status: "crawling",
          itemStatus: "running"
        }
      },
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /抓取中/);
  assert.match(html, /data-pending-signal-spinner="true"/);
  assert.match(html, /animation:dlens-spin 0\.8s linear infinite/);
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
    productSignalViewElement( {
      ...baseProps,
      kind: "classification"
    })
  );
  const actionableHtml = renderToStaticMarkup(
    productSignalViewElement( {
      ...baseProps,
      kind: "actionable-filter"
    })
  );

  assert.match(classificationHtml, /分類構成/);
  assert.match(classificationHtml, /data-product-classification-board="true"[^>]*padding-bottom:76px/);
  assert.match(classificationHtml, /系統挑出的內容/);
  assert.match(classificationHtml, /討論串內容/);
  assert.match(classificationHtml, /data-scan-list="product-classification"/);
  assert.match(classificationHtml, /data-scan-row="true"/);
  assert.match(classificationHtml, /data-classification-row-indicator="true"/);
  assert.match(classificationHtml, /Users want a one-tap mobile save flow/);
  assert.doesNotMatch(classificationHtml, /relevance 5 of 5/);
  assert.doesNotMatch(classificationHtml, /collected posts|mobile share extension|mixed/);
  assert.match(classificationHtml, /AI 已分類 1 則訊號/);
  assert.match(classificationHtml, /行動分享入口/);
  assert.match(classificationHtml, /混合內容/);
  assert.doesNotMatch(classificationHtml, /最新在前/);
  assert.match(classificationHtml, /AI 建議分類/);
  assert.doesNotMatch(classificationHtml, /Agent 任務卡|實驗假設草稿/);
  assert.match(classificationHtml, /值得嘗試/);
  assert.doesNotMatch(classificationHtml, /R5/);

  assert.match(actionableHtml, /1 則訊號已評估/);
  assert.match(actionableHtml, /可直接試的做法/);
  assert.match(actionableHtml, /A one-tap mobile save flow would fit my day/);
  assert.doesNotMatch(actionableHtml, /儲存至行動清單|>\+<\/span> 儲存/);
  assert.doesNotMatch(actionableHtml, /AI 實驗建議（輔助）/);
  assert.doesNotMatch(actionableHtml, /AI 判斷依據/);
  assert.doesNotMatch(actionableHtml, /Agent 任務（可複製）/);
  assert.doesNotMatch(actionableHtml, /Agent 任務卡 ·/);
  assert.doesNotMatch(actionableHtml, /這個任務建議/);
  assert.doesNotMatch(actionableHtml, /\d+\s+likes/);
  assert.doesNotMatch(actionableHtml, /TRY experiment|relevance 5\/5|signal type/);
  assert.match(actionableHtml, /排入小實驗/);
  assert.match(actionableHtml, /相關度 5\/5/);
  assert.doesNotMatch(actionableHtml, /R5/);
  // Marginalia owns the experiment and judgment slots in its main column / rail.
  assert.doesNotMatch(actionableHtml, /data-product-panel="experiment"/);
  assert.doesNotMatch(actionableHtml, /data-product-panel-badge="experiment"/);
  // Agent task prompt cards are no longer part of the primary action card flow.
  assert.doesNotMatch(actionableHtml, /data-agent-task-card="true"/);
  assert.doesNotMatch(actionableHtml, /data-agent-task-badge="true"/);
  // source quotes intentionally keeps no badge
  assert.doesNotMatch(actionableHtml, /data-product-panel-badge="source-quotes"/);
  assert.doesNotMatch(actionableHtml, /data-agent-task-feedback-row="true"/);
  // Motion: CSS injected via document.head in content script, NOT as React-rendered <style>.
  // Only className / data hooks need to exist in the HTML.
  assert.doesNotMatch(actionableHtml, /data-dlens-product-motion/);
  assert.match(actionableHtml, /class="dlens-card-lift"/);
  assert.match(actionableHtml, /class="dlens-details-smooth"/);
  assert.match(actionableHtml, /data-verdict-filter-tiles="true"/);
  assert.match(actionableHtml, /data-verdict-filter-plate="true"/);
  assert.match(actionableHtml, /data-verdict-tile-count="true"/);
  assert.match(actionableHtml, /data-dlens-motion-card="true"/);
  assert.match(actionableHtml, /data-dlens-smooth-details="true"/);
  // The exported CSS constant must include reduced-motion and grid-template-rows animation
  assert.ok(DLENS_MOTION_CSS.includes("prefers-reduced-motion"), "CSS must guard reduced-motion");
  assert.ok(DLENS_MOTION_CSS.includes("grid-template-rows"), "CSS must animate details panel");
  assert.ok(!DLENS_MOTION_CSS.includes("::details-content"), "CSS must not use ::details-content");
  assert.match(DLENS_MOTION_CSS, /\[data-dlens-control="true"\] \.dlens-card-lift/);
  assert.match(DLENS_MOTION_CSS, /\[data-dlens-control="true"\] \[data-rail-icon\]/);
  assert.match(DLENS_MOTION_CSS, /\[data-dlens-control="true"\] \[data-bump-number="true"\]/);
  assert.match(DLENS_MOTION_CSS, /\[data-dlens-control="true"\] \[data-signal-reading-filed-flash="true"\]/);
  assert.match(DLENS_MOTION_CSS, /\[data-dlens-control="true"\] \[data-verdict-filter-plate\]/);
  assert.match(DLENS_MOTION_CSS, /\[data-dlens-control="true"\] \[data-verdict-tile-count\]/);
  assert.match(DLENS_MOTION_CSS, /\[data-dlens-control="true"\] \[data-button-shimmer="true"\]/);
  assert.match(DLENS_MOTION_CSS, /\[data-dlens-control="true"\] \[data-signal-reading-compose-flash="true"\]/);
  assert.doesNotMatch(DLENS_MOTION_CSS, /^\.dlens-card-lift/m);

  const secondSignal = {
    id: "signal_b",
    sessionId: "session_a",
    itemId: "item_b",
    source: "threads" as const,
    inboxStatus: "unprocessed" as const,
    capturedAt: "2026-04-27T00:01:00.000Z"
  };
  const secondAnalysis = {
    ...baseProps.analyses[0],
    signalId: "signal_b",
    signalSubtype: "mobile_save_followup",
    contentSummary: "Users also want the save flow to keep source context.",
    analyzedAt: "2026-04-27T02:00:00.000Z"
  };
  const classificationTwoHtml = renderToStaticMarkup(
    productSignalViewElement( {
      ...baseProps,
      kind: "classification",
      signals: [...baseProps.signals, secondSignal],
      analyses: [...baseProps.analyses, secondAnalysis],
      signalPreviewById: {
        ...baseProps.signalPreviewById,
        signal_b: "Second Threads post preview"
      }
    })
  );
  assert.match(classificationTwoHtml, /最新在前/);
});

function buildActionableCardFixture() {
  const analysis = {
    signalId: "signal_verdict",
    signalType: "demand" as const,
    signalSubtype: "pm_document_generation",
    contentType: "discussion_starter" as const,
    contentSummary: "PM 想把外部討論轉成可交付文件。",
    relevance: 5 as const,
    relevantTo: ["coreWorkflows" as const],
    referenceType: "workflow_pattern" as const,
    referenceLabel: "把討論轉成文件工作流",
    referenceTakeaway: "先用小型 agent task 驗證交付格式是否可重複。",
    whyRelevant: "對應 Product mode 的核心承諾。",
    verdict: "try" as const,
    reason: "討論裡已經有明確的輸入、處理與輸出。",
    experimentHint: "用一個 Threads 討論串產出 release-note 草稿。",
    agentTaskSpec: {
      targetAgent: "codex" as const,
      taskTitle: "產出 release-note 草稿",
      taskPrompt: "Inspect the discussion and draft a release-note workflow.",
      requiredContext: ["README", "sample thread"]
    },
    evidenceRefs: ["e1"],
    evidenceNotes: [
      {
        ref: "e1",
        quoteSummary: "提到把 Slack/Jira 訊號變成 release notes。",
        whyItMatters: "把資料來源、處理邏輯和交付物說清楚。",
        reusablePattern: "多來源討論轉交付文件",
        whyItWorks: "它把輸入與輸出格式固定下來。",
        grounding: "text_grounded" as const,
        workflowStack: ["Threads", "Codex", "Markdown"],
        copyRecipeMarkdown: "- 收集討論串\n- 交給 agent 摘要\n- 輸出 Markdown 草稿",
        tradeoff: "需要人手檢查語氣。"
      }
    ],
    productContextHash: "ctx_verdict",
    promptVersion: "v16",
    analyzedAt: "2026-05-13T01:00:00.000Z",
    status: "complete" as const
  };
  const evidenceBySignalId = {
    signal_verdict: [
      {
        ref: "e1",
        id: "reply_1",
        author: "pm",
        text: "可以把 Slack 和 Jira 討論交給 agent 寫 release notes。",
        likeCount: 9
      }
    ]
  };

  return {
    signal: {
      id: "signal_verdict",
      sessionId: "session_verdict",
      itemId: "item_verdict",
      source: "threads" as const,
      inboxStatus: "unprocessed" as const,
      capturedAt: "2026-05-13T00:00:00.000Z"
    },
    analysis,
    productProfile: {
      name: "DLens",
      category: "Product intelligence",
      audience: "PM",
      contextText: "README context",
      contextFiles: [{ id: "readme", name: "README.md", kind: "readme" as const, importedAt: "2026-05-13T00:00:00.000Z", charCount: 14 }]
    },
    evidenceBySignalId
  };
}

function renderActionableCardFixture(
  layout?: "verdict" | "marginalia",
  analysisOverride: Partial<ReturnType<typeof buildActionableCardFixture>["analysis"]> = {}
) {
  const fixture = buildActionableCardFixture();
  const analysis = { ...fixture.analysis, ...analysisOverride };
  const testables = productSignalViewTestables as typeof productSignalViewTestables & {
    ActionableItemCard: React.ComponentType<{
      analysis: typeof analysis;
      index: number;
      evidenceBySignalId: typeof fixture.evidenceBySignalId;
      historicalAnalyses: typeof analysis[];
      agentTaskFeedback: [];
      layout?: "verdict" | "marginalia";
    }>;
  };

  return renderToStaticMarkup(
    React.createElement(testables.ActionableItemCard, {
      analysis,
      index: 0,
      evidenceBySignalId: fixture.evidenceBySignalId,
      historicalAnalyses: [analysis],
      agentTaskFeedback: [],
      ...(layout ? { layout } : {})
    })
  );
}

function extractTestIdSection(html: string, testId: string, closeTag: string) {
  const marker = `data-testid="${testId}"`;
  const markerIndex = html.indexOf(marker);
  assert.ok(markerIndex >= 0, `${testId} must exist`);
  const tagStart = html.lastIndexOf("<", markerIndex);
  const closeIndex = html.indexOf(closeTag, markerIndex);
  assert.ok(tagStart >= 0 && closeIndex >= 0, `${testId} section must close with ${closeTag}`);
  return html.slice(tagStart, closeIndex + closeTag.length);
}

test("ProductSignalView actionable cards expose marginalia layout slots", () => {
  const fixture = buildActionableCardFixture();
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "actionable-filter",
      signals: [fixture.signal],
      analyses: [fixture.analysis],
      productProfile: fixture.productProfile,
      evidenceBySignalId: fixture.evidenceBySignalId,
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-marginalia-layout="true"/);
  assert.match(html, /data-testid="marginalia-main"/);
  assert.match(html, /data-testid="marginalia-rail"/);
  assert.match(html, /data-testid="marginalia-headline"[^>]*>多來源討論轉交付文件/);
  assert.match(html, /data-testid="marginalia-reason"/);
  assert.match(html, /data-testid="marginalia-experiment"/);
  assert.match(html, /data-testid="marginalia-footnotes"/);
  assert.doesNotMatch(html, /FOOTNOTES/);
  assert.match(html, /可以把 Slack 和 Jira 討論交給 agent 寫 release notes/);
});

test("ActionableItemCard marginalia rail contains verdict, relevance, and task slots", () => {
  const html = renderActionableCardFixture("marginalia");

  assert.match(html, /data-testid="marginalia-rail"/);
  assert.match(html, /data-testid="rail-verdict"[^>]*data-verdict-value="try"[^>]*>值得嘗試/);
  assert.match(html, /data-testid="rail-relevance"/);
  assert.match(html, /data-testid="rail-task"/);
  assert.match(html, /任務 ›/);
  assert.match(html, /產出 release-note 草稿/);
});

test("ActionableItemCard marginalia rail does not duplicate main-column prose", () => {
  const fixture = buildActionableCardFixture();
  const html = renderActionableCardFixture("marginalia", { referenceLabel: "" });
  const railHtml = extractTestIdSection(html, "marginalia-rail", "</aside>");
  const taskHtml = extractTestIdSection(html, "rail-task", "</div>");

  assert.ok(
    !railHtml.includes(fixture.analysis.contentSummary),
    "rail must not duplicate main-column drop-cap contentSummary"
  );
  assert.ok(
    !railHtml.includes(fixture.analysis.experimentHint),
    "rail TASK must not duplicate main-column TRY block"
  );
  assert.ok(taskHtml.includes(fixture.analysis.agentTaskSpec.taskTitle), "rail TASK must use taskTitle when available");
});

test("ActionableItemCard marginalia removes repeated support chrome", () => {
  const html = renderActionableCardFixture("marginalia");
  const mainHtml = extractTestIdSection(html, "marginalia-main", "</main>");

  assert.doesNotMatch(mainHtml, /值得嘗試/);
  assert.match(mainHtml, /需求/);
  assert.doesNotMatch(html, /FOOTNOTES/);
  assert.doesNotMatch(html, /data-product-panel="experiment"/);
  assert.doesNotMatch(html, /AI 判斷依據（輔助）/);
  assert.match(html, /data-workflow-card-layout="flat"/);
  assert.match(html, /data-workflow-row-layout="stacked"/);
});

test("ActionableItemCard renders noise and park verdicts as exclusion cards without workflow task framing", () => {
  const html = renderActionableCardFixture("marginalia", {
    signalType: "noise",
    signalSubtype: "user_sentiment_reflection",
    verdict: "park",
    relevance: 1,
    contentSummary: "這只是一般情緒宣洩，沒有直接產品參考。",
    reason: "沒有可採用的產品需求或 workflow pattern。",
    referenceType: "no_direct_fit",
    referenceLabel: "暫無直接用途",
    referenceTakeaway: "保留為背景噪音，不排進 Agent 任務。",
    experimentHint: "",
    agentTaskSpec: undefined
  });

  assert.match(html, /data-exclusion-card="true"/);
  assert.match(html, /噪音 \/ 前提不符/);
  assert.match(html, /排除原因/);
  assert.match(html, /沒有可採用的產品需求或 workflow pattern/);
  assert.match(html, /暫無直接用途/);
  assert.doesNotMatch(html, /data-testid="marginalia-experiment"/);
  assert.doesNotMatch(html, /可借用 workflow|TASK ›|任務 ›|排入小實驗|保留觀察/);
});

test("ActionableItemCard defaults to verdict layout without layout prop", () => {
  const html = renderActionableCardFixture();

  assert.match(html, /data-verdict-layout="true"/);
  assert.match(html, /data-testid="verdict-panel"/);
  assert.match(html, /data-testid="verdict-label"[^>]*data-verdict-value="try"[^>]*>值得嘗試/);
  assert.match(html, /data-testid="insight-headline"[^>]*>多來源討論轉交付文件/);
  assert.match(html, /data-testid="evidence-list"/);
  assert.match(html, /data-testid="task-slot"/);
  assert.match(html, /data-testid="metadata-strip"/);
  assert.match(html, /data-relevance-bars="true"/);
  assert.doesNotMatch(html, /data-product-panel="experiment"/);
  assert.doesNotMatch(html, /AI 判斷依據（輔助）/);
  assert.match(html, /data-workflow-card-layout="boxed"/);
  assert.match(html, /可借用 workflow/);
  assert.match(html, /5\/5/);
  assert.match(html, /把討論轉成文件工作流/);
  assert.match(html, /討論裡已經有明確的輸入、處理與輸出/);
  assert.match(html, /1 則原文證據/);
  assert.match(html, /產出 release-note 草稿/);
  assert.match(html, /分類：需求/);
  assert.match(html, /子型：PM 文件產出/);
  assert.match(html, /Prompt：v16/);
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
            grounding: "model_inferred" as const,
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
    productSignalViewElement( {
      ...v3Props,
      kind: "actionable-filter",
      cardLayout: "verdict"
    })
  );

  assert.match(actionableHtml, /可借用 workflow/);
  assert.equal((actionableHtml.match(/可借用 workflow/g) ?? []).length, 1);
  assert.match(actionableHtml, /data-actionable-title="workflow"[^>]*>多來源工作流轉文件/);
  assert.doesNotMatch(actionableHtml, /data-actionable-title="workflow"[^>]*>用 Claude Skill 讀 Slack/);
  assert.match(actionableHtml, /可借用模式/);
  assert.doesNotMatch(actionableHtml, /如何照抄/);
  assert.doesNotMatch(actionableHtml, /讀取 Slack thread/);
  assert.doesNotMatch(actionableHtml, /Release Note \/ Confluence 文件/);
  assert.doesNotMatch(actionableHtml, /Slack\/Jira -&gt; Claude Skill/);
  assert.match(actionableHtml, /data-workflow-grounding="model_inferred"/);
  assert.match(actionableHtml, /AI 推斷，請交叉驗證原文/);
  assert.match(actionableHtml, /判讀依據/);
  assert.match(actionableHtml, /data-workflow-section-tone="copy"[^>]*style="[^"]*border-left:4px solid #3f5a3b[^"]*"/);
  assert.match(actionableHtml, /data-workflow-section-tone="why"[^>]*style="[^"]*border-left:4px solid #1a2e4f[^"]*"/);
  assert.match(actionableHtml, /data-workflow-section-tone="tradeoff"[^>]*style="[^"]*border-left:4px solid #a16a17[^"]*"/);
  assert.match(actionableHtml, /data-workflow-field-label="copy"[^>]*style="[^"]*font-weight:700[^"]*"/);
  assert.match(actionableHtml, /data-workflow-field-label="why"[^>]*style="[^"]*font-weight:700[^"]*"/);
  assert.match(actionableHtml, /data-workflow-field-label="tradeoff"[^>]*style="[^"]*font-weight:700[^"]*"/);
  assert.doesNotMatch(actionableHtml, /data-workflow-field-label="(?:copy|why|tradeoff)"[^>]*style="[^"]*font-weight:8/);
  assert.match(actionableHtml, /多來源工作流轉文件/);
  assert.match(actionableHtml, /引用理由：直接驗證 PM document workflow/);
  assert.doesNotMatch(actionableHtml, /AI 摘要：PM 想把 Threads 討論轉成可交付文件/);
  assert.doesNotMatch(actionableHtml, /讀取 Slack thread 與 Jira tickets/);
  assert.doesNotMatch(actionableHtml, /輸出 Release Note \/ Confluence 文件/);
  assert.match(actionableHtml, /限制/);
  assert.match(actionableHtml, /需要各工具授權與資料讀取權限/);
  assert.match(actionableHtml, /把資料來源、處理邏輯和交付物分清楚/);
  assert.doesNotMatch(actionableHtml, /Stack/);
  assert.match(actionableHtml, /text-transform:uppercase/);
  assert.doesNotMatch(actionableHtml, /可用做法（留言原文）/);
  assert.doesNotMatch(actionableHtml, /AI 判斷依據/);
  assert.doesNotMatch(actionableHtml, /data-ai-experiment-summary-label="true"/);
  assert.doesNotMatch(actionableHtml, /競品上週剛 ship/);
  assert.doesNotMatch(actionableHtml, /兩週內看是否有 3 位 PM 重複使用模板/);
  assert.doesNotMatch(actionableHtml, /阻礙/);
  assert.doesNotMatch(actionableHtml, /缺 Confluence webhook/);
  assert.doesNotMatch(actionableHtml, /↳/);
  assert.doesNotMatch(actionableHtml, /對應 核心流程/);
  assert.doesNotMatch(actionableHtml, /<strong>產品比對<\/strong>/);

  // Raw quote is no longer the visible hero; it lives behind the disclosure.
  assert.match(actionableHtml, /查看原文與模型判讀\s*→/);
  const sourceToggleStyle = actionableHtml.match(/data-evidence-source-toggle="true"[^>]*style="([^"]*)"/)?.[1] ?? "";
  assert.ok(sourceToggleStyle.includes(`background:${tokens.color.productSoft}`));
  assert.ok(sourceToggleStyle.includes(`color:${tokens.color.product}`));
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

test("ProductSignalView keeps non-try verdicts behind clickable filters by default", () => {
  const baseAnalysis = {
    signalType: "learning" as const,
    signalSubtype: "agent_workflow",
    contentType: "content" as const,
    relevance: 4 as const,
    relevantTo: ["technicalLearning" as const],
    referenceType: "technical_learning" as const,
    referenceLabel: "學習 Agent 工作流",
    referenceTakeaway: "先作為技術學習，不直接產品化。",
    evidenceRefs: [],
    productContextHash: "ctx",
    promptVersion: "v12",
    analyzedAt: "2026-05-07T00:00:00.000Z",
    status: "complete" as const
  };
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "actionable-filter",
      signals: [
        { id: "signal_try", sessionId: "sess", itemId: "i1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-07T00:00:00.000Z" },
        { id: "signal_watch", sessionId: "sess", itemId: "i2", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-07T00:00:00.000Z" }
      ] as any,
      analyses: [
        {
          ...baseAnalysis,
          signalId: "signal_try",
          contentSummary: "可直接試的 Agent 工作流",
          whyRelevant: "可直接測試。",
          verdict: "try" as const,
          reason: "有明確行動。"
        },
        {
          ...baseAnalysis,
          signalId: "signal_watch",
          contentSummary: "只適合保留觀察的跨平台資料流",
          whyRelevant: "先學習概念。",
          verdict: "watch" as const,
          reason: "暫時不直接改產品。"
        }
      ],
      productProfile: {
        name: "DLens",
        category: "x",
        audience: "y",
        contextText: "z",
        contextFiles: [{ id: "f", name: "README.md", kind: "readme", importedAt: "2026-05-07T00:00:00.000Z", charCount: 1 }]
      } as any,
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-action-verdict-filter="try"[^>]*aria-pressed="true"/);
  assert.match(html, /data-action-verdict-filter="watch"[^>]*aria-pressed="false"/);
  assert.match(html, /可直接試的 Agent 工作流/);
  assert.doesNotMatch(html, /只適合保留觀察的跨平台資料流/);
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
    productSignalViewElement( {
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
    productSignalViewElement( { ...v3Props, kind: "actionable-filter", cardLayout: "verdict" })
  );

  const openDetails = html.match(/<details open=""[^]*?<\/details>/g) ?? [];

  assert.equal(openDetails.length, 0);
  assert.match(html, /行動簡報/);
  assert.doesNotMatch(html, /儲存至行動清單|>\+<\/span> 儲存/);
  assert.match(html, /s1 摘錄。/);
  assert.match(html, /s2 摘錄。/);
});

test("actionable view with analyses but no readings surfaces the first-reading CTA", () => {
  const baseProps = {
    signals: [
      { id: "s1", sessionId: "sess", itemId: "i1", source: "threads" as const, inboxStatus: "unprocessed" as const, capturedAt: "2026-04-28T00:00:00.000Z" }
    ],
    analyses: [{
      signalId: "s1",
      signalType: "demand" as const,
      signalSubtype: "subtype",
      contentType: "discussion_starter" as const,
      contentSummary: "卡片 s1",
      relevance: 5 as const,
      relevantTo: ["coreWorkflows" as const],
      whyRelevant: "相關。",
      verdict: "try" as const,
      reason: "理由。",
      evidenceRefs: ["e1"],
      evidenceNotes: [{ ref: "e1", quoteSummary: "s1 摘錄。", whyItMatters: "s1 引用原因。" }],
      productContextHash: "ctx",
      promptVersion: "v3",
      analyzedAt: "2026-04-28T01:00:00.000Z",
      status: "complete" as const
    }],
    productProfile: {
      name: "DLens", category: "x", audience: "y", contextText: "z",
      contextFiles: [{ id: "f", name: "README.md", kind: "readme" as const, importedAt: "2026-04-28T00:00:00.000Z", charCount: 1 }]
    },
    onAnalyze: () => undefined,
    onSynthesizeSignalReading: async () => ({ ok: true as const, reading: "r" })
  };

  const html = renderToStaticMarkup(
    productSignalViewElement( { ...baseProps, kind: "actionable-filter", signalReadings: [] })
  );

  assert.match(html, /data-reading-first-run-cta="true"/);
  assert.match(html, /深度判讀/);
  assert.match(html, /data-actionable-insights-board="true"/);

  const withReading = renderToStaticMarkup(
    productSignalViewElement( {
      ...baseProps,
      kind: "actionable-filter",
      signalReadings: [{
        signalId: "s1",
        cacheKey: "k1",
        productContextHash: "ctx",
        sourcePacketHash: "pkt",
        promptVersion: "v5.1",
        reading: "判讀內容",
        generatedAt: "2026-04-28T02:00:00.000Z",
        model: "google:test",
        sourceRefs: ["e1"],
        sourcePacket: { assembledContent: "src", postUrl: "", representativeComments: [], analysisPromptVersion: "v16" },
        feedbackEvents: [],
        reviewState: "pending"
      }]
    })
  );

  assert.doesNotMatch(withReading, /data-reading-first-run-cta="true"/);
  assert.match(withReading, /data-signal-reading-review-workspace="true"/);
});

test("product view chrome stays 繁中 — no english workspace labels", () => {
  const baseProps = {
    signals: [
      { id: "s1", sessionId: "sess", itemId: "i1", source: "threads" as const, inboxStatus: "unprocessed" as const, capturedAt: "2026-04-28T00:00:00.000Z" }
    ],
    analyses: [{
      signalId: "s1",
      signalType: "demand" as const,
      signalSubtype: "subtype",
      contentType: "discussion_starter" as const,
      contentSummary: "卡片 s1",
      relevance: 5 as const,
      relevantTo: ["coreWorkflows" as const],
      whyRelevant: "相關。",
      verdict: "try" as const,
      reason: "理由。",
      evidenceRefs: ["e1"],
      evidenceNotes: [{ ref: "e1", quoteSummary: "s1 摘錄。", whyItMatters: "s1 引用原因。" }],
      productContextHash: "ctx",
      promptVersion: "v3",
      analyzedAt: "2026-04-28T01:00:00.000Z",
      status: "complete" as const
    }],
    productProfile: {
      name: "DLens", category: "x", audience: "y", contextText: "z",
      contextFiles: [{ id: "f", name: "README.md", kind: "readme" as const, importedAt: "2026-04-28T00:00:00.000Z", charCount: 1 }]
    },
    onAnalyze: () => undefined
  };
  const englishChrome = /Saved Signals|Agent Brief|AI enabled|TASK ›|No result/;

  for (const kind of ["saved-signals", "actionable-filter"] as const) {
    const html = renderToStaticMarkup(
      productSignalViewElement( { ...baseProps, kind, signalReadings: [] })
    );
    assert.doesNotMatch(html, englishChrome, `${kind} must not render english chrome labels`);
  }
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
    productSignalViewElement( { ...v3Props, kind: "actionable-filter", cardLayout: "verdict" })
  );

  // e1 has note only, e2 has entry only → both render. e_dangling has neither → must be skipped.
  assert.match(html, /e1 摘錄。/);
  assert.match(html, /raw 2/);
  assert.match(html, /子型/);
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
    productSignalViewElement( {
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
  assert.doesNotMatch(html, /Agent 任務（可複製）/);
  assert.match(html, /data-testid="rail-task"/);
  assert.match(html, /舊任務/);
  assert.doesNotMatch(html, /You are helping with a legacy task/);
});

test("ProductSignalView batch export copies action context with original signal text and task prompt", () => {
  const analysis = {
    signalId: "signal_a",
    signalType: "learning",
    signalSubtype: "mobile_share_intake",
    contentType: "content",
    contentSummary: "手機分享入口實驗",
    relevance: 5,
    relevantTo: ["coreWorkflows", "technicalLearning"],
    referenceType: "technical_learning",
    referenceLabel: "學習 mobile share intake 的入口設計",
    referenceTakeaway: "可先學習分享入口如何交給 agent，再決定是否改造 DLens collect flow。",
    whyRelevant: "使用者明確描述手機上快速保存 Threads 的需求。",
    verdict: "try",
    reason: "可以直接測試 share URL intake。",
    audienceGap: "作者預期大家關心分享入口；觀眾實際追問 agent 如何保存上下文。",
    experimentHint: "做一個 share URL intake prototype。",
    evidenceRefs: ["e1"],
    evidenceNotes: [
      {
        ref: "e1",
        quoteSummary: "觀眾問 agent 是否能保存上下文。",
        whyItMatters: "說明使用者關心的是連續工作流，而不只是入口。"
      }
    ],
    productContextHash: "hash",
    promptVersion: "v11",
    analyzedAt: "2026-04-27T00:00:00.000Z",
    status: "complete",
    agentTaskSpec: {
      targetAgent: "codex",
      taskTitle: "Share intake prototype",
      requiredContext: ["current README"],
      taskPrompt: "Prototype a share URL intake for mobile Threads posts."
    }
  } as const;

  const brief = productSignalViewTestables.buildAgentBrief({
    mode: "decision",
    selectedSignals: [
      { id: "signal_a", sessionId: "session_a", itemId: "item_a", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-04-27T00:00:00.000Z" }
    ],
    analysesBySignal: new Map([["signal_a", analysis as any]]),
    signalPreviewById: {
      signal_a: "Original Threads text: I want to save posts from mobile share sheet."
    },
    signalUrlById: {
      signal_a: "https://www.threads.net/@dlens/post/abc"
    }
  });

  assert.match(brief, /# Product Action Brief/);
  assert.match(brief, /## 使用方式/);
  assert.match(brief, /先處理 `值得嘗試`/);
  assert.match(brief, /`保留觀察` 只作產品學習/);
  assert.match(brief, /Original Threads text/);
  assert.match(brief, /原文連結: https:\/\/www\.threads\.net\/@dlens\/post\/abc/);
  assert.match(brief, /手機分享入口實驗/);
  assert.match(brief, /學習 mobile share intake 的入口設計/);
  assert.match(brief, /可先學習分享入口如何交給 agent/);
  assert.match(brief, /Prototype a share URL intake/);
  assert.doesNotMatch(brief, /## 1\. signal_a/);
  assert.doesNotMatch(brief, /AI summary/);
});

test("ProductSignalView original batch export includes audience reactions and audience gap", () => {
  const analysis = {
    signalId: "signal_b",
    signalType: "marketing",
    signalSubtype: "positioning_backlash",
    contentType: "mixed",
    contentSummary: "毒舌記帳 App 引發定位討論",
    relevance: 3,
    relevantTo: ["productPromise"],
    referenceType: "market_language",
    referenceLabel: "對產品可參考：語氣反面案例",
    referenceTakeaway: "觀眾反應提醒產品人格化不能只靠噱頭。",
    whyRelevant: "這可用來審視 DLens 的語氣是否過度人格化。",
    verdict: "watch",
    reason: "可作為反面語氣案例。",
    audienceGap: "作者預期毒舌語氣成為差異化；觀眾實際反應是記帳 App 過剩疲勞。",
    evidenceRefs: ["e1", "e2"],
    evidenceNotes: [
      { ref: "e1", quoteSummary: "觀眾說記帳 App 太多。", whyItMatters: "顯示疲勞點不在毒舌，而是品類過剩。" },
      { ref: "e2", quoteSummary: "有人覺得毒舌不適合理財。", whyItMatters: "顯示人格化語氣可能降低信任。" }
    ],
    productContextHash: "hash",
    promptVersion: "v16",
    analyzedAt: "2026-05-17T00:00:00.000Z",
    status: "complete"
  } as const;

  const brief = productSignalViewTestables.buildAgentBrief({
    mode: "original",
    selectedSignals: [
      { id: "signal_b", sessionId: "session_a", itemId: "item_b", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-17T00:00:00.000Z" }
    ],
    analysesBySignal: new Map([["signal_b", analysis as any]]),
    signalPreviewById: {
      signal_b: "Budget AI uses a savage personality to nudge spending habits."
    },
    signalUrlById: {
      signal_b: "https://www.threads.net/@budgetai/post/xyz"
    },
    evidenceBySignalId: {
      signal_b: [
        {
          ref: "e1",
          text: "又係記帳app，市面上已經一堆記帳app冇心再試新嘢",
          author: "rick_no_rich",
          likes: 9,
          position: 1
        },
        {
          ref: "e2",
          text: "用APP都會比佢串 不了 仲嫌日常生活唔夠大壓力咩",
          author: "azusa2789",
          likes: 2,
          position: 2
        }
      ]
    }
  });

  assert.match(brief, /原文連結: https:\/\/www\.threads\.net\/@budgetai\/post\/xyz/);
  assert.match(brief, /觀眾反應 \(2 則\)/);
  assert.match(brief, /\[e1\] rick_no_rich：又係記帳app，市面上已經一堆記帳app冇心再試新嘢/);
  assert.match(brief, /\[e2\] azusa2789：用APP都會比佢串 不了 仲嫌日常生活唔夠大壓力咩/);
  assert.doesNotMatch(brief, /\[e1\] 觀眾說記帳 App 太多。/);
  assert.match(brief, /預期落差: 作者預期毒舌語氣成為差異化/);
});

test("ProductSignalView restores the 0.1.15 reading review route when readings exist", () => {
  const signals = [
    { id: "signal_pending", sessionId: "sess", itemId: "i1", source: "threads" as const, inboxStatus: "unprocessed" as const, capturedAt: "2026-05-18T00:00:00.000Z" },
    { id: "signal_filed", sessionId: "sess", itemId: "i2", source: "threads" as const, inboxStatus: "unprocessed" as const, capturedAt: "2026-05-18T00:00:00.000Z" }
  ];
  const analyses = signals.map((signal, index) => ({
    signalId: signal.id,
    signalType: "marketing" as const,
    signalSubtype: "positioning_signal",
    contentType: "mixed" as const,
    contentSummary: index === 0 ? "待審訊號" : "已收錄訊號",
    relevance: index === 0 ? 3 as const : 4 as const,
    relevantTo: ["productPromise" as const],
    referenceType: "product_reference" as const,
    referenceLabel: index === 0
      ? "對產品參考：這是一段完整顯示的長判斷，不能被截斷。"
      : "對產品參考",
    referenceTakeaway: "用來判斷產品語氣。",
    whyRelevant: "對產品語氣有參考價值。",
    verdict: index === 0 ? "watch" as const : "try" as const,
    reason: "理由。",
    evidenceRefs: ["e1"],
    productContextHash: "ctx",
    promptVersion: "v16",
    analyzedAt: "2026-05-18T00:00:00.000Z",
    status: "complete" as const
  }));
  const signalReadings = [
    {
      signalId: "signal_pending",
      cacheKey: "pending-key",
      productContextHash: "ctx",
      sourcePacketHash: "pkt-pending",
      promptVersion: "v5.1",
      reading: "待審**判讀內容**，不應進入 brief preview。",
      generatedAt: "2026-05-18T01:00:00.000Z",
      model: "google:test",
      sourceRefs: ["e1"],
      sourcePacket: { assembledContent: "pending source", postUrl: "", representativeComments: [], analysisPromptVersion: "v16" },
      feedbackEvents: [],
      reviewState: "pending"
    },
    {
      signalId: "signal_filed",
      cacheKey: "filed-key",
      productContextHash: "ctx",
      sourcePacketHash: "pkt-filed",
      promptVersion: "v5.1",
      reading: "已收錄的判讀內容，應成為 Agent Brief 主體。",
      generatedAt: "2026-05-18T02:00:00.000Z",
      model: "google:test",
      sourceRefs: ["e4"],
      sourcePacket: { assembledContent: "filed source", postUrl: "https://www.threads.net/@dlens/post/filed", representativeComments: [], analysisPromptVersion: "v16" },
      feedbackEvents: [{ type: "filed", at: "2026-05-18T02:05:00.000Z" }],
      reviewState: "filed"
    }
  ];

  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "actionable-filter",
      signals,
      analyses,
      productProfile: {
        name: "DLens", category: "x", audience: "y", contextText: "z",
        contextFiles: [{ id: "f", name: "README.md", kind: "readme", importedAt: "2026-05-18T00:00:00.000Z", charCount: 1 }]
      },
      signalReadings,
      activeFolderId: "sess",
      exportFolders: [
        { id: "sess", name: "Current folder", itemCount: 2 },
        { id: "archive", name: "Archive folder", itemCount: 5 }
      ],
      signalUrlById: {
        signal_pending: "https://www.threads.net/@dlens/post/pending"
      },
      evidenceBySignalId: {
        signal_pending: [
          { ref: "e1", author: "investlahk", text: "變蠢可能係真嘅，但唔係必然，要看你點樣用 AI。", likeCount: 22 }
        ]
      },
      onExportSignalPackets: async () => ({
        ok: true,
        exportResult: {
          format: "html",
          content: "<!doctype html>",
          filename: "dlens-reading.html",
          mimeType: "text/html;charset=utf-8",
          packetCount: 2,
          generatedAt: "2026-05-19T08:30:00.000Z"
        }
      }),
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /行動簡報/);
  assert.match(html, /READING REVIEW/);
  assert.match(html, /data-signal-reading-review-workspace="true"[^>]*padding-bottom:76px/);
  assert.doesNotMatch(html, /data-saved-signals-batch-export="true"/);
  assert.doesNotMatch(html, /Agent export/);
  assert.doesNotMatch(html, /原文優先/);
  assert.doesNotMatch(html, /精簡決策/);
  assert.doesNotMatch(html, /複製 Agent Brief|複製行動簡報/);
  assert.doesNotMatch(html, /data-actionable-insights-board="true"/);
  assert.match(html, /收錄此判讀/);
  assert.match(html, /已收錄/);
  assert.match(html, /data-action-verdict-filter="try"/);
  assert.match(html, /data-action-verdict-filter="watch"/);
  assert.match(html, /data-verdict-filter-tiles="true"/);
  assert.match(html, /data-verdict-filter-plate="true"/);
  assert.match(html, /data-verdict-tile-count="true"/);
  assert.match(html, /data-signal-reading-review-list-filter="watch"/);
  assert.match(html, /data-signal-reading-marginalia="true"/);
  assert.match(html, /data-signal-reading-relevance-summary="true"/);
  assert.doesNotMatch(html, /data-signal-reading-marginalia-rail="true"/);
  assert.match(html, /data-signal-reading-provenance="true"/);
  assert.match(html, /data-signal-reading-evidence="true"/);
  assert.match(html, /引用留言 1 則/);
  assert.match(html, /對產品參考：這是一段完整顯示的長判斷，不能被截斷。/);
  assert.doesNotMatch(html, /source link/);
  assert.doesNotMatch(html, /border-left:3px/);
  assert.match(html, /值得嘗試/);
  assert.match(html, /保留觀察/);
  assert.doesNotMatch(html, /data-signal-reading-brief-copy-bar="inline"/);
  assert.doesNotMatch(html, /data-signal-reading-brief-copy-status="idle"/);
  assert.doesNotMatch(html, /data-signal-reading-brief-preview="true"/);
  assert.doesNotMatch(html, /data-brief-format-option=/);
  assert.doesNotMatch(html, /預覽 Brief/);
  assert.doesNotMatch(html, /複製 Brief/);
  assert.doesNotMatch(html, /what gets copied/);
  assert.match(html, /<strong[^>]*>判讀內容<\/strong>/);
  assert.doesNotMatch(html, /\*\*判讀內容\*\*/);
  assert.doesNotMatch(html, /SOURCE https/);
  assert.doesNotMatch(html, /逐則審視判讀 → 決定值得進 corpus/);
  assert.doesNotMatch(html, /1 已收錄，可複製給 agent/);
  assert.doesNotMatch(html, /1 則判讀已收錄 → 可複製給 coding agent/);
});

test("ProductSignalView turns long reading openings into a lighter lead title and summary", () => {
  const display = productSignalViewTestables.createSignalReadingDisplayCopy(
    "這則訊號的核心價值不在於「記帳 App」，而在於**「AI 人格設定與用戶情緒負債之間的邊界」**。\n\n第二段保留完整判讀，讓用戶慢慢閱讀。"
  );

  assert.equal(display.title, "AI 人格設定與用戶情緒負債之間的邊界");
  assert.match(display.summary, /核心價值不在於/);
  assert.match(display.summary, /\*\*「AI 人格設定/);
  assert.match(display.body, /第二段保留完整判讀/);
});

test("ProductSignalView action route stays on actionable cards before readings exist", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "actionable-filter",
      signals: [
        { id: "signal_empty", sessionId: "sess", itemId: "i1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-18T00:00:00.000Z" }
      ],
      analyses: [
        {
          signalId: "signal_empty",
          signalType: "marketing",
          signalSubtype: "positioning_signal",
          contentType: "mixed",
          contentSummary: "尚未生成判讀的訊號",
          relevance: 3,
          relevantTo: ["productPromise"],
          referenceType: "product_reference",
          referenceLabel: "對產品參考",
          referenceTakeaway: "用來判斷產品語氣。",
          whyRelevant: "對產品語氣有參考價值。",
          verdict: "watch",
          reason: "理由。",
          evidenceRefs: ["e1"],
          productContextHash: "ctx",
          promptVersion: "v16",
          analyzedAt: "2026-05-18T00:00:00.000Z",
          status: "complete"
        }
      ],
      productProfile: {
        name: "DLens", category: "x", audience: "y", contextText: "z",
        contextFiles: [{ id: "f", name: "README.md", kind: "readme", importedAt: "2026-05-18T00:00:00.000Z", charCount: 1 }]
      },
      signalReadings: [],
      onAnalyze: () => undefined,
      onSynthesizeSignalReading: async () => ({ ok: true, reading: "new reading" }),
      onReviewSignalReading: async () => ({ ok: false, error: "missing" })
    })
  );

  assert.match(html, /data-actionable-insights-board="true"/);
  assert.match(html, /保留觀察/);
  assert.doesNotMatch(html, /data-signal-reading-review-workspace="true"/);
  assert.doesNotMatch(html, /尚未生成深度判讀/);
});

test("ProductSignalView action route ignores stale readings from other signals", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "actionable-filter",
      signals: [
        { id: "signal_current", sessionId: "sess", itemId: "i1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-18T00:00:00.000Z" }
      ],
      analyses: [
        {
          signalId: "signal_current",
          signalType: "marketing",
          signalSubtype: "positioning_signal",
          contentType: "mixed",
          contentSummary: "目前資料只足夠留在 action card。",
          relevance: 3,
          relevantTo: ["productPromise"],
          referenceType: "product_reference",
          referenceLabel: "對產品參考",
          referenceTakeaway: "用來判斷產品語氣。",
          whyRelevant: "對產品語氣有參考價值。",
          verdict: "watch",
          reason: "理由。",
          evidenceRefs: ["e1"],
          productContextHash: "ctx",
          promptVersion: "v16",
          analyzedAt: "2026-05-18T00:00:00.000Z",
          status: "complete"
        }
      ],
      productProfile: {
        name: "DLens", category: "x", audience: "y", contextText: "z",
        contextFiles: [{ id: "f", name: "README.md", kind: "readme", importedAt: "2026-05-18T00:00:00.000Z", charCount: 1 }]
      },
      signalReadings: [
        {
          signalId: "signal_other",
          cacheKey: "other-key",
          productContextHash: "ctx",
          sourcePacketHash: "pkt-other",
          promptVersion: SIGNAL_READING_PROMPT_VERSION,
          reading: "其他訊號的舊判讀不應該啟動這個 route。",
          generatedAt: "2026-05-18T01:00:00.000Z",
          model: "google:test",
          sourceRefs: ["e1"],
          sourcePacket: { assembledContent: "source content", postUrl: "https://www.threads.net/@dlens/post/other", representativeComments: [], analysisPromptVersion: "v16" },
          feedbackEvents: [],
          reviewState: "pending"
        }
      ],
      onAnalyze: () => undefined,
      onSynthesizeSignalReading: async () => ({ ok: true, reading: "new reading" }),
      onReviewSignalReading: async () => ({ ok: false, error: "missing" })
    })
  );

  assert.match(html, /data-actionable-insights-board="true"/);
  assert.doesNotMatch(html, /data-signal-reading-review-workspace="true"/);
  assert.doesNotMatch(html, /其他訊號的舊判讀不應該啟動這個 route/);
});

test("ProductSignalView action route shows existing reading review content", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "actionable-filter",
      signals: [
        { id: "signal_ready", sessionId: "sess", itemId: "i1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-18T00:00:00.000Z" }
      ],
      analyses: [
        {
          signalId: "signal_ready",
          signalType: "marketing",
          signalSubtype: "positioning_signal",
          contentType: "mixed",
          contentSummary: "已有判讀的訊號",
          relevance: 3,
          relevantTo: ["productPromise"],
          referenceType: "product_reference",
          referenceLabel: "對產品參考",
          referenceTakeaway: "用來判斷產品語氣。",
          whyRelevant: "對產品語氣有參考價值。",
          verdict: "watch",
          reason: "理由。",
          evidenceRefs: ["e1"],
          productContextHash: "ctx",
          promptVersion: "v16",
          analyzedAt: "2026-05-18T00:00:00.000Z",
          status: "complete"
        }
      ],
      productProfile: {
        name: "DLens", category: "x", audience: "y", contextText: "z",
        contextFiles: [{ id: "f", name: "README.md", kind: "readme", importedAt: "2026-05-18T00:00:00.000Z", charCount: 1 }]
      },
      signalReadings: [
        {
          signalId: "signal_ready",
          cacheKey: "ready-key",
          productContextHash: "ctx",
          sourcePacketHash: "pkt-ready",
          promptVersion: SIGNAL_READING_PROMPT_VERSION,
          reading: "現有判讀內容。",
          generatedAt: "2026-05-18T01:00:00.000Z",
          model: "google:test",
          sourceRefs: ["e1"],
          sourcePacket: { assembledContent: "source content", postUrl: "https://www.threads.net/@dlens/post/ready", representativeComments: [], analysisPromptVersion: "v16" },
          feedbackEvents: [],
          reviewState: "pending"
        }
      ],
      onAnalyze: () => undefined,
      onSynthesizeSignalReading: async () => ({ ok: true, reading: "new reading" }),
      onReviewSignalReading: async () => ({ ok: false, error: "missing" })
    })
  );

  assert.match(html, /data-signal-reading-review-workspace="true"/);
  assert.match(html, /AI 生成/);
  assert.match(html, /來源 threads/);
  assert.match(html, /capture cap-signal_ready/);
  assert.match(html, /item succeeded/);
  assert.match(html, /現有判讀內容/);
  assert.doesNotMatch(html, /data-actionable-insights-board="true"/);
});

test("ProductSignalView marks signal readings with missing provenance explicitly", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "actionable-filter",
      signals: [
        { id: "signal_missing_model", sessionId: "sess", itemId: "i1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-18T00:00:00.000Z" }
      ],
      analyses: [
        {
          signalId: "signal_missing_model",
          signalType: "marketing",
          signalSubtype: "positioning_signal",
          contentType: "mixed",
          contentSummary: "缺 provenance 的舊判讀",
          relevance: 3,
          relevantTo: ["productPromise"],
          referenceType: "product_reference",
          referenceLabel: "對產品參考",
          referenceTakeaway: "用來判斷產品語氣。",
          whyRelevant: "對產品語氣有參考價值。",
          verdict: "watch",
          reason: "理由。",
          evidenceRefs: ["e1"],
          productContextHash: "ctx",
          promptVersion: "v16",
          analyzedAt: "2026-05-18T00:00:00.000Z",
          status: "complete"
        }
      ],
      productProfile: {
        name: "DLens", category: "x", audience: "y", contextText: "z",
        contextFiles: [{ id: "f", name: "README.md", kind: "readme", importedAt: "2026-05-18T00:00:00.000Z", charCount: 1 }]
      },
      signalReadings: [
        {
          signalId: "signal_missing_model",
          cacheKey: "missing-model-key",
          productContextHash: "ctx",
          sourcePacketHash: "pkt-missing",
          promptVersion: SIGNAL_READING_PROMPT_VERSION,
          reading: "舊版判讀內容。",
          generatedAt: "2026-05-18T01:00:00.000Z",
          model: "",
          sourceRefs: ["e1"],
          sourcePacket: { assembledContent: "source content", postUrl: "", representativeComments: [], analysisPromptVersion: "v16" },
          feedbackEvents: [],
          reviewState: "pending"
        }
      ],
      onAnalyze: () => undefined,
      onSynthesizeSignalReading: async () => ({ ok: true, reading: "new reading" }),
      onReviewSignalReading: async () => ({ ok: false, error: "missing" })
    })
  );

  assert.match(html, /data-signal-reading-provenance="true"/);
  assert.match(html, /來源未標示/);
  assert.doesNotMatch(html, /模型：unknown/);
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
    productSignalViewElement( { ...v3Props, kind: "classification" })
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
    productSignalViewElement( {
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
  assert.match(html, /部分失敗/);
  assert.doesNotMatch(html, /Backend 離線/);
});
