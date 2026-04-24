import type { CSSProperties } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { CompareSetupTeaser } from "./CompareSetupView";
import type { CompareBrief } from "../compare/brief";
import { MetricChip } from "./components";

export const HOVER_RECT_EVENT = "dlens:hover-rect";
export const OPTIMISTIC_SAVE_EVENT = "dlens:optimistic-save";
export const OPTIMISTIC_SAVE_FAILED_EVENT = "dlens:optimistic-save-failed";

export type HoverRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export function computeFlashPreviewStyle(rect: HoverRect | null): CSSProperties | null {
  if (!rect) {
    return null;
  }
  const width = 248;
  const gap = 14;
  const left = rect.right + width + gap < window.innerWidth ? rect.right + gap : Math.max(16, rect.left - width - gap);
  const top = Math.max(16, Math.min(rect.top, window.innerHeight - 220));
  return {
    position: "fixed",
    left,
    top,
    width,
    zIndex: 2147483646
  };
}

export function flashPreviewMetrics(descriptor: TargetDescriptor | null | undefined) {
  if (!descriptor) {
    return [];
  }
  return [
    <MetricChip key="likes" kind="likes" value={descriptor.engagement.likes} present={descriptor.engagement_present.likes} />,
    <MetricChip
      key="comments"
      kind="comments"
      value={descriptor.engagement.comments}
      present={descriptor.engagement_present.comments}
    />,
    <MetricChip
      key="reposts"
      kind="reposts"
      value={descriptor.engagement.reposts}
      present={descriptor.engagement_present.reposts}
    />,
    <MetricChip
      key="forwards"
      kind="forwards"
      value={descriptor.engagement.forwards}
      present={descriptor.engagement_present.forwards}
    />
  ];
}

export function flashPreviewAvatar(author: string | null | undefined) {
  const cleaned = (author || "").trim();
  return cleaned ? cleaned.slice(0, 1).toUpperCase() : "D";
}

export function comparePairKey(itemAId: string, itemBId: string): string {
  return `${itemAId}::${itemBId}`;
}

export function buildResultId(itemAId: string, itemBId: string): string {
  return `result_${comparePairKey(itemAId, itemBId)}_${Date.now().toString(36)}`;
}

export function buildDateRangeLabel(leftHint: string | null | undefined, rightHint: string | null | undefined): string {
  const left = (leftHint || "").trim();
  const right = (rightHint || "").trim();
  if (left && right) {
    return `${left}–${right}`;
  }
  return left || right || "recent";
}

export function buildCompareSetupTeaser(
  brief: CompareBrief,
  totalComments: number,
  groupCount: number,
  dateRangeLabel: string
): CompareSetupTeaser {
  return {
    headline: brief.headline,
    deck: brief.whyItMatters || brief.creatorCue,
    metadataLabel: `${totalComments} 則留言 · ${dateRangeLabel} · ${groupCount} 群組${brief.source === "fallback" ? " · fallback" : ""}`,
    briefSource: brief.source
  };
}
