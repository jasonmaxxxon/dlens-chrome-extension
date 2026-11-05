import type { CSSProperties,MouseEvent,PointerEvent,ReactNode } from "react";
import { useEffect,useRef } from "react";

import { resolveBackendWorkCopy } from "../state/backend-work-copy.ts";
import type {
BackendReachability,
BackendWorkUiState,
WorkerStatus
} from "../state/processing-state.ts";
import { tokens } from "./tokens";
import { Heart, MessageCircle, Repeat2, Send, Eye } from "lucide-react";
import { ConnectionHealth, backendHost } from "./ConnectionHealth";
import { getProcessingFailureUiMessage } from "../state/processing-errors";


const p = tokens.panel;
const MODE_ACCENT = p.accent;
const MODE_ACCENT_SOFT = p.accentSoft;

/* ─── Metric Icons (SVG) ─── */

export function MetricIcon({ kind, size = p.size.icon }: {
  kind: "likes" | "comments" | "reposts" | "forwards" | "views";
  size?: number;
}) {
  const Icon = { likes: Heart, comments: MessageCircle, reposts: Repeat2, forwards: Send, views: Eye }[kind];
  return <Icon size={size} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />;
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
    fill: p.ink,
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
    gap: p.space.lg,
    minWidth: 0,
    overflowX: "clip",
    ...extra
  };
}

