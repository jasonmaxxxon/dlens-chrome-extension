import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Banknote,
  Calendar,
  Clock,
  Compass,
  Eye,
  EyeOff,
  Flag,
  Flame,
  Ghost,
  Heart,
  HeartCrack,
  Key,
  Leaf,
  Lightbulb,
  Lock,
  Map as MapIcon,
  MessageCircle,
  MessageSquareWarning,
  Scale,
  Search,
  Shield,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User,
  UserX,
  Users,
  type LucideIcon
} from "lucide-react";

import type { EvidencePacket } from "../compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../compare/topic-audit-validator.ts";
import type { NarrativeLaneDetail } from "../viewmodel/narrative-lane-detail.ts";
import { modeThemes, tokens } from "./tokens";

const NARRATIVE_ICON_COMPONENTS: Record<string, LucideIcon> = {
  heart: Heart,
  "heart-crack": HeartCrack,
  users: Users,
  user: User,
  "user-x": UserX,
  "message-circle": MessageCircle,
  "message-square-warning": MessageSquareWarning,
  banknote: Banknote,
  scale: Scale,
  ban: Ban,
  "alert-triangle": AlertTriangle,
  shield: Shield,
  sparkles: Sparkles,
  ghost: Ghost,
  clock: Clock,
  calendar: Calendar,
  compass: Compass,
  map: MapIcon,
  lightbulb: Lightbulb,
  flag: Flag,
  flame: Flame,
  leaf: Leaf,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  activity: Activity,
  eye: Eye,
  "eye-off": EyeOff,
  lock: Lock,
  key: Key,
  search: Search
};

function resolveNarrativeIcon(name: string | undefined): LucideIcon {
  if (name && NARRATIVE_ICON_COMPONENTS[name]) return NARRATIVE_ICON_COMPONENTS[name];
  return MessageCircle;
}

export type TopicAuditReportStatus = "none" | "running" | "ready" | "failed" | "stale";

export interface TopicAuditSummary {
  reportStatus: TopicAuditReportStatus;
  analyzedCount: number;
  queuedCount: number;
  runningStage?: number;
  failedStage?: number;
  failedReason?: string;
  staleDelta?: { added: number; removed: number };
  generatedAt?: string;
  coverage?: string;
  flags?: TopicAuditValidationFlag[];
}

export interface ValidationCounts {
  fail: number;
  weak: number;
  scope: number;
}

export interface NarrativeLaneHint {
  id: string;
  label: string;
  signalRefs: string[];
  consensus: number;
  icon?: string;
}

const TOPIC = tokens.topicAccent;

export function countValidationFlags(flags: TopicAuditValidationFlag[] = []): ValidationCounts {
  return flags.reduce<ValidationCounts>((counts, flag) => {
    if (flag.severity === "FAIL") counts.fail += 1;
    if (flag.severity === "WEAK") counts.weak += 1;
    if (flag.severity === "SCOPE") counts.scope += 1;
    return counts;
  }, { fail: 0, weak: 0, scope: 0 });
}

export function Dot({ color, size = 6 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: tokens.radius.round,
        background: color,
        display: "inline-block",
        flexShrink: 0
      }}
    />
  );
}

