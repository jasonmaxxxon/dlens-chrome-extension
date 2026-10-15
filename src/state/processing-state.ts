import type { WorkerStatusResponse } from "../contracts/ingest.ts";
import type { FolderMode, MainPage, PopupPage, SessionItem, SessionRecord } from "./types.ts";
import { DLENS_BUILD_VARIANT, resolveAllowedPagesForBuildVariant } from "../build-variant.ts";
import {
  getAllowedPagesForMode,
  getHomePageForMode,
  isPageComponentKind,
  isPageRailVisible
} from "./page-registry.ts";

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
  return ALLOWED_PAGES[mode].find(isMainPage) ?? "collection";
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

export function isPrEvidencePage(page: PopupPage): boolean {
  return isPageComponentKind(page, "pr-evidence");
}

export function guardPage(page: PopupPage, mode: FolderMode): PopupPage {
  const allowed = ALLOWED_PAGES[mode];
  return allowed.includes(page) ? page : getModeHomePage(mode);
}

export type WorkerStatus = "idle" | "draining";
export type ItemReadinessStatus = "saved" | "queued" | "crawling" | "analyzing" | "ready" | "failed";
export type WorkspaceMode = Exclude<PopupPage, "settings" | "audit-report">;
export type BackendReachability = "reachable" | "slow" | "unreachable";

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

// Idle polling hits worker/get-status every 12s and each response is projected
// into a fresh BackendWorkUiState object, so a naive setState re-renders every
// consumer even when nothing changed. This structural compare lets the
// coordinator keep the previous object's identity when the poll is unchanged.
// The switch is exhaustive over every union member; the trailing never check
// makes any newly added member a typecheck failure until it is compared here.
export function sameBackendWorkUiState(
  left: BackendWorkUiState | null,
  right: BackendWorkUiState | null
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "idle":
    case "draining":
      return true;
    case "retry_waiting": {
      const other = right as typeof left;
      return (
        left.count === other.count &&
        left.earliestRetryAt === other.earliestRetryAt &&
        left.nextDueAt === other.nextDueAt
      );
    }
    case "expired_running": {
      const other = right as typeof left;
      return left.count === other.count;
    }
    case "analysis_waiting": {
      const other = right as typeof left;
      return left.count === other.count;
    }
    case "analysis_failed": {
      const other = right as typeof left;
      return left.count === other.count;
    }
    case "backend_error": {
      const other = right as typeof left;
      return left.message === other.message;
    }
    default: {
      const exhaustive: never = left;
      return exhaustive;
    }
  }
}

export function projectBackendReachability(consecutiveTimeouts: number): BackendReachability {
  if (consecutiveTimeouts >= 3) {
    return "unreachable";
  }
  if (consecutiveTimeouts >= 2) {
    return "slow";
  }
  return "reachable";
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

export function resolveInitialPopupMode(_summary: SessionProcessingSummary): WorkspaceMode { return "collection"; }

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
