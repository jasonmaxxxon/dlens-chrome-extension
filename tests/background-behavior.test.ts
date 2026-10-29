import { FOLDER_SYNTHESIS_VERSION, SAVED_ANALYSES_STORAGE_KEY, TOPIC_AUDIT_EPISODES_STORAGE_KEY, TOPIC_AUDIT_EVIDENCE_STORAGE_KEY, TOPIC_AUDIT_MEMOS_STORAGE_KEY, TOPIC_AUDIT_REPORTS_STORAGE_KEY } from "./legacy-storage-fixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";

import background, { backgroundTestables } from "../entrypoints/background.ts";
import { PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY } from "../src/compare/product-agent-task-feedback.ts";
import { FOLDER_SYNTHESIS_STORAGE_KEY } from "../src/compare/folder-synthesis-storage.ts";
import { PRODUCT_CONTEXT_STORAGE_KEY } from "../src/compare/product-context.ts";
import { INLINE_READINGS_STORAGE_KEY, normalizeInlineReadingRecords } from "../src/compare/inline-reading-storage.ts";
import { PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY } from "../src/compare/product-signal-storage.ts";
import { SIGNAL_READINGS_STORAGE_KEY } from "../src/compare/signal-reading-storage.ts";
import { SIGNAL_TAGS_STORAGE_KEY } from "../src/compare/signal-tags-storage.ts";
import { TOPIC_SIGNAL_READINGS_STORAGE_KEY } from "../src/compare/topic-signal-reading-storage.ts";
import type { CaptureSnapshot, JobSnapshot } from "../src/contracts/ingest.ts";
import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages.ts";
import { readPipelineTrace } from "../src/state/pipeline-trace.ts";
import { PR_CAMPAIGNS_STORAGE_KEY, PR_EVIDENCE_ROWS_STORAGE_KEY, type PrCampaign, type PrEvidenceRow } from "../src/state/pr-evidence-storage.ts";
import { PR_NARRATIVE_READS_STORAGE_KEY } from "../src/state/pr-narrative-storage.ts";
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

function makePrNarrativeReadingPayload(label: string) {
  return {
    readings: [{
      ref: "P01",
      gist: `${label} campaign gist`,
      evidenceSummary: `${label} campaign evidence`,
      alignmentScore: 0.4,
      actionabilityScore: 0.7,
      claimSeeds: [`${label} practical proof`],
      caveat: ""
    }]
  };
}

function makePrNarrativeSynthesisPayload(label: string) {
  return {
    status: "complete",
    priorityClaimId: "claim-1",
    claims: [
      {
        id: "claim-1",
        title: `${label} priority claim`,
        statement: "P01 frames the campaign through practical proof.",
        implication: "Lead with a concrete demonstration.",
        supportRefs: ["P01"],
        counterRefs: []
      },
      {
        id: "claim-2",
        title: `${label} supporting claim`,
        statement: "P01 makes the intended action legible.",
        implication: "Keep the next action explicit.",
        supportRefs: ["P01"],
        counterRefs: []
      }
    ]
  };
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
    usefulness: "uncertain",
    testability: "not_yet_testable",
    evidence_state: "text_sufficient",
    conflict_state: "none",
    reason: `reason ${label}`,
    evidence_refs: ["root"],
    evidence_notes: [{
      ref: "root",
      quote_summary: `signal ${label}`,
      why_it_matters: `supports ${label}`,
      grounding: "text_grounded"
    }],
    product_reading: {
      headline: `完整判讀 ${label}`,
      body: `已捕捉文字顯示 ${label} 的工作流方向值得保留觀察；目前證據只支持先確認第二個可重複案例，不足以推論未檢查的外部內容。`,
      support_refs: ["root"]
    }
  };
}

function makeGlobal(sessions: SessionRecord[], activeSessionId: string | null): ExtensionGlobalState {
  return {
    ...createEmptyGlobalState(),
    sessions,
    activeSessionId
  };
}

test("background startup persists global-state storage migrations immediately", async () => {
  const session = {
    ...makeSession("migration-session", "product"),
    items: [makeSucceededItem("migration-item")]
  };
  const legacyGlobal = {
    ...makeGlobal([session], session.id),
    schemaVersion: 1
  };
  assert.ok(legacyGlobal.sessions[0]!.items[0]!.latestCapture?.raw_payload);
  assert.ok(legacyGlobal.sessions[0]!.items[0]!.latestCapture?.result?.raw_payload);

  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: legacyGlobal
  });
  const stored = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;

  assert.equal(stored.schemaVersion, 3);
  assert.equal("raw_payload" in stored.sessions[0]!.items[0]!.latestCapture!, false);
  assert.equal("raw_payload" in stored.sessions[0]!.items[0]!.latestCapture!.result!, false);
  assert.deepEqual(
    stored.sessions[0]!.items[0]!.latestCapture!.result!.comments,
    legacyGlobal.sessions[0]!.items[0]!.latestCapture!.result!.comments
  );
  // v2→v3: a descriptor saved before thumbnails gets an explicit null, so the
  // collection list has one no-image shape to render instead of two.
  assert.equal(stored.sessions[0]!.items[0]!.descriptor.image_url, null);
  assert.equal("image_url" in stored.sessions[0]!.items[0]!.descriptor, true);
});

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
    onSet?: (payload: Record<string, unknown>) => Promise<void> | void;
    senderTabId?: number;
  } = {}
): Promise<{
  dispatch: (message: ExtensionMessage) => Promise<ExtensionResponse>;
  dispatchFrom: (tabId: number, message: ExtensionMessage) => Promise<ExtensionResponse>;
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
      await options.onSet?.(payload);
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

  const dispatchFrom = (tabId: number, message: ExtensionMessage) => new Promise<ExtensionResponse>((resolve, reject) => {
    const originalInfo = console.info;
    console.info = () => undefined;
    const timeout = setTimeout(() => {
      console.info = originalInfo;
      reject(new Error(`No response for ${message.type}`));
    }, 1000);
    listener?.(message, { tab: { id: tabId } } as chrome.runtime.MessageSender, (response: ExtensionResponse) => {
      clearTimeout(timeout);
      console.info = originalInfo;
      resolve(response);
    });
  });

  return {
    dispatch: (message: ExtensionMessage) => dispatchFrom(senderTabId, message),
    dispatchFrom,
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

test("a card's 開啟工作區 opens the side panel inside the gesture and hands its workspace over once", async () => {
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([makeSession("topic-session", "topic")], "topic-session"),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: "topic-session",
    [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState()
  });

  const opened = harness.dispatch({ type: "sidepanel/open", sessionId: "topic-session" });
  assert.deepEqual(harness.sidePanelOpenCalls, [{ tabId: TAB_ID }], "sidePanel.open must run before the handler awaits anything");
  assert.equal((await opened).ok, true);
  const first = await harness.dispatch({ type: "sidepanel/take-workspace-open" });
  assert.ok(first.ok);
  assert.equal(first.workspaceSessionId, "topic-session");
  const second = await harness.dispatch({ type: "sidepanel/take-workspace-open" });
  assert.ok(second.ok);
  assert.equal(second.workspaceSessionId, null);
});
test("a card reader opens the side panel inside the gesture and hands its workspace over once", async () => {
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([makeSession("topic-session", "topic")], "topic-session"),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: "topic-session",
    [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState()
  });

  const opened = harness.dispatch({ type: "sidepanel/open", sessionId: "topic-session",itemId:"saved-item",lens:"ask" });
  assert.deepEqual(harness.sidePanelOpenCalls, [{ tabId: TAB_ID }], "sidePanel.open must run before the handler awaits anything");
  assert.equal((await opened).ok, true);
  const first = await harness.dispatch({ type: "sidepanel/take-workspace-open" });
  assert.ok(first.ok);
  assert.equal(first.workspaceSessionId, "topic-session");
  assert.equal(first.readerItemId,"saved-item");assert.equal(first.readerLens,"ask");
  const second = await harness.dispatch({ type: "sidepanel/take-workspace-open" });
  assert.ok(second.ok);
  assert.equal(second.workspaceSessionId, null);
});

test("settings/test-ai-key lists one model with the chosen provider's key and names a missing key", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => { urls.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch;
    const global = makeGlobal([makeSession("topic-session", "topic")], "topic-session");
    const keyed = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: { ...global, settings: { ...global.settings, oneLinerProvider: "google", googleApiKey: "test-google-key" } },
      [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState()
    });
    const ok = await keyed.dispatch({ type: "settings/test-ai-key" });
    assert.ok(ok.ok);
    assert.deepEqual(ok.aiKeyTest, { ok: true, message: "Google key 可用" });
    assert.deepEqual(urls, ["https://generativelanguage.googleapis.com/v1beta/models?pageSize=1"], "a listing, not a generation");
    const bare = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: { ...global, settings: { ...global.settings, oneLinerProvider: "google", googleApiKey: "", openaiApiKey: "sk-x" } },
      [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState()
    });
    const missing = await bare.dispatch({ type: "settings/test-ai-key" });
    assert.ok(missing.ok);
    assert.deepEqual(missing.aiKeyTest, { ok: false, message: "設定選了 Google，但只填了 OpenAI key" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the post in view is kept per Threads tab for a side panel that opens later", async () => {
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([makeSession("topic-session", "topic")], "topic-session"),
    [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState()
  });
  assert.equal((await harness.dispatch({ type: "inline/in-view", postKey: "threads-post:abc" })).ok, true);
  const got = await harness.dispatch({ type: "inline/in-view-get" });
  assert.ok(got.ok);
  assert.equal(got.inViewPostKey, "threads-post:abc");
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

test("failed full snapshot writes do not publish phantom cache or broadcasts", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  let rejectNextSnapshotWrite = true;
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  }, {
    onSet: async (payload) => {
      const keys = Object.keys(payload);
      if (
        rejectNextSnapshotWrite
        && keys.includes(backgroundTestables.GLOBAL_STORAGE_KEY)
        && keys.includes(tabKey)
      ) {
        rejectNextSnapshotWrite = false;
        throw new Error("snapshot durable write failed");
      }
    }
  });

  await assert.rejects(
    backgroundTestables.mutateSnapshot(TAB_ID, (current) => ({
      global: {
        ...current.global,
        sessions: current.global.sessions.map((session) =>
          session.id === topic.id ? { ...session, name: "phantom topic" } : session
        )
      },
      tab: {
        ...current.tab,
        error: "phantom tab"
      }
    })),
    /snapshot durable write failed/
  );

  assert.equal(harness.tabMessages.filter((message) => message.type === "state/updated").length, 0);
  assert.equal(backgroundTestables.getLastSaveSnapshotStorageMs(), 0);

  const cached = await backgroundTestables.loadSnapshotCached(TAB_ID);
  const storedGlobal = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  const storedTab = harness.state[tabKey] as TabUiState;

  assert.equal(cached.global.sessions.find((session) => session.id === topic.id)?.name, topic.name);
  assert.equal(cached.tab.error, null);
  assert.equal(storedGlobal.sessions.find((session) => session.id === topic.id)?.name, topic.name);
  assert.equal(storedTab.error, null);
});

