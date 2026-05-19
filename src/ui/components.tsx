import type { CSSProperties, ReactNode } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor.ts";
import type { WorkerStatus, WorkspaceMode } from "../state/processing-state.ts";
import { TOKENS, tokens } from "./tokens";
import { BUILD_VERSION } from "./version";

export { TOKENS } from "./tokens";

const MODE_ACCENT = `var(--dlens-mode-accent, ${tokens.color.accent})`;
const MODE_ACCENT_MID = `var(--dlens-mode-accent-mid, ${tokens.color.accentMid})`;
const MODE_ACCENT_SOFT = `var(--dlens-mode-accent-soft, ${tokens.color.accentSoft})`;
const MODE_ACCENT_BUTTON_SHADOW = `var(--dlens-mode-accent-button-shadow, ${tokens.shadow.accentButton})`;

/* ─── HUD Icon Button (thin ghost circle) ─── */

export function IconButton({
  children,
  onClick,
  label,
  disabled
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 32,
        height: 32,
        borderRadius: tokens.radius.sm,
        border: `1px solid ${tokens.color.glassBorder}`,
        background: tokens.color.surface,
        backdropFilter: tokens.effect.glassBlur,
        WebkitBackdropFilter: tokens.effect.glassBlur,
        boxShadow: tokens.shadow.glass,
        color: disabled ? tokens.color.softInk : tokens.color.subInk,
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: tokens.motion.interactiveTransitionFast
      }}
    >
      {children}
    </button>
  );
}

/* ─── Status Theme ─── */

export function statusTheme(status: string) {
  switch (status) {
    case "saved":
      return { background: tokens.color.neutralSurface, color: tokens.color.neutralText };
    case "queued":
      return { background: TOKENS.queuedSoft, color: TOKENS.queued };
    case "running":
      return { background: TOKENS.runningSoft, color: TOKENS.running };
    case "succeeded":
      return { background: TOKENS.successSoft, color: TOKENS.success };
    case "failed":
      return { background: TOKENS.failedSoft, color: TOKENS.failed };
    default:
      return { background: tokens.color.neutralSurface, color: tokens.color.neutralText };
  }
}

/* ─── Metric Icons (SVG) ─── */

export function MetricIcon({
  kind,
  size = 13
}: {
  kind: "likes" | "comments" | "reposts" | "forwards";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  switch (kind) {
    case "likes":
      return <svg {...common}><path d="M12 20.5s-6.5-4.35-8.5-7.05C1.1 10.17 2.18 6.5 5.82 6.5c1.92 0 3.1.95 4.02 2.2C10.76 7.45 11.94 6.5 13.86 6.5 17.5 6.5 18.58 10.17 20.5 13.45 18.5 16.15 12 20.5 12 20.5Z" /></svg>;
    case "comments":
      return <svg {...common}><path d="M7 17.5h6l4 3v-3h.5A2.5 2.5 0 0 0 20 15V7a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 7v8A2.5 2.5 0 0 0 6.5 17.5H7Z" /></svg>;
    case "reposts":
      return <svg {...common}><path d="M7 7h10l-2.5-2.5" /><path d="M17 17H7l2.5 2.5" /><path d="M17 7v4" /><path d="M7 17v-4" /></svg>;
    case "forwards":
      return <svg {...common}><path d="M21 4 10 15" /><path d="m21 4-7 16-4-5-5-4 16-7Z" /></svg>;
  }
}

/* ─── Metric Chip (compact, airy) ─── */

export function MetricChip({
  kind,
  value,
  present
}: {
  kind: "likes" | "comments" | "reposts" | "forwards";
  value: number | null;
  present: boolean;
}) {
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        background: present ? MODE_ACCENT_SOFT : tokens.color.neutralSurfaceSoft,
        border: present ? `1px solid ${MODE_ACCENT_SOFT}` : `1px solid ${tokens.color.glassBorder}`,
        color: present ? MODE_ACCENT : tokens.color.softInk,
        fontSize: 10,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        letterSpacing: 0,
        transition: tokens.motion.interactiveTransitionFast
      }}
    >
      <MetricIcon kind={kind} />
      <span>{value ?? "—"}</span>
    </span>
  );
}

function formatCompactMetricValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `${Math.floor(value / 1000)}k+`;
  if (value <= -1000) return `-${Math.floor(Math.abs(value) / 1000)}k+`;
  return String(value);
}

