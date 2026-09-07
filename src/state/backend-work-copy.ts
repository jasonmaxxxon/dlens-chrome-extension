import type { BackendReachability, BackendWorkUiState, WorkerStatus } from "./processing-state.ts";

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
    case "unknown":
      return { headline: "確認工作狀態中", hint: "尚未取得工作狀態。", tone: "neutral" };
    case "unavailable":
      return {
        headline: "工作狀態暫時無法取得",
        hint: `目前狀態未知，請重試。${state.lastVerifiedAt ? ` 上次確認：${state.lastVerifiedAt}。` : ""}`,
        tone: "blocked"
      };
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
        headline: "工作執行失敗",
        hint: "請重試，或展開診斷查看錯誤原因。",
        tone: "blocked"
      };
  }
}

// Shared observable status copy for the Product VM and status rail. Health,
// worker observation, local AI, and data refresh remain independent inputs.
export function resolveProcessingStatusCopy({
  backendWorkUiState,
  backendReachability = "unknown",
  workerStatus = null,
  localAnalysisRunning = false,
  dataRefreshError = null
}: {
  backendWorkUiState?: BackendWorkUiState | null;
  backendReachability?: BackendReachability;
  workerStatus?: WorkerStatus | null;
  localAnalysisRunning?: boolean;
  dataRefreshError?: string | null;
}): BackendWorkRecoveryCopy & { active: boolean } {
  const state = backendWorkUiState ?? { kind: workerStatus ?? "unknown" };
  const recovery = resolveBackendWorkCopy(state);
  const active = state.kind === "draining" || state.kind === "analysis_waiting";
  let headline = recovery?.headline ?? (state.kind === "draining" ? "工作處理中" : "閒置");
  if (state.kind === "unavailable" && backendReachability === "reachable") {
    headline = `服務可連線；${headline}`;
  }
  const hint = [recovery?.hint, dataRefreshError ? "資料刷新失敗，請重試。" : null].filter(Boolean).join(" ");
  return {
    headline: localAnalysisRunning ? "本機 AI 判讀中" : headline,
    hint: localAnalysisRunning ? [headline, hint].filter(Boolean).join("；") : hint,
    tone: localAnalysisRunning || active ? "info" : recovery?.tone ?? "neutral",
    active: localAnalysisRunning || active
  };
}