export function TopicAuditStatusPill({ summary }: { summary: TopicAuditSummary }) {
  const statusMap: Record<TopicAuditReportStatus, { label: string; color: string; dot: string; bg: string }> = {
    ready: { label: "報告 已生成", color: TOPIC.primary, dot: TOPIC.primary, bg: TOPIC.tintSage },
    running: { label: "報告 生成中", color: TOPIC.warm, dot: TOPIC.warm, bg: TOPIC.tintAmber },
    none: { label: "報告 未生成", color: tokens.color.softInk, dot: tokens.color.softInk, bg: tokens.color.neutralSurface },
    failed: { label: "報告 失敗", color: TOPIC.fail, dot: TOPIC.fail, bg: TOPIC.failBg },
    stale: { label: "報告 過期", color: TOPIC.warm, dot: TOPIC.warm, bg: TOPIC.tintAmber }
  };
  const status = statusMap[summary.reportStatus];
  return (
    <span
      data-audit-status={summary.reportStatus}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: tokens.radius.round,
        background: status.bg,
        color: status.color,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap"
      }}
    >
      <Dot color={status.dot} />
      {status.label}
      {summary.reportStatus === "running" && summary.runningStage ? <span>P{summary.runningStage}</span> : null}
      {summary.reportStatus === "failed" && summary.failedStage ? <span>P{summary.failedStage}</span> : null}
      {summary.reportStatus === "stale" && summary.staleDelta ? <span>+{summary.staleDelta.added}</span> : null}
    </span>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  style
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      data-topic-audit-button="primary"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        borderRadius: tokens.radius.button,
        background: disabled ? tokens.color.disabledPrimary : TOPIC.primary,
        color: tokens.color.elevated,
        boxShadow: disabled ? "none" : tokens.shadow.topicCta,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: tokens.font.sans,
        fontSize: 12,
        fontWeight: 800,
        padding: "9px 12px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        transition: tokens.motion.interactiveTransitionFast,
        ...style
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  style
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      data-topic-audit-button="ghost"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${tokens.color.line}`,
        borderRadius: tokens.radius.button,
        background: tokens.color.surface,
        color: disabled ? tokens.color.softInk : TOPIC.primary,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: tokens.font.sans,
        fontSize: 12,
        fontWeight: 700,
        padding: "8px 12px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        ...style
      }}
    >
      {children}
    </button>
  );
}

export function ValidatorChip({
  topicId,
  flags = [],
  state = "validated",
  stale = false,
  onOpenReport
}: {
  topicId: string;
  flags?: TopicAuditValidationFlag[];
  state?: "pending" | "validated";
  stale?: boolean;
  onOpenReport?: (topicId: string) => void;
}) {
  const counts = countValidationFlags(flags);
  const pending = state === "pending";
  return (
    <button
      data-validator-chip="topic-audit"
      data-validator-chip-state={state}
      data-topic-id={topicId}
      data-stale={stale ? "true" : "false"}
      onClick={() => onOpenReport?.(topicId)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 9px",
        borderRadius: tokens.radius.round,
        border: "none",
        background: tokens.color.contextSurface,
        color: tokens.color.softInk,
        cursor: "pointer",
        opacity: stale ? 0.7 : 1,
        fontFamily: tokens.font.sans,
        fontSize: 10.5,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums"
      }}
    >
      {pending ? (
        <span style={{ color: tokens.color.softInk }}>pending</span>
      ) : (
        <>
          <span style={{ color: counts.fail > 0 ? TOPIC.fail : tokens.color.subInk }}>{counts.fail} FAIL</span>
          <span style={{ color: TOPIC.warm }}>{counts.weak} WEAK</span>
          <span style={{ color: TOPIC.primary }}>{counts.scope} SCOPE</span>
        </>
      )}
      <span aria-hidden="true">↗</span>
    </button>
  );
}

export function SectionLabel({
  kicker,
  hint,
  children
}: {
  kicker?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 3, marginBottom: 10 }}>
      {kicker ? (
        <div style={{ fontSize: 10.5, color: tokens.color.softInk, fontWeight: 700, letterSpacing: 0, textTransform: "uppercase" }}>
          {kicker}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 17, lineHeight: 1.25, color: tokens.color.ink, fontWeight: 500 }}>
          {children}
        </h3>
        {hint ? <span style={{ fontSize: 10.5, color: tokens.color.softInk, fontWeight: 400, letterSpacing: "0.005em" }}>{hint}</span> : null}
      </div>
    </div>
  );
}

const THEME_PALETTE = [
  { fg: TOPIC.warm, bg: TOPIC.tintAmber, border: tokens.color.queuedBorder },
  { fg: tokens.color.techniqueViolet, bg: tokens.color.techniqueVioletSoft, border: tokens.color.lineStrong },
  { fg: TOPIC.primaryDeep, bg: TOPIC.tintSage, border: tokens.color.successBorder },
  { fg: TOPIC.fail, bg: TOPIC.failBg, border: tokens.color.failedBorder },
  { fg: tokens.color.product, bg: tokens.color.productSoft, border: tokens.color.productGlow }
];

function themePaletteIndex(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return hash % THEME_PALETTE.length;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function consensusPercent(value: number): number {
  return Math.round(clampRatio(value) * 100);
}

function countLaneSources(signalRefs: readonly string[]): number {
  const sources = new Set<string>();
  for (const ref of signalRefs) {
    const code = ref.split(".")[0]?.trim();
    if (code) sources.add(code);
  }
  return sources.size || signalRefs.length;
}

export function ThemeChip({
  label,
  active,
  onClick
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const palette = THEME_PALETTE[themePaletteIndex(label)];
  const chipStyle: CSSProperties = {
    border: `1px solid ${active ? palette.fg : palette.border}`,
    borderRadius: 999,
    background: palette.bg,
    color: palette.fg,
    padding: "6px 13px",
    fontFamily: tokens.font.sans,
    fontSize: 12.5,
    fontWeight: 650,
    cursor: onClick ? "pointer" : "default",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    boxShadow: active ? `0 0 0 2px ${palette.bg}, 0 0 0 3px ${palette.fg}40` : "none"
  };
  const dot = (
    <span
      aria-hidden="true"
      style={{
        width: 7,
        height: 7,
        borderRadius: 999,
        background: palette.fg,
        opacity: 0.75
      }}
    />
  );
  if (!onClick) {
    return (
      <span data-theme-chip={label} data-active={active ? "true" : "false"} style={chipStyle}>
        {dot}
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-theme-chip={label}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      style={chipStyle}
    >
      {dot}
      {label}
    </button>
  );
}

function NarrativeLaneConsensusBar({
  laneId,
  percent,
  reportMarker = false
}: {
  laneId: string;
  percent: number;
  reportMarker?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-narrative-lane-consensus-bar={laneId}
      data-audit-report-lane-consensus-bar={reportMarker ? laneId : undefined}
      style={{
        position: "relative",
        height: 6,
        width: "100%",
        borderRadius: tokens.radius.round,
        background: tokens.color.neutralSurface,
        overflow: "hidden"
      }}
    >
      <span
        data-narrative-lane-consensus-fill={laneId}
        data-audit-report-lane-consensus-fill={reportMarker ? laneId : undefined}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${percent}%`,
          background: percent >= 60 ? TOPIC.primary : TOPIC.warm
        }}
      />
    </span>
  );
}

