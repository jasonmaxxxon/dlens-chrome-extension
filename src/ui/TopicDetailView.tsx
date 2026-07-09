import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
  TOPIC_SYNTHESIS_MIN_ANALYZED,
  TOPIC_SYNTHESIS_STALE_DELTA,
  topicSynthesisStaleReason
} from "../compare/topic-synthesis.ts";
import type { EvidencePacket, ReactionPattern, SignalReading, TopicAuditStageName } from "../compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../compare/topic-audit-validator.ts";
import { buildNarrativeLaneDetail, type NarrativeLaneDetail } from "../viewmodel/narrative-lane-detail.ts";
import { buildReactionPatternFullList } from "../viewmodel/reaction-pattern-full-list.ts";
import { buildReactionPatternDetail, type ReactionPatternDetail } from "../viewmodel/reaction-pattern-detail.ts";
import type {
  FolderMode,
  SavedAnalysisSnapshot,
  SignalTagsRecord,
  Topic,
  TopicSignalReading,
  TopicSignalStance,
  TopicSynthesis,
  TopicSynthesisLayout
} from "../state/types.ts";
import type {
  TopicAuditSourceViewModel,
  TopicDetailCommand,
  TopicDetailViewModel,
  TopicItemAnalysisState,
  SignalTagSummary,
  TopicSignalViewModel
} from "../viewmodel/topic-detail.ts";
import { Kicker, PrimaryButton, SCAN_ROW_HOVER_CSS, SecondaryButton, SectionHeader, Stamp, SurfaceCard, WorkspaceSurface, lineClamp, scanRowStyle, viewRootStyle } from "./components.tsx";
import { SignalDrawer } from "./SignalDrawer.tsx";
import type { BackendWorkUiState } from "../state/processing-state.ts";
import {
  buildEvidenceFragmentLookup,
  EvidenceProse,
  EvidenceRefChip,
  type EvidenceFragmentLookup
} from "./EvidenceRefChip.tsx";
import { textStyles, tokens } from "./tokens.ts";
import {
  countValidationFlags,
  GhostButton as AuditGhostButton,
  NarrativeLane,
  PrimaryButton as AuditPrimaryButton,
  ReactionPatternLane,
  SectionLabel,
  SourceRow,
  ThemeChip,
  TopicAuditStatusPill,
  ValidatorChip,
  type NarrativeLaneHint,
  type SourceRowReadingStatus,
  type TopicAuditSummary
} from "./topic-audit-components.tsx";
import { pickPrimaryJudgmentPair } from "./useTopicState.ts";

const TOPIC_MODE_ACCENT = `var(--dlens-mode-accent, ${tokens.topicAccent.primary})`;
const TOPIC_MODE_ACCENT_SOFT = `var(--dlens-mode-accent-soft, ${tokens.topicAccent.tintSage})`;

type AuditDetailState =
  | { kind: "reaction"; id: string }
  | { kind: "narrative"; id: string }
  | { kind: "source"; id: string }
  | null;

/**
 * Adapt a per-signal TopicSignalReading (cold-read stored per post) into the
 * audit-shaped SignalReading the SignalDrawer renders. Lets an already-analyzed
 * post show its claim + inline citations when drilled into before the full topic
 * audit runs. Returns null when there is no usable reading.
 */
function adaptTopicSignalReadingForDrawer(
  reading: TopicSignalReading | undefined,
  packet: EvidencePacket | null
): SignalReading | null {
  if (!reading || reading.status !== "complete" || !packet) {
    return null;
  }
  return {
    auditRunId: packet.auditRunId,
    inputHash: packet.inputHash,
    topicId: reading.topicId,
    signalId: reading.signalId,
    shortCode: packet.shortCode,
    reading: reading.reading,
    evidenceRefs: reading.evidenceRefs,
    watchNotes: reading.uncertainties,
    promptVersion: reading.promptVersion,
    model: reading.model,
    generatedAt: reading.generatedAt
  };
}

function shortCodeFromRef(ref: string): string {
  return ref.split(".")[0]?.trim() ?? "";
}

function orderedUnique(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function refsForPattern(pattern: { supportRefs: string[]; counterRefs: string[]; representativeRefs: string[]; counterRepresentativeRefs: string[] }): string[] {
  return orderedUnique([
    ...pattern.representativeRefs,
    ...pattern.supportRefs,
    ...pattern.counterRepresentativeRefs,
    ...pattern.counterRefs
  ]);
}

function sumLikesForRefs(refs: ReadonlyArray<string>, fragmentLookup: Map<string, EvidenceFragmentLookup>): number {
  return refs.reduce((sum, ref) => {
    const likes = fragmentLookup.get(ref)?.likes;
    return sum + (typeof likes === "number" ? likes : 0);
  }, 0);
}

function reactionPatternNumberRow(pattern: {
  nComments: number;
  nAuthors: number;
  coverageDenominator: number;
  counterRefs: string[];
  supportRefs: string[];
  representativeRefs: string[];
  counterRepresentativeRefs: string[];
}, fragmentLookup: Map<string, EvidenceFragmentLookup>): string {
  const denominator = Math.max(0, pattern.coverageDenominator);
  const likeSum = sumLikesForRefs(refsForPattern(pattern), fragmentLookup);
  const counterCount = orderedUnique(pattern.counterRefs).length;
  return `${pattern.nComments}/${denominator} 留言 · ${pattern.nAuthors} 作者 · ♥${likeSum} · ${counterCount} 反例`;
}

function postTotalFromEvidence(packets: ReadonlyArray<EvidencePacket>): number {
  return Math.max(1, new Set(packets.map((packet) => packet.shortCode).filter(Boolean)).size);
}

function readCommentCoverage({
  coverage,
  packets
}: {
  coverage: { readCommentCount: number; usableAudienceCommentCount: number; capturedCommentCount: number } | undefined;
  packets: ReadonlyArray<EvidencePacket>;
}): { read: number; usable: number; captured: number } {
  const captured = coverage?.capturedCommentCount ?? packets.reduce((sum, packet) => sum + (packet.commentCount ?? packet.replyFragments.length), 0);
  const usable = coverage?.usableAudienceCommentCount ?? captured;
  const read = coverage?.readCommentCount ?? usable;
  return { read, usable, captured };
}

function DetailCommentCard({
  refId,
  author,
  text,
  likes,
  kind
}: {
  refId: string;
  author: string;
  text: string;
  likes: number | null;
  kind: "representative" | "counter";
}) {
  return (
    <div
      data-audit-detail-comment={refId}
      data-audit-detail-comment-kind={kind}
      style={{
        display: "grid",
        gap: 4,
        padding: "9px 11px",
        borderRadius: tokens.radius.xs,
        background: tokens.color.elevated,
        borderLeft: `2px solid ${kind === "counter" ? tokens.color.failedBorderStrong : tokens.color.signalGlow}`
      }}
    >
      <p style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 12.5, lineHeight: 1.55, color: tokens.color.ink, ...lineClamp(3) }}>
        {text}
      </p>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10.5, color: tokens.color.softInk }}>
        <span style={{ fontFamily: tokens.font.mono, color: kind === "counter" ? tokens.color.failed : tokens.color.signalDeep }}>{refId}</span>
        <span>@{author}</span>
        {typeof likes === "number" ? <span>♥ {likes}</span> : null}
      </span>
    </div>
  );
}

