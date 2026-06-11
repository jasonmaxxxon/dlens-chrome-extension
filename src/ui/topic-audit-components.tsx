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
import { tokens } from "./tokens";

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
  { fg: "#7a4d27", bg: "#fdf3e6", border: "#f0d4ad" },
  { fg: "#5e3a76", bg: "#f4ebfa", border: "#dccaea" },
  { fg: TOPIC.primaryDeep, bg: TOPIC.tintSage, border: "#c8d8be" },
  { fg: "#8a3d3d", bg: "#fae6e3", border: "#ecc5c0" },
  { fg: "#2c4d6b", bg: "#e6eef5", border: "#c4d6e6" }
];

function themePaletteIndex(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return hash % THEME_PALETTE.length;
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
  return (
    <button
      data-theme-chip={label}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      style={{
        border: `1px solid ${active ? palette.fg : palette.border}`,
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        padding: "6px 13px",
        fontFamily: tokens.font.sans,
        fontSize: 12.5,
        fontWeight: 650,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        boxShadow: active ? `0 0 0 2px ${palette.bg}, 0 0 0 3px ${palette.fg}40` : "none",
        transition: "transform 120ms, box-shadow 120ms"
      }}
    >
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
      {label}
    </button>
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
  const signalCount = lane.signalRefs.length;
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
        <span style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: tokens.color.softInk }}>
            {signalCount} 訊號
          </span>
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
          boxShadow: `0 0 0 3px rgba(160,106,23,0.20)`,
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
          boxShadow: `0 0 0 3px rgba(168,70,46,0.18)`,
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
        border: "1.5px solid #c9c4b8",
        display: "inline-block",
        flexShrink: 0,
        boxSizing: "border-box"
      }}
    />
  );
}

const SOURCE_ROW_CSS = `
@keyframes dlens-source-row-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(160,106,23,0.20); }
  50%      { box-shadow: 0 0 0 6px rgba(160,106,23,0.06); }
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
        background: active ? "rgba(63,90,59,0.08)" : "transparent",
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
                background: "rgba(182,116,62,0.08)",
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
                background: "rgba(168,70,46,0.10)",
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
                  color: active ? TOPIC.primaryDeep : "#4e6849",
                  background: active ? "rgba(63,90,59,0.10)" : "rgba(63,90,59,0.06)",
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
