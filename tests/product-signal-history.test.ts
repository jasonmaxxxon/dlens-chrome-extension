import assert from "node:assert/strict";
import test from "node:test";

import { buildProductAgentTaskPromptHash } from "../src/compare/product-agent-task-feedback.ts";
import {
  buildProductSignalPreferenceExamples,
  findSimilarHistoricalSignals
} from "../src/compare/product-signal-history.ts";
import type { ProductAgentTaskFeedback, ProductSignalAnalysis } from "../src/state/types.ts";

function makeAnalysis(patch: Partial<ProductSignalAnalysis> & Pick<ProductSignalAnalysis, "signalId">): ProductSignalAnalysis {
  const taskPrompt = `You are helping test ${patch.signalId}.`;
  return {
    signalId: patch.signalId,
    signalType: "demand",
    signalSubtype: "pm_document_generation",
    contentType: "discussion_starter",
    contentSummary: `摘要 ${patch.signalId}`,
    relevance: 4,
    relevantTo: ["coreWorkflows"],
    whyRelevant: "對應核心流程。",
    verdict: "try",
    reason: "有具體小實驗。",
    agentTaskSpec: {
      targetAgent: "codex",
      taskTitle: `任務 ${patch.signalId}`,
      taskPrompt,
      requiredContext: ["repo"]
    },
    evidenceRefs: ["e1"],
    productContextHash: "ctx",
    promptVersion: "v4",
    analyzedAt: "2026-04-28T01:00:00.000Z",
    status: "complete",
    ...patch
  };
}

function makeFeedback(
  analysis: ProductSignalAnalysis,
  feedback: ProductAgentTaskFeedback["feedback"],
  createdAt: string
): ProductAgentTaskFeedback {
  return {
    signalId: analysis.signalId,
    taskPromptHash: buildProductAgentTaskPromptHash(analysis.agentTaskSpec?.taskPrompt ?? ""),
    feedback,
    createdAt
  };
}

test("findSimilarHistoricalSignals only returns feedback-backed matching try analyses", () => {
  const current = makeAnalysis({ signalId: "current" });
  const adopted = makeAnalysis({ signalId: "adopted", contentSummary: "PM 文件生成曾被採用。" });
  const noFeedback = makeAnalysis({ signalId: "no_feedback" });
  const differentSubtype = makeAnalysis({ signalId: "different_subtype", signalSubtype: "browser_automation" });
  const noOverlap = makeAnalysis({ signalId: "no_overlap", relevantTo: ["nonGoals"] });
  const watch = makeAnalysis({ signalId: "watch", verdict: "watch", agentTaskSpec: undefined });

  const result = findSimilarHistoricalSignals(current, [
    makeFeedback(adopted, "adopted", "2026-04-28T03:00:00.000Z"),
    makeFeedback(differentSubtype, "adopted", "2026-04-28T04:00:00.000Z"),
    makeFeedback(noOverlap, "adopted", "2026-04-28T05:00:00.000Z"),
    makeFeedback(watch, "adopted", "2026-04-28T06:00:00.000Z")
  ], [current, adopted, noFeedback, differentSubtype, noOverlap, watch]);

  assert.deepEqual(result.map((item) => item.signalId), ["adopted"]);
  assert.equal(result[0]?.contentSummary, "PM 文件生成曾被採用。");
  assert.equal(result[0]?.feedback, "adopted");
});

test("findSimilarHistoricalSignals uses latest feedback per task and orders adopted before newer non-adopted", () => {
  const current = makeAnalysis({ signalId: "current" });
  const adoptedOld = makeAnalysis({ signalId: "adopted_old", relevance: 3 });
  const rewriteNew = makeAnalysis({ signalId: "rewrite_new", relevance: 5 });
  const latestIgnored = makeAnalysis({ signalId: "latest_ignored", relevance: 4 });

  const result = findSimilarHistoricalSignals(current, [
    makeFeedback(latestIgnored, "adopted", "2026-04-28T01:00:00.000Z"),
    makeFeedback(latestIgnored, "ignored", "2026-04-28T07:00:00.000Z"),
    makeFeedback(rewriteNew, "needs_rewrite", "2026-04-28T08:00:00.000Z"),
    makeFeedback(adoptedOld, "adopted", "2026-04-28T02:00:00.000Z")
  ], [current, latestIgnored, rewriteNew, adoptedOld]);

  assert.deepEqual(result.map((item) => [item.signalId, item.feedback]), [
    ["adopted_old", "adopted"],
    ["rewrite_new", "needs_rewrite"],
    ["latest_ignored", "ignored"]
  ]);
});

test("findSimilarHistoricalSignals limits returned history", () => {
  const current = makeAnalysis({ signalId: "current" });
  const candidates = Array.from({ length: 7 }, (_, index) => makeAnalysis({
    signalId: `candidate_${index}`,
    relevance: 5
  }));

  const result = findSimilarHistoricalSignals(
    current,
    candidates.map((analysis, index) => makeFeedback(analysis, "adopted", `2026-04-28T0${index}:00:00.000Z`)),
    [current, ...candidates],
    { limit: 5 }
  );

  assert.equal(result.length, 5);
});

test("buildProductSignalPreferenceExamples keeps latest adopted and rewrite examples only", () => {
  const adopted = makeAnalysis({ signalId: "adopted", contentSummary: "已採用的 release note 任務。" });
  const rewrite = makeAnalysis({ signalId: "rewrite", contentSummary: "需要改寫的 PM 文件任務。" });
  const ignored = makeAnalysis({ signalId: "ignored", contentSummary: "不應進 prompt。" });

  const examples = buildProductSignalPreferenceExamples([
    makeFeedback(adopted, "needs_rewrite", "2026-04-28T01:00:00.000Z"),
    makeFeedback(adopted, "adopted", "2026-04-28T03:00:00.000Z"),
    { ...makeFeedback(rewrite, "needs_rewrite", "2026-04-28T04:00:00.000Z"), note: "補 repo context。" },
    makeFeedback(ignored, "ignored", "2026-04-28T05:00:00.000Z")
  ], [adopted, rewrite, ignored]);

  assert.deepEqual(examples.map((example) => [example.signalId, example.feedback]), [
    ["rewrite", "needs_rewrite"],
    ["adopted", "adopted"]
  ]);
  assert.equal(examples[0]?.note, "補 repo context。");
  assert.equal(examples[1]?.contentSummary, "已採用的 release note 任務。");
});