export function NarrativeLane({
  lane,
  active,
  onClick
}: {
  lane: NarrativeLaneHint;
  active?: boolean;
  onClick?: () => void;
}) {
  const Icon = resolveNarrativeIcon(lane.icon);
  const signalCount = countLaneSources(lane.signalRefs);
  const percent = consensusPercent(lane.consensus);
  return (
    <button
      data-narrative-lane={lane.id}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      style={{
        textAlign: "left",
        border: `1px solid ${active ? TOPIC.primaryGlow : tokens.color.line}`,
        borderRadius: tokens.radius.card,
        background: active ? TOPIC.tintSage : tokens.color.elevated,
        boxShadow: tokens.shadow.topicCard,
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "44px minmax(0, 1fr)",
        gap: 12,
        alignItems: "start",
        cursor: "pointer",
        fontFamily: tokens.font.sans
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: tokens.radius.card,
          background: active ? TOPIC.tintSageHi : TOPIC.tintSage,
          color: TOPIC.primaryDeep,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <span style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: tokens.color.ink, lineHeight: 1.35 }}>
          {lane.label}
        </span>
        <span data-narrative-lane-consensus={lane.id} style={{ display: "grid", gap: 5, minWidth: 0 }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", minWidth: 0 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: tokens.color.subInk }}>
              共識 {percent}% · {signalCount} 篇
            </span>
          </span>
          <NarrativeLaneConsensusBar laneId={lane.id} percent={percent} />
        </span>
        <span style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          {lane.signalRefs.slice(0, 6).map((ref) => (
            <span
              key={ref}
              style={{
                fontFamily: tokens.font.mono,
                fontSize: 10,
                color: TOPIC.primary,
                background: tokens.color.surface,
                border: `1px solid ${tokens.color.line}`,
                borderRadius: tokens.radius.round,
                padding: "1px 6px"
              }}
            >
              {ref}
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}

export function AuditReportNarrativeLanes({ lanes }: { lanes: NarrativeLaneHint[] }) {
  if (!lanes.length) return null;
  return (
    <div
      data-audit-report-narrative-lanes="true"
      style={{
        display: "grid",
        gap: 0,
        borderRadius: tokens.radius.card,
        background: tokens.color.elevated,
        boxShadow: tokens.shadow.topicCard,
        overflow: "hidden"
      }}
    >
      {lanes.map((lane, index) => {
        const signalCount = countLaneSources(lane.signalRefs);
        const percent = consensusPercent(lane.consensus);
        return (
          <div
            key={lane.id}
            data-audit-report-narrative-lane={lane.id}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 0.46fr) minmax(120px, 1fr) auto",
              gap: 12,
              alignItems: "center",
              padding: "10px 14px",
              borderTop: index === 0 ? "none" : `1px solid ${tokens.color.line}`
            }}
          >
            <span style={{ fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: tokens.color.ink }}>
              {lane.label}
            </span>
            <NarrativeLaneConsensusBar laneId={lane.id} percent={percent} reportMarker />
            <span style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.subInk, whiteSpace: "nowrap" }}>
              共識 {percent}% · {signalCount} 篇
            </span>
          </div>
        );
      })}
    </div>
  );
}