export function EvidenceMetricRow({
  metrics
}: {
  metrics: {
    likes?: number | null;
    comments?: number | null;
    reposts?: number | null;
    forwards?: number | null;
  };
}) {
  const items = [
    { kind: "likes" as const, value: metrics.likes ?? null, tone: tokens.color.failed, bg: tokens.color.failedSoft },
    { kind: "comments" as const, value: metrics.comments ?? null, tone: MODE_ACCENT, bg: MODE_ACCENT_SOFT },
    { kind: "reposts" as const, value: metrics.reposts ?? null, tone: tokens.color.subInk, bg: tokens.color.neutralSurfaceSoft },
    { kind: "forwards" as const, value: metrics.forwards ?? null, tone: tokens.color.queued, bg: tokens.color.queuedSoft }
  ];

  return (
    <span
      data-evidence-metrics-row="single-line"
      style={{ display: "inline-flex", flexWrap: "nowrap", gap: 6, minWidth: 0, maxWidth: "100%", overflowX: "auto", scrollbarWidth: "none" }}
    >
      {items.map((item) => (
        <span
          key={item.kind}
          data-evidence-metric={item.kind}
          aria-label={`${item.kind} ${item.value}`}
          style={{
            padding: 0,
            borderRadius: 999,
            background: "transparent",
            border: "none",
            color: item.tone,
            fontSize: 10,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            minWidth: 0,
            whiteSpace: "nowrap",
            flex: "0 0 auto"
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              background: item.bg,
              color: item.tone,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            <MetricIcon kind={item.kind} size={12} />
          </span>
          <span style={{ color: tokens.color.ink }}>{formatCompactMetricValue(item.value)}</span>
        </span>
      ))}
    </span>
  );
}

function previewMetrics(descriptor: TargetDescriptor | null | undefined) {
  if (!descriptor) return [];
  return [
    <MetricChip key="likes" kind="likes" value={descriptor.engagement.likes} present={descriptor.engagement_present.likes} />,
    <MetricChip key="comments" kind="comments" value={descriptor.engagement.comments} present={descriptor.engagement_present.comments} />,
    <MetricChip key="reposts" kind="reposts" value={descriptor.engagement.reposts} present={descriptor.engagement_present.reposts} />,
    <MetricChip key="forwards" kind="forwards" value={descriptor.engagement.forwards} present={descriptor.engagement_present.forwards} />
  ];
}

function avatarFromAuthor(author: string | null | undefined) {
  const cleaned = (author || "").trim();
  return cleaned ? cleaned.slice(0, 1).toUpperCase() : "D";
}

/* ─── Utility helpers ─── */

export function lineClamp(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
    overflow: "hidden"
  };
}

export function skeletonBlockStyle(
  width: string,
  height: number,
  extra?: CSSProperties
): CSSProperties {
  return {
    width,
    height,
    display: "block",
    borderRadius: tokens.radius.sm,
    background: `linear-gradient(90deg, ${tokens.color.neutralSurfaceSoft} 0%, ${tokens.color.contextSurface} 50%, ${tokens.color.neutralSurfaceSoft} 100%)`,
    backgroundSize: "180% 100%",
    animation: "dlens-popup-shimmer 1.6s linear infinite",
    ...extra
  };
}

export function viewRootStyle(extra?: CSSProperties): CSSProperties {
  return {
    display: "grid",
    gap: tokens.spacing.lg,
    minWidth: 0,
    overflowX: "clip",
    ...extra
  };
}

/** Thin glass panel — the base building block */
export function surfaceCardStyle(extra?: CSSProperties): CSSProperties {
  return {
    padding: tokens.spacing.section,
    borderRadius: tokens.radius.card,
    overflow: "hidden",
    background: `linear-gradient(180deg, ${tokens.color.focusedSurface}, ${tokens.color.contentSurface})`,
    backdropFilter: tokens.effect.glassBlur,
    WebkitBackdropFilter: tokens.effect.glassBlur,
    border: `1px solid ${tokens.color.line}`,
    boxShadow: tokens.shadow.shell,
    transition: tokens.motion.interactiveTransition,
    ...extra
  };
}

/** Row grammar — for scan-page list items (Inbox, Library, Casebook, Product list) */
export function scanRowStyle(extra?: CSSProperties): CSSProperties {
  return {
    display: "flex",
    alignItems: "baseline",
    gap: tokens.spacing.sm,
    padding: "10px 4px",
    borderBottom: `1px solid ${tokens.color.line}`,
    background: "transparent",
    transition: "background 140ms ease",
    cursor: "default",
    ...extra
  };
}

/** Hover state for interactive scan rows */
export const SCAN_ROW_HOVER_CSS = `
[data-dlens-control="true"] [data-scan-list] [data-scan-row]:hover {
  background: rgba(27, 26, 23, 0.028);
}
[data-dlens-control="true"] [data-scan-list] [data-scan-row]:last-child {
  border-bottom: 0;
}
`;

export const DLENS_BUTTON_CSS = `
[data-dlens-control="true"] [data-dlens-button] {
  transition: ${tokens.motion.preset.buttonPress};
}
[data-dlens-control="true"] [data-dlens-button]:not(:disabled):hover {
  transform: translateY(-1px);
}
[data-dlens-control="true"] [data-dlens-button]:not(:disabled):active {
  transform: translateY(0) scale(0.96);
  transition: transform 90ms ${tokens.motion.easing.standard}, background-color 140ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-dlens-button]:focus-visible {
  outline: 2px solid var(--dlens-mode-accent, ${tokens.color.accent});
  outline-offset: 2px;
}
[data-dlens-control="true"] [data-dlens-button="primary"]:not(:disabled):hover {
  box-shadow: 0 8px 20px rgba(27, 26, 23, 0.18);
  filter: brightness(1.05);
}
[data-dlens-control="true"] [data-dlens-button="secondary"]:not(:disabled):hover {
  background: var(--dlens-mode-accent-soft, ${tokens.color.accentSoft});
  border-color: var(--dlens-mode-hover-border-soft, ${tokens.color.lineStrong});
}
@media (prefers-reduced-motion: reduce) {
  [data-dlens-control="true"] [data-dlens-button],
  [data-dlens-control="true"] [data-dlens-button]:not(:disabled):active {
    transition: background-color 140ms ${tokens.motion.easing.standard}, box-shadow 140ms ${tokens.motion.easing.standard}, border-color 140ms ${tokens.motion.easing.standard} !important;
  }
  [data-dlens-control="true"] [data-dlens-button]:not(:disabled):hover,
  [data-dlens-control="true"] [data-dlens-button]:not(:disabled):active {
    transform: none !important;
  }
}
`;

type PrimaryWorkspaceMode = Exclude<WorkspaceMode, "result">;

type RailTier = "primary" | "tool";

const PRIMARY_WORKSPACE_MODES: ReadonlyArray<{ key: PrimaryWorkspaceMode; label: string; tier?: RailTier }> = [
  { key: "collect", label: "採集" },
  { key: "casebook", label: "主題" },
  { key: "inbox", label: "收件匣" },
  { key: "library", label: "脈絡" },
  { key: "compare", label: "比較", tier: "tool" },
  { key: "saved-signals", label: "訊號" },
  { key: "classification", label: "分類" },
  { key: "actionable-filter", label: "行動" },
  { key: "pr-evidence", label: "PR" }
];

function railIcon(mode: PrimaryWorkspaceMode) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  switch (mode) {
    case "casebook":
      return <svg {...common}><path d="M6 5.5A2.5 2.5 0 0 1 8.5 3H18v17.5H8.5A2.5 2.5 0 0 0 6 23" /><path d="M6 5.5V23" /><path d="M10 8h5" /><path d="M10 12h5" /></svg>;
    case "inbox":
      return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m3 7 9 6 9-6" /></svg>;
    case "library":
      return <svg {...common}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><circle cx="6" cy="13" r="1.5" /><path d="M8 6h8" /><path d="M7 13l4 4" /><path d="M17 8l-4 9" /></svg>;
    case "compare":
      return <svg {...common}><path d="M12 3v18" /><path d="M3 12h18" /><path d="M7 7l-4 5 4 5" /><path d="M17 7l4 5-4 5" /></svg>;
    case "collect":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="1.5" /></svg>;
    case "saved-signals":
      return <svg {...common}><path d="M5 5h14v14H5z" /><path d="M8 9h8" /><path d="M8 13h5" /><path d="M8 17h3" /></svg>;
    case "classification":
      return <svg {...common}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>;
    case "actionable-filter":
      return <svg {...common}><path d="M3 4h18l-7 8v5l-4 2v-7z" /></svg>;
    case "pr-evidence":
      return <svg {...common}><path d="M5 4h14v16H5z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h4" /></svg>;
  }
}

