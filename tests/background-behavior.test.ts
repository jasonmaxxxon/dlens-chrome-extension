import assert from "node:assert/strict";
import test from "node:test";

import background, { backgroundTestables } from "../entrypoints/background.ts";
import { PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY } from "../src/compare/product-agent-task-feedback.ts";
import { FOLDER_SYNTHESIS_VERSION } from "../src/compare/folder-synthesis.ts";
import { FOLDER_SYNTHESIS_STORAGE_KEY } from "../src/compare/folder-synthesis-storage.ts";
import { PRODUCT_CONTEXT_STORAGE_KEY } from "../src/compare/product-context.ts";
import { SAVED_ANALYSES_STORAGE_KEY } from "../src/compare/saved-analysis-storage.ts";
import { PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY } from "../src/compare/product-signal-storage.ts";
import { SIGNAL_READINGS_STORAGE_KEY } from "../src/compare/signal-reading-storage.ts";
import type { CaptureSnapshot, JobSnapshot } from "../src/contracts/ingest.ts";
import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages.ts";
import { readPipelineTrace } from "../src/state/pipeline-trace.ts";
import { PR_CAMPAIGNS_STORAGE_KEY, PR_EVIDENCE_ROWS_STORAGE_KEY, type PrCampaign, type PrEvidenceRow } from "../src/state/pr-evidence-storage.ts";
import { createSessionItem } from "../src/state/store-helpers.ts";
import { SIGNALS_STORAGE_KEY, TOPICS_STORAGE_KEY } from "../src/state/topic-storage.ts";
import { createEmptyGlobalState, createEmptyTabState, type ExtensionGlobalState, type FolderMode, type FolderSynthesis, type ProductContext, type SavedAnalysisSnapshot, type Signal, type SessionItem, type SessionRecord, type TabUiState, type Topic } from "../src/state/types.ts";

type StorageState = Record<string, unknown>;

const TAB_ID = 1;
const OTHER_TAB_ID = 2;
let restorePipelineTraceDebug: (() => void) | null = null;

function makeSession(id: string, mode: FolderMode): SessionRecord {
  return {
    id,
    name: `${mode} workspace`,
    mode,
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    items: []
  };
}

function makePrCriteria(): PrCampaign["criteria"] {
  return [
    { id: "c1", label: "brand" },
    { id: "c2", label: "event" },
    { id: "c3", label: "offer" },
    { id: "c4", label: "engagement" },
    { id: "c5", label: "sentiment" },
    { id: "c6", label: "fit" }
  ];
}

function makePrCampaign(id: string, sessionId: string): PrCampaign {
  return {
    id,
    sessionId,
    name: `${id} campaign`,
    briefText: "campaign brief",
    criteria: makePrCriteria(),
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z"
  };
}

function makePrEvidenceRow(campaignId: string, itemId: string, postSlug: string): PrEvidenceRow {
  return {
    id: `row-${itemId}`,
    campaignId,
    itemId,
    postUrl: `https://www.threads.net/@dlens/post/${postSlug}`,
    authorHandle: "dlens",
    caption: `caption ${postSlug}`,
    metrics: {},
    expectedEngagement: "",
    criteriaMatches: {
      c1: false,
      c2: false,
      c3: false,
      c4: false,
      c5: false,
      c6: false
    },
    collectedAt: "2026-05-27T00:00:00.000Z"
  };
}

function makeGoogleJsonResponse(payload: unknown): Response {
  return jsonResponse({
    candidates: [{
      content: {
        parts: [{ text: JSON.stringify(payload) }]
      }
    }]
  });
}

function makeProductSignalAnalysisPayload(label: string) {
  return {
    signal_type: "demand",
    signal_subtype: `demand-${label}`,
    content_type: "mixed",
    content_summary: `summary ${label}`,
    relevance: 4,
    relevant_to: ["workflowPattern"],
    reference_type: "workflow_pattern",
    reference_label: `pattern ${label}`,
    reference_takeaway: `takeaway ${label}`,
    why_relevant: `why ${label}`,
    verdict: "watch",
    reason: `reason ${label}`,
    evidence_refs: ["e1"]
  };
}

function makeGlobal(sessions: SessionRecord[], activeSessionId: string | null): ExtensionGlobalState {
  return {
    ...createEmptyGlobalState(),
    sessions,
    activeSessionId
  };
}

function makeProductContext(): ProductContext {
  return {
    productPromise: "Help teams read Threads evidence.",
    targetAudience: "Technical product teams",
    agentRoles: ["researcher"],
    coreWorkflows: ["capture", "analyze"],
    currentCapabilities: ["local extension"],
    explicitConstraints: ["no SaaS dependency"],
    nonGoals: ["viral content farm"],
    preferredTechDirection: "TypeScript",
    evaluationCriteria: ["grounded evidence"],
    unknowns: [],
    compiledAt: "2026-05-27T00:00:00.000Z",
    sourceFileIds: [],
    promptVersion: "v1"
  };
}

function makeSavedAnalysis(resultId: string, itemAId: string, itemBId: string): SavedAnalysisSnapshot {
  return {
    resultId,
    compareKey: `${itemAId}::${itemBId}`,
    itemAId,
    itemBId,
    sourceLabelA: "@a",
    sourceLabelB: "@b",
    headline: `Headline ${resultId}`,
    deck: "Saved compare deck.",
    primaryTensionSummary: "Saved compare summary.",
    groupSummary: "1 group",
    totalComments: 12,
    dateRangeLabel: "today",
    savedAt: "2026-05-27T00:00:00.000Z",
    analysisVersion: "v1",
    briefVersion: "v8",
    briefSource: "ai",
    judgmentResult: null,
    judgmentVersion: null,
    judgmentSource: "missing"
  };
}

function makeDescriptor(id: string) {
  return {
    target_type: "post" as const,
    page_url: `https://www.threads.net/@dlens/post/${id}`,
    post_url: `https://www.threads.net/@dlens/post/${id}`,
    author_hint: "dlens",
    text_snippet: `signal ${id}`,
    time_token_hint: "1h",
    dom_anchor: id,
    engagement: { likes: 1 },
    engagement_present: { likes: true },
    captured_at: "2026-05-27T00:00:00.000Z"
  };
}

function makeReadyCapture(id: string, keyword = "prompt caching"): CaptureSnapshot {
  return {
    ...makeCapture(id),
    result: {
      id: `result-${id}`,
      job_id: `job-${id}`,
      capture_id: `cap-${id}`,
      source_type: "threads",
      canonical_target_url: `https://www.threads.net/@dlens/post/${id}`,
      canonical_post: {},
      comments: [],
      thread_read_model: {
        assembled_content: `OP signal ${id}\nAudience asks about ${keyword}.`,
        root_post: {
          post_id: `root-${id}`,
          author: "dlens",
          text: `OP signal ${id}`
        },
        op_continuations: [],
        discussion_replies: [{
          comment_id: `comment-${id}`,
          author: "reader",
          text: `Audience asks about ${keyword}.`,
          like_count: 3
        }]
      },
      crawl_meta: {},
      raw_payload: {},
      fetched_at: "2026-05-27T00:00:03.000Z",
      created_at: "2026-05-27T00:00:03.000Z"
    },
    analysis: {
      ...(makeCapture(id).analysis!),
      clusters: [{
        cluster_key: 1,
        like_share: 0.7,
        keywords: [keyword],
        size_share: 0.6
      }]
    }
  };
}

function makeSucceededItem(id: string, keyword = "prompt caching"): SessionItem {
  return {
    ...createSessionItem(makeDescriptor(id), "2026-05-27T00:00:00.000Z"),
    id: `item-${id}`,
    status: "succeeded",
    jobId: `job-${id}`,
    captureId: `cap-${id}`,
    latestJob: makeJob(id),
    latestCapture: makeReadyCapture(id, keyword)
  };
}

function makeRefreshableItem(id: string): SessionItem {
  return {
    ...createSessionItem(makeDescriptor(id), "2026-05-27T00:00:00.000Z"),
    id: `item-${id}`,
    status: "queued",
    jobId: `job-${id}`,
    captureId: `cap-${id}`,
    latestJob: null,
    latestCapture: null
  };
}

function makeSignal(id: string, sessionId: string, itemId: string, topicId?: string): Signal {
  return {
    id,
    sessionId,
    itemId,
    source: "threads",
    inboxStatus: topicId ? "assigned" : "unprocessed",
    ...(topicId ? { topicId } : {}),
    capturedAt: "2026-05-27T00:00:00.000Z",
    ...(topicId ? { triagedAt: "2026-05-27T00:00:01.000Z" } : {})
  };
}

function makeTopic(id: string, sessionId: string, signalIds: string[]): Topic {
  return {
    id,
    sessionId,
    name: id,
    description: "",
    status: "pending",
    tags: [],
    signalIds,
    pairIds: [],
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    context: null,
    synthesis: null
  };
}

