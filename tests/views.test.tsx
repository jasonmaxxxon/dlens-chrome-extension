import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrNarrativeRead } from "../src/compare/pr-narrative.ts";
import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { prCampaignToDraft, type PrCampaign, type PrEvidenceRow } from "../src/state/pr-evidence-storage.ts";
import type { SessionRecord } from "../src/state/types.ts";
import { createDefaultSettings, createEmptyTabState } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import {
  buildPrEvidenceViewModel,
  type PrEvidenceCommand,
  type PrEvidenceResourceState,
  type PrEvidenceUiState,
  type PrEvidenceViewModel
} from "../src/viewmodel/pr-evidence.ts";
import { InPageCollectorPopup } from "../src/ui/InPageCollectorPopup.tsx";
import { createPrEvidenceResource } from "../src/ui/pr-evidence-resource.ts";
import { PrEvidenceView, prEvidenceViewTestables } from "../src/ui/PrEvidenceViews.tsx";
import { SettingsView } from "../src/ui/SettingsView.tsx";
import { surfaceCardStyle } from "../src/ui/components.tsx";
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
  criteriaReview: {},
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
function buildPopupAppFixture({
  session = buildSession(), sessions = [session], page = "topics", popupOpen = true,
  prEvidenceViewModel = buildPrEvidenceVm(), onSetActiveSession, onNavigate
}: {
  session?: SessionRecord; sessions?: SessionRecord[]; page?: string; popupOpen?: boolean;
  prEvidenceViewModel?: PrEvidenceViewModel;
  onSetActiveSession?: (sessionId: string) => Promise<{ ok: boolean }>;
  onNavigate?: (page: string) => Promise<unknown>;
} = {}) {
  const app = {
    snapshot: { global: { settings: createDefaultSettings(), sessions, activeSessionId: session.id, updatedAt: "2026-07-07T08:00:00.000Z" }, tab: { ...createEmptyTabState(), popupOpen, popupPage: page } },
    page, popupOpen, activeFolder: session, activeFolderMode: session.mode, activePrCampaign: null,
    topics: [] as any[], signals: [] as any[],
    compiledProductContext: null, storageUsage: null, settingsSaveStatus: null, isSavingSettings: false,
    workerStatus: "idle", backendWorkUiState: null, backendReachability: "unknown",
    processingSummary: { total: 0, ready: 0, crawling: 0, analyzing: 0, pending: 0, failed: 0, hasInflight: false },
    readInteractionNowMs: () => 0, readWallClockNowMs: () => Date.parse("2026-07-07T08:00:00.000Z"),
    prEvidenceViewModel,
    onSetActiveSession: async (_sessionId: string) => ({ ok: true }), onNavigate: async (_page: string) => undefined,
    onCreateWorkspace: async (_name: string, _mode: string) => ({ ok: true }),
    onRenameWorkspace: async (_id: string, _name: string) => ({ ok: true }), onDeleteWorkspace: async (_id: string) => ({ ok: true }),
    onCreateTopicNamed: async (_name: string, _question?: string, _signalId?: string) => undefined,
    onUpdateTopic: async (_patch: unknown, _id?: string) => undefined, onDeleteTopic: async (_id: string) => undefined,
    onSignalTriaged: async (_id: string, _action: unknown) => undefined, onSignalDeleted: async (_id: string) => undefined,
    onMoveAudienceItem: async (_sessionId: string, _itemId: string) => undefined,
    onExportSignalPackets: async (_request: { sessionId: string; format: string }) => ({ ok: false as const, error: "fixture export is idle" }),
    draftBaseUrl: "http://127.0.0.1:8000", draftProvider: "google", draftOpenAiKey: "", draftClaudeKey: "", draftGoogleKey: "",
    draftDeepReadingModels: {}, hasOpenAiKey: false, hasClaudeKey: false, hasGoogleKey: false,
    draftLayoutPreferences: createDefaultSettings().layoutPreferences, draftProductProfile: productTestProfile(),
    productProfileSeedText: "", isInitializingProductProfile: false, aiKeyStatus: null,
    setDraftBaseUrl: () => undefined, setDraftProvider: () => undefined, setDraftOpenAiKey: () => undefined,
    setDraftClaudeKey: () => undefined, setDraftGoogleKey: () => undefined, setDraftDeepReadingModels: () => undefined,
    setProductProfileSeedText: () => undefined, onDraftLayoutPreferencesChange: () => undefined, onDraftProductProfileChange: () => undefined,
    createContextFileId: () => "context-file", onSaveSettings: async () => true, onSaveAndTestAi: async () => undefined,
    onInitProductProfile: async () => undefined, onClearProductCache: async () => undefined,
    onPrEvidenceCommand: () => undefined, onPrEvidenceBriefFileSelected: () => undefined
  };
  app.onSetActiveSession = async (sessionId: string) => {
    const response = await onSetActiveSession?.(sessionId) ?? { ok: true };
    if (!response.ok) return response;
    const selected = app.snapshot.global.sessions.find((entry) => entry.id === sessionId);
    assert.ok(selected, "fixture can only activate an existing session");
    app.activeFolder = selected; app.activeFolderMode = selected.mode; app.snapshot.global.activeSessionId = selected.id;
    app.page = "collection"; app.snapshot.tab.popupPage = "collection";
    return response;
  };
  app.onNavigate = async (nextPage: string) => { app.page = nextPage; app.snapshot.tab.popupPage = nextPage; await onNavigate?.(nextPage); };
  return app;
}


function scrollPopup(viewport: HTMLElement, top: number) {
  viewport.scrollTop = top;
  viewport.dispatchEvent(new viewport.ownerDocument.defaultView!.Event("scroll"));
}

function popupTab(root: HTMLElement, label: "收藏" | "工作區"): HTMLButtonElement {
  const tab = [...root.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="主要導覽"] [role="tab"]')]
    .find((entry) => entry.textContent === label);
  assert.ok(tab, `primary tab ${label} must exist`);
  return tab;
}

