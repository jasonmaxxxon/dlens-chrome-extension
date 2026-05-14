import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  TOPIC_SYNTHESIS_MIN_ANALYZED,
  topicSynthesisStaleReason
} from "../compare/topic-synthesis.ts";
import { getItemReadinessStatus, type ItemReadinessStatus } from "../state/processing-state.ts";
import type { FolderMode, SavedAnalysisSnapshot, SessionItem, Signal, Topic, TopicSynthesis } from "../state/types.ts";
import { Kicker, PrimaryButton, SCAN_ROW_HOVER_CSS, SecondaryButton, Stamp, WorkspaceSurface, lineClamp, scanRowStyle, viewRootStyle } from "./components.tsx";
import { tokens } from "./tokens.ts";
import { pickPrimaryJudgmentPair } from "./useTopicState.ts";

type TopicItemAnalysisState = ItemReadinessStatus | "queued";
type TopicSynthesisLayout = "stack" | "console";

interface TopicDetailViewProps {
  topic: Topic;
  signals: Signal[];
  pairs: SavedAnalysisSnapshot[];
  onBack: () => void;
  onOpenPair: (resultId: string) => void;
  onUpdateTopic: (patch: Partial<Topic>) => void;
  sessionMode?: FolderMode;
  sessionItems?: SessionItem[];
  savedAnalyses?: SavedAnalysisSnapshot[];
  signalPreviewById?: Record<string, string>;
  onQueueItemById?: (itemId: string) => void;
  onAnalyzeItems?: (itemIds: string[]) => Promise<{ ok: boolean; failedCount: number }>;
  isBulkAnalyzing?: boolean;
  optimisticQueuedItemIds?: ReadonlyArray<string>;
  onOpenAnalysis?: (resultId: string) => void;
  onAddToCompare?: (itemId: string) => void;
  onSaveJudgmentOverride?: (resultId: string, patch: { relevance: 1 | 2 | 3 | 4 | 5; recommendedState: "park" | "watch" | "act" }) => void;
  onGenerateSynthesis?: (topicId: string) => Promise<{ ok: boolean; error?: string }>;
  synthLayout?: TopicSynthesisLayout;
}

function formatTopicDate(value: string): string {
  return new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric" }).format(new Date(value));
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
  if (optimisticQueuedSet?.has(item.id)) return "queued";
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
  processing
}: {
  total: number;
  ready: number;
  processing: number;
}) {
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
            <div style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink }}>正在分析 {processing} 篇</div>
            <div style={{ fontSize: 11, color: tokens.color.softInk, lineHeight: 1.45 }}>
              {ready}/{total} 已完成，完成後可查看單篇分析或加入比較
            </div>
          </div>
        </div>
        <Stamp tone="accent">處理中</Stamp>
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
        {synthesis.sentimentNarrative || "這批貼文正在形成一條共同主線"}
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
  const lockedHint = `已分析 ${analyzedCount}/${TOPIC_SYNTHESIS_MIN_ANALYZED}。至少 ${TOPIC_SYNTHESIS_MIN_ANALYZED} 篇完成分析後即可生成整體訊號。`;
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
        <div style={{
          fontFamily: tokens.font.serifCjk,
          fontSize: 19,
          fontWeight: 600,
          color: tokens.color.ink,
          letterSpacing: "0.01em"
        }}>
          整體訊號
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
            目前 {analyzedCount} 篇已分析。生成整體訊號可以看到 cluster、memes、sentiment narrative，每多 3 篇可重新合成。
          </div>
          <PrimaryButton
            onClick={onGenerate}
            disabled={isGenerating}
            style={{ justifySelf: "start", padding: "8px 14px", fontSize: 12 }}
          >
            {isGenerating ? "正在合成…" : `生成整體訊號（${analyzedCount} 篇）`}
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
                ) : (
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: tokens.color.subInk }}>
                    這批貼文正在形成一條共同主線
                  </p>
                )}
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
              {isGenerating ? "重新合成中…" : "重新合成"}
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