function makeFolderSynthesisRecord(sessionId: string, generatedAt = "2026-05-27T00:00:00.000Z"): FolderSynthesis {
  return {
    sessionId,
    observations: [{ text: `summary for ${sessionId}`, evidenceSignalIds: [] }],
    commonClusters: [{
      keyword: "prompt caching",
      signalCount: 3,
      topicCount: 2,
      topicIds: ["topic-a", "topic-b"]
    }],
    memes: [],
    verbalTechniques: [],
    sentimentNarrative: "",
    topicCoverage: [],
    generatedFromCount: 3,
    totalSignalCount: 3,
    contributingTopicCount: 2,
    generatedAt,
    generator: "deterministic",
    generatorVersion: FOLDER_SYNTHESIS_VERSION
  };
}

function makeFolderSynthesisScenario(sessionId: string, prefix: string): {
  session: SessionRecord;
  signals: Signal[];
  topics: Topic[];
} {
  const items = [
    makeSucceededItem(`${prefix}-1`, "prompt caching"),
    makeSucceededItem(`${prefix}-2`, "prompt caching"),
    makeSucceededItem(`${prefix}-3`, "prompt caching")
  ];
  const session = {
    ...makeSession(sessionId, "topic"),
    items
  };
  const signals = [
    makeSignal(`${prefix}-signal-1`, sessionId, items[0]!.id, `${prefix}-topic-a`),
    makeSignal(`${prefix}-signal-2`, sessionId, items[1]!.id, `${prefix}-topic-a`),
    makeSignal(`${prefix}-signal-3`, sessionId, items[2]!.id, `${prefix}-topic-b`)
  ];
  const topics = [
    makeTopic(`${prefix}-topic-a`, sessionId, [signals[0]!.id, signals[1]!.id]),
    makeTopic(`${prefix}-topic-b`, sessionId, [signals[2]!.id])
  ];
  return { session, signals, topics };
}

function makeJob(id: string): JobSnapshot {
  return {
    id: `job-${id}`,
    capture_id: `cap-${id}`,
    job_type: "threads_post_comments_crawl",
    status: "succeeded",
    priority: 0,
    attempt_count: 1,
    max_attempts: 3,
    scheduled_at: "2026-05-27T00:00:00.000Z",
    claimed_at: null,
    started_at: null,
    finished_at: "2026-05-27T00:00:02.000Z",
    lease_expires_at: null,
    worker_token: null,
    last_error_kind: null,
    last_error: null,
    last_error_at: null,
    created_at: "2026-05-27T00:00:00.000Z",
    updated_at: "2026-05-27T00:00:02.000Z"
  };
}

function makeCapture(id: string): CaptureSnapshot {
  return {
    id: `cap-${id}`,
    source_type: "threads",
    capture_type: "post",
    source_page_url: `https://www.threads.net/@dlens/post/${id}`,
    source_post_url: `https://www.threads.net/@dlens/post/${id}`,
    canonical_target_url: `https://www.threads.net/@dlens/post/${id}`,
    author_hint: "dlens",
    text_snippet: `signal ${id}`,
    time_token_hint: "1h",
    dom_anchor: id,
    engagement: {},
    client_context: {},
    raw_payload: {},
    ingestion_status: "succeeded",
    captured_at: "2026-05-27T00:00:00.000Z",
    created_at: "2026-05-27T00:00:00.000Z",
    updated_at: "2026-05-27T00:00:02.000Z",
    job: makeJob(id),
    result: null,
    analysis: {
      id: `analysis-${id}`,
      capture_id: `cap-${id}`,
      status: "succeeded",
      stage: "final",
      analysis_version: "v1",
      source_comment_count: 0,
      clusters: [],
      evidence: [],
      metrics: {},
      generated_at: "2026-05-27T00:00:03.000Z",
      last_error: null,
      created_at: "2026-05-27T00:00:03.000Z",
      updated_at: "2026-05-27T00:00:03.000Z"
    }
  };
}

function makeCaptureTargetResponse(id: string) {
  return {
    capture_id: `cap-${id}`,
    job_id: `job-${id}`,
    status: "queued" as const,
    job_type: "threads_post_comments_crawl" as const,
    canonical_target_url: `https://www.threads.net/@dlens/post/${id}`
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  } as Response;
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 1000) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function enablePipelineTraceForTest(): void {
  (globalThis as any).__DLENS_QA_TRACE_ENABLED__ = true;
  (globalThis as any).__DLENS_QA_TRACE__ = [];
  (globalThis as any).__DLENS_QA_TRACE_SEQ__ = 0;
  const originalDebug = console.debug;
  console.debug = () => undefined;
  restorePipelineTraceDebug = () => {
    console.debug = originalDebug;
  };
}

function disablePipelineTraceForTest(): void {
  delete (globalThis as any).__DLENS_QA_TRACE_ENABLED__;
  delete (globalThis as any).__DLENS_QA_TRACE__;
  delete (globalThis as any).__DLENS_QA_TRACE_SEQ__;
  restorePipelineTraceDebug?.();
  restorePipelineTraceDebug = null;
}

test("background trace mirror can recover from sender URLs after worker wake", () => {
  assert.equal(backgroundTestables.readSenderTraceFlag({
    tab: { id: TAB_ID, url: "https://www.threads.com/?dlensQaTrace=1" } as chrome.tabs.Tab
  }), true);
  assert.equal(backgroundTestables.readSenderTraceFlag({
    url: "https://www.threads.com/#dlensQaTrace=yes"
  }), true);
  assert.equal(backgroundTestables.readSenderTraceFlag({
    tab: { id: TAB_ID, url: "https://www.threads.com/" } as chrome.tabs.Tab
  }), false);
});

function readStorageKeys(keys: string | string[] | Record<string, unknown> | null | undefined, state: StorageState): StorageState {
  if (keys == null) {
    return structuredClone(state);
  }
  if (typeof keys === "string") {
    return { [keys]: structuredClone(state[keys]) };
  }
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, structuredClone(state[key])]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [key, structuredClone(state[key] ?? fallback)])
  );
}

function storageKeysInclude(keys: string | string[] | Record<string, unknown> | null | undefined, key: string): boolean {
  if (keys == null) {
    return true;
  }
  if (typeof keys === "string") {
    return keys === key;
  }
  if (Array.isArray(keys)) {
    return keys.includes(key);
  }
  return Object.prototype.hasOwnProperty.call(keys, key);
}

async function createHarness(
  initialState: StorageState,
  options: {
    activeTabId?: number;
    blockStateUpdatedBroadcast?: boolean;
    onGet?: (keys: string | string[] | Record<string, unknown> | null | undefined) => Promise<void> | void;
    senderTabId?: number;
  } = {}
): Promise<{
  dispatch: (message: ExtensionMessage) => Promise<ExtensionResponse>;
  state: StorageState;
  tabKey: string;
  tabMessages: ExtensionMessage[];
  tabMessageTargets: Array<{ tabId: number; message: ExtensionMessage }>;
  writes: string[][];
  writesFor: (key: string) => string[][];
}> {
  const state = structuredClone(initialState);
  const writes: string[][] = [];
  const tabMessages: ExtensionMessage[] = [];
  const tabMessageTargets: Array<{ tabId: number; message: ExtensionMessage }> = [];
  const sidePanelBehaviorCalls: Array<{ openPanelOnActionClick?: boolean }> = [];
  const sidePanelOpenCalls: Array<{ tabId?: number; windowId?: number }> = [];
  let listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] | null = null;
  let actionClickListener: ((tab: chrome.tabs.Tab) => void) | null = null;
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const activeTabId = options.activeTabId ?? TAB_ID;
  const senderTabId = options.senderTabId ?? TAB_ID;

  const storageArea = {
    QUOTA_BYTES: 10 * 1024 * 1024,
    get: async (keys?: string | string[] | Record<string, unknown> | null) => {
      await options.onGet?.(keys);
      return readStorageKeys(keys, state);
    },
    getBytesInUse: async () => 0,
    remove: async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete state[key];
      }
    },
    set: async (payload: Record<string, unknown>) => {
      writes.push(Object.keys(payload));
      Object.assign(state, structuredClone(payload));
    }
  };

  (globalThis as unknown as { chrome: typeof chrome }).chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://dlens/${path}`,
      onConnect: { addListener: () => undefined },
      onInstalled: { addListener: () => undefined },
      onMessage: {
        addListener: (callback: Parameters<typeof chrome.runtime.onMessage.addListener>[0]) => {
          listener = callback;
        }
      }
    },
    action: {
      onClicked: {
        addListener: (callback: (tab: chrome.tabs.Tab) => void) => {
          actionClickListener = callback;
        }
      }
    },
    sidePanel: {
      open: async (options: { tabId?: number; windowId?: number }) => {
        sidePanelOpenCalls.push({ ...options });
      },
      setPanelBehavior: async (options: { openPanelOnActionClick?: boolean }) => {
        sidePanelBehaviorCalls.push({ ...options });
      }
    },
    storage: {
      local: storageArea
    },
    tabs: {
      create: async () => ({ id: TAB_ID }) as chrome.tabs.Tab,
      get: async () => ({ id: activeTabId }) as chrome.tabs.Tab,
      onRemoved: { addListener: () => undefined },
      query: async () => [{ id: activeTabId }] as chrome.tabs.Tab[],
      sendMessage: async (tabId: number, message: ExtensionMessage) => {
        tabMessages.push(message);
        tabMessageTargets.push({ tabId, message });
        if (options.blockStateUpdatedBroadcast && message.type === "state/updated") {
          await new Promise(() => undefined);
        }
      }
    }
  } as typeof chrome;

  backgroundTestables.resetBackgroundTestState();
  background.main();
  await Promise.resolve();
  await Promise.resolve();
  writes.length = 0;

  assert.notEqual(listener, null, "background runtime listener must be registered");

  return {
    dispatch: (message: ExtensionMessage) => new Promise((resolve, reject) => {
      const originalInfo = console.info;
      console.info = () => undefined;
      const timeout = setTimeout(() => {
        console.info = originalInfo;
        reject(new Error(`No response for ${message.type}`));
      }, 1000);
      listener?.(message, { tab: { id: senderTabId } } as chrome.runtime.MessageSender, (response: ExtensionResponse) => {
        clearTimeout(timeout);
        console.info = originalInfo;
        resolve(response);
      });
    }),
    state,
    tabKey,
    tabMessages,
    tabMessageTargets,
    sidePanelBehaviorCalls,
    sidePanelOpenCalls,
    clickAction: async (tab: chrome.tabs.Tab = { id: TAB_ID, windowId: 10 } as chrome.tabs.Tab) => {
      assert.notEqual(actionClickListener, null, "background action click listener must be registered");
      actionClickListener?.(tab);
      await Promise.resolve();
      await Promise.resolve();
    },
    writes,
    writesFor: (key: string) => writes.filter((keys) => keys.includes(key))
  };
}

