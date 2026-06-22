import { projectCapturedPost } from "./captured-post";
import type { SessionItemStatus, SessionRecord, Signal } from "./types";

export type SignalReadinessStatus =
  | "saved"
  | "crawling"
  | "ready"
  | "missing_content"
  | "failed"
  | "missing_item";

export interface SignalReadiness {
  status: SignalReadinessStatus;
  itemStatus?: SessionItemStatus;
  lastErrorKind?: string | null;
  lastError?: string | null;
}

export function buildSignalReadinessById(
  activeFolder: SessionRecord | null,
  signals: Signal[]
): Record<string, SignalReadiness> {
  const itemsById = new Map(activeFolder?.items.map((item) => [item.id, item]) ?? []);
  return Object.fromEntries(
    signals.map((signal) => {
      const item = signal.itemId ? itemsById.get(signal.itemId) : null;
      if (!item) {
        return [signal.id, { status: "missing_item" }] as const;
      }
      if (item.status === "saved") {
        return [signal.id, { status: "saved", itemStatus: item.status }] as const;
      }
      if (item.status === "queued" || item.status === "running") {
        return [
          signal.id,
          {
            status: "crawling",
            itemStatus: item.status
          }
        ] as const;
      }
      if (item.status === "failed") {
        return [
          signal.id,
          {
            status: "failed",
            itemStatus: item.status,
            lastErrorKind: item.lastErrorKind ?? null,
            lastError: item.lastError ?? null
          }
        ] as const;
      }
      return [
        signal.id,
        {
          status: projectCapturedPost(item).hasAssembledContent ? "ready" : "missing_content",
          itemStatus: item.status
        }
      ] as const;
    })
  );
}