test("failed global-only writes do not publish phantom cache", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  let rejectNextGlobalWrite = true;
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  }, {
    onSet: async (payload) => {
      const keys = Object.keys(payload);
      if (rejectNextGlobalWrite && keys.length === 1 && keys[0] === backgroundTestables.GLOBAL_STORAGE_KEY) {
        rejectNextGlobalWrite = false;
        throw new Error("global durable write failed");
      }
    }
  });

  await assert.rejects(
    backgroundTestables.persistGlobalStateOnly({
      ...makeGlobal([topic], topic.id),
      sessions: [{ ...topic, name: "phantom topic" }]
    }, "[test] persistGlobalStateOnly"),
    /global durable write failed/
  );

  assert.equal(harness.tabMessages.filter((message) => message.type === "state/updated").length, 0);
  assert.equal(backgroundTestables.getLastSaveSnapshotStorageMs(), 0);

  const cached = await backgroundTestables.loadSnapshotCached(TAB_ID);
  const storedGlobal = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;

  assert.equal(cached.global.sessions.find((session) => session.id === topic.id)?.name, topic.name);
  assert.equal(storedGlobal.sessions.find((session) => session.id === topic.id)?.name, topic.name);
});

test("successful snapshot writes publish disk, cache, latency, and one broadcast exactly once", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const originalPerformanceNow = performance.now.bind(performance);
  let nowCall = 0;
  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => {
      nowCall += 1;
      return nowCall === 1 ? 10 : 17;
    }
  });

  try {
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
      [tabKey]: createEmptyTabState()
    });

    await backgroundTestables.mutateSnapshot(TAB_ID, (current) => ({
      global: {
        ...current.global,
        sessions: current.global.sessions.map((session) =>
          session.id === topic.id ? { ...session, name: "saved topic" } : session
        )
      },
      tab: {
        ...current.tab,
        error: "saved tab"
      }
    }));

    const cached = await backgroundTestables.loadSnapshotCached(TAB_ID);
    const storedGlobal = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
    const storedTab = harness.state[tabKey] as TabUiState;

    assert.equal(harness.writes.length, 1);
    assert.deepEqual(harness.writes[0]?.toSorted(), [backgroundTestables.GLOBAL_STORAGE_KEY, tabKey].toSorted());
    assertStateUpdatedBroadcastOnce(harness);
    assert.equal(cached.global.sessions.find((session) => session.id === topic.id)?.name, "saved topic");
    assert.equal(cached.tab.error, "saved tab");
    assert.equal(storedGlobal.sessions.find((session) => session.id === topic.id)?.name, "saved topic");
    assert.equal(storedTab.error, "saved tab");
    assert.equal(backgroundTestables.getLastSaveSnapshotStorageMs(), 7);
  } finally {
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: originalPerformanceNow
    });
  }
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

test("session/save-current-preview can save topic posts into the untriaged lane", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState(),
    [TOPICS_STORAGE_KEY]: []
  });

  const response = await harness.dispatch({
    type: "session/save-current-preview",
    target: {
      sessionId: topic.id,
      topicId: null
    },
    descriptor: makeDescriptor("untriaged-topic-save")
  } as unknown as ExtensionMessage);

  const signals = harness.state[SIGNALS_STORAGE_KEY] as Signal[];
  assert.equal(response.ok, true);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.sessionId, topic.id);
  assert.equal(signals[0]?.inboxStatus, "unprocessed");
  assert.equal(signals[0]?.topicId, undefined);
});

test("session/save-current-preview stamps an undo handle on the toast only for a newly created item", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState(),
    [TOPICS_STORAGE_KEY]: []
  });

  const first = await harness.dispatch({
    type: "session/save-current-preview",
    target: { sessionId: topic.id, topicId: null },
    descriptor: makeDescriptor("undoable")
  } as unknown as ExtensionMessage);

  assert.equal(first.ok, true);
  const savedItemId = first.snapshot?.global.sessions[0]?.items[0]?.id;
  assert.ok(savedItemId);
  assert.deepEqual(first.snapshot?.tab.lastSavedToast?.undo, { sessionId: topic.id, itemId: savedItemId });

  // Re-saving the same post refreshes the existing row, so it is not undoable.
  const second = await harness.dispatch({
    type: "session/save-current-preview",
    target: { sessionId: topic.id, topicId: null },
    descriptor: makeDescriptor("undoable")
  } as unknown as ExtensionMessage);

  assert.equal(second.ok, true);
  assert.equal(second.snapshot?.global.sessions[0]?.items.length, 1);
  assert.equal(second.snapshot?.tab.lastSavedToast?.undo, undefined);
});

test("session/undo-save removes the saved item, its signal, and its tags", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState(),
    [TOPICS_STORAGE_KEY]: []
  });

  const saved = await harness.dispatch({
    type: "session/save-current-preview",
    target: { sessionId: topic.id, topicId: null },
    descriptor: makeDescriptor("undo-me")
  } as unknown as ExtensionMessage);
  const undo = saved.snapshot?.tab.lastSavedToast?.undo;
  assert.ok(undo);
  assert.equal((harness.state[SIGNALS_STORAGE_KEY] as Signal[]).length, 1);

  const response = await harness.dispatch({
    type: "session/undo-save",
    sessionId: undo.sessionId,
    itemId: undo.itemId
  } as unknown as ExtensionMessage);

  assert.equal(response.ok, true);
  const global = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  assert.equal(global.sessions[0]?.items.length, 0);
  assert.equal((harness.state[SIGNALS_STORAGE_KEY] as Signal[]).length, 0);
  const tabState = harness.state[tabKey] as TabUiState;
  assert.equal(tabState.lastSavedToast, null);
  assert.equal(tabState.activeItemId, null);
});

test("session/undo-save drops the PR evidence row a pr-evidence save wrote", async () => {
  const prSession = makeSession("pr-session", "pr-evidence");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const campaign: PrCampaign = {
    id: "campaign-1",
    sessionId: prSession.id,
    name: "Launch",
    briefText: "",
    criteria: ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => ({ id, label: "" })) as PrCampaign["criteria"],
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z"
  };
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([prSession], prSession.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: prSession.id,
    [tabKey]: createEmptyTabState(),
    [PR_CAMPAIGNS_STORAGE_KEY]: [campaign]
  });

  const saved = await harness.dispatch({
    type: "session/save-current-preview",
    target: { sessionId: prSession.id, topicId: null },
    descriptor: makeDescriptor("pr-undo")
  } as unknown as ExtensionMessage);
  const undo = saved.snapshot?.tab.lastSavedToast?.undo;
  assert.ok(undo);
  assert.equal((harness.state[PR_EVIDENCE_ROWS_STORAGE_KEY] as PrEvidenceRow[]).length, 1);

  const response = await harness.dispatch({
    type: "session/undo-save",
    sessionId: undo.sessionId,
    itemId: undo.itemId
  } as unknown as ExtensionMessage);

  assert.equal(response.ok, true);
  assert.equal((harness.state[PR_EVIDENCE_ROWS_STORAGE_KEY] as PrEvidenceRow[]).length, 0);
  const global = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  assert.equal(global.sessions[0]?.items.length, 0);
});

