import { useState, type CSSProperties, type ReactNode } from "react";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import {
  FOLDER_SYNTHESIS_MIN_ANALYZED,
  FOLDER_SYNTHESIS_MIN_TOPICS,
  folderSynthesisStaleReason
} from "../compare/folder-synthesis";
import type { SessionProcessingSummary, WorkerStatus } from "../state/processing-state";
import type { FolderSynthesis, SavedAnalysisSnapshot, SessionItem, SessionRecord, TechniqueReadingSnapshot } from "../state/types";
import { describeAiOutputProvenance, normalizeAiOutputProvenance } from "../state/ai-provenance";
import { getSessionDisplayName } from "../state/store-helpers";
import { Kicker, PrimaryButton, SCAN_ROW_HOVER_CSS, SecondaryButton, SectionHeader, SideMark, Stamp, SurfaceCard, TOKENS, lineClamp, viewRootStyle } from "./components";
import { formatSavedAt, PostCard } from "./LibraryView.parts";
import { modeThemes, textStyles, tokens } from "./tokens";

// AR design tokens (matching Result page)
const AR = {
  blue: tokens.color.accent,
  orange: tokens.color.queued,
  green: tokens.color.success,
  red: tokens.color.failed,
  ink: tokens.color.ink,
  canvas: tokens.color.contentSurface,
  card: tokens.color.elevated,
  softInk: tokens.color.subInk,
  muteInk: tokens.color.softInk,
  dimInk: tokens.color.softInk,
  line: tokens.color.line,
} as const;

type LibrarySectionState = "processing" | "pending" | "ready" | "empty" | "saved";

const compactPrimaryActionStyle: CSSProperties = { padding: "7px 12px", fontSize: 11 };
const compactSecondaryActionStyle: CSSProperties = { padding: "7px 10px", fontSize: 11 };

function librarySectionState({
  isProcessing,
  hasPending,
  readyCount,
  itemCount
}: {
  isProcessing: boolean;
  hasPending: boolean;
  readyCount: number;
  itemCount: number;
}): LibrarySectionState {
  if (itemCount === 0) return "empty";
  if (isProcessing) return "processing";
  if (hasPending) return "pending";
  if (readyCount > 0) return "ready";
  return "saved";
}

function readinessToneStyle(state: LibrarySectionState): Pick<CSSProperties, "background" | "border" | "color"> {
  switch (state) {
    case "processing":
      return {
        background: tokens.color.runningSoft,
        border: `1px solid ${tokens.color.accentSoft}`,
        color: tokens.color.ink
      };
    case "ready":
      return {
        background: tokens.color.successSoft,
        border: `1px solid ${tokens.color.cyanSoft}`,
        color: tokens.color.ink
      };
    case "pending":
      return {
        background: tokens.color.queuedSoft,
        border: `1px solid ${tokens.color.queuedBorder}`,
        color: tokens.color.queued
      };
    default:
      return {
        background: tokens.color.elevated,
        border: `1px solid ${tokens.color.cardEdge}`,
        color: tokens.color.ink
      };
  }
}

function LibraryFrame({
  children,
  section,
  state,
  tone = "default",
  style
}: {
  children: ReactNode;
  section: string;
  state?: LibrarySectionState;
  tone?: "default" | "utility";
  style?: CSSProperties;
}) {
  return (
    <SurfaceCard
      tone={tone}
      dataAttrs={{
        "data-library-section": section,
        ...(state ? { "data-library-section-state": state } : {})
      }}
      style={{
        display: "grid",
        gap: 10,
        padding: "12px 14px",
        ...style
      }}
    >
      {children}
    </SurfaceCard>
  );
}

function LibraryMetaKicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ ...textStyles.label, color: AR.muteInk, letterSpacing: 0, textTransform: "none", ...style }}>
      {children}
    </div>
  );
}

