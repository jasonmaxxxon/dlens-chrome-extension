import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildReconcileIgnoredEvent,
  buildRequestReconcileTargetKey,
  createRequestReconciler
} from "../src/state/request-reconcile.ts";

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("request reconcile target keys are deterministic and omit empty fields", () => {
  assert.equal(
    buildRequestReconcileTargetKey({
      itemBId: "item-b",
      sessionId: "session-1",
      itemAId: "item-a",
      unused: null,
      empty: undefined
    }),
    "itemAId:item-a|itemBId:item-b|sessionId:session-1"
  );
});

test("request reconciler accepts the latest response for the same lane and target", () => {
  const reconciler = createRequestReconciler();
  const token = reconciler.begin({
    lane: "compare.fetchBrief",
    requestId: "request-1",
    target: { sessionId: "session-1", itemAId: "item-a", itemBId: "item-b" }
  });

  assert.deepEqual(
    reconciler.complete(token, {
      currentTarget: { sessionId: "session-1", itemAId: "item-a", itemBId: "item-b" }
    }),
    { accepted: true }
  );
});

test("request reconciler can check the latest request repeatedly without consuming it", () => {
  const reconciler = createRequestReconciler();
  const token = reconciler.begin({
    lane: "background.session.refresh-all",
    requestId: "request-1",
    target: { sessionId: "session-1", tabId: 1 }
  });

  assert.deepEqual(
    reconciler.check(token, {
      currentTarget: { sessionId: "session-1", tabId: 1 }
    }),
    { accepted: true }
  );
  assert.deepEqual(
    reconciler.check(token, {
      currentTarget: { sessionId: "session-1", tabId: 1 }
    }),
    { accepted: true }
  );
  assert.deepEqual(
    reconciler.complete(token, {
      currentTarget: { sessionId: "session-1", tabId: 1 }
    }),
    { accepted: true }
  );
});

test("request reconciler rejects an older response after a newer request starts in the same lane", () => {
  const reconciler = createRequestReconciler();
  const stale = reconciler.begin({
    lane: "compare.fetchBrief",
    requestId: "request-old",
    target: { sessionId: "session-1", itemAId: "item-a", itemBId: "item-b" }
  });
  reconciler.begin({
    lane: "compare.fetchBrief",
    requestId: "request-new",
    target: { sessionId: "session-1", itemAId: "item-c", itemBId: "item-d" }
  });

  const decision = reconciler.complete(stale, {
    currentTarget: { sessionId: "session-1", itemAId: "item-c", itemBId: "item-d" }
  });

  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, "stale-request");
  assert.equal(decision.latestRequestId, "request-new");
});

test("request reconciler rejects a response whose target is no longer current", () => {
  const reconciler = createRequestReconciler();
  const token = reconciler.begin({
    lane: "product.analyze",
    requestId: "request-1",
    target: { sessionId: "session-old" }
  });

  const decision = reconciler.complete(token, {
    currentTarget: { sessionId: "session-new" }
  });

  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, "target-mismatch");
  assert.equal(decision.expectedTargetKey, "sessionId:session-old");
  assert.equal(decision.currentTargetKey, "sessionId:session-new");
});

test("ignored reconcile decisions project to a trace event without extra side effects", () => {
  const reconciler = createRequestReconciler();
  const token = reconciler.begin({
    lane: "pr.matchCriteria",
    requestId: "request-1",
    target: { sessionId: "session-pr", campaignId: "campaign-old" }
  });
  const decision = reconciler.complete(token, {
    currentTarget: { sessionId: "session-pr", campaignId: "campaign-new" }
  });

  const event = buildReconcileIgnoredEvent(token, decision);

  assert.equal(event.phase, "ui.ready");
  assert.equal(event.step, "reconcile.stale-result.ignore");
  assert.equal(event.result, "ok");
  assert.equal(event.requestId, "request-1");
  assert.deepEqual(event.target, { sessionId: "session-pr" });
  assert.deepEqual(event.detail, {
    lane: "pr.matchCriteria",
    reason: "target-mismatch",
    expectedTargetKey: "campaignId:campaign-old|sessionId:session-pr",
    currentTargetKey: "campaignId:campaign-new|sessionId:session-pr",
    latestRequestId: null
  });
});

test("reconcile guard is wired into current async response write paths", () => {
  const controller = readRepoFile("src/ui/controller.tsx");
  assert.match(controller, /snapshotReconcilerRef/);
  assert.match(controller, /buildSnapshotReconcileDescriptor/);
  assert.match(controller, /buildReconcileIgnoredEvent/);

  const resultWorkspace = readRepoFile("src/ui/InPageCollectorResultWorkspace.tsx");
  for (const lane of [
    "compare.fetchBrief",
    "compare.fetchClusterSummaries",
    "compare.fetchEvidenceAnnotations"
  ]) {
    assert.match(resultWorkspace, new RegExp(lane.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(resultWorkspace, /shouldApplyResponse\(token\)/);

  const appState = readRepoFile("src/ui/useInPageCollectorAppState.ts");
  for (const lane of [
    "product.analyzeSignals",
    "product.synthesizeSignalReading",
    "folder.generateSynthesis",
    "folder.clearSynthesis",
    "pr.generateCriteria",
    "pr.matchCriteria",
    "pr.fetchAdvancedMetrics",
    "pr.generateSummary"
  ]) {
    assert.match(appState, new RegExp(lane.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(appState, /settleReconciledResponse\(token/);

  const background = readRepoFile("entrypoints/background.ts");
  assert.match(background, /beginBackgroundSnapshotReconcile/);
  assert.match(background, /shouldPersistSnapshot/);
  assert.match(background, /reconcileToken/);
  assert.match(background, /background\.session\.refresh-all/);
  assert.match(background, /background\.session\.queue-items-and-start-processing/);
});