test("session/undo-save refuses an item that is already gone instead of silently succeeding", async () => {
  const archive = makeSession("archive-session", "archive");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([archive], archive.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: archive.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({
    type: "session/undo-save",
    sessionId: archive.id,
    itemId: "never-saved"
  } as unknown as ExtensionMessage);

  assert.equal(response.ok, false);
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

test("session/queue-item sends the saved ingest token as a bearer header and keeps it out of the URL", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string | null }> = [];
  try {
    const topic = {
      ...makeSession("topic-session", "topic"),
      items: [{ ...createSessionItem(makeDescriptor("queue-remote")), id: "item-queue-remote" }]
    };
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, authorization: headers.get("authorization") });
      const method = String(init?.method || "GET").toUpperCase();
      if (url.endsWith("/capture-target") && method === "POST") {
        return jsonResponse(makeCaptureTargetResponse("queue-remote"));
      }
      if (url.includes("/jobs/job-queue-remote")) {
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
          ingestBaseUrl: "http://100.115.102.41:8000",
          ingestApiToken: "test-token-not-real"
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
      [tabKey]: createEmptyTabState()
    });

    const response = await harness.dispatch({
      type: "session/queue-item",
      requestId: "queue-remote",
      sessionId: topic.id,
      itemId: "item-queue-remote"
    } as ExtensionMessage);

    assert.equal(response.ok, true);
    assert.ok(calls.some((call) => call.url === "http://100.115.102.41:8000/capture-target"));
    assert.ok(calls.every((call) => call.authorization === "Bearer test-token-not-real"));
    assert.ok(calls.every((call) => !call.url.includes("test-token-not-real")));
    const stored = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
    assert.equal(stored.settings.ingestApiToken, "test-token-not-real");
    assert.equal(response.snapshot?.global.settings.ingestApiToken, "");
    assert.equal(response.snapshot?.global.settings.hasIngestApiToken, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("settings/set-ingest-base-url stores a remote origin and token, and a blank draft keeps the token", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const saved = await harness.dispatch({
    type: "settings/set-ingest-base-url",
    value: "http://100.115.102.41:8000/",
    apiToken: " test-token-not-real "
  });
  assert.equal(saved.ok, true);
  const stored = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  assert.equal(stored.settings.ingestBaseUrl, "http://100.115.102.41:8000");
  assert.equal(stored.settings.ingestApiToken, "test-token-not-real");
  assert.equal(saved.snapshot?.global.settings.ingestApiToken, "");

  const kept = await harness.dispatch({
    type: "settings/set-ingest-base-url",
    value: "http://127.0.0.1:8000",
    apiToken: ""
  });
  assert.equal(kept.ok, true);
  const keptState = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  assert.equal(keptState.settings.ingestBaseUrl, "http://127.0.0.1:8000");
  assert.equal(keptState.settings.ingestApiToken, "test-token-not-real");

  const cleared = await harness.dispatch({
    type: "settings/set-ingest-base-url",
    value: "http://127.0.0.1:8000",
    apiToken: "",
    clearApiToken: true
  });
  assert.equal(cleared.ok, true);
  const clearedState = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  assert.equal(clearedState.settings.ingestApiToken, "");

  const rejected = await harness.dispatch({
    type: "settings/set-ingest-base-url",
    value: "javascript:alert(1)"
  });
  assert.equal(rejected.ok, false);
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

test("inline-reading/ensure says when there is no AI key, then runs once and stores a grounded reading", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const base = makeSucceededItem("reading");
    const comments = Array.from({ length: 12 }, (_, i) => ({ comment_id: `c${i}`, author: `fan${i}`, text: `留言 ${i}`, like_count: 12 - i }));
    const item = { ...base, latestCapture: { ...base.latestCapture!, result: { ...base.latestCapture!.result!, comments } } };
    const topic = { ...makeSession("topic-session", "topic"), items: [item] };
    const ensure = { type: "inline-reading/ensure", sessionId: topic.id, itemId: item.id } as ExtensionMessage;
    const seed = (global: ExtensionGlobalState) => ({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: global,
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
      [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState()
    });

    const keyless = await createHarness(seed(makeGlobal([topic], topic.id)));
    const noKey = await keyless.dispatch(ensure);
    assert.ok(noKey.ok);
    assert.equal(noKey.inlineReadingStatus, "no-key");
    assert.equal(keyless.writesFor(INLINE_READINGS_STORAGE_KEY).length, 0);

    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return makeGoogleJsonResponse({
        gist: "大家都覺得門檻太高", find: { stance: "焦慮最多", method: "大量投遞", split: "暫未見明顯分歧", ask: "未見提問" },
        cluster_names: [], methods: [{ name: "大量投遞", fit: "冇人脈", ref: "e1" }], split: { agree: "門檻太高", sides: [] }
      });
    }) as typeof fetch;
    const global = makeGlobal([topic], topic.id);
    const harness = await createHarness(seed({ ...global, settings: { ...global.settings, oneLinerProvider: "google", googleApiKey: "test-google-key" } }));
    const started = await harness.dispatch(ensure);
    assert.ok(started.ok);
    assert.equal(started.inlineReadingStatus, "started");
    const again = await harness.dispatch(ensure);
    assert.ok(again.ok);
    assert.equal(again.inlineReadingStatus, "exists", "one AI run per capture");
    for (let i = 0; i < 50 && normalizeInlineReadingRecords(harness.state[INLINE_READINGS_STORAGE_KEY])[item.id]?.status !== "complete"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const record = normalizeInlineReadingRecords(harness.state[INLINE_READINGS_STORAGE_KEY])[item.id];
    assert.ok(record && record.status === "complete");
    assert.equal(record.captureId, item.latestCapture!.id);
    assert.deepEqual(record.reading.methods.map((m) => [m.name, m.quote.text]), [["大量投遞", "留言 0"]]);
    assert.equal(calls, 1);
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

async function runProductAnalyzeMessage(label: string) {
  const product = {
    ...makeSession(`product-${label}-session`, "product"),
    items: [makeSucceededItem(`product-${label}`)]
  };
  const signal = makeSignal(`product-${label}-signal`, product.id, `item-product-${label}`);
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
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
    requestId: `product-${label}`,
    sessionId: product.id
  } as ExtensionMessage);
  return { harness, response };
}

test("product analysis publishes analysis and projected reading in one storage write", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      makeGoogleJsonResponse(makeProductSignalAnalysisPayload("publication"))) as typeof fetch;
    const { harness, response } = await runProductAnalyzeMessage("publication");

    assert.equal(response.ok, true);
    const resultWrites = harness.writes.filter((keys) =>
      keys.includes(PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY)
      || keys.includes(SIGNAL_READINGS_STORAGE_KEY)
    );
    assert.equal(resultWrites.length, 1);
    assert.equal(resultWrites[0]?.includes(PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY), true);
    assert.equal(resultWrites[0]?.includes(SIGNAL_READINGS_STORAGE_KEY), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normal Product analysis does not call the second reading provider", async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return makeGoogleJsonResponse(makeProductSignalAnalysisPayload("single-provider"));
    }) as typeof fetch;
    const { response } = await runProductAnalyzeMessage("single-provider");

    assert.equal(response.ok, true);
    assert.equal(fetchCalls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a signal deleted while the Product analysis provider runs leaves neither analysis nor reading", async () => {
  const originalFetch = globalThis.fetch;
  let fetchStarted = false;
  let releaseAnalysis: ((response: Response) => void) | null = null;
  const analysisResponse = new Promise<Response>((resolve) => {
    releaseAnalysis = resolve;
  });

  try {
    const item = makeSucceededItem("product-analysis-delete-race");
    const session = {
      ...makeSession("product-analysis-delete-race-session", "product"),
      items: [item]
    };
    const signal = makeSignal("product-analysis-delete-race-signal", session.id, item.id);
    const global = makeGlobal([session], session.id);
    globalThis.fetch = (async () => {
      fetchStarted = true;
      return analysisResponse;
    }) as typeof fetch;
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          oneLinerProvider: "google",
          googleApiKey: "test-google-key"
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: session.id,
      [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState(),
      [PRODUCT_CONTEXT_STORAGE_KEY]: makeProductContext(),
      [SIGNALS_STORAGE_KEY]: [signal]
    });

    const analysisPromise = harness.dispatch({
      type: "product/analyze-signals",
      requestId: "product-analysis-delete-race",
      sessionId: session.id
    } as ExtensionMessage);
    await waitFor(() => fetchStarted, "product analysis provider call");

    const deletion = await harness.dispatch({ type: "signal/delete", signalId: signal.id });
    assert.equal(deletion.ok, true);

    releaseAnalysis?.(makeGoogleJsonResponse(makeProductSignalAnalysisPayload("deleted")));
    const analysis = await analysisPromise;

    assert.equal(analysis.ok, true);
    assert.deepEqual(harness.state[PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY] ?? {}, {});
    assert.deepEqual(harness.state[SIGNAL_READINGS_STORAGE_KEY] ?? {}, {});
  } finally {
    releaseAnalysis?.(makeGoogleJsonResponse(makeProductSignalAnalysisPayload("cleanup")));
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

test("session/queue-item persists a created job even when a newer request superseded it", async () => {
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
    assert.equal(harness.writes.length, 2);

    const storedGlobal = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
    assert.equal(storedGlobal.sessions.find((session) => session.id === oldSession.id)?.items[0]?.status, "queued");
    assert.equal(storedGlobal.sessions.find((session) => session.id === oldSession.id)?.items[0]?.jobId, "job-old");
    assert.equal(storedGlobal.sessions.find((session) => session.id === newSession.id)?.items[0]?.status, "queued");
  } finally {
    globalThis.fetch = originalFetch;
    disablePipelineTraceForTest();
  }
});

test("overlapping queue messages for one item create one backend job", async () => {
  const originalFetch = globalThis.fetch;
  let releaseFirst: ((response: Response) => void) | null = null;
  const firstResponse = new Promise<Response>((resolve) => { releaseFirst = resolve; });
  let capturePosts = 0;
  let drains = 0;
  try {
    const session = {
      ...makeSession("s", "topic"),
      items: [{ ...createSessionItem(makeDescriptor("old")), id: "item-old" }]
    };
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const global = makeGlobal([session], session.id);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.endsWith("/capture-target") && method === "POST") {
        capturePosts += 1;
        return capturePosts === 1 ? firstResponse : jsonResponse(makeCaptureTargetResponse("old"));
      }
      if (url.endsWith("/worker/drain") && method === "POST") { drains += 1; return jsonResponse({ status: "started" }); }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: { ...global, settings: { ...global.settings, ingestBaseUrl: "" } },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: session.id,
      [tabKey]: createEmptyTabState()
    });
    const message = (requestId: string) => ({
      type: "session/queue-items-and-start-processing", requestId, sessionId: session.id, itemIds: ["item-old"]
    }) as ExtensionMessage;
    const first = harness.dispatch(message("q1"));
    await waitFor(() => capturePosts === 1, "first capture-target request");
    const second = harness.dispatch(message("q2"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseFirst?.(jsonResponse(makeCaptureTargetResponse("old")));
    const [a, b] = await Promise.all([first, second]);

    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(capturePosts, 1, "the second overlapping message reuses the first job");
    const stored = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
    assert.equal(stored.sessions[0]?.items[0]?.jobId, "job-old");
    assert.equal(stored.sessions[0]?.items[0]?.status, "queued");
  } finally {
    globalThis.fetch = originalFetch;
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
    assert.equal(harness.writesFor(SIGNAL_READINGS_STORAGE_KEY).length, 1);
    assertStateUpdatedBroadcastOnce(harness);

    const storedAnalyses = harness.state[PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY] as Record<string, unknown>;
    assert.deepEqual(Object.keys(storedAnalyses).toSorted(), ["new-signal"]);
    const storedReadings = harness.state[SIGNAL_READINGS_STORAGE_KEY] as Record<string, { signalId: string }>;
    assert.deepEqual(
      Object.values(storedReadings).map((reading) => reading.signalId),
      ["new-signal"]
    );
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

test("pr/generate-criteria falls back to deterministic criteria and empty narrative settings without a provider", async () => {
  const prSession = makeSession("pr-session", "pr-evidence");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([prSession], prSession.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: prSession.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({
    type: "pr/generate-criteria",
    campaignName: "BoostUP Launch",
    briefText: "A practical social wellness campaign."
  });

  assert.equal(response.ok, true);
  assert.equal(response.prCriteria?.length, 6);
  assert.deepEqual(response.prNarrativeSettings, {
    narrativeAnchor: "",
    targetAudience: "",
    desiredAction: ""
  });
});

test("pr/generate-narrative-read publishes one current read and broadcasts once", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const prSession = {
      ...makeSession("pr-session", "pr-evidence"),
      items: [makeSucceededItem("narrative")]
    };
    const campaign = makePrCampaign("campaign-1", prSession.id);
    const row = makePrEvidenceRow(campaign.id, "item-narrative", "narrative");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return fetchCalls.length === 1
        ? makeGoogleJsonResponse(makePrNarrativeReadingPayload("Current"))
        : makeGoogleJsonResponse(makePrNarrativeSynthesisPayload("Current"));
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

    const response = await harness.dispatch({
      type: "pr/generate-narrative-read",
      requestId: "narrative-current",
      campaignId: campaign.id
    } as ExtensionMessage);
    const hydrated = await harness.dispatch({
      type: "pr/get-narrative-read",
      campaignId: campaign.id
    });

    assert.equal(response.ok, true);
    assert.equal(response.prNarrativeRead?.claims[0]?.title, "Current priority claim");
    assert.equal(response.prNarrativeCurrentSourceHash, response.prNarrativeRead?.sourceHash);
    assert.equal(hydrated.ok, true);
    assert.equal(hydrated.prNarrativeRead?.claims[0]?.title, "Current priority claim");
    assert.equal(hydrated.prNarrativeCurrentSourceHash, response.prNarrativeRead?.sourceHash);
    assert.equal(fetchCalls.length, 2);
    assert.equal(harness.writesFor(PR_NARRATIVE_READS_STORAGE_KEY).length, 1);
    assertStateUpdatedBroadcastOnce(harness);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pr/generate-narrative-read keeps concurrent tab and campaign lanes independent", async () => {
  const originalFetch = globalThis.fetch;
  let releaseFirstReading: ((response: Response) => void) | null = null;
  const firstReadingResponse = new Promise<Response>((resolve) => {
    releaseFirstReading = resolve;
  });
  try {
    const firstSession = {
      ...makeSession("pr-session-a", "pr-evidence"),
      items: [makeSucceededItem("narrative-a")]
    };
    const secondSession = {
      ...makeSession("pr-session-b", "pr-evidence"),
      items: [makeSucceededItem("narrative-b")]
    };
    const firstCampaign = makePrCampaign("campaign-a", firstSession.id);
    const secondCampaign = makePrCampaign("campaign-b", secondSession.id);
    const firstRow = makePrEvidenceRow(firstCampaign.id, "item-narrative-a", "narrative-a");
    const secondRow = makePrEvidenceRow(secondCampaign.id, "item-narrative-b", "narrative-b");
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) return firstReadingResponse;
      if (fetchCount === 2) return makeGoogleJsonResponse(makePrNarrativeReadingPayload("Second"));
      if (fetchCount === 3) return makeGoogleJsonResponse(makePrNarrativeSynthesisPayload("Second"));
      return makeGoogleJsonResponse(makePrNarrativeSynthesisPayload("First"));
    }) as typeof fetch;
    const global = makeGlobal([firstSession, secondSession], firstSession.id);
    const harness = await createHarness({
      [backgroundTestables.GLOBAL_STORAGE_KEY]: {
        ...global,
        settings: {
          ...global.settings,
          oneLinerProvider: "google",
          googleApiKey: "test-google-key"
        }
      },
      [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: firstSession.id,
      [PR_CAMPAIGNS_STORAGE_KEY]: [firstCampaign, secondCampaign],
      [PR_EVIDENCE_ROWS_STORAGE_KEY]: [firstRow, secondRow],
      [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState(),
      [backgroundTestables.tabStorageKey(OTHER_TAB_ID)]: createEmptyTabState()
    });

    const firstResponsePromise = harness.dispatchFrom(TAB_ID, {
      type: "pr/generate-narrative-read",
      requestId: "narrative-tab-a",
      campaignId: firstCampaign.id
    } as ExtensionMessage);
    await waitFor(() => fetchCount === 1, "first tab narrative Stage A");
    const secondResponse = await harness.dispatchFrom(OTHER_TAB_ID, {
      type: "pr/generate-narrative-read",
      requestId: "narrative-tab-b",
      campaignId: secondCampaign.id
    } as ExtensionMessage);
    assert.equal(secondResponse.ok, true);

    assert.notEqual(releaseFirstReading, null);
    releaseFirstReading?.(makeGoogleJsonResponse(makePrNarrativeReadingPayload("First")));
    const firstResponse = await firstResponsePromise;

    assert.equal(firstResponse.ok, true);
    const storedMap = harness.state[PR_NARRATIVE_READS_STORAGE_KEY] as Record<string, { claims: Array<{ title: string }> }>;
    assert.equal(storedMap[firstCampaign.id]?.claims[0]?.title, "First priority claim");
    assert.equal(storedMap[secondCampaign.id]?.claims[0]?.title, "Second priority claim");
    assert.equal(harness.writesFor(PR_NARRATIVE_READS_STORAGE_KEY).length, 2);
    assert.deepEqual(
      harness.tabMessageTargets
        .filter(({ message }) => message.type === "state/updated")
        .map(({ tabId }) => tabId)
        .toSorted((left, right) => left - right),
      [TAB_ID, OTHER_TAB_ID]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pr/generate-narrative-read ignores a superseded narrative-key write", async () => {
  enablePipelineTraceForTest();
  const originalFetch = globalThis.fetch;
  let releaseOldReading: ((response: Response) => void) | null = null;
  const oldReadingResponse = new Promise<Response>((resolve) => {
    releaseOldReading = resolve;
  });
  try {
    const prSession = {
      ...makeSession("pr-session", "pr-evidence"),
      items: [makeSucceededItem("narrative")]
    };
    const campaign = makePrCampaign("campaign-1", prSession.id);
    const row = makePrEvidenceRow(campaign.id, "item-narrative", "narrative");
    const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) return oldReadingResponse;
      if (fetchCount === 2) return makeGoogleJsonResponse(makePrNarrativeReadingPayload("Current"));
      if (fetchCount === 3) return makeGoogleJsonResponse(makePrNarrativeSynthesisPayload("Current"));
      return makeGoogleJsonResponse(makePrNarrativeSynthesisPayload("Superseded"));
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
      type: "pr/generate-narrative-read",
      requestId: "narrative-old",
      campaignId: campaign.id
    } as ExtensionMessage);
    await waitFor(() => fetchCount === 1, "old narrative Stage A");
    const currentResponse = await harness.dispatch({
      type: "pr/generate-narrative-read",
      requestId: "narrative-current",
      campaignId: campaign.id
    } as ExtensionMessage);
    assert.equal(currentResponse.ok, true);

    assert.notEqual(releaseOldReading, null);
    releaseOldReading?.(makeGoogleJsonResponse(makePrNarrativeReadingPayload("Superseded")));
    const oldResponse = await oldResponsePromise;

    assert.equal(oldResponse.ok, true);
    const storedMap = harness.state[PR_NARRATIVE_READS_STORAGE_KEY] as Record<string, { claims: Array<{ title: string }> }>;
    assert.equal(storedMap[campaign.id]?.claims[0]?.title, "Current priority claim");
    assert.equal(harness.writesFor(PR_NARRATIVE_READS_STORAGE_KEY).length, 1);
    assertStateUpdatedBroadcastOnce(harness);
    assert.equal(
      readPipelineTrace().some((event) =>
        event.step === "reconcile.stale-result.ignore"
        && event.requestId === "narrative-old"
      ),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    disablePipelineTraceForTest();
  }
});

test("pr/generate-narrative-read rejects a changed live source before publish", async () => {
  const originalFetch = globalThis.fetch;
  let releaseChangedReading: ((response: Response) => void) | null = null;
  const changedReadingResponse = new Promise<Response>((resolve) => {
    releaseChangedReading = resolve;
  });
  try {
    const prSession = {
      ...makeSession("pr-session", "pr-evidence"),
      items: [makeSucceededItem("narrative")]
    };
    const campaign = makePrCampaign("campaign-1", prSession.id);
    const row = makePrEvidenceRow(campaign.id, "item-narrative", "narrative");
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) return makeGoogleJsonResponse(makePrNarrativeReadingPayload("Previous"));
      if (fetchCount === 2) return makeGoogleJsonResponse(makePrNarrativeSynthesisPayload("Previous"));
      if (fetchCount === 3) return changedReadingResponse;
      return makeGoogleJsonResponse(makePrNarrativeSynthesisPayload("Changed"));
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
      [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState()
    });

    const previousResponse = await harness.dispatch({
      type: "pr/generate-narrative-read",
      requestId: "narrative-previous",
      campaignId: campaign.id
    } as ExtensionMessage);
    assert.equal(previousResponse.ok, true);
    const previousRead = structuredClone(
      (harness.state[PR_NARRATIVE_READS_STORAGE_KEY] as Record<string, unknown>)[campaign.id]
    );
    harness.writes.length = 0;
    harness.tabMessages.length = 0;
    harness.tabMessageTargets.length = 0;

    const changedResponsePromise = harness.dispatch({
      type: "pr/generate-narrative-read",
      requestId: "narrative-changed-source",
      campaignId: campaign.id
    } as ExtensionMessage);
    await waitFor(() => fetchCount === 3, "changed-source narrative Stage A");

    const liveGlobal = structuredClone(harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState);
    const liveItem = liveGlobal.sessions.find((session) => session.id === prSession.id)?.items[0];
    assert.ok(liveItem?.latestCapture?.result);
    liveItem.latestCapture.result.canonical_post = {
      ...liveItem.latestCapture.result.canonical_post,
      text: "Canonical main post changed while narrative generation was running."
    };
    harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] = liveGlobal;

    assert.notEqual(releaseChangedReading, null);
    releaseChangedReading?.(makeGoogleJsonResponse(makePrNarrativeReadingPayload("Changed")));
    const changedResponse = await changedResponsePromise;

    assert.equal(changedResponse.ok, false);
    assert.match(changedResponse.error ?? "", /source.*changed/i);
    assert.deepEqual(
      (harness.state[PR_NARRATIVE_READS_STORAGE_KEY] as Record<string, unknown>)[campaign.id],
      previousRead
    );
    assert.equal(harness.writesFor(PR_NARRATIVE_READS_STORAGE_KEY).length, 0);
    assert.equal(
      harness.tabMessageTargets.filter(({ message }) => message.type === "state/updated").length,
      0
    );
  } finally {
    globalThis.fetch = originalFetch;
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

test("background rejects the retired Product signal-reading synthesis message without side effects", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  const session = makeSession("product-reading-retired", "product");
  const initialState = {
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([session], session.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: session.id,
    [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState(),
    [PRODUCT_CONTEXT_STORAGE_KEY]: makeProductContext(),
    [SIGNALS_STORAGE_KEY]: []
  };

  try {
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("retired Product reading message must not call a provider");
    }) as typeof fetch;
    const harness = await createHarness(initialState);
    const before = structuredClone(harness.state);
    const retiredType = ["product", "synthesize-signal-reading"].join("/");

    const response = await harness.dispatch({
      type: retiredType,
      signalId: "signal-reading-retired",
      sessionId: session.id,
      force: true
    } as unknown as ExtensionMessage);

    assert.deepEqual(response, { ok: false, error: "Unsupported message" });
    assert.equal(fetchCalls, 0);
    assert.deepEqual(harness.state, before);
    assert.equal(harness.writes.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("signal/delete cannot race a reading review into restoring the deleted reading", async () => {
  const item = makeSucceededItem("review-race", "prompt caching");
  const session = {
    ...makeSession("product-review-race", "product"),
    items: [item]
  };
  const signal = makeSignal("signal-review-race", session.id, item.id);
  const cacheKey = `${signal.id}::ctx::pkt::v9`;
  let readingWriteCount = 0;
  let releaseFirstReadingWrite: (() => void) | null = null;
  const firstReadingWriteGate = new Promise<void>((resolve) => {
    releaseFirstReadingWrite = resolve;
  });

  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([session], session.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: session.id,
    [backgroundTestables.tabStorageKey(TAB_ID)]: createEmptyTabState(),
    [SIGNALS_STORAGE_KEY]: [signal],
    [SIGNAL_READINGS_STORAGE_KEY]: {
      [cacheKey]: {
        signalId: signal.id,
        cacheKey,
        productContextHash: "ctx",
        sourcePacketHash: "pkt",
        promptVersion: "v9",
        reading: "existing reading",
        generatedAt: "2026-05-27T00:00:00.000Z",
        model: "google:test",
        sourceRefs: ["e1"],
        sourcePacket: {
          assembledContent: "source",
          postUrl: item.descriptor.post_url,
          representativeComments: [],
          analysisPromptVersion: "v1"
        },
        reviewState: "pending",
        feedbackEvents: []
      }
    }
  }, {
    onSet: async (payload) => {
      if (!(SIGNAL_READINGS_STORAGE_KEY in payload)) {
        return;
      }
      readingWriteCount += 1;
      if (readingWriteCount === 1) {
        await firstReadingWriteGate;
      }
    }
  });

  const reviewPromise = harness.dispatch({
    type: "product/review-signal-reading",
    cacheKey,
    decision: "filed",
    note: "keep"
  });
  await waitFor(() => readingWriteCount === 1, "blocked reading review write");

  const deletionPromise = harness.dispatch({ type: "signal/delete", signalId: signal.id });
  await Promise.race([
    deletionPromise,
    new Promise((resolve) => setTimeout(resolve, 50))
  ]);
  releaseFirstReadingWrite?.();

  const [review, deletion] = await Promise.all([reviewPromise, deletionPromise]);
  assert.equal(review.ok, true);
  assert.equal(deletion.ok, true);
  assert.deepEqual(harness.state[SIGNAL_READINGS_STORAGE_KEY] ?? {}, {});
});

test("signal/delete removes directly owned rows, preserves audit history, and drops tags only for orphan items", async () => {
  const session = {
    ...makeSession("topic-session", "topic"),
    items: [
      makeSucceededItem("one", "prompt caching"),
      makeSucceededItem("two", "prompt caching")
    ]
  };
  session.items[0]!.id = "item-1";
  session.items[1]!.id = "item-2";
  const signals = [
    makeSignal("signal-1", session.id, "item-1", "topic-1"),
    makeSignal("signal-2", session.id, "item-2", "topic-1")
  ];
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([session], session.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: session.id,
    [tabKey]: { ...createEmptyTabState(), activeItemId: "item-1" },
    [SIGNALS_STORAGE_KEY]: signals,
    [TOPICS_STORAGE_KEY]: [makeTopic("topic-1", session.id, ["signal-1", "signal-2"])],
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-1": {
        signalId: "signal-1",
        signalType: "demand",
        signalSubtype: "pain",
        contentType: "mixed",
        contentSummary: "summary 1",
        relevance: 4,
        whyRelevant: "why 1",
        verdict: "watch",
        reason: "reason 1",
        status: "complete",
        productContextHash: "ctx",
        promptVersion: "v1",
        model: "google:test",
        analyzedAt: "2026-05-27T00:00:00.000Z"
      },
      "signal-2": {
        signalId: "signal-2",
        signalType: "demand",
        signalSubtype: "pain",
        contentType: "mixed",
        contentSummary: "summary 2",
        relevance: 4,
        whyRelevant: "why 2",
        verdict: "watch",
        reason: "reason 2",
        status: "complete",
        productContextHash: "ctx",
        promptVersion: "v1",
        model: "google:test",
        analyzedAt: "2026-05-27T00:01:00.000Z"
      }
    },
    [PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY]: [
      { signalId: "signal-1", taskPromptHash: "task-1", feedback: "needs_rewrite", note: "remove me", createdAt: "2026-05-27T00:00:00.000Z" },
      { signalId: "signal-2", taskPromptHash: "task-2", feedback: "adopted", createdAt: "2026-05-27T00:01:00.000Z" }
    ],
    [SIGNAL_READINGS_STORAGE_KEY]: {
      "signal-1::ctx::pkt::v1": {
        signalId: "signal-1",
        cacheKey: "signal-1::ctx::pkt::v1",
        productContextHash: "ctx",
        sourcePacketHash: "pkt",
        promptVersion: "v1",
        reading: "reading 1",
        generatedAt: "2026-05-27T00:00:00.000Z",
        model: "google:test",
        sourceRefs: ["e1"],
        sourcePacket: { assembledContent: "a", postUrl: "https://example.com/1", representativeComments: [], analysisPromptVersion: "v1" },
        reviewState: "pending",
        feedbackEvents: []
      },
      "signal-2::ctx::pkt::v1": {
        signalId: "signal-2",
        cacheKey: "signal-2::ctx::pkt::v1",
        productContextHash: "ctx",
        sourcePacketHash: "pkt",
        promptVersion: "v1",
        reading: "reading 2",
        generatedAt: "2026-05-27T00:01:00.000Z",
        model: "google:test",
        sourceRefs: ["e2"],
        sourcePacket: { assembledContent: "b", postUrl: "https://example.com/2", representativeComments: [], analysisPromptVersion: "v1" },
        reviewState: "pending",
        feedbackEvents: []
      }
    },
    [TOPIC_SIGNAL_READINGS_STORAGE_KEY]: {
      "topic-1::signal-1": {
        signalId: "signal-1",
        topicId: "topic-1",
        status: "complete",
        stance: "central",
        reading: "topic reading 1",
        audienceSignal: "audience 1",
        evidenceRefs: ["e1"],
        uncertainties: [],
        promptVersion: "v1",
        model: "google:test",
        generatedAt: "2026-05-27T00:00:00.000Z"
      },
      "topic-1::signal-2": {
        signalId: "signal-2",
        topicId: "topic-1",
        status: "complete",
        stance: "adjacent",
        reading: "topic reading 2",
        audienceSignal: "audience 2",
        evidenceRefs: ["e2"],
        uncertainties: [],
        promptVersion: "v1",
        model: "google:test",
        generatedAt: "2026-05-27T00:01:00.000Z"
      }
    },
    [SIGNAL_TAGS_STORAGE_KEY]: {
      "item-1": {
        itemId: "item-1",
        status: "complete",
        signalTags: ["prompt caching"],
        signalGist: "gist 1",
        promptVersion: "v1",
        model: "google:test",
        generatedAt: "2026-05-27T00:00:00.000Z"
      },
      "item-2": {
        itemId: "item-2",
        status: "complete",
        signalTags: ["agents"],
        signalGist: "gist 2",
        promptVersion: "v1",
        model: "google:test",
        generatedAt: "2026-05-27T00:01:00.000Z"
      }
    },
    [TOPIC_AUDIT_EVIDENCE_STORAGE_KEY]: { "topic-1": [{ evidenceId: "evidence-1" }] },
    [TOPIC_AUDIT_MEMOS_STORAGE_KEY]: { "topic-1": { memoId: "memo-1" } },
    [TOPIC_AUDIT_REPORTS_STORAGE_KEY]: { "topic-1": { reportId: "report-1" } },
    [TOPIC_AUDIT_EPISODES_STORAGE_KEY]: { "topic-1": [{ episodeId: "episode-1" }] },
    [SAVED_ANALYSES_STORAGE_KEY]: [{ resultId: "result-1", compareKey: "item-1::item-2" }]
  });

  const response = await harness.dispatch({ type: "signal/delete", signalId: "signal-1" });

  assert.equal(response.ok, true);
  assert.deepEqual((harness.state[SIGNALS_STORAGE_KEY] as Signal[]).map((signal) => signal.id), ["signal-2"]);
  assert.deepEqual(Object.keys(harness.state[PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY] as Record<string, unknown>), ["signal-2"]);
  assert.deepEqual((harness.state[PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY] as Array<{ signalId: string }>).map((entry) => entry.signalId), ["signal-2"]);
  assert.deepEqual(Object.values(harness.state[SIGNAL_READINGS_STORAGE_KEY] as Record<string, { signalId: string }>).map((entry) => entry.signalId), ["signal-2"]);
  assert.deepEqual(Object.values(harness.state[TOPIC_SIGNAL_READINGS_STORAGE_KEY] as Record<string, { signalId: string }>).map((entry) => entry.signalId), ["signal-2"]);
  assert.deepEqual(Object.keys(harness.state[SIGNAL_TAGS_STORAGE_KEY] as Record<string, unknown>), ["item-2"]);
  assert.deepEqual(harness.state[TOPIC_AUDIT_EVIDENCE_STORAGE_KEY], { "topic-1": [{ evidenceId: "evidence-1" }] });
  assert.deepEqual(harness.state[TOPIC_AUDIT_MEMOS_STORAGE_KEY], { "topic-1": { memoId: "memo-1" } });
  assert.deepEqual(harness.state[TOPIC_AUDIT_REPORTS_STORAGE_KEY], { "topic-1": { reportId: "report-1" } });
  assert.deepEqual(harness.state[TOPIC_AUDIT_EPISODES_STORAGE_KEY], { "topic-1": [{ episodeId: "episode-1" }] });
  assert.deepEqual(harness.state[SAVED_ANALYSES_STORAGE_KEY], [{ resultId: "result-1", compareKey: "item-1::item-2" }]);
  assert.deepEqual((response.productSignalAnalyses ?? []).map((analysis) => analysis.signalId), ["signal-2"]);
  assertStateUpdatedBroadcastOnce(harness);
});

test("signal/delete keeps shared item tags until the last signal reference disappears", async () => {
  const sharedItem = makeSucceededItem("shared", "prompt caching");
  sharedItem.id = "item-shared";
  const session = {
    ...makeSession("topic-session", "topic"),
    items: [sharedItem]
  };
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([session], session.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: session.id,
    [tabKey]: { ...createEmptyTabState(), activeItemId: "item-shared" },
    [SIGNALS_STORAGE_KEY]: [
      makeSignal("signal-1", session.id, "item-shared", "topic-1"),
      makeSignal("signal-2", session.id, "item-shared", "topic-1")
    ],
    [TOPICS_STORAGE_KEY]: [makeTopic("topic-1", session.id, ["signal-1", "signal-2"])],
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-1": {
        signalId: "signal-1",
        signalType: "demand",
        signalSubtype: "pain",
        contentType: "mixed",
        contentSummary: "summary 1",
        relevance: 4,
        whyRelevant: "why 1",
        verdict: "watch",
        reason: "reason 1",
        status: "complete",
        productContextHash: "ctx",
        promptVersion: "v1",
        model: "google:test",
        analyzedAt: "2026-05-27T00:00:00.000Z"
      },
      "signal-2": {
        signalId: "signal-2",
        signalType: "demand",
        signalSubtype: "pain",
        contentType: "mixed",
        contentSummary: "summary 2",
        relevance: 4,
        whyRelevant: "why 2",
        verdict: "watch",
        reason: "reason 2",
        status: "complete",
        productContextHash: "ctx",
        promptVersion: "v1",
        model: "google:test",
        analyzedAt: "2026-05-27T00:01:00.000Z"
      }
    },
    [SIGNAL_TAGS_STORAGE_KEY]: {
      "item-shared": {
        itemId: "item-shared",
        status: "complete",
        signalTags: ["prompt caching"],
        signalGist: "shared gist",
        promptVersion: "v1",
        model: "google:test",
        generatedAt: "2026-05-27T00:00:00.000Z"
      }
    }
  });

  const response = await harness.dispatch({ type: "signal/delete", signalId: "signal-1" });

  assert.equal(response.ok, true);
  assert.deepEqual((harness.state[SIGNALS_STORAGE_KEY] as Signal[]).map((signal) => signal.id), ["signal-2"]);
  assert.deepEqual(Object.keys(harness.state[SIGNAL_TAGS_STORAGE_KEY] as Record<string, unknown>), ["item-shared"]);
  const global = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  assert.deepEqual(global.sessions[0]?.items.map((item) => item.id), ["item-shared"]);
  assert.deepEqual((response.productSignalAnalyses ?? []).map((analysis) => analysis.signalId), ["signal-2"]);
  assertStateUpdatedBroadcastOnce(harness);
});