type BackgroundHarness = Awaited<ReturnType<typeof createHarness>>;

function assertStateUpdatedBroadcastOnce(harness: BackgroundHarness, tabId = TAB_ID): void {
  const broadcasts = harness.tabMessageTargets.filter(({ message }) => message.type === "state/updated");
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0]?.tabId, tabId);
  assert.equal(broadcasts[0]?.message.type, "state/updated");
  assert.equal(broadcasts[0]?.message.tabId, tabId);
  assert.ok(broadcasts[0]?.message.snapshot);
}

test("background wires extension action click to open the side panel on worker startup", async () => {
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([makeSession("topic-session", "topic")], "topic-session"),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: "topic-session",
    [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState()
  });

  assert.deepEqual(harness.sidePanelBehaviorCalls, [{ openPanelOnActionClick: true }]);

  await harness.clickAction({ id: TAB_ID, windowId: 10 } as chrome.tabs.Tab);

  assert.deepEqual(harness.sidePanelOpenCalls, [{ tabId: TAB_ID }]);
});

test("session/set-mode existing target mode writes only active-session and tab keys", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({ type: "session/set-mode", sessionId: product.id, mode: "product" });

  assert.equal(response.ok, true);
  assert.equal(response.setModePath, "fast");
  assert.deepEqual(harness.writes.map((keys) => keys.toSorted()), [[
    backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY,
    harness.tabKey
  ].toSorted()]);
  assert.equal(harness.state[backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY], product.id);
});

test("session/set-mode honors the requested session when several sessions share a mode", async () => {
  const topic = makeSession("topic-session", "topic");
  const olderProduct = {
    ...makeSession("older-product-session", "product"),
    items: [{ ...createSessionItem(makeDescriptor("old-1")), id: "old-item" }]
  };
  const targetProduct = {
    ...makeSession("target-product-session", "product"),
    items: [
      { ...createSessionItem(makeDescriptor("target-1")), id: "target-item-1" },
      { ...createSessionItem(makeDescriptor("target-2")), id: "target-item-2" }
    ]
  };
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, olderProduct, targetProduct], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({ type: "session/set-mode", sessionId: targetProduct.id, mode: "product" });

  assert.equal(response.ok, true);
  assert.equal(response.snapshot?.global.activeSessionId, targetProduct.id);
  assert.equal(response.snapshot?.global.sessions.find((session) => session.id === targetProduct.id)?.items.length, 2);
  assert.equal(harness.state[backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY], targetProduct.id);
});

test("state/get-active-tab normalizes a null active session when sessions still exist", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], null),
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({ type: "state/get-active-tab" });

  assert.equal(response.ok, true);
  assert.equal(response.snapshot?.global.activeSessionId, topic.id);
  assert.deepEqual(harness.writes, []);
});

test("selection toggle writes only the tab key and starts content selection with the active mode", async () => {
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([product], product.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: product.id,
    [tabKey]: createEmptyTabState()
  });

  const startResponse = await harness.dispatch({ type: "selection/start-active-tab" });

  assert.equal(startResponse.ok, true);
  assert.equal(startResponse.snapshot?.tab.selectionMode, true);
  assert.deepEqual(
    harness.tabMessageTargets
      .filter(({ message }) => message.type === "selection/start-tab")
      .map(({ tabId, message }) => ({ tabId, mode: (message as { mode?: string }).mode })),
    [{ tabId: TAB_ID, mode: "product" }]
  );
  // The toggle only changes tab UI state — the heavy global blob must not be rewritten.
  assert.deepEqual(harness.writes, [[tabKey]]);

  harness.writes.length = 0;
  const cancelResponse = await harness.dispatch({ type: "selection/cancel-active-tab" });

  assert.equal(cancelResponse.ok, true);
  assert.equal(cancelResponse.snapshot?.tab.selectionMode, false);
  assert.deepEqual(harness.writes, [[tabKey]]);
});

test("topic↔product switching across worker restarts keeps the product session aligned", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = {
    ...makeSession("product-session", "product"),
    items: [
      {
        ...createSessionItem(makeDescriptor("post-1"), "2026-05-27T00:00:00.000Z"),
        id: "item-1"
      }
    ]
  };
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);

  let harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], product.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: product.id,
    [tabKey]: createEmptyTabState()
  });
  await harness.dispatch({ type: "session/set-mode", sessionId: topic.id, mode: "topic" });
  assert.equal(harness.state[backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY], topic.id);

  // MV3 worker teardown: fresh worker, caches empty, same persisted storage.
  harness = await createHarness(harness.state);
  await harness.dispatch({ type: "session/set-mode", sessionId: product.id, mode: "product" });
  assert.equal(harness.state[backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY], product.id);

  harness = await createHarness(harness.state);
  const response = await harness.dispatch({ type: "state/get-active-tab" });

  assert.equal(response.ok, true);
  assert.equal(response.snapshot?.global.activeSessionId, product.id);
  const activeSession = response.snapshot?.global.sessions.find(
    (session) => session.id === response.snapshot?.global.activeSessionId
  );
  assert.equal(activeSession?.mode, "product");
  assert.equal(activeSession?.items.length, 1);
  assert.equal(response.snapshot?.global.sessions.length, 2);
});

test("snapshot writers never persist a null active-session pointer while sessions exist", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], product.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: product.id,
    [tabKey]: createEmptyTabState()
  });

  await backgroundTestables.mutateSnapshot(TAB_ID, (current) => ({
    snapshot: {
      global: { ...current.global, activeSessionId: null },
      tab: current.tab
    },
    saveOptions: { persistActiveSessionId: true }
  }));

  assert.equal(harness.state[backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY], product.id);
  const storedGlobal = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  assert.equal(storedGlobal.activeSessionId, product.id);
});

test("signal/list repairs missing product signal rows from existing session items", async () => {
  const product = {
    ...makeSession("product-session", "product"),
    items: [
      {
        ...createSessionItem(makeDescriptor("post-1"), "2026-05-27T00:00:00.000Z"),
        id: "item-1"
      },
      {
        ...createSessionItem(makeDescriptor("post-2"), "2026-05-27T00:00:00.000Z"),
        id: "item-2"
      }
    ]
  };
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([product], product.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: product.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({ type: "signal/list", sessionId: product.id });

  assert.equal(response.ok, true);
  assert.equal(response.signals?.length, 2);
  assert.deepEqual(response.signals?.map((signal) => signal.itemId).sort(), ["item-1", "item-2"]);
  assert.equal((harness.state[SIGNALS_STORAGE_KEY] as unknown[]).length, 2);
});

test("session/save-current-preview writes to the explicit target session instead of the active cursor", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const descriptor = makeDescriptor("explicit-target");
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({
    type: "session/save-current-preview",
    target: {
      sessionId: product.id,
      topicId: null
    },
    descriptor
  } as unknown as ExtensionMessage);

  const global = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  assert.equal(response.ok, true);
  assert.equal(global.sessions.find((session) => session.id === topic.id)?.items.length, 0);
  assert.equal(global.sessions.find((session) => session.id === product.id)?.items.length, 1);
  assert.equal(global.activeSessionId, product.id);
  assert.equal(harness.state[backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY], product.id);
});

