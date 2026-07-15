import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildProductAgentTaskPromptHash } from "../src/compare/product-agent-task-feedback.ts";
import type { PrNarrativeRead } from "../src/compare/pr-narrative.ts";
import { SIGNAL_READING_PROMPT_VERSION } from "../src/compare/signal-reading.ts";
import type { SessionProcessingSummary, WorkerStatus } from "../src/state/processing-state.ts";
import type { SignalReadiness } from "../src/state/signal-readiness.ts";
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
  type PrEvidenceCommand,
  type PrEvidenceResourceState,
  type PrEvidenceUiState,
  type PrEvidenceViewModel
} from "../src/viewmodel/pr-evidence.ts";
import { CollectView } from "../src/ui/CollectView.tsx";
import { InPageCollectorFolderControls, inPageCollectorFolderControlsTestables } from "../src/ui/InPageCollectorFolderControls.tsx";
import { InPageCollectorPopup, inPageCollectorPopupTestables } from "../src/ui/InPageCollectorPopup.tsx";
import { LibraryView } from "../src/ui/LibraryView.tsx";
import { createPrEvidenceResource } from "../src/ui/pr-evidence-resource.ts";
import { PrEvidenceView, prEvidenceViewTestables } from "../src/ui/PrEvidenceViews.tsx";
import { ProductSignalView, DLENS_MOTION_CSS, productSignalViewTestables } from "../src/ui/ProductSignalViews.tsx";
import { SettingsView } from "../src/ui/SettingsView.tsx";
import {
  EvidenceSourceHero,
  ReadingAnnotation,
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

test("shared evidence primitives keep source first and annotation secondary", () => {
  const html = renderToStaticMarkup(
    React.createElement(React.Fragment, null,
      React.createElement(EvidenceSourceHero, {
        author: "@op_studio",
        meta: "threads.com/post/3JqL8K · 5h",
        metrics: "♥ 142 · 回覆 31"
      }, "用了 DLens 三週，最有感的是 PR 那邊 evidence ledger 真的可交付。"),
      React.createElement(ReadingAnnotation, {
        label: "判讀"
      }, "作者把交付成本從 screenshot 重排轉成 CSV / MD / DOCX。")
    )
  );

  assert.match(html, /data-evidence-source-hero="true"/);
  assert.match(html, /data-evidence-source-quote="true"/);
  assert.match(html, /用了 DLens 三週/);
  assert.match(html, /data-reading-annotation="true"/);
  assert.match(html, /作者把交付成本/);
  assert.ok(html.indexOf("data-evidence-source-hero") < html.indexOf("data-reading-annotation"));
  assert.doesNotMatch(html, /PRODUCT MODE|TOPIC MODE|PR MODE|SHARED\s*·\s*DRILL-IN TEMPLATE/);
  assert.doesNotMatch(html, /\bwidth:720px|\bmin-width:720px/);
});

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
  const descriptorOverride = props.descriptorBySignalId?.[signal.id] ?? {};
  const engagementOverride = descriptorOverride.engagement ?? {};
  const engagementPresentOverride = descriptorOverride.engagement_present ?? {};
  const item = createSessionItem(
    {
      target_type: "post",
      page_url: url,
      post_url: url,
      author_hint: descriptorOverride.author_hint ?? "dlens",
      text_snippet: preview,
      time_token_hint: descriptorOverride.time_token_hint ?? "",
      dom_anchor: signal.id,
      engagement: { likes: null, comments: null, reposts: null, forwards: null, views: null, ...engagementOverride },
      engagement_present: { likes: false, comments: false, reposts: false, forwards: false, views: false, ...engagementPresentOverride },
      captured_at: descriptorOverride.captured_at ?? signal.capturedAt ?? "2026-04-27T00:00:00.000Z"
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
        author_hint: descriptorOverride.author_hint ?? "dlens",
        text_snippet: preview,
        time_token_hint: descriptorOverride.time_token_hint ?? "",
        dom_anchor: signal.id,
        engagement: engagementOverride,
        client_context: {},
        raw_payload: {},
        ingestion_status: "succeeded",
        captured_at: signal.capturedAt || "2026-04-27T00:00:00.000Z",
        created_at: signal.capturedAt || "2026-04-27T00:00:00.000Z",
        updated_at: signal.capturedAt || "2026-04-27T00:00:00.000Z",
        job: null,
        result: {
          threadReadModel: {
            rootPost: { postId: signal.id, author: descriptorOverride.author_hint ?? "dlens", text: preview, likeCount: engagementOverride.likes ?? null },
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
    resource: { ...baseResource, setupCollapsed: true, ...resource },
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

function buildPrNarrativeViewFixture(): Pick<PrEvidenceResourceState, "campaign" | "rows" | "narrativeRead" | "narrativeCurrentSourceHash" | "setupCollapsed"> {
  const campaign: PrCampaign = {
    id: "campaign-narrative",
    sessionId: "session-pr",
    name: "Launch narrative",
    briefText: "把設定流程由三步簡化成一步，讓首次使用者可以立即完成。",
    criteria: [
      { id: "c1", label: "活動名稱" },
      { id: "c2", label: "官方帳號" },
      { id: "c3", label: "核心訊息" },
      { id: "c4", label: "場地" },
      { id: "c5", label: "體驗主題" },
      { id: "c6", label: "希望行動" }
    ],
    narrativeSettings: {
      narrativeAnchor: "一分鐘完成首次設定",
      targetAudience: "第一次使用產品的自由工作者",
      desiredAction: "完成設定並開始第一個專案"
    },
    createdAt: "2026-07-14T01:00:00.000Z",
    updatedAt: "2026-07-14T01:00:00.000Z"
  };
  const rows: PrEvidenceRow[] = [
    {
      id: "row-narrative-1",
      campaignId: campaign.id,
      itemId: "item-narrative-1",
      postUrl: "https://www.threads.net/@alpha/post/n1",
      authorHandle: "alpha",
      caption: "第一步很清楚，但連接帳戶仍然找不到入口。",
      metrics: { likes: 12, comments: 2, reposts: 1 },
      criteriaMatches: { c1: true, c2: false, c3: true, c4: false, c5: true, c6: false },
      collectedAt: "2026-07-14T01:10:00.000Z"
    },
    {
      id: "row-narrative-2",
      campaignId: campaign.id,
      itemId: "item-narrative-2",
      postUrl: "https://www.threads.net/@beta/post/n2",
      authorHandle: "beta",
      caption: "我停在授權畫面，不知道下一步會發生甚麼。",
      metrics: { likes: 9, comments: 3, reposts: 0 },
      criteriaMatches: { c1: true, c2: false, c3: true, c4: false, c5: true, c6: false },
      collectedAt: "2026-07-14T01:20:00.000Z"
    },
    {
      id: "row-narrative-3",
      campaignId: campaign.id,
      itemId: "item-narrative-3",
      postUrl: "https://www.threads.net/@gamma/post/n3",
      authorHandle: "gamma",
      caption: "照畫面做兩步就完成，沒有想像中複雜。",
      metrics: { likes: 5, comments: 0, reposts: 0 },
      criteriaMatches: { c1: true, c2: false, c3: true, c4: false, c5: true, c6: true },
      collectedAt: "2026-07-14T01:30:00.000Z"
    }
  ];
  const narrativeRead: PrNarrativeRead = {
    schemaVersion: 1,
    campaignId: campaign.id,
    sourceRowIds: rows.map((row) => row.id),
    collectedRowCount: rows.length,
    snippetFallbackCount: 1,
    sourceHash: "sha256:narrative-current",
    promptVersion: "pr-narrative.v1",
    provider: "google",
    model: "gemini-test",
    generatedAt: "2026-07-14T02:00:00.000Z",
    status: "complete",
    priorityClaimId: "claim-friction",
    claims: [
      {
        id: "claim-friction",
        title: "Setup friction dominates",
        statement: "首次設定的阻力集中在帳戶連接與授權下一步。",
        implication: "先修正授權後的下一步提示，否則簡化主敘事不會被相信。",
        mode: "actionable",
        alignment: "challenges",
        supportRefs: [
          { rowId: rows[0].id, summary: "找不到連接帳戶入口。" },
          { rowId: rows[1].id, summary: "授權後不知道下一步。" }
        ],
        counterRefs: [{ rowId: rows[2].id, summary: "兩步即可完成設定。" }]
      },
      {
        id: "claim-speed",
        title: "Speed promise has a foothold",
        statement: "少數貼文已直接呼應快速完成的核心敘事。",
        implication: "保留速度承諾，但必須以清楚的操作證據支撐。",
        mode: "experience",
        alignment: "echoes",
        supportRefs: [{ rowId: rows[2].id, summary: "兩步完成，感受直接。" }],
        counterRefs: []
      }
    ]
  };
  return {
    campaign: prCampaignToDraft(campaign),
    rows,
    narrativeRead,
    narrativeCurrentSourceHash: narrativeRead.sourceHash,
    setupCollapsed: true
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

function renderLibraryViewHtml(
  props: Partial<React.ComponentProps<typeof LibraryView>> = {}
): string {
  const session = props.activeFolder ?? buildSession();
  return renderToStaticMarkup(
    React.createElement(LibraryView, {
      activeFolder: session,
      activeItem: props.activeItem ?? session.items[0] ?? null,
      optimisticQueuedIds: props.optimisticQueuedIds ?? [],
      workerStatus: props.workerStatus ?? ("idle" as WorkerStatus | null),
      isStartingProcessing: props.isStartingProcessing ?? false,
      processAllLabel: props.processAllLabel ?? "Process All",
      processingSummary: props.processingSummary ?? {
        total: session.items.length,
        ready: session.items.filter((item) => item.status === "succeeded").length,
        crawling: 0,
        analyzing: 0,
        pending: 0,
        failed: 0,
        hasReadyPair: session.items.filter((item) => item.status === "succeeded").length >= 2,
        hasInflight: false
      },
      canPrev: props.canPrev ?? false,
      canNext: props.canNext ?? false,
      onSelectItem: props.onSelectItem ?? (() => undefined),
      onProcessAll: props.onProcessAll ?? (() => undefined),
      onMoveSelection: props.onMoveSelection ?? (() => undefined),
      onQueueItem: props.onQueueItem ?? (() => undefined),
      renderMetrics: props.renderMetrics ?? (() => null),
      techniqueReadings: props.techniqueReadings ?? [],
      savedAnalyses: props.savedAnalyses,
      topicSignalItemIds: props.topicSignalItemIds,
      topicInboxCount: props.topicInboxCount,
      topicCount: props.topicCount,
      initialSection: props.initialSection,
      onGoToCollect: props.onGoToCollect,
      onGoToCompare: props.onGoToCompare,
      onOpenSavedAnalysis: props.onOpenSavedAnalysis,
      folderSynthesis: props.folderSynthesis,
      isGeneratingFolderSynthesis: props.isGeneratingFolderSynthesis,
      folderSynthesisError: props.folderSynthesisError,
      onGenerateFolderSynthesis: props.onGenerateFolderSynthesis,
      onClearFolderSynthesis: props.onClearFolderSynthesis,
      nowMs: props.nowMs,
      folderAnalyzedCount: props.folderAnalyzedCount,
      folderContributingTopicCount: props.folderContributingTopicCount
    })
  );
}

test("surfaceCardStyle uses the shared glass-ground defaults", () => {
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
  assert.equal(tokens.color.canvas, "#f2f7f3");
  assert.equal(tokens.color.surface, "#f8fbf8");
  assert.equal(tokens.color.elevated, "#ffffff");
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

test("InPageCollectorPopup selects the shared glass shell for Topic, Product, and PR", () => {
  const materialFor = (inPageCollectorPopupTestables as unknown as {
    workspaceMaterialForFolderMode?: (folderMode: string) => string;
  }).workspaceMaterialForFolderMode;
  assert.equal(typeof materialFor, "function");
  assert.equal(materialFor?.("topic"), "glass");
  assert.equal(materialFor?.("product"), "glass");
  assert.equal(materialFor?.("pr-evidence"), "glass");
  assert.equal(materialFor?.("archive"), "paper");
});

test("InPageCollectorPopup keeps extra scroll padding below the last card", () => {
  assert.equal(inPageCollectorPopupTestables.popupViewportBottomPadding, tokens.spacing.xl);
  assert.equal(
    (inPageCollectorPopupTestables as unknown as { popupViewportHeight?: string }).popupViewportHeight,
    "min(78vh, 780px)"
  );
  assert.equal(inPageCollectorPopupTestables.settingsWorkspaceSurfaceStyle.overflow, "visible");
});

test("InPageCollectorPopup topic create action opens the real create-topic flow", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const topicSession = buildSession();
  topicSession.mode = "topic";
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    MouseEvent: globalThis.MouseEvent
  };
  const navCalls: string[] = [];
  let createCalls = 0;

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    MouseEvent: dom.window.MouseEvent
  });

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  const app = {
    popupRef: { current: null },
    snapshot: {
      global: {
        settings: createDefaultSettings(),
        sessions: [topicSession],
        activeSessionId: topicSession.id,
        updatedAt: "2026-07-07T08:00:00.000Z"
      },
      tab: {
        ...createEmptyTabState(),
        popupOpen: true,
        popupPage: "topics"
      }
    },
    page: "topics",
    popupOpen: true,
    activeFolder: topicSession,
    activeFolderMode: "topic",
    activeTopic: null,
    activeTopicSignals: [],
    activeTopicPairs: [],
    topicLoadState: "ready",
    selectedTopicId: null,
    activePrCampaign: null,
    topics: [],
    signals: [],
    topicAuditByTopicId: {},
    savedAnalyses: [],
    productSignalAnalyses: [],
    historicalProductSignalAnalyses: [],
    productAgentTaskFeedback: [],
    signalReadings: [],
    compiledProductContext: null,
    productAiProviderReady: false,
    productBackendError: null,
    productSignalAnalysisError: null,
    productSignalAnalysisNotice: null,
    isHydratingProductSignals: false,
    isAnalyzingProductSignals: false,
    activeTopicAudit: undefined,
    topicAuditP1RunningBySignalId: {},
    topicAuditP1ErrorBySignalId: {},
    optimisticQueuedIds: [],
    bulkAnalyzingFolderId: null,
    isStartingProcessing: false,
    workerStatus: "idle",
    backendWorkUiState: null,
    backendReachability: "unknown",
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
    readInteractionNowMs: () => 0,
    readWallClockNowMs: () => Date.parse("2026-07-07T08:00:00.000Z"),
    prEvidenceViewModel: buildPrEvidenceVm(),
    resultItemA: null,
    resultItemB: null,
    activeSavedAnalysis: null,
    signalPreviewById: {},
    signalTagsByItemId: {},
    renderMetrics: () => null,
    canPrev: false,
    canNext: false,
    readyCompareItems: [],
    selectedCompareA: "",
    selectedCompareB: "",
    compareTeaserState: "idle",
    compareTeaser: null,
    setSelectedCompareA: () => undefined,
    setSelectedCompareB: () => undefined,
    processAllLabel: "Process All",
    techniqueReadings: [],
    folderSynthesis: null,
    isGeneratingFolderSynthesis: false,
    folderSynthesisError: null,
    folderAnalyzedCount: 0,
    folderContributingTopicCount: 0,
    onSessionModeChange: async () => ({ ok: true }),
    onNavigate: async (page: string) => {
      navCalls.push(page);
    },
    onNavigateToTopic: () => undefined,
    onCreateTopic: () => {
      createCalls += 1;
    },
    onDeleteTopic: () => undefined
  };

  try {
    flushSync(() => {
      root.render(React.createElement(InPageCollectorPopup, { app: app as any }));
    });
    const shell = rootElement.querySelector<HTMLElement>('[data-workspace-popup="shell"]');
    assert.ok(shell, "popup shell should render as the non-scrolling extension frame");
    assert.equal(shell.getAttribute("data-workspace-popup-material"), "glass");
    assert.ok(inPageCollectorPopupTestables.popupFrameRadius >= 24, "the outer popup must retain the pronounced Variant D curve");
    assert.equal(shell.style.borderRadius, `${inPageCollectorPopupTestables.popupFrameRadius}px`);
    assert.equal(shell.style.maxWidth, "calc(100vw - 24px)");
    assert.equal(shell.style.right, "12px");
    assert.equal(shell.style.top, "82px");
    assert.equal(shell.style.maxHeight, "calc(100vh - 94px)");
    assert.equal(shell.style.transform, "translateZ(0)");
    assert.equal(shell.style.contain, "paint");
    assert.ok(rootElement.querySelector<HTMLElement>('[data-workspace-material="glass"]'), "topic popup must pass glass into WorkspaceShell");
    const scrollViewport = rootElement.querySelector<HTMLElement>('[data-workspace-popup-scroll="viewport"]');
    assert.ok(scrollViewport, "popup scroll viewport should remain separate from the frame");
    assert.equal(scrollViewport.style.borderRadius, `${inPageCollectorPopupTestables.popupFrameRadius}px`);
    assert.equal(scrollViewport.style.boxSizing, "border-box");
    assert.equal(scrollViewport.style.transform, "");
    assert.equal(scrollViewport.style.overscrollBehaviorY, "contain");
    const scrollTrack = scrollViewport.querySelector<HTMLElement>('[data-workspace-popup-scroll-track="true"]');
    assert.ok(scrollTrack, "presence and rebound need a dedicated content track inside the viewport");
    assert.equal(scrollTrack.style.transform, "", "rebound must use individual translate and leave transform ownership alone");
    assert.equal(scrollTrack.style.minHeight, "100%", "the inner motion track must preserve the popup's full-height shell contract");
    const bottomSpacer = scrollTrack.querySelector<HTMLElement>('[data-workspace-popup-bottom-spacer="true"]');
    assert.ok(bottomSpacer, "the final action remains reachable through a real scroll-track spacer");
    assert.equal(bottomSpacer.style.height, `${tokens.spacing.xl}px`);
    const button = rootElement.querySelector<HTMLButtonElement>('[data-new-topic-button="triage"]');
    assert.ok(button, "topics page must render the create-topic button");
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

    assert.equal(createCalls, 1);
    assert.deepEqual(navCalls, []);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
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

test("LibraryView render layer keeps row count, section state, and shared framing contracts", () => {
  const session = buildSession();
  const pendingItem = createSessionItem(
    {
      ...buildDescriptor(),
      post_url: "https://www.threads.net/@beta/post/b",
      page_url: "https://www.threads.net/@beta/post/b",
      author_hint: "beta",
      text_snippet: "Pending row"
    },
    "2026-03-24T07:24:21.000Z"
  );
  pendingItem.status = "queued";
  session.items.push(pendingItem);

  const pendingHtml = renderLibraryViewHtml({
    activeFolder: session,
    processingSummary: {
      total: 2,
      ready: 1,
      crawling: 0,
      analyzing: 0,
      pending: 1,
      failed: 0,
      hasReadyPair: false,
      hasInflight: false
    },
    activeItem: session.items[0]!
  });

  assert.equal(countOccurrences(pendingHtml, `data-library-row="scan"`), 2);
  assert.match(pendingHtml, /data-library-section-state="pending"/);
  assert.match(pendingHtml, /data-library-process-all="true"/);
  assert.match(pendingHtml, /data-library-section="posts"/);
  assert.match(pendingHtml, /data-library-section="readiness"[^>]*data-dlens-presence="card"/);
  assert.match(pendingHtml, /data-section-header="shared"/);
  assert.ok(countOccurrences(pendingHtml, `data-shared-surface-card=`) >= 2);

  const readyHtml = renderLibraryViewHtml({
    activeFolder: session,
    processingSummary: {
      total: 2,
      ready: 2,
      crawling: 0,
      analyzing: 0,
      pending: 0,
      failed: 0,
      hasReadyPair: true,
      hasInflight: false
    },
    onGoToCompare: () => undefined
  });
  assert.match(readyHtml, /data-library-section-state="ready"/);
  assert.doesNotMatch(readyHtml, /data-library-process-all="true"/);

  const emptySession = buildSession();
  emptySession.items = [];
  const emptyHtml = renderLibraryViewHtml({
    activeFolder: emptySession,
    activeItem: null,
    processingSummary: {
      total: 0,
      ready: 0,
      crawling: 0,
      analyzing: 0,
      pending: 0,
      failed: 0,
      hasReadyPair: false,
      hasInflight: false
    }
  });
  assert.match(emptyHtml, /data-library-section-state="empty"/);
});

test("LibraryView row and Process All actions keep callback wiring", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    MouseEvent: globalThis.MouseEvent
  };
  const session = buildSession();
  const calls: string[] = [];

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    MouseEvent: dom.window.MouseEvent
  });

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);

  try {
    flushSync(() => {
      root.render(
        React.createElement(LibraryView, {
          activeFolder: session,
          activeItem: null as SessionItem | null,
          optimisticQueuedIds: [],
          workerStatus: "idle" as WorkerStatus | null,
          isStartingProcessing: false,
          processAllLabel: "Process All",
          processingSummary: {
            total: 1,
            ready: 0,
            crawling: 0,
            analyzing: 0,
            pending: 1,
            failed: 0,
            hasReadyPair: false,
            hasInflight: false
          },
          canPrev: false,
          canNext: false,
          onSelectItem: (itemId) => calls.push(`select:${itemId}`),
          onProcessAll: () => calls.push("process-all"),
          onMoveSelection: () => undefined,
          onQueueItem: () => undefined,
          renderMetrics: () => null,
          techniqueReadings: []
        })
      );
    });

    const row = rootElement.querySelector('[data-library-row="scan"]') as HTMLButtonElement | null;
    const processAll = rootElement.querySelector('[data-library-process-all="true"]') as HTMLButtonElement | null;
    assert.ok(row);
    assert.ok(processAll);

    row.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    processAll.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

    assert.deepEqual(calls, [`select:${session.items[0]!.id}`, "process-all"]);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("LibraryView framing stays width-safe and avoids raised elevation", () => {
  const html = renderLibraryViewHtml({
    savedAnalyses: [buildSavedAnalysis()],
    techniqueReadings: [buildTechniqueReading()]
  });

  assert.match(html, /data-library-layout="surface-primitives"/);
  assert.doesNotMatch(html, /\bwidth:(?:320|440)px/);
  assert.doesNotMatch(html, /\bmin-width:[2-9]\d{2}px/);
  assert.equal(countOccurrences(html, `box-shadow:${tokens.shadow.raised}`), 0);
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

test("CollectView keeps the preview card and compact collect controls visible with current Chinese copy", () => {
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
  assert.match(html, /儲存到資料庫/);
  assert.match(html, /data-archive-no-ai-notice="collect"/);
  assert.match(html, /儲存為原文記錄，不跑 AI 分析/);
  assert.match(html, /data-collector-panel-header="true"/);
  assert.match(html, /data-collector-stage="hero"[^>]*data-dlens-presence="card"/);
  assert.match(html, /data-collector-mode-toggle="true"/);
  assert.match(html, /data-collector-key-hints="true"/);
  assert.match(html, /採集中/);
  assert.match(html, /關閉/);
  assert.doesNotMatch(html, /收集模式：開啟/);
});

test("CollectView renders saved-post metrics in recent captures instead of duplicating the hover preview", () => {
  const recentItem = createSessionItem({
    ...buildDescriptor(),
    post_url: "https://www.threads.net/@alpha/post/recent",
    text_snippet: "Saved post with real descriptor metrics."
  }, "2026-03-24T07:23:21.000Z");
  recentItem.id = "recent-metric-item";

  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: buildDescriptor(),
      folderName: "work",
      mode: "topic",
      isSaved: false,
      selectionMode: true,
      recentItems: [recentItem],
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined
    })
  );

  assert.match(html, /data-collector-recent-captures="true"/);
  assert.match(html, /data-collector-recent-captures="true"[^>]*data-dlens-presence="card"/);
  assert.match(html, /data-collector-metric-strip="recent-metric-item"/);
  assert.match(html, /data-collector-metric="likes"/);
  assert.match(html, /data-collector-metric="comments"/);
  assert.match(html, /data-collector-metric="reposts"/);
  assert.match(html, />10</);
  assert.match(html, />5</);
  assert.doesNotMatch(html, /data-collect-metric="likes"/);
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
  assert.doesNotMatch(html, /data-pr-campaign-setup="true"[^>]*data-dlens-presence=/);
  assert.match(html, /data-pr-summary-cta="empty"[^>]*data-dlens-presence="card"/);
  assert.match(html, /data-pr-actions="true"/);
  assert.match(html, /data-pr-evidence-ledger="compact"/);
  assert.match(html, /data-pr-match-summary="true"/);
  assert.match(html, /data-pr-metrics-detail="collapsed"/);
  assert.doesNotMatch(html, /data-pr-work-tab=/);
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
  assert.match(html, /data-pr-evidence-rows-detail="collapsed"/);
  assert.match(html, /data-pr-evidence-gist="true"/);
  assert.match(html, /data-collector-metric-strip="row-shared"/);
  assert.match(html, /data-collector-metric="likes"/);
  assert.match(html, /data-collector-metric="comments"/);
  assert.match(html, /data-collector-metric="reposts"/);
  assert.match(html, /data-collector-metric="forwards"/);
  assert.match(html, /data-pr-evidence-strength-chip="partial"/);
  assert.match(html, /data-pr-criteria-health-detail="c1"/);
  assert.match(html, /data-pr-criteria-coverage-row="c1"/);
  assert.match(html, /data-pr-criteria-coverage-bar="c1"/);
  assert.match(html, /data-pr-criteria-coverage-fill="c1"/);
  assert.match(html, /data-pr-criteria-strength-dot="c1"/);
  assert.match(html, /data-pr-criteria-health-matches="c1"/);
  assert.match(html, /data-pr-criteria-health-match-row="true"/);
});

test("PrEvidenceView aligns the editorial PR structure to shared workspace tokens", () => {
  const html = renderPrEvidenceView();

  assert.match(html, /data-pr-editorial-v1="true"/);
  assert.match(html, /data-mode-header="pr-evidence"/);
  assert.match(html, /data-workspace-surface="utility"/);
  assert.match(html, /data-pr-working-area="true"/);
  assert.match(html, /批次判斷/);
  assert.match(html, /抓取進階指標/);
  assert.match(html, /data-pr-match-summary="true"/);
  assert.match(html, /data-pr-metrics-detail="collapsed"/);
  assert.doesNotMatch(html, /data-pr-work-tab=/);
  assert.match(html, /border-radius:20px/);
  assert.match(html, /0 4px 14px -4px rgba\(27,26,23,0\.07\)/);
});

test("PR Evidence setup copy is Chinese-first and avoids fake campaign examples", () => {
  const html = renderPrEvidenceView({ setupCollapsed: false });

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

test("PR expanded activity settings expose narrative fields without rendering either work lens", () => {
  const fixture = buildPrNarrativeViewFixture();
  const html = renderPrEvidenceView({ ...fixture, setupCollapsed: false }, { activeLens: "narrative" });

  assert.match(html, /aria-label="核心敘事"/);
  assert.match(html, /aria-label="目標受眾"/);
  assert.match(html, /aria-label="希望行動"/);
  assert.match(html, /一分鐘完成首次設定/);
  assert.match(html, /第一次使用產品的自由工作者/);
  assert.match(html, /完成設定並開始第一個專案/);
  assert.doesNotMatch(html, /data-pr-lens-switcher="true"/);
  assert.doesNotMatch(html, /data-pr-working-area="true"/);
  assert.doesNotMatch(html, /data-pr-narrative-lens="true"/);
});

test("PR narrative lens leads with one priority insight and opens auditable support plus optional counterevidence", () => {
  const fixture = buildPrNarrativeViewFixture();
  const html = renderPrEvidenceView(fixture, {
    activeLens: "narrative",
    selectedNarrativeClaimId: "claim-friction"
  });

  assert.match(html, /data-pr-scope-bar="campaign-collected-posts"/);
  assert.match(html, /只分析這個 campaign 已 Collect 的 Threads 主帖/);
  assert.match(html, /data-pr-lens-switcher="true"/);
  assert.match(html, /role="tab" aria-selected="true"[^>]*data-pr-lens-tab="narrative"/);
  assert.match(html, /data-pr-narrative-priority="true"/);
  assert.ok(
    html.indexOf("先修正授權後的下一步提示") < html.indexOf("首次設定的阻力集中"),
    "priority surface must lead with the implication before the supporting claim statement"
  );
  assert.equal(countOccurrences(html, "2/3 支持"), 1, "the priority support ratio must render once");
  assert.match(html, /3 \/ 3 篇可判讀/);
  assert.match(html, /1 篇使用採集摘要/);
  assert.match(html, /data-pr-narrative-compass="true"/);
  assert.match(html, /role="dialog"[^>]*aria-label="Setup friction dominates"/);
  assert.match(html, /data-pr-narrative-evidence-list="support"/);
  assert.match(html, /data-pr-narrative-counterexamples="true"/);
  assert.match(html, /兩步即可完成設定/);
  assert.ok(countOccurrences(html, "Threads 原帖") >= 2);
  assert.doesNotMatch(html, /自動持續|監察新帖|份額變化|自上次判讀/);
});

test("PR narrative drawer omits the counterexample section when the selected claim has none", () => {
  const fixture = buildPrNarrativeViewFixture();
  const html = renderPrEvidenceView(fixture, {
    activeLens: "narrative",
    selectedNarrativeClaimId: "claim-speed"
  });

  assert.match(html, /role="dialog"[^>]*aria-label="Speed promise has a foothold"/);
  assert.match(html, /data-pr-narrative-evidence-list="support"/);
  assert.doesNotMatch(html, /data-pr-narrative-counterexamples="true"/);
  assert.doesNotMatch(html, /反例／限制/);
});

test("PR evidence lens preserves matching, metrics, summary, and CSV actions", () => {
  const fixture = buildPrNarrativeViewFixture();
  const html = renderPrEvidenceView(fixture, { activeLens: "evidence" });

  assert.match(html, /role="tab" aria-selected="true"[^>]*data-pr-lens-tab="evidence"/);
  assert.match(html, /data-pr-working-area="true"/);
  assert.match(html, /批次判斷/);
  assert.match(html, /抓取進階指標/);
  assert.match(html, /aria-label="匯出 CSV"/);
  assert.match(html, /生成摘要/);
  assert.doesNotMatch(html, /data-pr-narrative-priority="true"/);
});

test("PR narrative lens distinguishes empty, stale, insufficient, and provider-error states", () => {
  const fixture = buildPrNarrativeViewFixture();
  const emptyHtml = renderPrEvidenceView({
    ...fixture,
    narrativeRead: null,
    narrativeCurrentSourceHash: "sha256:narrative-current"
  }, { activeLens: "narrative" });
  assert.match(emptyHtml, /data-pr-narrative-state="empty"/);
  assert.match(emptyHtml, /尚未建立敘事判讀/);
  assert.match(emptyHtml, /判讀已收集的 3 篇/);

  const staleHtml = renderPrEvidenceView({
    ...fixture,
    narrativeCurrentSourceHash: "sha256:newly-collected",
    narrativeError: "Provider timeout during retry"
  }, { activeLens: "narrative" });
  assert.match(staleHtml, /data-pr-narrative-state="stale"/);
  assert.match(staleHtml, /已收集的貼文已變更/);
  assert.match(staleHtml, /上次重新判讀失敗：Provider timeout during retry/);
  assert.match(staleHtml, /data-pr-narrative-priority="true"/);

  const insufficientRead: PrNarrativeRead = {
    ...fixture.narrativeRead!,
    sourceRowIds: [],
    collectedRowCount: fixture.rows.length,
    snippetFallbackCount: 0,
    sourceHash: "sha256:insufficient",
    status: "insufficient_evidence",
    priorityClaimId: null,
    claims: []
  };
  const insufficientHtml = renderPrEvidenceView({
    ...fixture,
    narrativeRead: insufficientRead,
    narrativeCurrentSourceHash: insufficientRead.sourceHash,
    narrativeError: "Provider timeout after insufficient read"
  }, { activeLens: "narrative" });
  assert.match(insufficientHtml, /data-pr-narrative-state="insufficient_evidence"/);
  assert.match(insufficientHtml, /不會硬湊分佈或趨勢/);
  assert.match(insufficientHtml, /上次重新判讀失敗：Provider timeout after insufficient read/);
  assert.doesNotMatch(insufficientHtml, /data-pr-narrative-priority="true"/);

  const errorHtml = renderPrEvidenceView({
    ...fixture,
    narrativeRead: null,
    narrativeError: "Provider key missing"
  }, { activeLens: "narrative" });
  assert.match(errorHtml, /data-pr-narrative-state="error"/);
  assert.match(errorHtml, /Provider key missing/);
});

test("PR settings, lens, manual generation, and claim controls dispatch ViewModel commands", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    MouseEvent: globalThis.MouseEvent,
    KeyboardEvent: globalThis.KeyboardEvent
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent
  });
  const fixture = buildPrNarrativeViewFixture();
  const viewModel = buildPrEvidenceVm(fixture, { activeLens: "narrative", selectedNarrativeClaimId: "claim-friction" });
  const commands: PrEvidenceCommand[] = [];
  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);

  try {
    flushSync(() => {
      root.render(React.createElement(PrEvidenceView, {
        viewModel,
        onCommand: (command) => {
          commands.push(command);
        }
      }));
    });
    const click = (selector: string) => {
      const button = rootElement.querySelector<HTMLButtonElement>(selector);
      assert.ok(button, `missing control: ${selector}`);
      button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    };
    const drawer = rootElement.querySelector<HTMLElement>('[data-pr-narrative-drawer="true"]');
    assert.ok(drawer);
    assert.equal(dom.window.document.activeElement, drawer, "opening the drawer must move focus into its dialog");
    drawer.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    click('[data-pr-open-settings="header"]');
    click('[data-pr-open-settings="summary"]');
    click('[data-pr-lens-tab="evidence"]');
    click('[data-pr-narrative-generate="true"]');
    click('[data-pr-narrative-claim="claim-friction"]');

    assert.deepEqual(commands, [
      { kind: "selectNarrativeClaim", target: { sessionId: "session-pr", campaignId: "campaign-narrative" }, claimId: null },
      { kind: "setSetupCollapsed", target: { sessionId: "session-pr" }, collapsed: false },
      { kind: "setSetupCollapsed", target: { sessionId: "session-pr" }, collapsed: false },
      { kind: "setLens", target: { sessionId: "session-pr" }, lens: "evidence" },
      { kind: "generateNarrative", target: { sessionId: "session-pr", campaignId: "campaign-narrative" } },
      { kind: "selectNarrativeClaim", target: { sessionId: "session-pr", campaignId: "campaign-narrative" }, claimId: "claim-friction" }
    ]);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
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
    EvidenceLedger: (props: { rows: ReturnType<typeof buildPrEvidenceVm>["ledger"]["rows"]; caption: string }) => React.ReactElement;
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
      rows: vm.ledger.rows,
      caption: vm.workingArea.ledgerCaption
    })
  );

  assert.match(html, /data-pr-evidence-rows-detail="collapsed"/);
  assert.match(html, /data-pr-evidence-source-link="true"/);
  assert.match(html, /href="https:\/\/www\.threads\.net\/@alpha\/post\/1"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /Open original Threads post by alpha/);
});

test("PR Evidence ledger rows use audit numbering, gist, metric strip, and strength chips", () => {
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
      rows: vm.ledger.rows,
      caption: vm.workingArea.ledgerCaption
    })
  );

  assert.match(html, /data-pr-evidence-ledger-style="audit"/);
  assert.match(html, /data-pr-evidence-rows-detail="collapsed"/);
  assert.match(html, /data-pr-evidence-row="audit"/);
  assert.match(html, /data-pr-evidence-audit-number="01"/);
  assert.match(html, /data-pr-evidence-audit-number="02"/);
  assert.match(html, /data-pr-evidence-gist="true"/);
  assert.match(html, /data-collector-metric-strip="row-audit-1"/);
  assert.match(html, /data-collector-metric-strip="row-audit-2"/);
  assert.match(html, /data-collector-metric="forwards"/);
  assert.match(html, /data-pr-evidence-strength-chip="partial"/);
  assert.match(html, /data-pr-match-indicator="true"/);
  assert.match(html, /2\/6/);
  assert.match(html, /1\/6/);
  assert.doesNotMatch(html, />C1</);
  assert.doesNotMatch(html, />C2</);
  assert.doesNotMatch(html, /data-quote-block="shared"/);
  assert.match(html, /grid-template-columns:26px minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(html, /min-width:1320/);
});