interface LibraryViewProps {
  activeFolder: SessionRecord | null;
  activeItem: SessionItem | null;
  optimisticQueuedIds: string[];
  workerStatus: WorkerStatus | null;
  isStartingProcessing: boolean;
  processAllLabel: string;
  processingSummary: SessionProcessingSummary;
  canPrev: boolean;
  canNext: boolean;
  onSelectItem: (itemId: string) => void;
  onProcessAll: () => void;
  onMoveSelection: (direction: -1 | 1) => void;
  onQueueItem: () => void;
  renderMetrics: (descriptor: TargetDescriptor | null | undefined) => ReactNode;
  techniqueReadings: TechniqueReadingSnapshot[];
  savedAnalyses?: SavedAnalysisSnapshot[];
  topicSignalItemIds?: string[];
  topicInboxCount?: number;
  topicCount?: number;
  initialSection?: "posts" | "casebook";
  onGoToCollect?: () => void;
  onGoToCompare?: () => void;
  onOpenSavedAnalysis?: (resultId: string) => void;
  folderSynthesis?: FolderSynthesis | null;
  isGeneratingFolderSynthesis?: boolean;
  folderSynthesisError?: string | null;
  onGenerateFolderSynthesis?: () => Promise<void> | void;
  onClearFolderSynthesis?: () => Promise<void> | void;
  nowMs?: number;
  /** Folder-wide analyzed signal count (cross-topic). Drives the eligibility + stale banner. */
  folderAnalyzedCount?: number;
  /** Distinct topics that contributed at least one analyzed signal. */
  folderContributingTopicCount?: number;
}

function savedAnalysisStamp(briefSource: SavedAnalysisSnapshot["briefSource"]): { tone: "success" | "warning" | "neutral"; label: string } {
  const provenance = describeAiOutputProvenance(normalizeAiOutputProvenance(briefSource));
  return { tone: provenance.tone, label: provenance.label };
}

function snapshotReadings(analysis: SavedAnalysisSnapshot): Array<{ side: "A" | "B"; text: string }> {
  const parts = analysis.headline
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const aPart = parts.find((part) => /^A\b|^A\s|^A偏/.test(part)) || analysis.deck;
  const bPart = parts.find((part) => /^B\b|^B\s|^B偏/.test(part)) || analysis.primaryTensionSummary || analysis.groupSummary;
  return [
    { side: "A" as const, text: aPart },
    { side: "B" as const, text: bPart }
  ].filter((entry) => entry.text);
}

