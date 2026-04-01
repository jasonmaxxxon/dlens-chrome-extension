import type { SessionItem, SessionRecord } from "./types.ts";

export const DEFAULT_POPUP_WIDTH = 348;
export const EXPANDED_COMPARE_POPUP_WIDTH = 504;
export const NETWORK_BATCH_SIZE = 3;

export type WorkerStatus = "idle" | "draining";
export type ItemReadinessStatus = "saved" | "queued" | "crawling" | "analyzing" | "ready" | "failed";

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
        summary.pending += 1;
        break;
    }
  }

  summary.hasReadyPair = summary.ready >= 2;
  summary.hasInflight = summary.crawling > 0 || summary.analyzing > 0;
  return summary;
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