test("PR criteria health surfaces real criterion labels and the systemic gap", () => {
  const campaign: PrCampaign = {
    id: "campaign-health",
    sessionId: "session-pr",
    name: "Launch",
    briefText: "Brief",
    criteria: [
      { id: "c1", label: "活動名稱" },
      { id: "c2", label: "Hashtag" },
      { id: "c3", label: "核心訊息" },
      { id: "c4", label: "場地" },
      { id: "c5", label: "體驗主題" },
      { id: "c6", label: "CTA / 報名動作" }
    ],
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    lastMatchedAt: "2026-05-26T02:00:00.000Z"
  };
  const rows: PrEvidenceRow[] = Array.from({ length: 4 }, (_, index) => ({
    id: `row-health-${index}`,
    campaignId: "campaign-health",
    itemId: `item-health-${index}`,
    postUrl: `https://www.threads.net/@health/post/${index}`,
    authorHandle: `health_${index}`,
    caption: `Health row ${index}`,
    metrics: { likes: index, comments: 0, reposts: 0 },
    criteriaMatches: {
      c1: true,
      c2: index < 2,
      c3: index < 3,
      c4: index < 1,
      c5: index < 1,
      c6: false
    },
    collectedAt: "2026-05-26T01:00:00.000Z"
  }));
  const vm = buildPrEvidenceVm({ campaign: prCampaignToDraft(campaign), rows });
  const CriteriaHealth = (prEvidenceViewTestables as unknown as {
    CriteriaHealth: (props: { health: typeof vm.criteriaHealth; rows: typeof vm.ledger.rows }) => React.ReactElement;
  }).CriteriaHealth;
  const html = renderToStaticMarkup(
    React.createElement(CriteriaHealth, { health: vm.criteriaHealth, rows: vm.ledger.rows })
  );

  assert.match(html, /data-pr-criteria-health="true"/);
  // Frame 6: header stats + coverage bars + systemic-gap callout.
  assert.match(html, /data-pr-criteria-health-kpis="true"/);
  assert.match(html, /Captured/);
  assert.match(html, /Strong/);
  assert.match(html, /Criteria 待補/);
  assert.match(html, /data-pr-criteria-coverage-row="c1"/);
  assert.match(html, /data-pr-criteria-coverage-row="c6"/);
  assert.match(html, /data-pr-criteria-coverage-bar="c1"/);
  assert.match(html, /data-pr-criteria-coverage-fill="c1"/);
  assert.match(html, /data-pr-criteria-coverage-count="c1"[^>]*>4\/4/);
  assert.match(html, /data-pr-criteria-coverage-count="c6"[^>]*>0\/4/);
  assert.match(html, /data-pr-criteria-strength-dot="c6"/);
  // F1: the real criterion label stays primary; the C-id is only a secondary tag.
  assert.match(html, /CTA \/ 報名動作/);
  assert.match(html, /活動名稱/);
  assert.match(html, /data-pr-criteria-id="c6"/);
  assert.match(html, /系統性缺口/);
  // C6 has zero coverage -> it is a GAP row with a zero-width coverage lane.
  assert.match(html, /data-pr-criteria-health-strength="gap"/);
  assert.match(html, /data-pr-criteria-health-detail="c1"/);
  assert.match(html, /data-pr-criteria-health-matches="c1"/);
  assert.match(html, /data-pr-criteria-health-match-row="true"/);
  assert.match(html, /GAP/);
});