test("InPageCollectorPopup keeps a workspace open pending across close and reopen and remounts PR upload refs", async () => {
  const { JSDOM } = await import("jsdom");
  const { act } = await import("react");
  const prSession = buildSession();
  prSession.mode = "pr-evidence";
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const host = dom.window.document.getElementById("root")!;
  const root = createRoot(host);
  let finishOpen!: (response: { ok: boolean }) => void;
  const pendingOpen = new Promise<{ ok: boolean }>((resolve) => { finishOpen = resolve; });
  const openCalls: string[] = [];
  const navCalls: string[] = [];
  const app = buildPopupAppFixture({
    session: prSession, page: "pr-evidence", prEvidenceViewModel: buildPrEvidenceVm({ setupCollapsed: false }),
    onSetActiveSession: async (id) => { openCalls.push(id); return pendingOpen; },
    onNavigate: async (page) => { navCalls.push(page); }
  });
  const render = async () => { await act(async () => root.render(<InPageCollectorPopup app={app as any} />)); };
  try {
    await render();
    assert.ok(host.querySelector('[data-collection-browser="list"]'));
    assert.equal(host.querySelector('input[type="file"]'), null, "existing domain state must not bypass the collection landing");
    assert.deepEqual(openCalls, []);
    await act(async () => popupTab(host, "工作區").click());
    const row = host.querySelector<HTMLButtonElement>(`[data-workspace-session="${prSession.id}"]`);
    assert.ok(row);
    await act(async () => row.click());
    assert.equal(row.disabled, true);
    const firstViewport = host.querySelector<HTMLElement>('[data-workspace-popup-scroll="viewport"]')!;
    scrollPopup(firstViewport, 240);

    app.popupOpen = false;
    await render();
    assert.equal(host.querySelector('[data-workspace-popup="shell"]'), null);
    assert.equal(firstViewport.isConnected, false);
    app.popupOpen = true;
    await render();
    const reopenedViewport = host.querySelector<HTMLElement>('[data-workspace-popup-scroll="viewport"]');
    assert.ok(reopenedViewport);
    assert.notEqual(reopenedViewport, firstViewport);
    assert.equal(reopenedViewport.scrollTop, 240, "workspace index scroll survives close/reopen");
    const pendingRow = host.querySelector<HTMLButtonElement>(`[data-workspace-session="${prSession.id}"]`);
    assert.ok(pendingRow);
    assert.equal(pendingRow.disabled, true, "reopening must not release an unresolved workspace navigation");
    assert.equal(popupTab(host, "收藏").disabled, true);
    await act(async () => pendingRow.click());
    assert.deepEqual(openCalls, [prSession.id], "the same in-flight open must not be sent twice");
    await act(async () => { finishOpen({ ok: true }); await pendingOpen; });
    assert.deepEqual(navCalls, ["pr-evidence"]);
    assert.equal(popupTab(host, "工作區").getAttribute("aria-selected"), "true");
    const firstBriefInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    assert.ok(firstBriefInput, "resolving the card open reaches the existing PR workflow");

    app.popupOpen = false;
    await render();
    assert.equal(firstBriefInput.isConnected, false);
    app.popupOpen = true;
    await render();
    const reopenedBriefInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    const uploadButton = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("上傳 PDF"));
    assert.ok(reopenedBriefInput);
    assert.ok(uploadButton);
    assert.notEqual(reopenedBriefInput, firstBriefInput);
    let detachedClicks = 0;
    let liveClicks = 0;
    firstBriefInput.addEventListener("click", () => { detachedClicks += 1; });
    reopenedBriefInput.addEventListener("click", () => { liveClicks += 1; });
    await act(async () => uploadButton.click());
    assert.equal(detachedClicks, 0);
    assert.equal(liveClicks, 1, "upload must use the live remounted input ref");
  } finally {
    finishOpen({ ok: true });
    await act(async () => { await pendingOpen; root.unmount(); });
    Object.assign(globalThis, previous);
    if (previousAct === undefined) delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    else actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct;
    dom.window.close();
  }
});

test("InPageCollectorPopup reopening the same route does not replay the lead presence motion", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const topicSession = buildSession();
  topicSession.mode = "topic";
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    IntersectionObserver: globalThis.IntersectionObserver
  };
  class CharacterizationIntersectionObserver {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
    takeRecords = () => [];
  }
  Object.defineProperty(dom.window, "IntersectionObserver", {
    configurable: true,
    value: CharacterizationIntersectionObserver
  });
  const app = buildPopupAppFixture({
    session: topicSession,
    page: "topics"
  });
  app.topics = [{
    id: "topic-motion",
    sessionId: topicSession.id,
    name: "Motion continuity",
    description: "",
    status: "watching",
    tags: [],
    signalIds: [],
    pairIds: [],
    createdAt: "2026-07-07T08:00:00.000Z",
    updatedAt: "2026-07-07T08:00:00.000Z"
  }];

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IntersectionObserver: CharacterizationIntersectionObserver
  });
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);

  try {
    await act(async () => {
      root.render(React.createElement(InPageCollectorPopup, { app: app as any }));
      await Promise.resolve();
    });
    assert.ok(rootElement.querySelector('[data-collection-browser="list"]'));
    await act(async () => popupTab(rootElement, "工作區").click());
    const workspaceRow = rootElement.querySelector<HTMLButtonElement>(`[data-workspace-session="${topicSession.id}"]`);
    assert.ok(workspaceRow);
    await act(async () => { workspaceRow.click(); await Promise.resolve(); });
    const firstPresenceCard = rootElement.querySelector<HTMLElement>('[data-dlens-presence="card"]');
    assert.ok(firstPresenceCard);
    assert.equal(firstPresenceCard.style.opacity, String(tokens.motion.presence.leadSoftPop.opacityFrom));
    assert.equal(firstPresenceCard.style.scale, String(tokens.motion.presence.leadSoftPop.scaleFrom));

    app.popupOpen = false;
    await act(async () => {
      root.render(React.createElement(InPageCollectorPopup, { app: app as any }));
      await Promise.resolve();
    });
    app.popupOpen = true;
    await act(async () => {
      root.render(React.createElement(InPageCollectorPopup, { app: app as any }));
      await Promise.resolve();
    });

    const reopenedPresenceCard = rootElement.querySelector<HTMLElement>('[data-dlens-presence="card"]');
    assert.ok(reopenedPresenceCard);
    assert.notEqual(reopenedPresenceCard, firstPresenceCard);
    assert.equal(
      reopenedPresenceCard.style.opacity,
      String(tokens.motion.presence.cardOpacityFrom),
      "same-route reopen must use the settled card rhythm, not a second lead soft-pop"
    );
    assert.equal(reopenedPresenceCard.style.scale, "");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    else reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    dom.window.close();
  }
});