export function WorkspaceShell({
  mode,
  folderMode,
  header,
  contextStrip,
  children
}: {
  mode: WorkspaceMode | "settings";
  folderMode?: "topic" | "product" | "archive" | "pr-evidence";
  header: ReactNode;
  contextStrip?: ReactNode;
  children: ReactNode;
}) {
  const modeBadge = folderMode === "topic"
    ? { label: "TOPIC", tint: tokens.color.accent }
    : folderMode === "product"
    ? { label: "PRODUCT", tint: tokens.color.product }
    : folderMode === "pr-evidence"
    ? { label: "PR", tint: tokens.color.teal }
    : folderMode === "archive"
    ? { label: "ARCHIVE", tint: tokens.color.softInk }
    : null;
  return (
    <div
      data-workspace-shell="compare-first"
      style={{
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
        gap: tokens.spacing.md,
        minWidth: 0,
        minHeight: "100%",
        flex: "1 1 auto"
      }}
    >
      <div
        data-shell-masthead="editorial"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px 8px",
          borderRadius: tokens.radius.card,
          border: `1px solid ${tokens.color.line}`,
          background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`,
          boxShadow: "0 1px 0 rgba(253,251,246,0.72), inset 0 1px 0 rgba(253,251,246,0.54)",
          color: tokens.color.subInk
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span data-dlens-wordmark="masthead" style={{ fontFamily: tokens.font.serif, fontSize: 20, lineHeight: 1, color: MODE_ACCENT, transition: tokens.motion.interactiveTransition }}>dlens</span>
          {modeBadge ? (
            <span
              data-mode-badge={modeBadge.label.toLowerCase()}
              style={{
                fontFamily: tokens.font.sans,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.6,
                color: modeBadge.tint,
                background: `${modeBadge.tint}14`,
                border: `1px solid ${modeBadge.tint}40`,
                borderRadius: 4,
                padding: "2px 6px",
                whiteSpace: "nowrap",
                lineHeight: 1.1
              }}
            >
              {modeBadge.label} MODE
            </span>
          ) : null}
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0, color: tokens.color.softInk }}>
            Annotated Field Guide
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: tokens.font.sans, fontSize: 10, color: tokens.color.softInk, whiteSpace: "nowrap" }}>
          <span>VOL.1</span>
          <span>NO.{mode === "result" ? "04" : mode === "compare" ? "03" : mode === "collect" ? "02" : mode === "settings" ? "05" : "01"}</span>
          <span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date())}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span title="Folder: dlens-product-latest">v.{BUILD_VERSION}</span>
        </div>
      </div>

      <div
        data-shell-frame="editorial"
        style={{
          display: "grid",
          gridTemplateColumns: "72px minmax(0, 1fr)",
          gap: tokens.spacing.md,
          minWidth: 0,
          minHeight: 0,
          alignItems: "start"
        }}
      >
        <header
          data-shell-header="workspace"
          style={{
            display: "grid",
            gap: 10,
            alignContent: "start",
            padding: "10px 8px 12px",
            borderRadius: tokens.radius.card,
            border: `1px solid ${tokens.color.line}`,
            background: `linear-gradient(180deg, ${tokens.color.surface}, ${tokens.color.contextSurface})`,
            boxShadow: tokens.shadow.glass,
            alignSelf: "start"
          }}
        >
          <div style={{ display: "grid", placeItems: "center", minHeight: 40 }}>
            <div
              aria-hidden="true"
              data-dlens-avatar="masthead"
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background: MODE_ACCENT,
                color: tokens.color.elevated,
                display: "grid",
                placeItems: "center",
                fontFamily: tokens.font.serif,
                fontSize: 21,
                lineHeight: 1,
                boxShadow: MODE_ACCENT_BUTTON_SHADOW,
                transition: tokens.motion.interactiveTransition
              }}
            >
              d
            </div>
          </div>
          {header}
        </header>

        <div data-shell-main="workspace" style={{ display: "grid", gap: tokens.spacing.md, minWidth: 0, minHeight: 0, alignContent: "start" }}>
          {contextStrip ? (
            <div data-shell-context-strip="processing">
              {contextStrip}
            </div>
          ) : null}

          <main data-workspace-mode={mode} style={{ display: "grid", minWidth: 0, minHeight: 0, alignContent: "start" }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export function ModeRail({
  activeMode,
  modes = PRIMARY_WORKSPACE_MODES.map((entry) => entry.key),
  badgeCounts,
  onSelect
}: {
  activeMode: PrimaryWorkspaceMode | null;
  modes?: PrimaryWorkspaceMode[];
  badgeCounts?: Partial<Record<PrimaryWorkspaceMode, number>>;
  onSelect: (mode: PrimaryWorkspaceMode) => void;
}) {
  const visibleModes = PRIMARY_WORKSPACE_MODES.filter((mode) => modes.includes(mode.key));
  const firstToolIndex = visibleModes.findIndex((mode) => mode.tier === "tool");

  return (
    <nav
      aria-label="Workspace modes"
      data-mode-rail="primary"
      style={{
        display: "grid",
        gap: 8,
        justifyItems: "center"
      }}
    >
      {visibleModes.map((mode, index) => (
        <span key={mode.key} style={{ display: "contents" }}>
          {firstToolIndex > 0 && index === firstToolIndex ? (
            <span
              aria-hidden="true"
              data-rail-divider="tool"
              style={{
                width: 28,
                height: 1,
                background: tokens.color.line,
                margin: "2px 0"
              }}
            />
          ) : null}
          <ModeRailButton
            mode={mode.key}
            label={mode.label}
            active={activeMode === mode.key}
            tier={mode.tier ?? "primary"}
            badgeCount={badgeCounts?.[mode.key]}
            onSelect={onSelect}
          />
        </span>
      ))}
    </nav>
  );
}

export function ModeRailButton({
  mode,
  label,
  active,
  tier = "primary",
  badgeCount,
  onSelect
}: {
  mode: PrimaryWorkspaceMode;
  label: string;
  active: boolean;
  tier?: "primary" | "tool";
  badgeCount?: number;
  onSelect: (mode: PrimaryWorkspaceMode) => void;
}) {
  const isTool = tier === "tool";
  const inactiveColor = isTool ? tokens.color.softInk : tokens.color.subInk;
  const showBadge = typeof badgeCount === "number" && badgeCount > 0;
  return (
    <button
      data-mode={mode}
      data-mode-active={active ? "true" : "false"}
      data-mode-tier={tier}
      data-mode-style="rail"
      onClick={() => onSelect(mode)}
      style={{
        position: "relative",
        width: "100%",
        border: `1px solid ${active ? tokens.color.lineStrong : "transparent"}`,
        borderRadius: tokens.radius.card,
        minHeight: isTool ? 52 : 58,
        padding: isTool ? "6px 6px" : "8px 6px",
        background: active ? tokens.color.elevated : "transparent",
        color: active ? tokens.color.ink : inactiveColor,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0,
        cursor: "pointer",
        boxShadow: active ? tokens.shadow.activeTab : "none",
        transition: tokens.motion.interactiveTransition,
        display: "grid",
        placeItems: "center",
        gap: 5,
        opacity: !active && isTool ? 0.72 : 1
      }}
    >
      <span data-rail-icon="true" style={{ display: "inline-flex", color: active ? MODE_ACCENT : inactiveColor }}>
        {railIcon(mode)}
      </span>
      <span>{label}</span>
      {showBadge ? (
        <span
          data-rail-badge="count"
          aria-label={`${badgeCount} items`}
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            minWidth: 14,
            height: 14,
            padding: "0 4px",
            borderRadius: 999,
            background: tokens.color.accent,
            color: tokens.color.elevated,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            boxShadow: "0 0 0 1.5px " + tokens.color.canvas
          }}
        >
          {(badgeCount ?? 0) > 99 ? "99+" : badgeCount}
        </span>
      ) : null}
    </button>
  );
}

export function UtilityEdge({
  active,
  onSelect
}: {
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      data-utility-edge="workspace"
      style={{
        display: "grid",
        alignItems: "end",
        paddingTop: 4
      }}
    >
      <button
        data-utility-action="settings"
        aria-pressed={active}
        onClick={onSelect}
        style={{
          border: `1px solid ${active ? tokens.color.lineStrong : tokens.color.line}`,
          borderRadius: tokens.radius.card,
          minHeight: 58,
          width: "100%",
          padding: "8px 6px",
          background: active ? tokens.color.elevated : tokens.color.utilitySurface,
          color: active ? tokens.color.ink : tokens.color.subInk,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0,
          display: "grid",
          placeItems: "center",
          gap: 5,
          cursor: "pointer",
          boxShadow: active ? tokens.shadow.activeTab : "none",
          transition: tokens.motion.interactiveTransition
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.4a1.7 1.7 0 0 0-.34-1.87L4.2 6.47a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 4.04 1.7 1.7 0 0 0 10 2.5V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8.4c.68.28 1.12.94 1.12 1.67 0 .73-.44 1.39-1.12 1.67" />
        </svg>
        <span>設定</span>
      </button>
    </div>
  );
}

export function WorkspaceSurface({
  tone = "content",
  children,
  style
}: {
  tone?: "content" | "focused" | "utility";
  children: ReactNode;
  style?: CSSProperties;
}) {
  let background: string | undefined;
  let boxShadow: CSSProperties["boxShadow"] = tokens.shadow.shell;

  if (tone === "utility") {
    background = `linear-gradient(180deg, ${tokens.color.utilitySurface}, ${tokens.color.contentSurface})`;
  }

  if (tone === "focused") {
    background = `linear-gradient(180deg, ${tokens.color.focusedSurface}, ${tokens.color.elevated})`;
    boxShadow = tokens.shadow.focusedSurface;
  }

  return (
    <section
      data-workspace-surface={tone}
      style={surfaceCardStyle({
        padding: tokens.spacing.section,
        background,
        boxShadow,
        minWidth: 0,
        ...style
      })}
    >
      {children}
    </section>
  );
}

/** HUD section label — uppercase, tracked, faint */
export function hudLabel(): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0,
    color: tokens.color.softInk
  };
}

export function Kicker({
  children,
  tone = "default"
}: {
  children: ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0,
        color: tone === "accent" ? MODE_ACCENT : tokens.color.softInk
      }}
    >
      {children}
    </span>
  );
}

export function Stamp({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning";
}) {
  const toneMap = {
    neutral: { background: tokens.color.neutralSurface, color: tokens.color.subInk },
    accent: { background: MODE_ACCENT_SOFT, color: MODE_ACCENT },
    success: { background: tokens.color.successSoft, color: tokens.color.success },
    warning: { background: tokens.color.queuedSoft, color: tokens.color.queued }
  } as const;
  const theme = toneMap[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 22,
        padding: "0 8px",
        borderRadius: 999,
        background: theme.background,
        color: theme.color,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0
      }}
    >
      {children}
    </span>
  );
}

export function SideMark({ tone = "accent" }: { tone?: "accent" | "muted" }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 3,
        alignSelf: "stretch",
        borderRadius: 999,
        background: tone === "accent" ? MODE_ACCENT : tokens.color.lineStrong
      }}
    />
  );
}

export function ModeHeader({
  mode,
  kicker,
  title,
  deck,
  stamp
}: {
  mode: string;
  kicker: string;
  title: string;
  deck: string;
  stamp?: ReactNode;
}) {
  return (
    <div
      data-mode-header={mode}
      style={{
        display: "grid",
        gap: 8,
        padding: "14px 16px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`,
        boxShadow: tokens.shadow.glass
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Kicker>{kicker}</Kicker>
        {stamp ?? null}
      </div>
      <div style={{ fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 24, lineHeight: 1, color: tokens.color.ink }}>
        {title}
      </div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk }}>
        {deck}
      </p>
    </div>
  );
}

