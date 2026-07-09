import test from "node:test";
import assert from "node:assert/strict";

import { PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION, buildProductContextHash } from "../src/compare/product-signal-analysis.ts";
import {
  buildProductSignalWorkspaceViewModel,
  type ProductSignalAction,
  type ProductSignalWorkspaceViewModel
} from "../src/viewmodel/product-signal.ts";
import type {
  ExtensionSnapshot,
  ProductContext,
  ProductProfile,
  ProductSignalAnalysis,
  SessionItem,
  SessionRecord,
  Signal
} from "../src/state/types.ts";
import { createDefaultSettings, createEmptyTabState } from "../src/state/types.ts";

const profile: ProductProfile = {
  name: "DLens",
  category: "Chrome extension",
  audience: "Product builders",
  contextText: "DLens captures Threads posts and turns them into product evidence.",
  contextFiles: [{ id: "agents", name: "AGENTS.md", kind: "agents", importedAt: "2026-06-11T00:00:00.000Z", charCount: 1200 }]
};

const productContext: ProductContext = {
  productPromise: "Capture product evidence",
  targetAudience: "Product builders",
  agentRoles: ["research assistant"],
  coreWorkflows: ["collect", "analyze"],
  currentCapabilities: ["Product signals"],
  explicitConstraints: ["local-first"],
  nonGoals: ["CRM"],
  preferredTechDirection: "Chrome MV3",
  evaluationCriteria: ["evidence grounded"],
  unknowns: [],
  compiledAt: "2026-06-11T01:00:00.000Z",
  sourceFileIds: ["agents"],
  promptVersion: "v1"
};

function makeItem(overrides: Partial<SessionItem> = {}): SessionItem {
  return {
    id: "item-ready",
    descriptor: {
      page_url: "https://www.threads.net/@dlens/post/ready",
      post_url: "https://www.threads.net/@dlens/post/ready",
      text_snippet: "Descriptor fallback text",
      author_hint: "dlens",
      engagement: { likes: 9, comments: 2, reposts: null, forwards: null, views: null }
    } as SessionItem["descriptor"],
    status: "succeeded",
    selectedAt: "2026-06-11T00:00:00.000Z",
    savedAt: "2026-06-11T00:00:00.000Z",
    queuedAt: null,
    completedAt: "2026-06-11T00:10:00.000Z",
    captureId: "cap-ready",
    jobId: "job-ready",
    canonicalTargetUrl: "https://www.threads.net/@dlens/post/ready",
    latestJob: null,
    latestCapture: {
      source_post_url: "https://www.threads.net/@dlens/post/ready",
      ingestion_status: "succeeded",
      result: {
        threadReadModel: {
          rootPost: { postId: "root", author: "dlens", text: "Captured OP text", likeCount: 12 },
          opContinuations: [],
          discussionReplies: [
            { commentId: "reply-1", author: "builder", text: "This workflow would help my launch notes.", likeCount: 7 }
          ],
          assembledContent: "Captured OP text\n\nThis workflow would help my launch notes."
        }
      }
    } as SessionItem["latestCapture"],
    commentsPreview: [],
    lastStatusAt: "2026-06-11T00:10:00.000Z",
    lastErrorKind: null,
    lastError: null,
    ...overrides
  };
}

function makeSession(items: SessionItem[] = [makeItem()]): SessionRecord {
  return {
    id: "session-product",
    name: "Product inbox",
    mode: "product",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:20:00.000Z",
    items
  };
}

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig-ready",
    sessionId: "session-product",
    itemId: "item-ready",
    source: "threads",
    inboxStatus: "unprocessed",
    capturedAt: "2026-06-11T00:00:00.000Z",
    ...overrides
  };
}

function makeAnalysis(overrides: Partial<ProductSignalAnalysis> = {}): ProductSignalAnalysis {
  return {
    signalId: "sig-ready",
    signalType: "demand",
    signalSubtype: "launch_notes",
    contentType: "content",
    contentSummary: "Launch-note workflow demand",
    relevance: 4,
    relevantTo: ["coreWorkflows"],
    referenceType: "workflow_pattern",
    referenceLabel: "Launch workflow",
    referenceTakeaway: "Users want structured launch notes.",
    whyRelevant: "這條留言直接描述可重用工作流。",
    verdict: "try",
    reason: "有明確 workflow 需求。",
    experimentHint: "Prototype launch-note packet.",
    evidenceRefs: ["e1"],
    evidenceNotes: [{ ref: "e1", quoteSummary: "workflow would help", whyItMatters: "具體需求" }],
    productContextHash: buildProductContextHash(productContext),
    promptVersion: PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
    model: "google:gemini",
    analyzedAt: "2026-06-11T01:05:00.000Z",
    status: "complete",
    ...overrides
  };
}

function makeSnapshot(session: SessionRecord = makeSession()): ExtensionSnapshot {
  return {
    global: {
      settings: {
        ...createDefaultSettings(),
        productProfile: profile,
        googleApiKey: "key"
      },
      sessions: [session],
      activeSessionId: session.id,
      updatedAt: "2026-06-11T01:10:00.000Z"
    },
    tab: createEmptyTabState()
  };
}

function actionKinds(vm: ProductSignalWorkspaceViewModel, signalId: string): ProductSignalAction["kind"][] {
  return vm.signals.find((signal) => signal.signalId === signalId)?.actions.map((action) => action.kind) ?? [];
}