test("InPageCollectorPopup keeps collection query and reader across reopen without changing workspace ownership", async () => {
  const { JSDOM } = await import("jsdom");
  const { act } = await import("react");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const host = dom.window.document.getElementById("root")!;
  const root = createRoot(host);
  const activeSession = buildSession();
  const otherSession = createSessionRecord("另一個產品工作區", "2026-09-21T00:00:00Z", "product");
  otherSession.items = [createSessionItem({ ...buildDescriptor(), post_url: "https://www.threads.net/@pear/post/other", author_hint: "pear", text_snippet: "pear 保存原文" }, "2026-09-21T00:00:00Z")];
  const sessions = [activeSession, otherSession];
  const inventoryBefore = JSON.stringify(sessions);
  const mutations: string[] = [];
  const app = buildPopupAppFixture({ session: activeSession, sessions,
    onSetActiveSession: async (id) => { mutations.push(`session:${id}`); return { ok: true }; },
    onNavigate: async (page) => { mutations.push(`page:${page}`); }
  });
  const render = async () => { await act(async () => root.render(<InPageCollectorPopup app={app as any} />)); };
  try {
    await render();
    assert.equal(host.querySelectorAll("[data-collection-post]").length, 2, "collection includes inactive workspaces");
    await act(async () => host.querySelector<HTMLButtonElement>('[data-collection-sort="comments"]')!.click());
    assert.equal(host.querySelector('[data-collection-sort="comments"]')?.getAttribute("aria-pressed"), "true");
    const innerScrollOwners = () => [...host.querySelectorAll<HTMLElement>('[data-collection-browser], [data-collection-browser] *')]
      .filter((element) => element.style.overflowY === "auto" || element.style.overflowY === "scroll");
    assert.equal(innerScrollOwners().length, 0, "collection uses the popup viewport as its single scroll owner");
    const search = host.querySelector<HTMLInputElement>('input[aria-label="搜尋收藏"]');
    assert.ok(search);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(search, "pear");
      search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(host.querySelectorAll("[data-collection-post]").length, 1);
    const row = host.querySelector<HTMLButtonElement>("[data-collection-post]");
    assert.ok(row);
    const viewport = () => host.querySelector<HTMLElement>('[data-workspace-popup-scroll="viewport"]')!;
    scrollPopup(viewport(), 180);
    await act(async () => row.click());
    assert.equal(viewport().scrollTop, 0, "a new reader starts at the top");
    scrollPopup(viewport(), 370);
    const firstReader = host.querySelector('[data-collection-browser="reader"]');
    assert.ok(firstReader);
    assert.equal(innerScrollOwners().length, 0, "reader uses the same outer scroll owner");
    assert.equal(host.querySelector('[data-collection-reader-body]')?.textContent, "pear 保存原文");
    app.popupOpen = false;
    await render();
    assert.equal(firstReader.isConnected, false);
    app.popupOpen = true;
    await render();
    assert.equal(viewport().scrollTop, 370, "reader scroll survives popup remount");
    assert.ok(host.querySelector('[data-collection-browser="reader"]'), "selectedKey survives the popup DOM unmount");
    assert.equal(host.querySelector('[data-collection-reader-body]')?.textContent, "pear 保存原文");
    const back = host.querySelector<HTMLButtonElement>('[data-collection-action="back"]');
    assert.ok(back);
    await act(async () => back.click());
    assert.equal(viewport().scrollTop, 180, "reader return restores the collection list");
    await act(async () => host.querySelector<HTMLButtonElement>("[data-collection-post]")!.click());
    assert.equal(viewport().scrollTop, 370, "reopening the same reader restores its own scroll");
    await act(async () => host.querySelector<HTMLButtonElement>('[data-collection-action="back"]')!.click());
    assert.equal(host.querySelector<HTMLInputElement>('input[aria-label="搜尋收藏"]')?.value, "pear");
    assert.equal(host.querySelectorAll("[data-collection-post]").length, 1);
    await act(async () => popupTab(host, "工作區").click());
    assert.equal(host.querySelectorAll("[data-workspace-session]").length, 2);
    scrollPopup(viewport(), 90);
    await act(async () => popupTab(host, "收藏").click());
    assert.equal(viewport().scrollTop, 180, "primary tabs keep independent positions");
    assert.equal(host.querySelector<HTMLInputElement>('input[aria-label="搜尋收藏"]')?.value, "pear");
    assert.equal(host.querySelector('[data-collection-sort="comments"]')?.getAttribute("aria-pressed"), "true", "sort survives close, reader and primary tab changes");
    assert.deepEqual(mutations, [], "browsing, reading and the workspace index must never change domain state");
    assert.equal(app.snapshot.global.activeSessionId, activeSession.id);
    assert.equal(JSON.stringify(sessions), inventoryBefore, "all folder modes and item ownership remain intact");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousAct === undefined) delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    else actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct;
    dom.window.close();
  }
});

test("InPageCollectorPopup settings returns to the open workspace page without selecting another session", async () => {
  const { JSDOM } = await import("jsdom");
  const { act } = await import("react");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const host = dom.window.document.getElementById("root")!;
  const root = createRoot(host);
  const prSession = buildSession();
  prSession.mode = "pr-evidence";
  const opened: string[] = [];
  const pages: string[] = [];
  const app = buildPopupAppFixture({ session: prSession, page: "pr-evidence",
    onSetActiveSession: async (id) => { opened.push(id); return { ok: true }; },
    onNavigate: async (page) => { pages.push(page); }
  });
  try {
    await act(async () => root.render(<InPageCollectorPopup app={app as any} />));
    await act(async () => popupTab(host, "工作區").click());
    const row = host.querySelector<HTMLButtonElement>(`[data-workspace-session="${prSession.id}"]`);
    assert.ok(row);
    await act(async () => row.click());
    assert.ok(host.querySelector('input[type="file"]'), "the original PR view is open");
    assert.equal(app.page, "pr-evidence");
    const viewport = host.querySelector<HTMLElement>('[data-workspace-popup-scroll="viewport"]')!;
    scrollPopup(viewport, 290);
    const menu = host.querySelector<HTMLElement>('[data-collection-menu] > summary');
    assert.ok(menu);
    await act(async () => menu.click());
    const settings = [...host.querySelectorAll<HTMLButtonElement>('[data-collection-menu] button')].find((button) => button.textContent === "設定");
    assert.ok(settings);
    await act(async () => settings.click());
    assert.ok(host.querySelector('[data-settings-surface="drawer"]'));
    assert.equal(viewport.scrollTop, 0, "settings have their own scroll position");
    scrollPopup(viewport, 110);
    assert.deepEqual(pages, ["pr-evidence", "settings"]);
    await act(async () => popupTab(host, "工作區").click());
    assert.equal(host.querySelector('[data-settings-surface="drawer"]'), null);
    assert.ok(host.querySelector('input[type="file"]'), "return restores the same PR workflow");
    assert.equal(app.page, "pr-evidence");
    assert.equal(viewport.scrollTop, 290, "settings return restores the PR workspace");
    assert.deepEqual(pages, ["pr-evidence", "settings", "pr-evidence"]);
    assert.deepEqual(opened, [prSession.id], "settings return must not activate a different or default session");
    assert.equal(popupTab(host, "工作區").getAttribute("aria-selected"), "true");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousAct === undefined) delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    else actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct;
    dom.window.close();
  }
});
test("InPageCollectorPopup closed facade reads only popupOpen and skips retained projection inputs", () => {
  for (const mode of ["product", "topic", "pr-evidence"] as const) {
    const reads: string[] = [];
    const app = new Proxy({ popupOpen: false }, { get(current, property, receiver) {
      const key = String(property); reads.push(key);
      assert.equal(key, "popupOpen", `closed ${mode} must not read projection or session inputs`);
      return Reflect.get(current, property, receiver);
    } });
    assert.equal(renderToStaticMarkup(<InPageCollectorPopup app={app as any} />), "");
    assert.deepEqual(reads, ["popupOpen"]);
  }
});

test("InPageCollectorPopup collection landing skips retained topic and PR projections", () => {
  for (const mode of ["topic", "product", "archive", "pr-evidence"] as const) {
    const session = { ...buildSession(), mode };
    const target = buildPopupAppFixture({ session, page: mode === "topic" ? "topics" : mode === "pr-evidence" ? "pr-evidence" : "collection" });
    const projectionReads: string[] = [];
    const app = new Proxy(target, { get(current, property, receiver) {
      if (property === "topics" || property === "signals" || property === "prEvidenceViewModel") projectionReads.push(String(property));
      return Reflect.get(current, property, receiver);
    } });
    const html = renderToStaticMarkup(<InPageCollectorPopup app={app as any} />);
    assert.match(html, /data-collection-browser="list"/);
    assert.deepEqual(projectionReads, [], `${mode} domain inputs stay behind explicit workspace navigation`);
  }
});


