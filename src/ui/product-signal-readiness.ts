import { hasProductSignalAssembledContent } from "../compare/product-signal-analysis";
import type { SessionItemStatus, SessionRecord, Signal } from "../state/types";

export type ProductSignalReadinessStatus =
  | "saved"
  | "crawling"
  | "ready"
  | "missing_content"
  | "failed"
  | "missing_item";

export interface ProductSignalReadiness {
  status: ProductSignalReadinessStatus;
  itemStatus?: SessionItemStatus;
}

export function buildProductSignalReadinessById(
  activeFolder: SessionRecord | null,
  signals: Signal[]
): Record<string, ProductSignalReadiness> {
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
        return [signal.id, { status: "crawling", itemStatus: item.status }] as const;
      }
      if (item.status === "failed") {
        return [signal.id, { status: "failed", itemStatus: item.status }] as const;
      }
      return [
        signal.id,
        {
          status: hasProductSignalAssembledContent(item.latestCapture) ? "ready" : "missing_content",
          itemStatus: item.status
        }
      ] as const;
    })
  );
}
