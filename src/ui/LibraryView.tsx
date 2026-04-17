import { useState, type ReactNode } from "react";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import { getLibraryItemUiState, type SessionProcessingSummary, type WorkerStatus } from "../state/processing-state";
import type { SavedAnalysisSnapshot, SessionItem, SessionRecord, TechniqueReadingSnapshot } from "../state/types";
import { PrimaryButton, SecondaryButton, TOKENS, lineClamp, viewRootStyle } from "./components";
import { tokens } from "./tokens";

// AR design tokens (matching Result page)
const AR = {
  blue: "#0071e3",
  orange: "#ff9500",
  green: "#34c759",
  red: "#ff3b30",
  ink: "#1d1d1f",
  canvas: "#f2f2f7",
  card: "#ffffff",
  softInk: "rgba(0,0,0,0.5)",
  muteInk: "rgba(0,0,0,0.35)",
  dimInk: "rgba(0,0,0,0.28)",
  line: "rgba(0,0,0,0.07)",
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
}

function avatarInitial(author: string | null | undefined): string {
  const cleaned = (author || "").trim();
  return cleaned ? cleaned.slice(0, 1).toUpperCase() : "D";
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

// Top cluster keywords from analysis
function topClusterKeywords(item: SessionItem): string[] {
  const clusters = item.latestCapture?.analysis?.clusters;
  if (!clusters?.length) return [];
  const sorted = [...clusters].sort((a, b) => (b.size_share || 0) - (a.size_share || 0));
  return (sorted[0]?.keywords || []).slice(0, 3);
}

function PostCard({
  item,
  index,
  isSelected,
  optimisticQueued,
  onSelect,
}: {
  item: SessionItem;
  index: number;
  isSelected: boolean;
  optimisticQueued: boolean;
  onSelect: () => void;
}) {
  const uiState = getLibraryItemUiState(item, optimisticQueued);
  const keywords = topClusterKeywords(item);
  const accentColor = statusAccentColor(uiState.itemPhase);
  const labelColor = statusLabelColor(uiState.itemPhase);
  const bg = statusBg(uiState.itemPhase);

  return (
    <button
      data-item-phase={uiState.itemPhase}
      data-library-row="card"
      onClick={onSelect}
      style={{
        textAlign: "left",
        display: "grid",
        gridTemplateColumns: "3px 1fr",
        background: isSelected ? AR.card : AR.card,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: isSelected
          ? `0 0 0 2px ${AR.blue}, 0 2px 12px rgba(0,0,0,0.08)`
          : "0 1px 6px rgba(0,0,0,0.065)",
        border: "none",
        cursor: "pointer",
        transition: "box-shadow 150ms ease",
        color: AR.ink,
        padding: 0,
      }}
    >
      {/* Left accent bar */}
      <div style={{ background: accentColor, borderRadius: "12px 0 0 12px" }} />

      {/* Card content */}
      <div>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 13px 8px" }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}44)`,
            border: `1px solid ${accentColor}33`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 800, color: accentColor, flexShrink: 0,
          }}>
            {avatarInitial(item.descriptor.author_hint)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: AR.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              @{item.descriptor.author_hint || "Unknown"}
            </div>
            <div style={{ fontSize: 10, color: AR.muteInk }}>#{index + 1}</div>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, color: labelColor,
            background: bg, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap",
          }}>
            {uiState.statusLabel}
          </span>
        </div>

        {/* Keyword headword */}
        {keywords.length > 0 ? (
          <div style={{ padding: "0 13px 5px", display: "flex", flexWrap: "wrap", gap: 4 }}>
            {keywords.map((kw, i) => (
              <span key={i} style={{
                fontSize: 9.5, fontWeight: 700, color: accentColor,
                background: `${accentColor}12`, borderRadius: 6, padding: "2px 6px",
                letterSpacing: 0.2,
              }}>
                {kw}
              </span>
            ))}
          </div>
        ) : null}

        {/* Text snippet */}
        <div style={{
          fontSize: 12, lineHeight: 1.52, color: AR.softInk,
          padding: `${keywords.length ? "2px" : "0"} 13px 10px`,
          ...lineClamp(2),
        }}>
          {item.descriptor.text_snippet || "—"}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "7px 13px 10px", borderTop: `0.5px solid ${AR.line}`,
        }}>
          <span style={{ fontSize: 10, color: AR.dimInk }}>
            {item.latestCapture?.analysis?.source_comment_count
              ? `${item.latestCapture.analysis.source_comment_count} 則留言`
              : item.descriptor.time_token_hint || "已儲存"}
          </span>
          {uiState.itemPhase === "ready" ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: AR.blue }}>
              可比較 →
            </span>
          ) : uiState.itemPhase === "analyzing" ? (
            <span style={{ fontSize: 10, color: AR.orange }}>分析中…</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function SavedAnalysisCard({ analysis }: { analysis: SavedAnalysisSnapshot }) {
  return (
    <div
      data-saved-analysis-card={analysis.resultId}
      style={{
        background: AR.card,
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: "0 1px 6px rgba(0,0,0,0.065)",
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: analysis.briefSource === "ai" ? AR.blue : AR.muteInk,
            background: analysis.briefSource === "ai" ? "rgba(0,113,227,0.09)" : AR.canvas,
            borderRadius: 6, padding: "2px 6px",
          }}>
            {analysis.briefSource === "ai" ? "AI Brief" : "Fallback"}
          </span>
          <span style={{ fontSize: 10, color: AR.dimInk }}>
            {analysis.sourceLabelA} vs {analysis.sourceLabelB}
          </span>
        </div>
        <span style={{ fontSize: 10, color: AR.dimInk }}>{analysis.dateRangeLabel}</span>
      </div>
      <div style={{
        fontFamily: "-apple-system,'SF Pro Display',sans-serif",
        fontSize: 14, fontWeight: 700, lineHeight: 1.25, letterSpacing: -0.28, color: AR.ink,
      }}>
        {analysis.headline}
      </div>
      <div style={{ fontSize: 11, color: AR.softInk, lineHeight: 1.5, ...lineClamp(2) }}>
        {analysis.deck}
      </div>
      <div style={{ fontSize: 10, color: AR.dimInk }}>
        {analysis.totalComments} 則留言 · {formatSavedAt(analysis.savedAt)}
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
  activeItem,
}: LibraryViewProps) {
  const [showCasebook, setShowCasebook] = useState(false);

  if (!activeFolder) {
    return (
      <div style={{ display: "grid", gap: 10, padding: "4px 0" }}>
        <div style={{
          background: AR.card, borderRadius: 12, padding: "16px 16px 14px",
          boxShadow: "0 1px 6px rgba(0,0,0,0.065)",
        }}>
          <div style={{
            fontFamily: "-apple-system,'SF Pro Display',sans-serif",
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

  const libraryEntries = activeFolder.items.map((item, index) => ({
    item,
    index,
    uiState: getLibraryItemUiState(item, optimisticQueuedIds.includes(item.id)),
  }));

  const readyCount = processingSummary.ready;
  const pendingCount = processingSummary.pending;
  const hasPending = pendingCount > 0;
  const isProcessing = workerStatus === "draining";

  return (
    <div style={viewRootStyle()}>

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
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: AR.ink, marginBottom: 5 }}>尚無儲存的貼文</div>
          <p style={{ fontSize: 12, color: AR.softInk, lineHeight: 1.5, margin: "0 0 12px" }}>
            前往 Collect 頁面，在 Threads 上捕捉貼文。
          </p>
          {onGoToCollect ? (
            <SecondaryButton onClick={onGoToCollect}>前往 Collect</SecondaryButton>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {libraryEntries.map(({ item, index }) => (
            <PostCard
              key={item.id}
              item={item}
              index={index}
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
            已儲存分析 · {savedAnalyses.length} 份
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {savedAnalyses.slice(0, 3).map((analysis) => (
              <SavedAnalysisCard key={analysis.resultId} analysis={analysis} />
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