test("PrEvidenceView renders criteria health after matching and keeps the one-dot ledger", () => {
  const campaign: PrCampaign = {
    id: "campaign-health-view",
    sessionId: "session-pr",
    name: "Launch",
    briefText: "Brief",
    criteria: [
      { id: "c1", label: "活動名稱" },
      { id: "c2", label: "Hashtag" },
      { id: "c3", label: "核心訊息" },
      { id: "c4", label: "場地" },
      { id: "c5", label: "體驗主題" },
      { id: "c6", label: "CTA / 報名動作" }
    ],
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    lastMatchedAt: "2026-05-26T02:00:00.000Z"
  };
  const row: PrEvidenceRow = {
    id: "row-health-view",
    campaignId: "campaign-health-view",
    itemId: "item-health-view",
    postUrl: "https://www.threads.net/@health/post/1",
    authorHandle: "health_view",
    caption: "Matched evidence row",
    metrics: { likes: 5, comments: 1, reposts: 0 },
    criteriaMatches: { c1: true, c2: true, c3: false, c4: false, c5: false, c6: false },
    collectedAt: "2026-05-26T01:00:00.000Z"
  };
  const html = renderPrEvidenceView({ campaign: prCampaignToDraft(campaign), rows: [row] });

  assert.match(html, /data-pr-criteria-health="true"/);
  assert.match(html, /data-pr-match-indicator="true"/);
  assert.ok(
    html.indexOf('data-pr-criteria-health="true"') < html.indexOf('data-pr-evidence-ledger="compact"'),
    "criteria health should appear before the evidence ledger"
  );
  assert.doesNotMatch(html, /data-pr-work-tab=/);
});