test("session/save-current-preview emits signal.saved background boundary events with requestId", async () => {
  enablePipelineTraceForTest();
  try {
    const product = makeSession("product-session", "product");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([product], product.id),
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: product.id,
      [tabKey]: createEmptyTabState()
    });

    const response = await harness.dispatch({
      type: "session/save-current-preview",
      requestId: "save-req-1",
      target: {
        sessionId: product.id,
        topicId: null
      },
      descriptor: makeDescriptor("traced-save")
    } as ExtensionMessage);

    assert.equal(response.ok, true);
    const events = readPipelineTrace().filter((event) => event.step.startsWith("background.session.save-current-preview."));
    assert.deepEqual(events.map((event) => [event.phase, event.step, event.result]), [
      ["signal.saved", "background.session.save-current-preview.request", "pending"],
      ["signal.saved", "background.session.save-current-preview.response", "ok"]
    ]);
    assert.deepEqual(events.map((event) => event.requestId), ["save-req-1", "save-req-1"]);
    assert.deepEqual(events.map((event) => event.target), [
      { sessionId: product.id, tabId: TAB_ID },
      { sessionId: product.id, tabId: TAB_ID }
    ]);
  } finally {
    disablePipelineTraceForTest();
  }
});

test("session/save-current-preview rejects messages without an explicit target", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({
    type: "session/save-current-preview",
    descriptor: makeDescriptor("missing-target")
  } as unknown as ExtensionMessage);

  const global = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  assert.equal(response.ok, false);
  assert.match(response.ok ? "" : response.error, /Explicit save target is required/);
  assert.equal(global.sessions.find((session) => session.id === topic.id)?.items.length, 0);
});

test("session/queue-selected rejects messages without an explicit item target", async () => {
  const topic = {
    ...makeSession("topic-session", "topic"),
    items: [{ ...createSessionItem(makeDescriptor("active-item")), id: "active-item" }]
  };
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: {
      ...createEmptyTabState(),
      activeItemId: "active-item"
    }
  });

  const response = await harness.dispatch({ type: "session/queue-selected" } as unknown as ExtensionMessage);

  assert.equal(response.ok, false);
  assert.match(response.ok ? "" : response.error, /Explicit item target is required/);
});

test("session/queue-selected uses the explicit item target instead of the active cursor", async () => {
  const topic = {
    ...makeSession("topic-session", "topic"),
    items: [{ ...createSessionItem(makeDescriptor("active-item")), id: "active-item" }]
  };
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: {
      ...createEmptyTabState(),
      activeItemId: "active-item"
    }
  });

  const response = await harness.dispatch({
    type: "session/queue-selected",
    target: {
      sessionId: product.id,
      itemId: "missing-product-item"
    }
  } as unknown as ExtensionMessage);

  assert.equal(response.ok, false);
  assert.match(response.ok ? "" : response.error, /Saved post not found/);
});

test("session/refresh-selected uses the explicit item target instead of the active cursor", async () => {
  const topic = {
    ...makeSession("topic-session", "topic"),
    items: [{ ...createSessionItem(makeDescriptor("active-item")), id: "active-item" }]
  };
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: {
      ...createEmptyTabState(),
      activeItemId: "active-item"
    }
  });

  const response = await harness.dispatch({
    type: "session/refresh-selected",
    target: {
      sessionId: product.id,
      itemId: "missing-product-item"
    }
  } as unknown as ExtensionMessage);

  assert.equal(response.ok, false);
  assert.match(response.ok ? "" : response.error, /Saved post not found/);
});

test("session/queue-all-pending rejects messages without an explicit session target", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({ type: "session/queue-all-pending" } as unknown as ExtensionMessage);

  assert.equal(response.ok, false);
  assert.match(response.ok ? "" : response.error, /Explicit session target is required/);
});

test("session/queue-all-pending uses the explicit session target instead of the active cursor", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({
    type: "session/queue-all-pending",
    target: {
      sessionId: "missing-session"
    }
  } as unknown as ExtensionMessage);

  assert.equal(response.ok, false);
  assert.match(response.ok ? "" : response.error, /Target folder not found/);
});

test("session/refresh-all rejects messages without an explicit session target", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({ type: "session/refresh-all" } as unknown as ExtensionMessage);

  assert.equal(response.ok, false);
  assert.match(response.ok ? "" : response.error, /Explicit session target is required/);
});

test("session/refresh-all uses the explicit session target instead of the active cursor", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({
    type: "session/refresh-all",
    target: {
      sessionId: "missing-session"
    }
  } as unknown as ExtensionMessage);

  assert.equal(response.ok, false);
  assert.match(response.ok ? "" : response.error, /Target folder not found/);
});

test("session/set-mode missing target mode persists the global key", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({ type: "session/set-mode", sessionId: topic.id, mode: "product" });
  const global = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;

  assert.equal(response.ok, true);
  assert.equal(response.setModePath, "slow");
  assert.deepEqual(harness.writes.map((keys) => keys.toSorted()), [[
    backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY,
    backgroundTestables.GLOBAL_STORAGE_KEY,
    harness.tabKey
  ].toSorted()]);
  assert.equal(global.sessions.length, 2);
  assert.equal(global.sessions.some((session) => session.mode === "product"), true);
});

test("session/refresh-all with no refreshable work and unchanged error performs no storage writes", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({
    type: "session/refresh-all",
    target: {
      sessionId: topic.id
    }
  });

  assert.equal(response.ok, true);
  assert.deepEqual(harness.writes, []);
});

test("session/queue-item writes broadcast state/updated exactly once per tab", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const topic = {
      ...makeSession("topic-session", "topic"),
      items: [{ ...createSessionItem(makeDescriptor("queue-current")), id: "item-queue-current" }]
    };
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.endsWith("/capture-target") && method === "POST") {
        return jsonResponse(makeCaptureTargetResponse("queue-current"));
      }
      if (url.endsWith("/jobs/job-queue-current")) {
        throw new Error("job not ready");
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;
    const global = makeGlobal([topic], topic.id);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          ingestBaseUrl: ""
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
      [tabKey]: createEmptyTabState()
    });

    const response = await harness.dispatch({
      type: "session/queue-item",
      requestId: "queue-current",
      sessionId: topic.id,
      itemId: "item-queue-current"
    } as ExtensionMessage);

    assert.equal(response.ok, true);
    assert.equal(harness.writes.length, 1);
    assertStateUpdatedBroadcastOnce(harness);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session/refresh-item writes broadcast state/updated exactly once per tab", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const topic = {
      ...makeSession("topic-session", "topic"),
      items: [makeRefreshableItem("refresh-current")]
    };
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/jobs/job-refresh-current")) {
        return jsonResponse(makeJob("refresh-current"));
      }
      if (url.endsWith("/captures/cap-refresh-current")) {
        return jsonResponse(makeCapture("refresh-current"));
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;
    const global = makeGlobal([topic], topic.id);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          ingestBaseUrl: ""
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
      [tabKey]: createEmptyTabState()
    });

    const response = await harness.dispatch({
      type: "session/refresh-item",
      requestId: "refresh-item-current",
      sessionId: topic.id,
      itemId: "item-refresh-current"
    } as ExtensionMessage);

    assert.equal(response.ok, true);
    assert.equal(harness.writes.length, 1);
    assertStateUpdatedBroadcastOnce(harness);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session/refresh-all writes broadcast state/updated exactly once per tab", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const topic = {
      ...makeSession("topic-session", "topic"),
      items: [makeRefreshableItem("refresh-all-current")]
    };
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/jobs/job-refresh-all-current")) {
        return jsonResponse(makeJob("refresh-all-current"));
      }
      if (url.endsWith("/captures/cap-refresh-all-current")) {
        return jsonResponse(makeCapture("refresh-all-current"));
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;
    const global = makeGlobal([topic], topic.id);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          ingestBaseUrl: ""
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
      [tabKey]: createEmptyTabState()
    });

    const response = await harness.dispatch({
      type: "session/refresh-all",
      requestId: "refresh-all-current",
      target: { sessionId: topic.id }
    } as ExtensionMessage);

    assert.equal(response.ok, true);
    assert.equal(harness.writes.length, 1);
    assertStateUpdatedBroadcastOnce(harness);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("product/analyze-signals writes broadcast state/updated exactly once per tab", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const product = {
      ...makeSession("product-session", "product"),
      items: [makeSucceededItem("product-current")]
    };
    const signal = makeSignal("product-signal-current", product.id, "item-product-current");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    globalThis.fetch = (async () => makeGoogleJsonResponse(makeProductSignalAnalysisPayload("current"))) as typeof fetch;
    const global = makeGlobal([product], product.id);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          oneLinerProvider: "google",
          googleApiKey: "test-google-key"
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: product.id,
      [PRODUCT_CONTEXT_STORAGE_KEY]: makeProductContext(),
      [SIGNALS_STORAGE_KEY]: [signal],
      [tabKey]: createEmptyTabState()
    });

    const response = await harness.dispatch({
      type: "product/analyze-signals",
      requestId: "product-current",
      sessionId: product.id
    } as ExtensionMessage);

    assert.equal(response.ok, true);
    assert.equal(harness.writesFor(PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY).length, 1);
    assertStateUpdatedBroadcastOnce(harness);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("product failure summary ignores stale job errors for queued and running items", () => {
  const session = makeSession("product-session", "product");
  const queued = {
    ...createSessionItem(makeDescriptor("queued"), "2026-05-27T00:00:00.000Z"),
    id: "item-queued",
    status: "queued" as const,
    lastErrorKind: "unexpected_runtime_error",
    lastError: "BrowserType.launch: Executable doesn't exist at /Users/tung/Library/Caches/ms-playwright/chromium"
  };
  const running = {
    ...createSessionItem(makeDescriptor("running"), "2026-05-27T00:00:00.000Z"),
    id: "item-running",
    status: "running" as const,
    lastErrorKind: "unexpected_runtime_error",
    lastError: "BrowserType.launch: Executable doesn't exist at /Users/tung/Library/Caches/ms-playwright/chromium"
  };
  const failed = {
    ...createSessionItem(makeDescriptor("failed"), "2026-05-27T00:00:00.000Z"),
    id: "item-failed",
    status: "failed" as const,
    lastErrorKind: "crawler_setup_error",
    lastError: "BrowserType.launch: Executable doesn't exist at /Users/tung/Library/Caches/ms-playwright/chromium"
  };
  session.items = [queued, running, failed];
  const signals = [
    makeSignal("signal-queued", session.id, queued.id),
    makeSignal("signal-running", session.id, running.id),
    makeSignal("signal-failed", session.id, failed.id)
  ];

  const failures = backgroundTestables.buildProductSignalFailureDetails({
    session,
    signals,
    analyses: []
  });

  assert.deepEqual(failures.map((failure) => failure.signalId), ["signal-failed"]);
});