export function formatElapsed(isoTime: string | null | undefined): string {
  if (!isoTime) return "just now";
  const diffMs = Date.now() - new Date(isoTime).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/* ─── Processing Tone ─── */

export function processingTone(workerStatus: WorkerStatus | null, ready: number, total: number, pending = 0) {
  if (total > 0 && ready >= 2 && ready === total) {
    return {
      background: tokens.color.successSoft,
      border: "rgba(52,211,153,0.18)",
      text: tokens.color.success
    };
  }
  if (workerStatus === "draining") {
    return {
      background: tokens.color.runningSoft,
      border: "rgba(96,165,250,0.18)",
      text: tokens.color.running
    };
  }
  if (pending > 0) {
    return {
      background: "rgba(255,149,0,0.07)",
      border: "rgba(255,149,0,0.18)",
      text: "#b06200"
    };
  }
  return {
    background: tokens.color.idleBg,
    border: tokens.color.idleBorder,
    text: tokens.color.softInk
  };
}

/* ─── Primary Button (slim, glowing) ─── */

export function PrimaryButton({
  children,
  onClick,
  disabled,
  style
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      data-dlens-button="primary"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        borderRadius: tokens.radius.pill,
        padding: "8px 14px",
        background: disabled
          ? tokens.color.disabledPrimary
          : `linear-gradient(135deg, ${MODE_ACCENT}, ${MODE_ACCENT_MID})`,
        color: tokens.color.elevated,
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : MODE_ACCENT_BUTTON_SHADOW,
        transition: tokens.motion.interactiveTransition,
        ...style
      }}
    >
      {children}
    </button>
  );
}