test("signal/delete onlyIfOrphan keeps a signal whose backing item landed after the side panel snapshot", async () => {
  const fresh = makeSucceededItem("fresh", "new save");
  fresh.id = "item-fresh";
  const session = { ...makeSession("topic-session", "topic"), items: [fresh] };
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([session], session.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: session.id,
    [tabKey]: createEmptyTabState(),
    [SIGNALS_STORAGE_KEY]: [makeSignal("signal-fresh", session.id, "item-fresh", "topic-1")],
    [TOPICS_STORAGE_KEY]: [makeTopic("topic-1", session.id, ["signal-fresh"])]
  });

  const response = await harness.dispatch({ type: "signal/delete", signalId: "signal-fresh", onlyIfOrphan: true });

  assert.equal(response.ok, true);
  assert.deepEqual((harness.state[SIGNALS_STORAGE_KEY] as Signal[]).map((signal) => signal.id), ["signal-fresh"]);
  assert.deepEqual((response.signals ?? []).map((signal) => signal.id), ["signal-fresh"]);
  const global = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  assert.deepEqual(global.sessions[0]?.items.map((item) => item.id), ["item-fresh"]);
});

test("signal/delete onlyIfOrphan still removes a signal with no backing item", async () => {
  const session = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([session], session.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: session.id,
    [tabKey]: createEmptyTabState(),
    [SIGNALS_STORAGE_KEY]: [makeSignal("signal-orphan", session.id, "item-gone", "topic-1")],
    [TOPICS_STORAGE_KEY]: [makeTopic("topic-1", session.id, ["signal-orphan"])]
  });

  const response = await harness.dispatch({ type: "signal/delete", signalId: "signal-orphan", onlyIfOrphan: true });

  assert.equal(response.ok, true);
  assert.deepEqual(harness.state[SIGNALS_STORAGE_KEY] as Signal[], []);

  // A repeated cleanup for the already-removed signal must not report empty lists the side panel would adopt.
  const repeated = await harness.dispatch({ type: "signal/delete", signalId: "signal-orphan", onlyIfOrphan: true });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.signals, undefined);
  assert.equal(repeated.topics, undefined);
});