function SourceDetailContent({
  packet,
  reading,
  fragmentLookup,
  pinnedRef,
  onPin
}: {
  packet: EvidencePacket;
  reading: SignalReading | null | undefined;
  fragmentLookup: Map<string, EvidenceFragmentLookup>;
  pinnedRef: string | null;
  onPin: (ref: string) => void;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  const replyCount = packet.replyFragments.length;
  return (
    <div data-audit-source-detail={packet.shortCode} style={{ display: "grid", gap: 12 }}>
      <section data-signal-drawer-block="op-card" style={{ display: "grid", gap: 7, padding: "11px 12px", borderRadius: tokens.radius.card, background: tokens.color.elevated, border: `1px solid ${tokens.color.line}` }}>
        <span style={{ fontFamily: tokens.font.mono, fontSize: 10.5, fontWeight: 800, color: tokens.color.signalDeep }}>來源 {packet.shortCode} · 原帖</span>
        <p style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 13.5, lineHeight: 1.55, color: tokens.color.ink }}>
          {packet.opText || "原帖內容不可得"}
        </p>
        <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>@{packet.opAuthor || "unknown"} · ♥ {packet.opLikes ?? "?"} · {packet.commentCount ?? replyCount} 留言</span>
      </section>
      {reading ? (
        <section data-signal-drawer-block="p1" style={{ display: "grid", gap: 8, padding: "11px 12px", borderRadius: tokens.radius.card, background: tokens.color.elevated, border: `1px solid ${tokens.color.line}` }}>
          <span style={{ fontFamily: tokens.font.mono, fontSize: 10, fontWeight: 800, color: tokens.color.signalDeep }}>P1 判讀</span>
          <p style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 13, lineHeight: 1.75, color: tokens.color.ink }}>
            <EvidenceProse prose={reading.reading} fragmentLookup={fragmentLookup} pinnedRef={pinnedRef} onPin={onPin} chipVariant="drawer" />
          </p>
        </section>
      ) : null}
      {replyCount > 0 ? (
        <section data-signal-drawer-block="raw" style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            data-raw-toggle="true"
            onClick={() => setRawOpen((current) => !current)}
            style={{
              width: "100%",
              border: `1px dashed ${tokens.color.lineStrong}`,
              borderRadius: tokens.radius.button,
              background: tokens.color.surface,
              color: tokens.color.softInk,
              fontFamily: tokens.font.mono,
              fontSize: 11,
              fontWeight: 700,
              padding: "8px 10px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between"
            }}
          >
            <span>留言串（{replyCount} 則）</span>
            <span aria-hidden="true">{rawOpen ? "收起" : "展開"}</span>
          </button>
          {rawOpen ? (
            <div data-raw-body="open" style={{ display: "grid", gap: 8, maxHeight: 280, overflowY: "auto" }}>
              {packet.replyFragments.map((fragment) => (
                <DetailCommentCard
                  key={fragment.ref}
                  refId={fragment.ref}
                  author={fragment.author || "unknown"}
                  text={fragment.text}
                  likes={fragment.likes}
                  kind="representative"
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function AuditDetailDrawer({
  activeDetail,
  reactionPattern,
  reactionDetail,
  narrativeLane,
  narrativeDetail,
  sourcePacket,
  sourceReading,
  fragmentLookup,
  pinnedRef,
  onPin,
  onClose,
  fullList,
  fullListOpen,
  onToggleFullList
}: {
  activeDetail: AuditDetailState;
  reactionPattern: ReactionPattern | null;
  reactionDetail: ReactionPatternDetail | null;
  narrativeLane: NarrativeLaneHint | null;
  narrativeDetail: NarrativeLaneDetail | null;
  sourcePacket: EvidencePacket | null;
  sourceReading: SignalReading | null | undefined;
  fragmentLookup: Map<string, EvidenceFragmentLookup>;
  pinnedRef: string | null;
  onPin: (ref: string) => void;
  onClose: () => void;
  fullList: ReturnType<typeof buildReactionPatternFullList> | null;
  fullListOpen: boolean;
  onToggleFullList: () => void;
}) {
  const open = Boolean(activeDetail);
  const kind = activeDetail?.kind ?? "none";
  const title = reactionPattern?.label ?? narrativeLane?.label ?? (sourcePacket ? `來源 ${sourcePacket.shortCode}` : "詳情");
  const reactionNumberRow = reactionPattern ? reactionPatternNumberRow(reactionPattern, fragmentLookup) : "";
  return (
    <>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          [data-audit-detail-drawer] { transition: transform ${tokens.motion.duration.slow} ${tokens.motion.easing.entrance}; }
          [data-audit-detail-scrim] { transition: opacity ${tokens.motion.duration.slow} ${tokens.motion.easing.standard}; }
        }
      `}</style>
      <div
        data-audit-detail-scrim="true"
        data-open={open ? "true" : "false"}
        onMouseDown={onClose}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483639,
          background: open ? tokens.color.inkWashStrong : "transparent",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none"
        }}
      />
      <aside
        data-audit-detail-drawer="true"
        data-open={open ? "true" : "false"}
        data-detail-kind={kind}
        role="dialog"
        aria-modal="true"
        aria-hidden={open ? "false" : "true"}
        style={{
          position: "fixed",
          top: 72,
          right: 18,
          bottom: 18,
          width: 390,
          maxWidth: "calc(100% - 36px)",
          zIndex: 2147483640,
          transform: open ? "translateX(0)" : "translateX(calc(100% + 28px))",
          borderRadius: tokens.radius.cardLg,
          border: `1px solid ${tokens.color.atlasEdge}`,
          background: tokens.color.atlasPaperStrong,
          boxShadow: tokens.shadow.atlasGlass,
          backdropFilter: tokens.effect.atlasBlur,
          WebkitBackdropFilter: tokens.effect.atlasBlur,
          color: tokens.color.ink,
          fontFamily: tokens.font.sans,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          pointerEvents: open ? "auto" : "none"
        }}
      >
        <header style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "flex-start", padding: "14px 16px 11px", borderBottom: `1px solid ${tokens.color.line}` }}>
          <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span style={{ ...textStyles.label, color: tokens.color.signalDeep }}>Signal Atlas · {kind}</span>
            <h2 style={{ ...textStyles.h3, margin: 0, color: tokens.color.ink }}>{title}</h2>
            {reactionNumberRow ? <span style={{ ...textStyles.metric, color: tokens.color.subInk }}>{reactionNumberRow}</span> : null}
            {narrativeLane?.metricLabel ? <span style={{ ...textStyles.metric, color: tokens.color.subInk }}>{narrativeLane.metricLabel}</span> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉詳情"
            style={{
              border: `1px solid ${tokens.color.line}`,
              borderRadius: tokens.radius.button,
              background: tokens.color.surface,
              color: tokens.color.subInk,
              fontSize: 12,
              fontWeight: 800,
              width: 30,
              height: 30,
              cursor: "pointer"
            }}
          >
            ×
          </button>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "grid", gap: 14, alignContent: "start" }}>
          {reactionPattern && reactionDetail ? (
            <>
              <section style={{ display: "grid", gap: 7 }}>
                <span style={{ ...textStyles.label, color: tokens.color.subInk }}>數字明細</span>
                <p style={{ margin: 0, ...textStyles.bodyTight, color: tokens.color.subInk }}>{reactionPattern.dynamicImplication}</p>
              </section>
              <section style={{ display: "grid", gap: 7 }}>
                <span style={{ ...textStyles.label, color: tokens.color.subInk }}>代表留言</span>
                {reactionDetail.representativeComments.map((comment) => (
                  <DetailCommentCard key={comment.ref} refId={comment.ref} author={comment.author} text={comment.text} likes={comment.likes} kind="representative" />
                ))}
              </section>
              <section style={{ display: "grid", gap: 7 }}>
                <span style={{ ...textStyles.label, color: tokens.color.subInk }}>反例</span>
                {reactionDetail.counterComments.length ? reactionDetail.counterComments.map((comment) => (
                  <DetailCommentCard key={comment.ref} refId={comment.ref} author={comment.author} text={comment.text} likes={comment.likes} kind="counter" />
                )) : <span style={{ ...textStyles.caption, color: tokens.color.softInk }}>沒有可解析反例</span>}
              </section>
              {fullList ? (
                <section style={{ display: "grid", gap: 8 }}>
                  <button
                    type="button"
                    data-audit-full-list-toggle={reactionPattern.id}
                    onClick={onToggleFullList}
                    style={{
                      border: `1px solid ${tokens.color.line}`,
                      borderRadius: tokens.radius.button,
                      background: tokens.color.surface,
                      color: tokens.color.signalDeep,
                      fontFamily: tokens.font.sans,
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "8px 10px",
                      cursor: "pointer"
                    }}
                  >
                    查看全部 {reactionPattern.nComments} 條 · {fullList.traceLabel}
                  </button>
                  {fullListOpen ? (
                    <div data-audit-full-list={fullList.path} style={{ display: "grid", gap: 10 }}>
                      {fullList.groups.map((group) => (
                        <div key={group.shortCode} data-audit-full-list-group={group.shortCode} style={{ display: "grid", gap: 6 }}>
                          <span style={{ ...textStyles.metric, color: tokens.color.subInk }}>{group.shortCode} · {group.comments.length} 條</span>
                          {group.comments.map((comment) => (
                            <DetailCommentCard key={comment.ref} refId={comment.ref} author={comment.author} text={comment.text} likes={comment.likes} kind="representative" />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
          {narrativeLane && narrativeDetail ? (
            <>
              <section style={{ display: "grid", gap: 7 }}>
                <span style={{ ...textStyles.label, color: tokens.color.subInk }}>數字明細</span>
                <p style={{ margin: 0, ...textStyles.bodyTight, color: tokens.color.subInk }}>
                  {narrativeLane.metricLabel} · {narrativeDetail.commentCount} 則可解析留言
                </p>
              </section>
              <section style={{ display: "grid", gap: 7 }}>
                <span style={{ ...textStyles.label, color: tokens.color.subInk }}>代表留言</span>
                {narrativeDetail.comments.slice(0, 3).map((comment) => (
                  <DetailCommentCard key={`${comment.shortCode}-${comment.text}`} refId={comment.shortCode} author={comment.author} text={comment.text} likes={comment.likes} kind="representative" />
                ))}
              </section>
              <section style={{ display: "grid", gap: 7 }}>
                <span style={{ ...textStyles.label, color: tokens.color.subInk }}>反例</span>
                <span style={{ ...textStyles.caption, color: tokens.color.softInk }}>敘事線反例目前由低跨帖或反向 pattern 承接。</span>
              </section>
            </>
          ) : null}
          {sourcePacket ? (
            <SourceDetailContent packet={sourcePacket} reading={sourceReading} fragmentLookup={fragmentLookup} pinnedRef={pinnedRef} onPin={onPin} />
          ) : null}
        </div>
      </aside>
    </>
  );
}

interface TopicDetailViewProps {
  viewModel: TopicDetailViewModel;
  onCommand: (command: TopicDetailCommand) => Promise<unknown> | unknown;
}

function readCommandResult(value: unknown): { ok: boolean; error?: string } | null {
  if (!value || typeof value !== "object" || !("ok" in value)) {
    return null;
  }
  const result = value as { ok?: unknown; error?: unknown };
  return {
    ok: result.ok === true,
    ...(typeof result.error === "string" ? { error: result.error } : {})
  };
}

function formatTopicDate(value: string): string {
  return new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function singleAnalyzeActionLabel(canStartProcessing: boolean): string {
  return canStartProcessing ? "開始分析" : "排隊分析";
}

function runSingleAnalyzeAction({
  itemId,
  isBulkAnalyzing,
  onAnalyzeItems,
  onQueueItemById
}: {
  itemId: string;
  isBulkAnalyzing?: boolean;
  onAnalyzeItems?: (itemIds: string[]) => Promise<{ ok: boolean; failedCount: number }>;
  onQueueItemById?: (itemId: string) => void;
}) {
  if (onAnalyzeItems) {
    if (!isBulkAnalyzing) {
      void onAnalyzeItems([itemId]);
    }
    return;
  }
  if (onQueueItemById) {
    onQueueItemById(itemId);
  }
}

function statusTone(status: Topic["status"]): "neutral" | "accent" | "success" | "warning" {
  switch (status) {
    case "watching":
      return "accent";
    case "learning":
      return "success";
    case "testing":
      return "warning";
    default:
      return "neutral";
  }
}

function analysisStateLabel(status: TopicItemAnalysisState | undefined): string {
  switch (status) {
    case "ready": return "已分析";
    case "analyzing": return "分析中";
    case "crawling": return "捕捉中";
    case "queued": return "排隊中";
    case "failed": return "分析失敗";
    default: return "未分析";
  }
}

function analysisStateTone(status: TopicItemAnalysisState | undefined): "neutral" | "accent" | "success" | "warning" {
  switch (status) {
    case "ready": return "success";
    case "analyzing":
    case "crawling":
    case "queued": return "accent";
    case "failed": return "warning";
    default: return "neutral";
  }
}

export function Breadcrumb({
  topicName,
  onBack
}: {
  topicName: string;
  onBack: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: tokens.color.subInk,
        fontSize: 11,
        fontWeight: 700
      }}
    >
      <span>← 主題</span>
      <span style={{ color: tokens.color.softInk }}>{topicName}</span>
    </button>
  );
}

export function PairRow({
  pair,
  onOpenPair
}: {
  pair: SavedAnalysisSnapshot;
  onOpenPair: (resultId: string) => void;
}) {
  return (
    <button
      type="button"
      className="dlens-card-lift"
      onClick={() => onOpenPair(pair.resultId)}
      style={{
        width: "100%",
        border: `1px solid ${tokens.color.line}`,
        borderRadius: tokens.radius.card,
        background: tokens.color.elevated,
        padding: "14px 16px",
        display: "grid",
        gap: 8,
        textAlign: "left",
        cursor: "pointer"
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: tokens.color.ink }}>{pair.headline}</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: tokens.color.subInk }}>{pair.deck}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: tokens.color.softInk }}>
        <span>{pair.dateRangeLabel}</span>
        <span>confidence {pair.judgmentResult?.relevance ?? "—"}</span>
        <span>開啟</span>
      </div>
    </button>
  );
}

function BulkAnalyzeCta({
  count,
  isBulkAnalyzing,
  disabled,
  onAnalyze
}: {
  count: number;
  isBulkAnalyzing: boolean;
  disabled: boolean;
  onAnalyze: () => void;
}) {
  return (
    <div
      data-topic-bulk-analyze="action"
      style={{
        display: "grid",
        gap: 6,
        padding: "10px 12px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.accentSoft}`,
        background: `linear-gradient(180deg, ${tokens.color.contextSurface}, ${tokens.color.surface})`
      }}
    >
      <PrimaryButton
        onClick={onAnalyze}
        disabled={disabled}
        style={{ width: "100%", padding: "10px 16px", fontSize: 13 }}
      >
        {isBulkAnalyzing ? "正在加入隊列…" : `開始分析 ${count} 篇`}
      </PrimaryButton>
      <div style={{ fontSize: 11, color: tokens.color.softInk, textAlign: "center", lineHeight: 1.45 }}>
        {isBulkAnalyzing
          ? "完成後可在脈絡或比較查看"
          : `${count} 篇未分析，完成後才可查看單篇分析或加入比較`}
      </div>
    </div>
  );
}

function TopicProcessingStatus({
  total,
  ready,
  queued,
  crawling,
  analyzing,
  workerStatus,
  backendWorkUiState = null,
  isStartingProcessing,
  onStartProcessing
}: {
  total: number;
  ready: number;
  queued: number;
  crawling: number;
  analyzing: number;
  workerStatus?: "idle" | "draining" | null;
  backendWorkUiState?: BackendWorkUiState | null;
  isStartingProcessing?: boolean;
  onStartProcessing?: () => void;
}) {
  const processing = queued + crawling + analyzing;
  const queuedOnly = queued > 0 && crawling === 0 && analyzing === 0;
  const expiredRunningPresent = backendWorkUiState?.kind === "expired_running";
  const restartActionable = (queuedOnly && workerStatus === "idle") || expiredRunningPresent;
  const title = analyzing > 0
    ? `正在分析 ${analyzing} 篇`
    : crawling > 0
      ? `正在捕捉 ${crawling} 篇`
      : `已排隊 ${queued} 篇`;
  const detail = expiredRunningPresent
    ? `${ready}/${total} 已完成，有 ${backendWorkUiState!.count} 個任務的 lease 過期，重新啟動可回收`
    : queuedOnly && workerStatus === "idle"
      ? `${ready}/${total} 已完成，worker 目前未在跑，可重新啟動處理`
      : `${ready}/${total} 已完成，完成後可查看單篇分析或加入比較`;
  const stamp = expiredRunningPresent
    ? "可重啟"
    : queuedOnly && workerStatus === "idle"
      ? "等待處理"
      : "處理中";
  const restartLabel = expiredRunningPresent ? "重啟處理" : "啟動處理";

  return (
    <div
      data-topic-bulk-analyze="processing"
      style={{
        display: "grid",
        gap: 8,
        padding: "12px 14px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.accentSoft}`,
        background: `linear-gradient(180deg, ${tokens.color.contextSurface}, ${tokens.color.surface})`
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              border: `2px solid ${tokens.color.lineStrong}`,
              borderTopColor: "var(--dlens-mode-accent)",
              animation: "dlens-spin 0.8s linear infinite",
              flex: "0 0 auto"
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink }}>{title}</div>
            <div style={{ fontSize: 11, color: tokens.color.softInk, lineHeight: 1.45 }}>
              {detail}
            </div>
          </div>
        </div>
        {restartActionable && onStartProcessing ? (
          <SecondaryButton
            onClick={onStartProcessing}
            disabled={Boolean(isStartingProcessing)}
            style={{ padding: "7px 10px", fontSize: 11 }}
          >
            {isStartingProcessing ? "啟動中…" : restartLabel}
          </SecondaryButton>
        ) : (
          <Stamp tone="accent">{stamp}</Stamp>
        )}
      </div>
      <div
        aria-hidden="true"
        style={{
          height: 4,
          borderRadius: 999,
          overflow: "hidden",
          background: tokens.color.neutralSurface
        }}
      >
        <span
          style={{
            display: "block",
            width: "38%",
            height: "100%",
            borderRadius: 999,
            background: `linear-gradient(90deg, transparent, var(--dlens-mode-accent), transparent)`,
            animation: "dlens-popup-indeterminate 1.2s ease-in-out infinite"
          }}
        />
      </div>
    </div>
  );
}

function TopicCompactHeader({
  topic,
  signalCount,
  readyCount,
  pairCount
}: {
  topic: Topic;
  signalCount: number;
  readyCount: number;
  pairCount: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        padding: "14px 16px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.elevated,
        boxShadow: tokens.shadow.glass
      }}
    >
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <Kicker>Topic detail</Kicker>
          <div style={{ fontFamily: tokens.font.serif, fontSize: 28, lineHeight: 1.05, color: tokens.color.ink, ...lineClamp(1) }}>
            {topic.name}
          </div>
        </div>
        <Stamp tone={statusTone(topic.status)}>{topic.status}</Stamp>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Stamp tone="neutral">{signalCount} 訊號</Stamp>
        <Stamp tone={readyCount > 0 ? "success" : "neutral"}>{readyCount} 已分析</Stamp>
        <Stamp tone={pairCount > 0 ? "accent" : "neutral"}>{pairCount} 比較結果</Stamp>
      </div>
    </div>
  );
}

function TopicInventoryStat({
  value,
  label,
  tone = "neutral"
}: {
  value: number | string;
  label: string;
  tone?: "neutral" | "success" | "warning" | "accent";
}) {
  const color = tone === "success"
    ? tokens.color.success
    : tone === "warning"
      ? tokens.topicAccent.warm
      : tone === "accent"
        ? tokens.topicAccent.primary
        : tokens.color.ink;
  return (
    <span
      style={{
        display: "grid",
        gap: 3,
        minWidth: 58,
        paddingRight: 12,
        borderRight: `1px solid ${tokens.color.line}`
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 850, lineHeight: 1, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: tokens.color.softInk }}>{label}</span>
    </span>
  );
}

type SynthesisStackSectionId = "observations" | "clusters" | "techniques" | "memes" | "outliers";
type SynthesisStackTestId =
  | "synthesis-observations"
  | "synthesis-clusters"
  | "synthesis-techniques"
  | "synthesis-memes"
  | "synthesis-outliers";

function SynthesisStackSection({
  testId,
  title,
  count,
  open,
  onToggle,
  children
}: {
  testId: SynthesisStackTestId;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-synthesis-stack-section="true"
      style={{
        display: "grid",
        borderTop: `1px solid ${tokens.color.line}`
      }}
    >
      <button
        type="button"
        data-testid={testId}
        aria-expanded={open}
        aria-controls={`${testId}-body`}
        onClick={onToggle}
        style={{
          width: "100%",
          border: 0,
          background: "transparent",
          padding: "12px 0",
          display: "grid",
          gridTemplateColumns: "16px minmax(0, 1fr) auto",
          gap: 8,
          alignItems: "center",
          textAlign: "left",
          cursor: "pointer",
          color: tokens.color.ink,
          fontFamily: tokens.font.sans
        }}
      >
        <span style={{ color: tokens.color.softInk, fontSize: 12, lineHeight: 1 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontSize: 13, fontWeight: 700, ...lineClamp(1) }}>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: tokens.color.softInk, whiteSpace: "nowrap" }}>
          {count}
        </span>
      </button>
      {open ? (
        <div
          id={`${testId}-body`}
          data-testid={`${testId}-body`}
          style={{
            padding: "0 0 14px 24px",
            display: "grid",
            gap: 8
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ConsoleBar({
  value,
  total,
  testId
}: {
  value: number;
  total: number;
  testId?: string;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;

  return (
    <div data-testid={testId} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <div style={{ flex: 1, height: 3, background: tokens.color.lineStrong, borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: tokens.color.teal,
            borderRadius: 999
          }}
        />
      </div>
      <span style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.softInk, minWidth: 28, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

function ConsoleSection({
  testId,
  title,
  children
}: {
  testId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId} style={{ display: "grid", gap: 8 }}>
      <div style={{ fontFamily: tokens.font.mono, fontSize: 10.5, fontWeight: 700, color: tokens.color.softInk, letterSpacing: "0.04em" }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function ConsoleIndex({ index }: { index: number }) {
  return (
    <span style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk, fontVariantNumeric: "tabular-nums" }}>
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}

function TopicSynthesisConsole({
  synthesis,
  lastGeneratedLabel
}: {
  synthesis: TopicSynthesis;
  lastGeneratedLabel: string;
}) {
  const total = synthesis.generatedFromCount;

  return (
    <div data-testid="synthesis-console" style={{ display: "grid", gap: 14 }}>
      <p
        style={{
          margin: 0,
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${tokens.color.line}`,
          background: tokens.color.surface,
          fontFamily: tokens.font.mono,
          fontSize: 12,
          lineHeight: 1.65,
          color: tokens.color.ink
        }}
      >
        {synthesis.sentimentNarrative || "—"}
      </p>

      <ConsoleSection testId="synthesis-cluster-bars" title="CLUSTERS">
        {synthesis.commonClusters.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            {synthesis.commonClusters.map((cluster, index) => (
              <div
                key={cluster.keyword}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 0.9fr) minmax(92px, 1fr)",
                  gap: 10,
                  alignItems: "center"
                }}
              >
                <span style={{ fontFamily: tokens.font.mono, fontSize: 11.5, color: tokens.color.ink, ...lineClamp(1) }}>
                  {cluster.keyword}
                </span>
                <ConsoleBar value={cluster.signalCount} total={total} testId={`cluster-bar-${index}`} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk }}>no clusters</div>
        )}
      </ConsoleSection>

      <ConsoleSection testId="synthesis-meme-bars" title="MEMES">
        {synthesis.memes.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            {synthesis.memes.map((meme, index) => (
              <div
                key={meme.phrase}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 0.9fr) minmax(92px, 1fr)",
                  gap: 10,
                  alignItems: "center"
                }}
              >
                <span style={{ fontFamily: tokens.font.mono, fontSize: 11.5, color: tokens.color.ink, ...lineClamp(1) }}>
                  {meme.phrase}
                </span>
                <ConsoleBar value={meme.occurrences} total={total} testId={`meme-bar-${index}`} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk }}>no memes</div>
        )}
      </ConsoleSection>

      <ConsoleSection testId="synthesis-techniques-rows" title="VERBAL TECHNIQUES">
        {synthesis.verbalTechniques.length > 0 ? (
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 7 }}>
            {synthesis.verbalTechniques.map((technique, index) => (
              <li key={technique} style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", gap: 8, alignItems: "baseline" }}>
                <ConsoleIndex index={index} />
                <span style={{ fontFamily: tokens.font.mono, fontSize: 11.5, lineHeight: 1.55, color: tokens.color.subInk }}>
                  {technique}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk }}>no techniques</div>
        )}
      </ConsoleSection>

      <ConsoleSection testId="synthesis-observation-rows" title="OBSERVATIONS">
        {synthesis.observations.length > 0 ? (
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 7 }}>
            {synthesis.observations.map((observation, index) => (
              <li
                key={`${observation.text}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "24px minmax(0, 1fr) auto",
                  gap: 8,
                  alignItems: "baseline"
                }}
              >
                <ConsoleIndex index={index} />
                <span style={{ fontFamily: tokens.font.mono, fontSize: 11.5, lineHeight: 1.55, color: tokens.color.subInk }}>
                  {observation.text}
                </span>
                <span style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.softInk, whiteSpace: "nowrap" }}>
                  {observation.evidenceSignalIds.length} signals
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk }}>no observations</div>
        )}
      </ConsoleSection>

      <ConsoleSection testId="synthesis-outlier-rows" title="OUTLIERS">
        {synthesis.outliers.length > 0 ? (
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 7 }}>
            {synthesis.outliers.map((outlier, index) => (
              <li key={`${outlier.signalId}-${index}`} style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", gap: 8 }}>
                <ConsoleIndex index={index} />
                <span style={{ fontFamily: tokens.font.mono, fontSize: 11.5, lineHeight: 1.55, color: tokens.color.subInk }}>
                  {outlier.signalId} · {outlier.reason}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk }}>no outliers</div>
        )}
      </ConsoleSection>

      <div style={{ borderTop: `1px solid ${tokens.color.line}`, paddingTop: 10, fontFamily: tokens.font.mono, fontSize: 10.5, color: tokens.color.softInk }}>
        {synthesis.generatedFromCount} signals · {synthesis.generatorVersion} · {lastGeneratedLabel}
      </div>
    </div>
  );
}

function TopicSynthesisCard({
  topic,
  analyzedCount,
  isGenerating,
  errorMessage,
  onGenerate,
  layout = "stack"
}: {
  topic: Topic;
  analyzedCount: number;
  isGenerating: boolean;
  errorMessage: string | null;
  onGenerate: () => void;
  layout?: TopicSynthesisLayout;
}) {
  const synthesis: TopicSynthesis | null = topic.synthesis ?? null;
  const staleness = topicSynthesisStaleReason(synthesis, analyzedCount);
  const canGenerate = analyzedCount >= TOPIC_SYNTHESIS_MIN_ANALYZED;
  const showLocked = !synthesis && !canGenerate;
  const showEmptyCta = !synthesis && canGenerate;
  const autoGenerateKeyRef = useRef<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<SynthesisStackSectionId, boolean>>({
    observations: false,
    clusters: false,
    techniques: false,
    memes: false,
    outliers: false
  });
  const lockedHint = `已分析 ${analyzedCount}/${TOPIC_SYNTHESIS_MIN_ANALYZED}。至少 ${TOPIC_SYNTHESIS_MIN_ANALYZED} 篇完成分析後即可統計關鍵詞。`;
  const lastGeneratedLabel = synthesis
    ? new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(synthesis.generatedAt))
    : "";
  const toggleSection = (section: SynthesisStackSectionId) => {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section]
    }));
  };

  useEffect(() => {
    if (!onGenerate) {
      return;
    }
    if (synthesis) {
      autoGenerateKeyRef.current = null;
      return;
    }
    if (!canGenerate || isGenerating) {
      return;
    }
    const autoGenerateKey = `${topic.id}:${analyzedCount}`;
    if (autoGenerateKeyRef.current === autoGenerateKey) {
      return;
    }
    autoGenerateKeyRef.current = autoGenerateKey;
    void onGenerate();
  }, [analyzedCount, canGenerate, isGenerating, onGenerate, synthesis, topic.id]);

  return (
    <section
      data-topic-synthesis="card"
      style={{
        display: "grid",
        gap: 16,
        padding: "20px 22px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.elevated,
        boxShadow: tokens.shadow.glass
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 3 }}>
          <div style={{
            fontFamily: tokens.font.mono,
            fontSize: 10,
            fontWeight: 700,
            color: tokens.color.softInk,
            letterSpacing: "0.05em"
          }}>
            關鍵詞出現頻率 · 非 AI 分析
          </div>
          <div style={{
            fontFamily: tokens.font.serifCjk,
            fontSize: 19,
            fontWeight: 600,
            color: tokens.color.ink,
            letterSpacing: "0.01em"
          }}>
            關鍵詞統計
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {synthesis ? (
            <Stamp tone={staleness === "stale" ? "warning" : "success"}>
              {staleness === "stale" ? "可更新" : "最新"}
            </Stamp>
          ) : null}
          <Stamp tone="neutral">{analyzedCount} 已分析</Stamp>
        </div>
      </header>

      {showLocked ? (
        <div style={{ fontSize: 12.5, color: tokens.color.softInk, lineHeight: 1.65 }}>{lockedHint}</div>
      ) : null}

      {showEmptyCta ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12.5, color: tokens.color.subInk, lineHeight: 1.65 }}>
            目前 {analyzedCount} 篇已分析。統計各帖子主要關鍵詞的出現頻率，每新增 {TOPIC_SYNTHESIS_STALE_DELTA} 篇可重新統計。
          </div>
          <PrimaryButton
            onClick={onGenerate}
            disabled={isGenerating}
            style={{ justifySelf: "start", padding: "8px 14px", fontSize: 12 }}
          >
            {isGenerating ? "正在統計…" : `統計關鍵詞（${analyzedCount} 篇）`}
          </PrimaryButton>
        </div>
      ) : null}

      {synthesis ? (
        <div style={{ display: "grid", gap: 14 }}>
          {layout === "console" ? (
            <TopicSynthesisConsole synthesis={synthesis} lastGeneratedLabel={lastGeneratedLabel} />
          ) : (
            <>
              <div style={{ display: "grid", gap: 8 }}>
                {synthesis.sentimentNarrative ? (
                  <p style={{
                    margin: 0,
                    fontFamily: tokens.font.serifCjk,
                    fontSize: 20,
                    lineHeight: 1.6,
                    fontWeight: 500,
                    color: tokens.color.ink,
                    letterSpacing: "0.005em"
                  }}>
                    {synthesis.sentimentNarrative}
                  </p>
                ) : null}
              </div>

              <div style={{ display: "grid", borderBottom: `1px solid ${tokens.color.line}` }}>
                <SynthesisStackSection
                  testId="synthesis-observations"
                  title="觀察"
                  count={synthesis.observations.length}
                  open={openSections.observations}
                  onToggle={() => toggleSection("observations")}
                >
                  {synthesis.observations.length > 0 ? (
                    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                      {synthesis.observations.map((observation, index) => (
                        <li key={`${observation.text}-${index}`} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: tokens.color.success }}>{index + 1}.</span>
                          <span style={{ fontSize: 13, lineHeight: 1.65, color: tokens.color.ink }}>{observation.text}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div style={{ fontSize: 12, color: tokens.color.softInk }}>暫無觀察。</div>
                  )}
                </SynthesisStackSection>

                <SynthesisStackSection
                  testId="synthesis-clusters"
                  title="模式群"
                  count={synthesis.commonClusters.length}
                  open={openSections.clusters}
                  onToggle={() => toggleSection("clusters")}
                >
                  {synthesis.commonClusters.length > 0 ? (
                    <div style={{ display: "grid", gap: 7 }}>
                      {synthesis.commonClusters.map((cluster) => (
                        <div key={cluster.keyword} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "baseline" }}>
                          <span style={{ fontSize: 13, color: tokens.color.ink, fontWeight: 650, ...lineClamp(1) }}>{cluster.keyword}</span>
                          <span style={{ fontSize: 11, color: tokens.color.softInk, whiteSpace: "nowrap" }}>{cluster.signalCount} 篇</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: tokens.color.softInk }}>暫無模式群。</div>
                  )}
                </SynthesisStackSection>

                <SynthesisStackSection
                  testId="synthesis-techniques"
                  title="說法"
                  count={synthesis.verbalTechniques.length}
                  open={openSections.techniques}
                  onToggle={() => toggleSection("techniques")}
                >
                  {synthesis.verbalTechniques.length > 0 ? (
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 7 }}>
                      {synthesis.verbalTechniques.map((technique) => (
                        <li key={technique} style={{ fontSize: 13, lineHeight: 1.6, color: tokens.color.subInk }}>
                          {technique}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: 12, color: tokens.color.softInk }}>暫無說法。</div>
                  )}
                </SynthesisStackSection>

                <SynthesisStackSection
                  testId="synthesis-memes"
                  title="梗"
                  count={synthesis.memes.length}
                  open={openSections.memes}
                  onToggle={() => toggleSection("memes")}
                >
                  {synthesis.memes.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {synthesis.memes.map((meme) => (
                        <span
                          key={meme.phrase}
                          style={{
                            fontSize: 11.5,
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: tokens.color.cyanSoft,
                            color: tokens.color.cyan,
                            fontWeight: 650
                          }}
                        >
                          {meme.phrase} ×{meme.occurrences}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: tokens.color.softInk }}>暫無重複語彙。</div>
                  )}
                </SynthesisStackSection>

                <SynthesisStackSection
                  testId="synthesis-outliers"
                  title="異常"
                  count={synthesis.outliers.length}
                  open={openSections.outliers}
                  onToggle={() => toggleSection("outliers")}
                >
                  {synthesis.outliers.length > 0 ? (
                    <div style={{ display: "grid", gap: 7 }}>
                      {synthesis.outliers.map((outlier) => (
                        <div key={outlier.signalId} style={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.color.subInk }}>
                          {outlier.reason}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: tokens.color.softInk }}>暫無異常材料。</div>
                  )}
                </SynthesisStackSection>
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 650, color: tokens.color.softInk, letterSpacing: "0.02em" }}>
                {synthesis.generatedFromCount} 訊號 · 更新於 {lastGeneratedLabel} · {synthesis.generatorVersion}
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingTop: 4 }}>
            <SecondaryButton
              onClick={onGenerate}
              disabled={isGenerating}
              style={{ padding: "6px 12px", fontSize: 11 }}
            >
              {isGenerating ? "重新統計中…" : "重新統計"}
            </SecondaryButton>
            {staleness === "stale" ? (
              <span style={{ fontSize: 11, color: tokens.color.softInk }}>
                自上次合成後新增 {analyzedCount - synthesis.generatedFromCount} 篇已分析貼文。
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div style={{ fontSize: 11, color: tokens.color.failed }}>{errorMessage}</div>
      ) : null}
    </section>
  );
}

