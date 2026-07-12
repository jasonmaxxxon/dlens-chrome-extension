import assert from "node:assert/strict";
import test from "node:test";

import type { CompareBrief } from "../src/compare/brief.ts";
import type { ClusterInterpretation } from "../src/compare/cluster-interpretation.ts";
import type { EvidenceAnnotation } from "../src/compare/evidence-annotation.ts";
import type { EvidencePacket, TopicAuditEpisode, TopicAuditReport } from "../src/compare/topic-audit.ts";
import type { ExtensionResponse } from "../src/state/messages.ts";
import { createRequestReconciler, type RequestReconcileTarget } from "../src/state/request-reconcile.ts";
import type { SavedAnalysisSnapshot } from "../src/state/types.ts";
import type { TopicAuditValidationFlag } from "../src/compare/topic-audit-validator.ts";
import type { TopicAuditMemoBundle } from "../src/state/topic-audit-storage.ts";
import {
  applyCompareBriefResult,
  applyCompareClusterSummariesResult,
  applyCompareEvidenceAnnotationsResult
} from "../src/ui/InPageCollectorResultWorkspace.tsx";
import {
  applyJudgmentStartResult,
  shouldClearJudgmentLoading
} from "../src/ui/useResultSurfaceState.ts";
import {
  applyTopicAuditP1Result,
  applyTopicAuditRunResult,
  invalidateTopicAuditPublication,
  shouldClearTopicAuditP1Running,
  shouldClearTopicAuditRunState
} from "../src/ui/useTopicAudit.ts";
import type { CompareFetchedState } from "../src/viewmodel/compare.ts";

function staleDecision(lane: string, oldTarget: RequestReconcileTarget, newTarget: RequestReconcileTarget) {
  const reconciler = createRequestReconciler();
  const oldToken = reconciler.begin({
    lane,
    requestId: `${lane}-old`,
    target: oldTarget
  });
  reconciler.begin({
    lane,
    requestId: `${lane}-new`,
    target: newTarget
  });
  return reconciler.complete(oldToken, { currentTarget: newTarget });
}

function acceptedDecision(lane: string, target: RequestReconcileTarget) {
  const reconciler = createRequestReconciler();
  const token = reconciler.begin({
    lane,
    requestId: `${lane}-accepted`,
    target
  });
  return reconciler.complete(token, { currentTarget: target });
}

function makeAuditLoaded(signalId: string) {
  return {
    evidence: [{ signalId } as EvidencePacket],
    memos: null,
    report: { generatedFrom: [`${signalId}:p1`] } as TopicAuditReport,
    episodes: [{ id: `episode-${signalId}` } as TopicAuditEpisode],
    flags: []
  };
}

function makeAuditResponse(signalId: string): ExtensionResponse {
  return {
    ok: true,
    auditEvidence: [{ signalId } as EvidencePacket],
    auditMemos: { signalReadings: [{ signalId }], lensMemos: [] } as TopicAuditMemoBundle,
    auditReport: { generatedFrom: [`${signalId}:p1`] } as TopicAuditReport,
    auditEpisodes: [{ id: `episode-${signalId}` } as TopicAuditEpisode],
    auditValidatorFlags: [{ id: `${signalId}-flag` } as TopicAuditValidationFlag]
  } as ExtensionResponse;
}

function makeSavedAnalysis(resultId: string, recommendation: string | null = null): SavedAnalysisSnapshot {
  return {
    resultId,
    compareKey: `${resultId}-a::${resultId}-b`,
    itemAId: `${resultId}-a`,
    itemBId: `${resultId}-b`,
    sourceLabelA: "@a",
    sourceLabelB: "@b",
    headline: `Headline ${resultId}`,
    deck: "deck",
    primaryTensionSummary: "summary",
    groupSummary: "group",
    totalComments: 10,
    dateRangeLabel: "today",
    savedAt: "2026-06-15T00:00:00.000Z",
    analysisVersion: "v1",
    briefVersion: "v8",
    briefSource: "ai",
    judgmentResult: recommendation ? { recommendedState: recommendation } as SavedAnalysisSnapshot["judgmentResult"] : null,
    judgmentVersion: recommendation ? "v1" : null,
    judgmentSource: recommendation ? "ai" : "missing"
  };
}

function makeBrief(headline: string): CompareBrief {
  return {
    source: "ai",
    headline,
    relation: "A differs from B",
    supportingObservations: [],
    aReading: "A",
    bReading: "B",
    whyItMatters: "It changes the choice.",
    creatorCue: "Use the stronger signal.",
    keywords: ["signal"],
    audienceAlignmentLeft: "left",
    audienceAlignmentRight: "right",
    confidence: "medium"
  };
}

function makeFetched(): CompareFetchedState {
  return {
    brief: makeBrief("new headline"),
    briefState: "ready",
    clusterInterpretations: [{ clusterKey: 1, oneLiner: "new cluster" } as ClusterInterpretation],
    clusterSummaryState: "ready",
    evidenceAnnotations: [{ ref: "new-ref" } as EvidenceAnnotation]
  };
}