test("folder/synthesis/generate writes broadcast state/updated exactly once per tab", async () => {
  const scenario = makeFolderSynthesisScenario("topic-session", "folder-current");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([scenario.session], scenario.session.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: scenario.session.id,
    [TOPICS_STORAGE_KEY]: scenario.topics,
    [SIGNALS_STORAGE_KEY]: scenario.signals,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({
    type: "folder/synthesis/generate",
    requestId: "folder-generate-current",
    sessionId: scenario.session.id
  } as ExtensionMessage);

  assert.equal(response.ok, true);
  assert.equal(harness.writesFor(FOLDER_SYNTHESIS_STORAGE_KEY).length, 1);
  assertStateUpdatedBroadcastOnce(harness);
});

test("folder/synthesis/clear writes broadcast state/updated exactly once per tab", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [FOLDER_SYNTHESIS_STORAGE_KEY]: [makeFolderSynthesisRecord(topic.id)],
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({
    type: "folder/synthesis/clear",
    requestId: "folder-clear-current",
    sessionId: topic.id
  } as ExtensionMessage);

  assert.equal(response.ok, true);
  assert.equal(harness.writesFor(FOLDER_SYNTHESIS_STORAGE_KEY).length, 1);
  assertStateUpdatedBroadcastOnce(harness);
});

test("pr/match-criteria writes broadcast state/updated exactly once per tab", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const prSession = makeSession("pr-session", "pr-evidence");
    const campaign = makePrCampaign("campaign-current", prSession.id);
    const row = makePrEvidenceRow(campaign.id, "item-current", "current");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    globalThis.fetch = (async () => makeGoogleJsonResponse({
      rows: [{
        row_id: row.id,
        matches: { c1: true, c2: false, c3: false, c4: false, c5: false, c6: false }
      }]
    })) as typeof fetch;
    const global = makeGlobal([prSession], prSession.id);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          oneLinerProvider: "google",
          googleApiKey: "test-google-key"
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: prSession.id,
      [PR_CAMPAIGNS_STORAGE_KEY]: [campaign],
      [PR_EVIDENCE_ROWS_STORAGE_KEY]: [row],
      [tabKey]: createEmptyTabState()
    });

    const response = await harness.dispatch({
      type: "pr/match-criteria",
      requestId: "match-current",
      campaignId: campaign.id
    } as ExtensionMessage);

    assert.equal(response.ok, true);
    assert.equal(harness.writesFor(PR_EVIDENCE_ROWS_STORAGE_KEY).length, 1);
    assertStateUpdatedBroadcastOnce(harness);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pr/fetch-advanced-metrics writes broadcast state/updated exactly once per tab", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const prSession = makeSession("pr-session", "pr-evidence");
    const campaign = makePrCampaign("campaign-current", prSession.id);
    const row = makePrEvidenceRow(campaign.id, "item-current", "current");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    globalThis.fetch = (async () => jsonResponse({
      post_url: row.postUrl,
      metrics: { views: 123 },
      fetched_at: "2026-05-27T00:00:30.000Z"
    })) as typeof fetch;
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([prSession], prSession.id),
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: prSession.id,
      [PR_CAMPAIGNS_STORAGE_KEY]: [campaign],
      [PR_EVIDENCE_ROWS_STORAGE_KEY]: [row],
      [tabKey]: createEmptyTabState()
    });

    const response = await harness.dispatch({
      type: "pr/fetch-advanced-metrics",
      requestId: "metrics-current",
      campaignId: campaign.id
    } as ExtensionMessage);

    assert.equal(response.ok, true);
    assert.equal(harness.writesFor(PR_EVIDENCE_ROWS_STORAGE_KEY).length, 1);
    assertStateUpdatedBroadcastOnce(harness);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session/queue-item ignores stale request writes before storage and broadcast", async () => {
  enablePipelineTraceForTest();
  const originalFetch = globalThis.fetch;
  let releaseOldCaptureTarget: ((response: Response) => void) | null = null;
  const oldCaptureTargetResponse = new Promise<Response>((resolve) => {
    releaseOldCaptureTarget = resolve;
  });

  try {
    const oldSession = {
      ...makeSession("old-session", "topic"),
      items: [{ ...createSessionItem(makeDescriptor("old")), id: "item-old" }]
    };
    const newSession = {
      ...makeSession("new-session", "topic"),
      items: [{ ...createSessionItem(makeDescriptor("new")), id: "item-new" }]
    };
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const global = makeGlobal([oldSession, newSession], oldSession.id);
    const fetchRequests: Array<{ url: string; method: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      fetchRequests.push({ url, method });
      if (url.endsWith("/capture-target") && method === "POST") {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as { post_url?: string } : {};
        if (body.post_url?.endsWith("/old")) {
          return oldCaptureTargetResponse;
        }
        if (body.post_url?.endsWith("/new")) {
          return jsonResponse(makeCaptureTargetResponse("new"));
        }
      }
      if (url.endsWith("/jobs/job-old") || url.endsWith("/jobs/job-new")) {
        throw new Error("job not ready");
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          ingestBaseUrl: ""
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: oldSession.id,
      [tabKey]: createEmptyTabState()
    });

    const oldResponsePromise = harness.dispatch({
      type: "session/queue-item",
      requestId: "queue-old",
      sessionId: oldSession.id,
      itemId: "item-old"
    } as ExtensionMessage);
    await waitFor(
      () => fetchRequests.some((request) => request.url.endsWith("/capture-target") && request.method === "POST"),
      "old queue capture-target request"
    );

    const newResponsePromise = harness.dispatch({
      type: "session/queue-item",
      requestId: "queue-new",
      sessionId: newSession.id,
      itemId: "item-new"
    } as ExtensionMessage);
    await waitFor(
      () => readPipelineTrace().some((event) =>
        event.step === "background.session.queue-item.request"
        && event.requestId === "queue-new"
      ),
      "new queue request trace"
    );

    assert.notEqual(releaseOldCaptureTarget, null);
    releaseOldCaptureTarget?.(jsonResponse(makeCaptureTargetResponse("old")));
    const [oldResponse, newResponse] = await Promise.all([oldResponsePromise, newResponsePromise]);

    assert.equal(oldResponse.ok, true);
    assert.equal(newResponse.ok, true);
    assert.equal(harness.writes.length, 1);
    assert.equal(harness.tabMessages.filter((message) => message.type === "state/updated").length, 1);

    const storedGlobal = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
    assert.equal(storedGlobal.sessions.find((session) => session.id === oldSession.id)?.items[0]?.status, "saved");
    assert.equal(storedGlobal.sessions.find((session) => session.id === newSession.id)?.items[0]?.status, "queued");
    assert.equal(
      readPipelineTrace().some((event) =>
        event.step === "reconcile.stale-result.ignore"
        && event.requestId === "queue-old"
      ),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    disablePipelineTraceForTest();
  }
});

