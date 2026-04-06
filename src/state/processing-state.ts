import type { PopupPage, SessionItem, SessionRecord } from "./types.ts";

export const DEFAULT_POPUP_WIDTH = 348;
export const EXPANDED_COMPARE_POPUP_WIDTH = 504;
export const NETWORK_BATCH_SIZE = 3;

export type WorkerStatus = "idle" | "draining";
export type ItemReadinessStatus = "saved" | "queued" | "crawling" | "analyzing" | "ready" | "failed";
export type ProgressMode = "idle" | "queued" | "crawling" | "analyzing" | "ready";
export type ProgressVariant = "neutral" | "queued" | "running" | "success" | "failed";
export type WorkspaceMode = Exclude<PopupPage, "settings">;

export interface SessionProcessingSummary {
  total: number;
  ready: number;
  crawling: number;
  analyzing: number;
  pending: number;
  failed: number;
  hasReadyPair: boolean;
  hasInflight: boolean;
}

export interface PollingDelayInput {
  workerStatus: WorkerStatus;
  hasInflight: boolean;
  failureCount: number;
}

export interface ProcessingStripUiState {
  phaseLabel: string;
  progressMode: ProgressMode;
  progressHint: string;
}

export interface LibraryItemUiState {
  itemPhase: ProgressMode | "failed";
  showProgressRail: boolean;
  progressVariant: ProgressVariant;
  statusTone: "saved" | "queued" | "running" | "succeeded" | "failed";
  statusLabel: string;
}

export interface PopupWorkspaceState {
  currentMode: PopupPage;
  popupOpen: boolean;
  modeLocked: boolean;
}

export function getItemReadinessStatus(item: SessionItem): ItemReadinessStatus {
  if (item.status === "failed") {
    return "failed";
  }
  if (item.status === "saved") {
    return "saved";
  }
  if (item.status === "queued") {
    return "crawling";
  }
  if (item.status === "running") {
    return "crawling";
  }
  if (item.status === "succeeded") {
    const analysisStatus = item.latestCapture?.analysis?.status;
    if (analysisStatus === "succeeded") {
      return "ready";
    }
    if (analysisStatus === "failed") {
      return "failed";
    }
    return "analyzing";
  }
  return "saved";
}

export function summarizeSessionProcessing(sessionOrItems: SessionRecord | SessionItem[]): SessionProcessingSummary {
  const items = Array.isArray(sessionOrItems) ? sessionOrItems : sessionOrItems.items;
  const summary: SessionProcessingSummary = {
    total: items.length,
    ready: 0,
    crawling: 0,
    analyzing: 0,
    pending: 0,
    failed: 0,
    hasReadyPair: false,
    hasInflight: false
  };

  for (const item of items) {
    const status = getItemReadinessStatus(item);
    switch (status) {
      case "ready":
        summary.ready += 1;
        break;
      case "crawling":
        summary.crawling += 1;
        break;
      case "analyzing":
        summary.analyzing += 1;
        break;
      case "saved":
        summary.pending += 1;
        break;
      case "failed":
        summary.failed += 1;
        break;
    }
  }

  summary.hasReadyPair = summary.ready >= 2;
  summary.hasInflight = summary.crawling > 0 || summary.analyzing > 0;
  return summary;
}

export function hasNearReadyItems(summary: SessionProcessingSummary): boolean {
  return summary.analyzing > 0;
}

export function resolveInitialPopupMode(summary: SessionProcessingSummary): WorkspaceMode {
  if (summary.ready >= 2) {
    return "compare";
  }
  if (summary.crawling > 0 || hasNearReadyItems(summary)) {
    return "library";
  }
  return "collect";
}

export function advancePopupWorkspaceState(
  summary: SessionProcessingSummary,
  state: PopupWorkspaceState,
  nextPopupOpen: boolean
): PopupWorkspaceState {
  if (!nextPopupOpen) {
    return {
      currentMode: state.currentMode,
      popupOpen: false,
      modeLocked: false
    };
  }

  if (!state.popupOpen || !state.modeLocked) {
    return {
      currentMode: resolveInitialPopupMode(summary),
      popupOpen: true,
      modeLocked: true
    };
  }

  return {
    ...state,
    popupOpen: true,
    modeLocked: true
  };
}