/* ─── Secondary Button (ghost outline) ─── */

export function SecondaryButton({
  children,
  onClick,
  disabled,
  style
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      data-dlens-button="secondary"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${tokens.color.glassBorder}`,
        borderRadius: tokens.radius.pill,
        padding: "7px 14px",
        background: tokens.color.surface,
        backdropFilter: tokens.effect.glassBlur,
        WebkitBackdropFilter: tokens.effect.glassBlur,
        color: disabled ? tokens.color.softInk : tokens.color.subInk,
        fontWeight: 500,
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: tokens.motion.interactiveTransition,
        ...style
      }}
    >
      {children}
    </button>
  );
}

/* ─── Tab Button (thin underline, not fat pill) ─── */

export function PageButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        border: "none",
        borderRadius: 0,
        padding: "8px 4px 10px",
        background: active ? tokens.color.elevated : "transparent",
        color: active ? tokens.color.ink : tokens.color.softInk,
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0,
        cursor: "pointer",
        transition: tokens.motion.interactiveTransition,
        borderBottom: active
          ? `2px solid ${MODE_ACCENT}`
          : "2px solid transparent",
        textTransform: "none" as const
      }}
    >
      {children}
    </button>
  );
}

/* ─── Preview Card (airy layout) ─── */

export function PreviewCard({
  descriptor,
  folderName,
  isSaved,
  onPrimary,
  onOpen
}: {
  descriptor: TargetDescriptor | null | undefined;
  folderName: string;
  isSaved: boolean;
  onPrimary: () => void;
  onOpen: () => void;
}) {
  const metrics = previewMetrics(descriptor);

  return (
    <div style={surfaceCardStyle({ display: "grid", gap: 10 })}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: tokens.radius.card,
            background: `linear-gradient(135deg, ${MODE_ACCENT}, ${MODE_ACCENT_MID})`,
            color: tokens.color.elevated,
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 15,
            flexShrink: 0,
            boxShadow: tokens.shadow.previewAvatar
          }}
        >
          {avatarFromAuthor(descriptor?.author_hint)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, color: TOKENS.softInk, marginBottom: 2, fontWeight: 500 }}>Current post preview</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{descriptor?.author_hint || "Hover a Threads post"}</div>
            {descriptor ? (
              <span
                style={{
                  background: isSaved ? TOKENS.successSoft : tokens.color.neutralSurfaceSoft,
                  color: isSaved ? TOKENS.success : TOKENS.softInk,
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0,
                  border: isSaved ? "1px solid rgba(5,150,105,0.2)" : "1px solid transparent"
                }}
              >
                {isSaved ? "Saved" : "Preview"}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 13, color: TOKENS.subInk, lineHeight: 1.55, ...lineClamp(2) }}>
            {descriptor?.text_snippet || "Collect mode will show a compact preview here without turning this into a reading panel."}
          </div>
        </div>
      </div>

      {metrics.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{metrics}</div> : null}

      <div style={{ fontSize: 12, color: TOKENS.softInk }}>
        Folder: <strong style={{ color: TOKENS.ink }}>{folderName}</strong>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <PrimaryButton onClick={onPrimary} disabled={!descriptor || isSaved}>
          Save to folder
        </PrimaryButton>
        <SecondaryButton onClick={onOpen} disabled={!descriptor?.post_url}>
          Open in Threads
        </SecondaryButton>
      </div>
    </div>
  );
}