test("inline collect picks the newest destination and preserves workspace navigation", async () => {
  const topic = makeSession("topic-active", "topic");
  const older = makeSession("product-old", "product");
  const newer = { ...makeSession("product-new", "product"), updatedAt: "2026-10-06T00:00:00.000Z" };
  const tab = { ...createEmptyTabState(), popupPage: "topic-detail" as const, collectionTopicId: "keep-topic" };
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, older, newer], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [backgroundTestables.tabStorageKey(TAB_ID)]: tab
  });
  const response = await harness.dispatch({ type: "session/inline-collect", action: "save", mode: "product", descriptor: makeDescriptor("inline-newest") } as unknown as ExtensionMessage);
  assert.equal(response.ok, true);
  assert.equal(response.snapshot?.global.sessions.find(s => s.id === newer.id)?.items.length, 1);
  assert.equal(response.snapshot?.global.activeSessionId, topic.id);
  assert.equal(response.snapshot?.tab.popupPage, "topic-detail");
  assert.equal(response.snapshot?.tab.collectionTopicId, "keep-topic");
  assert.equal(response.inlineCollect?.lastMode, "product");
});

test("inline collect creates missing mode destinations and tap remembers mode after removing its final post", async () => {
  const harness = await createHarness({ [backgroundTestables.GLOBAL_STORAGE_KEY]: createEmptyGlobalState() });
  const descriptor = makeDescriptor("inline-created");
  const first = await harness.dispatch({ type: "session/inline-collect", action: "save", mode: "archive", descriptor } as unknown as ExtensionMessage);
  assert.equal(first.ok, true);
  const saved = first.inlineCollect?.saved[0];
  assert.ok(saved);
  assert.equal(saved.sessionName, "收藏整理");
  const removed = await harness.dispatch({ type: "session/inline-collect", action: "remove", descriptor, sessionId: saved.sessionId, itemId: saved.itemId } as unknown as ExtensionMessage);
  assert.equal(removed.ok, true);
  assert.equal(removed.inlineCollect?.lastMode, "archive");
  backgroundTestables.resetBackgroundTestState();
  const tap = await harness.dispatch({ type: "session/inline-collect", action: "save", descriptor: makeDescriptor("inline-tap") } as unknown as ExtensionMessage);
  assert.equal(tap.ok, true);
  assert.equal(tap.inlineCollect?.saved[0]?.mode, "archive");
  assert.equal(tap.snapshot?.global.sessions.length, 1);
});