test("topic audit stale run and P1 responses do not adopt old audit state or clear newer loading", () => {
  const current = {
    "topic-old": makeAuditLoaded("previous")
  };
  const runStale = staleDecision(
    "topic.audit.run:topic-old",
    { sessionId: "session-1", topicId: "topic-old" },
    { sessionId: "session-2", topicId: "topic-new" }
  );

  assert.deepEqual(
    applyTopicAuditRunResult(current, "topic-old", makeAuditResponse("old-run"), runStale),
    current
  );
  assert.equal(shouldClearTopicAuditRunState(runStale), false);

  const p1Stale = staleDecision(
    "topic.audit.p1:topic-old:signal-1",
    { sessionId: "session-1", topicId: "topic-old", signalId: "signal-1" },
    { sessionId: "session-1", topicId: "topic-old", signalId: "signal-1" }
  );

  assert.deepEqual(
    applyTopicAuditP1Result(current, "topic-old", makeAuditResponse("old-p1"), p1Stale),
    current
  );
  assert.equal(shouldClearTopicAuditP1Running(p1Stale), false);

  const accepted = acceptedDecision("topic.audit.run:topic-old", { sessionId: "session-1", topicId: "topic-old" });
  const acceptedNext = applyTopicAuditRunResult(current, "topic-old", makeAuditResponse("accepted-run"), accepted);
  assert.equal(acceptedNext["topic-old"]?.evidence[0]?.signalId, "accepted-run");
  assert.equal(acceptedNext["topic-old"]?.episodes[0]?.id, "episode-accepted-run");

  const acceptedP1 = acceptedDecision("topic.audit.p1:topic-old:signal-1", {
    sessionId: "session-1",
    topicId: "topic-old",
    signalId: "signal-1"
  });
  const p1Next = applyTopicAuditP1Result(current, "topic-old", makeAuditResponse("accepted-p1"), acceptedP1);
  assert.equal(p1Next["topic-old"]?.episodes[0]?.id, "episode-previous");
  assert.equal(p1Next["topic-old"]?.report, null);
  assert.deepEqual(p1Next["topic-old"]?.flags, []);

  const failedP1Next = invalidateTopicAuditPublication(current, "topic-old");
  assert.equal(failedP1Next["topic-old"]?.report, null);
  assert.equal(failedP1Next["topic-old"]?.episodes[0]?.id, "episode-previous");
  assert.deepEqual(failedP1Next["topic-old"]?.flags, []);
});

test("judgment stale responses do not adopt old saved analyses or clear newer loading", () => {
  const oldAnalysis = makeSavedAnalysis("old-result");
  const newAnalysis = makeSavedAnalysis("new-result", "act");
  const current = [newAnalysis, oldAnalysis];
  const stale = staleDecision(
    "judgment.start",
    { resultId: "old-result" },
    { resultId: "new-result" }
  );

  const next = applyJudgmentStartResult(
    current,
    { ok: true, savedAnalyses: [makeSavedAnalysis("old-result", "ignore"), newAnalysis] } as ExtensionResponse,
    stale
  );

  assert.deepEqual(next, current);
  assert.equal(shouldClearJudgmentLoading(stale), false);

  const accepted = acceptedDecision("judgment.start", { resultId: "new-result" });
  const acceptedNext = applyJudgmentStartResult(
    current,
    { ok: true, savedAnalyses: [makeSavedAnalysis("new-result", "act"), oldAnalysis] } as ExtensionResponse,
    accepted
  );
  assert.equal(acceptedNext.find((entry) => entry.resultId === "new-result")?.judgmentResult?.recommendedState, "act");
});

test("compare stale async responses keep the newer fetched state for all three lanes", () => {
  const current = makeFetched();
  const target = { sessionId: "session-1", itemAId: "a", itemBId: "b" };
  const nextTarget = { sessionId: "session-1", itemAId: "c", itemBId: "d" };

  assert.deepEqual(
    applyCompareBriefResult(
      current,
      { ok: true, compareBrief: makeBrief("old headline") } as ExtensionResponse,
      staleDecision("compare.fetchBrief", target, nextTarget)
    ),
    current
  );
  assert.deepEqual(
    applyCompareClusterSummariesResult(
      current,
      { ok: true, clusterInterpretations: [{ clusterKey: 2, oneLiner: "old cluster" }] } as ExtensionResponse,
      staleDecision("compare.fetchClusterSummaries", target, nextTarget)
    ),
    current
  );
  assert.deepEqual(
    applyCompareEvidenceAnnotationsResult(
      current,
      { ok: true, evidenceAnnotations: [{ ref: "old-ref" }] } as ExtensionResponse,
      staleDecision("compare.fetchEvidenceAnnotations", target, nextTarget)
    ),
    current
  );

  const accepted = acceptedDecision("compare.fetchBrief", target);
  const acceptedNext = applyCompareBriefResult(
    current,
    { ok: true, compareBrief: makeBrief("accepted headline") } as ExtensionResponse,
    accepted
  );
  assert.equal(acceptedNext.brief?.headline, "accepted headline");
  assert.equal(acceptedNext.briefState, "ready");
});