/** Shared opaque panel card; callers may adjust the content layout. */
export function surfaceCardStyle(extra?: CSSProperties): CSSProperties {
  return {
    padding: p.space.lg,
    borderRadius: p.radius.md,
    overflow: "hidden",
    background: p.surface,
    border: `1px solid ${p.border}`,
    boxShadow: p.shadow.card,
    transition: `transform ${p.motion.fast} ${p.motion.standard}, opacity ${p.motion.base} ${p.motion.standard}`,
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
  let background: string = p.surface;
  let boxShadow: string = p.shadow.card;

  if (tone === "utility") {
    background = p.surfaceSubtle;
  }

  if (tone === "focused") {
    background = p.surface;
    boxShadow = p.shadow.raised;
  }

  return (
    <section
      data-shared-surface-card={tone}
      {...dataAttrs}
      data-dlens-presence={dataAttrs?.["data-dlens-presence"] ?? "card"}
      style={surfaceCardStyle({
        padding: p.space.lg,
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
        gap: p.space.sm,
        marginBottom: p.space.md,
        flexWrap: "wrap",
        ...style
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: p.space.sm, flexWrap: "wrap", minWidth: 0 }}>
        <span
          style={{
            ...p.type.heading,
            fontFamily: tokens.font.sans,
            color: p.ink
          }}
        >
          {title}
        </span>
        {caption ? (
          <span
            style={{
              ...p.type.bodySm,
              fontFamily: tokens.font.sans,
              color: p.ink3
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
      return { color: p.success, background: p.successSoft, border: p.successSoft };
    case "warning":
      return { color: p.warning, background: p.warningSoft, border: p.warningSoft };
    case "danger":
      return { color: p.danger, background: p.dangerSoft, border: p.dangerSoft };
    case "info":
      return { color: MODE_ACCENT, background: MODE_ACCENT_SOFT, border: p.accentSoft };
    default:
      return { color: p.ink3, background: p.surfaceSubtle, border: p.borderStrong };
  }
}

export function StatusDot({
  tone = "neutral",
  label,
  size = p.size.statusDot
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
        borderRadius: p.radius.pill,
        background: theme.color,
        border: 0,
        flexShrink: 0
      }}
    />
  );
}

function reachabilityStatus(reachability: BackendReachability): { tone: StatusDotTone; label: string } {
  return reachability === "unreachable" ? { tone: "danger", label: "連唔到後端" }
    : reachability === "slow" ? { tone: "warning", label: "後端回應慢" }
    : { tone: "success", label: "後端已連線" };
}

function backendWorkStatus(state: BackendWorkUiState | null | undefined, workerStatus: WorkerStatus | null): { tone: StatusDotTone; label: string } {
  if (state?.kind === "backend_error") return { tone: "danger", label: `出錯：${getProcessingFailureUiMessage(resolveBackendWorkCopy(state)?.hint)}` };
  if (state?.kind === "analysis_failed") return { tone: "danger", label: "出錯：分析失敗" };
  if (state?.kind === "expired_running") return { tone: "danger", label: "出錯：處理逾時" };
  if (state?.kind === "retry_waiting") return { tone: "warning", label: "等重試" };
  if (state?.kind === "analysis_waiting" || state?.kind === "draining" || workerStatus === "draining") return { tone: "info", label: "處理緊" };
  return { tone: "neutral", label: "閒置" };
}

function localRetryTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export function StatusRail({
  backendReachability = "reachable", backendWorkUiState = null, workerStatus = null,
  ready, total, scopeLabel: _scopeLabel = "資料夾", hint, style, ingestBaseUrl
}: {
  backendReachability?: BackendReachability;
  backendWorkUiState?: BackendWorkUiState | null;
  workerStatus?: WorkerStatus | null;
  ready?: number; total?: number; scopeLabel?: string; hint?: string; style?: CSSProperties;
  ingestBaseUrl?: string | null;
}) {
  const reachability = reachabilityStatus(backendReachability);
  const work = backendWorkStatus(backendWorkUiState, workerStatus);
  const countLabel = ready !== undefined && total !== undefined ? `${ready}/${total} 篇讀完` : null;
  const active = work.tone === "info";
  const progress = total && total > 0 ? Math.min(1, Math.max(0, (ready ?? 0) / total)) : 0;
  const recoveryCopy = resolveBackendWorkCopy(backendWorkUiState);
  const nextRetry = backendWorkUiState?.kind === "retry_waiting" ? localRetryTime(backendWorkUiState.earliestRetryAt) : null;
  const workHint = hint ?? (recoveryCopy && backendWorkUiState?.kind === "retry_waiting"
    ? `${backendWorkUiState.count} 篇等重試${nextRetry ? ` · 約 ${nextRetry}` : ""}`
    : recoveryCopy && backendWorkUiState?.kind === "analysis_waiting" ? `${backendWorkUiState.count} 篇留言整理中`
    : recoveryCopy && backendWorkUiState?.kind === "analysis_failed" ? `${backendWorkUiState.count} 篇未能完成，打開貼文睇原因。`
    : recoveryCopy && backendWorkUiState?.kind === "expired_running" ? `${backendWorkUiState.count} 篇等重新處理。` : null);
  const hoverLabel = [reachability.label, backendHost(ingestBaseUrl), `處理：${work.label}`, countLabel, workHint].filter(Boolean).join(" · ");
  return <div data-status-rail="shared" data-status-rail-active={active} data-backend-reachability={backendReachability}
    data-backend-work-kind={backendWorkUiState?.kind ?? workerStatus ?? "idle"} tabIndex={0} aria-label={hoverLabel} title={hoverLabel}
    style={{ display: "grid", gap: p.space.sm, minWidth: 0, padding: p.space.sm, fontFamily: tokens.font.sans, fontVariantNumeric: "tabular-nums", ...style }}>
    <ConnectionHealth backendReachability={backendReachability} ingestBaseUrl={ingestBaseUrl} />
    <div style={{ ...p.type.meta, color: p.ink3, display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: p.space.xs, paddingLeft: p.size.statusDot + p.space.sm }}>
      <span data-status-dot={work.tone} aria-label={work.label} title={work.label}>處理：{work.label}</span>{countLabel ? <span>· {countLabel}</span> : null}
    </div>
    {workHint ? <div style={{ ...p.type.meta, color: work.tone === "danger" ? p.danger : p.ink3, paddingLeft: p.size.statusDot + p.space.sm, overflowWrap: "anywhere" }}>{workHint}</div> : null}
    {countLabel ? <span data-status-rail-disclosure="true" aria-hidden="true" style={{ display: "none" }}><span data-status-rail-progress="true"><span style={{ display: "block", width: `${progress * 100}%` }} /></span></span> : null}
  </div>;
}

/** Hover state for interactive scan rows */
export const SCAN_ROW_HOVER_CSS = `
[data-dlens-control="true"] [data-scan-list] [data-scan-row][data-scan-action="true"]:hover { background: ${p.surfaceSubtle}; }
[data-dlens-control="true"] [data-scan-list] [data-scan-row]:last-child { border-bottom: 0; }
`;

export const DLENS_BUTTON_CSS = `
[data-dlens-control="true"] [data-dlens-button],
[data-dlens-control="true"] [data-attention-button-beam="true"] { transition: transform ${p.motion.fast} ${p.motion.standard}, opacity ${p.motion.base} ${p.motion.standard}; }
[data-dlens-control="true"] [data-dlens-button]:not(:disabled):hover,
[data-dlens-control="true"] [data-attention-button-beam="true"]:hover { transform: none; }
[data-dlens-control="true"] [data-dlens-button]:not(:disabled):active,
[data-dlens-control="true"] [data-attention-button-beam="true"]:active { transform: scale(${p.motion.press}); }
[data-dlens-control="true"] [data-dlens-button]:focus-visible { outline: none; box-shadow: ${p.focusRing}; }
[data-dlens-control="true"] [data-dlens-button="primary"]:not(:disabled):hover { background: ${p.accentHover}; }
[data-dlens-control="true"] [data-dlens-button="secondary"]:not(:disabled):hover { background: ${p.surfaceSubtle}; border-color: ${p.borderStrong}; }
[data-dlens-control="true"] [data-attention-button-beam="true"] > [data-attention-button-content="true"]:not(:disabled):hover,
[data-dlens-control="true"] [data-attention-button-beam="true"] > [data-attention-button-content="true"]:not(:disabled):active { transform: none; filter: none; }
@media (prefers-reduced-motion: reduce) {
  [data-dlens-control="true"] [data-dlens-button],
  [data-dlens-control="true"] [data-dlens-button]:not(:disabled):hover,
  [data-dlens-control="true"] [data-dlens-button]:not(:disabled):active,
  [data-dlens-control="true"] [data-attention-button-beam="true"],
  [data-dlens-control="true"] [data-attention-button-beam="true"]:hover,
  [data-dlens-control="true"] [data-attention-button-beam="true"]:active { transition: none !important; transform: none !important; }
  [data-dlens-control="true"] [data-dlens-button],
  [data-dlens-control="true"] [data-workspace-mode-frame="true"] { animation: none !important; }
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
  let background: string = p.surface;
  let boxShadow: CSSProperties["boxShadow"] = p.shadow.card;

  if (tone === "utility") {
    background = p.surfaceSubtle;
  }

  if (tone === "focused") {
    background = p.surface;
    boxShadow = p.shadow.raised;
  }

  if (tone === "glass") {
    background = p.surface;
    boxShadow = p.shadow.card;
  }

  return (
    <section
      data-workspace-surface={tone}
      {...dataAttrs}
      style={surfaceCardStyle({
        padding: p.space.lg,
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
        gap: p.space.xs,
        ...p.type.micro,
        fontFamily: tokens.font.sans,
        color: tone === "accent" ? MODE_ACCENT : p.ink3
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
    neutral: { background: p.surfaceSubtle, color: p.ink2 },
    accent: { background: MODE_ACCENT_SOFT, color: MODE_ACCENT },
    success: { background: p.successSoft, color: p.success },
    warning: { background: p.warningSoft, color: p.warning }
  } as const;
  const theme = toneMap[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: p.size.chip,
        padding: `0 ${p.space.sm}px`,
        borderRadius: p.radius.xs,
        background: theme.background,
        color: theme.color,
        ...p.type.micro,
        fontFamily: tokens.font.sans
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
        gap: p.space.md,
        padding: `${p.space.sm}px 0 0`,
        minWidth: 0
      }}
    >
      <div style={{ display: "grid", gap: p.space.xs, minWidth: 0 }}>
        {kicker ? <Kicker>{kicker}</Kicker> : null}
        <h2 style={{ margin: 0, ...p.type.title, fontFamily: tokens.font.sans, color: p.ink }}>
          {title}
        </h2>
        <p style={{ margin: 0, ...p.type.bodySm, fontFamily: tokens.font.sans, color: p.ink3 }}>
          {deck}
        </p>
      </div>
      {stamp ? <div style={{ flexShrink: 0, alignSelf: "end", paddingBottom: p.space.xs }}>{stamp}</div> : null}
    </header>
  );
}

/* ─── Primary Button ─── */

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
        borderRadius: p.radius.sm,
        minHeight: p.size.button,
        padding: `0 ${p.space.md}px`,
        background: disabled
          ? p.surfaceSunken
          : MODE_ACCENT,
        color: disabled ? p.ink3 : p.surface,
        ...p.type.bodySm,
        fontFamily: tokens.font.sans,
        fontWeight: p.type.cardTitle.fontWeight,
        whiteSpace: "nowrap",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: "none",
        transition: `transform ${p.motion.fast} ${p.motion.standard}, opacity ${p.motion.base} ${p.motion.standard}`,
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
        border: `1px solid ${p.border}`,
        borderRadius: p.radius.sm,
        minHeight: p.size.button,
        padding: `0 ${p.space.md}px`,
        background: p.surface,
        color: disabled ? p.ink3 : p.ink2,
        ...p.type.bodySm,
        fontFamily: tokens.font.sans,
        fontWeight: p.type.meta.fontWeight,
        whiteSpace: "nowrap",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: 1,
        transition: `transform ${p.motion.fast} ${p.motion.standard}, opacity ${p.motion.base} ${p.motion.standard}`,
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
      style={{ display: "flex", gap: p.space.xxs, minWidth: 0, flexWrap: "wrap" }}
    >
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        const tone: SegmentedTabTone = tab.tone ?? "neutral";
        const countBg = active
          ? tone === "success"
            ? p.successSoft
            : tone === "accent"
              ? MODE_ACCENT_SOFT
              : p.surfaceSubtle
          : p.surfaceSubtle;
        const countInk = active && tone !== "neutral"
          ? tone === "success"
            ? p.success
            : MODE_ACCENT
          : p.ink3;
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
              color: active ? p.ink : p.ink3,
              padding: `${p.space.sm}px ${p.space.md}px`,
              minHeight: p.size.button,
              fontFamily: tokens.font.sans,
              ...p.type.meta,
              fontWeight: active ? p.type.cardTitle.fontWeight : p.type.meta.fontWeight,
              letterSpacing: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: p.space.sm,
              transition: `transform ${p.motion.fast} ${p.motion.standard}, opacity ${p.motion.base} ${p.motion.standard}`
            }}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                aria-hidden
                style={{
                  fontFamily: tokens.font.sans,
                  ...p.type.micro,
                  color: countInk,
                  padding: `${p.space.xxs}px ${p.space.sm}px`,
                  borderRadius: p.radius.pill,
                  background: countBg,
                  minWidth: p.size.chip,
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