function StanceBadge({ stance, marker = "reading" }: { stance: TopicSignalStance; marker?: "reading" | "source" }) {
  const config: Record<TopicSignalStance, { label: string; bg: string; color: string }> = {
    central: { label: "核心", bg: tokens.topicAccent.tintSage, color: tokens.topicAccent.primaryDeep },
    adjacent: { label: "相鄰", bg: tokens.topicAccent.tintAmber, color: tokens.topicAccent.warm },
    "off-topic": { label: "離題", bg: tokens.color.neutralSurface, color: tokens.color.softInk }
  };
  const { label, bg, color } = config[stance] ?? config.adjacent;
  const markerAttrs = marker === "source"
    ? { "data-topic-source-stance": stance }
    : { "data-topic-signal-stance": stance };
  return (
    <span
      {...markerAttrs}
      style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: bg, color }}
    >
      {label}
    </span>
  );
}

function TopicSignalTagCloud({
  summaries,
  taggedCount,
  selectedTag,
  onSelectTag,
  onClearTag
}: {
  summaries: SignalTagSummary[];
  taggedCount: number;
  selectedTag: string | null;
  onSelectTag: (tag: string) => void;
  onClearTag: () => void;
}) {
  if (summaries.length === 0) {
    return null;
  }

  return (
    <section
      data-topic-signal-tags="cloud"
      style={{
        display: "grid",
        gap: 12,
        padding: "14px 16px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.elevated
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 750, color: tokens.color.softInk, letterSpacing: "0.02em" }}>
            AI 語意標籤
          </div>
          <div style={{ fontFamily: tokens.font.serifCjk, fontSize: 18, fontWeight: 600, color: tokens.color.ink }}>
            標籤雲
          </div>
        </div>
        <Stamp tone="neutral">{taggedCount} 已標記</Stamp>
      </header>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {summaries.map((summary) => {
          const active = selectedTag === summary.tag;
          const repeated = summary.count >= 2;
          return (
            <button
              key={summary.tag}
              type="button"
              onClick={() => active ? onClearTag() : onSelectTag(summary.tag)}
              aria-pressed={active}
              style={{
                border: `1px solid ${active ? tokens.color.accentGlow : repeated ? tokens.color.success : tokens.color.line}`,
                borderRadius: 999,
                background: active ? tokens.color.accentSoft : repeated ? tokens.color.successSoft : tokens.color.surface,
                color: active ? tokens.color.accent : repeated ? tokens.color.success : tokens.color.subInk,
                padding: "5px 9px",
                fontSize: 11,
                fontWeight: repeated ? 750 : 650,
                cursor: "pointer"
              }}
            >
              {summary.tag}
              <span style={{ marginLeft: 5, color: tokens.color.softInk, fontWeight: 650 }}>
                {summary.count}
              </span>
            </button>
          );
        })}
      </div>

      {selectedTag ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 11, color: tokens.color.subInk }}>
          <span>只顯示「{selectedTag}」相關篇目</span>
          <SecondaryButton onClick={onClearTag} style={{ padding: "4px 8px", fontSize: 10.5 }}>
            清除
          </SecondaryButton>
        </div>
      ) : null}
    </section>
  );
}

