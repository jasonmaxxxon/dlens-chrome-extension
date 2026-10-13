import type { CSSProperties,MouseEvent,PointerEvent,ReactNode } from "react";
import { useEffect,useRef } from "react";

import { resolveBackendWorkCopy } from "../state/backend-work-copy.ts";
import type {
BackendReachability,
BackendWorkUiState,
WorkerStatus
} from "../state/processing-state.ts";
import { textStyles,tokens } from "./tokens";


const MODE_ACCENT = `var(--dlens-mode-accent, ${tokens.color.accent})`;
const MODE_ACCENT_MID = `var(--dlens-mode-accent-mid, ${tokens.color.accentMid})`;
const MODE_ACCENT_SOFT = `var(--dlens-mode-accent-soft, ${tokens.color.accentSoft})`;
const MODE_ACCENT_BUTTON_SHADOW = `var(--dlens-mode-accent-button-shadow, ${tokens.shadow.accentButton})`;

/* ─── Metric Icons (SVG) ─── */

export function MetricIcon({
  kind,
  size = 13
}: {
  kind: "likes" | "comments" | "reposts" | "forwards" | "views";
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
    case "views":
      return <svg {...common}><path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
  }
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

export type AttentionBeamState = "generating" | "actionable" | "none";

const ORB_SIZE = 16;

export function searchingOrbDotStyle(
  depth: number,
  boost: number
): { fill: string; alpha: number } {
  const normalizedDepth = Math.min(1, Math.max(0, depth));
  const normalizedBoost = Math.min(1, Math.max(0, boost));
  return {
    fill: tokens.color.ink,
    alpha: Math.min(1, 0.68 + 0.24 * normalizedDepth + 0.08 * normalizedBoost)
  };
}

/**
 * Paint one frame of the searching orb: a wireframe dot sphere with a highlight
 * band sweeping around it, so "AI is reading" reads as scanning rather than as a
 * generic spinner. Ported from the accepted
 * `docs/mockups/2026-07-23-product-action-deep-reading-orb-beam.html`, itself adapted
 * from Jakub Antalik's thinking-orbs. The depth ramp is a computed greyscale, so no
 * colour literal is hardcoded here.
 */
function paintSearchingOrb(ctx: CanvasRenderingContext2D, dpr: number, t: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ORB_SIZE, ORB_SIZE);
  const spin = 0.5;
  const centre = ORB_SIZE / 2;
  const radius = centre * 0.82;
  const tilt = 0.4 + 0.06 * Math.sin(t * 0.35);
  const sinTilt = Math.sin(tilt);
  const cosTilt = Math.cos(tilt);
  const sinYaw = Math.sin(t * spin);
  const cosYaw = Math.cos(t * spin);
  const scan = t * (spin + (1.7 - spin) * 4.335);
  const latRings = 6;
  const lonDensity = 14;
  const radiusScale = (ORB_SIZE / 300) ** 0.6;
  const dots: { x: number; y: number; z: number; r: number; depth: number; boost: number }[] = [];

  for (let latIndex = 0; latIndex <= latRings; latIndex += 1) {
    const lat = -Math.PI / 2 + (latIndex / latRings) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
    for (let lonIndex = 0; lonIndex < lonCount; lonIndex += 1) {
      const lon = (lonIndex / lonCount) * 2 * Math.PI;
      const x = cosLat * Math.cos(lon);
      const y = sinLat;
      const z = cosLat * Math.sin(lon);
      const xr = x * cosYaw + z * sinYaw;
      const zr = -x * sinYaw + z * cosYaw;
      const yr = y * cosTilt - zr * sinTilt;
      const depth = ((y * sinTilt + zr * cosTilt) + 1) / 2;
      const offset = lon + t * spin - scan;
      const delta = Math.atan2(Math.sin(offset), Math.cos(offset));
      const boost = Math.exp(-(delta * delta) / 0.18) * Math.max(0, zr);
      dots.push({
        x: centre + xr * radius,
        y: centre - yr * radius,
        z: y * sinTilt + zr * cosTilt,
        r: Math.max(0.3, (1.05 + 2.975 * depth + 1.75 * boost) * radiusScale),
        depth,
        boost
      });
    }
  }

  dots.sort((a, b) => a.z - b.z);
  for (const dot of dots) {
    const style = searchingOrbDotStyle(dot.depth, dot.boost);
    ctx.fillStyle = style.fill;
    ctx.globalAlpha = style.alpha;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function SearchingOrb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(ORB_SIZE * dpr);
    canvas.height = Math.round(ORB_SIZE * dpr);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paintSearchingOrb(ctx, dpr, 0.6);
      return;
    }

    let raf = 0;
    const loop = (now: number) => {
      paintSearchingOrb(ctx, dpr, (now / 1000) * 2.665);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} data-searching-orb="true" width={ORB_SIZE} height={ORB_SIZE} aria-hidden="true" />;
}

