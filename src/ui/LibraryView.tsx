import { useState, type ReactNode } from "react";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import { getLibraryItemUiState, type SessionProcessingSummary, type WorkerStatus } from "../state/processing-state";
import type { SavedAnalysisSnapshot, SessionItem, SessionRecord, TechniqueReadingSnapshot } from "../state/types";
import { PrimaryButton, SCAN_ROW_HOVER_CSS, SecondaryButton, SideMark, Stamp, TOKENS, lineClamp, scanRowStyle, skeletonBlockStyle, viewRootStyle } from "./components";
import { tokens } from "./tokens";

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
  initialSection?: "posts" | "casebook";
  onGoToCollect?: () => void;
  onGoToCompare?: () => void;
  onOpenSavedAnalysis?: (resultId: string) => void;
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays}天前`;
  const formatter = new Intl.DateTimeFormat("zh-HK", { month: "short", day: "numeric" });
  return formatter.format(date);
}

function statusAccentColor(phase: string): string {
  switch (phase) {
    case "ready": return AR.green;
    case "analyzing": return AR.orange;
    case "crawling": return AR.blue;
    default: return "#8e8e93";
  }
}

function statusLabelColor(phase: string): string {
  switch (phase) {
    case "ready": return AR.green;
    case "analyzing": return AR.orange;
    case "crawling": return AR.blue;
    default: return "#636366";
  }
}

function statusBg(phase: string): string {
  switch (phase) {
    case "ready": return "rgba(52,199,89,0.1)";
    case "analyzing": return "rgba(255,149,0,0.1)";
    case "crawling": return "rgba(0,113,227,0.09)";
    default: return "rgba(142,142,147,0.1)";
  }
}

function statusDotColor(phase: string): string {
  switch (phase) {
    case "ready": return tokens.color.success;
    case "analyzing": return tokens.color.queued;
    case "crawling": return tokens.color.accent;
    case "failed": return tokens.color.failed;
    default: return tokens.color.softInk;
  }
}

function topClusterKeywords(item: SessionItem): string[] {
  const clusters = item.latestCapture?.analysis?.clusters;
  if (!clusters?.length) return [];
  const sorted = [...clusters].sort((a, b) => (b.size_share || 0) - (a.size_share || 0));
  return (sorted[0]?.keywords || []).slice(0, 3);
}

function savedAnalysisStamp(briefSource: SavedAnalysisSnapshot["briefSource"]): { tone: "success" | "warning" | "neutral"; label: string } {
  if (briefSource === "ai") {
    return { tone: "success", label: "Ready" };
  }
  if (briefSource === "fallback") {
    return { tone: "warning", label: "Conf · Medium" };
  }
  return { tone: "neutral", label: "Saved" };
}

function PostCard({
  item,
  isSelected,
  optimisticQueued,
  onSelect,
}: {
  item: SessionItem;
  isSelected: boolean;
  optimisticQueued: boolean;
  onSelect: () => void;
}) {
  const uiState = getLibraryItemUiState(item, optimisticQueued);
  const keywords = topClusterKeywords(item);
  const accentColor = statusAccentColor(uiState.itemPhase);
  const labelColor = statusLabelColor(uiState.itemPhase);
  const bg = statusBg(uiState.itemPhase);
  const snippet = item.descriptor.text_snippet || item.descriptor.post_url || item.descriptor.page_url || "—";
  const showPendingSkeleton =
    uiState.itemPhase === "queued" || uiState.itemPhase === "crawling" || uiState.itemPhase === "analyzing";

  return (
    <button
      data-item-phase={uiState.itemPhase}
      data-library-row="scan"
      data-scan-row="true"
      onClick={onSelect}
      style={scanRowStyle({
        textAlign: "left",
        display: "grid",
        gridTemplateColumns: "8px minmax(0, 1fr) auto",
        alignItems: "start",
        gap: 10,
        background: isSelected ? tokens.color.contextSurface : "transparent",
        border: "none",
        cursor: "pointer",
        transition: "background 140ms ease",
        color: AR.ink,
        padding: "10px 4px",
      })}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: statusDotColor(uiState.itemPhase),
          marginTop: 6
        }}
      />
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: AR.ink, ...lineClamp(1) }}>
            @{item.descriptor.author_hint || "Unknown"}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: AR.softInk, ...lineClamp(1) }}>
            {snippet}
          </div>
        </div>

        {showPendingSkeleton ? (
          <div data-library-card-skeleton="visible" style={{ display: "grid", gap: 7 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["30%", "22%", "28%"].map((width, skeletonIndex) => (
                <span key={skeletonIndex} style={skeletonBlockStyle(width, 16, { borderRadius: 999 })} />
              ))}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <span style={skeletonBlockStyle("92%", 10)} />
              <span style={skeletonBlockStyle("84%", 10)} />
              <span style={skeletonBlockStyle("58%", 10)} />
            </div>
          </div>
        ) : null}

        {!showPendingSkeleton && keywords.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {keywords.map((kw, kwIndex) => (
              <span
                key={`${kw}-${kwIndex}`}
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: accentColor,
                  background: `${accentColor}12`,
                  borderRadius: 6,
                  padding: "2px 6px",
                  letterSpacing: 0.2,
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ display: "grid", gap: 4, justifyItems: "end", minWidth: 82 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: labelColor, background: bg, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>
          {uiState.statusLabel}
        </span>
        <span style={{ fontSize: 11, color: AR.dimInk, textAlign: "right" }}>
          {item.latestCapture?.analysis?.source_comment_count
            ? `${item.latestCapture.analysis.source_comment_count} 則留言`
            : item.descriptor.time_token_hint || formatSavedAt(item.savedAt)}
        </span>
        {uiState.itemPhase === "ready" ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: AR.blue }}>
            可比較 →
          </span>
        ) : uiState.itemPhase === "analyzing" ? (
          <span style={{ fontSize: 10, color: AR.orange }}>分析中…</span>
        ) : null}
      </div>
    </button>
  );
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
  onOpen
}: {
  analysis: SavedAnalysisSnapshot;
  onOpen?: () => void;
}) {
  const readings = snapshotReadings(analysis).slice(0, 2);
  const statusStamp = savedAnalysisStamp(analysis.briefSource);
  return (
    <div
      data-saved-analysis-card={analysis.resultId}
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
                  color: reading.side === "A" ? AR.blue : "#8c4a24",
                  background: reading.side === "A" ? "rgba(0,113,227,0.09)" : "rgba(140,74,36,0.08)",
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
            background: "rgba(26,46,79,0.035)",
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
          {analysis.totalComments} 則留言 · {formatSavedAt(analysis.savedAt)}
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
  onGoToCollect,
  onGoToCompare,
  onOpenSavedAnalysis,
  activeItem,
}: LibraryViewProps) {
  const [showCasebook, setShowCasebook] = useState(false);

  if (!activeFolder) {
    return (
      <div style={{ display: "grid", gap: 10, padding: "4px 0" }}>
        <div style={{
          background: AR.card, borderRadius: tokens.radius.card, padding: "16px 16px 14px",
          boxShadow: "0 1px 6px rgba(0,0,0,0.065)",
        }}>
          <div style={{
            fontFamily: tokens.font.sans,
            fontSize: 17, fontWeight: 700, color: AR.ink, marginBottom: 7,
          }}>
            還沒有資料夾
          </div>
          <p style={{ fontSize: 13, color: AR.softInk, lineHeight: 1.55, margin: "0 0 12px" }}>
            先建一個資料夾，再去 Collect 儲存貼文。
          </p>
          {onGoToCollect ? (
            <PrimaryButton onClick={onGoToCollect} style={{ width: "100%" }}>
              開始收集
            </PrimaryButton>
          ) : null}
        </div>
      </div>
    );
  }

  const libraryEntries = activeFolder.items.map((item) => ({
    item,
    uiState: getLibraryItemUiState(item, optimisticQueuedIds.includes(item.id)),
  }));

  const readyCount = processingSummary.ready;
  const pendingCount = processingSummary.pending;
  const hasPending = pendingCount > 0;
  const isProcessing = workerStatus === "draining";
  const isArchiveMode = activeFolder.mode === "archive";

  return (
    <div style={viewRootStyle()}>
      <style>{SCAN_ROW_HOVER_CSS}</style>

      {/* ── Readiness context bar ── */}
      <div style={{
        background: isProcessing
          ? "rgba(0,113,227,0.05)"
          : readyCount >= 2
            ? "rgba(52,199,89,0.07)"
            : hasPending
              ? "rgba(255,149,0,0.07)"
              : AR.card,
        border: isProcessing
          ? "1px solid rgba(0,113,227,0.12)"
          : readyCount >= 2
            ? "1px solid rgba(52,199,89,0.15)"
            : hasPending
              ? "1px solid rgba(255,149,0,0.18)"
              : "1px solid transparent",
        borderRadius: 12, padding: "11px 14px",
        boxShadow: "0 1px 6px rgba(0,0,0,0.065)",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: AR.muteInk, letterSpacing: 0.3, marginBottom: 2 }}>
            {activeFolder.name}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: hasPending && !isProcessing ? "#b06200" : AR.ink }}>
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
            <PrimaryButton onClick={onGoToCompare} style={{ padding: "7px 12px", fontSize: 11 }}>
              Compare →
            </PrimaryButton>
          ) : hasPending ? (
            <PrimaryButton
              onClick={onProcessAll}
              disabled={isStartingProcessing || isProcessing}
              style={{ padding: "7px 12px", fontSize: 11 }}
            >
              {processAllLabel}
            </PrimaryButton>
          ) : null}
          {onGoToCollect ? (
            <SecondaryButton onClick={onGoToCollect} style={{ padding: "7px 10px", fontSize: 11 }}>
              + 收集
            </SecondaryButton>
          ) : null}
        </div>
      </div>

      {/* ── Post cards ── */}
      {activeFolder.items.length === 0 ? (
        <div style={{
          background: AR.card, borderRadius: 12, padding: "20px 16px",
          boxShadow: "0 1px 6px rgba(0,0,0,0.065)",
          textAlign: "center" as const,
        }}>
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
        </div>
      ) : (
        <div data-scan-list="library" style={{ display: "grid" }}>
          {libraryEntries.map(({ item }) => (
            <PostCard
              key={item.id}
              item={item}
              isSelected={item.id === activeItem?.id}
              optimisticQueued={optimisticQueuedIds.includes(item.id)}
              onSelect={() => onSelectItem(item.id)}
            />
          ))}
        </div>
      )}

      {/* ── Saved analyses ── */}
      {savedAnalyses.length > 0 ? (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: AR.muteInk, letterSpacing: 0.4, marginBottom: 8, padding: "0 2px" }}>
            Casebook · Snapshot · {savedAnalyses.length} 份
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {savedAnalyses.slice(0, 3).map((analysis) => (
              <SavedAnalysisCard key={analysis.resultId} analysis={analysis} onOpen={onOpenSavedAnalysis ? () => onOpenSavedAnalysis(analysis.resultId) : undefined} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Casebook / technique readings ── */}
      {techniqueReadings.length > 0 ? (
        <div>
          <button
            onClick={() => setShowCasebook((v) => !v)}
            style={{
              width: "100%", textAlign: "left", background: "none", border: "none",
              cursor: "pointer", padding: "6px 2px", display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 8,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: AR.muteInk, letterSpacing: 0.4 }}>
              Casebook · {techniqueReadings.length} 條筆記
            </span>
            <svg
              width="11" height="7" viewBox="0 0 11 7" fill="none"
              style={{ transform: showCasebook ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
            >
              <path d="M1 1L5.5 6L10 1" stroke={AR.muteInk} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showCasebook ? (
            <div style={{ display: "grid", gap: 8 }}>
              {techniqueReadings.slice(0, 5).map((reading) => {
                const primaryTechniques = reading.techniques.slice(0, 2);
                return (
                  <div
                    key={reading.id}
                    style={{
                      background: AR.card, borderRadius: 12, overflow: "hidden",
                      boxShadow: "0 1px 6px rgba(0,0,0,0.065)",
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
                        {formatSavedAt(reading.savedAt)}
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
        </div>
      ) : null}
    </div>
  );
}
