import type { BackendWorkUiState } from "./processing-state.ts";

export type BackendWorkCopyTone = "neutral" | "info" | "blocked";

export interface BackendWorkRecoveryCopy {
  headline: string;
  hint: string;
  tone: BackendWorkCopyTone;
}

export function resolveBackendWorkCopy(state: BackendWorkUiState | null): BackendWorkRecoveryCopy | null {
  if (state == null) {
    return null;
  }
  switch (state.kind) {
    case "idle":
    case "draining":
      return null;
    case "retry_waiting": {
      const count = state.count;
      const noun = count === 1 ? "task is" : "tasks are";
      return {
        headline: `Retry waiting · ${count} ${noun} backed off`,
        hint: state.earliestRetryAt
          ? `Next retry around ${state.earliestRetryAt}. Backend is not actively crawling.`
          : "Backend is waiting before retrying. Not actively crawling.",
        tone: "info"
      };
    }
    case "expired_running": {
      const count = state.count;
      const noun = count === 1 ? "task has" : "tasks have";
      return {
        headline: `Reclaim expired work · ${count} ${noun} an expired lease`,
        hint: "Restart processing to pick this work back up.",
        tone: "blocked"
      };
    }
    case "analysis_waiting": {
      const count = state.count;
      const noun = count === 1 ? "capture" : "captures";
      return {
        headline: `Waiting on analysis · ${count} ${noun}`,
        hint: "Crawl succeeded; analysis is still running in the background.",
        tone: "info"
      };
    }
    case "analysis_failed": {
      const count = state.count;
      const noun = count === 1 ? "capture" : "captures";
      return {
        headline: `Analysis failed · ${count} ${noun} blocked`,
        hint: "Open the capture to see why analysis stopped.",
        tone: "blocked"
      };
    }
    case "backend_error":
      return {
        headline: "Backend unavailable",
        hint: state.message,
        tone: "blocked"
      };
  }
}
