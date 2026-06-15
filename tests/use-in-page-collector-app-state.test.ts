import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages.ts";
import type { WorkerStatus } from "../src/state/processing-state.ts";
import type { PrCampaign } from "../src/state/pr-evidence-storage.ts";
import { normalizePrCriteria } from "../src/state/pr-evidence-storage.ts";
import { createRequestReconciler } from "../src/state/request-reconcile.ts";
import { createSessionRecord } from "../src/state/store-helpers.ts";
import { createEmptyTabState, type ExtensionSnapshot } from "../src/state/types.ts";
import { createPrEvidenceResource } from "../src/ui/pr-evidence-resource.ts";
import {
  applyPrGeneratedCriteriaSaveResult,
  applyPrGenerateSummaryResult,
  buildPreviewSaveMessage,
  buildSessionModeChangeMessage,
  resolveOptimisticSession,
  runAnalyzeItemsPipeline,
  shouldClearPrReconciledLoading
} from "../src/ui/useInPageCollectorAppState.ts";

const descriptor = {
  target_type: "post" as const,
  page_url: "https://www.threads.net/search?q=test",
  post_url: "https://www.threads.net/@alpha/post/abc",
  author_hint: "alpha",
  text_snippet: "alpha post",
  time_token_hint: "1h",
  dom_anchor: "card-1",
  engagement: { likes: 10 },
  engagement_present: { likes: true },
  captured_at: "2026-05-22T00:00:00.000Z"
};

function makePrCampaign(id: string, sessionId = "session-pr", label = id): PrCampaign {
  return {
    id,
    sessionId,
    name: `Campaign ${label}`,
    briefText: `Brief ${label}`,
    criteria: normalizePrCriteria([{ label: `Criterion ${label}` }]),
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z"
  };
}

function stalePrDecision(lane: string) {
  const reconciler = createRequestReconciler();
  const token = reconciler.begin({
    lane,
    requestId: `${lane}-old`,
    target: { sessionId: "session-pr", campaignId: "campaign-old" }
  });
  reconciler.begin({
    lane,
    requestId: `${lane}-new`,
    target: { sessionId: "session-pr", campaignId: "campaign-new" }
  });
  return reconciler.complete(token, {
    currentTarget: { sessionId: "session-pr", campaignId: "campaign-new" }
  });
}

function acceptedPrDecision(lane: string) {
  const reconciler = createRequestReconciler();
  const token = reconciler.begin({
    lane,
    requestId: `${lane}-accepted`,
    target: { sessionId: "session-pr", campaignId: "campaign-new" }
  });
  return reconciler.complete(token, {
    currentTarget: { sessionId: "session-pr", campaignId: "campaign-new" }
  });
}

test("buildPreviewSaveMessage sends the visible preview descriptor with the topic target", () => {
  const message = buildPreviewSaveMessage({
    activeFolderMode: "topic",
    sessionId: "session-topic",
    selectedTopicId: "topic-love",
    collectionTopicId: "topic-work",
    preview: descriptor
  });

  assert.equal(message?.type, "session/save-current-preview");
  assert.deepEqual(message?.target, {
    sessionId: "session-topic",
    topicId: "topic-love"
  });
  assert.deepEqual(message?.descriptor, descriptor);
});

test("buildPreviewSaveMessage refuses to create a save message without an explicit session target", () => {
  const message = buildPreviewSaveMessage({
    activeFolderMode: "topic",
    sessionId: null,
    selectedTopicId: "topic-love",
    collectionTopicId: "topic-work",
    preview: descriptor
  });

  assert.equal(message, null);
});