test("InPageCollectorPopup preserves the scroll frame and reaches topic creation through a workspace card", async () => {
  const { JSDOM } = await import("jsdom");
  const { act } = await import("react");
  const topicSession = buildSession();
  topicSession.mode = "topic";
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const host = dom.window.document.getElementById("root")!;
  const root = createRoot(host);
  const openCalls: string[] = [];
  const navCalls: string[] = [];
  const app = buildPopupAppFixture({ session: topicSession, page: "topics",
    onSetActiveSession: async (id) => { openCalls.push(id); return { ok: true }; },
    onNavigate: async (page) => { navCalls.push(page); }
  });
  const createdNames: string[] = [];
  app.onCreateTopicNamed = async (name: string) => { createdNames.push(name); };
  try {
    await act(async () => root.render(<InPageCollectorPopup app={app as any} />));
    const shell = host.querySelector<HTMLElement>('[data-workspace-popup="shell"]');
    assert.ok(shell, "popup frame remains separate from the scrolling content");
    assert.equal(shell.style.width, "100%");
    assert.equal(shell.style.height, "100vh");
    assert.equal(shell.style.overflow, "hidden");
    assert.ok(host.querySelector('[data-collection-workspace-shell="true"]'));
    assert.deepEqual([...host.querySelectorAll('[aria-label="主要導覽"] [role="tab"]')].map((tab) => tab.textContent), ["收藏", "工作區"]);
    assert.equal(host.querySelector('[data-workspace-switcher="segmented"]'), null);
    assert.equal(host.querySelector('[data-new-topic-button="triage"]'), null, "domain actions stay inside their workspace");
    assert.deepEqual(openCalls, []);
    assert.deepEqual(navCalls, []);

    const viewport = host.querySelector<HTMLElement>('[data-workspace-popup-scroll="viewport"]');
    assert.ok(viewport);
    assert.equal(viewport.style.height, "100%");
    assert.match(viewport.style.borderRadius, /^(0|0px)?$/, "the side panel viewport has square edges");
    assert.equal(viewport.style.boxSizing, "border-box");
    assert.equal(viewport.style.transform, "");
    assert.equal(viewport.style.overscrollBehaviorY, "contain");
    const track = viewport.querySelector<HTMLElement>('[data-workspace-popup-scroll-track="true"]');
    assert.ok(track);
    assert.equal(track.style.transform, "", "rebound leaves transform ownership alone");
    assert.equal(track.style.minHeight, "100%");
    const spacer = track.lastElementChild as HTMLElement | null;
    assert.ok(spacer, "last action remains reachable through a real scroll spacer");
    assert.equal(spacer.style.height, `${tokens.spacing.xl}px`);
    viewport.scrollTop = 150;
    await act(async () => popupTab(host, "工作區").click());
    assert.equal(viewport.scrollTop, 0, "primary navigation resets the shared scroll viewport");
    assert.deepEqual(openCalls, [], "opening the workspace index never changes the active session");
    const row = host.querySelector<HTMLButtonElement>(`[data-workspace-session="${topicSession.id}"]`);
    assert.ok(row);
    await act(async () => row.click());
    assert.deepEqual(openCalls, [topicSession.id]);
    assert.deepEqual(navCalls, ["topics"]);
    assert.equal(popupTab(host, "工作區").getAttribute("aria-selected"), "true");
    assert.ok(host.querySelector('[data-topic-discourse="home"]'));
    // 觀眾反應 home is the discourse view: with no 話題 yet it shows one line and the ＋ 新話題 pill, which opens the 名稱 + 研究問題 sheet; no prompt dialog.
    const newTopic = host.querySelector<HTMLButtonElement>('[data-discourse-new-topic]');
    assert.ok(newTopic, "the empty 觀眾反應 home offers ＋ 新話題");
    await act(async () => newTopic.click());
    const nameInput = host.querySelector<HTMLInputElement>('[data-discourse-new-topic-name]');
    assert.ok(nameInput, "the selected workspace renders the 觀眾反應 discourse view with its new-話題 form open");
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(nameInput, "畢業生搵工");
      nameInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await act(async () => nameInput.form!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.deepEqual(createdNames, ["畢業生搵工"]);
    assert.equal(host.querySelector('[data-workspace-popup-scroll="viewport"]'), viewport, "in-popup navigation keeps the shared viewport ref");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousAct === undefined) delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    else actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct;
    dom.window.close();
  }
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
  /* 2 of the campaign's 3 criteria clears the strong bar. */
  assert.match(html, /data-pr-evidence-strength-chip="strong"/);
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
  assert.match(html, /data-pr-summary-cta="empty"[\s\S]*data-attention-beam="actionable"/);
  assert.doesNotMatch(html, /data-pr-narrative-priority="true"/);
});

