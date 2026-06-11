import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  TOPIC_SYNTHESIS_MIN_ANALYZED,
  TOPIC_SYNTHESIS_STALE_DELTA,
  topicSynthesisStaleReason
} from "../compare/topic-synthesis.ts";
import type { EvidencePacket, LensMemo, TopicAuditStageName } from "../compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../compare/topic-audit-validator.ts";
import { getItemReadinessStatus, type ItemReadinessStatus } from "../state/processing-state.ts";
import type { TopicAuditMemoBundle } from "../state/topic-audit-storage.ts";
import type { LoadState } from "../state/load-state.ts";
import type {
  FolderMode,
  SavedAnalysisSnapshot,
  SessionItem,
  Signal,
  SignalTagsRecord,
  Topic,
  TopicSignalReading,
  TopicSignalStance,
  TopicSynthesis,
  TopicSynthesisLayout
} from "../state/types.ts";
import { Kicker, PrimaryButton, SCAN_ROW_HOVER_CSS, SecondaryButton, Stamp, WorkspaceSurface, lineClamp, scanRowStyle, viewRootStyle } from "./components.tsx";
import { SignalDrawer } from "./SignalDrawer.tsx";
import { tokens } from "./tokens.ts";
import {
  GhostButton as AuditGhostButton,
  NarrativeLane,
  PrimaryButton as AuditPrimaryButton,
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

type TopicItemAnalysisState = ItemReadinessStatus | "queued";

interface TopicDetailViewProps {
  topic: Topic;
  signals: Signal[];
  pairs: SavedAnalysisSnapshot[];
  onBack: () => void;
  onOpenPair: (resultId: string) => void;
  onUpdateTopic: (patch: Partial<Topic>) => void;
  loadState?: LoadState;
  sessionMode?: FolderMode;
  sessionItems?: SessionItem[];
  savedAnalyses?: SavedAnalysisSnapshot[];
  signalPreviewById?: Record<string, string>;
  onQueueItemById?: (itemId: string) => void;
  onAnalyzeItems?: (itemIds: string[]) => Promise<{ ok: boolean; failedCount: number }>;
  onStartProcessing?: () => void;
  isBulkAnalyzing?: boolean;
  isStartingProcessing?: boolean;
  workerStatus?: "idle" | "draining" | null;
  optimisticQueuedItemIds?: ReadonlyArray<string>;
  onOpenAnalysis?: (resultId: string) => void;
  onAddToCompare?: (itemId: string) => void;
  onSaveJudgmentOverride?: (resultId: string, patch: { relevance: 1 | 2 | 3 | 4 | 5; recommendedState: "park" | "watch" | "act" }) => void;
  onGenerateSynthesis?: (topicId: string) => Promise<{ ok: boolean; error?: string }>;
  signalReadingsBySignalId?: Record<string, TopicSignalReading>;
  signalTagsByItemId?: Record<string, SignalTagsRecord>;
  onGenerateSignalReading?: (signalId: string, topicId: string) => Promise<{ ok: boolean; error?: string }>;
  onSignalDeleted?: (signalId: string) => Promise<void>;
  synthLayout?: TopicSynthesisLayout;
  auditEvidence?: EvidencePacket[];
  auditMemos?: TopicAuditMemoBundle | null;
  auditSummary?: TopicAuditSummary;
  auditValidatorFlags?: TopicAuditValidationFlag[];
  onRunAudit?: (topicId: string, fromStage?: TopicAuditStageName) => void;
  onRunAuditP1?: (topicId: string, signalId: string) => void;
  p1RunningSignalIds?: ReadonlyArray<string>;
  p1ErrorBySignalId?: Record<string, string>;
  onOpenAuditReport?: (topicId: string, stale?: boolean) => void;
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
  onAnalyzeItems?: TopicDetailViewProps["onAnalyzeItems"];
  onQueueItemById?: TopicDetailViewProps["onQueueItemById"];
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

function getTopicItemAnalysisState(
  item: SessionItem | undefined,
  optimisticQueuedSet?: Set<string>
): TopicItemAnalysisState | undefined {
  if (!item) return undefined;
  if (optimisticQueuedSet?.has(item.id) && (item.status === "saved" || item.status === "failed")) return "queued";
  if (item.status === "queued") return "queued";
  return getItemReadinessStatus(item);
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
  isStartingProcessing,
  onStartProcessing
}: {
  total: number;
  ready: number;
  queued: number;
  crawling: number;
  analyzing: number;
  workerStatus?: "idle" | "draining" | null;
  isStartingProcessing?: boolean;
  onStartProcessing?: () => void;
}) {
  const processing = queued + crawling + analyzing;
  const queuedOnly = queued > 0 && crawling === 0 && analyzing === 0;
  const title = analyzing > 0
    ? `正在分析 ${analyzing} 篇`
    : crawling > 0
      ? `正在捕捉 ${crawling} 篇`
      : `已排隊 ${queued} 篇`;
  const detail = queuedOnly && workerStatus === "idle"
    ? `${ready}/${total} 已完成，worker 目前未在跑，可重新啟動處理`
    : `${ready}/${total} 已完成，完成後可查看單篇分析或加入比較`;
  const stamp = queuedOnly && workerStatus === "idle" ? "等待處理" : "處理中";

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
        {queuedOnly && workerStatus === "idle" && onStartProcessing ? (
          <SecondaryButton
            onClick={onStartProcessing}
            disabled={Boolean(isStartingProcessing)}
            style={{ padding: "7px 10px", fontSize: 11 }}
          >
            {isStartingProcessing ? "啟動中…" : "啟動處理"}
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

function StanceBadge({ stance }: { stance: TopicSignalStance }) {
  const config: Record<TopicSignalStance, { label: string; bg: string; color: string }> = {
    central: { label: "核心", bg: tokens.color.accentSoft, color: tokens.color.accent },
    adjacent: { label: "相鄰", bg: tokens.color.neutralSurface, color: tokens.color.subInk },
    "off-topic": { label: "偏離", bg: tokens.color.neutralSurface, color: tokens.color.softInk }
  };
  const { label, bg, color } = config[stance] ?? config.adjacent;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: bg, color }}>
      {label}
    </span>
  );
}

interface SignalTagSummary {
  tag: string;
  count: number;
}

function buildSignalTagSummaries(
  signals: Signal[],
  signalTagsByItemId: Record<string, SignalTagsRecord>
): SignalTagSummary[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const signal of signals) {
    if (!signal.itemId) continue;
    const record = signalTagsByItemId[signal.itemId];
    if (!record || record.status !== "complete") continue;
    const seenInSignal = new Set<string>();
    for (const tag of record.signalTags) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized || seenInSignal.has(normalized)) continue;
      seenInSignal.add(normalized);
      const existing = counts.get(normalized);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(normalized, { tag, count: 1 });
      }
    }
  }
  return [...counts.values()].sort((left, right) =>
    right.count - left.count
    || left.tag.localeCompare(right.tag)
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
                background: active ? tokens.color.accentSoft : repeated ? "rgba(63,90,59,0.10)" : tokens.color.surface,
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

type AuditDisplayHints = {
  themeChips?: string[];
  narrativeLanes?: NarrativeLaneHint[];
};

function auditStageToNumber(stage: TopicAuditStageName | undefined): number {
  switch (stage) {
    case "p1-signal-reading": return 1;
    case "lexicon": return 2;
    case "narrative": return 3;
    case "audience": return 4;
    case "absence": return 5;
    case "final": return 6;
    default: return 1;
  }
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

function readAuditDisplayHints(memos: LensMemo[]): AuditDisplayHints {
  const merged: AuditDisplayHints = {};
  for (const memo of memos) {
    const hints = memo.displayHints as AuditDisplayHints | undefined;
    if (!hints) continue;
    if (!merged.themeChips && hints.themeChips?.length) {
      merged.themeChips = hints.themeChips;
    }
    if (!merged.narrativeLanes && hints.narrativeLanes?.length) {
      merged.narrativeLanes = hints.narrativeLanes;
    }
  }
  return merged;
}

function buildTopicAuditSummary({
  signals,
  auditEvidence,
  auditMemos,
  auditSummary
}: {
  signals: Signal[];
  auditEvidence: EvidencePacket[];
  auditMemos: TopicAuditMemoBundle | null | undefined;
  auditSummary?: TopicAuditSummary;
}): TopicAuditSummary {
  const sourceTotal = topicAuditSourceTotal({ signals, auditEvidence, auditMemos, auditSummary });
  const analyzedCount = topicAuditAnalyzedCount({ auditEvidence, auditMemos, auditSummary });
  if (auditSummary) {
    return {
      ...auditSummary,
      analyzedCount,
      queuedCount: sourceTotal - analyzedCount,
      coverage: topicAuditCoverageLabel({ auditEvidence, auditSummary, sourceTotal })
    };
  }
  return {
    reportStatus: auditMemos ? "ready" : "none",
    analyzedCount,
    queuedCount: sourceTotal - analyzedCount,
    coverage: topicAuditCoverageLabel({ auditEvidence, auditSummary, sourceTotal }),
    flags: []
  };
}

function topicAuditSourceTotal({
  signals,
  auditEvidence,
  auditMemos,
  auditSummary
}: {
  signals: Signal[];
  auditEvidence: EvidencePacket[];
  auditMemos: TopicAuditMemoBundle | null | undefined;
  auditSummary?: TopicAuditSummary;
}): number {
  if (auditEvidence.length > 0) {
    return auditEvidence.length;
  }
  if (auditMemos?.signalReadings.length) {
    return auditMemos.signalReadings.length;
  }
  if (auditSummary) {
    return auditSummary.analyzedCount + auditSummary.queuedCount;
  }
  return signals.length;
}

function topicAuditAnalyzedCount({
  auditEvidence,
  auditMemos,
  auditSummary
}: {
  auditEvidence: EvidencePacket[];
  auditMemos: TopicAuditMemoBundle | null | undefined;
  auditSummary?: TopicAuditSummary;
}): number {
  if (auditEvidence.length > 0) {
    const readSignalIds = new Set((auditMemos?.signalReadings ?? []).map((reading) => reading.signalId));
    return auditEvidence.filter((packet) => readSignalIds.has(packet.signalId)).length;
  }
  if (auditMemos?.signalReadings.length) {
    return auditMemos.signalReadings.length;
  }
  return auditSummary?.analyzedCount ?? 0;
}

function topicAuditCoverageLabel({
  auditEvidence,
  auditSummary,
  sourceTotal
}: {
  auditEvidence: EvidencePacket[];
  auditSummary?: TopicAuditSummary;
  sourceTotal: number;
}): string | undefined {
  if (auditEvidence.length > 0) {
    return `${auditEvidence.length}/${sourceTotal}`;
  }
  return auditSummary?.coverage;
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
  signals: Signal[];
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
    : null;
  const failedStage = summary.failedStage ?? 1;
  const runAudit = (fromStage?: TopicAuditStageName) => {
    if (!canRunAudit) return;
    onRunAudit?.(topic.id, fromStage);
  };
  return (
    <section
      data-topic-audit-block="overview"
      style={{
        display: "grid",
        gap: 14,
        borderRadius: tokens.radius.cardLg,
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
            <span>{summary.analyzedCount}/{displaySourceTotal} 已分析</span>
            <TopicAuditStatusPill summary={summary} />
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, minWidth: 160 }}>
          {summary.reportStatus === "ready" ? (
            <>
              <AuditPrimaryButton onClick={() => onOpenAuditReport?.(topic.id)}>開啟審查報告 ↗</AuditPrimaryButton>
              <AuditGhostButton disabled={!canRunAudit} onClick={() => runAudit()}>重新生成</AuditGhostButton>
            </>
          ) : summary.reportStatus === "running" ? (
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
              <AuditPrimaryButton disabled={!canRunAudit || p1NoneReady && (p1TotalCount ?? 0) === 0} onClick={() => runAudit()}>{generateCtaLabel}</AuditPrimaryButton>
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
          state={summary.reportStatus === "ready" || summary.reportStatus === "stale" ? "validated" : "pending"}
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
    </section>
  );
}

export function TopicDetailView({
  topic,
  signals,
  pairs,
  onBack,
  onOpenPair,
  onUpdateTopic,
  loadState = "ready",
  sessionMode = "topic",
  sessionItems = [],
  savedAnalyses = [],
  signalPreviewById = {},
  onQueueItemById,
  onAnalyzeItems,
  onStartProcessing,
  isBulkAnalyzing = false,
  isStartingProcessing = false,
  workerStatus = null,
  optimisticQueuedItemIds = [],
  onOpenAnalysis,
  onAddToCompare,
  onSaveJudgmentOverride,
  onGenerateSynthesis,
  signalReadingsBySignalId = {},
  signalTagsByItemId = {},
  onGenerateSignalReading,
  onSignalDeleted,
  synthLayout = "console",
  auditEvidence = [],
  auditMemos = null,
  auditSummary,
  auditValidatorFlags = [],
  onRunAudit,
  onRunAuditP1,
  p1RunningSignalIds = [],
  p1ErrorBySignalId = {},
  onOpenAuditReport
}: TopicDetailViewProps) {
  const [draftDescription, setDraftDescription] = useState(topic.description || "");
  const [draftResearchQuestion, setDraftResearchQuestion] = useState(topic.context?.researchQuestion || "");
  const [isGeneratingForSignalId, setIsGeneratingForSignalId] = useState<string | null>(null);
  const [generatingErrorBySignalId, setGeneratingErrorBySignalId] = useState<Record<string, string>>({});
  const [deletingSignalId, setDeletingSignalId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeAuditTheme, setActiveAuditTheme] = useState<string | null>(null);
  const [activeAuditLane, setActiveAuditLane] = useState<string | null>(null);
  const [openAuditSignalId, setOpenAuditSignalId] = useState<string | null>(null);
  const [manualJudgment, setManualJudgment] = useState<{
    resultId: string;
    relevance: 1 | 2 | 3 | 4 | 5;
    recommendedState: "park" | "watch" | "act";
  } | null>(null);

  const primaryJudgmentPair = useMemo(() => pickPrimaryJudgmentPair(pairs), [pairs]);

  useEffect(() => {
    setDraftDescription(topic.description || "");
    setDraftResearchQuestion(topic.context?.researchQuestion || "");
  }, [topic.context?.researchQuestion, topic.description, topic.id]);

  const itemByItemId = useMemo(() => {
    const map = new Map<string, SessionItem>();
    for (const item of sessionItems) map.set(item.id, item);
    return map;
  }, [sessionItems]);

  const resultIdByItemId = useMemo(() => {
    const map = new Map<string, string>();
    for (const analysis of savedAnalyses) {
      if (!map.has(analysis.itemAId)) map.set(analysis.itemAId, analysis.resultId);
      if (!map.has(analysis.itemBId)) map.set(analysis.itemBId, analysis.resultId);
    }
    return map;
  }, [savedAnalyses]);
  const optimisticQueuedSet = useMemo(
    () => new Set(optimisticQueuedItemIds),
    [optimisticQueuedItemIds]
  );

  const unanalyzedItemIds = useMemo(() => {
    return signals
      .filter((s) => {
        if (!s.itemId) return false;
        const item = itemByItemId.get(s.itemId);
        const state = getTopicItemAnalysisState(item, optimisticQueuedSet);
        return state === "saved" || state === "failed";
      })
      .map((s) => s.itemId!);
  }, [signals, itemByItemId, optimisticQueuedSet]);

  const topicAnalysisCounts = useMemo(() => {
    const counts = {
      total: signals.length,
      ready: 0,
      saved: 0,
      queued: 0,
      crawling: 0,
      analyzing: 0,
      failed: 0,
      missing: 0,
      processing: 0
    };
    for (const signal of signals) {
      if (!signal.itemId) {
        counts.missing += 1;
        continue;
      }
      const item = itemByItemId.get(signal.itemId);
      if (!item) {
        counts.missing += 1;
        continue;
      }
      const state = getTopicItemAnalysisState(item, optimisticQueuedSet);
      if (state === "ready") {
        counts.ready += 1;
      } else if (state === "saved") {
        counts.saved += 1;
      } else if (state === "queued") {
        counts.queued += 1;
        counts.processing += 1;
      } else if (state === "crawling") {
        counts.crawling += 1;
        counts.processing += 1;
      } else if (state === "analyzing") {
        counts.analyzing += 1;
        counts.processing += 1;
      } else if (state === "failed") {
        counts.failed += 1;
      }
    }
    return counts;
  }, [signals, itemByItemId, optimisticQueuedSet]);

  const signalTagSummaries = useMemo(
    () => buildSignalTagSummaries(signals, signalTagsByItemId),
    [signalTagsByItemId, signals]
  );
  const taggedSignalCount = useMemo(
    () => signals.filter((signal) => signal.itemId && signalTagsByItemId[signal.itemId]?.status === "complete").length,
    [signalTagsByItemId, signals]
  );
  const visibleSignals = useMemo(
    () => signals.filter((signal) =>
      hasSignalTag(signal.itemId ? signalTagsByItemId[signal.itemId] : undefined, selectedTag)
    ),
    [selectedTag, signalTagsByItemId, signals]
  );
  const auditSourceTotal = useMemo(
    () => topicAuditSourceTotal({ signals, auditEvidence, auditMemos, auditSummary }),
    [auditEvidence, auditMemos, auditSummary, signals]
  );
  const auditSummaryValue = useMemo(
    () => buildTopicAuditSummary({ signals, auditEvidence, auditMemos, auditSummary }),
    [auditEvidence, auditMemos, auditSummary, signals]
  );
  const auditDisplayHints = useMemo(
    () => readAuditDisplayHints(auditMemos?.lensMemos ?? []),
    [auditMemos]
  );
  const auditThemes = auditDisplayHints.themeChips ?? [];
  const auditLanes = auditDisplayHints.narrativeLanes ?? [];
  const p1RunningSet = useMemo(() => new Set(p1RunningSignalIds), [p1RunningSignalIds]);
  const readSignalIdsSet = useMemo(
    () => new Set((auditMemos?.signalReadings ?? []).map((reading) => reading.signalId)),
    [auditMemos]
  );
  const readingStatusFor = (packet: EvidencePacket): SourceRowReadingStatus => {
    if (p1RunningSet.has(packet.signalId)) return "running";
    if (readSignalIdsSet.has(packet.signalId)) return "ready";
    if (p1ErrorBySignalId[packet.signalId]) return "failed";
    if (packet.status !== "succeeded") return "not_ready";
    return "pending";
  };
  const p1ReadyCount = auditEvidence.filter((packet) => readSignalIdsSet.has(packet.signalId)).length;
  const p1AllReady = auditEvidence.length > 0 && p1ReadyCount === auditEvidence.length;
  const filteredAuditEvidence = useMemo(() => {
    if (activeAuditLane) {
      const lane = auditLanes.find((entry) => entry.id === activeAuditLane);
      const refs = new Set(lane?.signalRefs.map((ref) => ref.split(".")[0]) ?? []);
      return auditEvidence.filter((packet) => refs.has(packet.shortCode));
    }
    if (activeAuditTheme) {
      return auditEvidence.filter((packet) => packet.aiArtifacts?.tags?.includes(activeAuditTheme));
    }
    return auditEvidence;
  }, [activeAuditLane, activeAuditTheme, auditEvidence, auditLanes]);
  const openAuditPacket = openAuditSignalId
    ? auditEvidence.find((packet) => packet.signalId === openAuditSignalId || packet.shortCode === openAuditSignalId) ?? null
    : null;
  const openAuditReading = openAuditPacket
    ? auditMemos?.signalReadings.find((reading) => reading.signalId === openAuditPacket.signalId) ?? null
    : null;

  useEffect(() => {
    if (selectedTag && !signalTagSummaries.some((summary) => summary.tag === selectedTag)) {
      setSelectedTag(null);
    }
  }, [selectedTag, signalTagSummaries]);

  const handleAnalyzeUnanalyzedItems = () => {
    if (onAnalyzeItems && !isBulkAnalyzing) {
      void onAnalyzeItems(unanalyzedItemIds);
    }
  };

  const handleAnalyzeItem = (itemId: string) => {
    runSingleAnalyzeAction({
      itemId,
      isBulkAnalyzing,
      onAnalyzeItems,
      onQueueItemById
    });
  };

  async function handleDeleteSignal(signalId: string) {
    if (!onSignalDeleted) return;
    if (!window.confirm("確認移除此訊號？這會同時清走它背後的本地採集項目。")) return;
    setDeleteError(null);
    setDeletingSignalId(signalId);
    try {
      await onSignalDeleted(signalId);
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
    onUpdateTopic({
      context: researchQuestion
        ? {
            ...(topic.context ?? {}),
            researchQuestion
          }
        : null
    });
  };

  const handleGenerateSignalReading = (signalId: string) => {
    if (!onGenerateSignalReading || isGeneratingForSignalId) return;
    setIsGeneratingForSignalId(signalId);
    setGeneratingErrorBySignalId((previous) => {
      const next = { ...previous };
      delete next[signalId];
      return next;
    });
    void onGenerateSignalReading(signalId, topic.id)
      .then((result) => {
        if (!result.ok && result.error) {
          setGeneratingErrorBySignalId((previous) => ({ ...previous, [signalId]: result.error! }));
        }
      })
      .finally(() => {
        setIsGeneratingForSignalId(null);
      });
  };

  const visibleJudgment = manualJudgment && primaryJudgmentPair?.resultId === manualJudgment.resultId
    ? {
        relevance: manualJudgment.relevance,
        recommendedState: manualJudgment.recommendedState,
        whyThisMatters: primaryJudgmentPair?.judgmentResult?.whyThisMatters || "",
        actionCue: primaryJudgmentPair?.judgmentResult?.actionCue || ""
      }
    : primaryJudgmentPair?.judgmentResult || null;
  const sourcePendingCount = topicAnalysisCounts.saved + topicAnalysisCounts.failed + topicAnalysisCounts.missing;
  const canRunAuditFromSources = topicAnalysisCounts.ready > 0 || auditEvidence.length > 0;
  const auditBlockedReason = canRunAuditFromSources
    ? undefined
    : "先爬取至少 1 篇貼文，審查報告才有可讀內容；目前不會用空資料硬生成。";
  const topicSourceFeed = (
    <section
      data-topic-audit-block="sources"
      style={{
        display: "grid",
        gap: 12,
        borderRadius: tokens.radius.cardLg,
        background: tokens.color.elevated,
        boxShadow: tokens.shadow.topicCard,
        padding: "16px 18px"
      }}
    >
      <header style={{ display: "grid", gap: 11 }}>
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: tokens.color.softInk, fontWeight: 800 }}>sources</span>
            <h1 style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 24, lineHeight: 1.15, color: tokens.color.ink }}>
              源清單
            </h1>
            <span style={{ fontSize: 12, lineHeight: 1.55, color: tokens.color.subInk }}>
              先確認來源、爬取狀態與刪除項目，再生成議題審查報告。
            </span>
          </div>
          <Stamp tone={topicAnalysisCounts.ready > 0 ? "success" : "neutral"}>
            {topicAnalysisCounts.ready}/{topicAnalysisCounts.total} 已完成
          </Stamp>
        </div>
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
            報告素材 {auditSummaryValue.analyzedCount}/{signals.length}
          </span>
        </div>
      </header>

      {topicAnalysisCounts.processing > 0 ? (
        <TopicProcessingStatus
          total={topicAnalysisCounts.total}
          ready={topicAnalysisCounts.ready}
          queued={topicAnalysisCounts.queued}
          crawling={topicAnalysisCounts.crawling}
          analyzing={topicAnalysisCounts.analyzing}
          workerStatus={workerStatus}
          isStartingProcessing={isStartingProcessing}
          onStartProcessing={onStartProcessing}
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
            disabled={!onAnalyzeItems || isBulkAnalyzing}
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
          const item = signal.itemId ? itemByItemId.get(signal.itemId) : undefined;
          const resultId = item ? resultIdByItemId.get(item.id) : undefined;
          const status = getTopicItemAnalysisState(item, optimisticQueuedSet);
          const isReady = status === "ready";
          const isProcessing = status === "queued" || status === "crawling" || status === "analyzing";
          const preview = signalPreviewById[signal.id] || item?.descriptor.text_snippet || signal.source || "資料不完整的 Threads 訊號";
          const tagRecord = signal.itemId ? signalTagsByItemId[signal.itemId] : undefined;

          return (
            <div
              key={signal.id}
              data-topic-source-row={signal.id}
              data-scan-row="true"
              style={scanRowStyle({
                display: "grid",
                gridTemplateColumns: onSignalDeleted ? "5px minmax(0, 1fr) auto 42px" : "5px minmax(0, 1fr) auto",
                gap: 10,
                padding: "11px 0",
                alignItems: "start"
              })}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 5,
                  height: 26,
                  borderRadius: tokens.radius.round,
                  background: isReady ? tokens.color.success : isProcessing ? tokens.topicAccent.primary : tokens.color.lineStrong,
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
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <Stamp tone={analysisStateTone(status)}>{analysisStateLabel(status)}</Stamp>
                  <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>加入 {formatTopicDate(signal.capturedAt)}</span>
                  {item?.descriptor.post_url ? (
                    <a
                      href={item.descriptor.post_url}
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
                  {item && !isProcessing ? (
                    isReady ? (
                      <>
                        {resultId && onOpenAnalysis ? (
                          <SecondaryButton onClick={() => onOpenAnalysis(resultId)} style={{ padding: "4px 8px", fontSize: 10.5 }}>
                            查看分析
                          </SecondaryButton>
                        ) : null}
                        {onAddToCompare ? (
                          <SecondaryButton onClick={() => onAddToCompare(item.id)} style={{ padding: "4px 8px", fontSize: 10.5 }}>
                            加入比較
                          </SecondaryButton>
                        ) : null}
                      </>
                    ) : onAnalyzeItems || onQueueItemById ? (
                      <SecondaryButton
                        onClick={() => handleAnalyzeItem(item.id)}
                        disabled={Boolean(onAnalyzeItems && isBulkAnalyzing)}
                        style={{ padding: "4px 8px", fontSize: 10.5 }}
                      >
                        {onAnalyzeItems ? "開始爬取" : "排隊爬取"}
                      </SecondaryButton>
                    ) : null
                  ) : null}
                </div>
              </div>
              <div style={{ fontSize: 10, color: tokens.color.softInk, whiteSpace: "nowrap" }}>
                {formatTopicDate(signal.capturedAt)}
              </div>
              {onSignalDeleted ? (
                <button
                  type="button"
                  data-topic-signal-remove="true"
                  aria-label="移除此訊號"
                  disabled={deletingSignalId === signal.id}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleDeleteSignal(signal.id);
                  }}
                  style={{
                    minWidth: 38,
                    height: 24,
                    borderRadius: 7,
                    border: `1px solid ${tokens.color.line}`,
                    background: tokens.color.surface,
                    color: tokens.color.softInk,
                    cursor: deletingSignalId === signal.id ? "wait" : "pointer",
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
    </section>
  );

  if (sessionMode === "topic") {
    const showAuditPlaceholder = auditSummaryValue.reportStatus === "failed" || (auditThemes.length === 0 && auditLanes.length === 0 && auditEvidence.length === 0);
    return (
      <div style={viewRootStyle()} data-topic-load-state={loadState}>
        <Breadcrumb topicName={topic.name} onBack={onBack} />

        <TopicAuditOverview
          topic={topic}
          signals={signals}
          summary={auditSummaryValue}
          flags={auditValidatorFlags}
          canRunAudit={canRunAuditFromSources}
          blockedReason={auditBlockedReason}
          p1ReadyCount={p1ReadyCount}
          p1TotalCount={auditEvidence.length}
          sourceTotalCount={auditSourceTotal}
          onRunAudit={onRunAudit}
          onOpenAuditReport={onOpenAuditReport}
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

        {auditThemes.length > 0 ? (
          <section data-topic-audit-block="themes" style={{ display: "grid", gap: 10 }}>
            <SectionLabel kicker="主題" hint={auditSummaryValue.reportStatus === "stale" ? "基於舊版報告" : "廣議題層　非細粒標籤"}>
              主題
            </SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {auditThemes.map((theme) => (
                <ThemeChip
                  key={theme}
                  label={theme}
                  active={activeAuditTheme === theme}
                  onClick={() => {
                    setActiveAuditTheme(activeAuditTheme === theme ? null : theme);
                    setActiveAuditLane(null);
                  }}
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
                active={activeAuditLane === lane.id}
                onClick={() => {
                  setActiveAuditLane(activeAuditLane === lane.id ? null : lane.id);
                  setActiveAuditTheme(null);
                }}
              />
            ))}
          </section>
        ) : null}

        {auditEvidence.length === 0 ? topicSourceFeed : null}

        {auditEvidence.length > 0 ? (
          <section data-topic-audit-block="sources" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "end" }}>
              <SectionLabel hint="一行一篇　點開看判讀與引用">
                資料來源
              </SectionLabel>
              {activeAuditLane || activeAuditTheme ? (
                <AuditGhostButton
                  onClick={() => {
                    setActiveAuditLane(null);
                    setActiveAuditTheme(null);
                  }}
                  style={{ padding: "5px 8px", fontSize: 10.5 }}
                >
                  清除篩選
                </AuditGhostButton>
              ) : null}
            </div>
            <div style={{ display: "grid", gap: 2, borderRadius: tokens.radius.cardLg, background: tokens.color.elevated, boxShadow: tokens.shadow.topicCard, padding: 6 }}>
              {filteredAuditEvidence.map((packet) => (
                <SourceRow
                  key={packet.signalId}
                  packet={packet}
                  active={openAuditSignalId === packet.signalId}
                  readingStatus={readingStatusFor(packet)}
                  tags={packet.itemId ? signalTagsByItemId[packet.itemId]?.signalTags : undefined}
                  onOpen={() => setOpenAuditSignalId(packet.signalId)}
                  onRunP1={onRunAuditP1 ? () => onRunAuditP1(topic.id, packet.signalId) : undefined}
                  isRunningP1={p1RunningSet.has(packet.signalId)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {openAuditPacket ? (
          <SignalDrawer
            packet={openAuditPacket}
            reading={openAuditReading}
            topicName={topic.name}
            onClose={() => setOpenAuditSignalId(null)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div style={viewRootStyle()} data-topic-load-state={loadState}>
      <div style={{ display: "grid", gap: 10 }}>
        <Breadcrumb topicName={topic.name} onBack={onBack} />
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
        p1ReadyCount={p1ReadyCount}
        p1TotalCount={auditEvidence.length}
        sourceTotalCount={auditSourceTotal}
        onRunAudit={onRunAudit}
        onOpenAuditReport={onOpenAuditReport}
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
                  active={activeAuditTheme === theme}
                  onClick={() => {
                    setActiveAuditTheme(activeAuditTheme === theme ? null : theme);
                    setActiveAuditLane(null);
                  }}
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
                active={activeAuditLane === lane.id}
                onClick={() => {
                  setActiveAuditLane(activeAuditLane === lane.id ? null : lane.id);
                  setActiveAuditTheme(null);
                }}
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
              {activeAuditLane || activeAuditTheme ? (
                <AuditGhostButton
                  onClick={() => {
                    setActiveAuditLane(null);
                    setActiveAuditTheme(null);
                  }}
                  style={{ padding: "5px 8px", fontSize: 10.5 }}
                >
                  清除篩選
                </AuditGhostButton>
              ) : null}
            </div>
            <div style={{ display: "grid", gap: 2, borderRadius: tokens.radius.cardLg, background: tokens.color.elevated, boxShadow: tokens.shadow.topicCard, padding: 6 }}>
              {filteredAuditEvidence.map((packet) => (
                <SourceRow
                  key={packet.signalId}
                  packet={packet}
                  active={openAuditSignalId === packet.signalId}
                  readingStatus={readingStatusFor(packet)}
                  tags={packet.itemId ? signalTagsByItemId[packet.itemId]?.signalTags : undefined}
                  onOpen={() => setOpenAuditSignalId(packet.signalId)}
                  onRunP1={onRunAuditP1 ? () => onRunAuditP1(topic.id, packet.signalId) : undefined}
                  isRunningP1={p1RunningSet.has(packet.signalId)}
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
          onClose={() => setOpenAuditSignalId(null)}
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
            onBlur={() => draftDescription !== (topic.description || "") && onUpdateTopic({ description: draftDescription })}
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
                isStartingProcessing={isStartingProcessing}
                onStartProcessing={onStartProcessing}
              />
            ) : null}

            {unanalyzedItemIds.length > 0 ? (
              <BulkAnalyzeCta
                count={unanalyzedItemIds.length}
                isBulkAnalyzing={isBulkAnalyzing}
                disabled={!onAnalyzeItems || isBulkAnalyzing}
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
                      if (!primaryJudgmentPair || !onSaveJudgmentOverride) {
                        return;
                      }
                      const next = manualJudgment ?? {
                        resultId: primaryJudgmentPair.resultId,
                        relevance: primaryJudgmentPair.judgmentResult?.relevance ?? 3,
                        recommendedState: primaryJudgmentPair.judgmentResult?.recommendedState ?? "watch"
                      };
                      onSaveJudgmentOverride(primaryJudgmentPair.resultId, {
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
                    <PairRow key={pair.resultId} pair={pair} onOpenPair={onOpenPair} />
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
                    const item = signal.itemId ? itemByItemId.get(signal.itemId) : undefined;
                    const resultId = item ? resultIdByItemId.get(item.id) : undefined;
                    const status = getTopicItemAnalysisState(item, optimisticQueuedSet);
                    const isReady = status === "ready";
                    const isProcessing = status === "queued" || status === "crawling" || status === "analyzing";
                    const preview = signalPreviewById[signal.id] || signal.source;
                    const tagRecord = signal.itemId ? signalTagsByItemId[signal.itemId] : undefined;

                    return (
                      <div
                        key={signal.id}
                        data-scan-row="true"
                        style={scanRowStyle({
                          display: "grid",
                          gridTemplateColumns: onSignalDeleted ? "5px minmax(0, 1fr) auto 24px" : "5px minmax(0, 1fr) auto",
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
                                  key={`${signal.id}-${tag}`}
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
                              {item ? (
                                <Stamp tone={analysisStateTone(status)}>
                                  {analysisStateLabel(status)}
                                </Stamp>
                              ) : null}
                              {signal.source && signal.source.startsWith("http") ? (
                                <a
                                  href={signal.source}
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
                              ) : item && item.descriptor.post_url ? (
                                <a
                                  href={item.descriptor.post_url}
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
                              {item && !isProcessing ? (
                                isReady ? (
                                  <>
                                    {resultId && onOpenAnalysis ? (
                                      <SecondaryButton onClick={() => onOpenAnalysis(resultId)} style={{ padding: "4px 8px", fontSize: 10.5 }}>
                                        查看分析
                                      </SecondaryButton>
                                    ) : null}
                                    {onAddToCompare ? (
                                      <SecondaryButton onClick={() => onAddToCompare(item.id)} style={{ padding: "4px 8px", fontSize: 10.5 }}>
                                        加入比較
                                      </SecondaryButton>
                                    ) : null}
                                  </>
                                ) : onAnalyzeItems || onQueueItemById ? (
                                  <SecondaryButton
                                    onClick={() => handleAnalyzeItem(item.id)}
                                    disabled={Boolean(onAnalyzeItems && isBulkAnalyzing)}
                                    style={{ padding: "4px 8px", fontSize: 10.5 }}
                                  >
                                    {singleAnalyzeActionLabel(Boolean(onAnalyzeItems))}
                                  </SecondaryButton>
                                ) : null
                              ) : null}
                            </div>
                          {(() => {
                            const reading = signalReadingsBySignalId[signal.id];
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
                            if (!isReady) return null;
                            return (
                              <div style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 4 }}>
                                <SecondaryButton
                                  onClick={() => handleGenerateSignalReading(signal.id)}
                                  disabled={isGeneratingForSignalId === signal.id || !onGenerateSignalReading}
                                  style={{ padding: "4px 8px", fontSize: 10.5 }}
                                >
                                  {isGeneratingForSignalId === signal.id ? "生成中…" : "生成判讀"}
                                </SecondaryButton>
                                {generatingErrorBySignalId[signal.id] ? (
                                  <span style={{ fontSize: 10.5, color: tokens.color.failed }}>
                                    {generatingErrorBySignalId[signal.id]}
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ fontSize: 10, color: tokens.color.softInk, whiteSpace: "nowrap" }}>
                          {formatTopicDate(signal.capturedAt)}
                        </div>
                        {onSignalDeleted ? (
                          <button
                            type="button"
                            data-topic-signal-remove="true"
                            aria-label="移除此訊號"
                            disabled={deletingSignalId === signal.id}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleDeleteSignal(signal.id);
                            }}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              border: `1px solid ${tokens.color.line}`,
                              background: tokens.color.surface,
                              color: tokens.color.softInk,
                              cursor: deletingSignalId === signal.id ? "wait" : "pointer",
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
  singleAnalyzeActionLabel,
  runSingleAnalyzeAction,
  pickPrimaryJudgmentPair
};