export type NewsroomRole = "main" | "counter";

const NEWSROOM_ROLE_META: Record<NewsroomRole, { label: string; fg: string; bg: string }> = {
  main: { label: "主敘事", fg: TOPIC.primaryDeep, bg: TOPIC.tintSage },
  counter: { label: "反向訊號", fg: TOPIC.warm, bg: TOPIC.tintAmber }
};

export function newsroomRoleForLane(consensus: number): NewsroomRole {
  return consensus >= 0.6 ? "main" : "counter";
}

/** Wraps a NarrativeLane with a newsroom role derived from the lane's real consensus value. */
export function NewsroomLane({
  lane,
  active,
  onClick
}: {
  lane: NarrativeLaneHint;
  active?: boolean;
  onClick?: () => void;
}) {
  const role = newsroomRoleForLane(lane.consensus);
  const meta = NEWSROOM_ROLE_META[role];
  return (
    <div data-topic-newsroom-signal="true" data-newsroom-role={role} style={{ display: "grid", gap: 6 }}>
      <span
        data-newsroom-role-label="true"
        style={{
          justifySelf: "start",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 9px",
          borderRadius: tokens.radius.round,
          background: meta.bg,
          color: meta.fg,
          fontFamily: tokens.font.sans,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.04em"
        }}
      >
        <Dot color={meta.fg} />
        {meta.label}
      </span>
      <NarrativeLane lane={lane} active={active} onClick={onClick} />
    </div>
  );
}

export interface NewsroomLadderSource {
  shortCode: string;
  text: string;
  author: string;
}

export interface NewsroomLadderQuote {
  shortCode: string;
  ordinal: "主" | "反";
  text: string;
  author: string;
}

/**
 * Builds the representative quote ladder (Frame 06) from real audit sources.
 * A source quote is "反" when it only belongs to a low-consensus (counter) lane;
 * mains lead, a counter is reserved for the last slot when one exists. No invented text.
 */
export function buildNewsroomLadder(
  lanes: NarrativeLaneHint[],
  sources: NewsroomLadderSource[],
  limit = 3
): NewsroomLadderQuote[] {
  const mainCodes = new Set<string>();
  const counterCodes = new Set<string>();
  for (const lane of lanes) {
    const target = lane.consensus >= 0.6 ? mainCodes : counterCodes;
    for (const ref of lane.signalRefs) {
      const code = ref.split(".")[0];
      if (code) target.add(code);
    }
  }
  const classified = sources
    .filter((source) => source.text.trim().length > 0)
    .map((source) => ({
      shortCode: source.shortCode,
      text: source.text.trim(),
      author: source.author || "unknown",
      ordinal: (counterCodes.has(source.shortCode) && !mainCodes.has(source.shortCode) ? "反" : "主") as "主" | "反"
    }));
  const mains = classified.filter((quote) => quote.ordinal === "主");
  const counters = classified.filter((quote) => quote.ordinal === "反");
  const reserved = counters.length > 0 ? 1 : 0;
  const ladder = mains.slice(0, Math.max(0, limit - reserved));
  for (const counter of counters) {
    if (ladder.length < limit) ladder.push(counter);
  }
  for (const main of mains.slice(Math.max(0, limit - reserved))) {
    if (ladder.length < limit) ladder.push(main);
  }
  return ladder;
}