test("PrEvidenceView hides criteria health until evidence has been matched", () => {
  const html = renderPrEvidenceView();
  assert.doesNotMatch(html, /data-pr-criteria-health="true"/);
});

function prFrameCampaign(overrides: Partial<PrCampaign> = {}): PrCampaign {
  return {
    id: "campaign-pr-frames",
    sessionId: "session-pr",
    name: "Launch",
    briefText: "本季 PR brief：自由接案者把 evidence 變成可交付。",
    criteria: [
      { id: "c1", label: "活動名稱" },
      { id: "c2", label: "Hashtag" },
      { id: "c3", label: "核心訊息" },
      { id: "c4", label: "場地" },
      { id: "c5", label: "體驗主題" },
      { id: "c6", label: "CTA / 報名動作" }
    ],
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    lastMatchedAt: "2026-05-26T02:00:00.000Z",
    ...overrides
  };
}

function prFrameRow(id: string, matches: number): PrEvidenceRow {
  const ids = ["c1", "c2", "c3", "c4", "c5", "c6"] as const;
  const criteriaMatches = Object.fromEntries(ids.map((cid, index) => [cid, index < matches])) as PrEvidenceRow["criteriaMatches"];
  return {
    id,
    campaignId: "campaign-pr-frames",
    itemId: `item-${id}`,
    postUrl: `https://www.threads.net/@pr/post/${id}`,
    authorHandle: `pr_${id}`,
    caption: `PR caption ${id}`,
    metrics: { likes: 5, comments: 1, reposts: 0 },
    criteriaMatches,
    collectedAt: "2026-05-26T01:00:00.000Z"
  };
}

test("Frame 6 — header stats surface captured / strong / criteria gaps from real match counts", () => {
  const vm = buildPrEvidenceVm({
    campaign: prCampaignToDraft(prFrameCampaign()),
    rows: [prFrameRow("a", 5), prFrameRow("b", 2), prFrameRow("c", 3)]
  });
  const html = renderToStaticMarkup(
    React.createElement(PrEvidenceView, {
      viewModel: vm,
      onCommand: () => undefined
    })
  );

  assert.match(html, /data-pr-evidence-rows-detail="collapsed"/);
  assert.match(html, /data-pr-evidence-header-stats="true"/);
  assert.match(html, /data-pr-evidence-header-stat="captured"/);
  assert.match(html, /data-pr-evidence-header-stat="strong"/);
  assert.match(html, /data-pr-evidence-header-stat="criteria-gap"/);
  assert.match(html, /Captured/);
  assert.match(html, /Strong/);
  assert.match(html, /Criteria 待補/);
  // one strong row (5 matches >= 4), three criteria have partial/gap coverage.
  assert.doesNotMatch(html, /outlier/);
});