function SavedAnalysisCard({
  analysis,
  nowMs,
  onOpen
}: {
  analysis: SavedAnalysisSnapshot;
  nowMs: number;
  onOpen?: () => void;
}) {
  const readings = snapshotReadings(analysis).slice(0, 2);
  const statusStamp = savedAnalysisStamp(analysis.briefSource);
  return (
    <div
      data-saved-analysis-card={analysis.resultId}
      className="dlens-card-lift"
      style={{
        background: tokens.color.elevated,
        borderRadius: 12,
        padding: "12px 14px 0",
        border: `1px solid ${tokens.color.line}`,
        boxShadow: tokens.shadow.shell,
        display: "grid",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" }}>
          <Stamp tone="neutral">№ {analysis.dateRangeLabel}</Stamp>
          <span style={{ fontSize: 10, color: AR.dimInk, minWidth: 0, ...lineClamp(1) }}>
            {analysis.sourceLabelA} vs {analysis.sourceLabelB}
          </span>
        </div>
        <Stamp tone={statusStamp.tone}>
          {statusStamp.label}
        </Stamp>
      </div>
      <div style={{
        fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`,
        fontSize: 18, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0, color: tokens.color.ink,
        ...lineClamp(2)
      }}>
        {analysis.headline}
      </div>

      {readings.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {readings.map((reading) => (
            <div key={reading.side} style={{ display: "grid", gridTemplateColumns: "16px minmax(0, 1fr)", gap: 8, alignItems: "start" }}>
              <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: reading.side === "A" ? AR.blue : AR.orange,
                  background: reading.side === "A" ? tokens.color.accentSoft : tokens.color.queuedSoft,
                  borderRadius: 4,
                  padding: "1px 4px",
                  lineHeight: 1.4
                }}>
                  {reading.side}
                </span>
                <SideMark tone={reading.side === "A" ? "accent" : "muted"} />
              </div>
              <div style={{ fontSize: 11.5, color: tokens.color.subInk, lineHeight: 1.55, ...lineClamp(2) }}>
                {reading.text}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: AR.softInk, lineHeight: 1.5, ...lineClamp(2) }}>
          {analysis.deck}
        </div>
      )}

      {analysis.primaryTensionSummary ? (
        <div
          style={{
            display: "grid",
            gap: 4,
            padding: "8px 10px",
            borderRadius: tokens.radius.card,
            background: modeThemes.archive.hoverSurfaceStrong,
            border: `1px solid ${AR.line}`,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, color: AR.muteInk, letterSpacing: 0 }}>
            主要張力
          </span>
          <div style={{ fontSize: 11, fontWeight: 600, color: AR.ink, lineHeight: 1.5, ...lineClamp(2) }}>
            {analysis.primaryTensionSummary}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0 12px", borderTop: `1px solid ${tokens.color.line}` }}>
        <div style={{ fontSize: 10, color: AR.dimInk }}>
          {analysis.totalComments} 則留言 · {formatSavedAt(analysis.savedAt, nowMs)}
        </div>
        <button
          type="button"
          onClick={onOpen}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            fontSize: 10.5,
            fontWeight: 700,
            color: tokens.color.subInk,
            letterSpacing: 0,
            cursor: onOpen ? "pointer" : "default"
          }}
        >
          OPEN · 進入比對 →
        </button>
      </div>
    </div>
  );
}

function FolderSynthesisCard({
  synthesis,
  analyzedCount,
  contributingTopicCount,
  isGenerating,
  errorMessage,
  onGenerate,
  onClear
}: {
  synthesis: FolderSynthesis | null;
  analyzedCount: number;
  contributingTopicCount: number;
  isGenerating: boolean;
  errorMessage: string | null;
  onGenerate: () => void;
  onClear?: () => void;
}) {
  const effectiveSynthesis = synthesis && synthesis.contributingTopicCount >= FOLDER_SYNTHESIS_MIN_TOPICS ? synthesis : null;
  const staleness = folderSynthesisStaleReason(effectiveSynthesis, analyzedCount);
  const meetsAnalyzed = analyzedCount >= FOLDER_SYNTHESIS_MIN_ANALYZED;
  const meetsTopics = contributingTopicCount >= FOLDER_SYNTHESIS_MIN_TOPICS;
  const canGenerate = meetsAnalyzed && meetsTopics;
  const showLocked = !effectiveSynthesis && !canGenerate;
  const showEmptyCta = !effectiveSynthesis && canGenerate;
  const lastGeneratedLabel = effectiveSynthesis
    ? new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(effectiveSynthesis.generatedAt))
    : "";

  return (
    <section
      data-folder-synthesis="card"
      data-folder-synthesis-layout="briefing"
      style={{
        display: "grid",
        gap: 14,
        padding: "16px 18px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.elevated,
        boxShadow: tokens.shadow.glass
      }}
    >
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <Kicker>Workspace briefing</Kicker>
          <div style={{ fontFamily: tokens.font.serifCjk, fontSize: 23, lineHeight: 1.15, color: tokens.color.ink, ...lineClamp(1) }}>
            脈絡簡報
          </div>
          <div style={{ fontSize: 11.5, color: tokens.color.softInk }}>
            跨主題主線、反覆語彙與覆蓋範圍
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {effectiveSynthesis ? (
            <Stamp tone={staleness === "stale" ? "warning" : "success"}>
              {staleness === "stale" ? "可更新" : "最新"}
            </Stamp>
          ) : null}
          <Stamp tone="neutral">{analyzedCount} 已分析</Stamp>
          <Stamp tone={contributingTopicCount > 0 ? "accent" : "neutral"}>{contributingTopicCount} 主題</Stamp>
        </div>
      </div>

      {showLocked ? (
        <div style={{ fontSize: 12, color: tokens.color.softInk, lineHeight: 1.6 }}>
          脈絡頁只處理跨主題的 spread。需要至少 {FOLDER_SYNTHESIS_MIN_ANALYZED} 篇已分析、{FOLDER_SYNTHESIS_MIN_TOPICS} 個主題；目前 {analyzedCount} 篇 / {contributingTopicCount} 主題。
        </div>
      ) : null}

      {showEmptyCta ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.6 }}>
            生成 workspace 脈絡，可看到這批貼文共同在談什麼、哪些語彙反覆出現、情緒如何分佈。
          </div>
          <PrimaryButton
            onClick={() => void onGenerate()}
            disabled={isGenerating}
            style={{ justifySelf: "start", padding: "8px 14px", fontSize: 12 }}
          >
            {isGenerating ? "正在合成…" : `生成脈絡（${analyzedCount} 篇 · ${contributingTopicCount} 主題）`}
          </PrimaryButton>
        </div>
      ) : null}

      {effectiveSynthesis ? (
        <div style={{ display: "grid", gap: 14 }}>
          <div
            data-testid="folder-briefing-meta"
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              fontSize: 10.5,
              fontWeight: 650,
              color: tokens.color.softInk,
              letterSpacing: "0.02em"
            }}
          >
            <span>{effectiveSynthesis.generatedFromCount}/{effectiveSynthesis.totalSignalCount} 訊號</span>
            <span>·</span>
            <span>{effectiveSynthesis.contributingTopicCount} 主題</span>
            <span>·</span>
            <span>更新於 {lastGeneratedLabel}</span>
            <span>·</span>
            <span>{effectiveSynthesis.generatorVersion}</span>
          </div>

          {effectiveSynthesis.sentimentNarrative ? (
            <p
              data-testid="folder-briefing-narrative"
              style={{
                margin: 0,
                fontFamily: tokens.font.serifCjk,
                fontSize: 19,
                lineHeight: 1.58,
                fontWeight: 500,
                color: tokens.color.ink,
                paddingLeft: 12,
                borderLeft: `3px solid ${tokens.color.accent}`
              }}
            >
              {effectiveSynthesis.sentimentNarrative}
            </p>
          ) : null}

          <div
            data-testid="folder-briefing-spread"
            style={{
              display: "grid",
              gap: 8,
              paddingTop: 2,
              borderTop: `1px solid ${tokens.color.line}`
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: tokens.color.softInk, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              跨主題主線
            </div>
            {effectiveSynthesis.commonClusters.length > 0 ? (
              <div style={{ display: "grid", gap: 7 }}>
                {effectiveSynthesis.commonClusters.map((cluster) => (
                  <div
                    key={cluster.keyword}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 10,
                      alignItems: "baseline",
                      fontSize: 12.5,
                      color: tokens.color.subInk
                    }}
                  >
                    <span style={{ color: tokens.color.ink, fontWeight: 650, ...lineClamp(1) }}>{cluster.keyword}</span>
                    <span style={{ whiteSpace: "nowrap", color: tokens.color.softInk, fontWeight: 600 }}>
                      ×{cluster.signalCount} · {cluster.topicCount} 主題
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: tokens.color.softInk }}>暫無橫跨多主題的共同主線。</div>
            )}
          </div>

          <div
            data-testid="folder-briefing-observations"
            style={{ display: "grid", gap: 8, borderTop: `1px solid ${tokens.color.line}`, paddingTop: 12 }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: tokens.color.softInk, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              編輯台觀察
            </div>
            {effectiveSynthesis.observations.length > 0 ? (
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 7 }}>
                {effectiveSynthesis.observations.slice(0, 4).map((observation, index) => (
                  <li key={`${observation.text}-${index}`} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: tokens.color.success }}>{index + 1}.</span>
                    <span style={{ fontSize: 12.5, lineHeight: 1.62, color: tokens.color.subInk }}>{observation.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div style={{ fontSize: 12, color: tokens.color.softInk }}>暫無觀察。</div>
            )}
          </div>

          <div
            data-testid="folder-briefing-language"
            style={{ display: "grid", gap: 8, borderTop: `1px solid ${tokens.color.line}`, paddingTop: 12 }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: tokens.color.softInk, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              語彙與說法
            </div>
            {effectiveSynthesis.memes.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {effectiveSynthesis.memes.map((meme) => (
                  <span
                    key={meme.phrase}
                    style={{
                      fontSize: 11.5,
                      padding: "4px 9px",
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
            ) : null}
            {effectiveSynthesis.verbalTechniques.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                {effectiveSynthesis.verbalTechniques.map((technique) => (
                  <li key={technique} style={{ fontSize: 12, lineHeight: 1.55, color: tokens.color.subInk }}>
                    {technique}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div
            data-testid="folder-briefing-coverage"
            style={{ display: "grid", gap: 8, borderTop: `1px solid ${tokens.color.line}`, paddingTop: 12 }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: tokens.color.softInk, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              主題涵蓋
            </div>
            {effectiveSynthesis.topicCoverage.length > 0 ? (
              <div style={{ display: "grid", gap: 4 }}>
                {effectiveSynthesis.topicCoverage.map((coverage) => (
                  <div
                    key={coverage.topicId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 8,
                      fontSize: 12,
                      color: tokens.color.subInk
                    }}
                  >
                    <span style={{ ...lineClamp(1), minWidth: 0 }}>{coverage.topicName || coverage.topicId}</span>
                    <span style={{ color: coverage.analyzedCount > 0 ? tokens.color.ink : tokens.color.softInk, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {coverage.analyzedCount}/{coverage.totalCount}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: tokens.color.softInk }}>暫無涵蓋資料。</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <SecondaryButton
              onClick={() => void onGenerate()}
              disabled={isGenerating}
              style={{ padding: "6px 10px", fontSize: 11 }}
            >
              {isGenerating ? "重新合成中…" : "重新合成"}
            </SecondaryButton>
            {onClear ? (
              <SecondaryButton
                onClick={() => void onClear()}
                style={{ padding: "6px 10px", fontSize: 11 }}
              >
                清除
              </SecondaryButton>
            ) : null}
            {staleness === "stale" ? (
              <span style={{ fontSize: 11, color: tokens.color.softInk }}>
                目前已分析數與上次合成相差 {Math.abs(analyzedCount - effectiveSynthesis.generatedFromCount)} 篇。
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

export function LibraryView({
  activeFolder,
  optimisticQueuedIds,
  workerStatus,
  isStartingProcessing,
  processAllLabel,
  processingSummary,
  onSelectItem,
  onProcessAll,
  techniqueReadings,
  savedAnalyses = [],
  topicSignalItemIds,
  topicInboxCount = 0,
  topicCount = 0,
  onGoToCollect,
  onGoToCompare,
  onOpenSavedAnalysis,
  activeItem,
  folderSynthesis = null,
  isGeneratingFolderSynthesis = false,
  folderSynthesisError = null,
  onGenerateFolderSynthesis,
  onClearFolderSynthesis,
  nowMs = Number.NaN,
  folderAnalyzedCount = 0,
  folderContributingTopicCount = 0,
}: LibraryViewProps) {
  const [showCasebook, setShowCasebook] = useState(false);

  if (!activeFolder) {
    return (
      <div style={{ display: "grid", gap: 10, padding: "4px 0" }}>
        <LibraryFrame section="empty-folder" state="empty" style={{ padding: "16px" }}>
          <SectionHeader title="還沒有資料夾" style={{ marginBottom: 0 }} />
          <p style={{ fontSize: 13, color: AR.softInk, lineHeight: 1.55, margin: "0 0 12px" }}>
            先建一個資料夾，再去 Collect 儲存貼文。
          </p>
          {onGoToCollect ? (
            <PrimaryButton onClick={onGoToCollect} style={{ width: "100%" }}>
              開始收集
            </PrimaryButton>
          ) : null}
        </LibraryFrame>
      </div>
    );
  }

  const isTopicScopedLibrary = activeFolder.mode === "topic" && Array.isArray(topicSignalItemIds);
  const topicSignalItemIdSet = new Set(topicSignalItemIds ?? []);
  const visibleItems = isTopicScopedLibrary
    ? activeFolder.items.filter((item) => topicSignalItemIdSet.has(item.id))
    : activeFolder.items;
  const readyCount = processingSummary.ready;
  const pendingCount = processingSummary.pending;
  const hasPending = pendingCount > 0;
  const isProcessing = workerStatus === "draining";
  const isArchiveMode = activeFolder.mode === "archive";

  const isTopicMode = activeFolder.mode === "topic";
  const sectionState = librarySectionState({
    isProcessing,
    hasPending,
    readyCount,
    itemCount: visibleItems.length
  });
  const readinessStyle = readinessToneStyle(sectionState);

  return (
    <div data-library-layout="surface-primitives" style={viewRootStyle()}>
      <style>{SCAN_ROW_HOVER_CSS}</style>

      {isTopicMode && onGenerateFolderSynthesis ? (
        <FolderSynthesisCard
          synthesis={folderSynthesis}
          analyzedCount={folderAnalyzedCount}
          contributingTopicCount={folderContributingTopicCount}
          isGenerating={isGeneratingFolderSynthesis}
          errorMessage={folderSynthesisError}
          onGenerate={onGenerateFolderSynthesis}
          onClear={onClearFolderSynthesis}
        />
      ) : null}

      {/* ── Readiness context bar ── */}
      {isTopicScopedLibrary ? (
        <LibraryFrame
          section="readiness"
          state={sectionState}
          style={{
            padding: "11px 14px",
            background: readinessStyle.background,
            border: readinessStyle.border,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <LibraryMetaKicker style={{ marginBottom: 2 }}>
              {getSessionDisplayName(activeFolder)}
            </LibraryMetaKicker>
            <div style={{ ...textStyles.meta, fontWeight: 600, color: AR.ink }}>
              {topicInboxCount} 未分流 · {topicCount} 主題
            </div>
          </div>
          {onGoToCollect ? (
            <SecondaryButton onClick={onGoToCollect} style={compactSecondaryActionStyle}>
              + 採集
            </SecondaryButton>
          ) : null}
        </LibraryFrame>
      ) : (
        <LibraryFrame
          section="readiness"
          state={sectionState}
          style={{
            padding: "11px 14px",
            background: readinessStyle.background,
            border: readinessStyle.border,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <LibraryMetaKicker style={{ marginBottom: 2 }}>
              {getSessionDisplayName(activeFolder)}
            </LibraryMetaKicker>
            <div style={{ ...textStyles.meta, fontWeight: 600, color: readinessStyle.color }}>
              {isProcessing
                ? "處理中…"
                : readyCount > 0
                  ? `${readyCount} 篇可以比較`
                  : hasPending
                    ? `${pendingCount} 篇等待處理`
                    : `${activeFolder.items.length} 篇已儲存`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            {readyCount >= 2 && onGoToCompare ? (
              <PrimaryButton onClick={onGoToCompare} style={compactPrimaryActionStyle}>
                Compare →
              </PrimaryButton>
            ) : hasPending ? (
              <PrimaryButton
                onClick={onProcessAll}
                disabled={isStartingProcessing || isProcessing}
                style={compactPrimaryActionStyle}
                dataAttrs={{ "data-library-process-all": "true" }}
              >
                {processAllLabel}
              </PrimaryButton>
            ) : null}
            {onGoToCollect ? (
              <SecondaryButton onClick={onGoToCollect} style={compactSecondaryActionStyle}>
                + 收集
              </SecondaryButton>
            ) : null}
          </div>
        </LibraryFrame>
      )}

      {/* ── Post cards ── */}
      {visibleItems.length === 0 ? (
        <LibraryFrame section="posts" state="empty" style={{ padding: "20px 16px", textAlign: "center" }}>
          <div
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              margin: "0 auto 10px",
              borderRadius: tokens.radius.card,
              border: `1px solid ${tokens.color.line}`,
              color: tokens.color.accent,
              background: tokens.color.contextSurface,
              display: "grid",
              placeItems: "center"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5.5 4.5h9a2 2 0 0 1 2 2v13h-9a2 2 0 0 0-2 2Z" />
              <path d="M9 8h4" />
              <path d="M9 12h4" />
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: AR.ink, marginBottom: 5 }}>尚無儲存的貼文</div>
          <p style={{ fontSize: 12, color: AR.softInk, lineHeight: 1.5, margin: "0 0 12px" }}>
            {isArchiveMode
              ? "Archive 模式只保留原文，不自動分析。"
              : "前往 Collect 頁面，在 Threads 上捕捉貼文。"}
          </p>
          {onGoToCollect ? (
            <SecondaryButton onClick={onGoToCollect}>前往 Collect</SecondaryButton>
          ) : null}
        </LibraryFrame>
      ) : isTopicMode ? (
        <LibraryFrame section="posts" state={sectionState} tone="utility" style={{ padding: "10px 12px" }}>
          <details data-library-posts="folded">
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 10,
                alignItems: "center",
                minWidth: 0
              }}
            >
              <SectionHeader
                title="訊號詳情"
                caption={`${visibleItems.length} 篇 · 點開展開`}
                style={{ marginBottom: 0 }}
              />
            </summary>
            <div data-scan-list="library" style={{ display: "grid", marginTop: 8 }}>
              {visibleItems.map((item, index) => (
                <PostCard
                  key={item.id}
                  item={item}
                  isSelected={item.id === activeItem?.id}
                  optimisticQueued={optimisticQueuedIds.includes(item.id)}
                  ordinal={index + 1}
                  nowMs={nowMs}
                  onSelect={() => onSelectItem(item.id)}
                />
              ))}
            </div>
          </details>
        </LibraryFrame>
      ) : (
        <LibraryFrame section="posts" state={sectionState} tone="utility" style={{ padding: "10px 12px" }}>
          <SectionHeader title="儲存貼文" caption={`${visibleItems.length} 篇`} style={{ marginBottom: 0 }} />
          <div data-scan-list="library" style={{ display: "grid" }}>
            {visibleItems.map((item, index) => (
              <PostCard
                key={item.id}
                item={item}
                isSelected={item.id === activeItem?.id}
                optimisticQueued={optimisticQueuedIds.includes(item.id)}
                ordinal={index + 1}
                nowMs={nowMs}
                onSelect={() => onSelectItem(item.id)}
              />
            ))}
          </div>
        </LibraryFrame>
      )}

      {/* ── Saved analyses ── */}
      {savedAnalyses.length > 0 ? (
        <section data-library-section="saved-analyses" style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <SectionHeader title={`Casebook · Snapshot · ${savedAnalyses.length} 份`} style={{ marginBottom: 0 }} />
          <div style={{ display: "grid", gap: 8 }}>
            {savedAnalyses.slice(0, 3).map((analysis) => (
              <SavedAnalysisCard key={analysis.resultId} analysis={analysis} nowMs={nowMs} onOpen={onOpenSavedAnalysis ? () => onOpenSavedAnalysis(analysis.resultId) : undefined} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Casebook / technique readings ── */}
      {techniqueReadings.length > 0 ? (
        <section data-library-section="casebook" style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <SectionHeader
            title={`Casebook · ${techniqueReadings.length} 條筆記`}
            style={{ marginBottom: 0 }}
            action={(
              <button
                aria-label="切換 Casebook"
                onClick={() => setShowCasebook((v) => !v)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: "6px 2px",
                  display: "grid",
                  placeItems: "center",
                  color: AR.muteInk
                }}
              >
                <svg
                  width="11" height="7" viewBox="0 0 11 7" fill="none"
                  style={{ transform: showCasebook ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
                >
                  <path d="M1 1L5.5 6L10 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          />
          {showCasebook ? (
            <div style={{ display: "grid", gap: 8 }}>
              {techniqueReadings.slice(0, 5).map((reading) => {
                const primaryTechniques = reading.techniques.slice(0, 2);
                return (
                  <div
                    key={reading.id}
                    style={{
                      background: AR.card, borderRadius: 12, overflow: "hidden",
                      boxShadow: tokens.shadow.card,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 13px 8px" }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        color: reading.side === "A" ? TOKENS.accent : TOKENS.queued,
                        background: reading.side === "A" ? TOKENS.accentSoft : TOKENS.queuedSoft,
                        borderRadius: 6, padding: "2px 6px",
                      }}>
                        貼{reading.side}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: AR.ink, flex: 1, ...lineClamp(1) }}>
                        {reading.clusterTitle}
                      </span>
                      <span style={{ fontSize: 10, color: AR.dimInk, whiteSpace: "nowrap" as const }}>
                        {formatSavedAt(reading.savedAt, nowMs)}
                      </span>
                    </div>
                    <div style={{ padding: "0 13px 8px", borderLeft: `2.5px solid ${reading.side === "A" ? AR.blue : AR.orange}`, marginLeft: 13 }}>
                      <div style={{ fontSize: 11.5, lineHeight: 1.5, color: AR.softInk, ...lineClamp(2) }}>
                        {reading.thesis}
                      </div>
                    </div>
                    {primaryTechniques.length > 0 ? (
                      <div style={{ padding: "7px 13px 10px", display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
                        {primaryTechniques.map((t) => (
                          <span key={t.key} style={{
                            fontSize: 9.5, fontWeight: 700, color: AR.softInk,
                            background: AR.canvas, borderRadius: 6, padding: "2px 7px",
                          }}>
                            {t.title}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