/** Frame 06 representative quote ladder — original text first, author attribution kept. */
export function NewsroomLadder({ quotes, onOpenQuote }: { quotes: NewsroomLadderQuote[]; onOpenQuote?: (shortCode: string) => void }) {
  if (!quotes.length) {
    return null;
  }
  return (
    <details
      data-topic-newsroom-ladder="true"
      data-topic-newsroom-ladder-detail="collapsed"
      style={{
        padding: "11px 14px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.surface,
        display: "grid",
        gap: 7,
        fontFamily: tokens.font.sans
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          margin: 0,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: tokens.color.subInk,
          display: "flex",
          alignItems: "center",
          gap: 6
        }}
      >
        {quotes.length} 條代表 quote
        <span style={{ fontFamily: tokens.font.mono, fontSize: 9, color: TOPIC.primary, background: TOPIC.tintSage, border: `1px solid ${TOPIC.primaryGlow}`, padding: "1px 6px", borderRadius: 5 }}>
          representative
        </span>
      </summary>
      <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
        {quotes.map((quote) => {
          const isCounter = quote.ordinal === "反";
          const canOpen = Boolean(onOpenQuote);
          return (
            <div
              key={quote.shortCode}
              role={canOpen ? "button" : undefined}
              tabIndex={canOpen ? 0 : undefined}
              data-newsroom-ladder-quote={quote.shortCode}
              data-newsroom-ladder-ordinal={isCounter ? "counter" : "main"}
              onClick={() => onOpenQuote?.(quote.shortCode)}
              onKeyDown={(event) => {
                if (!canOpen) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenQuote?.(quote.shortCode);
                }
              }}
              style={{
                display: "flex",
                gap: 9,
                padding: "7px 9px",
                borderRadius: tokens.radius.xs,
                background: tokens.color.contextSurface,
                borderLeft: `2px solid ${isCounter ? tokens.color.failedBorderStrong : TOPIC.primaryGlow}`,
                cursor: canOpen ? "pointer" : "default"
              }}
            >
              <span style={{ fontFamily: tokens.font.mono, fontSize: 10, fontWeight: 500, color: isCounter ? tokens.color.failed : TOPIC.primary, flexShrink: 0, paddingTop: 1 }}>
                {quote.ordinal}
              </span>
              <p style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 12.5, lineHeight: 1.5, color: tokens.color.ink }}>
                {quote.text}
              </p>
              <span style={{ fontSize: 10, color: tokens.color.softInk, alignSelf: "center", flexShrink: 0 }}>
                @{quote.author}
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** Single uncertainty line for the newsroom block; renders nothing when there is nothing to flag. */
export function NewsroomUncertainty({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div
      data-topic-newsroom-uncertainty="true"
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "8px 12px",
        borderRadius: tokens.radius.card,
        background: TOPIC.tintAmber,
        border: `1px solid ${tokens.color.line}`,
        fontFamily: tokens.font.sans
      }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 800, color: TOPIC.warm, letterSpacing: "0.04em", flexShrink: 0 }}>
        待驗證
      </span>
      <span style={{ fontSize: 12, lineHeight: 1.5, color: tokens.color.subInk }}>
        {text}
      </span>
    </div>
  );
}

/**
 * Lane drill-down: when a narrative lane is opened, this reveals the substance
 * derived from that lane's real posts — recurring wording, representative
 * comments, and the loudest voices. No invented text; everything traces back to
 * captured packets and can be opened via the source quote.
 */