function hasSignalTag(record: SignalTagsRecord | undefined, tag: string | null): boolean {
  if (!tag) return true;
  return Boolean(record?.signalTags.some((entry) => entry === tag));
}

function TopicDetailSection({
  surface,
  title,
  caption,
  action,
  children,
  style
}: {
  surface: "themes" | "lanes" | "reaction-patterns" | "sources";
  title: string;
  caption?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <SurfaceCard
      tone="utility"
      dataAttrs={{
        "data-topic-audit-block": surface,
        "data-topic-detail-surface": surface,
        "data-topic-detail-rhythm": "section"
      }}
      style={{
        display: "grid",
        gap: 10,
        padding: "16px 18px",
        borderLeft: `3px solid ${TOPIC_MODE_ACCENT_SOFT}`,
        boxShadow: tokens.shadow.topicCard,
        ...style
      }}
    >
      <SectionHeader title={title} caption={caption} action={action} style={{ marginBottom: 0 }} />
      {children}
    </SurfaceCard>
  );
}

function auditStageFromNumber(stage: number): TopicAuditStageName {
  switch (stage) {
    case 2: return "lexicon";
    case 3: return "narrative";
    case 4: return "audience";
    case 5: return "absence";
    case 6: return "final";
    default: return "p1-signal-reading";
  }
}