test("Product VM composes capture preview, readiness, analysis state, provenance, and explicit actions", () => {
  const savedItem = makeItem({
    id: "item-saved",
    status: "saved",
    latestCapture: null,
    descriptor: {
      page_url: "https://www.threads.net/@dlens/post/saved",
      post_url: "https://www.threads.net/@dlens/post/saved",
      text_snippet: "Saved descriptor text",
      author_hint: "dlens",
      engagement: { likes: null, comments: null, reposts: null, forwards: null, views: null }
    } as SessionItem["descriptor"]
  });
  const session = makeSession([makeItem(), savedItem]);

  const vm = buildProductSignalWorkspaceViewModel({
    kind: "saved-signals",
    snapshot: makeSnapshot(session),
    signals: [
      makeSignal(),
      makeSignal({ id: "sig-saved", itemId: "item-saved" })
    ],
    analyses: [makeAnalysis()],
    signalReadings: [
      {
        signalId: "sig-ready",
        cacheKey: "reading-key",
        reading: "A grounded reading",
        sourcePacketHash: "source",
        productContextHash: buildProductContextHash(productContext),
        promptVersion: "v1",
        model: "google:gemini",
        generatedAt: "2026-06-11T01:06:00.000Z",
        sourcePacket: { postUrl: "https://www.threads.net/@dlens/post/ready", assembledContent: "Captured OP text", representativeComments: [] },
        reviewState: "pending",
        feedbackEvents: []
      }
    ],
    productContext,
    aiProviderReady: true,
    isHydrating: false,
    isAnalyzing: false
  });

  assert.equal(vm.sessionId, "session-product");
  assert.equal(vm.loadState, "ready");
  assert.equal(vm.canAnalyze, true);
  assert.equal(vm.scopedAnalyses.length, 1);
  assert.equal(vm.pendingSignals.map((signal) => signal.signalId).join(","), "sig-saved");
  assert.equal(vm.scopedSignalReadings.length, 1);

  const ready = vm.signals.find((signal) => signal.signalId === "sig-ready");
  assert.ok(ready);
  assert.equal(Object.hasOwn(ready, "signal"), false);
  assert.equal(ready.title, "Captured OP text");
  assert.equal(ready.sourcePreview.text, "Captured OP text");
  assert.equal(ready.sourcePreview.sourceUrl, "https://www.threads.net/@dlens/post/ready");
  assert.equal(ready.readiness.status, "ready");
  assert.equal(ready.analysisState, "ready");
  assert.equal(ready.provenance, "ai");
  assert.deepEqual(actionKinds(vm, "sig-ready"), ["analyze", "generateReading", "remove"]);

  const saved = vm.signals.find((signal) => signal.signalId === "sig-saved");
  assert.ok(saved);
  assert.equal(saved.title, "Saved descriptor text");
  assert.equal(saved.readiness.status, "saved");
  assert.equal(saved.analysisState, "missing");
  assert.equal(saved.provenance, "missing");
  assert.deepEqual(actionKinds(vm, "sig-saved"), ["analyze", "recrawl", "remove"]);

  for (const signal of vm.signals) {
    for (const action of signal.actions) {
      assert.equal(action.target.sessionId, "session-product");
      assert.equal(action.target.signalId, signal.signalId);
    }
  }
});

test("Product VM allows analysis when ProductContext is ready even if profile metadata is incomplete", () => {
  const contextOnlyProfile: ProductProfile = {
    name: "",
    category: "",
    audience: "",
    contextText: profile.contextText,
    contextFiles: profile.contextFiles
  };
  const snapshot = makeSnapshot();
  snapshot.global.settings.productProfile = contextOnlyProfile;

  const vm = buildProductSignalWorkspaceViewModel({
    kind: "saved-signals",
    snapshot,
    signals: [makeSignal()],
    analyses: [],
    productContext,
    aiProviderReady: true,
    isHydrating: false,
    isAnalyzing: false
  });

  assert.equal(vm.canAnalyze, true);
  assert.doesNotMatch(vm.readinessCopy, /補產品名稱、類別和受眾/);
  assert.equal(vm.readinessCopy, "已有 ready signal。按下分析收件匣後，這裡才會顯示真實 AI 結果。");
});

test("Product VM preserves recovered analyses when the signal inbox is empty", () => {
  const vm = buildProductSignalWorkspaceViewModel({
    kind: "actionable-filter",
    snapshot: makeSnapshot(makeSession([])),
    signals: [],
    analyses: [makeAnalysis()],
    productContext,
    aiProviderReady: true,
    isHydrating: false,
    isAnalyzing: false
  });

  assert.equal(vm.loadState, "recovering");
  assert.equal(vm.scopedAnalyses.length, 1);
  assert.equal(vm.signals.length, 0);
  assert.equal(vm.pendingSignals.length, 0);
});

test("Product VM marks complete analyses stale only when current ProductContext or generator version drifts", () => {
  const staleContext: ProductContext = {
    ...productContext,
    productPromise: "Capture evidence and generate release briefs",
    compiledAt: "2026-06-11T02:00:00.000Z"
  };
  const vm = buildProductSignalWorkspaceViewModel({
    kind: "classification",
    snapshot: makeSnapshot(),
    signals: [makeSignal()],
    analyses: [makeAnalysis()],
    productContext: staleContext,
    aiProviderReady: true,
    isHydrating: false,
    isAnalyzing: false
  });

  assert.equal(vm.signals[0]?.analysisState, "stale");
  assert.equal(vm.scopedAnalyses[0]?.signalId, "sig-ready");
});
