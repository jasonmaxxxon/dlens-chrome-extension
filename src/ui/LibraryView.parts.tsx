import type { CSSProperties } from "react";

import { getLibraryItemUiState } from "../state/processing-state";
import type { SessionItem } from "../state/types";
import { lineClamp, scanRowStyle, skeletonBlockStyle } from "./components";
import { textStyles, tokens } from "./tokens";

const ROW_PILL_PALETTE = [
  tokens.color.accent,
  tokens.color.cyan,
  tokens.color.teal,
  tokens.color.product,
  tokens.color.queued,
] as const;

export function formatSavedAt(value: string, nowMs: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = nowMs - date.getTime();
  if (!Number.isFinite(diffMs)) {
    return new Intl.DateTimeFormat("zh-HK", { month: "short", day: "numeric" }).format(date);
  }
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays}天前`;
  return new Intl.DateTimeFormat("zh-HK", { month: "short", day: "numeric" }).format(date);
}

function statusAccentColor(phase: string): string {
  switch (phase) {
    case "ready": return tokens.color.success;
    case "analyzing": return tokens.color.queued;
    case "crawling": return tokens.color.accent;
    default: return tokens.color.softInk;
  }
}

function statusBg(phase: string): string {
  switch (phase) {
    case "ready": return tokens.color.successSoft;
    case "analyzing": return tokens.color.queuedSoft;
    case "crawling": return tokens.color.accentSoft;
    default: return tokens.color.neutralSurfaceSoft;
  }
}

function topClusterKeywords(item: SessionItem): string[] {
  const clusters = item.latestCapture?.analysis?.clusters;
  if (!clusters?.length) return [];
  const sorted = [...clusters].sort((a, b) => (b.size_share || 0) - (a.size_share || 0));
  return (sorted[0]?.keywords || []).slice(0, 3);
}

function keywordPillColor(keyword: string): string {
  let hash = 0;
  for (let i = 0; i < keyword.length; i += 1) {
    hash = (hash * 31 + keyword.charCodeAt(i)) >>> 0;
  }
  return ROW_PILL_PALETTE[hash % ROW_PILL_PALETTE.length];
}

function rowBaseStyle(isSelected: boolean): CSSProperties {
  return scanRowStyle({
    textAlign: "left",
    display: "grid",
    gridTemplateColumns: "8px minmax(0, 1fr) auto",
    alignItems: "start",
    gap: 10,
    background: isSelected ? tokens.color.contextSurface : "transparent",
    border: "none",
    cursor: "pointer",
    transition: "background 140ms ease",
    color: tokens.color.ink,
    padding: "10px 4px",
  });
}

function StatusDot({ phase }: { phase: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 8,
        height: 8,
        borderRadius: tokens.radius.round,
        background: statusAccentColor(phase),
        marginTop: 6
      }}
    />
  );
}

function StatusBadge({ phase, label }: { phase: string; label: string }) {
  return (
    <span
      style={{
        ...textStyles.label,
        fontSize: 9,
        color: statusAccentColor(phase),
        background: statusBg(phase),
        borderRadius: 6,
        padding: "2px 7px",
        whiteSpace: "nowrap",
        textTransform: "none",
        letterSpacing: 0
      }}
    >
      {label}
    </span>
  );
}

function RowOrdinal({ ordinal }: { ordinal?: number }) {
  if (typeof ordinal !== "number") return null;
  return (
    <span aria-hidden="true" style={{ ...textStyles.metric, fontSize: 9, color: tokens.color.softInk, letterSpacing: 0 }}>
      NO.{String(ordinal).padStart(3, "0")}
    </span>
  );
}

function KeywordPills({ keywords, phase, accentColor }: { keywords: string[]; phase: string; accentColor: string }) {
  if (keywords.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {keywords.map((kw, kwIndex) => {
        const pillColor = phase === "ready" ? keywordPillColor(kw) : accentColor;
        return (
          <span
            key={`${kw}-${kwIndex}`}
            style={{
              ...textStyles.label,
              fontSize: 9.5,
              color: pillColor,
              background: `${pillColor}12`,
              borderRadius: 6,
              padding: "2px 6px",
              textTransform: "none",
              letterSpacing: 0
            }}
          >
            {kw}
          </span>
        );
      })}
    </div>
  );
}

function PendingSkeleton() {
  return (
    <div data-library-card-skeleton="visible" style={{ display: "grid", gap: 7 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {["30%", "22%", "28%"].map((width, skeletonIndex) => (
          <span key={skeletonIndex} style={skeletonBlockStyle(width, 16, { borderRadius: tokens.radius.round })} />
        ))}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <span style={skeletonBlockStyle("92%", 10)} />
        <span style={skeletonBlockStyle("84%", 10)} />
        <span style={skeletonBlockStyle("58%", 10)} />
      </div>
    </div>
  );
}

function RowPrimaryCopy({ author, snippet }: { author: string; snippet: string }) {
  return (
    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
      <div style={{ ...textStyles.bodyTight, fontWeight: 600, color: tokens.color.ink, ...lineClamp(1) }}>
        @{author}
      </div>
      <div style={{ ...textStyles.meta, color: tokens.color.subInk, ...lineClamp(1) }}>
        {snippet}
      </div>
    </div>
  );
}

function RowTrail({
  ordinal,
  phase,
  statusLabel,
  detail
}: {
  ordinal?: number;
  phase: string;
  statusLabel: string;
  detail: string;
}) {
  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "end", minWidth: 82 }}>
      <RowOrdinal ordinal={ordinal} />
      <StatusBadge phase={phase} label={statusLabel} />
      <span style={{ ...textStyles.caption, color: tokens.color.softInk, textAlign: "right" }}>
        {detail}
      </span>
      {phase === "ready" ? (
        <span style={{ ...textStyles.caption, fontWeight: 700, color: tokens.color.accent }}>
          可比較 →
        </span>
      ) : phase === "analyzing" ? (
        <span style={{ ...textStyles.caption, color: tokens.color.queued }}>分析中…</span>
      ) : null}
    </div>
  );
}

export function PostCard({
  item,
  isSelected,
  optimisticQueued,
  ordinal,
  nowMs,
  onSelect,
}: {
  item: SessionItem;
  isSelected: boolean;
  optimisticQueued: boolean;
  ordinal?: number;
  nowMs: number;
  onSelect: () => void;
}) {
  const uiState = getLibraryItemUiState(item, optimisticQueued);
  const keywords = topClusterKeywords(item);
  const accentColor = statusAccentColor(uiState.itemPhase);
  const snippet = item.descriptor.text_snippet || item.descriptor.post_url || item.descriptor.page_url || "—";
  const showPendingSkeleton =
    uiState.itemPhase === "queued" || uiState.itemPhase === "crawling" || uiState.itemPhase === "analyzing";
  const detail = item.latestCapture?.analysis?.source_comment_count
    ? `${item.latestCapture.analysis.source_comment_count} 則留言`
    : item.descriptor.time_token_hint || formatSavedAt(item.savedAt, nowMs);

  return (
    <button
      data-item-phase={uiState.itemPhase}
      data-library-row="scan"
      data-scan-row="true"
      onClick={onSelect}
      style={rowBaseStyle(isSelected)}
    >
      <StatusDot phase={uiState.itemPhase} />
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <RowPrimaryCopy author={item.descriptor.author_hint || "Unknown"} snippet={snippet} />
        {showPendingSkeleton ? <PendingSkeleton /> : null}
        {!showPendingSkeleton ? <KeywordPills keywords={keywords} phase={uiState.itemPhase} accentColor={accentColor} /> : null}
      </div>
      <RowTrail ordinal={ordinal} phase={uiState.itemPhase} statusLabel={uiState.statusLabel} detail={detail} />
    </button>
  );
}