test("popup save paths emit typed collect-save pipeline events for both button and keyboard channels", () => {
  const source = readFileSync(new URL("../src/ui/useInPageCollectorAppState.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /markQaTrace\("popup\.collect\.save\./);
  assert.match(source, /phase:\s*"preview\.confirmed"/);
  assert.match(source, /phase:\s*"signal\.saved"/);
  assert.match(source, /via: "button"/);
  assert.match(source, /via: "keyboard"/);
});

test("active-folder workspace switches pass the target session id through the topic state path", () => {
  const source = readFileSync(new URL("../src/ui/useInPageCollectorAppState.ts", import.meta.url), "utf8");

  assert.match(source, /topicState\.onSessionModeChange\(mode,\s*targetSession\?\.id/);
});

test("resolveOptimisticSession returns an existing target-mode session without mutating active session", () => {
  const productSession = createSessionRecord("Product workspace", "2026-05-27T00:00:00.000Z", "product");
  const prSession = createSessionRecord("PR Evidence workspace", "2026-05-27T00:00:00.000Z", "pr-evidence");
  const snapshot: ExtensionSnapshot = {
    global: {
      version: 1,
      sessions: [productSession, prSession],
      activeSessionId: productSession.id,
      settings: { ingestBaseUrl: "http://127.0.0.1:8000" },
      updatedAt: "2026-05-27T00:00:00.000Z"
    },
    tab: createEmptyTabState()
  };

  assert.equal(resolveOptimisticSession(snapshot, "pr-evidence")?.id, prSession.id);
  assert.equal(resolveOptimisticSession(snapshot, "topic"), null);
  assert.equal(snapshot.global.activeSessionId, productSession.id);
});

test("buildSessionModeChangeMessage realigns to an existing product session when active session drifted null", () => {
  const productSession = createSessionRecord("Product workspace", "2026-05-27T00:00:00.000Z", "product");
  const topicSession = createSessionRecord("Topic workspace", "2026-05-27T00:00:00.000Z", "topic");
  const snapshot: ExtensionSnapshot = {
    global: {
      version: 1,
      sessions: [topicSession, productSession],
      activeSessionId: null,
      settings: { ingestBaseUrl: "http://127.0.0.1:8000" },
      updatedAt: "2026-05-27T00:00:00.000Z"
    },
    tab: createEmptyTabState()
  };

  const message = buildSessionModeChangeMessage(snapshot, "product");

  assert.deepEqual(message, {
    type: "session/set-mode",
    sessionId: productSession.id,
    mode: "product"
  });
});

test("applyPrGenerateSummaryResult ignores stale summary and leaves newer loading pending", () => {
  const stale = stalePrDecision("pr.generateSummary");
  const current = {
    ...createPrEvidenceResource("session-pr"),
    summary: "new campaign summary",
    notice: ""
  };

  const next = applyPrGenerateSummaryResult(
    current,
    { ok: true, prSummary: "old campaign summary" } as ExtensionResponse,
    stale
  );

  assert.equal(stale.accepted, false);
  assert.deepEqual(next, current);
  assert.equal(shouldClearPrReconciledLoading(stale), false);

  const accepted = acceptedPrDecision("pr.generateSummary");
  const applied = applyPrGenerateSummaryResult(
    current,
    { ok: true, prSummary: "accepted campaign summary" } as ExtensionResponse,
    accepted
  );

  assert.equal(shouldClearPrReconciledLoading(accepted), true);
  assert.equal(applied.summary, "accepted campaign summary");
  assert.equal(applied.notice, "");
});

test("applyPrGeneratedCriteriaSaveResult ignores stale generated criteria save results", () => {
  const stale = stalePrDecision("pr.saveGeneratedCriteria");
  const current = {
    ...createPrEvidenceResource("session-pr"),
    campaign: {
      ...createPrEvidenceResource("session-pr").campaign,
      ...makePrCampaign("campaign-new")
    },
    setupCollapsed: false,
    notice: ""
  };

  const next = applyPrGeneratedCriteriaSaveResult(
    current,
    { ok: true, prCampaigns: [makePrCampaign("campaign-old")] } as ExtensionResponse,
    stale
  );

  assert.equal(stale.accepted, false);
  assert.deepEqual(next, current);
  assert.equal(shouldClearPrReconciledLoading(stale), false);

  const accepted = acceptedPrDecision("pr.saveGeneratedCriteria");
  const applied = applyPrGeneratedCriteriaSaveResult(
    current,
    { ok: true, prCampaigns: [makePrCampaign("campaign-new", "session-pr", "accepted")] } as ExtensionResponse,
    accepted
  );

  assert.equal(shouldClearPrReconciledLoading(accepted), true);
  assert.equal(applied.campaign.id, "campaign-new");
  assert.equal(applied.campaign.name, "Campaign accepted");
  assert.equal(applied.setupCollapsed, true);
  assert.equal(applied.notice, "條件已生成並儲存；批次判斷會使用這六個標籤。");
});

test("runAnalyzeItemsPipeline queues selected items then starts worker and refreshes", async () => {
  const calls: ExtensionMessage[] = [];
  const statuses: WorkerStatus[] = [];
  const toasts: string[] = [];
  const sendAndSync = async <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage): Promise<T> => {
    calls.push(message);
    if (message.type === "session/queue-items-and-start-processing") {
      return { ok: true, queuedItemIds: message.itemIds, failedItemIds: [], processingStatus: "started" } as T;
    }
    if (message.type === "session/refresh-all") {
      return { ok: true } as T;
    }
    return { ok: false, error: `unexpected ${message.type}` } as T;
  };

  const result = await runAnalyzeItemsPipeline({
    folderId: "folder-1",
    itemIds: ["a", "b"],
    sendAndSync,
    setWorkerStatus: (status) => statuses.push(status),
    setDisplayToast: (toast) => toasts.push(toast.message)
  });

  assert.deepEqual(calls.map((call) => call.type), [
    "session/queue-items-and-start-processing",
    "session/refresh-all"
  ]);
  assert.equal((calls[0] as Extract<ExtensionMessage, { type: "session/queue-items-and-start-processing" }>).sessionId, "folder-1");
  assert.deepEqual((calls[0] as Extract<ExtensionMessage, { type: "session/queue-items-and-start-processing" }>).itemIds, ["a", "b"]);
  assert.deepEqual((calls[1] as Extract<ExtensionMessage, { type: "session/refresh-all" }>).target, { sessionId: "folder-1" });
  assert.deepEqual(statuses, ["draining"]);
  assert.deepEqual(result, { ok: true, failedCount: 0 });
  assert.match(toasts.at(-1) ?? "", /開始分析 2 篇/);
});

test("runAnalyzeItemsPipeline stops before worker start when queue fails", async () => {
  const calls: ExtensionMessage[] = [];
  const sendAndSync = async <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage): Promise<T> => {
    calls.push(message);
    return { ok: false, error: "queue failed" } as T;
  };

  const result = await runAnalyzeItemsPipeline({
    folderId: "folder-1",
    itemIds: ["a", "b"],
    sendAndSync,
    setWorkerStatus: () => undefined,
    setDisplayToast: () => undefined
  });

  assert.deepEqual(calls.map((call) => call.type), ["session/queue-items-and-start-processing"]);
  assert.deepEqual(result, { ok: false, failedCount: 2 });
});