function TopicAuditOverview({
  topic,
  signals,
  summary,
  flags,
  canRunAudit = true,
  blockedReason,
  p1ReadyCount,
  p1TotalCount,
  sourceTotalCount,
  onRunAudit,
  onOpenAuditReport
}: {
  topic: Topic;
  signals: TopicSignalViewModel[];
  summary: TopicAuditSummary;
  flags: TopicAuditValidationFlag[];
  canRunAudit?: boolean;
  blockedReason?: string;
  p1ReadyCount?: number;
  p1TotalCount?: number;
  sourceTotalCount?: number;
  onRunAudit?: (topicId: string, fromStage?: TopicAuditStageName) => void;
  onOpenAuditReport?: (topicId: string, stale?: boolean) => void;
}) {
  const displaySourceTotal = sourceTotalCount ?? summary.analyzedCount + summary.queuedCount;
  const coverageLabel = summary.coverage ?? `${displaySourceTotal}/${displaySourceTotal}`;
  const p1All = typeof p1ReadyCount === "number" && typeof p1TotalCount === "number" && p1TotalCount > 0 && p1ReadyCount === p1TotalCount;
  const p1NoneReady = (p1ReadyCount ?? 0) === 0;
  const generateCtaLabel = p1All ? "生成審查報告（綜合 P2–P6）" : "生成審查報告";
  const generateCtaHint = typeof p1TotalCount === "number" && p1TotalCount > 0
    ? p1All
      ? null
      : `P1 ${p1ReadyCount ?? 0}/${p1TotalCount}：未分析的篇章會在此次 run 一併處理`
    : "首次生成會自動跑完整 pipeline：留言分流 → 逐篇 P1 判讀 → 詞彙／敘事／群眾反應 → 審查報告";
  const failedStage = summary.failedStage ?? 1;
  const runAudit = (fromStage?: TopicAuditStageName) => {
    if (!canRunAudit) return;
    onRunAudit?.(topic.id, fromStage);
  };
  if (summary.reportStatus === "ready") {
    return (
      <div
        data-topic-audit-actions="ready"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          flexWrap: "wrap"
        }}
      >
        <AuditGhostButton onClick={() => onOpenAuditReport?.(topic.id)}>開啟審查報告 ↗ 新分頁</AuditGhostButton>
        <AuditGhostButton disabled={!canRunAudit} onClick={() => runAudit()}>重新生成</AuditGhostButton>
      </div>
    );
  }
  return (
    <SurfaceCard
      tone="focused"
      dataAttrs={{
        "data-topic-audit-block": "overview",
        "data-topic-detail-surface": "overview",
        "data-topic-detail-surface-style": "audit-report",
        "data-topic-detail-rhythm": "section"
      }}
      style={{
        display: "grid",
        gap: 14,
        borderLeft: `4px solid ${TOPIC_MODE_ACCENT}`,
        background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`,
        boxShadow: tokens.shadow.topicCard,
        padding: "16px 18px"
      }}
    >
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "grid", gap: 9, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: tokens.color.softInk, fontWeight: 700 }}>議題</span>
          <h1 style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 23, lineHeight: 1.15 }}>
            {topic.name}
          </h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: tokens.color.subInk }}>
            <span>{displaySourceTotal} 訊號</span>
            <span>P1 判讀 {summary.analyzedCount}/{displaySourceTotal}</span>
            <TopicAuditStatusPill summary={summary} />
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, minWidth: 160 }}>
          {summary.reportStatus === "running" ? (
            <div style={{ display: "grid", gap: 8, borderRadius: tokens.radius.button, background: tokens.topicAccent.tintAmber, padding: 10, color: tokens.topicAccent.warm, fontSize: 11.5, fontWeight: 800 }}>
              <span>生成中 · P{summary.runningStage ?? 1}/6</span>
              <span style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
                {Array.from({ length: 6 }, (_, index) => (
                  <span key={index} style={{ height: 4, borderRadius: tokens.radius.round, background: index + 1 <= (summary.runningStage ?? 1) ? tokens.topicAccent.warm : tokens.color.queuedSoft }} />
                ))}
              </span>
            </div>
          ) : summary.reportStatus === "failed" ? (
            <>
              <AuditPrimaryButton disabled={!canRunAudit} onClick={() => runAudit(auditStageFromNumber(failedStage))}>從 P{failedStage} 續跑</AuditPrimaryButton>
              <AuditGhostButton onClick={() => onOpenAuditReport?.(topic.id)}>查看錯誤詳情 ↗</AuditGhostButton>
            </>
          ) : summary.reportStatus === "stale" ? (
            <>
              <AuditPrimaryButton disabled={!canRunAudit} onClick={() => runAudit()}>重新生成</AuditPrimaryButton>
              <AuditGhostButton onClick={() => onOpenAuditReport?.(topic.id, true)}>先看舊版 ↗</AuditGhostButton>
            </>
          ) : (
            <>
              <AuditPrimaryButton disabled={!canRunAudit} onClick={() => runAudit()}>{generateCtaLabel}</AuditPrimaryButton>
              {generateCtaHint ? (
                <span style={{ fontSize: 10.5, color: tokens.color.softInk, lineHeight: 1.45 }}>{generateCtaHint}</span>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", borderTop: `1px solid ${tokens.color.line}`, paddingTop: 12 }}>
        <span style={{ fontSize: 11, color: tokens.color.softInk }}>覆蓋 {coverageLabel}</span>
        <ValidatorChip
          topicId={topic.id}
          flags={flags}
          state={summary.reportStatus === "stale" ? "validated" : "pending"}
          stale={summary.reportStatus === "stale"}
          onOpenReport={(topicId) => onOpenAuditReport?.(topicId)}
        />
      </div>
      {summary.reportStatus === "failed" ? (
        <div style={{ borderRadius: tokens.radius.card, background: tokens.topicAccent.failBg, color: tokens.topicAccent.fail, padding: "10px 12px", fontSize: 11.5, lineHeight: 1.55 }}>
          失敗於 P{failedStage} · {summary.failedReason || "reason unavailable"}
        </div>
      ) : null}
      {!canRunAudit && blockedReason ? (
        <div
          data-topic-audit-blocked="true"
          style={{
            borderRadius: tokens.radius.card,
            background: tokens.color.contextSurface,
            color: tokens.color.subInk,
            padding: "9px 11px",
            fontSize: 11.5,
            lineHeight: 1.55
          }}
        >
          {blockedReason}
        </div>
      ) : null}
    </SurfaceCard>
  );
}

export function TopicDetailView({
  viewModel,
  onCommand
}: TopicDetailViewProps) {
  const {
    topic,
    sessionMode,
    loadState,
    synthLayout,
    pairs,
    primaryJudgmentPair,
    signalRows: signals,
    analysisCounts: topicAnalysisCounts,
    sourcePendingCount,
    unanalyzedItemIds,
    signalTagSummaries,
    taggedSignalCount,
    audit,
    workerStatus,
    backendWorkUiState,
    isBulkAnalyzing,
    isStartingProcessing
  } = viewModel;
  const auditEvidence = audit.evidence;
  const auditSummaryValue = audit.summary as TopicAuditSummary;
  const auditValidatorFlags = audit.validatorFlags;
  const auditThemes = audit.themes;
  const auditLanes = audit.lanes as NarrativeLaneHint[];
  const reactionCoverage = audit.reactionCoverage;
  const reactionPatterns = audit.reactionPatterns;
  const auditSourceTotal = audit.sourceTotal;
  const p1ReadyCount = audit.p1ReadyCount;
  const p1AllReady = audit.p1AllReady;
  const p1TotalCount = audit.p1TotalCount;
  const canRunAuditFromSources = audit.canRunAudit;
  const auditBlockedReason = audit.blockedReason;
  const commandTarget = { sessionId: viewModel.sessionId, topicId: topic.id };
  const dispatch = (command: TopicDetailCommand) => {
    void onCommand(command);
  };
  const dispatchAsync = (command: TopicDetailCommand): Promise<unknown> => Promise.resolve(onCommand(command));
  const [draftDescription, setDraftDescription] = useState(topic.description || "");
  const [draftResearchQuestion, setDraftResearchQuestion] = useState(topic.context?.researchQuestion || "");
  const [isGeneratingForSignalId, setIsGeneratingForSignalId] = useState<string | null>(null);
  const [generatingErrorBySignalId, setGeneratingErrorBySignalId] = useState<Record<string, string>>({});
  const [deletingSignalId, setDeletingSignalId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<AuditDetailState>(null);
  const [expandedFullListId, setExpandedFullListId] = useState<string | null>(null);
  const [manualJudgment, setManualJudgment] = useState<{
    resultId: string;
    relevance: 1 | 2 | 3 | 4 | 5;
    recommendedState: "park" | "watch" | "act";
  } | null>(null);

  useEffect(() => {
    setDraftDescription(topic.description || "");
    setDraftResearchQuestion(topic.context?.researchQuestion || "");
  }, [topic.context?.researchQuestion, topic.description, topic.id]);

  const visibleSignals = useMemo(
    () => signals.filter((signal) =>
      hasSignalTag(signal.tagRecord, selectedTag)
    ),
    [selectedTag, signals]
  );
  const selectedLaneId = activeDetail?.kind === "narrative" ? activeDetail.id : null;
  const selectedReactionId = activeDetail?.kind === "reaction" ? activeDetail.id : null;
  const selectedSourceId = activeDetail?.kind === "source" ? activeDetail.id : null;
  const filteredAuditRows = useMemo(() => {
    if (selectedReactionId) {
      const pattern = reactionPatterns.find((entry) => entry.id === selectedReactionId);
      const refs = new Set(
        [...(pattern?.supportRefs ?? []), ...(pattern?.counterRefs ?? [])]
          .map((ref) => ref.split(".")[0])
          .filter(Boolean)
      );
      return audit.sourceRows.filter((row) => refs.has(row.packet.shortCode));
    }
    if (selectedLaneId) {
      const lane = auditLanes.find((entry) => entry.id === selectedLaneId);
      const refs = new Set(lane?.signalRefs.map((ref) => ref.split(".")[0]) ?? []);
      return audit.sourceRows.filter((row) => refs.has(row.packet.shortCode));
    }
    return audit.sourceRows;
  }, [selectedLaneId, selectedReactionId, audit.sourceRows, auditLanes, reactionPatterns]);
  const activeLane = selectedLaneId ? auditLanes.find((entry) => entry.id === selectedLaneId) ?? null : null;
  const activeLaneDetail = useMemo(() => {
    if (!activeLane) return null;
    return buildNarrativeLaneDetail({ lane: activeLane, packets: auditEvidence });
  }, [activeLane, auditEvidence]);
  const activeReactionPattern = selectedReactionId
    ? reactionPatterns.find((entry) => entry.id === selectedReactionId) ?? null
    : null;
  const activeReactionPatternDetail = useMemo(() => {
    if (!activeReactionPattern) return null;
    return buildReactionPatternDetail({ pattern: activeReactionPattern, packets: auditEvidence });
  }, [activeReactionPattern, auditEvidence]);
  const auditFragmentLookup = useMemo(() => buildEvidenceFragmentLookup(auditEvidence), [auditEvidence]);
  const [pinnedAuditRef, setPinnedAuditRef] = useState<string | null>(null);
  const handlePinAuditRef = (ref: string) => {
    setPinnedAuditRef((current) => current === ref ? null : ref);
  };
  const openAuditRow = selectedSourceId
    ? audit.sourceRows.find((row) => row.packet.signalId === selectedSourceId || row.packet.shortCode === selectedSourceId) ?? null
    : null;
  // Pre-audit fallback: when the topic audit has not run, source rows are empty,
  // so open the drawer from the locally-derived packet (OP 原文 + 留言) and adapt
  // any per-signal reading into the drawer's claim view.
  const openAuditPacket = openAuditRow?.packet
    ?? (selectedSourceId ? viewModel.packetsBySignalId[selectedSourceId] ?? null : null);
  const openAuditReading = openAuditRow?.reading
    ?? adaptTopicSignalReadingForDrawer(
      selectedSourceId ? signals.find((row) => row.signalId === selectedSourceId)?.reading : undefined,
      openAuditPacket
    );

  useEffect(() => {
    if (selectedTag && !signalTagSummaries.some((summary) => summary.tag === selectedTag)) {
      setSelectedTag(null);
    }
  }, [selectedTag, signalTagSummaries]);

  useEffect(() => {
    setExpandedFullListId(null);
  }, [activeDetail?.kind, activeDetail?.id]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDetail(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleAnalyzeUnanalyzedItems = () => {
    const action = viewModel.actions.find((entry) => entry.kind === "analyzeItems");
    if (action && !isBulkAnalyzing) {
      dispatch(action);
    }
  };

  const handleAnalyzeItem = (signal: TopicSignalViewModel) => {
    const action = signal.actions.find((entry) => entry.kind === "analyzeItem" || entry.kind === "queueSignalItem");
    if (action && !(action.kind === "analyzeItem" && isBulkAnalyzing)) {
      dispatch(action);
    }
  };

  async function handleDeleteSignal(signalId: string) {
    const signal = signals.find((entry) => entry.signalId === signalId);
    const action = signal?.actions.find((entry) => entry.kind === "deleteSignal");
    if (!action) return;
    if (!window.confirm("確認移除此訊號？這會同時清走它背後的本地採集項目。")) return;
    setDeleteError(null);
    setDeletingSignalId(signalId);
    try {
      await dispatchAsync(action);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingSignalId((current) => (current === signalId ? null : current));
    }
  }

  const handleResearchQuestionBlur = () => {
    const current = topic.context?.researchQuestion || "";
    if (draftResearchQuestion === current) {
      return;
    }
    const researchQuestion = draftResearchQuestion.trim();
    dispatch({
      kind: "updateTopic",
      target: commandTarget,
      patch: {
      context: researchQuestion
        ? {
            ...(topic.context ?? {}),
            researchQuestion
          }
        : null
      }
    });
  };

  const handleGenerateSignalReading = (signalId: string) => {
    const signal = signals.find((entry) => entry.signalId === signalId);
    const action = signal?.actions.find((entry) => entry.kind === "generateSignalReading");
    if (!action || isGeneratingForSignalId) return;
    setIsGeneratingForSignalId(signalId);
    setGeneratingErrorBySignalId((previous) => {
      const next = { ...previous };
      delete next[signalId];
      return next;
    });
    void dispatchAsync(action)
      .then((result) => {
        const commandResult = readCommandResult(result);
        if (commandResult && !commandResult.ok && commandResult.error) {
          setGeneratingErrorBySignalId((previous) => ({ ...previous, [signalId]: commandResult.error! }));
        }
      })
      .finally(() => {
        setIsGeneratingForSignalId(null);
      });
  };

  const startProcessingAction = viewModel.actions.find((entry) => entry.kind === "startProcessing");
  const handleStartProcessing = startProcessingAction ? () => dispatch(startProcessingAction) : undefined;
  const handleBack = () => dispatch({ kind: "back", target: commandTarget });
  const handleOpenPair = (resultId: string) => dispatch({ kind: "openPair", target: { ...commandTarget, resultId } });
  const handleOpenAnalysis = (resultId: string) => dispatch({ kind: "openAnalysis", target: { ...commandTarget, resultId } });
  const handleAddToCompare = (itemId: string) => dispatch({ kind: "addToCompare", target: { ...commandTarget, itemId } });
  const handleRunAudit = (_topicId: string, fromStage?: TopicAuditStageName) => dispatch({ kind: "runAudit", target: commandTarget, fromStage });
  const handleRunAuditP1 = (_topicId: string, signalId: string) => dispatch({ kind: "runAuditP1", target: { ...commandTarget, signalId } });
  const handleOpenAuditReport = (_topicId: string, stale?: boolean) => dispatch({ kind: "openAuditReport", target: commandTarget, stale });
  const handleSaveJudgmentOverride = (
    resultId: string,
    patch: { relevance: 1 | 2 | 3 | 4 | 5; recommendedState: "park" | "watch" | "act" }
  ) => dispatch({ kind: "saveJudgmentOverride", target: { ...commandTarget, resultId }, patch });

  const visibleJudgment = manualJudgment && primaryJudgmentPair?.resultId === manualJudgment.resultId
    ? {
        relevance: manualJudgment.relevance,
        recommendedState: manualJudgment.recommendedState,
        whyThisMatters: primaryJudgmentPair?.judgmentResult?.whyThisMatters || "",
        actionCue: primaryJudgmentPair?.judgmentResult?.actionCue || ""
      }
    : primaryJudgmentPair?.judgmentResult || null;
  const topicSourceFeed = (
    <TopicDetailSection
      surface="sources"
      title="源清單"
      caption="先確認來源、爬取狀態與刪除項目，再生成議題審查報告。"
      action={(
        <Stamp tone={topicAnalysisCounts.ready > 0 ? "success" : "neutral"}>
          {topicAnalysisCounts.ready}/{topicAnalysisCounts.total} 已完成
        </Stamp>
      )}
      style={{ gap: 12 }}
    >
      <div style={{ display: "grid", gap: 11 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            borderRadius: tokens.radius.button,
            background: tokens.color.contextSurface,
            padding: "10px 14px",
            overflowX: "auto"
          }}
        >
          <TopicInventoryStat value={signals.length} label="訊號" />
          <TopicInventoryStat value={topicAnalysisCounts.ready} label="已完成" tone="success" />
          <TopicInventoryStat value={topicAnalysisCounts.processing} label="處理中" tone={topicAnalysisCounts.processing ? "accent" : "neutral"} />
          <TopicInventoryStat value={sourcePendingCount} label="待處理" tone={sourcePendingCount ? "warning" : "neutral"} />
          <span style={{ marginLeft: "auto", fontSize: 11, color: tokens.color.softInk, whiteSpace: "nowrap" }}>
            P1 判讀 {auditSummaryValue.analyzedCount}/{signals.length}
          </span>
        </div>
      </div>

      {topicAnalysisCounts.processing > 0 ? (
        <TopicProcessingStatus
          total={topicAnalysisCounts.total}
          ready={topicAnalysisCounts.ready}
          queued={topicAnalysisCounts.queued}
          crawling={topicAnalysisCounts.crawling}
          analyzing={topicAnalysisCounts.analyzing}
          workerStatus={workerStatus}
          backendWorkUiState={backendWorkUiState}
          isStartingProcessing={isStartingProcessing}
          onStartProcessing={handleStartProcessing}
        />
      ) : null}

      {unanalyzedItemIds.length > 0 ? (
        <div
          data-topic-source-crawl="action"
          style={{
            display: "grid",
            gap: 6,
            padding: "10px 12px",
            borderRadius: tokens.radius.card,
            border: `1px solid ${tokens.color.accentSoft}`,
            background: tokens.color.contextSurface
          }}
        >
          <PrimaryButton
            onClick={handleAnalyzeUnanalyzedItems}
            disabled={!viewModel.actions.some((entry) => entry.kind === "analyzeItems") || isBulkAnalyzing}
            style={{ width: "100%", padding: "10px 16px", fontSize: 13 }}
          >
            {isBulkAnalyzing ? "正在加入隊列…" : `開始爬取 ${unanalyzedItemIds.length} 篇`}
          </PrimaryButton>
          <span style={{ fontSize: 11, lineHeight: 1.45, color: tokens.color.softInk, textAlign: "center" }}>
            先補齊貼文與留言分析，再用現有資料生成報告。
          </span>
        </div>
      ) : null}

      {deleteError ? (
        <div style={{ fontSize: 11, color: tokens.color.failed }}>{deleteError}</div>
      ) : null}

      <style>{SCAN_ROW_HOVER_CSS}</style>
      <div data-topic-source-list="true" style={{ display: "grid", borderTop: `1px solid ${tokens.color.line}` }}>
        {signals.length === 0 ? (
          <div style={{ padding: "14px 4px", fontSize: 12, lineHeight: 1.55, color: tokens.color.softInk }}>
            這個議題暫時沒有貼文。先回採集頁加入 Threads 訊號。
          </div>
        ) : visibleSignals.length === 0 ? (
          <div style={{ padding: "14px 4px", fontSize: 12, lineHeight: 1.55, color: tokens.color.softInk }}>
            目前篩選沒有貼文。
          </div>
        ) : visibleSignals.map((signal) => {
          const status = signal.analysisState;
          const preview = signal.sourcePreview.displayText || signal.source || "資料不完整的 Threads 訊號";
          const tagRecord = signal.tagRecord;
          const reading = signal.reading;
          const originalUrl = signal.sourcePreview.displayUrl;
          const addToCompareAction = signal.actions.find((entry) => entry.kind === "addSignalToCompare");
          const analyzeAction = signal.actions.find((entry) => entry.kind === "analyzeItem" || entry.kind === "queueSignalItem");
          const deleteAction = signal.actions.find((entry) => entry.kind === "deleteSignal");
          // Drill-in is meaningful only once the thread (原文 + 留言) has been
          // crawled; a collection-only snippet has no comments to show yet.
          const canOpenDrawer = viewModel.packetsBySignalId[signal.signalId]?.status === "succeeded";

          return (
            <div
              key={signal.signalId}
              data-topic-source-row={signal.signalId}
              data-scan-row="true"
              onClick={canOpenDrawer ? () => setActiveDetail({ kind: "source", id: signal.signalId }) : undefined}
              style={scanRowStyle({
                display: "grid",
                gridTemplateColumns: deleteAction ? "5px minmax(0, 1fr) auto 42px" : "5px minmax(0, 1fr) auto",
                gap: 10,
                padding: "11px 0",
                alignItems: "start",
                cursor: canOpenDrawer ? "pointer" : "default"
              })}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 5,
                  height: 26,
                  borderRadius: tokens.radius.round,
                  background: signal.isReady ? tokens.color.success : signal.isProcessing ? tokens.topicAccent.primary : tokens.color.lineStrong,
                  marginTop: 2
                }}
              />
              <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35, color: tokens.color.ink, ...lineClamp(2) }}>
                  {tagRecord?.signalGist || preview}
                </div>
                {tagRecord?.signalGist && preview ? (
                  <div style={{ fontSize: 11.5, lineHeight: 1.5, color: tokens.color.softInk, ...lineClamp(2) }}>
                    {preview}
                  </div>
                ) : null}
                <div
                  onClick={(event) => event.stopPropagation()}
                  style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}
                >
                  <Stamp tone={analysisStateTone(status)}>{analysisStateLabel(status)}</Stamp>
                  {reading ? <StanceBadge stance={reading.stance} marker="source" /> : null}
                  <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>加入 {formatTopicDate(signal.capturedAt)}</span>
                  {originalUrl ? (
                    <a
                      href={originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: "4px 8px",
                        fontSize: 10.5,
                        borderRadius: 6,
                        border: `1px solid ${tokens.color.line}`,
                        background: tokens.color.surface,
                        color: tokens.color.subInk,
                        fontWeight: 600,
                        textDecoration: "none",
                        lineHeight: 1
                      }}
                    >
                      原文 ↗
                    </a>
                  ) : null}
                  {canOpenDrawer ? (
                    <button
                      type="button"
                      data-topic-source-row-detail={signal.signalId}
                      onClick={() => setActiveDetail({ kind: "source", id: signal.signalId })}
                      style={{
                        padding: "4px 8px",
                        fontSize: 10.5,
                        borderRadius: 6,
                        border: `1px solid ${tokens.color.line}`,
                        background: tokens.color.surface,
                        color: tokens.topicAccent.primary,
                        fontWeight: 700,
                        cursor: "pointer",
                        lineHeight: 1,
                        fontFamily: tokens.font.sans
                      }}
                    >
                      詳情 →
                    </button>
                  ) : null}
                  {signal.itemId && !signal.isProcessing ? (
                    signal.isReady ? (
                      addToCompareAction ? (
                        <SecondaryButton onClick={() => dispatch(addToCompareAction)} style={{ padding: "4px 8px", fontSize: 10.5 }}>
                          加入比較
                        </SecondaryButton>
                      ) : null
                    ) : analyzeAction ? (
                      <SecondaryButton
                        onClick={() => handleAnalyzeItem(signal)}
                        disabled={analyzeAction.kind === "analyzeItem" && isBulkAnalyzing}
                        style={{ padding: "4px 8px", fontSize: 10.5 }}
                      >
                        {analyzeAction.kind === "analyzeItem" ? "開始爬取" : "排隊爬取"}
                      </SecondaryButton>
                    ) : null
                  ) : null}
                </div>
              </div>
              <div style={{ fontSize: 10, color: tokens.color.softInk, whiteSpace: "nowrap" }}>
                {formatTopicDate(signal.capturedAt)}
              </div>
              {deleteAction ? (
                <button
                  type="button"
                  data-topic-signal-remove="true"
                  aria-label="移除此訊號"
                  disabled={deletingSignalId === signal.signalId}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleDeleteSignal(signal.signalId);
                  }}
                  style={{
                    minWidth: 38,
                    height: 24,
                    borderRadius: 7,
                    border: `1px solid ${tokens.color.line}`,
                    background: tokens.color.surface,
                    color: tokens.color.softInk,
                    cursor: deletingSignalId === signal.signalId ? "wait" : "pointer",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "0 7px"
                  }}
                >
                  刪除
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </TopicDetailSection>
  );

  if (sessionMode === "topic") {
    const showAuditPlaceholder = auditSummaryValue.reportStatus === "failed" || (auditThemes.length === 0 && auditLanes.length === 0 && reactionPatterns.length === 0 && auditEvidence.length === 0);
    const postTotal = postTotalFromEvidence(auditEvidence);
    const coverageNumbers = readCommentCoverage({ coverage: reactionCoverage, packets: auditEvidence });
    const narrativeCount = auditLanes.filter((lane) => !lane.isSinglePostObservation).length;
    const headlineProse = audit.headlineProse || "完成 P6 後，這裡會顯示兩句 headline verdict。";
    const headlineRefs = audit.headlineRefs.length ? audit.headlineRefs : reactionPatterns.flatMap((pattern) => pattern.representativeRefs).slice(0, 3);
    const fullList = activeReactionPattern
      ? buildReactionPatternFullList({ pattern: activeReactionPattern, packets: auditEvidence, shardReadings: audit.shardReadings })
      : null;
    const fullListOpen = Boolean(activeReactionPattern && expandedFullListId === activeReactionPattern.id);
    const sectionLabelStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", ...textStyles.label, color: tokens.color.subInk };
    const cardStyle: CSSProperties = {
      textAlign: "left",
      border: `1px solid ${tokens.color.line}`,
      borderRadius: tokens.radius.card,
      background: tokens.color.elevated,
      boxShadow: tokens.shadow.topicCard,
      padding: "12px 14px",
      display: "grid",
      gap: 8,
      cursor: "pointer",
      fontFamily: tokens.font.sans
    };
    const renderRefChips = (refs: ReadonlyArray<string>) => refs.slice(0, 3).map((ref) => (
      <EvidenceRefChip
        key={ref}
        refId={ref}
        fragment={auditFragmentLookup.get(ref)}
        pinned={pinnedAuditRef === ref}
        onPin={handlePinAuditRef}
        variant="atlas"
      />
    ));
    return (
      <div style={viewRootStyle()} data-topic-load-state={loadState}>
        <Breadcrumb topicName={topic.name} onBack={handleBack} />

        <TopicAuditOverview
          topic={topic}
          signals={signals}
          summary={auditSummaryValue}
          flags={auditValidatorFlags}
          canRunAudit={canRunAuditFromSources}
          blockedReason={auditBlockedReason}
          p1ReadyCount={p1ReadyCount}
          p1TotalCount={p1TotalCount}
          sourceTotalCount={auditSourceTotal}
          onRunAudit={handleRunAudit}
          onOpenAuditReport={handleOpenAuditReport}
        />

        {showAuditPlaceholder ? (
          <div
            data-topic-audit-placeholder="empty"
            style={{
              borderRadius: tokens.radius.cardLg,
              background: tokens.color.contextSurface,
              padding: "18px 20px",
              fontSize: 12.5,
              lineHeight: 1.65,
              color: tokens.color.subInk,
              boxShadow: tokens.shadow.topicCard
            }}
          >
            <strong style={{ color: tokens.color.ink }}>主題與敘事尚未產出</strong>
            <br />
            {auditSummaryValue.reportStatus === "failed"
              ? `報告於 P${auditSummaryValue.failedStage ?? 1} 失敗；可從失敗點續跑，已完成的 memo 會保留。`
              : "生成議題審查報告後，這裡會顯示主題、敘事線與源清單。"}
          </div>
        ) : null}

        {!showAuditPlaceholder ? (
          <div data-topic-audit-spine="signal-atlas-l0" style={{ display: "grid", gap: 14 }}>
            <section
              data-signal-atlas-hero="true"
              style={{
                display: "grid",
                gap: 14,
                padding: "18px 20px",
                borderRadius: tokens.radius.cardLg,
                border: `1px solid ${tokens.color.atlasEdge}`,
                background: tokens.color.atlasPaper,
                boxShadow: tokens.shadow.atlasGlass,
                backdropFilter: tokens.effect.atlasBlur,
                WebkitBackdropFilter: tokens.effect.atlasBlur
              }}
            >
              <span style={{ ...textStyles.label, color: tokens.color.signalDeep }}>Signal Atlas · Topic Audit · L0</span>
              <h1 style={{ ...textStyles.h2, margin: 0, color: tokens.color.ink }}>{topic.name}</h1>
              <div data-signal-atlas-ledger="true" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {[
                  [`${coverageNumbers.read}`, `/${coverageNumbers.usable} 可用留言`, "已讀留言"],
                  [`${reactionPatterns.length}`, `/${postTotal} 形狀`, "反應形狀"],
                  [`${narrativeCount}`, `/${postTotal} 跨帖敘事`, "跨帖敘事"]
                ].map(([value, denominator, label]) => (
                  <div key={label} data-atlas-ledger-metric={`${value}${denominator}`} style={{ display: "grid", gap: 3, minWidth: 0 }}>
                    <span style={{ ...textStyles.metricDisplay, color: tokens.color.ink }}>{value}</span>
                    <span style={{ ...textStyles.caption, color: tokens.color.subInk }}>{denominator}</span>
                    <span style={{ ...textStyles.label, color: tokens.color.softInk }}>{label}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 17, lineHeight: 1.62, color: tokens.color.ink }}>
                <EvidenceProse prose={headlineProse} fragmentLookup={auditFragmentLookup} pinnedRef={pinnedAuditRef} onPin={handlePinAuditRef} chipVariant="atlas" />
                {headlineRefs.length > 0 ? <span> {renderRefChips(headlineRefs)}</span> : null}
              </p>
            </section>

            {reactionPatterns.length > 0 ? (
              <section data-signal-atlas-map="true" style={{ display: "grid", gap: 8, padding: "12px 14px", borderRadius: tokens.radius.card, background: tokens.color.elevated, border: `1px solid ${tokens.color.line}` }}>
                <div style={sectionLabelStyle}><span>民情形狀</span><span>{reactionPatterns.length}/{postTotal} patterns</span></div>
                <style>{`
                  @media (prefers-reduced-motion: no-preference) {
                    [data-signal-atlas-dot][data-top-dot="true"] { animation: dlens-atlas-dot-pulse ${tokens.motion.duration.slower} ${tokens.motion.easing.standard} infinite alternate; }
                  }
                  @keyframes dlens-atlas-dot-pulse {
                    from { opacity: 0.72; }
                    to { opacity: 1; }
                  }
                `}</style>
                <svg viewBox="0 0 320 132" role="img" aria-label="Signal Atlas reaction pattern map" style={{ width: "100%", height: 132, display: "block" }}>
                  {reactionPatterns.map((pattern, index) => {
                    const max = Math.max(1, ...reactionPatterns.map((entry) => entry.nComments));
                    const radius = 7 + Math.round((pattern.nComments / max) * 12);
                    const x = 42 + (index % 5) * 58;
                    const y = 38 + (index % 2) * 42;
                    const palette = [tokens.color.signal, tokens.color.techniqueViolet, tokens.color.queued, tokens.color.techniqueRose, tokens.color.accent][index % 5];
                    return (
                      <g
                        key={pattern.id}
                        data-signal-atlas-dot={pattern.id}
                        data-top-dot={index === 0 ? "true" : "false"}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveDetail({ kind: "reaction", id: pattern.id })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setActiveDetail({ kind: "reaction", id: pattern.id });
                          }
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <circle cx={x} cy={y} r={radius + 8} fill={tokens.color.signalFaint} />
                        <circle cx={x} cy={y} r={radius} fill={palette} stroke={tokens.color.atlasEdge} strokeWidth="2" style={{ filter: `drop-shadow(0 0 10px ${tokens.color.signalGlow})` }} />
                        <text x={x} y={y + radius + 17} textAnchor="middle" style={{ fontFamily: tokens.font.mono, fontSize: 10, fill: tokens.color.subInk }}>{pattern.nComments}/{pattern.coverageDenominator}</text>
                      </g>
                    );
                  })}
                </svg>
              </section>
            ) : null}

            {reactionPatterns.length > 0 ? (
              <section data-topic-audit-block="reaction-patterns" style={{ display: "grid", gap: 8 }}>
                <div style={sectionLabelStyle}><span>群眾反應</span><span>{reactionPatterns.length}/{postTotal} 形狀</span></div>
                {reactionPatterns.map((pattern) => (
                  <button
                    key={pattern.id}
                    type="button"
                    data-reaction-pattern={pattern.id}
                    data-active={selectedReactionId === pattern.id ? "true" : "false"}
                    onClick={() => setActiveDetail({ kind: "reaction", id: pattern.id })}
                    style={cardStyle}
                  >
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ ...textStyles.cardTitle, color: tokens.color.ink }}>{pattern.label}</span>
                      <span style={{ ...textStyles.metric, color: tokens.color.subInk }}>{pattern.nComments}/{pattern.coverageDenominator}</span>
                    </span>
                    <span style={{ ...textStyles.bodyTight, color: tokens.color.subInk }}>{pattern.dynamicImplication}</span>
                    <span style={{ ...textStyles.metric, color: tokens.color.softInk }}>{reactionPatternNumberRow(pattern, auditFragmentLookup)}</span>
                    <span>{renderRefChips(pattern.representativeRefs.length ? pattern.representativeRefs : pattern.supportRefs)}</span>
                  </button>
                ))}
              </section>
            ) : null}

            {auditLanes.length > 0 ? (
              <section data-topic-audit-block="lanes" style={{ display: "grid", gap: 8 }}>
                <div style={sectionLabelStyle}><span>跨帖敘事線</span><span>{narrativeCount}/{postTotal} narratives</span></div>
                {auditLanes.map((lane) => (
                  <NarrativeLane
                    key={lane.id}
                    lane={lane}
                    active={selectedLaneId === lane.id}
                    onClick={() => setActiveDetail({ kind: "narrative", id: lane.id })}
                    fragmentLookup={auditFragmentLookup}
                    pinnedRef={pinnedAuditRef}
                    onPin={handlePinAuditRef}
                  />
                ))}
              </section>
            ) : null}

            <section data-topic-audit-block="reliability" style={{ display: "grid", gap: 7, padding: "11px 13px", borderRadius: tokens.radius.card, background: tokens.color.queuedSoft, border: `1px solid ${tokens.color.queuedBorder}` }}>
              <span style={{ ...textStyles.label, color: tokens.color.queued }}>缺席與可靠性</span>
              <p style={{ margin: 0, ...textStyles.bodyTight, color: tokens.color.subInk }}>{audit.absenceProse || "沒有 P5 absence memo；先把這次讀法視為可用樣本內的形狀。"}</p>
              {audit.caveats.map((caveat) => <span key={caveat} style={{ ...textStyles.caption, color: tokens.color.softInk }}>{caveat}</span>)}
            </section>

            {auditEvidence.length > 0 ? (
              <section data-topic-audit-block="sources" style={{ display: "grid", gap: 8 }}>
                <div style={sectionLabelStyle}><span>來源 footer</span><span>{postTotal}/{postTotal} 貼文 · {coverageNumbers.captured}/{coverageNumbers.usable} 留言</span></div>
                <div data-topic-audit-source-list-style="audit-report" style={{ display: "grid", gap: 2, borderRadius: tokens.radius.cardLg, background: tokens.color.elevated, boxShadow: tokens.shadow.topicCard, padding: 6 }}>
                  {audit.sourceRows.map((row) => (
                    <SourceRow
                      key={row.packet.signalId}
                      packet={row.packet}
                      active={selectedSourceId === row.packet.signalId}
                      readingStatus={row.readingStatus}
                      tags={row.tags}
                      showPreview={false}
                      onOpen={() => setActiveDetail({ kind: "source", id: row.packet.signalId })}
                      onRunP1={row.actions.some((entry) => entry.kind === "runAuditP1") ? () => handleRunAuditP1(topic.id, row.packet.signalId) : undefined}
                      isRunningP1={row.isRunningP1}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {auditEvidence.length === 0 ? topicSourceFeed : null}

        <AuditDetailDrawer
          activeDetail={activeDetail}
          reactionPattern={activeReactionPattern}
          reactionDetail={activeReactionPatternDetail}
          narrativeLane={activeLane}
          narrativeDetail={activeLaneDetail}
          sourcePacket={openAuditPacket}
          sourceReading={openAuditReading}
          fragmentLookup={auditFragmentLookup}
          pinnedRef={pinnedAuditRef}
          onPin={handlePinAuditRef}
          onClose={() => setActiveDetail(null)}
          fullList={fullList}
          fullListOpen={fullListOpen}
          onToggleFullList={() => {
            if (!activeReactionPattern) return;
            setExpandedFullListId((current) => current === activeReactionPattern.id ? null : activeReactionPattern.id);
          }}
        />
      </div>
    );
  }

  return (
    <div style={viewRootStyle()} data-topic-load-state={loadState}>
      <div style={{ display: "grid", gap: 10 }}>
        <Breadcrumb topicName={topic.name} onBack={handleBack} />
        <TopicCompactHeader
          topic={topic}
          signalCount={signals.length}
          readyCount={topicAnalysisCounts.ready}
          pairCount={pairs.length}
        />
      </div>

      <TopicAuditOverview
        topic={topic}
        signals={signals}
        summary={auditSummaryValue}
        flags={auditValidatorFlags}
        canRunAudit={canRunAuditFromSources}
        blockedReason={audit.blockedReason}
        p1ReadyCount={p1ReadyCount}
        p1TotalCount={p1TotalCount}
        sourceTotalCount={auditSourceTotal}
        onRunAudit={handleRunAudit}
        onOpenAuditReport={handleOpenAuditReport}
      />

      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: 18 }}>
        {auditSummaryValue.reportStatus === "failed" || (auditThemes.length === 0 && auditLanes.length === 0 && auditEvidence.length === 0) ? (
          <div
            data-topic-audit-placeholder="p3"
            style={{
              borderRadius: tokens.radius.cardLg,
              background: tokens.color.contextSurface,
              padding: "16px 18px",
              fontSize: 12.5,
              lineHeight: 1.65,
              color: tokens.color.subInk
            }}
          >
            <strong style={{ color: tokens.color.ink }}>主題待 P3 完成</strong>
            <br />
            ThemeChip / NarrativeLane 只讀 LensMemo.displayHints；目前沒有可顯示的 display hints。
          </div>
        ) : null}

        {auditThemes.length > 0 ? (
          <section data-topic-audit-block="themes">
            <SectionLabel kicker="主題" hint={auditSummaryValue.reportStatus === "stale" ? "基於舊版報告" : "廣議題層　非細粒標籤"}>
              主題
            </SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {auditThemes.map((theme) => (
                <ThemeChip
                  key={theme}
                  label={theme}
                  active={false}
                  onClick={() => setActiveDetail(null)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {auditLanes.length > 0 ? (
          <section data-topic-audit-block="lanes" style={{ display: "grid", gap: 8 }}>
            <SectionLabel kicker="敘事" hint={auditSummaryValue.reportStatus === "stale" ? "基於舊版　新訊號未納入" : "從訊號自然長出的故事線"}>
              敘事線
            </SectionLabel>
            {auditLanes.map((lane) => (
              <NarrativeLane
                key={lane.id}
                lane={lane}
                active={selectedLaneId === lane.id}
                onClick={() => setActiveDetail({ kind: "narrative", id: lane.id })}
              />
            ))}
          </section>
        ) : null}

        {auditEvidence.length > 0 ? (
          <section data-topic-audit-block="sources" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "end" }}>
              <SectionLabel hint="一行一篇　點開看判讀與引用">
                資料來源
              </SectionLabel>
              {selectedLaneId ? (
                <AuditGhostButton
                  onClick={() => setActiveDetail(null)}
                  style={{ padding: "5px 8px", fontSize: 10.5 }}
                >
                  清除篩選
                </AuditGhostButton>
              ) : null}
            </div>
            <div style={{ display: "grid", gap: 2, borderRadius: tokens.radius.cardLg, background: tokens.color.elevated, boxShadow: tokens.shadow.topicCard, padding: 6 }}>
              {filteredAuditRows.map((row) => (
                <SourceRow
                  key={row.packet.signalId}
                  packet={row.packet}
                  active={selectedSourceId === row.packet.signalId}
                  readingStatus={row.readingStatus}
                  tags={row.tags}
                  onOpen={() => setActiveDetail({ kind: "source", id: row.packet.signalId })}
                  onRunP1={row.actions.some((entry) => entry.kind === "runAuditP1") ? () => handleRunAuditP1(topic.id, row.packet.signalId) : undefined}
                  isRunningP1={row.isRunningP1}
                />
              ))}
            </div>
          </section>
        ) : null}
      </WorkspaceSurface>

      {openAuditPacket ? (
        <SignalDrawer
          packet={openAuditPacket}
          reading={openAuditReading}
          topicName={topic.name}
          onClose={() => setActiveDetail(null)}
          onGenerateReading={openAuditRow?.actions.some((entry) => entry.kind === "runAuditP1")
            ? () => handleRunAuditP1(topic.id, openAuditPacket.signalId)
            : undefined}
          readingPending={openAuditRow?.readingStatus === "running"}
        />
      ) : null}

      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {topic.tags.map((tag) => (
            <span
              key={tag}
              style={{
                borderRadius: 999,
                background: tokens.color.neutralSurface,
                color: tokens.color.subInk,
                padding: "4px 8px",
                fontSize: 10.5,
                fontWeight: 700
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        <details
          style={{
            border: `1px solid ${tokens.color.line}`,
            borderRadius: 8,
            background: tokens.color.surface,
            padding: "8px 10px",
            color: tokens.color.subInk
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              fontSize: 11,
              fontWeight: 700,
              listStyle: "none"
            }}
          >
            <span>補充描述</span>
            <span style={{ flex: "1 1 auto", minWidth: 0, textAlign: "right", fontWeight: 500, ...lineClamp(1) }}>
              {draftDescription || "尚未補充"}
            </span>
          </summary>
          <textarea
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            onBlur={() => draftDescription !== (topic.description || "") && dispatch({ kind: "updateTopic", target: commandTarget, patch: { description: draftDescription } })}
            rows={2}
            style={{
              resize: "vertical",
              minHeight: 48,
              borderRadius: 8,
              border: `1px solid ${tokens.color.line}`,
              background: tokens.color.surface,
              color: tokens.color.ink,
              padding: "8px 10px",
              fontSize: 12,
              lineHeight: 1.45,
              fontFamily: tokens.font.sans
            }}
          />
        </details>

        <details
          style={{
            border: `1px solid ${tokens.color.line}`,
            borderRadius: 8,
            background: tokens.color.surface,
            padding: "8px 10px",
            color: tokens.color.subInk
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              fontSize: 11,
              fontWeight: 700,
              listStyle: "none"
            }}
          >
            <span>研究問題（可選）</span>
            <span style={{ flex: "1 1 auto", minWidth: 0, textAlign: "right", fontWeight: 500, ...lineClamp(1) }}>
              {draftResearchQuestion || "尚未設定"}
            </span>
          </summary>
          <textarea
            value={draftResearchQuestion}
            onChange={(event) => setDraftResearchQuestion(event.target.value)}
            onBlur={handleResearchQuestionBlur}
            rows={2}
            placeholder="如果已經有想驗證的方向，可以寫在這裡；沒有也可以直接生成判讀。"
            style={{
              resize: "vertical",
              minHeight: 48,
              borderRadius: 8,
              border: `1px solid ${tokens.color.line}`,
              background: tokens.color.surface,
              color: tokens.color.ink,
              padding: "8px 10px",
              fontSize: 12,
              lineHeight: 1.45,
              fontFamily: tokens.font.sans
            }}
          />
        </details>

        <section style={{ display: "grid", gap: 12 }}>
            <TopicSignalTagCloud
              summaries={signalTagSummaries}
              taggedCount={taggedSignalCount}
              selectedTag={selectedTag}
              onSelectTag={setSelectedTag}
              onClearTag={() => setSelectedTag(null)}
            />

            {topicAnalysisCounts.processing > 0 ? (
              <TopicProcessingStatus
                total={topicAnalysisCounts.total}
                ready={topicAnalysisCounts.ready}
                queued={topicAnalysisCounts.queued}
                crawling={topicAnalysisCounts.crawling}
                analyzing={topicAnalysisCounts.analyzing}
                workerStatus={workerStatus}
                backendWorkUiState={backendWorkUiState}
                isStartingProcessing={isStartingProcessing}
                onStartProcessing={handleStartProcessing}
              />
            ) : null}

            {unanalyzedItemIds.length > 0 ? (
              <BulkAnalyzeCta
                count={unanalyzedItemIds.length}
                isBulkAnalyzing={isBulkAnalyzing}
                disabled={!viewModel.actions.some((entry) => entry.kind === "analyzeItems") || isBulkAnalyzing}
                onAnalyze={handleAnalyzeUnanalyzedItems}
              />
            ) : null}

            {sessionMode === "product" && primaryJudgmentPair ? (
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: "14px 16px",
                  borderRadius: tokens.radius.card,
                  border: `1px solid ${tokens.color.line}`,
                  background: tokens.color.elevated
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: tokens.color.ink }}>產品情境判斷</div>
                  <SecondaryButton
                    onClick={() => {
                      if (!primaryJudgmentPair) {
                        return;
                      }
                      const next = manualJudgment ?? {
                        resultId: primaryJudgmentPair.resultId,
                        relevance: primaryJudgmentPair.judgmentResult?.relevance ?? 3,
                        recommendedState: primaryJudgmentPair.judgmentResult?.recommendedState ?? "watch"
                      };
                      handleSaveJudgmentOverride(primaryJudgmentPair.resultId, {
                        relevance: next.relevance,
                        recommendedState: next.recommendedState
                      });
                    }}
                  >
                    人工調教
                  </SecondaryButton>
                </div>
                <div style={{ display: "grid", gap: 6, fontSize: 12, color: tokens.color.subInk }}>
                  <div>相關性 {visibleJudgment?.relevance ?? "—"}/5</div>
                  <div>建議狀態 {visibleJudgment?.recommendedState?.toUpperCase() ?? "—"}</div>
                  <div>為何重要 {visibleJudgment?.whyThisMatters || "尚未產生 judgment"}</div>
                  <div>行動提示 {visibleJudgment?.actionCue || "尚未產生 judgment"}</div>
                </div>
                {primaryJudgmentPair ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select
                      value={manualJudgment?.relevance ?? visibleJudgment?.relevance ?? 3}
                      onChange={(event) =>
                        setManualJudgment({
                          resultId: primaryJudgmentPair.resultId,
                          relevance: Number(event.target.value) as 1 | 2 | 3 | 4 | 5,
                          recommendedState: manualJudgment?.recommendedState ?? visibleJudgment?.recommendedState ?? "watch"
                        })
                      }
                      style={{ borderRadius: 10, border: `1px solid ${tokens.color.line}`, padding: "8px 10px", background: tokens.color.surface }}
                    >
                      {[1, 2, 3, 4, 5].map((value) => (
                        <option key={value} value={value}>
                          相關 {value}
                        </option>
                      ))}
                    </select>
                    <select
                      value={manualJudgment?.recommendedState ?? visibleJudgment?.recommendedState ?? "watch"}
                      onChange={(event) =>
                        setManualJudgment({
                          resultId: primaryJudgmentPair.resultId,
                          relevance: manualJudgment?.relevance ?? visibleJudgment?.relevance ?? 3,
                          recommendedState: event.target.value as "park" | "watch" | "act"
                        })
                      }
                      style={{ borderRadius: 10, border: `1px solid ${tokens.color.line}`, padding: "8px 10px", background: tokens.color.surface }}
                    >
                      <option value="park">PARK</option>
                      <option value="watch">WATCH</option>
                      <option value="act">ACT</option>
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}

            {pairs.length > 0 ? (
              <details
                data-topic-pairs="folded"
                style={{
                  border: `1px solid ${tokens.color.line}`,
                  borderRadius: tokens.radius.card,
                  background: tokens.color.surface,
                  padding: "10px 12px"
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    listStyle: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    color: tokens.color.subInk
                  }}
                >
                  <span>比較結果（工具）</span>
                  <span style={{ fontSize: 11, color: tokens.color.softInk, fontWeight: 500 }}>
                    {pairs.length} 筆 · 點開展開
                  </span>
                </summary>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {pairs.map((pair) => (
                    <PairRow key={pair.resultId} pair={pair} onOpenPair={handleOpenPair} />
                  ))}
                </div>
              </details>
            ) : null}

            {signals.length > 0 ? (
              <details
                data-topic-signals="folded"
                style={{
                  border: `1px solid ${tokens.color.line}`,
                  borderRadius: tokens.radius.card,
                  background: tokens.color.surface,
                  padding: "10px 12px"
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    listStyle: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    color: tokens.color.subInk
                  }}
                >
                  <span>全部訊號篇目</span>
                  <span style={{ fontSize: 11, color: tokens.color.softInk, fontWeight: 500 }}>
                    {selectedTag ? `${visibleSignals.length}/${signals.length} 篇` : `${signals.length} 篇`} · 點開展開
                  </span>
                </summary>
                <style>{SCAN_ROW_HOVER_CSS}</style>
                {deleteError ? (
                  <div style={{ marginTop: 8, fontSize: 11, color: tokens.color.failed }}>
                    {deleteError}
                  </div>
                ) : null}
	                <div style={{ display: "grid", marginTop: 8 }}>
	                  {visibleSignals.map((signal) => {
	                    const status = signal.analysisState;
	                    const preview = signal.sourcePreview.displayText || signal.source;
	                    const originalUrl = signal.sourcePreview.displayUrl || (typeof signal.source === "string" && signal.source.startsWith("http") ? signal.source : "");
	                    const tagRecord = signal.tagRecord;
	                    const openAnalysisAction = signal.actions.find((entry) => entry.kind === "openSignalAnalysis");
	                    const addToCompareAction = signal.actions.find((entry) => entry.kind === "addSignalToCompare");
	                    const analyzeAction = signal.actions.find((entry) => entry.kind === "analyzeItem" || entry.kind === "queueSignalItem");
	                    const deleteAction = signal.actions.find((entry) => entry.kind === "deleteSignal");
	                    const generateReadingAction = signal.actions.find((entry) => entry.kind === "generateSignalReading");
	                    const reading = signal.reading;

	                    return (
	                      <div
	                        key={signal.signalId}
	                        data-scan-row="true"
	                        style={scanRowStyle({
	                          display: "grid",
	                          gridTemplateColumns: deleteAction ? "5px minmax(0, 1fr) auto 24px" : "5px minmax(0, 1fr) auto",
                          gap: 10,
                          padding: "10px 4px",
                          alignItems: "start"
                        })}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 5,
                            height: 24,
                            borderRadius: 999,
                            background: "var(--dlens-mode-accent)",
                            marginTop: 2
                          }}
                        />
                        <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: tokens.color.ink, ...lineClamp(1) }}>
                            {tagRecord?.signalGist || preview}
                          </div>
                          {tagRecord?.signalGist && preview ? (
                            <div style={{ fontSize: 11, lineHeight: 1.45, color: tokens.color.softInk, ...lineClamp(1) }}>
                              {preview}
                            </div>
                          ) : null}
	                          {tagRecord?.signalTags.length ? (
	                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
	                              {tagRecord.signalTags.map((tag) => (
	                                <button
	                                  key={`${signal.signalId}-${tag}`}
                                  type="button"
                                  onClick={() => setSelectedTag(tag)}
                                  style={{
                                    border: `1px solid ${selectedTag === tag ? tokens.color.accentGlow : tokens.color.line}`,
                                    borderRadius: 999,
                                    background: selectedTag === tag ? tokens.color.accentSoft : tokens.color.neutralSurface,
                                    color: selectedTag === tag ? tokens.color.accent : tokens.color.subInk,
                                    padding: "3px 7px",
                                    fontSize: 10.5,
                                    fontWeight: 650,
                                    cursor: "pointer"
                                  }}
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          <div style={{ fontSize: 11, color: tokens.color.softInk }}>
                            加入 {formatTopicDate(signal.capturedAt)}
                          </div>
	                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
	                              {status ? (
	                                <Stamp tone={analysisStateTone(status)}>
	                                  {analysisStateLabel(status)}
	                                </Stamp>
	                              ) : null}
	                              {originalUrl ? (
	                                <a
	                                  href={originalUrl}
	                                  target="_blank"
	                                  rel="noopener noreferrer"
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: 10.5,
                                    borderRadius: 6,
                                    border: `1px solid ${tokens.color.line}`,
                                    background: tokens.color.surface,
                                    color: tokens.color.subInk,
                                    fontWeight: 600,
                                    textDecoration: "none",
                                    lineHeight: 1
                                  }}
	                                >
	                                  查看原文 ↗
	                                </a>
	                              ) : null}
	                              {signal.itemId && !signal.isProcessing ? (
	                                signal.isReady ? (
	                                  <>
	                                    {openAnalysisAction ? (
	                                      <SecondaryButton onClick={() => dispatch(openAnalysisAction)} style={{ padding: "4px 8px", fontSize: 10.5 }}>
	                                        查看分析
	                                      </SecondaryButton>
	                                    ) : null}
	                                    {addToCompareAction ? (
	                                      <SecondaryButton onClick={() => dispatch(addToCompareAction)} style={{ padding: "4px 8px", fontSize: 10.5 }}>
	                                        加入比較
	                                      </SecondaryButton>
	                                    ) : null}
	                                  </>
	                                ) : analyzeAction ? (
	                                  <SecondaryButton
	                                    onClick={() => handleAnalyzeItem(signal)}
	                                    disabled={analyzeAction.kind === "analyzeItem" && isBulkAnalyzing}
	                                    style={{ padding: "4px 8px", fontSize: 10.5 }}
	                                  >
	                                    {singleAnalyzeActionLabel(analyzeAction.kind === "analyzeItem")}
	                                  </SecondaryButton>
	                                ) : null
	                              ) : null}
	                            </div>
	                          {(() => {
	                            if (reading) {
                              return (
                                <div
                                  data-topic-signal-reading="card"
                                  style={{
                                    display: "grid",
                                    gap: 6,
                                    paddingTop: 8,
                                    borderTop: `1px solid ${tokens.color.line}`
                                  }}
                                >
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <StanceBadge stance={reading.stance} />
                                    <span style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.softInk }}>
                                      {new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric" }).format(new Date(reading.generatedAt))}
                                    </span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: tokens.color.ink }}>
                                    {reading.reading}
                                  </p>
                                  {reading.audienceSignal ? (
                                    <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: tokens.color.subInk }}>
                                      {reading.audienceSignal}
                                    </p>
                                  ) : null}
                                  {reading.uncertainties.length > 0 ? (
                                    <div style={{ fontSize: 11, color: tokens.color.softInk }}>
                                      待驗證：{reading.uncertainties.join("、")}
                                    </div>
                                  ) : null}
                                </div>
	                              );
	                            }
	                            if (!signal.isReady || !generateReadingAction) return null;
	                            return (
	                              <div style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 4 }}>
	                                <SecondaryButton
	                                  onClick={() => handleGenerateSignalReading(signal.signalId)}
	                                  disabled={isGeneratingForSignalId === signal.signalId}
	                                  style={{ padding: "4px 8px", fontSize: 10.5 }}
	                                >
	                                  {isGeneratingForSignalId === signal.signalId ? "生成中…" : "生成判讀"}
	                                </SecondaryButton>
	                                {generatingErrorBySignalId[signal.signalId] ? (
	                                  <span style={{ fontSize: 10.5, color: tokens.color.failed }}>
	                                    {generatingErrorBySignalId[signal.signalId]}
	                                  </span>
	                                ) : null}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ fontSize: 10, color: tokens.color.softInk, whiteSpace: "nowrap" }}>
                          {formatTopicDate(signal.capturedAt)}
                        </div>
	                        {deleteAction ? (
	                          <button
                            type="button"
                            data-topic-signal-remove="true"
                            aria-label="移除此訊號"
	                            disabled={deletingSignalId === signal.signalId}
	                            onClick={(event) => {
	                              event.preventDefault();
	                              event.stopPropagation();
	                              void handleDeleteSignal(signal.signalId);
	                            }}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              border: `1px solid ${tokens.color.line}`,
                              background: tokens.color.surface,
                              color: tokens.color.softInk,
	                              cursor: deletingSignalId === signal.signalId ? "wait" : "pointer",
                              lineHeight: 1,
                              fontSize: 14,
                              padding: 0
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </section>

      </WorkspaceSurface>
    </div>
  );
}

export const topicDetailViewTestables = {
  Breadcrumb,
  PairRow,
  BulkAnalyzeCta,
  SynthesisStackSection,
  TopicProcessingStatus,
  singleAnalyzeActionLabel,
  runSingleAnalyzeAction,
  pickPrimaryJudgmentPair
};