test("inline collect remove undo restores original item and signal, but a newer save invalidates undo", async () => {
  const topic = makeSession("inline-topic", "topic");
  const harness = await createHarness({ [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id) });
  const descriptor = makeDescriptor("inline-undo");
  const first = await harness.dispatch({ type: "session/inline-collect", action: "save", mode: "topic", descriptor } as unknown as ExtensionMessage);
  assert.equal(first.ok, true);
  const saved = first.inlineCollect?.saved[0];
  assert.ok(saved);
  const originalItem = structuredClone(first.snapshot?.global.sessions[0]?.items[0]);
  const originalSignals = structuredClone(harness.state[SIGNALS_STORAGE_KEY]);
  const remove = () => harness.dispatch({ type: "session/inline-collect", action: "remove", descriptor, sessionId: saved.sessionId, itemId: saved.itemId } as unknown as ExtensionMessage);
  const removed = await remove();
  assert.equal(removed.ok, true);
  assert.ok(removed.inlineCollect?.undoToken);
  assert.deepEqual(harness.state[SIGNALS_STORAGE_KEY], []);
  const undo = await harness.dispatch({ type: "session/inline-collect", action: "undo", token: removed.inlineCollect.undoToken } as unknown as ExtensionMessage);
  assert.equal(undo.ok, true);
  assert.deepEqual(undo.snapshot?.global.sessions[0]?.items[0], originalItem);
  assert.deepEqual(harness.state[SIGNALS_STORAGE_KEY], originalSignals);
  const removedAgain = await remove();
  assert.equal(removedAgain.ok, true);
  assert.ok(removedAgain.inlineCollect?.undoToken);
  await harness.dispatch({ type: "session/inline-collect", action: "save", mode: "archive", descriptor } as unknown as ExtensionMessage);
  const writesBeforeStaleUndo = harness.writes.length;
  const stale = await harness.dispatch({ type: "session/inline-collect", action: "undo", token: removedAgain.inlineCollect.undoToken } as unknown as ExtensionMessage);
  assert.equal(harness.writes.length, writesBeforeStaleUndo, "stale undo must not write any storage");
  assert.equal(stale.ok, true);
  assert.equal(stale.inlineCollect?.changed, false);
  assert.equal(stale.snapshot?.global.sessions.find(s => s.id === topic.id)?.items.length, 0);
});