function nextDistinctReadyItem(items: SessionItem[], excludedId: string): string {
  return items.find((item) => item.id !== excludedId && getItemReadinessStatus(item) === "ready")?.id || "";
}

export function pickCompareSelection(
  items: SessionItem[],
  selectedA: string,
  selectedB: string
): { selectedA: string; selectedB: string } {
  const readyItems = items.filter((item) => getItemReadinessStatus(item) === "ready");
  const first = readyItems[0]?.id || "";
  const second = nextDistinctReadyItem(readyItems, first);

  let nextA = selectedA && readyItems.some((item) => item.id === selectedA) ? selectedA : first;
  let nextB = selectedB && selectedB !== nextA && readyItems.some((item) => item.id === selectedB) ? selectedB : "";

  if (!nextB) {
    nextB = nextDistinctReadyItem(readyItems, nextA);
  }
  if (nextA && nextA === nextB) {
    nextB = nextDistinctReadyItem(readyItems, nextA);
  }
  if (!nextA && nextB) {
    nextA = nextDistinctReadyItem(readyItems, nextB) || readyItems[0]?.id || "";
  }
  if (!nextA && !nextB) {
    return { selectedA: "", selectedB: "" };
  }
  return { selectedA: nextA, selectedB: nextB };
}

export function getPollingDelayMs(input: PollingDelayInput): number | null {
  if (!input.hasInflight && input.workerStatus === "idle") {
    return null;
  }
  const base = input.workerStatus === "draining" ? 4000 : 8000;
  const multiplier = input.failureCount <= 0 ? 1 : Math.min(2 ** input.failureCount, 4);
  return Math.min(base * multiplier, 15000);
}

export function getProcessingStripUiState(
  workerStatus: WorkerStatus | null,
  summary: SessionProcessingSummary,
): ProcessingStripUiState {
  if (summary.total > 0 && summary.ready >= 2 && summary.ready === summary.total) {
    return {
      phaseLabel: "Ready to compare",
      progressMode: "ready",
      progressHint: "Two or more posts are ready, so Compare can become the primary surface."
    };
  }
  if (summary.crawling > 0 || workerStatus === "draining") {
    return {
      phaseLabel: "Processing in progress",
      progressMode: "crawling",
      progressHint: "Comments are still being captured before the final analysis settles."
    };
  }
  if (summary.analyzing > 0) {
    return {
      phaseLabel: "Waiting for analysis",
      progressMode: "analyzing",
      progressHint: "The crawl is done, but clusters and compare-ready analysis are still updating."
    };
  }
  if (summary.pending > 0) {
    return {
      phaseLabel: "Idle — pending items not started",
      progressMode: "queued",
      progressHint: "Saved items are waiting for Process All."
    };
  }
  return {
    phaseLabel: "Checking processing state",
    progressMode: "idle",
    progressHint: "The worker is idle and there are no active updates."
  };
}

export function getLibraryItemUiState(
  item: SessionItem,
  optimisticQueued = false,
): LibraryItemUiState {
  if (optimisticQueued) {
    return { itemPhase: "queued", showProgressRail: true, progressVariant: "queued", statusTone: "queued", statusLabel: "queued" };
  }

  const readiness = getItemReadinessStatus(item);
  switch (readiness) {
    case "queued":
    case "crawling":
      return { itemPhase: "crawling", showProgressRail: true, progressVariant: "running", statusTone: "running", statusLabel: "crawling" };
    case "analyzing":
      return { itemPhase: "analyzing", showProgressRail: true, progressVariant: "running", statusTone: "running", statusLabel: "analyzing" };
    case "ready":
      return { itemPhase: "ready", showProgressRail: false, progressVariant: "success", statusTone: "succeeded", statusLabel: "ready" };
    case "failed":
      return { itemPhase: "failed", showProgressRail: false, progressVariant: "failed", statusTone: "failed", statusLabel: "failed" };
    default:
      return { itemPhase: "idle", showProgressRail: false, progressVariant: "neutral", statusTone: "saved", statusLabel: "saved" };
  }
}