test("session/refresh-item ignores stale request writes before storage and broadcast", async () => {
  enablePipelineTraceForTest();
  const originalFetch = globalThis.fetch;
  let releaseOldJob: ((response: Response) => void) | null = null;
  const oldJobResponse = new Promise<Response>((resolve) => {
    releaseOldJob = resolve;
  });

  try {
    const oldSession = {
      ...makeSession("old-session", "topic"),
      items: [makeRefreshableItem("old")]
    };
    const newSession = {
      ...makeSession("new-session", "topic"),
      items: [makeRefreshableItem("new")]
    };
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const global = makeGlobal([oldSession, newSession], oldSession.id);
    const fetchUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchUrls.push(url);
      if (url.endsWith("/jobs/job-old")) {
        return oldJobResponse;
      }
      if (url.endsWith("/captures/cap-old")) {
        return jsonResponse(makeCapture("old"));
      }
      if (url.endsWith("/jobs/job-new")) {
        return jsonResponse(makeJob("new"));
      }
      if (url.endsWith("/captures/cap-new")) {
        return jsonResponse(makeCapture("new"));
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          ingestBaseUrl: ""
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: oldSession.id,
      [tabKey]: createEmptyTabState()
    });

    const oldResponsePromise = harness.dispatch({
      type: "session/refresh-item",
      requestId: "refresh-item-old",
      sessionId: oldSession.id,
      itemId: "item-old"
    } as ExtensionMessage);
    await waitFor(() => fetchUrls.some((url) => url.endsWith("/jobs/job-old")), "old refresh-item fetch");

    const newResponsePromise = harness.dispatch({
      type: "session/refresh-item",
      requestId: "refresh-item-new",
      sessionId: newSession.id,
      itemId: "item-new"
    } as ExtensionMessage);
    await waitFor(
      () => readPipelineTrace().some((event) =>
        event.step === "background.session.refresh-item.request"
        && event.requestId === "refresh-item-new"
      ),
      "new refresh-item request trace"
    );

    assert.notEqual(releaseOldJob, null);
    releaseOldJob?.(jsonResponse(makeJob("old")));
    const [oldResponse, newResponse] = await Promise.all([oldResponsePromise, newResponsePromise]);

    assert.equal(oldResponse.ok, true);
    assert.equal(newResponse.ok, true);
    assert.equal(harness.writes.length, 1);
    assert.equal(harness.tabMessages.filter((message) => message.type === "state/updated").length, 1);

    const storedGlobal = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
    assert.equal(storedGlobal.sessions.find((session) => session.id === oldSession.id)?.items[0]?.status, "queued");
    assert.equal(storedGlobal.sessions.find((session) => session.id === newSession.id)?.items[0]?.status, "succeeded");
    assert.equal(
      readPipelineTrace().some((event) =>
        event.step === "reconcile.stale-result.ignore"
        && event.requestId === "refresh-item-old"
      ),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    disablePipelineTraceForTest();
  }
});

test("session/refresh-all ignores stale request writes before storage and broadcast", async () => {
  enablePipelineTraceForTest();
  const originalFetch = globalThis.fetch;
  let releaseOldJob: ((response: Response) => void) | null = null;
  const oldJobResponse = new Promise<Response>((resolve) => {
    releaseOldJob = resolve;
  });

  try {
    const oldSession = {
      ...makeSession("old-session", "topic"),
      items: [makeRefreshableItem("old")]
    };
    const newSession = {
      ...makeSession("new-session", "topic"),
      items: [makeRefreshableItem("new")]
    };
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const global = makeGlobal([oldSession, newSession], oldSession.id);
    const fetchUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchUrls.push(url);
      if (url.endsWith("/jobs/job-old")) {
        return oldJobResponse;
      }
      if (url.endsWith("/captures/cap-old")) {
        return jsonResponse(makeCapture("old"));
      }
      if (url.endsWith("/jobs/job-new")) {
        return jsonResponse(makeJob("new"));
      }
      if (url.endsWith("/captures/cap-new")) {
        return jsonResponse(makeCapture("new"));
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          ingestBaseUrl: ""
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: oldSession.id,
      [tabKey]: createEmptyTabState()
    });

    const oldResponsePromise = harness.dispatch({
      type: "session/refresh-all",
      requestId: "refresh-old",
      target: { sessionId: oldSession.id }
    } as ExtensionMessage);
    await waitFor(() => fetchUrls.some((url) => url.endsWith("/jobs/job-old")), "old refresh fetch");

    const newResponsePromise = harness.dispatch({
      type: "session/refresh-all",
      requestId: "refresh-new",
      target: { sessionId: newSession.id }
    } as ExtensionMessage);
    await waitFor(
      () => readPipelineTrace().some((event) =>
        event.step === "background.session.refresh-all.request"
        && event.requestId === "refresh-new"
      ),
      "new refresh request trace"
    );

    assert.notEqual(releaseOldJob, null);
    releaseOldJob?.(jsonResponse(makeJob("old")));
    const [oldResponse, newResponse] = await Promise.all([oldResponsePromise, newResponsePromise]);

    assert.equal(oldResponse.ok, true);
    assert.equal(newResponse.ok, true);
    assert.equal(harness.writes.length, 1);
    assert.equal(harness.tabMessages.filter((message) => message.type === "state/updated").length, 1);

    const storedGlobal = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
    assert.equal(storedGlobal.sessions.find((session) => session.id === oldSession.id)?.items[0]?.status, "queued");
    assert.equal(storedGlobal.sessions.find((session) => session.id === newSession.id)?.items[0]?.status, "succeeded");
    assert.equal(
      readPipelineTrace().some((event) =>
        event.step === "reconcile.stale-result.ignore"
        && event.requestId === "refresh-old"
      ),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    disablePipelineTraceForTest();
  }
});

test("product/analyze-signals ignores stale direct storage-key writes", async () => {
  enablePipelineTraceForTest();
  const originalFetch = globalThis.fetch;
  let releaseOldAnalysis: ((response: Response) => void) | null = null;
  const oldAnalysisResponse = new Promise<Response>((resolve) => {
    releaseOldAnalysis = resolve;
  });

  try {
    const oldSession = {
      ...makeSession("old-product-session", "product"),
      items: [makeSucceededItem("old")]
    };
    const newSession = {
      ...makeSession("new-product-session", "product"),
      items: [makeSucceededItem("new")]
    };
    const oldSignal = makeSignal("old-signal", oldSession.id, "item-old");
    const newSignal = makeSignal("new-signal", newSession.id, "item-new");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      if (fetchCalls.length === 1) {
        return oldAnalysisResponse;
      }
      return makeGoogleJsonResponse(makeProductSignalAnalysisPayload("new"));
    }) as typeof fetch;

    const global = makeGlobal([oldSession, newSession], oldSession.id);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          oneLinerProvider: "google",
          googleApiKey: "test-google-key"
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: oldSession.id,
      [PRODUCT_CONTEXT_STORAGE_KEY]: makeProductContext(),
      [SIGNALS_STORAGE_KEY]: [oldSignal, newSignal],
      [tabKey]: createEmptyTabState()
    });

    const oldResponsePromise = harness.dispatch({
      type: "product/analyze-signals",
      requestId: "product-old",
      sessionId: oldSession.id
    } as ExtensionMessage);
    await waitFor(() => fetchCalls.length === 1, "old product analysis call");

    const newResponsePromise = harness.dispatch({
      type: "product/analyze-signals",
      requestId: "product-new",
      sessionId: newSession.id
    } as ExtensionMessage);
    await waitFor(() => fetchCalls.length === 2, "new product analysis call");
    const newResponse = await newResponsePromise;

    assert.notEqual(releaseOldAnalysis, null);
    releaseOldAnalysis?.(makeGoogleJsonResponse(makeProductSignalAnalysisPayload("old")));
    const oldResponse = await oldResponsePromise;

    assert.equal(oldResponse.ok, true);
    assert.equal(newResponse.ok, true);
    assert.equal(harness.writesFor(PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY).length, 1);
    assertStateUpdatedBroadcastOnce(harness);

    const storedAnalyses = harness.state[PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY] as Record<string, unknown>;
    assert.deepEqual(Object.keys(storedAnalyses).toSorted(), ["new-signal"]);
    assert.equal(
      readPipelineTrace().some((event) =>
        event.step === "reconcile.stale-result.ignore"
        && event.requestId === "product-old"
      ),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    disablePipelineTraceForTest();
  }
});

test("folder/synthesis/generate ignores stale direct storage-key writes", async () => {
  enablePipelineTraceForTest();
  let releaseOldTopics: (() => void) | null = null;
  let blockedOldTopics = false;

  try {
    const oldScenario = makeFolderSynthesisScenario("old-topic-session", "old-folder");
    const newScenario = makeFolderSynthesisScenario("new-topic-session", "new-folder");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([oldScenario.session, newScenario.session], oldScenario.session.id),
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: oldScenario.session.id,
      [TOPICS_STORAGE_KEY]: [...oldScenario.topics, ...newScenario.topics],
      [SIGNALS_STORAGE_KEY]: [...oldScenario.signals, ...newScenario.signals],
      [tabKey]: createEmptyTabState()
    }, {
      onGet: (keys) => {
        if (!blockedOldTopics && storageKeysInclude(keys, TOPICS_STORAGE_KEY)) {
          blockedOldTopics = true;
          return new Promise<void>((resolve) => {
            releaseOldTopics = resolve;
          });
        }
      }
    });

    const oldResponsePromise = harness.dispatch({
      type: "folder/synthesis/generate",
      requestId: "folder-generate-old",
      sessionId: oldScenario.session.id
    } as ExtensionMessage);
    await waitFor(() => blockedOldTopics, "old folder synthesis topic read");

    const newResponse = await harness.dispatch({
      type: "folder/synthesis/generate",
      requestId: "folder-generate-new",
      sessionId: newScenario.session.id
    } as ExtensionMessage);

    assert.notEqual(releaseOldTopics, null);
    releaseOldTopics?.();
    const oldResponse = await oldResponsePromise;

    assert.equal(oldResponse.ok, true);
    assert.equal(newResponse.ok, true);
    assert.equal(harness.writesFor(FOLDER_SYNTHESIS_STORAGE_KEY).length, 1);
    assertStateUpdatedBroadcastOnce(harness);

    const storedSyntheses = harness.state[FOLDER_SYNTHESIS_STORAGE_KEY] as FolderSynthesis[];
    assert.deepEqual(storedSyntheses.map((entry) => entry.sessionId), [newScenario.session.id]);
    assert.equal(
      readPipelineTrace().some((event) =>
        event.step === "reconcile.stale-result.ignore"
        && event.requestId === "folder-generate-old"
      ),
      true
    );
  } finally {
    disablePipelineTraceForTest();
  }
});