test("Frame 11 — export preview shows ready card, format cards, and the systemic-gap note", () => {
  const html = renderPrEvidenceView({
    campaign: prCampaignToDraft(prFrameCampaign()),
    rows: [prFrameRow("a", 1)]
  });

  assert.match(html, /data-pr-export-ready="true"/);
  assert.match(html, /輸出 ready/);
  assert.match(html, /data-pr-format-card="csv"/);
  assert.match(html, /data-pr-format-card="md"/);
  assert.match(html, /data-pr-format-card="docx"/);
  // c2..c6 have zero matches -> a systemic gap note is written into the export.
  assert.match(html, /data-pr-export-gap-note="true"/);
});

test("Frame 7 — export action buttons keep commands and render download icon plus mono format tags", () => {
  const html = renderPrEvidenceView({
    campaign: prCampaignToDraft(prFrameCampaign()),
    rows: [prFrameRow("a", 4)],
    summary: "PR summary ready."
  });

  assert.match(html, /data-pr-export-button="csv"/);
  assert.match(html, /data-pr-export-button="md"/);
  assert.match(html, /data-pr-export-button="docx"/);
  assert.match(html, /data-pr-export-download-icon="csv"/);
  assert.match(html, /data-pr-export-download-icon="md"/);
  assert.match(html, /data-pr-export-download-icon="docx"/);
  assert.match(html, /data-pr-export-format-tag="csv"[^>]*>CSV/);
  assert.match(html, /data-pr-export-format-tag="md"[^>]*>MD/);
  assert.match(html, /data-pr-export-format-tag="docx"[^>]*>DOCX/);
});