export function AttentionBeam({
  state,
  children,
  generatingLabel,
  style
}: {
  state: AttentionBeamState;
  children?: ReactNode;
  generatingLabel?: ReactNode;
  style?: CSSProperties;
}) {
  const generating = state === "generating";

  return (
    <span
      data-attention-beam={state}
      data-attention-beam-sweep={generating ? "true" : undefined}
      style={style}
    >
      {generating ? <SearchingOrb /> : null}
      {generating ? generatingLabel ?? children : children}
    </span>
  );
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
    borderRadius: tokens.radius.cardLg,
    overflow: "hidden",
    background: `linear-gradient(180deg, ${tokens.color.focusedSurface}, ${tokens.color.contentSurface})`,
    backdropFilter: tokens.effect.glassBlur,
    WebkitBackdropFilter: tokens.effect.glassBlur,
    border: `1px solid ${tokens.color.cardEdge}`,
    boxShadow: tokens.shadow.shell,
    transition: tokens.motion.interactiveTransition,
    ...extra
  };
}

export type SurfaceCardTone = "default" | "utility" | "focused";

export function SurfaceCard({
  children,
  tone = "default",
  style,
  dataAttrs
}: {
  children: ReactNode;
  tone?: SurfaceCardTone;
  style?: CSSProperties;
  dataAttrs?: Record<string, string>;
}) {
  let background: string = `linear-gradient(180deg, ${tokens.color.focusedSurface}, ${tokens.color.contentSurface})`;
  let boxShadow: string = tokens.shadow.shell;

  if (tone === "utility") {
    background = `linear-gradient(180deg, ${tokens.color.utilitySurface}, ${tokens.color.contentSurface})`;
  }

  if (tone === "focused") {
    background = `linear-gradient(180deg, ${tokens.color.focusedSurface}, ${tokens.color.elevated})`;
    boxShadow = tokens.shadow.focusedSurface;
  }

  return (
    <section
      data-shared-surface-card={tone}
      {...dataAttrs}
      data-dlens-presence={dataAttrs?.["data-dlens-presence"] ?? "card"}
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

export function SectionHeader({
  title,
  caption,
  action,
  style
}: {
  title: string;
  caption?: ReactNode;
  action?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      data-section-header="shared"
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        marginBottom: 12,
        flexWrap: "wrap",
        ...style
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
        <span
          style={{
            fontFamily: `${tokens.font.serif}, ${tokens.font.serifCjk}`,
            fontSize: 16,
            color: tokens.color.ink,
            fontWeight: 700,
            lineHeight: 1.3
          }}
        >
          {title}
        </span>
        {caption ? (
          <span
            style={{
              ...textStyles.mono,
              fontSize: textStyles.caption.fontSize,
              lineHeight: textStyles.caption.lineHeight,
              fontWeight: 500,
              color: tokens.color.softInk,
              letterSpacing: "0.04em"
            }}
          >
            {caption}
          </span>
        ) : null}
      </div>
      {action ? (
        <>
          <span style={{ flex: 1 }} />
          {action}
        </>
      ) : null}
    </div>
  );
}

export type StatusDotTone = "success" | "warning" | "danger" | "info" | "neutral";

function statusDotTheme(tone: StatusDotTone) {
  switch (tone) {
    case "success":
      return { color: tokens.color.success, background: tokens.color.successSoft, border: tokens.color.successBorder };
    case "warning":
      return { color: tokens.color.queued, background: tokens.color.queuedSoft, border: tokens.color.queuedBorder };
    case "danger":
      return { color: tokens.color.failed, background: tokens.color.failedSoft, border: tokens.color.failedBorder };
    case "info":
      return { color: MODE_ACCENT, background: MODE_ACCENT_SOFT, border: tokens.color.runningBorder };
    default:
      return { color: tokens.color.softInk, background: tokens.color.neutralSurfaceSoft, border: tokens.color.lineStrong };
  }
}

export function StatusDot({
  tone = "neutral",
  label,
  size = 10
}: {
  tone?: StatusDotTone;
  label: string;
  size?: number;
}) {
  const theme = statusDotTheme(tone);
  return (
    <span
      data-status-dot={tone}
      aria-label={label}
      title={label}
      style={{
        width: size,
        height: size,
        borderRadius: tokens.radius.round,
        background: theme.color,
        border: `2px solid ${theme.background}`,
        boxShadow: `0 0 0 1px ${theme.border}`,
        flexShrink: 0
      }}
    />
  );
}

function reachabilityStatus(reachability: BackendReachability): { tone: StatusDotTone; label: string } {
  switch (reachability) {
    case "slow":
      return { tone: "warning", label: "Backend slow" };
    case "unreachable":
      return { tone: "danger", label: "Backend unreachable" };
    default:
      return { tone: "success", label: "Backend reachable" };
  }
}

function backendWorkStatus(state: BackendWorkUiState | null | undefined, workerStatus: WorkerStatus | null): { tone: StatusDotTone; label: string } {
  if (state?.kind === "backend_error" || state?.kind === "analysis_failed" || state?.kind === "expired_running") {
    return { tone: "danger", label: state.kind };
  }
  if (state?.kind === "retry_waiting") {
    return { tone: "warning", label: "retry_waiting" };
  }
  if (state?.kind === "analysis_waiting" || state?.kind === "draining" || workerStatus === "draining") {
    return { tone: "info", label: state?.kind ?? "draining" };
  }
  return { tone: "neutral", label: "idle" };
}

export function StatusRail({
  backendReachability = "reachable",
  backendWorkUiState = null,
  workerStatus = null,
  ready,
  total,
  scopeLabel = "資料夾",
  hint,
  style
}: {
  backendReachability?: BackendReachability;
  backendWorkUiState?: BackendWorkUiState | null;
  workerStatus?: WorkerStatus | null;
  ready?: number;
  total?: number;
  scopeLabel?: string;
  hint?: string;
  style?: CSSProperties;
}) {
  const reachability = reachabilityStatus(backendReachability);
  const work = backendWorkStatus(backendWorkUiState, workerStatus);
  const recoveryCopy = resolveBackendWorkCopy(backendWorkUiState);
  const resolvedHint = hint
    ?? (backendReachability === "reachable" ? recoveryCopy?.headline ?? work.label : reachability.label);
  const countLabel = ready !== undefined && total !== undefined ? `${scopeLabel} ${ready}/${total} ready` : null;
  const workKind = backendWorkUiState?.kind;
  const active = work.tone === "info";
  const progress = total && total > 0
    ? Math.min(1, Math.max(0, (ready ?? 0) / total))
    : 0;
  const workDetail = recoveryCopy
    ? `${recoveryCopy.headline}${recoveryCopy.hint ? ` - ${recoveryCopy.hint}` : ""}`
    : work.label;
  const hoverLabel = `Backend: ${reachability.label} | Work: ${workDetail}${countLabel ? ` | Items: ${countLabel}` : ""}`;

  return (
    <div
      data-status-rail="shared"
      data-status-rail-active={active}
      data-backend-reachability={backendReachability}
      data-backend-work-kind={workKind ?? workerStatus ?? "idle"}
      tabIndex={0}
      aria-label={hoverLabel}
      title={hoverLabel}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: tokens.spacing.sm,
        minWidth: 0,
        padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`,
        borderRadius: tokens.radius.pill,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.contextSurface,
        ...style
      }}
    >
      <StatusDot tone={reachability.tone} label={reachability.label} />
      <span style={{ display: "inline-flex", animation: active ? tokens.motion.keyframes.pulse : undefined }}>
        <StatusDot tone={work.tone} label={work.label} size={tokens.spacing.sm} />
      </span>
      <span style={{ ...textStyles.caption, color: tokens.color.subInk, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {resolvedHint}
      </span>
      {countLabel ? (
        <span style={{ ...textStyles.metric, marginLeft: "auto", color: tokens.color.softInk, whiteSpace: "nowrap" }}>
          {countLabel}
        </span>
      ) : null}
      {countLabel ? (
        <span
          data-status-rail-disclosure="true"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "none",
            gap: tokens.spacing.xs,
            padding: tokens.spacing.xs,
            borderRadius: tokens.radius.pill,
            background: tokens.color.elevated
          }}
        >
          <span style={{ ...textStyles.caption, color: tokens.color.subInk, overflow: "hidden", whiteSpace: "nowrap" }}>
            {backendReachability === "reachable" ? work.label : reachability.label}·{countLabel}
          </span>
          <span
            data-status-rail-progress="true"
            style={{ height: tokens.spacing.xs, borderRadius: tokens.radius.round, background: tokens.color.neutralSurface, overflow: "hidden" }}
          >
            <span style={{ display: "block", width: `${progress * 100}%`, height: "100%", background: MODE_ACCENT }} />
          </span>
        </span>
      ) : null}
    </div>
  );
}

/** Hover state for interactive scan rows */
export const SCAN_ROW_HOVER_CSS = `
[data-dlens-control="true"] [data-scan-list] [data-scan-row]:not(.dlens-card-lift):not(.dlens-tactile-row) {
  transition: background-color ${tokens.motion.duration.fast} ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-scan-list] [data-scan-row][data-scan-action="true"]:hover {
  background: ${tokens.color.inkWash};
}
[data-dlens-control="true"] [data-scan-list] [data-scan-row]:last-child {
  border-bottom: 0;
}
`;

export const DLENS_BUTTON_CSS = `
[data-status-rail]:is(:hover,:focus-visible)>[data-status-rail-disclosure]{display:grid}
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
  transform: translateY(-3px);
  box-shadow: ${tokens.shadow.cardLiftHover};
  filter: brightness(1.05);
}
[data-dlens-control="true"] [data-dlens-button="primary"]:not(:disabled):active {
  transform: translateY(0) scale(0.93);
  transition: transform 90ms ${tokens.motion.easing.standard}, box-shadow 140ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-dlens-button="secondary"]:not(:disabled):hover {
  background: var(--dlens-mode-accent-soft, ${tokens.color.accentSoft});
  border-color: var(--dlens-mode-hover-border-soft, ${tokens.color.lineStrong});
}
[data-dlens-control="true"] [data-attention-button-beam="true"] {
  transition: ${tokens.motion.preset.buttonPress};
}
[data-dlens-control="true"] [data-attention-button-beam="true"]:hover {
  transform: translateY(-3px);
  box-shadow: ${tokens.shadow.cardLiftHover};
  filter: brightness(1.05);
}
[data-dlens-control="true"] [data-attention-button-beam="true"]:active {
  transform: translateY(0) scale(0.93);
  transition: transform 90ms ${tokens.motion.easing.standard}, box-shadow 140ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-attention-button-beam="true"] > [data-attention-button-content="true"]:not(:disabled):hover,
[data-dlens-control="true"] [data-attention-button-beam="true"] > [data-attention-button-content="true"]:not(:disabled):active {
  transform: none;
  filter: none;
}
@media (prefers-reduced-motion: reduce) {
  [data-dlens-control="true"] [data-dlens-button],
  [data-dlens-control="true"] [data-dlens-button]:not(:disabled):active,
  [data-dlens-control="true"] [data-attention-button-beam="true"] {
    transition: background-color 140ms ${tokens.motion.easing.standard}, box-shadow 140ms ${tokens.motion.easing.standard}, border-color 140ms ${tokens.motion.easing.standard} !important;
  }
  [data-dlens-control="true"] [data-dlens-button]:not(:disabled):hover,
  [data-dlens-control="true"] [data-dlens-button]:not(:disabled):active,
  [data-dlens-control="true"] [data-attention-button-beam="true"]:hover,
  [data-dlens-control="true"] [data-attention-button-beam="true"]:active {
    transform: none !important;
  }
  [data-dlens-control="true"] [data-dlens-button],
  [data-dlens-control="true"] [data-workspace-mode-frame="true"] {
    animation: none !important;
  }
}
`;
export type WorkspaceMaterial = "paper" | "glass";

export function WorkspaceSurface({
  tone = "content",
  children,
  style,
  dataAttrs
}: {
  tone?: "content" | "focused" | "utility" | "glass";
  children: ReactNode;
  style?: CSSProperties;
  dataAttrs?: Record<string, string>;
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

  if (tone === "glass") {
    background = tokens.material.workspaceGlass.panel;
    boxShadow = tokens.material.workspaceGlass.panelShadow;
  }

  return (
    <section
      data-workspace-surface={tone}
      {...dataAttrs}
      style={surfaceCardStyle({
        padding: tokens.spacing.section,
        background,
        boxShadow,
        ...(tone === "glass" ? {
          border: `1px solid ${tokens.material.workspaceGlass.edge}`,
          backdropFilter: tokens.material.workspaceGlass.blur,
          WebkitBackdropFilter: tokens.material.workspaceGlass.blur
        } : {}),
        minWidth: 0,
        ...style
      })}
    >
      {children}
    </section>
  );
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

export function ModeHeader({
  mode,
  kicker,
  title,
  deck,
  stamp
}: {
  mode: string;
  kicker?: string;
  title: string;
  deck: string;
  stamp?: ReactNode;
}) {
  return (
    <header
      data-mode-header={mode}
      data-mode-intro="topic"
      style={{
        display: "flex",
        alignItems: "end",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 4px 0",
        minWidth: 0
      }}
    >
      <div style={{ display: "grid", gap: kicker ? 4 : 3, minWidth: 0 }}>
        {kicker ? <Kicker>{kicker}</Kicker> : null}
        <h2 style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 23, fontWeight: 900, lineHeight: 1.15, color: tokens.color.ink }}>
          {title}
        </h2>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: tokens.color.softInk }}>
          {deck}
        </p>
      </div>
      {stamp ? <div style={{ flexShrink: 0, alignSelf: "end", paddingBottom: 3 }}>{stamp}</div> : null}
    </header>
  );
}

/* ─── Primary Button (slim, glowing) ─── */

export function PrimaryButton({
  children,
  onClick,
  disabled,
  ariaBusy,
  style,
  dataAttrs,
  activateOnPointerDown = false
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaBusy?: boolean;
  style?: CSSProperties;
  dataAttrs?: Record<string, string>;
  activateOnPointerDown?: boolean;
}) {
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!activateOnPointerDown || disabled || event.button !== 0) {
      return;
    }
    onClick();
  };
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (activateOnPointerDown && event.detail !== 0) {
      return;
    }
    onClick();
  };
  return (
    <button
      data-dlens-button="primary"
      {...dataAttrs}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      disabled={disabled}
      aria-busy={ariaBusy ? "true" : undefined}
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
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
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
  ariaBusy,
  style,
  dataAttrs
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaBusy?: boolean;
  style?: CSSProperties;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <button
      data-dlens-button="secondary"
      {...dataAttrs}
      onClick={onClick}
      disabled={disabled}
      aria-busy={ariaBusy ? "true" : undefined}
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
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...style
      }}
    >
      {children}
    </button>
  );
}

export type SegmentedTabTone = "neutral" | "accent" | "success";

export interface SegmentedTabItem<T extends string = string> {
  id: T;
  label: string;
  count?: string;
  tone?: SegmentedTabTone;
}

export function SegmentedTabs<T extends string>({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  dataAttr
}: {
  tabs: ReadonlyArray<SegmentedTabItem<T>>;
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  dataAttr?: (id: T) => Record<string, string>;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{ display: "flex", gap: 2, minWidth: 0, flexWrap: "wrap" }}
    >
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        const tone: SegmentedTabTone = tab.tone ?? "neutral";
        const countBg = active
          ? tone === "success"
            ? tokens.color.successSoft
            : tone === "accent"
              ? MODE_ACCENT_SOFT
              : tokens.color.neutralSurface
          : tokens.color.neutralSurface;
        const countInk = active && tone !== "neutral"
          ? tone === "success"
            ? tokens.color.success
            : MODE_ACCENT
          : tokens.color.softInk;
        const extraData = dataAttr ? dataAttr(tab.id) : {};
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            {...extraData}
            style={{
              border: "none",
              borderBottom: `2px solid ${active ? MODE_ACCENT : "transparent"}`,
              marginBottom: -1,
              background: "transparent",
              color: active ? tokens.color.ink : tokens.color.softInk,
              padding: "10px 12px 12px",
              fontFamily: tokens.font.sans,
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              letterSpacing: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              transition: tokens.motion.interactiveTransition
            }}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                aria-hidden
                style={{
                  fontFamily: tokens.font.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  color: countInk,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: countBg,
                  minWidth: 22,
                  textAlign: "center",
                  letterSpacing: 0
                }}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