test("PR evidence AI generation controls use the shared attention grammar while brief upload stays plain", () => {
  const fixture = buildPrNarrativeViewFixture();

  const uploadHtml = renderPrEvidenceView({ ...fixture, setupCollapsed: false }, {
    activeLens: "evidence",
    isReadingBrief: true
  });
  assert.match(uploadHtml, /讀取中\.\.\./);
  assert.doesNotMatch(uploadHtml, /data-searching-orb="true"/);
  assert.match(uploadHtml, /data-pr-criteria-generate="true"[\s\S]*data-attention-beam="none"/);
  assert.doesNotMatch(uploadHtml, /data-pr-criteria-generate="true"[\s\S]*data-attention-beam="actionable"/);

  const criteriaUnavailableVm = buildPrEvidenceVm(
    { ...fixture, setupCollapsed: false },
    { activeLens: "evidence" }
  );
  const criteriaUnavailableHtml = renderToStaticMarkup(
    React.createElement(PrEvidenceView, {
      viewModel: {
        ...criteriaUnavailableVm,
        actions: criteriaUnavailableVm.actions.filter((action) => action.kind !== "generateCriteria")
      },
      onCommand: () => undefined
    })
  );
  assert.match(criteriaUnavailableHtml, /data-pr-criteria-generate="true"[\s\S]*data-attention-beam="none"/);
  assert.doesNotMatch(criteriaUnavailableHtml, /data-pr-criteria-generate="true"[\s\S]*data-attention-beam="actionable"/);

  const criteriaHtml = renderPrEvidenceView({ ...fixture, setupCollapsed: false }, {
    activeLens: "evidence",
    isGeneratingCriteria: true
  });
  assert.match(criteriaHtml, /data-pr-criteria-generate="true"[\s\S]*data-attention-beam="generating"/);
  assert.match(criteriaHtml, /data-searching-orb="true"/);

  const summaryHtml = renderPrEvidenceView(fixture, {
    activeLens: "evidence",
    isGeneratingSummary: true
  });
  assert.match(summaryHtml, /data-pr-summary-generate="true"[\s\S]*data-attention-beam="generating"/);
  assert.match(summaryHtml, /data-searching-orb="true"/);

  const summaryUnavailableHtml = renderPrEvidenceView(
    { campaign: fixture.campaign, rows: [], setupCollapsed: true },
    { activeLens: "evidence" }
  );
  assert.match(summaryUnavailableHtml, /data-pr-summary-generate="true"[\s\S]*data-attention-beam="none"/);
  assert.doesNotMatch(summaryUnavailableHtml, /data-pr-summary-generate="true"[\s\S]*data-attention-beam="actionable"/);

  const narrativeHtml = renderPrEvidenceView(fixture, {
    activeLens: "narrative",
    isGeneratingNarrative: true
  });
  assert.match(narrativeHtml, /data-pr-narrative-generate="true"[\s\S]*data-attention-beam="generating"/);
  assert.match(narrativeHtml, /data-searching-orb="true"/);

  const narrativeUnavailableHtml = renderPrEvidenceView(
    { campaign: fixture.campaign, rows: [], setupCollapsed: true },
    { activeLens: "narrative" }
  );
  assert.match(narrativeUnavailableHtml, /data-pr-narrative-generate="true"[\s\S]*data-attention-beam="none"/);
  assert.doesNotMatch(narrativeUnavailableHtml, /data-pr-narrative-generate="true"[\s\S]*data-attention-beam="actionable"/);
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
  assert.match(html, /2 \/ 3/);
  assert.match(html, /1 \/ 3/);
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
      { id: "c3", label: "CTA / 報名動作" },
      { id: "c4", label: "" },
      { id: "c5", label: "" },
      { id: "c6", label: "" }
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
      c3: false,
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
  assert.match(html, /data-pr-criteria-coverage-row="c3"/);
  assert.doesNotMatch(html, /data-pr-criteria-coverage-row="c4"/);
  assert.match(html, /data-pr-criteria-coverage-bar="c1"/);
  assert.match(html, /data-pr-criteria-coverage-fill="c1"/);
  assert.match(html, /data-pr-criteria-coverage-count="c1"[^>]*>4\/4/);
  assert.match(html, /data-pr-criteria-coverage-count="c3"[^>]*>0\/4/);
  assert.match(html, /data-pr-criteria-strength-dot="c3"/);
  // F1: the real criterion label stays primary; the C-id is only a secondary tag.
  assert.match(html, /CTA \/ 報名動作/);
  assert.match(html, /活動名稱/);
  assert.match(html, /data-pr-criteria-id="c3"/);
  assert.match(html, /系統性缺口/);
  // C3 has zero coverage -> it is a GAP row with a zero-width coverage lane.
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

test("Frame 08 — criteria setup shows three reviewable AI candidates when a brief is loaded", () => {
  const html = renderPrEvidenceView(
    {
      campaign: prCampaignToDraft(prFrameCampaign()),
      setupCollapsed: false
    },
    { criteriaReview: { c1: "candidate", c2: "candidate", c3: "candidate" } }
  );

  assert.match(html, /data-pr-criteria-ai-banner="true"/);
  assert.match(html, /AI 從 brief 抽出 3 條候選/);
  assert.match(html, /data-pr-criterion-row="c1"/);
  assert.match(html, /data-pr-criterion-row="c3"/);
  /* Three rows only: the campaign cap, even though storage still holds c4..c6. */
  assert.doesNotMatch(html, /data-pr-criterion-row="c4"/);
  assert.match(html, /data-pr-criterion-confirm="c1"/);
  assert.match(html, /data-pr-criterion-correct="c1"/);
  /* F7: "not seen in the brief" is its own act, never a confirmation. */
  assert.match(html, /data-pr-criterion-not-mentioned="c1"/);
  assert.match(html, /標記為未提及/);
});

test("Frame 08 — a criterion marked as not mentioned stops counting and is not confirmed", () => {
  const campaign = prFrameCampaign({
    criteria: [
      { id: "c1", label: "活動名稱" },
      { id: "c2", label: "Hashtag" },
      { id: "c3", label: "" },
      { id: "c4", label: "" },
      { id: "c5", label: "" },
      { id: "c6", label: "" }
    ]
  });
  const html = renderPrEvidenceView(
    { campaign: prCampaignToDraft(campaign), setupCollapsed: false },
    { criteriaReview: { c3: "not_mentioned" } }
  );

  assert.match(html, /data-pr-criterion-status="not_mentioned"/);
  assert.match(html, /brief 未提及/);
  assert.match(html, /1 條標記為未提及/);
  assert.doesNotMatch(html, /data-pr-criterion-confirm="c3"/);
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
        quotaBytes: 10 * 1024 * 1024,
        unlimitedStorage: true
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
  assert.match(html, /AI 金鑰只存在這部電腦。Ingest token 只會送到你設定的後端。/);
  assert.match(html, /data-settings-ingest-help="true"/);
  assert.match(html, /http:\/\/100\.115\.102\.41:8000/);
  assert.match(html, /Authorization: Bearer/);
  assert.match(html, /http:\/\/127\.0\.0\.1:8000/);
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
  assert.match(html, /data-settings-group="ai"/);
  assert.doesNotMatch(html, /data-settings-group="keys"/);
  assert.ok(html.indexOf('data-settings-group="ai"') < html.indexOf('data-settings-group="connection"'), "AI comes first (side panel A)");
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
  assert.match(html, /Storage 用量：2\.0 KB · 不限額/);
  assert.doesNotMatch(html, /Storage 用量：2\.0 KB \/ 10 MB/);
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
  // Each group saves itself (side panel A); the distant bottom "Save settings" is gone.
  assert.doesNotMatch(html, /data-settings-save-dock/);
  assert.doesNotMatch(html, /Save settings/);
  assert.match(html, /儲存並測試/);
  assert.match(html, /儲存產品資料/);
  assert.match(html, /data-settings-save-status="success"/);
  assert.match(html, /ProductContext 已編譯/);
  assert.doesNotMatch(html, /Welcome|Get started/);
});

test("SettingsView's AI group shows only the chosen provider's key, saves it in place and shows the test result", () => {
  const base = {
    sessionMode: "topic" as const, draftBaseUrl: "http://127.0.0.1:8000", draftOpenAiKey: "", draftClaudeKey: "", draftGoogleKey: "",
    hasGoogleKey: false, hasOpenAiKey: true, draftLayoutPreferences: createDefaultSettings().layoutPreferences,
    draftProductProfile: { name: "", category: "", audience: "" }, onDraftBaseUrlChange: () => undefined, onDraftProviderChange: () => undefined,
    onDraftOpenAiKeyChange: () => undefined, onDraftClaudeKeyChange: () => undefined, onDraftGoogleKeyChange: () => undefined,
    onDraftLayoutPreferencesChange: () => undefined, onDraftProductProfileChange: () => undefined,
    createContextFileId: (kind: string, name: string) => `${kind}_${name}`, onSaveSettings: () => undefined
  };
  const google = renderToStaticMarkup(React.createElement(SettingsView, { ...base, draftProvider: "google", aiKeyStatus: { kind: "error", message: "Google 拒絕了這個 key（400）" } } as any));
  assert.match(google, /data-settings-provider-option="google"[^>]*data-active="true"/);
  assert.match(google, /data-settings-ai-key="google"/);
  assert.doesNotMatch(google, /data-settings-ai-key="openai"/, "one key field: the chosen provider's");
  assert.match(google, /OpenAI<small[^>]*>已填/);
  assert.match(google, /data-settings-ai-status="error"[^]*Google 拒絕了這個 key（400）/);
  const off = renderToStaticMarkup(React.createElement(SettingsView, { ...base, draftProvider: "" } as any));
  assert.doesNotMatch(off, /data-settings-ai-key=/);
  assert.match(off, /未選 AI/);
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

test("PR frame keeps prototype caption bars and admin export copy out of the live popup", () => {
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
  assert.doesNotMatch(prHtml, /PR MODE\s*·/);

  // Export surfaces stay user-facing — no admin/debug/checksum internals.
  assert.doesNotMatch(prHtml, /checksum/i);
  assert.doesNotMatch(prHtml, /\bdebug\b/i);
});

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

async function withCollectionFocusDom(run: (host: HTMLElement, dom: any, root: any, act: any) => Promise<void>) {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  const previousAct = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const host = dom.window.document.getElementById("root")!;
  const root = createRoot(host);
  try { await run(host, dom, root, act); }
  finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousAct === undefined) delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    else (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousAct;
    dom.window.close();
  }
}
test("InPageCollectorPopup restores independent workspace session, settings route and discourse topic scroll positions", async () => {
  await withCollectionFocusDom(async (host, _dom, root, act) => {
    const one = { ...buildSession(), mode: "topic" as const };
    const two = { ...buildSession(), id: "second-topic-workspace", mode: "topic" as const };
    const app = buildPopupAppFixture({ session: one, sessions: [one, two] });
    app.topics = ["topic-a", "topic-b"].map(id => ({ id, sessionId: one.id, name: id, description: "", status: "watching", tags: [], signalIds: [], pairIds: [], createdAt: "2026-07-07T08:00:00.000Z", updatedAt: "2026-07-07T08:00:00.000Z" }));
    const render = async () => { await act(async () => root.render(<InPageCollectorPopup app={app as any} />)); };
    const viewport = () => host.querySelector<HTMLElement>('[data-workspace-popup-scroll="viewport"]')!;
    const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(entry => entry.textContent === label)!;
    const back = async () => { await act(async () => button("← 工作區").click()); };
    const open = async (id: string) => { await act(async () => host.querySelector<HTMLButtonElement>(`[data-workspace-session="${id}"]`)!.click()); };
    const selectTopic = async (id: string) => { await act(async () => host.querySelector<HTMLButtonElement>(`[data-discourse-topic="${id}"]`)!.click()); };
    const topicHome = async () => { await act(async () => button("‹ 觀眾反應").click()); };
    await render();
    await act(async () => popupTab(host, "工作區").click());
    await open(one.id);
    scrollPopup(viewport(), 140);
    await back(); await open(two.id);
    assert.equal(viewport().scrollTop, 0, "same route in a different session has no inherited position");
    scrollPopup(viewport(), 260);
    await back(); await open(one.id);
    assert.equal(viewport().scrollTop, 140);
    await act(async () => button("設定").click());
    assert.equal(viewport().scrollTop, 0, "settings route starts at its own position");
    scrollPopup(viewport(), 330);
    await act(async () => popupTab(host, "工作區").click());
    assert.equal(viewport().scrollTop, 140, "settings return restores the same workspace route");
    await selectTopic("topic-a");
    assert.equal(viewport().scrollTop, 0, "a new discourse topic has its own position");
    scrollPopup(viewport(), 480); await topicHome();
    assert.equal(viewport().scrollTop, 140);
    await selectTopic("topic-b"); assert.equal(viewport().scrollTop, 0);
    scrollPopup(viewport(), 590); await topicHome();
    await selectTopic("topic-a"); assert.equal(viewport().scrollTop, 480);
    await topicHome(); assert.equal(viewport().scrollTop, 140);
    await selectTopic("topic-b"); assert.equal(viewport().scrollTop, 590);
    await topicHome(); await back(); await open(two.id);
    assert.equal(viewport().scrollTop, 260);
  });
});


test("PR-only popup keeps mixed inventories and stale non-PR routes behind the PR boundary", async () => {
  const { build } = await import("esbuild");
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { pathToFileURL } = await import("node:url");
  const { resolve, join } = await import("node:path");
  const cache = resolve("node_modules/.cache");
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, "dlens-pr-popup-"));
  try {
    const bundle = await build({ entryPoints: ["src/ui/InPageCollectorPopup.tsx"], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
      define: { "import.meta.env": JSON.stringify({ VITE_DLENS_BUILD_VARIANT: "pr-only" }) } });
    const modulePath = join(directory, "popup.mjs");
    await writeFile(modulePath, bundle.outputFiles[0].text);
    const { InPageCollectorPopup: PrPopup } = await import(pathToFileURL(modulePath).href);
    await withCollectionFocusDom(async (host, dom, root, act) => {
      const topic = buildSession();
      const pr = { ...buildSession(), id: "pr-workspace", mode: "pr-evidence" as const, name: "核對工作區" };
      const app = buildPopupAppFixture({ session: topic, sessions: [topic, pr], page: "topics" });
      const calls: Array<[string, string]> = [];
      app.onCreateWorkspace = async (name, mode) => { calls.push([name, mode]); return { ok: false }; };
      await act(async () => root.render(<PrPopup app={app} />));
      assert.equal(host.querySelector('[data-collection-browser]'), null);
      assert.deepEqual([...host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent), ["工作區"]);
      assert.ok(host.querySelector('[data-workspace-home]'), "stale non-PR domain opens only the allowed workspace index");
      assert.deepEqual([...host.querySelectorAll('[data-workspace-session]')].map((row) => row.getAttribute("data-workspace-session")), [pr.id]);
      await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "＋ 新工作區")!.click());
      assert.deepEqual([...host.querySelectorAll('select[name="workspace-type"] option')].map((option) => option.getAttribute("value")), ["pr-evidence"]);
      const name = host.querySelector<HTMLInputElement>('input[name="workspace-name"]')!;
      await act(async () => { name.value = "新核對"; name.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
      await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
      assert.deepEqual(calls, [["新核對", "pr-evidence"]]);
      await act(async () => host.querySelector<HTMLButtonElement>(`[data-workspace-session="${pr.id}"]`)!.click());
      assert.equal(app.activeFolder.id, pr.id);
      assert.equal(app.page, "pr-evidence");
      assert.ok(host.querySelector('input[type="file"]'), "existing PR tools remain reachable");
      assert.equal(host.querySelector('[data-collection-browser]'), null);
    });
    await withCollectionFocusDom(async (host, _dom, root, act) => {
      const product = { ...buildSession(), mode: "product" as const };
      const app = buildPopupAppFixture({ session: product, page: "signals" });
      let completeNavigation!: () => void;
      const navigation = new Promise<void>((resolve) => { completeNavigation = resolve; });
      app.onNavigate = async () => { await navigation; app.page = "settings"; };
      await act(async () => root.render(<PrPopup app={app} />));
      assert.ok(host.querySelector('[data-workspace-home]'));
      try {
        await act(async () => [...host.querySelectorAll<HTMLButtonElement>('[data-collection-menu] button')].find((button) => button.textContent === "設定")!.click());
        assert.equal(app.page, "signals", "domain route remains stale while settings navigation is pending");
        assert.ok(host.querySelector('[data-settings-surface="drawer"]'));
        const exposedProductControls = () => ({
          workspace: Boolean(host.querySelector('[data-product-saved-list], [data-product-hydrating], [data-product-classification-board], [data-signals-filter]')),
          settings: Boolean(host.querySelector('[data-settings-group="product"]')),
          cacheReset: Boolean(host.querySelector('[data-product-cache-reset]'))
        });
        assert.deepEqual(exposedProductControls(), { workspace: false, settings: false, cacheReset: false }, "pending PR-only settings must not expose the stale Product domain");
        await act(async () => { completeNavigation(); await navigation; });
        await act(async () => root.render(<PrPopup app={app} />));
        assert.deepEqual(exposedProductControls(), { workspace: false, settings: false, cacheReset: false }, "settled settings keep PR-only controls");
      } finally { await act(async () => { completeNavigation(); await navigation; }); }
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("InPageCollectorPopup captures user scroll before shorter route DOM clamps the viewport", async () => {
  await withCollectionFocusDom(async (host, dom, root, act) => {
    const app = buildPopupAppFixture();
    await act(async () => root.render(<InPageCollectorPopup app={app as any} />));
    const viewport = host.querySelector<HTMLElement>('[data-workspace-popup-scroll="viewport"]')!;
    viewport.scrollTop = 420;
    viewport.dispatchEvent(new dom.window.Event("scroll"));
    const list = host.querySelector('[data-collection-browser="list"]')!;
    const parent = list.parentElement!;
    const removeChild = parent.removeChild.bind(parent);
    parent.removeChild = ((child: Node) => {
      const result = removeChild(child);
      // Browsers clamp scrollTop as soon as a shorter page replaces the list.
      viewport.scrollTop = 0;
      return result;
    }) as typeof parent.removeChild;
    await act(async () => host.querySelector<HTMLButtonElement>("[data-collection-post]")!.click());
    parent.removeChild = removeChild;
    await act(async () => host.querySelector<HTMLButtonElement>('[data-collection-action="back"]')!.click());
    assert.equal(viewport.scrollTop, 420, "save the last user scroll, not the post-mutation clamped value");
  });
});

test("InPageCollectorPopup retries a clamped reader offset when late images expand the content", async () => {
  await withCollectionFocusDom(async (host, dom, root, act) => {
    const observers: Array<{ callback: ResizeObserverCallback; active: boolean }> = [];
    dom.window.ResizeObserver = class {
      entry: { callback: ResizeObserverCallback; active: boolean };
      constructor(callback: ResizeObserverCallback) { this.entry = { callback, active: false }; observers.push(this.entry); }
      observe() { this.entry.active = true; }
      disconnect() { this.entry.active = false; }
    };
    const app = buildPopupAppFixture();
    const render = async () => { await act(async () => root.render(<InPageCollectorPopup app={app as any} />)); };
    const openReader = async () => { await act(async () => host.querySelector<HTMLButtonElement>("[data-collection-post]")!.click()); };
    const back = async () => { await act(async () => host.querySelector<HTMLButtonElement>('[data-collection-action="back"]')!.click()); };
    await render();
    await openReader();
    const viewport = host.querySelector<HTMLElement>('[data-workspace-popup-scroll="viewport"]')!;
    scrollPopup(viewport, 650);
    await back();
    let maxScrollTop = 120;
    let top = 0;
    Object.defineProperty(viewport, "scrollTop", { configurable: true, get: () => top, set: (value: number) => { top = Math.min(value, maxScrollTop); } });
    await openReader();
    assert.equal(viewport.scrollTop, 120, "simulate unloaded images clamping the restored reader");
    viewport.dispatchEvent(new dom.window.Event("scroll"));
    maxScrollTop = 1000;
    await act(async () => { for (const observer of observers) if (observer.active) observer.callback([], {} as ResizeObserver); });
    assert.equal(viewport.scrollTop, 650, "content resize restores the original requested offset");
    assert.ok(observers.every((observer) => !observer.active), "successful restoration disconnects observers");
    await back();
    maxScrollTop = 100;
    await openReader();
    assert.equal(viewport.scrollTop, 100);
    viewport.dispatchEvent(new dom.window.WheelEvent("wheel", { bubbles: true, deltaY: -40 }));
    scrollPopup(viewport, 60);
    maxScrollTop = 1000;
    await act(async () => { for (const observer of observers) if (observer.active) observer.callback([], {} as ResizeObserver); });
    assert.equal(viewport.scrollTop, 60, "user scrolling cancels the pending restoration");
    await back();
    await openReader();
    assert.equal(viewport.scrollTop, 60, "the user's new offset replaces the old pending target");
    assert.ok(observers.every((observer) => !observer.active));
  });
});

test("InPageCollectorPopup keeps workspace mutations pending and failures visible across close and reopen", async () => {
  await withCollectionFocusDom(async (host, dom, root, act) => {
    const app = buildPopupAppFixture();
    const calls: string[] = [];
    let finish!: (result: unknown) => void;
    app.onRenameWorkspace = async (id: string) => { calls.push(id); return new Promise((resolve) => { finish = resolve; }); };
    app.onDeleteWorkspace = async (id: string) => { calls.push(`delete:${id}`); return new Promise((resolve) => { finish = resolve; }); };
    const render = async () => { await act(async () => root.render(<InPageCollectorPopup app={app as any} />)); };
    const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.textContent === label)!;
    await render();
    await act(async () => popupTab(host, "工作區").click());
    await act(async () => button("重新命名").click());
    const input = host.querySelector<HTMLInputElement>('input[name="workspace-rename"]')!;
    await act(async () => { input.value = "改名"; input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    await act(async () => button("儲存名稱").click());
    assert.equal(popupTab(host, "收藏").disabled, true, "pending mutation blocks tab-driven unmount and duplicate requests");
    await act(async () => button("設定").click());
    assert.equal(host.querySelector('[data-settings-surface="drawer"]'), null, "settings cannot bypass the mutation lock");
    app.popupOpen = false;
    await render();
    app.popupOpen = true;
    await render();
    assert.equal(popupTab(host, "收藏").disabled, true, "facade lock survives popup remount");
    assert.equal(button("重新命名").disabled, true);
    await act(async () => button("重新命名").click());
    assert.deepEqual(calls, [app.activeFolder.id]);
    await act(async () => finish({ ok: false, error: "private failure" }));
    assert.equal(popupTab(host, "收藏").disabled, false);
    assert.equal(host.querySelectorAll('[role="alert"]').length, 1);
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? "", /未能重新命名/);
    assert.doesNotMatch(host.textContent ?? "", /private failure/);
    await act(async () => button("刪除").click());
    await act(async () => button("確認刪除").click());
    app.popupOpen = false;
    await render();
    await act(async () => finish({ ok: false }));
    app.popupOpen = true;
    await render();
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? "", /未能刪除/);
    await act(async () => button("刪除").click());
    await act(async () => button("確認刪除").click());
    await act(async () => finish({ ok: true }));
    assert.equal(host.querySelector('[role="alert"]'), null, "successful retry clears the persisted failure");
    assert.equal(popupTab(host, "收藏").disabled, false);
  });
});


test("SettingsView deep model field follows the chosen provider and saved override", () => {
  const base = {
    sessionMode: "topic", draftBaseUrl: "http://127.0.0.1:8000", draftOpenAiKey: "", draftClaudeKey: "", draftGoogleKey: "",
    draftLayoutPreferences: createDefaultSettings().layoutPreferences, draftProductProfile: { name: "", category: "", audience: "" },
    onDraftBaseUrlChange: () => {}, onDraftProviderChange: () => {}, onDraftOpenAiKeyChange: () => {}, onDraftClaudeKeyChange: () => {}, onDraftGoogleKeyChange: () => {},
    onDraftLayoutPreferencesChange: () => {}, onDraftProductProfileChange: () => {}, createContextFileId: () => "id", onSaveSettings: () => {}
  };
  for (const [provider, model] of [["google", "gemini-3.8-flash"], ["claude", "claude-sonnet-5-5"], ["openai", "gpt-4.1-mini"]]) {
    const html=renderToStaticMarkup(React.createElement(SettingsView, {...base,draftProvider:provider} as any));
    assert.match(html,new RegExp(`data-settings-deep-model="${provider}"`)); assert.match(html,new RegExp(`value="${model}"`));
    assert.equal((html.match(/data-settings-deep-model=/g)||[]).length,1);
  }
  const html=renderToStaticMarkup(React.createElement(SettingsView,{...base,draftProvider:"google",draftDeepReadingModels:{google:"custom-model"}} as any));
  assert.match(html,/value="custom-model"/);
});

test('card reader handoff opens on the requested lens live and after pending load, without domain mutations', async()=>{
 const {JSDOM}=await import('jsdom');const {act}=await import('react');const {requestWorkspaceOpen}=await import('../src/ui/inpage-helpers.tsx');
 const dom=new JSDOM('<div id="root"></div>',{url:'https://dlens.test',pretendToBeVisual:true});
 const previous={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement};const g=globalThis as any;const oldAct=g.IS_REACT_ACT_ENVIRONMENT;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement});g.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=await import('react-dom/client');const host=document.getElementById('root')!;const root=createRoot(host);
 const product=createSessionRecord('個人應用','2026-10-13T00:00:00Z','product');product.items=[createSessionItem({...buildDescriptor(),post_url:'https://www.threads.com/@pear/post/F1',author_hint:'pear',text_snippet:'保存原文'},'2026-10-13T00:00:00Z')];
 const mutations:string[]=[];const app=buildPopupAppFixture({session:product,sessions:[product],onSetActiveSession:async id=>{mutations.push(id);return {ok:true};},onNavigate:async p=>{mutations.push(p);}});
 try {
  // Fresh-load handoff arrives before React mounts and before inventory consumption.
  requestWorkspaceOpen(product.id,dom.window as any,{itemId:product.items[0].id,lens:'try'});
  await act(async()=>root.render(<InPageCollectorPopup app={app as any}/>));
  assert.ok(host.querySelector('[data-collection-browser="reader"]'));
  assert.equal(host.querySelector('[data-reader-entry="try"]')?.getAttribute('aria-pressed'),'true');
  await act(async()=>requestWorkspaceOpen(product.id,dom.window as any,{itemId:product.items[0].id,lens:'what'}));
  assert.equal(host.querySelector('[data-reader-entry="what"]')?.getAttribute('aria-pressed'),'true');
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-reader-entry="fit"]')!.click());
  await act(async()=>requestWorkspaceOpen(product.id,dom.window as any,{itemId:product.items[0].id,lens:'what'}));
  assert.equal(host.querySelector('[data-reader-entry="what"]')?.getAttribute('aria-pressed'),'true','repeated card handoff overrides the lens selected locally');
  assert.deepEqual(mutations,[]);
 }finally{await act(async()=>root.unmount());Object.assign(globalThis,previous);g.IS_REACT_ACT_ENVIRONMENT=oldAct;dom.window.close();}
});

test("workspace cards open product and archive in collection with the matching visible filter", async () => {
  for (const mode of ["product", "archive"] as const) {
    await withCollectionFocusDom(async (host, _dom, root, act) => {
      const topic = { ...buildSession(), id: "audience-owner", mode: "topic" as const };
      const destination = { ...buildSession(), id: `open-${mode}`, mode };
      const opened: string[] = [];
      const navigated: string[] = [];
      const app = buildPopupAppFixture({ session: topic, sessions: [topic, destination],
        onSetActiveSession: async id => { opened.push(id); return { ok: true }; },
        onNavigate: async page => { navigated.push(page); }
      });
      await act(async () => root.render(<InPageCollectorPopup app={app as any} />));
      await act(async () => popupTab(host, "工作區").click());
      const card = host.querySelector<HTMLButtonElement>(`[data-workspace-session="${destination.id}"]`);
      assert.ok(card);
      await act(async () => card.click());
      assert.deepEqual(opened, [destination.id]);
      assert.deepEqual(navigated, ["collection"]);
      assert.equal(app.activeFolder.id, destination.id);
      assert.equal(popupTab(host, "收藏").getAttribute("aria-selected"), "true");
      assert.ok(host.querySelector('[data-collection-browser="list"]'));
      assert.equal(host.querySelector(`[data-collection-filter="${mode}"]`)?.getAttribute("aria-pressed"), "true");
      assert.equal(host.querySelectorAll('[data-collection-filter][aria-pressed="true"]').length, 1);
      assert.equal(Boolean(host.querySelector('[data-collection-signal-packet-export]')), mode === "product");
      assert.equal(host.querySelector('[data-topic-discourse], input[type="file"]'), null);
    });
  }
});

test("side-panel workspace handoff opens archive collection and selects its filter", async () => {
  const { requestWorkspaceOpen } = await import("../src/ui/inpage-helpers.tsx");
  await withCollectionFocusDom(async (host, dom, root, act) => {
    const owner = { ...buildSession(), id: "owner", mode: "topic" as const };
    const archive = { ...buildSession(), id: "archive-handoff", mode: "archive" as const };
    const pages: string[] = [];
    const app = buildPopupAppFixture({ session: owner, sessions: [owner, archive], onNavigate: async page => { pages.push(page); } });
    requestWorkspaceOpen(archive.id, dom.window as any);
    await act(async () => root.render(<InPageCollectorPopup app={app as any} />));
    assert.equal(app.activeFolder.id, archive.id);
    assert.deepEqual(pages, ["collection"]);
    assert.equal(popupTab(host, "收藏").getAttribute("aria-selected"), "true");
    assert.equal(host.querySelector('[data-collection-filter="archive"]')?.getAttribute("aria-pressed"), "true");
    assert.ok(host.querySelector('[data-collection-browser="list"]'));
    assert.equal(host.querySelector('[data-collection-signal-packet-export]'), null);
    assert.equal(host.querySelector('[data-workspace-home]'), null);
  });
});

test("Signal Packet row appears only under the product collection filter", async () => {
  await withCollectionFocusDom(async (host, _dom, root, act) => {
    const product = { ...buildSession(), id: "product-export", mode: "product" as const };
    const archive = { ...buildSession(), id: "archive-export", mode: "archive" as const };
    const app = buildPopupAppFixture({ session: product, sessions: [product, archive] });
    await act(async () => root.render(<InPageCollectorPopup app={app as any} />));
    assert.equal(host.querySelector('[data-collection-signal-packet-export]'), null, "all is the initial collection filter");
    await act(async () => host.querySelector<HTMLButtonElement>('[data-collection-filter="product"]')!.click());
    assert.ok(host.querySelector('[data-collection-signal-packet-export]'));
    assert.ok(host.querySelector('select[aria-label="Signal Packet 格式"]'));
    for (const filter of ["all", "topic", "archive"] as const) {
      await act(async () => host.querySelector<HTMLButtonElement>(`[data-collection-filter="${filter}"]`)!.click());
      assert.equal(host.querySelector('[data-collection-signal-packet-export]'), null, `${filter} keeps the product export action out of its collection`);
    }
  });
});