export function TopicDetailView({
  topic,
  signals,
  pairs,
  onBack,
  onOpenPair,
  onUpdateTopic,
  sessionMode = "topic",
  sessionItems = [],
  savedAnalyses = [],
  signalPreviewById = {},
  onQueueItemById,
  onAnalyzeItems,
  isBulkAnalyzing = false,
  optimisticQueuedItemIds = [],
  onOpenAnalysis,
  onAddToCompare,
  onSaveJudgmentOverride,
  onGenerateSynthesis,
  synthLayout = "console"
}: TopicDetailViewProps) {
  const [draftDescription, setDraftDescription] = useState(topic.description || "");
  const [isGeneratingSynthesis, setIsGeneratingSynthesis] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [manualJudgment, setManualJudgment] = useState<{
    resultId: string;
    relevance: 1 | 2 | 3 | 4 | 5;
    recommendedState: "park" | "watch" | "act";
  } | null>(null);

  const primaryJudgmentPair = useMemo(() => pickPrimaryJudgmentPair(pairs), [pairs]);

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
    const counts = { total: 0, ready: 0, processing: 0 };
    for (const signal of signals) {
      if (!signal.itemId) continue;
      const item = itemByItemId.get(signal.itemId);
      const state = getTopicItemAnalysisState(item, optimisticQueuedSet);
      counts.total += 1;
      if (state === "ready") {
        counts.ready += 1;
      } else if (state === "queued" || state === "crawling" || state === "analyzing") {
        counts.processing += 1;
      }
    }
    return counts;
  }, [signals, itemByItemId, optimisticQueuedSet]);

  const handleAnalyzeUnanalyzedItems = () => {
    if (onAnalyzeItems && !isBulkAnalyzing) {
      void onAnalyzeItems(unanalyzedItemIds);
    }
  };

  const handleGenerateSynthesis = () => {
    if (!onGenerateSynthesis || isGeneratingSynthesis) return;
    setSynthesisError(null);
    setIsGeneratingSynthesis(true);
    void onGenerateSynthesis(topic.id)
      .then((result) => {
        if (!result.ok && result.error) {
          setSynthesisError(result.error);
        }
      })
      .catch((error: unknown) => {
        setSynthesisError(error instanceof Error ? error.message : "合成失敗");
      })
      .finally(() => {
        setIsGeneratingSynthesis(false);
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

  return (
    <div style={viewRootStyle()}>
      <div style={{ display: "grid", gap: 10 }}>
        <Breadcrumb topicName={topic.name} onBack={onBack} />
        <TopicCompactHeader
          topic={topic}
          signalCount={signals.length}
          readyCount={topicAnalysisCounts.ready}
          pairCount={pairs.length}
        />
      </div>

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

        <section style={{ display: "grid", gap: 12 }}>
            <TopicSynthesisCard
              topic={topic}
              analyzedCount={topicAnalysisCounts.ready}
              isGenerating={isGeneratingSynthesis}
              errorMessage={synthesisError}
              onGenerate={handleGenerateSynthesis}
              layout={synthLayout}
            />

            {unanalyzedItemIds.length > 0 ? (
              <BulkAnalyzeCta
                count={unanalyzedItemIds.length}
                isBulkAnalyzing={isBulkAnalyzing}
                disabled={!onAnalyzeItems || isBulkAnalyzing}
                onAnalyze={handleAnalyzeUnanalyzedItems}
              />
            ) : topicAnalysisCounts.processing > 0 ? (
              <TopicProcessingStatus
                total={topicAnalysisCounts.total}
                ready={topicAnalysisCounts.ready}
                processing={topicAnalysisCounts.processing}
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
                    {signals.length} 篇 · 點開展開
                  </span>
                </summary>
                <style>{SCAN_ROW_HOVER_CSS}</style>
                <div style={{ display: "grid", marginTop: 8 }}>
                  {signals.map((signal) => {
                    const item = signal.itemId ? itemByItemId.get(signal.itemId) : undefined;
                    const resultId = item ? resultIdByItemId.get(item.id) : undefined;
                    const status = getTopicItemAnalysisState(item, optimisticQueuedSet);
                    const isReady = status === "ready";
                    const isProcessing = status === "queued" || status === "crawling" || status === "analyzing";
                    const preview = signalPreviewById[signal.id] || signal.source;

                    return (
                      <div
                        key={signal.id}
                        data-scan-row="true"
                        style={scanRowStyle({
                          display: "grid",
                          gridTemplateColumns: "5px minmax(0, 1fr) auto",
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
                            {preview}
                          </div>
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
                                ) : onQueueItemById ? (
                                  <SecondaryButton onClick={() => onQueueItemById(item.id)} style={{ padding: "4px 8px", fontSize: 10.5 }}>
                                    排隊分析
                                  </SecondaryButton>
                                ) : null
                              ) : null}
                            </div>
                        </div>
                        <div style={{ fontSize: 10, color: tokens.color.softInk, whiteSpace: "nowrap" }}>
                          {formatTopicDate(signal.capturedAt)}
                        </div>
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
  pickPrimaryJudgmentPair
};
