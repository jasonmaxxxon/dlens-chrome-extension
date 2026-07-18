import { useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";

import type { ReactionPattern } from "../compare/topic-audit.ts";
import { layoutSignalAtlasCompass } from "../viewmodel/signal-atlas-compass.ts";
import { textStyles, tokens } from "./tokens.ts";

export interface AtlasReactionMapProps {
  patterns: ReactionPattern[];
  usableCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ATLAS_PALETTE = [
  tokens.color.signal,
  tokens.color.techniqueViolet,
  tokens.color.queued,
  tokens.color.techniqueRose,
  tokens.color.accent
] as const;

function bubbleUsesDarkText(index: number, paletteSize: number): boolean {
  if (paletteSize <= 0) return false;
  const paletteIndex = ((index % paletteSize) + paletteSize) % paletteSize;
  return paletteIndex === 0 || paletteIndex === 2;
}

function assignmentPercent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

const BUBBLE_LABEL_CODEPOINTS_PER_LINE = 8;

function formatBubbleLabel(label: string): string[] {
  const codepoints = Array.from(label.trim().replace(/\s+/g, " "));
  if (codepoints.length > BUBBLE_LABEL_CODEPOINTS_PER_LINE * 2) {
    codepoints.splice(BUBBLE_LABEL_CODEPOINTS_PER_LINE * 2 - 1, codepoints.length, "…");
  }
  return [
    codepoints.slice(0, BUBBLE_LABEL_CODEPOINTS_PER_LINE).join(""),
    codepoints.slice(BUBBLE_LABEL_CODEPOINTS_PER_LINE).join("")
  ].filter(Boolean);
}

export function AtlasReactionMap({ patterns, usableCount, selectedId, onSelect }: AtlasReactionMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const layout = layoutSignalAtlasCompass(patterns);
  const assignmentTotal = patterns.reduce((sum, pattern) => sum + pattern.nComments, 0);
  const indexedPatterns = patterns.map((pattern, originalIndex) => ({ pattern, originalIndex }));
  const orderedPatterns = [...indexedPatterns].sort((a, b) => (
    b.pattern.nComments - a.pattern.nComments || a.originalIndex - b.originalIndex
  ));
  const patternById = new Map(indexedPatterns.map((entry) => [entry.pattern.id, entry]));
  const tooltipId = focusedId ?? hoveredId;
  const tooltipPattern = tooltipId ? patternById.get(tooltipId)?.pattern ?? null : null;
  const axisLabelStyle: CSSProperties = {
    fontFamily: tokens.font.mono,
    fontSize: textStyles.label.fontSize,
    fontWeight: textStyles.label.fontWeight,
    letterSpacing: textStyles.label.letterSpacing,
    fill: tokens.color.softInk
  };
  let donutOffset = 0;

  const activate = (id: string) => onSelect(id);
  const handleBubbleKeyDown = (event: KeyboardEvent<SVGGElement>, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(id);
    }
  };
  const handleBubbleMouseEnter = (_event: MouseEvent<SVGGElement>, id: string) => setHoveredId(id);
  const handleBubbleMouseLeave = (_event: MouseEvent<SVGGElement>) => setHoveredId(null);
  const handleBubbleFocus = (_event: FocusEvent<SVGGElement>, id: string) => setFocusedId(id);
  const handleBubbleBlur = (_event: FocusEvent<SVGGElement>) => setFocusedId(null);

  return (
    <section
      data-atlas-assignment-distribution="true"
      data-atlas-assignment-total={assignmentTotal}
      data-atlas-reaction-map-kind={layout.kind}
      data-dlens-presence="card"
      style={{
        display: "grid",
        gap: tokens.spacing.md,
        padding: `${tokens.spacing.section}px`,
        borderRadius: tokens.radius.cardLg,
        border: `1px solid ${tokens.color.atlasEdge}`,
        background: tokens.color.atlasPaper,
        boxShadow: tokens.shadow.atlasCard,
        backdropFilter: tokens.effect.atlasBlur,
        WebkitBackdropFilter: tokens.effect.atlasBlur
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: tokens.spacing.sm, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ ...textStyles.label, color: tokens.color.subInk }}>
          {layout.kind === "compass" ? "民情羅盤與分佈" : "民情形狀與分佈"}
        </span>
        <span style={{ ...textStyles.caption, color: tokens.color.softInk }}>
          {patterns.length} 個形狀 · {assignmentTotal} 次留言歸屬 · 可用 {usableCount} 則
        </span>
      </div>

      <style>{`
        [data-atlas-assignment-layout="responsive"] { grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); }
        [data-signal-atlas-dot] { outline: none; transform-box: fill-box; transform-origin: center; transition: transform ${tokens.motion.duration.base} ${tokens.motion.easing.springSoft}; }
        [data-signal-atlas-dot]:hover { transform: ${tokens.motion.transform.atlasHover}; }
        [data-signal-atlas-dot]:active { transform: ${tokens.motion.transform.atlasPress}; }
        [data-signal-atlas-dot] .dlens-atlas-focus-ring { opacity: 0; transition: opacity ${tokens.motion.duration.fast} ${tokens.motion.easing.standard}; }
        [data-signal-atlas-dot]:focus-visible .dlens-atlas-focus-ring { opacity: 1; }
        @media (prefers-reduced-motion: no-preference) {
          [data-signal-atlas-dot][data-top-dot="true"] { animation: dlens-atlas-dot-pulse ${tokens.motion.duration.slower} ${tokens.motion.easing.standard} infinite alternate; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-signal-atlas-dot] { transition: none !important; }
          [data-signal-atlas-dot] .dlens-atlas-focus-ring { transition: none !important; }
          [data-signal-atlas-dot]:hover, [data-signal-atlas-dot]:active { transform: none !important; }
        }
        @media (max-width: ${tokens.layout.atlasNarrowBreakpointPx}px) {
          [data-atlas-assignment-layout="responsive"] { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>

      <div
        data-atlas-assignment-layout="responsive"
        style={{ display: "grid", gap: tokens.spacing.section, alignItems: "start", minWidth: 0 }}
      >
        <div style={{ display: "grid", gap: tokens.spacing.sm, minWidth: 0 }}>
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="group"
            aria-label={layout.kind === "compass"
              ? "民情羅盤：橫軸由質疑到支持，縱軸由行動導向到情緒共鳴，泡泡大小為留言數"
              : "反應形狀圖：泡泡大小為留言數"}
            style={{ width: "100%", height: "auto", display: "block" }}
          >
            {layout.kind === "compass" ? (
              <g aria-hidden="true">
                <line x1={layout.width / 2} y1={tokens.spacing.section} x2={layout.width / 2} y2={layout.height - tokens.spacing.xl} stroke={tokens.color.line} strokeWidth={1} />
                <line x1={tokens.spacing.xl} y1={layout.height / 2} x2={layout.width - tokens.spacing.xl} y2={layout.height / 2} stroke={tokens.color.line} strokeWidth={1} />
                <text x={layout.width / 2} y={tokens.spacing.md} textAnchor="middle" style={axisLabelStyle}>情緒共鳴</text>
                <text x={layout.width / 2} y={layout.height - tokens.spacing.xs} textAnchor="middle" style={axisLabelStyle}>行動導向</text>
                <text x={tokens.spacing.lg} y={layout.height / 2 - tokens.spacing.sm} textAnchor="start" style={axisLabelStyle}>質疑</text>
                <text x={layout.width - tokens.spacing.lg} y={layout.height / 2 - tokens.spacing.sm} textAnchor="end" style={axisLabelStyle}>支持</text>
              </g>
            ) : null}

            {layout.bubbles.map((bubble, index) => {
              const patternEntry = patternById.get(bubble.id);
              if (!patternEntry) return null;
              const { pattern, originalIndex } = patternEntry;
              const paletteIndex = originalIndex % ATLAS_PALETTE.length;
              const fill = ATLAS_PALETTE[paletteIndex]!;
              const bubbleLabelLines = formatBubbleLabel(pattern.label);
              const labelSafeInset = tokens.spacing.xl * 2;
              const labelX = Math.max(labelSafeInset, Math.min(layout.width - labelSafeInset, bubble.x));
              return (
                <g
                  key={bubble.id}
                  data-signal-atlas-dot={bubble.id}
                  data-atlas-palette-index={paletteIndex}
                  data-top-dot={index === 0 ? "true" : "false"}
                  data-active={selectedId === bubble.id ? "true" : "false"}
                  role="button"
                  aria-label={`${pattern.label}，${pattern.nComments} 次留言歸屬。${pattern.dynamicImplication}按 Enter 或空白鍵開啟詳情`}
                  tabIndex={0}
                  onClick={() => activate(pattern.id)}
                  onKeyDown={(event) => handleBubbleKeyDown(event, pattern.id)}
                  onMouseEnter={(event) => handleBubbleMouseEnter(event, pattern.id)}
                  onMouseLeave={handleBubbleMouseLeave}
                  onFocus={(event) => handleBubbleFocus(event, pattern.id)}
                  onBlur={handleBubbleBlur}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={bubble.x} cy={bubble.y} r={bubble.r + tokens.spacing.sm} fill={fill} fillOpacity={0.22} />
                  <circle cx={bubble.x} cy={bubble.y} r={bubble.r} fill={fill} stroke={tokens.color.atlasEdge} strokeWidth={1.5} />
                  <text
                    data-atlas-bubble-count={pattern.id}
                    x={bubble.x}
                    y={bubble.y + tokens.spacing.xs}
                    textAnchor="middle"
                    style={{ ...textStyles.metric, fontSize: textStyles.bodyTight.fontSize, fill: bubbleUsesDarkText(originalIndex, ATLAS_PALETTE.length) ? tokens.color.ink : tokens.color.atlasPaperStrong }}
                  >
                    {pattern.nComments}
                  </text>
                  <text
                    data-atlas-bubble-label={pattern.id}
                    x={labelX}
                    y={bubble.y + bubble.r + tokens.spacing.section}
                    textAnchor="middle"
                    aria-hidden="true"
                    style={{ ...textStyles.caption, fill: tokens.color.subInk }}
                  >
                    {bubbleLabelLines.map((line, lineIndex) => (
                      <tspan
                        key={`${pattern.id}-label-${lineIndex}`}
                        x={labelX}
                        dy={lineIndex === 0 ? 0 : `${textStyles.caption.lineHeight}em`}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                  <circle className="dlens-atlas-focus-ring" cx={bubble.x} cy={bubble.y} r={bubble.r + tokens.spacing.xs} fill="none" stroke={tokens.color.signalDeep} strokeWidth={2} />
                  <circle className="dlens-atlas-focus-ring" cx={bubble.x} cy={bubble.y} r={bubble.r + tokens.spacing.sm} fill="none" stroke={tokens.color.atlasPaperStrong} strokeWidth={1} />
                </g>
              );
            })}
          </svg>

          {layout.kind === "field" ? (
            <span data-signal-atlas-compass-hint="true" style={{ ...textStyles.caption, color: tokens.color.softInk }}>
              此審計早於羅盤座標——按「⟳ 重新生成」重讀後，泡泡會依 質疑↔支持 × 情緒↔行動 定位。
            </span>
          ) : null}

          {tooltipPattern ? (
            <div
              role="tooltip"
              data-atlas-tooltip-for={tooltipPattern.id}
              style={{
                ...textStyles.bodyTight,
                padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`,
                borderRadius: tokens.radius.card,
                border: `1px solid ${tokens.color.atlasEdge}`,
                background: tokens.color.atlasPaperStrong,
                color: tokens.color.ink,
                boxShadow: tokens.shadow.atlasCard
              }}
            >
              <strong>{tooltipPattern.label}</strong> · {tooltipPattern.dynamicImplication}
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: tokens.spacing.sm, minWidth: 0 }}>
          <svg
            data-atlas-assignment-donut="true"
            aria-hidden="true"
            viewBox="0 0 40 40"
            style={{ width: "100%", maxHeight: tokens.spacing.xl * 4, display: "block" }}
          >
            <circle cx="20" cy="20" r="15.9155" fill="none" stroke={tokens.color.line} strokeWidth="5" />
            {indexedPatterns.map(({ pattern, originalIndex }) => {
              const rawPercent = assignmentTotal > 0 ? (pattern.nComments / assignmentTotal) * 100 : 0;
              const offset = donutOffset;
              donutOffset += rawPercent;
              return (
                <circle
                  key={pattern.id}
                  data-atlas-donut-segment={pattern.id}
                  cx="20"
                  cy="20"
                  r="15.9155"
                  fill="none"
                  stroke={ATLAS_PALETTE[originalIndex % ATLAS_PALETTE.length]}
                  strokeWidth="5"
                  pathLength="100"
                  strokeDasharray={`${rawPercent} ${100 - rawPercent}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 20 20)"
                />
              );
            })}
          </svg>

          <div style={{ display: "grid", borderTop: `1px solid ${tokens.color.line}` }}>
            {orderedPatterns.map(({ pattern, originalIndex }, sortedIndex) => {
              const paletteIndex = originalIndex % ATLAS_PALETTE.length;
              const percent = assignmentPercent(pattern.nComments, assignmentTotal);
              return (
                <button
                  key={pattern.id}
                  type="button"
                  data-atlas-assignment-row={pattern.id}
                  data-assignment-percent={percent}
                  data-atlas-palette-index={paletteIndex}
                  data-active={selectedId === pattern.id ? "true" : "false"}
                  aria-pressed={selectedId === pattern.id}
                  className="dlens-atlas-distribution-row"
                  onClick={() => activate(pattern.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr) auto",
                    alignItems: "center",
                    gap: tokens.spacing.sm,
                    padding: `${tokens.spacing.sm}px ${tokens.spacing.xs}px`,
                    border: "none",
                    borderRadius: tokens.radius.xs,
                    borderBottom: sortedIndex < orderedPatterns.length - 1 ? `1px solid ${tokens.color.line}` : "none",
                    background: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: tokens.font.sans,
                    minWidth: 0
                  }}
                >
                  <span aria-hidden="true" style={{ width: tokens.spacing.sm, height: tokens.spacing.sm, borderRadius: tokens.radius.round, background: ATLAS_PALETTE[paletteIndex], flexShrink: 0 }} />
                  <span style={{ ...textStyles.caption, color: tokens.color.ink, minWidth: 0 }}>{pattern.label}</span>
                  <span style={{ ...textStyles.metric, color: tokens.color.subInk, whiteSpace: "nowrap" }}>
                    {pattern.nComments} 次歸屬 · {percent}%
                    {pattern.counterRefs.length > 0 ? <span style={{ color: tokens.color.techniqueRose }}> · 反例 {pattern.counterRefs.length}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export const atlasReactionMapTestables = {
  assignmentPercent,
  bubbleUsesDarkText
};
