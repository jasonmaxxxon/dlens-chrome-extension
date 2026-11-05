import { MessageCircle } from "lucide-react";
import type { CollectionPost, CollectionRowStatus } from "../viewmodel/collection-browser";
import { collectionPanelRelativeTime } from "../viewmodel/collection-browser";
import { CollectionThumbnail } from "./CollectionThumbnail";
import { CollectionStatusChip } from "./CollectionStatusChip";
import { getModeTheme, tokens } from "./tokens";

const panel = tokens.panel;
const modeLabels = { topic: "觀眾反應", product: "個人應用", archive: "收藏整理", "pr-evidence": "活動追蹤" } as const;

/** One button opens the post; summary and status always keep their own line boxes. */
export function CollectionPostCard({ post, status, postedRelative, comments, arrival, onOpen }: {
  post: CollectionPost; status: CollectionRowStatus | undefined; postedRelative: string | null; comments: number | null;
  arrival: "arc" | "dot" | "none"; onOpen: () => void;
}) {
  // A removed item may remain inert for its exit; its old row no longer has a
  // current projection, so keep the source identity while that visual leaves.
  const row: CollectionRowStatus = status ?? { mode: post.memberships[0]?.mode ?? "archive", itemId: null, summary: null, chip: null, error: false };
  const accent = getModeTheme(row.mode).accent;
  return <button type="button" data-collection-post={post.key} data-collection-arrival="" onClick={onOpen}
    style={{ display: "grid", gridTemplateColumns: `${panel.size.thumb}px minmax(0,1fr)`, position: "relative", alignItems: "start", gap: panel.list.card.columnGap,
      width: "100%", minWidth: 0, textAlign: "left", boxSizing: "border-box", padding: panel.list.card.padding, border: 0,
      borderRadius: panel.radius.md, background: panel.surface, boxShadow: panel.shadow.card, cursor: "pointer", color: panel.ink, fontFamily: tokens.font.sans }}>
    <CollectionThumbnail post={post} />
    <span style={{ display: "grid", gap: panel.list.card.contentGap, minWidth: 0 }}>
      <span style={{ ...panel.type.meta, color: panel.ink3, display: "flex", alignItems: "center", gap: panel.space.xs, minWidth: 0,
        minHeight: panel.list.card.metaLine, paddingRight: panel.space.lg, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{post.author ? `@${post.author.replace(/^@/, "")}` : "作者未記錄"}</span>
        {postedRelative ? <span style={{ flexShrink: 0 }}>· {collectionPanelRelativeTime(postedRelative)}</span> : null}
        <span aria-hidden="true">·</span><MessageCircle size={panel.size.icon} strokeWidth={panel.iconStrokeWidth} aria-label="留言" style={{ flexShrink: 0 }} />
        <span data-collection-comments="" style={{ flexShrink: 0 }}>{comments ?? "—"}</span>
      </span>
      <span style={{ ...panel.type.cardTitle, color: panel.ink, display: "-webkit-box", WebkitLineClamp: panel.list.card.titleLines, minHeight: panel.list.card.titleLine, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{post.body || "未有原文"}</span>
      <span data-collection-summary="" style={{ ...panel.type.bodySm, color: row.error ? panel.danger : panel.ink2,
        display: "flex", alignItems: "center", gap: panel.space.xs, minWidth: 0, minHeight: panel.list.card.summaryLine }}>
        {row.clusterIndex !== undefined && row.summary ? <span data-collection-summary-cluster={row.clusterIndex} aria-hidden="true"
          style={{ width: panel.reader.clusterBar, height: panel.list.card.summaryLine, flexShrink: 0, borderRadius: panel.radius.xs,
            background: tokens.collectCard.clusterColors[row.clusterIndex % tokens.collectCard.clusterColors.length] }} /> : null}
        <span style={{ minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{row.summary}</span>
      </span>
      <span style={{ display: "flex", gap: panel.space.sm, alignItems: "center", minHeight: panel.list.card.statusLine, minWidth: 0 }}>
        <CollectionStatusChip chip={row.chip} />
        <span title={post.memberships.find(member => member.mode === row.mode)?.sessionName} style={{ ...panel.type.micro, display: "inline-flex", alignItems: "center", gap: panel.space.xs, color: panel.ink3, flexShrink: 0 }}>
          <span aria-hidden="true" style={{ width: panel.size.modeDot, height: panel.size.modeDot, borderRadius: panel.radius.pill, background: accent }} />{modeLabels[row.mode]}
        </span>
      </span>
    </span>
    {arrival !== "none" ? <span data-collection-state={arrival} role="img" aria-label={arrival === "arc" ? "讀緊留言" : "未打開結果"}
      style={{ position: "absolute", top: panel.space.md, right: panel.space.md, flexShrink: 0,
        width: panel.size.statusDot, height: panel.size.statusDot, borderRadius: panel.radius.pill,
        background: arrival === "dot" ? accent : "transparent", border: arrival === "arc" ? `${tokens.collectCard.arcBorder}px solid ${panel.border}` : undefined,
        borderTopColor: accent, boxSizing: "border-box" }} /> : null}
  </button>;
}
