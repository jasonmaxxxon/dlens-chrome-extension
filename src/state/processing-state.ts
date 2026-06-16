import type { WorkerStatusResponse } from "../contracts/ingest.ts";
import type { FolderMode, MainPage, PopupPage, SessionItem, SessionRecord } from "./types.ts";
import { DLENS_BUILD_VARIANT, resolveAllowedPagesForBuildVariant } from "../build-variant.ts";
import {
  PAGE_POPUP_WIDTH,
  getAllowedPagesForMode,
  getHomePageForMode,
  getPageWidth,
  isPageComponentKind,
  isPageRailVisible
} from "./page-registry.ts";

export const DEFAULT_POPUP_WIDTH = PAGE_POPUP_WIDTH;
export const EXPANDED_COMPARE_POPUP_WIDTH = PAGE_POPUP_WIDTH;
export const PRODUCT_POPUP_WIDTH = PAGE_POPUP_WIDTH;
export const NETWORK_BATCH_SIZE = 3;

const DEFAULT_ALLOWED_PAGES: Record<FolderMode, PopupPage[]> = {
  archive: getAllowedPagesForMode("archive"),
  topic: getAllowedPagesForMode("topic"),
  product: getAllowedPagesForMode("product"),
  "pr-evidence": getAllowedPagesForMode("pr-evidence")
};

export const ALLOWED_PAGES: Record<FolderMode, PopupPage[]> = resolveAllowedPagesForBuildVariant(
  DLENS_BUILD_VARIANT,
  DEFAULT_ALLOWED_PAGES
);

function isMainPage(page: PopupPage): page is MainPage {
  return page !== "settings" && page !== "audit-report";
}

export function getModeHomePage(mode: FolderMode): MainPage {
  const preferred = getHomePageForMode(mode);
  if ((ALLOWED_PAGES[mode] as ReadonlyArray<PopupPage>).includes(preferred)) {
    return preferred;
  }
  return ALLOWED_PAGES[mode].find(isMainPage) ?? "library";
}

export function getModeRailPages(mode: FolderMode): MainPage[] {
  const pages: MainPage[] = [];
  for (const page of ALLOWED_PAGES[mode]) {
    if (isMainPage(page) && isPageRailVisible(page)) {
      pages.push(page);
    }
  }
  return pages;
}

export function isProductSignalPage(page: PopupPage): boolean {
  return isPageComponentKind(page, "product-signal");
}

export function isPrEvidencePage(page: PopupPage): boolean {
  return isPageComponentKind(page, "pr-evidence");
}

export function guardPage(page: PopupPage, mode: FolderMode): PopupPage {
  const allowed = ALLOWED_PAGES[mode];
  return allowed.includes(page) ? page : allowed[0]!;
}

export function getPopupWidth(page: PopupPage): number {
  return getPageWidth(page);
}

export type WorkerStatus = "idle" | "draining";
export type ItemReadinessStatus = "saved" | "queued" | "crawling" | "analyzing" | "ready" | "failed";
export type ProgressMode = "idle" | "queued" | "crawling" | "analyzing" | "ready";
export type ProgressVariant = "neutral" | "queued" | "running" | "success" | "failed";
export type WorkspaceMode = Exclude<PopupPage, "settings" | "audit-report">;

export type BackendWorkUiState =
  | { kind: "idle" }
  | { kind: "draining" }
  | { kind: "retry_waiting"; count: number; earliestRetryAt: string | null; nextDueAt: string | null }
  | { kind: "expired_running"; count: number }
  | { kind: "analysis_waiting"; count: number }
  | { kind: "analysis_failed"; count: number }
  | { kind: "backend_error"; message: string };

export function projectBackendWorkStatus(response: WorkerStatusResponse): BackendWorkUiState {
  const drainError = (response.last_drain_error ?? "").trim();
  if (drainError) {
    return { kind: "backend_error", message: drainError };
  }

  const expired = response.expired_running_jobs ?? 0;
  if (expired > 0) {
    return { kind: "expired_running", count: expired };
  }

  const failedAnalyses = response.failed_analyses ?? 0;
  if (failedAnalyses > 0) {
    return { kind: "analysis_failed", count: failedAnalyses };
  }

  const retry = response.retry_scheduled_jobs ?? 0;
  if (retry > 0) {
    return {
      kind: "retry_waiting",
      count: retry,
      earliestRetryAt: response.earliest_retry_at ?? null,
      nextDueAt: response.next_due_at ?? null
    };
  }

  const pendingAnalyses = response.pending_analyses ?? 0;
  const runningAnalyses = response.running_analyses ?? 0;
  const analysisInFlight = pendingAnalyses + runningAnalyses;
  if (analysisInFlight > 0) {
    return { kind: "analysis_waiting", count: analysisInFlight };
  }

  if (response.status === "draining") {
    return { kind: "draining" };
  }

  return { kind: "idle" };
}

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

export interface ProcessingRefreshInput {
  workerStatus: WorkerStatus;
  previousWorkerStatus: WorkerStatus;
  hasInflight: boolean;
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
  return "library";
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

// Low-frequency heartbeat while the worker is idle: worker/get-status hits the
// ingest backend, so this is what lets passive surfaces (readiness panel, mode
// header stamp) flip to Backend 離線 without an analyze click (B-03). It also
// bounds how stale a recovery can look after the backend comes back.
const IDLE_BACKEND_HEARTBEAT_MS = 12000;

export function getPollingDelayMs(input: PollingDelayInput): number | null {
  if (!input.hasInflight && input.workerStatus === "idle") {
    return IDLE_BACKEND_HEARTBEAT_MS;
  }
  const base = input.workerStatus === "draining" ? 4000 : 8000;
  const multiplier = input.failureCount <= 0 ? 1 : Math.min(2 ** input.failureCount, 4);
  return Math.min(base * multiplier, 15000);
}

export function shouldRefreshProcessingFolder(input: ProcessingRefreshInput): boolean {
  return input.hasInflight || input.workerStatus === "draining" || input.previousWorkerStatus === "draining";
}

export function getProcessingStripUiState(
  workerStatus: WorkerStatus | null,
  summary: SessionProcessingSummary,
): ProcessingStripUiState {
  if (summary.ready >= 2) {
    return {
      phaseLabel: "Ready to compare",
      progressMode: "ready",
      progressHint: "Compare can take over now."
    };
  }
  if (summary.crawling > 0 || workerStatus === "draining") {
    return {
      phaseLabel: "Processing in progress",
      progressMode: "crawling",
      progressHint: "Library is the best place to track progress while capture finishes."
    };
  }
  if (summary.analyzing > 0) {
    return {
      phaseLabel: "Waiting for analysis",
      progressMode: "analyzing",
      progressHint: "Library has the next best action while compare-ready analysis finishes."
    };
  }
  if (summary.pending > 0) {
    return {
      phaseLabel: "Waiting to start",
      progressMode: "queued",
      progressHint: "Library can start the queue when you are ready."
    };
  }
  return {
    phaseLabel: "Go to Collect or Library",
    progressMode: "idle",
    progressHint: "Collect or switch to Library to move work forward."
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