test("folder/synthesis/clear ignores stale direct storage-key writes", async () => {
  enablePipelineTraceForTest();
  let releaseOldSynthesisRead: (() => void) | null = null;
  let blockedOldSynthesisRead = false;

  try {
    const oldSession = makeSession("old-topic-session", "topic");
    const newSession = makeSession("new-topic-session", "topic");
    const oldSynthesis = makeFolderSynthesisRecord(oldSession.id, "2026-05-27T00:00:10.000Z");
    const newSynthesis = makeFolderSynthesisRecord(newSession.id, "2026-05-27T00:00:20.000Z");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([oldSession, newSession], oldSession.id),
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: oldSession.id,
      [FOLDER_SYNTHESIS_STORAGE_KEY]: [oldSynthesis, newSynthesis],
      [tabKey]: createEmptyTabState()
    }, {
      onGet: (keys) => {
        if (!blockedOldSynthesisRead && storageKeysInclude(keys, FOLDER_SYNTHESIS_STORAGE_KEY)) {
          blockedOldSynthesisRead = true;
          return new Promise<void>((resolve) => {
            releaseOldSynthesisRead = resolve;
          });
        }
      }
    });

    const oldResponsePromise = harness.dispatch({
      type: "folder/synthesis/clear",
      requestId: "folder-clear-old",
      sessionId: oldSession.id
    } as ExtensionMessage);
    await waitFor(() => blockedOldSynthesisRead, "old folder synthesis clear read");

    const newResponse = await harness.dispatch({
      type: "folder/synthesis/clear",
      requestId: "folder-clear-new",
      sessionId: newSession.id
    } as ExtensionMessage);

    assert.notEqual(releaseOldSynthesisRead, null);
    releaseOldSynthesisRead?.();
    const oldResponse = await oldResponsePromise;

    assert.equal(oldResponse.ok, true);
    assert.equal(newResponse.ok, true);
    assert.equal(harness.writesFor(FOLDER_SYNTHESIS_STORAGE_KEY).length, 1);
    assertStateUpdatedBroadcastOnce(harness);

    const storedSyntheses = harness.state[FOLDER_SYNTHESIS_STORAGE_KEY] as FolderSynthesis[];
    assert.deepEqual(storedSyntheses.map((entry) => entry.sessionId), [oldSession.id]);
    assert.equal(
      readPipelineTrace().some((event) =>
        event.step === "reconcile.stale-result.ignore"
        && event.requestId === "folder-clear-old"
      ),
      true
    );
  } finally {
    disablePipelineTraceForTest();
  }
});

test("pr/fetch-advanced-metrics ignores stale direct storage-key writes", async () => {
  enablePipelineTraceForTest();
  const originalFetch = globalThis.fetch;
  let releaseOldMetrics: ((response: Response) => void) | null = null;
  const oldMetricsResponse = new Promise<Response>((resolve) => {
    releaseOldMetrics = resolve;
  });

  try {
    const prSession = makeSession("pr-session", "pr-evidence");
    const campaign = makePrCampaign("campaign-1", prSession.id);
    const row = makePrEvidenceRow(campaign.id, "item-1", "shared");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { post_url?: string } : {};
      fetchCalls.push(`${String(input)} ${body.post_url ?? ""}`);
      if (fetchCalls.length === 1) {
        return oldMetricsResponse;
      }
      return jsonResponse({
        post_url: row.postUrl,
        metrics: { views: 200 },
        fetched_at: "2026-05-27T00:00:20.000Z"
      });
    }) as typeof fetch;

    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([prSession], prSession.id),
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: prSession.id,
      [PR_CAMPAIGNS_STORAGE_KEY]: [campaign],
      [PR_EVIDENCE_ROWS_STORAGE_KEY]: [row],
      [tabKey]: createEmptyTabState()
    });

    const oldResponsePromise = harness.dispatch({
      type: "pr/fetch-advanced-metrics",
      requestId: "metrics-old",
      campaignId: campaign.id
    } as ExtensionMessage);
    await waitFor(() => fetchCalls.length === 1, "old metrics fetch");

    const newResponsePromise = harness.dispatch({
      type: "pr/fetch-advanced-metrics",
      requestId: "metrics-new",
      campaignId: campaign.id
    } as ExtensionMessage);
    await waitFor(() => fetchCalls.length === 2, "new metrics fetch");
    const newResponse = await newResponsePromise;

    assert.notEqual(releaseOldMetrics, null);
    releaseOldMetrics?.(jsonResponse({
      post_url: row.postUrl,
      metrics: { views: 100 },
      fetched_at: "2026-05-27T00:00:10.000Z"
    }));
    const oldResponse = await oldResponsePromise;

    assert.equal(oldResponse.ok, true);
    assert.equal(newResponse.ok, true);
    const storedRows = harness.state[PR_EVIDENCE_ROWS_STORAGE_KEY] as PrEvidenceRow[];
    assert.equal(storedRows.find((entry) => entry.id === row.id)?.metrics.views, 200);
    assert.equal(storedRows.find((entry) => entry.id === row.id)?.advancedMetricsFetchedAt, "2026-05-27T00:00:20.000Z");
    assert.equal(harness.writes.filter((keys) => keys.includes(PR_EVIDENCE_ROWS_STORAGE_KEY)).length, 1);
    assertStateUpdatedBroadcastOnce(harness);
    assert.equal(
      readPipelineTrace().some((event) =>
        event.step === "reconcile.stale-result.ignore"
        && event.requestId === "metrics-old"
      ),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    disablePipelineTraceForTest();
  }
});

test("pr/match-criteria starts a fresh write when a newer request supersedes in-flight work", async () => {
  enablePipelineTraceForTest();
  const originalFetch = globalThis.fetch;
  let releaseOldMatch: ((response: Response) => void) | null = null;
  const oldMatchResponse = new Promise<Response>((resolve) => {
    releaseOldMatch = resolve;
  });

  try {
    const prSession = makeSession("pr-session", "pr-evidence");
    const campaign = makePrCampaign("campaign-1", prSession.id);
    const row = makePrEvidenceRow(campaign.id, "item-1", "shared");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      if (fetchCalls.length === 1) {
        return oldMatchResponse;
      }
      return makeGoogleJsonResponse({
        rows: [{
          row_id: row.id,
          matches: { c1: false, c2: true, c3: false, c4: false, c5: false, c6: false }
        }]
      });
    }) as typeof fetch;

    const global = makeGlobal([prSession], prSession.id);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          oneLinerProvider: "google",
          googleApiKey: "test-google-key"
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: prSession.id,
      [PR_CAMPAIGNS_STORAGE_KEY]: [campaign],
      [PR_EVIDENCE_ROWS_STORAGE_KEY]: [row],
      [tabKey]: createEmptyTabState()
    });

    const oldResponsePromise = harness.dispatch({
      type: "pr/match-criteria",
      requestId: "match-old",
      campaignId: campaign.id
    } as ExtensionMessage);
    await waitFor(() => fetchCalls.length === 1, "old criteria match fetch");

    const newResponsePromise = harness.dispatch({
      type: "pr/match-criteria",
      requestId: "match-new",
      campaignId: campaign.id
    } as ExtensionMessage);
    await waitFor(() => fetchCalls.length === 2, "new criteria match fetch");
    const newResponse = await newResponsePromise;

    assert.notEqual(releaseOldMatch, null);
    releaseOldMatch?.(makeGoogleJsonResponse({
      rows: [{
        row_id: row.id,
        matches: { c1: true, c2: false, c3: false, c4: false, c5: false, c6: false }
      }]
    }));
    const oldResponse = await oldResponsePromise;

    assert.equal(oldResponse.ok, true);
    assert.equal(newResponse.ok, true);
    const storedRows = harness.state[PR_EVIDENCE_ROWS_STORAGE_KEY] as PrEvidenceRow[];
    assert.equal(storedRows.find((entry) => entry.id === row.id)?.criteriaMatches.c1, false);
    assert.equal(storedRows.find((entry) => entry.id === row.id)?.criteriaMatches.c2, true);
    assert.equal(harness.writes.filter((keys) => keys.includes(PR_EVIDENCE_ROWS_STORAGE_KEY)).length, 1);
    assertStateUpdatedBroadcastOnce(harness);
    assert.equal(
      readPipelineTrace().some((event) =>
        event.step === "reconcile.stale-result.ignore"
        && event.requestId === "match-old"
      ),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    disablePipelineTraceForTest();
  }
});

