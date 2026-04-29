import { buildProductAgentTaskPromptHash } from "./product-agent-task-feedback";
import type { ProductAgentTaskFeedback, ProductSignalAnalysis } from "../state/types";

export interface SimilarHistoricalSignal {
  signalId: string;
  contentSummary: string;
  signalSubtype: string;
  feedback: ProductAgentTaskFeedback["feedback"];
  createdAt: string;
  relevance: ProductSignalAnalysis["relevance"];
}

export interface ProductSignalPreferenceExample {
  signalId: string;
  signalSubtype: string;
  contentSummary: string;
  feedback: "adopted" | "needs_rewrite";
  taskTitle?: string;
  taskPrompt: string;
  note?: string;
  createdAt: string;
}

interface SimilarHistoryOptions {
  limit?: number;
}

const FEEDBACK_RANK: Record<ProductAgentTaskFeedback["feedback"], number> = {
  adopted: 3,
  needs_rewrite: 2,
  irrelevant: 1,
  ignored: 0
};

function relevantToSet(analysis: ProductSignalAnalysis): Set<string> {
  return new Set(Array.isArray(analysis.relevantTo) ? analysis.relevantTo : []);
}

function hasRelevantOverlap(current: ProductSignalAnalysis, candidate: ProductSignalAnalysis): boolean {
  const currentFields = relevantToSet(current);
  if (!currentFields.size) {
    return false;
  }
  for (const field of relevantToSet(candidate)) {
    if (currentFields.has(field)) {
      return true;
    }
  }
  return false;
}

function latestFeedbackBySignalAndTask(feedbacks: ProductAgentTaskFeedback[]): Map<string, ProductAgentTaskFeedback> {
  const latest = new Map<string, ProductAgentTaskFeedback>();
  for (const feedback of feedbacks) {
    const key = `${feedback.signalId}:${feedback.taskPromptHash}`;
    const existing = latest.get(key);
    if (!existing || feedback.createdAt.localeCompare(existing.createdAt) > 0) {
      latest.set(key, feedback);
    }
  }
  return latest;
}

export function findSimilarHistoricalSignals(
  current: ProductSignalAnalysis,
  allFeedback: ProductAgentTaskFeedback[],
  allAnalyses: ProductSignalAnalysis[],
  options: SimilarHistoryOptions = {}
): SimilarHistoricalSignal[] {
  if (current.verdict !== "try" || !current.agentTaskSpec) {
    return [];
  }

  const limit = Math.max(0, options.limit ?? 5);
  if (!limit) {
    return [];
  }

  const feedbackBySignalAndTask = latestFeedbackBySignalAndTask(allFeedback);

  return allAnalyses
    .filter((candidate) =>
      candidate.signalId !== current.signalId
      && candidate.verdict === "try"
      && Boolean(candidate.agentTaskSpec)
      && candidate.signalSubtype === current.signalSubtype
      && hasRelevantOverlap(current, candidate)
    )
    .map((candidate) => {
      const taskPromptHash = buildProductAgentTaskPromptHash(candidate.agentTaskSpec?.taskPrompt ?? "");
      const feedback = feedbackBySignalAndTask.get(`${candidate.signalId}:${taskPromptHash}`);
      if (!feedback) {
        return null;
      }
      return {
        signalId: candidate.signalId,
        contentSummary: candidate.contentSummary,
        signalSubtype: candidate.signalSubtype,
        feedback: feedback.feedback,
        createdAt: feedback.createdAt,
        relevance: candidate.relevance
      };
    })
    .filter((item): item is SimilarHistoricalSignal => item !== null)
    .sort((left, right) => {
      const feedbackDelta = FEEDBACK_RANK[right.feedback] - FEEDBACK_RANK[left.feedback];
      if (feedbackDelta !== 0) {
        return feedbackDelta;
      }
      const timeDelta = right.createdAt.localeCompare(left.createdAt);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return right.relevance - left.relevance;
    })
    .slice(0, limit);
}

export function buildProductSignalPreferenceExamples(
  allFeedback: ProductAgentTaskFeedback[],
  allAnalyses: ProductSignalAnalysis[],
  options: SimilarHistoryOptions = {}
): ProductSignalPreferenceExample[] {
  const limit = Math.max(0, options.limit ?? 3);
  if (!limit) {
    return [];
  }

  const feedbackBySignalAndTask = latestFeedbackBySignalAndTask(allFeedback);
  return allAnalyses
    .map((analysis) => {
      if (analysis.verdict !== "try" || !analysis.agentTaskSpec) {
        return null;
      }
      const taskPromptHash = buildProductAgentTaskPromptHash(analysis.agentTaskSpec.taskPrompt);
      const feedback = feedbackBySignalAndTask.get(`${analysis.signalId}:${taskPromptHash}`);
      if (!feedback || (feedback.feedback !== "adopted" && feedback.feedback !== "needs_rewrite")) {
        return null;
      }
      return {
        signalId: analysis.signalId,
        signalSubtype: analysis.signalSubtype,
        contentSummary: analysis.contentSummary,
        feedback: feedback.feedback,
        ...(analysis.agentTaskSpec.taskTitle ? { taskTitle: analysis.agentTaskSpec.taskTitle } : {}),
        taskPrompt: analysis.agentTaskSpec.taskPrompt,
        ...(feedback.note ? { note: feedback.note } : {}),
        createdAt: feedback.createdAt
      };
    })
    .filter((example): example is ProductSignalPreferenceExample => example !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}