test("inline collect creates a PR campaign through the existing campaign seam", async () => {
  const harness = await createHarness({ [backgroundTestables.GLOBAL_STORAGE_KEY]: createEmptyGlobalState() });
  const response = await harness.dispatch({ type: "session/inline-collect", action: "save", mode: "pr-evidence", descriptor: makeDescriptor("inline-pr") } as unknown as ExtensionMessage);
  assert.equal(response.ok, true);
  assert.equal(response.inlineCollect?.saved[0]?.mode, "pr-evidence");
  const campaigns = harness.state[PR_CAMPAIGNS_STORAGE_KEY] as PrCampaign[];
  assert.equal(campaigns.length, 1);
  assert.deepEqual(campaigns[0]?.criteria.map(c => c.id), ["c1", "c2", "c3", "c4", "c5", "c6"]);
  assert.equal((harness.state[PR_EVIDENCE_ROWS_STORAGE_KEY] as PrEvidenceRow[]).length, 1);
});

test("inline collect undo preserves another post saved after removal", async () => {
  const topic = makeSession("inline-undo-isolated", "topic");
  const harness = await createHarness({ [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id) });
  const descriptor = makeDescriptor("undo-isolated");
  const first = await harness.dispatch({ type: "session/inline-collect", action: "save", mode: "topic", descriptor });
  assert.equal(first.ok, true);
  const saved = first.inlineCollect?.saved[0];
  assert.ok(saved);
  const removed = await harness.dispatch({ type: "session/inline-collect", action: "remove", descriptor, sessionId: saved.sessionId, itemId: saved.itemId });
  assert.equal(removed.ok, true);
  assert.ok(removed.inlineCollect?.undoToken);
  const another = await harness.dispatch({ type: "session/inline-collect", action: "save", mode: "topic", descriptor: makeDescriptor("other-post") });
  assert.equal(another.ok, true);
  const restored = await harness.dispatch({ type: "session/inline-collect", action: "undo", token: removed.inlineCollect.undoToken });
  assert.equal(restored.ok, true);
  assert.equal(restored.snapshot?.global.sessions[0]?.items.length, 2);
  assert.equal((harness.state[SIGNALS_STORAGE_KEY] as Signal[]).length, 2);
});

test("inline collect undo becomes stale after a legacy preview save of the same post", async () => {
  const topic = makeSession("inline-legacy-undo", "topic");
  const harness = await createHarness({ [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id) });
  const descriptor = makeDescriptor("legacy-stale");
  const first = await harness.dispatch({ type: "session/inline-collect", action: "save", mode: "topic", descriptor });
  assert.equal(first.ok, true);
  const saved = first.inlineCollect?.saved[0];
  assert.ok(saved);
  const removed = await harness.dispatch({ type: "session/inline-collect", action: "remove", descriptor, sessionId: saved.sessionId, itemId: saved.itemId });
  assert.equal(removed.ok, true);
  assert.ok(removed.inlineCollect?.undoToken);
  await harness.dispatch({ type: "session/save-current-preview", target: { sessionId: topic.id, topicId: null }, descriptor });
  const stale = await harness.dispatch({ type: "session/inline-collect", action: "undo", token: removed.inlineCollect.undoToken });
  assert.equal(stale.ok, true);
  assert.equal(stale.inlineCollect?.changed, false);
  assert.equal(stale.snapshot?.global.sessions[0]?.items.length, 1);
});

test("inline collect reuses existing PR campaign without changing its brief or criteria", async () => {
  const pr = makeSession("inline-existing-pr", "pr-evidence");
  const campaign = makePrCampaign("existing-campaign", pr.id);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([pr], pr.id),
    [PR_CAMPAIGNS_STORAGE_KEY]: [campaign]
  });
  const response = await harness.dispatch({ type: "session/inline-collect", action: "save", mode: "pr-evidence", descriptor: makeDescriptor("existing-pr") });
  assert.equal(response.ok, true);
  assert.deepEqual(harness.state[PR_CAMPAIGNS_STORAGE_KEY], [campaign]);
});

test("inline collect snapshot is read-only and ignores malformed persisted last mode", async () => {
  const archive = makeSession("inline-fallback", "archive");
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: { ...makeGlobal([archive], archive.id), lastCollectMode: "invalid" }
  });
  const before = harness.writes.length;
  const response = await harness.dispatch({ type: "session/inline-collect", action: "snapshot" });
  assert.equal(response.ok, true);
  assert.equal(response.inlineCollect?.lastMode, "archive");
  assert.deepEqual(response.inlineCollect?.destinations.map(destination => destination.mode), ["topic", "product", "pr-evidence", "archive"]);
  assert.equal(harness.writes.length, before);
});