test("judgment/start ignores stale saved-analysis writes and broadcasts", async () => {
  enablePipelineTraceForTest();
  let releaseOldSavedRead: (() => void) | null = null;
  let blockedOldSavedRead = false;

  try {
    const oldItems = [makeSucceededItem("judgment-old-a"), makeSucceededItem("judgment-old-b")];
    const newItems = [makeSucceededItem("judgment-new-a"), makeSucceededItem("judgment-new-b")];
    const session = {
      ...makeSession("judgment-session", "topic"),
      items: [...oldItems, ...newItems]
    };
    const oldAnalysis = makeSavedAnalysis("old-result", oldItems[0]!.id, oldItems[1]!.id);
    const newAnalysis = makeSavedAnalysis("new-result", newItems[0]!.id, newItems[1]!.id);
    const global = makeGlobal([session], session.id);
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          productProfile: {
            name: "DLens",
            category: "Chrome extension",
            audience: "product teams"
          }
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: session.id,
      [SAVED_ANALYSES_STORAGE_KEY]: [oldAnalysis, newAnalysis],
      [tabKey]: createEmptyTabState()
    }, {
      onGet: (keys) => {
        if (!blockedOldSavedRead && storageKeysInclude(keys, SAVED_ANALYSES_STORAGE_KEY)) {
          blockedOldSavedRead = true;
          return new Promise<void>((resolve) => {
            releaseOldSavedRead = resolve;
          });
        }
      }
    });

    const oldResponsePromise = harness.dispatch({
      type: "judgment/start",
      requestId: "judgment-old",
      resultId: oldAnalysis.resultId
    } as ExtensionMessage);
    await waitFor(() => blockedOldSavedRead, "old judgment saved-analysis read");

    const newResponse = await harness.dispatch({
      type: "judgment/start",
      requestId: "judgment-new",
      resultId: newAnalysis.resultId
    } as ExtensionMessage);

    assert.notEqual(releaseOldSavedRead, null);
    releaseOldSavedRead?.();
    const oldResponse = await oldResponsePromise;

    assert.equal(oldResponse.ok, true);
    assert.equal(newResponse.ok, true);
    assert.equal(harness.writesFor(SAVED_ANALYSES_STORAGE_KEY).length, 1);

    const storedAnalyses = harness.state[SAVED_ANALYSES_STORAGE_KEY] as SavedAnalysisSnapshot[];
    assert.equal(storedAnalyses.find((entry) => entry.resultId === oldAnalysis.resultId)?.judgmentResult, null);
    assert.equal(storedAnalyses.find((entry) => entry.resultId === newAnalysis.resultId)?.judgmentResult?.recommendedState, "park");
    assert.equal(
      harness.tabMessages.some((message) =>
        message.type === "judgment/result" && message.resultId === oldAnalysis.resultId
      ),
      false
    );
    assert.equal(
      harness.tabMessages.some((message) =>
        message.type === "judgment/result" && message.resultId === newAnalysis.resultId
      ),
      true
    );
    assert.equal(
      readPipelineTrace().some((event) =>
        event.step === "reconcile.stale-result.ignore"
        && event.requestId === "judgment-old"
      ),
      true
    );
  } finally {
    disablePipelineTraceForTest();
  }
});

test("queue-all and refresh-all emit crawl/capture background boundary events with requestId", async () => {
  enablePipelineTraceForTest();
  try {
    const topic = makeSession("topic-session", "topic");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
      [tabKey]: createEmptyTabState()
    });

    const queueResponse = await harness.dispatch({
      type: "session/queue-all-pending",
      requestId: "queue-req-1",
      target: { sessionId: topic.id }
    } as ExtensionMessage);
    const refreshResponse = await harness.dispatch({
      type: "session/refresh-all",
      requestId: "refresh-req-1",
      target: { sessionId: topic.id }
    } as ExtensionMessage);

    assert.equal(queueResponse.ok, true);
    assert.equal(refreshResponse.ok, true);
    const events = readPipelineTrace().filter((event) =>
      event.step.startsWith("background.session.queue-all-pending.")
      || event.step.startsWith("background.session.refresh-all.")
    );
    assert.deepEqual(events.map((event) => [event.phase, event.step, event.result, event.requestId]), [
      ["crawl.queued", "background.session.queue-all-pending.request", "pending", "queue-req-1"],
      ["crawl.queued", "background.session.queue-all-pending.response", "ok", "queue-req-1"],
      ["capture.ready", "background.session.refresh-all.request", "pending", "refresh-req-1"],
      ["capture.ready", "background.session.refresh-all.response", "ok", "refresh-req-1"]
    ]);
    assert.deepEqual(events.map((event) => event.target), [
      { sessionId: topic.id, tabId: TAB_ID },
      { sessionId: topic.id, tabId: TAB_ID },
      { sessionId: topic.id, tabId: TAB_ID },
      { sessionId: topic.id, tabId: TAB_ID }
    ]);
  } finally {
    disablePipelineTraceForTest();
  }
});

test("state update broadcast does not block the set-mode response", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  }, { blockStateUpdatedBroadcast: true });

  const result = await Promise.race([
    harness.dispatch({ type: "session/set-mode", sessionId: product.id, mode: "product" }).then(() => "response"),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 50))
  ]);

  assert.equal(result, "response");
  assert.equal(harness.tabMessages.some((message) => message.type === "state/updated"), true);
});

test("content-script active-tab messages resolve to the sender tab, not another focused Chrome tab", async () => {
  const topic = makeSession("topic-session", "topic");
  const senderTabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const focusedTabKey = backgroundTestables.tabStorageKey(OTHER_TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [senderTabKey]: createEmptyTabState(),
    [focusedTabKey]: {
      ...createEmptyTabState(),
      popupOpen: true
    }
  }, {
    activeTabId: OTHER_TAB_ID,
    senderTabId: TAB_ID
  });

  const stateResponse = await harness.dispatch({ type: "state/get-active-tab" });
  assert.equal(stateResponse.ok, true);
  assert.equal(stateResponse.tabId, TAB_ID);

  const startResponse = await harness.dispatch({ type: "selection/start-active-tab" });
  assert.equal(startResponse.ok, true);
  assert.equal(startResponse.tabId, TAB_ID);
  assert.equal(startResponse.snapshot?.tab.selectionMode, true);
  assert.equal((harness.state[senderTabKey] as TabUiState).selectionMode, true);
  assert.equal((harness.state[focusedTabKey] as TabUiState).selectionMode, false);
  assert.equal(
    harness.tabMessageTargets.some(({ tabId, message }) => tabId === TAB_ID && message.type === "selection/start-tab"),
    true
  );
  assert.equal(
    harness.tabMessageTargets.some(({ tabId, message }) => tabId === OTHER_TAB_ID && message.type === "selection/start-tab"),
    false
  );

  const cancelResponse = await harness.dispatch({ type: "selection/cancel-active-tab" });
  assert.equal(cancelResponse.ok, true);
  assert.equal(cancelResponse.tabId, TAB_ID);
  assert.equal(cancelResponse.snapshot?.tab.selectionMode, false);
  assert.equal((harness.state[senderTabKey] as TabUiState).selectionMode, false);
});

test("background mutateSnapshot serializes real snapshot writes", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  await Promise.all([
    backgroundTestables.mutateSnapshot(TAB_ID, (current) => ({
      global: {
        ...current.global,
        sessions: current.global.sessions.map((session) =>
          session.id === topic.id ? { ...session, name: "topic-updated" } : session
        )
      },
      tab: current.tab
    })),
    backgroundTestables.mutateSnapshot(TAB_ID, (current) => ({
      global: {
        ...current.global,
        sessions: current.global.sessions.map((session) =>
          session.id === product.id ? { ...session, name: "product-updated" } : session
        )
      },
      tab: current.tab
    }))
  ]);

  const global = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;

  assert.equal(global.sessions.find((session) => session.id === topic.id)?.name, "topic-updated");
  assert.equal(global.sessions.find((session) => session.id === product.id)?.name, "product-updated");
});

test("product/clear-cache removes derived product cache without deleting saved signals", async () => {
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const signalsKey = "dlens:v1:signals";
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([product], product.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: product.id,
    [tabKey]: createEmptyTabState(),
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: [{ signalId: "signal-1" }],
    [PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY]: [{ signalId: "signal-1" }],
    [SIGNAL_READINGS_STORAGE_KEY]: [{ signalId: "signal-1" }],
    [PRODUCT_CONTEXT_STORAGE_KEY]: { productPromise: "old compiled context" },
    [signalsKey]: [{ id: "signal-1", sessionId: product.id }]
  });

  const response = await harness.dispatch({ type: "product/clear-cache" });

  assert.equal(response.ok, true);
  assert.equal(PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY in harness.state, false);
  assert.equal(PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY in harness.state, false);
  assert.equal(SIGNAL_READINGS_STORAGE_KEY in harness.state, false);
  assert.equal(PRODUCT_CONTEXT_STORAGE_KEY in harness.state, false);
  assert.deepEqual(harness.state[signalsKey], [{ id: "signal-1", sessionId: product.id }]);
  assertStateUpdatedBroadcastOnce(harness);
});