export function NarrativeLaneDetailPanel({
  detail,
  laneLabel,
  consensus,
  onOpenQuote
}: {
  detail: NarrativeLaneDetail;
  laneLabel: string;
  consensus: number;
  onOpenQuote?: (shortCode: string) => void;
}) {
  const blockLabelStyle = {
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    color: tokens.color.subInk
  };
  const statParts = [`${detail.postCount} 篇`];
  if (detail.commentCount > 0) statParts.push(`${detail.commentCount} 留言`);
  statParts.push(`共識 ${Math.round(consensus * 100)}%`);
  return (
    <section
      data-narrative-lane-detail={detail.laneId}
      style={{
        display: "grid",
        gap: 12,
        padding: "13px 15px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${TOPIC.primaryGlow}`,
        background: TOPIC.tintSage,
        boxShadow: tokens.shadow.topicCard,
        fontFamily: tokens.font.sans
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: tokens.color.ink, lineHeight: 1.3 }}>
          {laneLabel}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: tokens.color.softInk }}>
          {statParts.join("　·　")}
        </span>
      </div>

      {detail.keywords.length > 0 ? (
        <div style={{ display: "grid", gap: 5 }}>
          <span style={blockLabelStyle}>
            重複用字
            {detail.keywordsAreSparse ? (
              <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, color: tokens.color.softInk }}>
                {"　樣本少 · 為高頻詞"}
              </span>
            ) : null}
          </span>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {detail.keywords.map((keyword) => (
              <span
                key={keyword.term}
                data-lane-keyword={keyword.term}
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 4,
                  padding: "3px 9px",
                  borderRadius: tokens.radius.round,
                  background: tokens.color.elevated,
                  border: `1px solid ${TOPIC.primaryGlow}`,
                  fontSize: 12,
                  fontWeight: 700,
                  color: TOPIC.primaryDeep
                }}
              >
                {keyword.term}
                <span style={{ fontFamily: tokens.font.mono, fontSize: 9.5, fontWeight: 500, color: tokens.color.softInk }}>
                  {keyword.postCount > 1 ? `${keyword.postCount}篇` : `×${keyword.total}`}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {detail.comments.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <span style={blockLabelStyle}>{detail.commentCount > 0 ? "代表留言" : "代表原文"}</span>
          <div style={{ display: "grid", gap: 6 }}>
            {detail.comments.map((comment, index) => {
              const canOpen = Boolean(onOpenQuote);
              return (
                <div
                  key={`${comment.shortCode}-${index}`}
                  data-lane-comment={comment.shortCode}
                  data-lane-comment-kind={comment.kind}
                  role={canOpen ? "button" : undefined}
                  tabIndex={canOpen ? 0 : undefined}
                  onClick={() => onOpenQuote?.(comment.shortCode)}
                  onKeyDown={(event) => {
                    if (!canOpen) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenQuote?.(comment.shortCode);
                    }
                  }}
                  style={{
                    display: "grid",
                    gap: 4,
                    padding: "8px 10px",
                    borderRadius: tokens.radius.xs,
                    background: tokens.color.elevated,
                    borderLeft: `2px solid ${comment.kind === "reply" ? TOPIC.primaryGlow : tokens.color.lineStrong}`,
                    cursor: canOpen ? "pointer" : "default"
                  }}
                >
                  <p style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 12.5, lineHeight: 1.5, color: tokens.color.ink }}>
                    {comment.text}
                  </p>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 10, color: tokens.color.softInk }}>
                    <span style={{ fontWeight: 700 }}>
                      {comment.kind === "reply" ? "留言" : "原文"}
                    </span>
                    <span>@{comment.author}</span>
                    {typeof comment.likes === "number" && comment.likes > 0 ? <span>♥ {comment.likes}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {detail.voices.length > 0 ? (
        <div style={{ display: "grid", gap: 5 }}>
          <span style={blockLabelStyle}>主要聲音</span>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {detail.voices.map((voice) => {
              const total = voice.posts + voice.comments;
              return (
                <span
                  key={voice.handle}
                  data-lane-voice={voice.handle}
                  style={{
                    display: "inline-flex",
                    alignItems: "baseline",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: tokens.radius.round,
                    background: tokens.color.surface,
                    border: `1px solid ${tokens.color.line}`,
                    fontSize: 11,
                    color: tokens.color.subInk
                  }}
                >
                  <span style={{ fontWeight: 700, color: tokens.color.ink }}>@{voice.handle}</span>
                  {total > 1 ? (
                    <span style={{ fontFamily: tokens.font.mono, fontSize: 9.5, color: tokens.color.softInk }}>×{total}</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export type SourceRowReadingStatus = "ready" | "running" | "failed" | "pending" | "not_ready";

const MAX_TAGS_VISIBLE = 2;

function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1000) {
    const k = value / 1000;
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}

function formatRowDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function StatusDot({ status }: { status: SourceRowReadingStatus }) {
  if (status === "ready") {
    return (
      <span
        aria-hidden="true"
        data-source-row-dot="ready"
        style={{
          width: 7,
          height: 7,
          borderRadius: tokens.radius.round,
          background: TOPIC.primary,
          boxShadow: `0 0 0 3px ${TOPIC.primaryGlow}`,
          display: "inline-block",
          flexShrink: 0
        }}
      />
    );
  }
  if (status === "running") {
    return (
      <span
        aria-hidden="true"
        data-source-row-dot="running"
        style={{
          width: 7,
          height: 7,
          borderRadius: tokens.radius.round,
          background: TOPIC.warm,
          boxShadow: `0 0 0 3px ${tokens.color.queuedBorder}`,
          display: "inline-block",
          flexShrink: 0,
          animation: "dlens-source-row-pulse 1.4s ease-in-out infinite"
        }}
      />
    );
  }
  if (status === "failed") {
    return (
      <span
        aria-hidden="true"
        data-source-row-dot="failed"
        style={{
          width: 7,
          height: 7,
          borderRadius: tokens.radius.round,
          background: TOPIC.fail,
          boxShadow: `0 0 0 3px ${tokens.color.failedBorder}`,
          display: "inline-block",
          flexShrink: 0
        }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      data-source-row-dot="pending"
      style={{
        width: 7,
        height: 7,
        borderRadius: tokens.radius.round,
        background: "transparent",
        border: `1.5px solid ${tokens.color.lineStrong}`,
        display: "inline-block",
        flexShrink: 0,
        boxSizing: "border-box"
      }}
    />
  );
}

const SOURCE_ROW_CSS = `
@keyframes dlens-source-row-pulse {
  0%, 100% { box-shadow: 0 0 0 3px ${tokens.color.queuedBorder}; }
  50%      { box-shadow: 0 0 0 6px ${tokens.color.queuedWash}; }
}
`;

const Sep = () => (
  <span aria-hidden="true" style={{ color: tokens.color.lineStrong, fontWeight: 700 }}>·</span>
);

export function SourceRow({
  packet,
  active,
  readingStatus,
  tags,
  onOpen,
  onRunP1,
  isRunningP1
}: {
  packet: EvidencePacket;
  active?: boolean;
  readingStatus: SourceRowReadingStatus;
  tags?: readonly string[];
  onOpen?: () => void;
  onRunP1?: () => void;
  isRunningP1?: boolean;
}) {
  const opSnippet = (packet.opText || "資料不完整").replace(/\s+/g, " ").trim();
  const author = packet.opAuthor || "unknown";
  const canRunP1 = (readingStatus === "pending" || readingStatus === "failed") && Boolean(onRunP1);
  const isPending = readingStatus === "pending";
  const isRunning = readingStatus === "running";
  const isFailed = readingStatus === "failed";
  const isNotReady = readingStatus === "not_ready";
  const visibleTags = (tags ?? []).slice(0, MAX_TAGS_VISIBLE);
  const hiddenTagCount = Math.max(0, (tags?.length ?? 0) - visibleTags.length);
  const showAllTags = Boolean(active);
  const displayedTags = showAllTags ? (tags ?? []) : visibleTags;
  const showOverflow = !showAllTags && hiddenTagCount > 0;
  const formattedDate = formatRowDate(packet.capturedAt);
  const likesText = formatMetric(packet.opLikes);
  const commentsText = formatMetric(packet.commentCount);

  const codeColor = isPending || isNotReady ? tokens.color.softInk : TOPIC.primary;
  const authorColor = isPending || isNotReady ? tokens.color.softInk : tokens.color.subInk;
  const previewColor = isPending || isNotReady ? tokens.color.softInk : tokens.color.subInk;
  const previewOpacity = isPending || isNotReady ? 0.72 : 1;

  return (
    <div
      data-source-row={packet.shortCode}
      data-active={active ? "true" : "false"}
      data-reading-status={readingStatus}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "14px minmax(0, 1fr)",
        gap: 8,
        padding: "9px 13px 10px",
        borderRadius: tokens.radius.xs,
        background: active ? tokens.color.cyanSoft : "transparent",
        fontFamily: tokens.font.sans,
        cursor: onOpen ? "pointer" : "default",
        transition: "background 140ms ease"
      }}
      onClick={onOpen}
    >
      <style>{SOURCE_ROW_CSS}</style>
      {active ? (
        <span
          aria-hidden="true"
          data-source-row-active-marker="true"
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 2,
            borderRadius: 2,
            background: TOPIC.primary
          }}
        />
      ) : null}
      <span style={{ display: "flex", justifyContent: "center", paddingTop: 7 }}>
        <StatusDot status={readingStatus} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignItems: "baseline",
            marginBottom: 4,
            lineHeight: 1.5
          }}
        >
          <span style={{ fontFamily: tokens.font.mono, fontSize: 10.5, fontWeight: 700, color: codeColor, letterSpacing: "0.04em" }}>
            {packet.shortCode}.OP
          </span>
          {isRunning ? (
            <span
              data-source-row-running-label="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontFamily: tokens.font.mono,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: TOPIC.warm,
                background: tokens.color.queuedSoft,
                padding: "1px 6px",
                borderRadius: 4
              }}
            >
              處理中
            </span>
          ) : null}
          {isFailed ? (
            <span
              data-source-row-failed-label="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontFamily: tokens.font.mono,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: TOPIC.fail,
                background: tokens.color.failedSoft,
                padding: "1px 6px",
                borderRadius: 4
              }}
            >
              失敗
            </span>
          ) : null}
          {isNotReady ? (
            <span
              data-source-row-not-ready-label="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontFamily: tokens.font.mono,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: tokens.color.softInk,
                background: tokens.color.contextSurface,
                padding: "1px 6px",
                borderRadius: 4
              }}
            >
              未抓取
            </span>
          ) : null}
          <Sep />
          <span style={{ fontSize: 11, color: authorColor, fontWeight: 600, ...lineClamp1() }}>
            @{author}
          </span>
          {formattedDate ? (
            <>
              <Sep />
              <span style={{ fontFamily: tokens.font.mono, fontSize: 10.5, color: tokens.color.softInk, letterSpacing: "0.02em" }}>
                {formattedDate}
              </span>
            </>
          ) : null}
          <Sep />
          <span
            aria-label="likes"
            data-source-row-metric="likes"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontFamily: tokens.font.mono,
              fontSize: 10.5,
              color: tokens.color.softInk,
              letterSpacing: "0.02em"
            }}
          >
            <Heart aria-hidden="true" size={10.5} strokeWidth={2.2} style={{ opacity: 0.65 }} />
            {likesText}
          </span>
          <Sep />
          <span
            aria-label="comments"
            data-source-row-metric="comments"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontFamily: tokens.font.mono,
              fontSize: 10.5,
              color: tokens.color.softInk,
              letterSpacing: "0.02em"
            }}
          >
            <MessageCircle aria-hidden="true" size={10.5} strokeWidth={2.2} style={{ opacity: 0.65 }} />
            {commentsText}
          </span>
          {canRunP1 ? (
            <button
              type="button"
              data-source-row-run-p1={packet.shortCode}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRunP1?.();
              }}
              disabled={isRunningP1}
              style={{
                marginLeft: "auto",
                border: `1px solid ${tokens.color.line}`,
                borderRadius: tokens.radius.button,
                background: tokens.color.surface,
                color: TOPIC.primary,
                padding: "2px 8px",
                fontSize: 10.5,
                fontWeight: 700,
                cursor: isRunningP1 ? "wait" : "pointer",
                fontFamily: tokens.font.sans
              }}
            >
              {isRunningP1 ? "處理中…" : "分析此篇"}
            </button>
          ) : null}
        </div>
        <div
          style={{
            fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`,
            fontSize: 13,
            lineHeight: 1.55,
            color: previewColor,
            opacity: previewOpacity,
            letterSpacing: "0.005em",
            ...lineClamp(2)
          }}
        >
          {opSnippet}
        </div>
        {displayedTags.length > 0 || showOverflow ? (
          <div
            data-source-row-tags="true"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginTop: 7,
              alignItems: "center"
            }}
          >
            {displayedTags.map((tag) => (
              <span
                key={tag}
                data-source-row-tag={tag}
                style={{
                  fontFamily: tokens.font.sans,
                  fontSize: 10,
                  fontWeight: 500,
                  color: active ? TOPIC.primaryDeep : tokens.color.tealMid,
                  background: active ? tokens.color.cyanSoft : modeThemes.topic.hoverSurfaceStrong,
                  padding: "1.5px 7px",
                  borderRadius: 4,
                  lineHeight: 1.5,
                  letterSpacing: "0.005em"
                }}
              >
                {tag}
              </span>
            ))}
            {showOverflow ? (
              <span
                data-source-row-tag-more="true"
                style={{
                  fontFamily: tokens.font.mono,
                  fontSize: 10,
                  fontWeight: 600,
                  color: tokens.color.softInk,
                  padding: "1.5px 5px",
                  letterSpacing: "0.04em"
                }}
              >
                +{hiddenTagCount}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function lineClamp1(): CSSProperties {
  return lineClamp(1);
}

function lineClamp(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
    overflow: "hidden",
    textOverflow: "ellipsis"
  };
}