test("Frame 08 — criteria setup shows the AI-drafted banner when a brief is loaded", () => {
  const html = renderPrEvidenceView({
    campaign: prCampaignToDraft(prFrameCampaign()),
    setupCollapsed: false
  });

  assert.match(html, /data-pr-criteria-ai-banner="true"/);
  assert.match(html, /AI 已從 brief 抽出/);
  assert.match(html, /6 條 criteria/);
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
  assert.match(html, /data-pr-match-summary="true"/);
  assert.match(html, /data-pr-metrics-detail="collapsed"/);
  assert.doesNotMatch(html, /data-pr-work-tab=/);
  assert.doesNotMatch(html, /data-pr-match-list="wrap"/);
  assert.match(html, /data-pr-metrics-list="wrap"/);
  assert.match(previewHtml, /data-pr-csv-preview-layout="wrap"/);
  assert.doesNotMatch(previewHtml, /min-width:1320/);
  assert.doesNotMatch(html, /data-pr-evidence-view="true"[^>]*padding-bottom/);
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
      rows: vm.ledger.rows,
      caption: vm.workingArea.ledgerCaption
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

test("Product, PR Evidence, and Topic modes render no folder strip", () => {
  // Topic selection moved into the floating preview card; the top strip is gone
  // in topic mode too, so all three non-archive modes render nothing.
  for (const activeFolderMode of ["product", "pr-evidence", "topic"] as const) {
    const html = renderToStaticMarkup(
      React.createElement(InPageCollectorFolderControls, {
        app: {
          activeFolderMode,
          activeFolder: { items: [] },
          topics: [{ id: "topic-work", name: "work" }],
          signals: [],
          productSignalAnalyses: []
        } as any
      })
    );

    assert.equal(html, "", `${activeFolderMode} mode should render nothing`);
    assert.doesNotMatch(html, /Select a folder/);
    assert.doesNotMatch(html, /新建主題/);
  }
});

test("Topic folder strip counts inbox and topics instead of saved backing items", () => {
  const topicSession = { ...buildSession(), mode: "topic" as const };
  const archiveSession = { ...buildSession(), mode: "archive" as const, name: "Archive" };
  const { formatWorkspaceOptionLabel } = inPageCollectorFolderControlsTestables;

  assert.equal(formatWorkspaceOptionLabel(topicSession), "Topic workspace");
  assert.equal(formatWorkspaceOptionLabel(archiveSession), "Archive (1)");
});

test("SettingsView exposes Google provider and save action", () => {
  const html = renderToStaticMarkup(
    React.createElement(SettingsView, {
      sessionMode: "product",
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
      onClearProductCache: () => undefined,
      createContextFileId: (kind, name) => `ctx_${kind}_${name}`,
      onSaveSettings: () => undefined
    })
  );

  assert.match(html, /data-mode-header="settings"/);
  assert.match(html, /連線設定與 API 金鑰存於本機，不會上傳。/);
  assert.doesNotMatch(html, /field drawer/);
  assert.match(html, /data-settings-surface="drawer"/);
  assert.doesNotMatch(html, /data-settings-group="folder"/);
  assert.doesNotMatch(html, /data-settings-mode-option=/);
  assert.doesNotMatch(html, /data-settings-group="layout"/);
  assert.match(html, /data-settings-group="language"/);
  assert.match(html, /data-settings-language-switch="true"/);
  assert.match(html, /data-settings-language-option="zh"[^>]*data-active="true"/);
  assert.match(html, /data-settings-language-option="en"[^>]*data-active="false"/);
  assert.match(html, /data-settings-group="connection"/);
  assert.match(html, /data-settings-group="keys"/);
  assert.match(html, /data-settings-group="product"/);
  assert.match(html, /data-settings-group="connection"[^>]*border-radius:20px/);
  assert.match(html, /data-settings-group="connection"[^>]*0 4px 14px -4px rgba\(27,26,23,0\.07\)/);
  assert.doesNotMatch(html, /資料夾類型/);
  assert.doesNotMatch(html, /產品觀察（Product）/);
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
  // Regression guard: the save dock must flow at the end of the form, never
  // float over the preceding card. A bottom-anchored sticky bar clips the last
  // card's border + button, which is the exact bug this replaces.
  assert.match(html, /data-settings-save-dock="footer"/);
  assert.doesNotMatch(html, /data-settings-save-dock="[^"]*"[^>]*position:sticky/);
  assert.match(html, /Save settings/);
  assert.match(html, /data-settings-save-status="success"/);
  assert.match(html, /ProductContext 已編譯/);
  assert.doesNotMatch(html, /Welcome|Get started/);
});

test("SettingsView shows saved key state when sanitized snapshot hides the raw key", () => {
  const html = renderToStaticMarkup(
    React.createElement(SettingsView, {
      sessionMode: "product",
      draftBaseUrl: "http://127.0.0.1:8000",
      draftProvider: "openai",
      draftOpenAiKey: "",
      draftClaudeKey: "",
      draftGoogleKey: "",
      hasOpenAiKey: true,
      draftLayoutPreferences: {
        productSignalCardLayout: "marginalia",
        topicSynthesisLayout: "console",
        compareResultLayout: "chapters"
      },
      draftProductProfile: {
        name: "",
        category: "",
        audience: "",
        contextText: "",
        contextFiles: []
      },
      onDraftBaseUrlChange: () => undefined,
      onDraftProviderChange: () => undefined,
      onDraftOpenAiKeyChange: () => undefined,
      onDraftClaudeKeyChange: () => undefined,
      onDraftGoogleKeyChange: () => undefined,
      onDraftLayoutPreferencesChange: () => undefined,
      onDraftProductProfileChange: () => undefined,
      createContextFileId: (kind, name) => `ctx_${kind}_${name}`,
      onSaveSettings: () => undefined
    })
  );

  assert.match(html, /data-settings-key-status="openai"/);
  assert.match(html, /已設定/);
  assert.match(html, /已儲存金鑰 · 輸入以覆寫/);
});

test("Frame 01 — saved-signals filter tabs surface unclassified / pending / classified", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement({
      kind: "saved-signals",
      signals: [
        { id: "s_ready", sessionId: "sess", itemId: "i1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-04-27T00:00:00.000Z" },
        { id: "s_pending", sessionId: "sess", itemId: "i2", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-04-27T00:00:00.000Z" },
        { id: "s_err", sessionId: "sess", itemId: "i3", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-04-27T00:00:00.000Z" }
      ],
      productProfile: {
        name: "DLens", category: "x", audience: "y", contextText: "z",
        contextFiles: [{ id: "f", name: "README.md", kind: "readme", importedAt: "2026-04-27T00:00:00.000Z", charCount: 1 }]
      },
      analyses: [],
      signalPreviewById: {},
      signalReadinessById: {
        s_ready: { status: "ready", itemStatus: "succeeded" },
        s_pending: { status: "saved", itemStatus: "saved" },
        s_err: { status: "failed", itemStatus: "failed" }
      },
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-product-saved-filter-tabs="true"/);
  assert.match(html, /data-product-saved-filter="unclassified"/);
  assert.match(html, /data-product-saved-filter="pending"/);
  assert.match(html, /data-product-saved-filter="classified"/);
  assert.match(html, /data-product-list-motion="saved-signals"/);
  assert.match(html, /data-dlens-list-key="s_ready"/);
  assert.match(html, /data-saved-signal-row="compact"[^>]*class="dlens-card-lift"/);
  assert.match(html, /data-saved-signals-frame="true"/);
  assert.doesNotMatch(html, /data-saved-signals-frame="true"[^>]*data-dlens-presence=/);
  assert.match(html, /data-saved-signal-row="compact"[^>]*data-dlens-presence="card"/);
  assert.match(html, /未分類/);
  assert.match(html, /待處理/);
  assert.match(html, /已分類/);
  // The old read-only intake strip is replaced by functional filter tabs.
  assert.doesNotMatch(html, /data-product-intake-strip/);
});

test("saved-signals filter tabs filter the list and the long list collapses", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    MouseEvent: globalThis.MouseEvent
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    MouseEvent: dom.window.MouseEvent
  });
  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);

  const readyIds = ["r1", "r2", "r3"];
  const pendingIds = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
  const signals = [...readyIds, ...pendingIds].map((id) => ({
    id, sessionId: "sess", itemId: `i_${id}`, source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-04-27T00:00:00.000Z"
  }));
  const signalReadinessById: Record<string, { status: string; itemStatus: string }> = {};
  for (const id of readyIds) signalReadinessById[id] = { status: "ready", itemStatus: "succeeded" };
  for (const id of pendingIds) signalReadinessById[id] = { status: "saved", itemStatus: "saved" };

  const countRows = () => rootElement!.querySelectorAll('[data-saved-signal-row="compact"]').length;
  const clickTab = (key: string) => {
    const tab = rootElement!.querySelector(`[data-product-saved-filter="${key}"]`);
    assert.ok(tab, `filter tab ${key} should render`);
    flushSync(() => tab!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  };

  try {
    flushSync(() => {
      root.render(
        productSignalViewElement({
          kind: "saved-signals",
          signals,
          analyses: [],
          signalPreviewById: {},
          signalReadinessById,
          onAnalyze: () => undefined
        })
      );
    });

    // All 11 saved signals → bounded to 6 rows with a collapse toggle.
    assert.equal(countRows(), 6);
    assert.ok(rootElement.querySelector("[data-product-saved-list-toggle]"));

    // 未分類 → exactly the 3 ready-but-unclassified signals, short enough to skip the toggle.
    clickTab("unclassified");
    assert.equal(countRows(), 3);
    assert.equal(rootElement.querySelector("[data-product-saved-list-toggle]"), null);

    // 待處理 → 8 pending, bounded to 6 until the toggle expands them.
    clickTab("pending");
    assert.equal(countRows(), 6);
    const toggle = rootElement.querySelector("[data-product-saved-list-toggle]");
    assert.ok(toggle);
    flushSync(() => toggle!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.equal(countRows(), 8);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("ProductSignalView shows real readiness state without fake AI results", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement({
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
  assert.match(html, /data-product-saved-pending-detail="collapsed"/);
  assert.doesNotMatch(html, /data-product-pending-card="topic-card"/);
  assert.doesNotMatch(html, /data-saved-signals-batch-export="true"/);
  assert.match(html, /尚未抓取/);
  assert.match(html, /重新處理/);
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

  assert.match(html, /data-product-hydrating="true"[^>]*data-dlens-presence="card"/);
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
  assert.match(html, /data-product-list-motion="actionable"/);
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

test("SavedSignalsBoard keeps saved rows scan-first with compact copy", () => {
  const longPreview = "用戶問產品需要如何收斂訊號列表，避免每行都像文章一樣難掃描 META_ROW_SHOULD_NOT_RENDER 這段不應在 compact row 出現";
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "saved-signals",
      signals: [
        {
          id: "signal_compact",
          sessionId: "session_a",
          itemId: "item_compact",
          source: "threads",
          inboxStatus: "processed",
          capturedAt: "2026-04-27T00:00:00.000Z"
        }
      ],
      analyses: [
        {
          signalId: "signal_compact",
          signalType: "learning",
          signalSubtype: "inbox_density",
          contentType: "discussion_starter",
          contentSummary: "列表需要更像營運 inbox。",
          relevance: 5,
          relevantTo: ["coreWorkflows"],
          whyRelevant: "直接影響 Product saved route 掃描效率。",
          verdict: "watch",
          reason: "先壓縮列表資訊量。",
          experimentHint: "把 row meta 降到一行。",
          evidenceRefs: ["e1"],
          productContextHash: "ctx_1",
          promptVersion: "v1",
          analyzedAt: "2026-04-27T01:00:00.000Z",
          status: "complete"
        }
      ],
      productProfile: productTestProfile(),
      signalPreviewById: { signal_compact: longPreview },
      signalReadinessById: {
        signal_compact: {
          status: "ready",
          itemStatus: "succeeded"
        }
      },
      onAnalyze: () => undefined,
      onGoToActionable: () => undefined
    })
  );

  assert.match(html, /data-saved-signal-title="compact"/);
  assert.match(html, /列表需要更像營運 inbox。/);
  assert.doesNotMatch(html, /META_ROW_SHOULD_NOT_RENDER/);
  assert.match(html, /data-product-merged-classification="true"/);
  assert.match(html, /data-product-classification-bucket="learning"/);
  assert.doesNotMatch(html, /可分析 · 學習資源 · 保留觀察/);
});

test("ProductSignalView saved signals apply the signed fusion density grammar from real analysis fields", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement({
      kind: "saved-signals",
      signals: [
        {
          id: "signal_fusion",
          sessionId: "session_fusion",
          itemId: "item_fusion",
          source: "threads",
          inboxStatus: "processed",
          capturedAt: "2026-07-06T00:00:00.000Z"
        }
      ],
      analyses: [
        {
          signalId: "signal_fusion",
          signalType: "demand" as const,
          signalSubtype: "pm_document_generation",
          contentType: "discussion_starter" as const,
          contentSummary: "把討論串轉成可派發給 agent 的產品任務。",
          relevance: 4 as const,
          relevantTo: ["coreWorkflows" as const],
          referenceType: "workflow_pattern" as const,
          referenceLabel: "討論轉 agent task",
          referenceTakeaway: "用 Product mode 收斂成可執行的驗證任務。",
          whyRelevant: "對應 Product mode 的收集到行動流程。",
          whyNow: "已經有多則收集內容需要統一判讀。",
          verdict: "try" as const,
          reason: "輸入、判讀和交付物都清楚。",
          experimentHint: "選三則 signal 產生 agent packet。",
          validationMetric: "三則 signal 中至少兩則能轉成可執行 task。",
          evidenceRefs: ["e1"],
          productContextHash: "ctx_fusion",
          promptVersion: "v17",
          model: "gpt-4.1-mini",
          analyzedAt: "2026-07-06T01:00:00.000Z",
          status: "complete" as const
        }
      ],
      productProfile: productTestProfile(),
      signalPreviewById: {
        signal_fusion: "原文提到需要把討論轉成 agent 可以接手的工作包。"
      },
      descriptorBySignalId: {
        signal_fusion: {
          author_hint: "pm_ops",
          engagement: { likes: 42, comments: 7, reposts: null, forwards: null },
          engagement_present: { likes: true, comments: true, reposts: false, forwards: false }
        }
      },
      onAnalyze: () => undefined,
      onGoToActionable: () => undefined
    })
  );

  assert.match(html, /data-product-fusion-card="hero"/);
  assert.match(html, /data-product-card-eyebrow="true"/);
  assert.match(html, /需求/);
  assert.match(html, /參考度 4\/5/);
  assert.match(html, /AI 生成/);
  assert.match(html, /討論開場/);
  assert.match(html, /PM 文件產出/);
  assert.match(html, /data-product-card-title="true"[^>]*>討論轉 agent task/);
  assert.match(html, /data-product-card-quote="true"/);
  assert.match(html, /原文提到需要把討論轉成 agent 可以接手的工作包。/);
  assert.match(html, /data-product-kv-grid="signal"/);
  assert.match(html, /data-product-kv="whyRelevant"/);
  assert.match(html, /data-product-kv="whyNow"/);
  assert.match(html, /data-product-kv="experimentHint"/);
  assert.match(html, /data-product-kv="validationMetric"/);
  assert.match(html, /data-collector-metric-strip="product-signal-signal_fusion"/);
  assert.match(html, /data-collector-metric="likes"[^>]*>[\s\S]*42/);
  assert.match(html, /data-collector-metric="comments"[^>]*>[\s\S]*7/);
  assert.match(html, /data-collector-metric="reposts"[^>]*>[\s\S]*–/);
  assert.match(html, /data-product-verdict-pill="try"[^>]*>值得嘗試/);
  assert.doesNotMatch(html, /相關度 4\/5/);
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

test("SavedSignalsBatchExport action brief packet card uses the signed frame 5 mono packet grammar", () => {
  const fixture = buildActionableCardFixture();
  const SavedSignalsBatchExport = (productSignalViewTestables as unknown as {
    SavedSignalsBatchExport: React.ComponentType<{
      signals: any[];
      analyses: typeof fixture.analysis[];
      activeFolderId?: string;
      exportFolders?: [];
      signalPreviewById: Record<string, string>;
      signalUrlById: Record<string, string>;
      selectedIds: string[];
      briefMode: "original" | "decision";
      onBriefModeChange: (mode: "original" | "decision") => void;
      onToggleSignal: (signalId: string) => void;
      evidenceBySignalId: typeof fixture.evidenceBySignalId;
    }>;
  }).SavedSignalsBatchExport;
  const signal = {
    signalId: fixture.signal.id,
    sessionId: fixture.signal.sessionId,
    itemId: fixture.signal.itemId,
    captureId: "cap-verdict",
    source: fixture.signal.source,
    title: fixture.analysis.contentSummary,
    sourcePreview: {
      author: "pm",
      text: "原文需要更清楚的 agent handoff。",
      sourceUrl: "https://www.threads.net/@pm/post/packet",
      likes: 9,
      commentCount: 2,
      assembledContent: "原文需要更清楚的 agent handoff。",
      hasAssembledContent: true,
      hasThreadReadModel: true,
      opContinuations: [],
      replies: [],
      discussionReplies: [],
      replyEdges: [],
      orphanReplies: [],
      displayText: "原文需要更清楚的 agent handoff。",
      displayUrl: "https://www.threads.net/@pm/post/packet"
    },
    readiness: { status: "ready", itemStatus: "succeeded" },
    analysisState: "ready",
    provenance: "ai",
    analysis: fixture.analysis,
    evidence: fixture.evidenceBySignalId.signal_verdict,
    actions: []
  };

  const html = renderToStaticMarkup(
    React.createElement(SavedSignalsBatchExport, {
      signals: [signal],
      analyses: [fixture.analysis],
      activeFolderId: fixture.signal.sessionId,
      exportFolders: [],
      signalPreviewById: { [fixture.signal.id]: signal.sourcePreview.displayText },
      signalUrlById: { [fixture.signal.id]: signal.sourcePreview.displayUrl },
      selectedIds: [fixture.signal.id],
      briefMode: "original",
      onBriefModeChange: () => undefined,
      onToggleSignal: () => undefined,
      evidenceBySignalId: fixture.evidenceBySignalId
    })
  );

  assert.match(html, /data-product-agent-packet-card="ready"/);
  assert.match(html, /data-product-agent-packet-block="true"/);
  assert.match(html, /data-product-agent-packet-field="signals"[^>]*>signals: 1/);
  assert.match(html, /data-product-agent-packet-field="buckets"[^>]*>buckets: 1/);
  assert.match(html, /agent_packet.ready/);
});

test("SavedSignalsBatchExport collapses unanalyzed placeholders into one summary row", () => {
  const signals = [
    {
      id: "signal_done",
      sessionId: "session_a",
      itemId: "item_done",
      source: "threads" as const,
      inboxStatus: "processed" as const,
      capturedAt: "2026-04-27T00:00:00.000Z"
    },
    ...["a", "b", "c", "d"].map((suffix) => ({
      id: `signal_pending_${suffix}`,
      sessionId: "session_a",
      itemId: `item_pending_${suffix}`,
      source: "threads" as const,
      inboxStatus: "unprocessed" as const,
      capturedAt: "2026-04-27T00:00:00.000Z"
    }))
  ];
  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "saved-signals",
      signals,
      analyses: [
        {
          signalId: "signal_done",
          signalType: "learning",
          signalSubtype: "agent_brief",
          contentType: "discussion_starter",
          contentSummary: "已完成分析的 signal 可輸出 brief。",
          relevance: 4,
          relevantTo: ["coreWorkflows"],
          whyRelevant: "可驗證 batch export。",
          verdict: "try",
          reason: "已有判讀。",
          experimentHint: "整理 agent brief。",
          evidenceRefs: ["e1"],
          productContextHash: "ctx_1",
          promptVersion: "v1",
          analyzedAt: "2026-04-27T01:00:00.000Z",
          status: "complete"
        }
      ],
      productProfile: productTestProfile(),
      signalPreviewById: Object.fromEntries(signals.map((signal) => [signal.id, `${signal.id} preview`])),
      signalReadinessById: Object.fromEntries(
        signals.map((signal) => [
          signal.id,
          signal.id === "signal_done"
            ? { status: "ready" as const, itemStatus: "succeeded" as const }
            : { status: "saved" as const, itemStatus: "saved" as const }
        ])
      ),
      onAnalyze: () => undefined,
      onGoToActionable: () => undefined
    })
  );

  assert.match(html, /data-saved-signals-batch-export="true"/);
  assert.match(html, /data-batch-export-unanalysed-summary="true"/);
  assert.match(html, /4 個 signal 待分析後可生成 brief/);
  assert.equal(countOccurrences(html, 'data-batch-export-selection-row="true"'), 1);
  assert.match(html, /data-batch-export-selection-row="true"[^>]*class="dlens-tactile-row"/);
});

test("ProductSignalView aggregates terminal crawler setup errors without raw backend details", () => {
  const signals = ["a", "b", "c", "d"].map((suffix) => ({
    id: `signal_fetching_${suffix}`,
    sessionId: "session_a",
    itemId: `item_fetching_${suffix}`,
    source: "threads" as const,
    inboxStatus: "unprocessed" as const,
    capturedAt: "2026-04-27T00:00:00.000Z"
  }));
  const signalReadinessById = Object.fromEntries(
    signals.map((signal) => [
      signal.id,
      {
        status: "failed" as const,
        itemStatus: "failed" as const,
        lastErrorKind: "crawler_setup_error",
        lastError: "BrowserType.launch: Executable doesn't exist at /Users/tung/Library/Caches/ms-playwright/chromium"
      }
    ])
  );

  const html = renderToStaticMarkup(
    productSignalViewElement( {
      kind: "saved-signals",
      signals,
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
      signalReadinessById,
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-product-error-aggregate="crawler_setup_error"/);
  assert.match(html, /4 個 signal 因後端瀏覽器設定失敗/);
  assert.match(html, /暫停自動重試/);
  assert.match(html, /抓取失敗/);
  assert.doesNotMatch(html, /抓取中（重試中）/);
  assert.doesNotMatch(html, /backend 回報錯誤/);
  assert.doesNotMatch(html, /BrowserType\.launch/);
  assert.doesNotMatch(html, /ms-playwright/);
  assert.doesNotMatch(html, /等待 backend 完成 ThreadReadModel/);
});

test("ProductSignalView ignores stale terminal job errors while signals are still crawling", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement({
      kind: "saved-signals",
      signals: [
        {
          id: "signal_retrying",
          sessionId: "session_a",
          itemId: "item_retrying",
          source: "threads",
          inboxStatus: "unprocessed",
          capturedAt: "2026-04-27T00:00:00.000Z"
        }
      ],
      analyses: [],
      productProfile: productTestProfile(),
      signalReadinessById: {
        signal_retrying: {
          status: "crawling",
          itemStatus: "running",
          lastErrorKind: "unexpected_runtime_error",
          lastError: "BrowserType.launch: Executable doesn't exist at /Users/tung/Library/Caches/ms-playwright/chromium"
        }
      },
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /抓取中/);
  assert.doesNotMatch(html, /data-product-error-aggregate/);
  assert.doesNotMatch(html, /抓取失敗/);
  assert.doesNotMatch(html, /BrowserType\.launch|ms-playwright|\/Users\/tung/);
});

test("ProductSignalView keeps crawling pending signals collapsed on saved-signals", () => {
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
  assert.match(html, /data-product-saved-pending-detail="collapsed"/);
  assert.match(html, /data-product-crawl-sweep="true"/);
  assert.match(html, /dlens-popup-indeterminate/);
  assert.doesNotMatch(html, /data-pending-signal-spinner="true"/);
  assert.doesNotMatch(html, /animation:dlens-spin 0\.8s linear infinite/);
});

test("ProductSignalView describes empty crawl output without implying crawler failure", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement({
      kind: "saved-signals",
      signals: [
        {
          id: "signal_empty_model",
          sessionId: "session_a",
          itemId: "item_empty_model",
          source: "threads",
          inboxStatus: "unprocessed",
          capturedAt: "2026-04-27T00:00:00.000Z"
        }
      ],
      analyses: [],
      productProfile: productTestProfile(),
      signalReadinessById: {
        signal_empty_model: {
          status: "missing_content",
          itemStatus: "succeeded"
        }
      },
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /未抽到正文/);
  assert.doesNotMatch(html, /內容不完整/);
  assert.doesNotMatch(html, /抓取失敗/);
});

test("Product action route collapses pending signals into a compact queue summary", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement({
      kind: "actionable-filter",
      signals: [
        {
          id: "signal_done",
          sessionId: "session_a",
          itemId: "item_done",
          source: "threads",
          inboxStatus: "processed",
          capturedAt: "2026-04-27T00:00:00.000Z"
        },
        {
          id: "signal_pending",
          sessionId: "session_a",
          itemId: "item_pending",
          source: "threads",
          inboxStatus: "unprocessed",
          capturedAt: "2026-04-27T00:02:00.000Z"
        }
      ],
      analyses: [
        {
          signalId: "signal_done",
          signalType: "demand",
          signalSubtype: "share_intake",
          contentType: "mixed",
          contentSummary: "Users want a one-tap mobile save flow.",
          relevance: 5,
          relevantTo: ["coreWorkflows"],
          whyRelevant: "It maps directly to DLens collect flow.",
          verdict: "try",
          reason: "The workflow is concrete enough for a small test.",
          experimentHint: "Prototype a share URL intake.",
          evidenceRefs: ["e1"],
          productContextHash: "ctx_1",
          promptVersion: "v1",
          analyzedAt: "2026-04-27T01:00:00.000Z",
          status: "complete"
        }
      ],
      productProfile: productTestProfile(),
      signalReadinessById: {
        signal_done: { status: "ready", itemStatus: "succeeded" },
        signal_pending: { status: "crawling", itemStatus: "running" }
      },
      signalPreviewById: {
        signal_done: "Done signal preview",
        signal_pending: "Pending signal should not become a big action card"
      },
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-product-action-queue-summary="true"/);
  assert.match(html, /1 則訊號等待進入行動判讀/);
  assert.match(html, /抓取\/分析中/);
  assert.doesNotMatch(html, /data-product-pending-card="topic-card"/);
  assert.doesNotMatch(html, /等待處理的 signals/);
  assert.doesNotMatch(html, /Pending signal should not become a big action card/);
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
  const savedHtml = renderToStaticMarkup(
    productSignalViewElement( {
      ...baseProps,
      kind: "saved-signals",
      onGoToActionable: () => undefined
    })
  );
  const actionableHtml = renderToStaticMarkup(
    productSignalViewElement( {
      ...baseProps,
      kind: "actionable-filter"
    })
  );

  assert.match(savedHtml, /data-product-merged-classification="true"/);
  assert.match(savedHtml, /分類摘要/);
  assert.match(savedHtml, /AI 已分類 1 \/ 1/);
  assert.match(savedHtml, /data-product-classification-bucket="demand"/);
  assert.match(savedHtml, /Threads post preview/);
  assert.match(savedHtml, /需求/);
  assert.doesNotMatch(savedHtml, /data-product-classification-layout="responsive"/);
  assert.doesNotMatch(savedHtml, /data-product-selected-aside="true"/);

  assert.match(classificationHtml, /分類構成/);
  assert.doesNotMatch(classificationHtml, /data-product-classification-board="true"[^>]*padding-bottom/);
  assert.match(classificationHtml, /系統挑出的內容/);
  assert.match(classificationHtml, /討論串內容/);
  assert.match(classificationHtml, /data-product-classification-layout="responsive"[^>]*min-width:0/);
  assert.match(classificationHtml, /data-product-selected-aside="true"[^>]*min-width:0/);
  assert.match(classificationHtml, /overflow-wrap:anywhere/);
  assert.doesNotMatch(classificationHtml, /grid-template-columns:minmax\(220px, 1\.1fr\) minmax\(240px, 1fr\)/);
  assert.match(classificationHtml, /data-scan-list="product-classification"/);
  assert.match(classificationHtml, /data-product-list-motion="classification"/);
  assert.match(classificationHtml, /data-scan-row="true"/);
  assert.match(classificationHtml, /data-classification-row-indicator="true"/);
  assert.match(classificationHtml, /data-scan-row="true"[^>]*class="dlens-tactile-row"/);
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
  assert.match(actionableHtml, /實驗切入/);
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
  // Motion is state-causal: verdict controls and list choreography move; the
  // read-only action card itself must not advertise a click affordance.
  assert.doesNotMatch(actionableHtml, /data-dlens-product-motion/);
  assert.match(actionableHtml, /data-product-list-motion="actionable"/);
  assert.match(actionableHtml, /data-verdict-filter-tiles="true"/);
  assert.match(actionableHtml, /data-verdict-filter-plate="true"/);
  assert.match(actionableHtml, /data-verdict-tile-count="true"/);
  assert.doesNotMatch(actionableHtml, /data-dlens-motion-card="true"/);
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

test("Product action brief preserves the four-part macro strip labels", () => {
  const fixture = buildActionableCardFixture();
  const html = renderToStaticMarkup(
    productSignalViewElement({
      kind: "actionable-filter",
      signals: [fixture.signal],
      analyses: [fixture.analysis],
      productProfile: fixture.productProfile,
      evidenceBySignalId: fixture.evidenceBySignalId,
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-product-macro-strip="true"/);
  assert.match(html, /信號重試/);
  assert.match(html, /噪音不符/);
  assert.match(html, /資料不足/);
  assert.match(html, /保留觀察/);
  assert.doesNotMatch(html, /受眾\s*\/\s*主題\s*\/\s*情緒\s*\/\s*主張/);
});

test("light frames keep prototype caption bars and admin export copy out of the live popup", () => {
  const fixture = buildActionableCardFixture();
  const productHtml = renderToStaticMarkup(
    productSignalViewElement({
      kind: "actionable-filter",
      signals: [fixture.signal],
      analyses: [fixture.analysis],
      productProfile: fixture.productProfile,
      evidenceBySignalId: fixture.evidenceBySignalId,
      onAnalyze: () => undefined
    })
  );

  const campaign: PrCampaign = {
    id: "campaign-light",
    sessionId: "session-pr",
    name: "Launch",
    briefText: "Brief",
    criteria: [
      { id: "c1", label: "活動名稱" },
      { id: "c2", label: "Hashtag" },
      { id: "c3", label: "核心訊息" },
      { id: "c4", label: "場地" },
      { id: "c5", label: "體驗主題" },
      { id: "c6", label: "CTA / 報名動作" }
    ],
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z"
  };
  const row: PrEvidenceRow = {
    id: "row-light",
    campaignId: "campaign-light",
    itemId: "item-light",
    postUrl: "https://www.threads.net/@light/post/1",
    authorHandle: "light",
    caption: "Evidence row that also renders the CSV export preview surface.",
    metrics: { likes: 3, comments: 1, reposts: 0 },
    criteriaMatches: { c1: true, c2: false, c3: false, c4: false, c5: false, c6: false },
    collectedAt: "2026-05-26T01:00:00.000Z"
  };
  const prHtml = renderPrEvidenceView({ campaign: prCampaignToDraft(campaign), rows: [row] });

  // Mockup-only caption bars must never leak into the live popup.
  assert.doesNotMatch(productHtml, /PRODUCT MODE\s*·/);
  assert.doesNotMatch(productHtml, /SHARED\s*·\s*DRILL-IN TEMPLATE/);
  assert.doesNotMatch(prHtml, /PR MODE\s*·/);

  // Export surfaces stay user-facing — no admin/debug/checksum internals.
  assert.doesNotMatch(prHtml, /checksum/i);
  assert.doesNotMatch(prHtml, /\bdebug\b/i);
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
  analysisOverride: Partial<ReturnType<typeof buildActionableCardFixture>["analysis"]> = {},
  readiness: SignalReadiness = { status: "ready", itemStatus: "succeeded" }
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
      readiness?: SignalReadiness;
    }>;
  };

  return renderToStaticMarkup(
    React.createElement(testables.ActionableItemCard, {
      analysis,
      index: 0,
      evidenceBySignalId: fixture.evidenceBySignalId,
      historicalAnalyses: [analysis],
      agentTaskFeedback: [],
      readiness,
      ...(layout ? { layout } : {})
    })
  );
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function findTagWithAttribute(html: string, attribute: string): string {
  const markerIndex = html.indexOf(attribute);
  assert.ok(markerIndex >= 0, `${attribute} must exist`);
  const tagStart = html.lastIndexOf("<", markerIndex);
  const tagEnd = html.indexOf(">", markerIndex);
  assert.ok(tagStart >= 0 && tagEnd >= 0, `${attribute} tag must be complete`);
  return html.slice(tagStart, tagEnd + 1);
}

function styleFromTag(tag: string): string {
  const match = tag.match(/\sstyle="([^"]*)"/);
  assert.ok(match, `${tag} must include inline style`);
  return match[1];
}

function cssRuleBlock(css: string, selectorNeedle: string): string {
  const selectorIndex = css.indexOf(selectorNeedle);
  assert.ok(selectorIndex >= 0, `${selectorNeedle} must exist`);
  const blockStart = css.indexOf("{", selectorIndex);
  const blockEnd = css.indexOf("}", blockStart);
  assert.ok(blockStart >= 0 && blockEnd >= 0, `${selectorNeedle} CSS block must close`);
  return css.slice(blockStart + 1, blockEnd);
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

test("ActionableItemCard renders the unified compact card for actionable verdicts", () => {
  const html = renderActionableCardFixture();

  assert.match(html, /data-product-action-card="verdict"/);
  assert.match(html, /data-testid="insight-headline"[^>]*>多來源討論轉交付文件/);
  assert.match(html, /data-product-readiness-chip="true"[^>]*data-product-readiness-status="ready"[^>]*>可分析/);
  assert.match(html, /實驗切入/);
  assert.match(html, /子型：PM 文件產出/);
  assert.match(html, /data-testid="task-slot"/);
  assert.match(html, /下一步/);
  assert.match(html, /產出 release-note 草稿/);
  // The old marginalia / verdict-panel / Frame-03 chrome is gone for good.
  assert.doesNotMatch(html, /data-marginalia-layout/);
  assert.doesNotMatch(html, /data-testid="verdict-panel"/);
  assert.doesNotMatch(html, /data-product-action-lead/);
  assert.doesNotMatch(html, /data-product-action-more/);
});

test("ActionableItemCard keeps the primary-card raised elevation and stays min-width safe", () => {
  const html = renderActionableCardFixture();
  const shellStyle = styleFromTag(findTagWithAttribute(html, `data-product-action-card="verdict"`));

  assert.equal(countOccurrences(html, `box-shadow:${tokens.shadow.raised}`), 1);
  assert.match(shellStyle, /min-width:0/);
});

test("ActionableItemCard stays width-safe as a single-column compact card", () => {
  const html = renderActionableCardFixture();

  assert.doesNotMatch(html, /\bwidth:(?:320|440)px/);
  assert.doesNotMatch(html, /\bmin-width:[2-9]\d{2}px/);
});

test("ProductSignalView threads action readiness into the compact cards", () => {
  const fixture = buildActionableCardFixture();
  const html = renderToStaticMarkup(
    productSignalViewElement({
      kind: "actionable-filter",
      signals: [fixture.signal],
      analyses: [fixture.analysis],
      productProfile: fixture.productProfile,
      evidenceBySignalId: fixture.evidenceBySignalId,
      signalReadinessById: {
        [fixture.signal.id]: { status: "crawling", itemStatus: "running" }
      },
      onAnalyze: () => undefined
    })
  );

  assert.match(html, /data-product-action-card="verdict"/);
  assert.match(html, /data-product-readiness-chip="true"[^>]*data-product-readiness-status="crawling"[^>]*>抓取中/);
});

test("ActionableItemCard renders noise and park verdicts as compact exclusion cards without task framing", () => {
  const html = renderActionableCardFixture(undefined, {
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

  assert.match(html, /data-product-action-card="exclusion"/);
  assert.match(html, /data-exclusion-card="true"/);
  assert.match(html, /不納入行動清單/);
  assert.match(html, /排除原因/);
  assert.match(html, /沒有可採用的產品需求或 workflow pattern/);
  assert.match(html, /暫無直接用途/);
  // Excluded cards carry no "下一步" task framing.
  assert.doesNotMatch(html, /data-testid="task-slot"/);
  assert.doesNotMatch(html, /下一步|可借用 workflow|任務 ›|排入小實驗/);
});

test("ActionableItemCard renders no source hero (the compact card has no lead block)", () => {
  const html = renderActionableCardFixture();
  assert.doesNotMatch(html, /data-product-action-lead="true"/);
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

  assert.match(html, /data-reading-first-run-cta="true"[^>]*data-dlens-presence="card"/);
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
  assert.match(html, /原文證據 · 2 則/);
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
  assert.match(html, /data-testid="task-slot"/);
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
  assert.doesNotMatch(html, /data-signal-reading-review-workspace="true"[^>]*padding-bottom/);
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
  assert.match(html, /data-product-macro-strip="true"/);
  assert.match(html, /data-verdict-filter-plate="true"/);
  assert.match(html, /data-verdict-tile-count="true"/);
  assert.match(html, /data-signal-reading-review-list-filter="watch"/);
  assert.match(html, /data-product-list-motion="reading-review"/);
  assert.match(html, /data-signal-reading-marginalia="true"/);
  assert.match(html, /data-signal-reading-marginalia-rail="true"/);
  assert.match(html, /border-left:3px solid var\(--dlens-mode-accent, #234f7a\)/);
  assert.match(html, /data-signal-reading-relevance-summary="true"/);
  assert.match(html, /data-signal-reading-provenance="true"/);
  assert.match(html, /data-signal-reading-evidence="true"/);
  assert.match(html, /引用留言 1 則/);
  assert.match(html, /對產品參考：這是一段完整顯示的長判斷，不能被截斷。/);
  assert.doesNotMatch(html, /source link/);
  assert.match(html, /信號重試/);
  assert.match(html, /噪音不符/);
  assert.match(html, /資料不足/);
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

test("reading-review card leads with original-post hero, keeps the judgment panel, folds provenance (Frame 03)", () => {
  const html = renderToStaticMarkup(
    productSignalViewElement({
      kind: "actionable-filter",
      signals: [
        { id: "signal_f03", sessionId: "sess", itemId: "i1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-18T00:00:00.000Z" }
      ],
      signalPreviewById: { signal_f03: "原文：多卡推理在 PCIe 頻寬限制下出現明顯瓶頸。" },
      analyses: [
        {
          signalId: "signal_f03",
          signalType: "marketing",
          signalSubtype: "positioning_signal",
          contentType: "mixed",
          contentSummary: "多卡推理瓶頸討論",
          relevance: 2,
          relevantTo: ["productPromise"],
          referenceType: "product_reference",
          referenceLabel: "對產品參考",
          referenceTakeaway: "用來判斷產品語氣。",
          whyRelevant: "對產品語氣有參考價值。",
          verdict: "park",
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
          signalId: "signal_f03",
          cacheKey: "f03-key",
          productContextHash: "ctx",
          sourcePacketHash: "pkt-f03",
          promptVersion: SIGNAL_READING_PROMPT_VERSION,
          reading: "AI 判讀內容。第二段完整判讀不應在主卡直接展開。\n\n第三段保留完整脈絡給需要的人展開閱讀。",
          generatedAt: "2026-05-18T01:00:00.000Z",
          model: "google:test",
          sourceRefs: ["e1"],
          sourcePacket: { assembledContent: "source content", postUrl: "https://www.threads.net/@gpu_dev/post/f03", representativeComments: [], analysisPromptVersion: "v16" },
          feedbackEvents: [],
          reviewState: "pending"
        }
      ],
      onAnalyze: () => undefined,
      onSynthesizeSignalReading: async () => ({ ok: true, reading: "new reading" }),
      onReviewSignalReading: async () => ({ ok: false, error: "missing" })
    })
  );

  // Original post leads as the SourceHero (original ≫ AI reading).
  assert.match(html, /data-evidence-source-hero="true"/);
  assert.match(html, /原文：多卡推理在 PCIe 頻寬限制下出現明顯瓶頸。/);
  // Judgment + relevance panel stays visible (the block to keep).
  assert.match(html, /data-signal-reading-relevance-summary="true"/);
  // The AI reading body is kept but secondary.
  assert.match(html, /AI 判讀內容。/);
  assert.match(html, /data-signal-reading-full="true"/);
  assert.match(html, /data-signal-reading-full-summary="true"/);
  assert.doesNotMatch(html, /<details[^>]*data-signal-reading-full="true"[^>]*open/);
  assert.ok(
    html.indexOf("data-signal-reading-full-summary=\"true\"") < html.indexOf("第二段完整判讀不應在主卡直接展開"),
    "long reading body should sit behind the full-reading disclosure"
  );
  // Source/capture provenance + evidence drill-down fold into a collapsed disclosure.
  assert.match(html, /data-signal-reading-more="true"/);
  const moreIndex = html.indexOf("data-signal-reading-more-summary=\"true\"");
  const captureIndex = html.indexOf("capture cap-signal_f03");
  assert.ok(moreIndex >= 0, "the more-disclosure should render");
  assert.ok(captureIndex > moreIndex, "provenance should sit inside the folded disclosure");
  // Hero (original) appears before the AI reading body.
  assert.ok(html.indexOf("data-evidence-source-hero") < html.indexOf("AI 判讀內容。"));
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