test("inline collect treats legacy threads.net and current threads.com URLs as one saved post", async () => {
  const archive = makeSession("inline-host-identity", "archive");
  const legacy = createSessionItem(makeDescriptor("same-post-host"));
  archive.items = [legacy];
  const harness = await createHarness({ [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([archive], archive.id) });
  const descriptor = { ...makeDescriptor("same-post-host"), post_url: "https://www.threads.com/@dlens/post/same-post-host" };
  const saved = await harness.dispatch({ type: "session/inline-collect", action: "save", descriptor, mode: "archive" });
  assert.equal(saved.ok, true);
  assert.equal(saved.snapshot?.global.sessions[0]?.items.length, 1);
  assert.equal(saved.snapshot?.global.sessions[0]?.items[0]?.id, legacy.id);
});

test("inline collect targets the session most recently opened within a mode", async () => {
  const older = makeSession("inline-used-old", "product");
  const newer = { ...makeSession("inline-used-new", "product"), updatedAt: "2026-09-06T00:00:00.000Z" };
  const harness = await createHarness({ [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([older, newer], newer.id) });
  await harness.dispatch({ type: "session/set-active", sessionId: older.id });
  const saved = await harness.dispatch({ type: "session/inline-collect", action: "save", descriptor: makeDescriptor("opened-latest"), mode: "product" });
  assert.equal(saved.ok, true);
  assert.equal(saved.snapshot?.global.sessions.find(session => session.id === older.id)?.items.length, 1);
});

test("inline collect mutation traces preserve requestId for success and error while snapshot reads stay untraced", async () => {
  enablePipelineTraceForTest();
  try {
    const product = makeSession("inline-trace-product", "product");
    const harness = await createHarness({ [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([product], product.id) });
    const snapshot = await harness.dispatch({ type: "session/inline-collect", action: "snapshot", requestId: "inline-snapshot" });
    assert.equal(snapshot.ok, true);
    assert.equal(readPipelineTrace().filter(event => event.step.startsWith("background.session.inline-collect.")).length, 0);
    const success = await harness.dispatch({
      type: "session/inline-collect", action: "save", mode: "product", requestId: "inline-success",
      descriptor: makeDescriptor("inline-traced")
    });
    const failure = await harness.dispatch({
      type: "session/inline-collect", action: "save", mode: "product", requestId: "inline-error",
      descriptor: { ...makeDescriptor("inline-invalid"), post_url: "" }
    });
    assert.equal(success.ok, true);
    assert.equal(failure.ok, false);
    const events = readPipelineTrace().filter(event => event.step.startsWith("background.session.inline-collect."));
    assert.deepEqual(events.map(event => [event.phase, event.step, event.result, event.requestId]), [
      ["signal.saved", "background.session.inline-collect.request", "pending", "inline-success"],
      ["signal.saved", "background.session.inline-collect.response", "ok", "inline-success"],
      ["signal.saved", "background.session.inline-collect.request", "pending", "inline-error"],
      ["signal.saved", "background.session.inline-collect.response", "error", "inline-error"]
    ]);
    assert.deepEqual(events[0].detail, { action: "save", mode: "product" });
    assert.deepEqual(events[1].detail, { action: "save", mode: "product", changed: true });
    assert.deepEqual(events.map(event => event.target), Array.from({ length: 4 }, () => ({ tabId: TAB_ID })));
    assert.match(JSON.stringify(events[3].detail), /Missing post identity/);
  } finally { disablePipelineTraceForTest(); }
});

for (const existing of [false, true]) test(`session/move-to-product preserves capture, drops source signal and keeps navigation (existing=${existing})`, async () => {
  const source = makeSession("audience", "topic");
  const saved = makeSucceededItem("move");
  source.items = [saved];
  const product = makeSession("product", "product");
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal(existing ? [source, product] : [source], source.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: source.id,
    [backgroundTestables.tabStorageKey(TAB_ID)]: { ...createEmptyTabState(), activeItemId: saved.id, currentPreview: saved.descriptor, popupPage: "topics" },
    [SIGNALS_STORAGE_KEY]: [makeSignal("signal-move", source.id, saved.id, "topic-move")],
    [TOPICS_STORAGE_KEY]: [makeTopic("topic-move", source.id, ["signal-move"])]
  });
  const response = await harness.dispatch({ type: "session/move-to-product", sessionId: source.id, itemId: saved.id });
  assert.ok(response.ok);
  const global = response.snapshot!.global;
  assert.equal(global.activeSessionId, source.id);
  assert.equal(global.sessions.find(s => s.id === source.id)!.items.length, 0);
  assert.deepEqual(global.sessions.find(s => s.mode === "product")!.items, [saved]);
  assert.equal(global.sessions.filter(s => s.mode === "product").length, 1);
  assert.equal(response.snapshot!.tab.popupPage, "topics");
  assert.equal(response.snapshot!.tab.activeItemId, null);
  assert.equal(response.snapshot!.tab.currentPreview, null);
  assert.equal((harness.state[SIGNALS_STORAGE_KEY] as Signal[]).some(s => s.id === "signal-move"), false);
  assert.deepEqual((harness.state[TOPICS_STORAGE_KEY] as Topic[])[0].signalIds, []);
});

test("reader triage assign clears a topic and returns the post to 未分流", async () => {
  const source = makeSession("audience", "topic");
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([source], source.id),
    [SIGNALS_STORAGE_KEY]: [makeSignal("s1", source.id, "i1", "t1")],
    [TOPICS_STORAGE_KEY]: [makeTopic("t1", source.id, ["s1"])]
  });
  const response = await harness.dispatch({ type: "signal/triage", signalId: "s1", action: { kind: "assign", topicId: null } });
  assert.ok(response.ok);
  assert.equal(response.signals![0].topicId, undefined);
  assert.equal(response.signals![0].inboxStatus, "unprocessed");
  assert.deepEqual(response.topics![0].signalIds, []);
});

test("move rejects the same post with another ID before dropping its source signal", async () => {
  const source = makeSession("audience", "topic");
  const product = makeSession("product", "product");
  const saved = makeSucceededItem("duplicate");
  source.items = [saved];
  product.items = [{ ...saved, id: "different-id" }];
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([source, product], source.id),
    [SIGNALS_STORAGE_KEY]: [makeSignal("s1", source.id, saved.id)]
  });
  const response = await harness.dispatch({ type: "session/move-to-product", sessionId: source.id, itemId: saved.id });
  assert.equal(response.ok, false);
  assert.equal((harness.state[SIGNALS_STORAGE_KEY] as Signal[])[0].id, "s1");
  assert.equal((harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState).sessions[0].items[0].id, saved.id);
});

test("topic/create persists the optional research question", async () => {
  const source = makeSession("audience", "topic");
  const harness = await createHarness({ [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([source], source.id) });
  const response = await harness.dispatch({ type: "topic/create", sessionId: source.id, name: "Codex", context: { researchQuestion: "額度夠唔夠？" } });
  assert.ok(response.ok);
  assert.equal(response.topics![0].context?.researchQuestion, "額度夠唔夠？");
});

test('deep-reading/run refuses a key gap and single-flights the stored capture', async () => {
  const { DEEP_READINGS_STORAGE_KEY } = await import('../src/compare/deep-reading-storage.ts');
  const topic = makeSession('deep-session', 'topic');
  const saved = createSessionItem(makeDescriptor('deep-post'));
  saved.status = 'succeeded';
  saved.latestCapture = {id:'deep-capture', result:{canonical_post:{author:'op',text:'RAG'},comments:[{comment_id:'q',author:'fan',text:'點樣做？'}]},analysis:{status:'succeeded',clusters:[]}} as any;
  topic.items = [saved];
  const seed = { [backgroundTestables.GLOBAL_STORAGE_KEY]:makeGlobal([topic],topic.id), [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]:topic.id, [backgroundTestables.tabStorageKey(TAB_ID)]:createEmptyTabState() };
  const gapHarness = await createHarness(seed);
  const gap = await gapHarness.dispatch({type:'deep-reading/run',itemId:saved.id});
  assert.equal(gap.ok,false);if(!gap.ok)assert.match(gap.error,/設定未填 Google API key/);
  const global=seed[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  global.settings={...global.settings,oneLinerProvider:'google',googleApiKey:'test-key'};
  const harness = await createHarness(seed);
  const previousFetch=globalThis.fetch;let calls=0;
  const payload={background:'原帖討論方法。留言提出問題。',takeaway:'尚待實證。',terms:[],debates:[],evidence:{strong:[],weak:[]},unanswered:[{question:'點樣做？',refs:['e1']}]};
  globalThis.fetch=async()=>{calls++; await Promise.resolve();return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]}));};
  try {
    const results=await Promise.all([harness.dispatch({type:'deep-reading/run',itemId:saved.id}),harness.dispatch({type:'deep-reading/run',itemId:saved.id})]);
    assert.ok(results.every(r=>r.ok));assert.equal(calls,1);
    const records=harness.state[DEEP_READINGS_STORAGE_KEY] as Record<string,{status:string;captureId:string}>;
    assert.equal(records[saved.id].status,'complete');assert.equal(records[saved.id].captureId,'deep-capture');
  } finally {globalThis.fetch=previousFetch;}
});

test('deep-reading/run finds a product item and single-flights its stored capture', async () => {
  const { DEEP_READINGS_STORAGE_KEY } = await import('../src/compare/deep-reading-storage.ts');
  const topic = makeSession('deep-session', 'product');
  const saved = createSessionItem(makeDescriptor('deep-post'));
  saved.status = 'succeeded';
  saved.latestCapture = {id:'deep-capture', result:{canonical_post:{author:'op',text:'RAG'},comments:[{comment_id:'q',author:'fan',text:'點樣做？'}]},analysis:{status:'succeeded',clusters:[]}} as any;
  topic.items = [saved];
  const seed = { [backgroundTestables.GLOBAL_STORAGE_KEY]:makeGlobal([topic],topic.id), [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]:topic.id, [backgroundTestables.tabStorageKey(TAB_ID)]:createEmptyTabState() };
  const gapHarness = await createHarness(seed);
  const gap = await gapHarness.dispatch({type:'deep-reading/run',itemId:saved.id});
  assert.equal(gap.ok,false);if(!gap.ok)assert.match(gap.error,/設定未填 Google API key/);
  const global=seed[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;
  global.settings={...global.settings,oneLinerProvider:'google',googleApiKey:'test-key'};
  const harness = await createHarness(seed);
  const previousFetch=globalThis.fetch;let calls=0;
  const payload={background:'原帖討論方法。留言提出問題。',takeaway:'尚待實證。',terms:[],debates:[],evidence:{strong:[],weak:[]},unanswered:[{question:'點樣做？',refs:['e1']}]};
  globalThis.fetch=async()=>{calls++; await Promise.resolve();return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]}));};
  try {
    const results=await Promise.all([harness.dispatch({type:'deep-reading/run',itemId:saved.id}),harness.dispatch({type:'deep-reading/run',itemId:saved.id})]);
    assert.ok(results.every(r=>r.ok));assert.equal(calls,1);
    const records=harness.state[DEEP_READINGS_STORAGE_KEY] as Record<string,{status:string;captureId:string}>;
    assert.equal(records[saved.id].status,'complete');assert.equal(records[saved.id].captureId,'deep-capture');
  } finally {globalThis.fetch=previousFetch;}
});
