import { useEffect, useMemo, useState } from "react";

import { getItemReadinessStatus, type ItemReadinessStatus } from "../state/processing-state.ts";
import type { SavedAnalysisSnapshot, SessionItem, Signal, SignalTagsRecord, Topic, TopicStatus, TriageAction } from "../state/types.ts";
import { Kicker, PrimaryButton, SCAN_ROW_HOVER_CSS, SecondaryButton, Stamp, WorkspaceSurface, lineClamp, scanRowStyle, viewRootStyle } from "./components.tsx";
import { tokens } from "./tokens.ts";

type CasebookFilter = "all" | TopicStatus;
type TopicItemAnalysisState = ItemReadinessStatus | "queued";

interface CasebookViewProps {
  sessionId: string;
  onNavigateToTopic: (topicId: string) => void;
  onCreateTopic: () => void;
  initialTopics?: Topic[];
  signals?: Signal[];
  loadTopics?: (sessionId: string) => Promise<Topic[]>;
  loadSignals?: (sessionId: string) => Promise<Signal[]>;
  initialUnassignedOpen?: boolean;
  signalPreviewById?: Record<string, string>;
  sessionItems?: SessionItem[];
  savedAnalyses?: SavedAnalysisSnapshot[];
  signalTagsByItemId?: Record<string, SignalTagsRecord>;
  pendingSignalCount?: number;
  onSignalTriaged?: (signalId: string, action: TriageAction) => void;
  onSignalDeleted?: (signalId: string) => void;
  onCreateTopicFromSignals?: (signalIds: string[]) => void;
  onQueueItemById?: (itemId: string) => void;
  optimisticQueuedItemIds?: ReadonlyArray<string>;
  onOpenAnalysis?: (resultId: string) => void;
  onAddToCompare?: (itemId: string) => void;
}

function statusTone(status: TopicStatus): "neutral" | "accent" | "success" | "warning" {
  switch (status) {
    case "watching": return "accent";
    case "learning": return "success";
    case "testing": return "warning";
    case "archived": return "neutral";
    default: return "warning";
  }
}

function signalStatusLabel(signal: Signal): string {
  switch (signal.inboxStatus) {
    case "assigned": return "已分配";
    case "archived": return "已歸檔";
    case "rejected": return "已略過";
    default: return "未分流";
  }
}

function signalStatusTone(signal: Signal): "neutral" | "accent" | "success" | "warning" {
  switch (signal.inboxStatus) {
    case "assigned": return "success";
    case "archived":
    case "rejected": return "neutral";
    default: return "warning";
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

function formatUpdatedAt(value: string): string {
  if (!value || value.startsWith("1970-01-01")) return "剛建立";
  return new Intl.DateTimeFormat("zh-HK", { month: "long", day: "numeric" }).format(new Date(value));
}

function formatCapturedAt(value: string): string {
  if (!value || value.startsWith("1970-01-01")) return "剛加入";
  return new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function sourceLabel(source: Signal["source"]): string {
  return source === "threads" ? "Threads" : source;
}

function previewText(signalId: string, previews: Record<string, string>): string {
  return previews[signalId] || "尚無預覽文字";
}

export function filterTopics(topics: Topic[], filter: CasebookFilter): Topic[] {
  if (filter === "all") return topics;
  return topics.filter((topic) => topic.status === filter);
}

function topicOwnsSignal(topic: Topic, signal: Signal): boolean {
  return signal.topicId === topic.id || topic.signalIds.includes(signal.id);
}

function topSemanticTagsForTopic(
  topic: Topic,
  signals: Signal[],
  signalTagsByItemId: Record<string, SignalTagsRecord>
): string[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const signal of signals) {
    if (!topicOwnsSignal(topic, signal) || !signal.itemId) continue;
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
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, 3)
    .map((entry) => entry.tag);
}

// ─── Topic card ─────────────────────────────────────────────────────────────

export function TopicRow({
  topic,
  onSelect
}: {
  topic: Topic;
  onSelect: (topicId: string) => void;
}) {
  return (
    <button
      type="button"
      data-casebook-topic-id={topic.id}
      onClick={() => onSelect(topic.id)}
      style={{
        width: "100%",
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
        textAlign: "left"
      }}
    >
      <TopicCard topic={topic} onSelect={onSelect} />
    </button>
  );
}

function TopicCard({
  topic,
  analyzedCount,
  totalCount,
  semanticTags = [],
  onSelect
}: {
  topic: Topic;
  analyzedCount?: number;
  totalCount?: number;
  semanticTags?: string[];
  onSelect: (topicId: string) => void;
}) {
  const total = totalCount ?? topic.signalIds.length;
  const analyzed = analyzedCount ?? 0;

  return (
    <button
      type="button"
      data-casebook-topic-id={topic.id}
      data-scan-row="true"
      data-scan-action="true"
      data-dlens-presence="card"
      className="dlens-card-lift"
      onClick={() => onSelect(topic.id)}
      style={{
        width: "100%",
        border: `1px solid ${tokens.color.line}`,
        borderLeft: `3px solid var(--dlens-mode-accent, ${tokens.color.accent})`,
        borderRadius: tokens.radius.card,
        background: tokens.color.elevated,
        padding: "13px 14px",
        display: "grid",
        gap: 8,
        textAlign: "left",
        cursor: "pointer"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "grid", gap: 4, minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: tokens.color.ink, ...lineClamp(1) }}>
            {topic.name}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            <Stamp tone={statusTone(topic.status)}>{topic.status}</Stamp>
            <span style={{ fontSize: 11, color: tokens.color.softInk }}>{total} 則訊號</span>
            {total > 0 && (
              <span style={{ fontSize: 11, color: analyzed > 0 ? tokens.color.success : tokens.color.softInk }}>
                · {analyzed} 已分析
              </span>
            )}
            {topic.tags.slice(0, 3).map((tag) => (
              <span key={tag} style={{ fontSize: 10.5, color: tokens.color.softInk }}>· {tag}</span>
            ))}
          </div>
          {semanticTags.length > 0 ? (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              {semanticTags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    borderRadius: 999,
                    background: tokens.color.neutralSurface,
                    color: tokens.color.subInk,
                    padding: "3px 7px",
                    fontSize: 10.5,
                    fontWeight: 650
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ fontSize: 10, color: tokens.color.softInk, whiteSpace: "nowrap", flexShrink: 0 }}>
          {formatUpdatedAt(topic.updatedAt)}
        </div>
      </div>
    </button>
  );
}

// ─── Unassigned card ─────────────────────────────────────────────────────────

function UnassignedCard({
  count,
  onClick
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-topic-filter="unassigned"
      data-dlens-presence="card"
      className="dlens-card-lift"
      onClick={onClick}
      style={{
        width: "100%",
        border: `1px solid ${tokens.color.line}`,
        borderLeft: `3px solid ${tokens.color.queued}`,
        borderRadius: tokens.radius.card,
        background: tokens.color.elevated,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        cursor: "pointer",
        textAlign: "left"
      }}
    >
      <div style={{ display: "grid", gap: 3 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink }}>未分流</div>
        <div style={{ fontSize: 11, color: tokens.color.softInk }}>等待移到議題</div>
      </div>
      <Stamp tone="warning">{count} 則</Stamp>
    </button>
  );
}

// ─── Signal row (used in unassigned sub-view) ────────────────────────────────

function TopicSignalRow({
  signal,
  preview,
  topic,
  topics,
  item,
  resultId,
  optimisticQueuedSet,
  onAssign,
  onDelete,
  onQueueItem,
  onOpenAnalysis,
  onAddToCompare
}: {
  signal: Signal;
  preview: string;
  topic?: Topic;
  topics: Topic[];
  item?: SessionItem;
  resultId?: string;
  optimisticQueuedSet?: Set<string>;
  onAssign?: (topicId: string) => void;
  onDelete?: () => void;
  onQueueItem?: () => void;
  onOpenAnalysis?: () => void;
  onAddToCompare?: () => void;
}) {
  const [selectedTopicId, setSelectedTopicId] = useState(topic?.id || topics[0]?.id || "");
  const canAssign = Boolean(onAssign && selectedTopicId);
  const showAssignmentControls = signal.inboxStatus === "unprocessed";
  const metaLine = `${sourceLabel(signal.source)} · 收集於 ${formatCapturedAt(signal.capturedAt)}`;
  const analysisStatus = getTopicItemAnalysisState(item, optimisticQueuedSet);
  const isReady = analysisStatus === "ready";
  const isProcessing = analysisStatus === "queued" || analysisStatus === "crawling" || analysisStatus === "analyzing";

  return (
    <div
      data-topic-signal-id={signal.id}
      data-scan-row="true"
      style={scanRowStyle({
        display: "grid",
        gridTemplateColumns: "5px minmax(0, 1fr) auto",
        alignItems: "start",
        gap: 10,
        padding: "10px 4px",
        cursor: "default"
      })}
    >
      <span
        aria-hidden="true"
        style={{
          width: 5,
          height: 28,
          borderRadius: 999,
          background: topic ? "var(--dlens-mode-accent)" : tokens.color.queued,
          marginTop: 2
        }}
      />
      <div style={{ display: "grid", gap: 7, minWidth: 0 }}>
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <div style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 650, color: tokens.color.ink, ...lineClamp(1) }}>
            {preview}
          </div>
          <div style={{ fontSize: 11.5, color: tokens.color.softInk, ...lineClamp(1) }}>{metaLine}</div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Stamp tone={signalStatusTone(signal)}>{signalStatusLabel(signal)}</Stamp>
          <Stamp tone={topic ? "accent" : "neutral"}>{topic?.name || "未分流"}</Stamp>
          {item ? (
            <Stamp tone={analysisStateTone(analysisStatus)}>{analysisStateLabel(analysisStatus)}</Stamp>
          ) : null}
        </div>

        {showAssignmentControls ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              aria-label="選擇移入議題"
              value={selectedTopicId}
              onChange={(event) => setSelectedTopicId(event.target.value)}
              disabled={!topics.length}
              style={{
                minWidth: 154,
                maxWidth: "100%",
                borderRadius: 10,
                border: `1px solid ${tokens.color.line}`,
                background: tokens.color.surface,
                color: tokens.color.ink,
                padding: "7px 9px",
                fontSize: 12
              }}
            >
              {topics.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
            <SecondaryButton
              dataAttrs={{ "data-untriaged-move-signal-id": signal.id }}
              onClick={() => selectedTopicId && onAssign?.(selectedTopicId)}
              disabled={!canAssign}
              style={{ padding: "6px 9px", fontSize: 10.5 }}
            >
              移到議題
            </SecondaryButton>
            <SecondaryButton
              dataAttrs={{ "data-untriaged-delete-signal-id": signal.id }}
              onClick={() => onDelete?.()}
              disabled={!onDelete}
              style={{
                padding: "6px 9px",
                fontSize: 10.5,
                color: tokens.color.queued,
                borderColor: tokens.color.queuedBorder
              }}
            >
              刪除
            </SecondaryButton>
          </div>
        ) : item && !isProcessing ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {isReady ? (
              <>
                {resultId && onOpenAnalysis ? (
                  <SecondaryButton onClick={onOpenAnalysis} style={{ padding: "6px 9px", fontSize: 10.5 }}>
                    查看分析
                  </SecondaryButton>
                ) : null}
                {onAddToCompare ? (
                  <SecondaryButton onClick={onAddToCompare} style={{ padding: "6px 9px", fontSize: 10.5 }}>
                    加入比較
                  </SecondaryButton>
                ) : null}
              </>
            ) : onQueueItem ? (
              <SecondaryButton onClick={onQueueItem} style={{ padding: "6px 9px", fontSize: 10.5 }}>
                排隊分析
              </SecondaryButton>
            ) : null}
          </div>
        ) : null}
      </div>
      <div style={{ display: "grid", gap: 3, justifyItems: "end", minWidth: 54, fontSize: 10.5, color: tokens.color.softInk, lineHeight: 1.35 }}>
        <span>{formatCapturedAt(signal.capturedAt)}</span>
      </div>
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function CasebookView({
  sessionId,
  onNavigateToTopic,
  onCreateTopic,
  initialTopics = [],
  signals,
  loadTopics,
  loadSignals,
  initialUnassignedOpen = false,
  signalPreviewById = {},
  sessionItems = [],
  savedAnalyses = [],
  signalTagsByItemId = {},
  pendingSignalCount = 0,
  onSignalTriaged,
  onSignalDeleted,
  onCreateTopicFromSignals,
  onQueueItemById,
  optimisticQueuedItemIds = [],
  onOpenAnalysis,
  onAddToCompare
}: CasebookViewProps) {
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [loadedSignals, setLoadedSignals] = useState<Signal[]>(signals ?? []);
  const [unassignedOpen, setUnassignedOpen] = useState(initialUnassignedOpen);
  const [bulkTopicId, setBulkTopicId] = useState(initialTopics[0]?.id || "");

  useEffect(() => { setTopics(initialTopics); }, [initialTopics]);

  useEffect(() => {
    if (bulkTopicId && topics.some((topic) => topic.id === bulkTopicId)) {
      return;
    }
    setBulkTopicId(topics[0]?.id || "");
  }, [bulkTopicId, topics]);

  useEffect(() => {
    if (signals !== undefined) setLoadedSignals(signals);
  }, [signals]);

  useEffect(() => {
    let cancelled = false;
    if (initialTopics.length) return;
    if (!loadTopics) return;
    void loadTopics(sessionId)
      .then((nextTopics) => { if (!cancelled) setTopics(nextTopics); })
      .catch(() => { if (!cancelled) setTopics([]); });
    return () => { cancelled = true; };
  }, [initialTopics.length, loadTopics, sessionId]);

  useEffect(() => {
    let cancelled = false;
    if (signals !== undefined) return;
    if (!loadSignals) return;
    void loadSignals(sessionId)
      .then((nextSignals) => { if (!cancelled) setLoadedSignals(nextSignals); })
      .catch(() => { if (!cancelled) setLoadedSignals([]); });
    return () => { cancelled = true; };
  }, [loadSignals, sessionId, signals]);

  const itemByItemId = useMemo(() => {
    const map = new Map<string, SessionItem>();
    for (const item of sessionItems) map.set(item.id, item);
    return map;
  }, [sessionItems]);
  const optimisticQueuedSet = useMemo(
    () => new Set(optimisticQueuedItemIds),
    [optimisticQueuedItemIds]
  );

  const resultIdByItemId = useMemo(() => {
    const map = new Map<string, string>();
    for (const analysis of savedAnalyses) {
      if (!map.has(analysis.itemAId)) map.set(analysis.itemAId, analysis.resultId);
      if (!map.has(analysis.itemBId)) map.set(analysis.itemBId, analysis.resultId);
    }
    return map;
  }, [savedAnalyses]);

  const topicBySignalId = useMemo(() => {
    const map = new Map<string, Topic>();
    for (const topic of topics) {
      for (const signalId of topic.signalIds) map.set(signalId, topic);
    }
    for (const signal of loadedSignals) {
      if (signal.topicId) {
        const topic = topics.find((t) => t.id === signal.topicId);
        if (topic) map.set(signal.id, topic);
      }
    }
    return map;
  }, [loadedSignals, topics]);

  // Per-topic analysis progress (only meaningful when sessionItems are passed)
  const analysisCounts = useMemo(() => {
    const map = new Map<string, { total: number; analyzed: number }>();
    for (const topic of topics) {
      const topicSignals = loadedSignals.filter((s) =>
        topic.signalIds.includes(s.id) || s.topicId === topic.id
      );
      const total = topicSignals.length || topic.signalIds.length;
      const analyzed = topicSignals.filter((s) => {
        const item = s.itemId ? itemByItemId.get(s.itemId) : undefined;
        return getTopicItemAnalysisState(item, optimisticQueuedSet) === "ready";
      }).length;
      map.set(topic.id, { total, analyzed });
    }
    return map;
  }, [topics, loadedSignals, itemByItemId, optimisticQueuedSet]);

  const unassignedSignals = useMemo(
    () => loadedSignals.filter((s) => s.inboxStatus === "unprocessed"),
    [loadedSignals]
  );
  const unassignedSignalIds = useMemo(
    () => unassignedSignals.map((signal) => signal.id),
    [unassignedSignals]
  );

  const hasSignals = signals !== undefined;

  // ── Level 2: unassigned sub-view ──────────────────────────────────────────
  if (unassignedOpen && hasSignals) {
    return (
      <div style={viewRootStyle({ gap: 10 })}>
        <section
          data-mode-header="casebook"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: tokens.radius.card,
            border: `1px solid ${tokens.color.line}`,
            background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`,
            boxShadow: tokens.shadow.glass
          }}
        >
          <button
            type="button"
            onClick={() => setUnassignedOpen(false)}
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, color: tokens.color.subInk }}
          >
            ← 議題
          </button>
          <div style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink }}>未分流</div>
          <Stamp tone="warning">{unassignedSignals.length} 則</Stamp>
        </section>

        <WorkspaceSurface
          tone="utility"
          dataAttrs={{ "data-casebook-untriaged-lane": "true" }}
          style={{ display: "grid", gap: 0, padding: "4px 12px" }}
        >
          <style>{SCAN_ROW_HOVER_CSS}</style>
          {unassignedSignals.length ? (
            <>
              {unassignedSignals.map((signal) => {
                const linkedItem = signal.itemId ? itemByItemId.get(signal.itemId) : undefined;
                const linkedResultId = linkedItem ? resultIdByItemId.get(linkedItem.id) : undefined;
                return (
                  <TopicSignalRow
                    key={signal.id}
                    signal={signal}
                    preview={previewText(signal.id, signalPreviewById)}
                    topic={topicBySignalId.get(signal.id)}
                    topics={topics}
                    item={linkedItem}
                    resultId={linkedResultId}
                    optimisticQueuedSet={optimisticQueuedSet}
                    onAssign={(topicId) => onSignalTriaged?.(signal.id, { kind: "assign", topicId })}
                    onDelete={onSignalDeleted ? () => onSignalDeleted(signal.id) : undefined}
                    onQueueItem={linkedItem && onQueueItemById ? () => onQueueItemById(linkedItem.id) : undefined}
                    onOpenAnalysis={linkedResultId && onOpenAnalysis ? () => onOpenAnalysis(linkedResultId) : undefined}
                    onAddToCompare={linkedItem && onAddToCompare ? () => onAddToCompare(linkedItem.id) : undefined}
                  />
                );
              })}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "11px 4px 8px",
                  borderTop: `1px solid ${tokens.color.line}`
                }}
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <PrimaryButton
                    dataAttrs={{ "data-untriaged-bulk-create": "true" }}
                    onClick={() => onCreateTopicFromSignals?.(unassignedSignalIds)}
                    disabled={!onCreateTopicFromSignals || unassignedSignalIds.length === 0}
                    style={{ padding: "7px 11px", fontSize: 11 }}
                  >
                    全選 → 建立議題
                  </PrimaryButton>
                  <select
                    data-untriaged-bulk-topic-select="true"
                    aria-label="全選移到現有議題"
                    value={bulkTopicId}
                    onChange={(event) => setBulkTopicId(event.target.value)}
                    disabled={!topics.length}
                    style={{
                      minWidth: 150,
                      maxWidth: "100%",
                      borderRadius: tokens.radius.pill,
                      border: `1px solid ${tokens.color.line}`,
                      background: tokens.color.surface,
                      color: tokens.color.ink,
                      padding: "7px 9px",
                      fontSize: 11
                    }}
                  >
                    {topics.map((topic) => (
                      <option key={topic.id} value={topic.id}>{topic.name}</option>
                    ))}
                  </select>
                  <SecondaryButton
                    dataAttrs={{ "data-untriaged-bulk-move": "true" }}
                    onClick={() => {
                      if (!bulkTopicId) {
                        return;
                      }
                      unassignedSignalIds.forEach((signalId) => onSignalTriaged?.(signalId, { kind: "assign", topicId: bulkTopicId }));
                    }}
                    disabled={!onSignalTriaged || !bulkTopicId || unassignedSignalIds.length === 0}
                    style={{ padding: "7px 11px", fontSize: 11 }}
                  >
                    全選 → 移到現有議題
                  </SecondaryButton>
                </div>
                <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>
                  {unassignedSignals.length} 篇待整理
                </span>
              </div>
            </>
          ) : (
            <div style={{ padding: "18px 4px", fontSize: 12, color: tokens.color.subInk }}>
              沒有未分流貼文
            </div>
          )}
        </WorkspaceSurface>
      </div>
    );
  }

  // ── Level 1: topic cards ───────────────────────────────────────────────────
  return (
    <div style={viewRootStyle({ gap: 10 })}>
      <section
        data-mode-header="casebook"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          borderRadius: tokens.radius.card,
          border: `1px solid ${tokens.color.line}`,
          background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`,
          boxShadow: tokens.shadow.glass
        }}
      >
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <Kicker>Topics</Kicker>
          <div style={{ fontSize: 15, lineHeight: 1.25, fontWeight: 700, color: tokens.color.ink, ...lineClamp(1) }}>
            {hasSignals ? "主題與貼文" : "持續追蹤的主題"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {hasSignals && pendingSignalCount > 0 ? (
            <Stamp tone="warning">{pendingSignalCount} 未分流</Stamp>
          ) : null}
          <Stamp tone="accent">{topics.length} 主題</Stamp>
        </div>
      </section>

      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: 8, padding: 12 }}>
        {/* Unassigned entry card */}
        {hasSignals && pendingSignalCount > 0 ? (
          <UnassignedCard count={pendingSignalCount} onClick={() => setUnassignedOpen(true)} />
        ) : null}

        {/* Topic cards */}
        {topics.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {topics.map((topic) => {
              const counts = analysisCounts.get(topic.id);
              return (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  analyzedCount={counts?.analyzed}
                  totalCount={counts?.total}
                  semanticTags={topSemanticTagsForTopic(topic, loadedSignals, signalTagsByItemId)}
                  onSelect={onNavigateToTopic}
                />
              );
            })}
          </div>
        ) : (
          <div
            data-dlens-presence="card"
            style={{
              padding: "18px 16px",
              borderRadius: tokens.radius.card,
              border: `1px solid ${tokens.color.line}`,
              background: tokens.color.surface,
              fontSize: 12,
              color: tokens.color.subInk,
              lineHeight: 1.6
            }}
          >
            尚無主題，新增一個開始追蹤
          </div>
        )}

        {/* AI suggestion hint (old casebook path, no signals) */}
        {!hasSignals && pendingSignalCount > 0 ? (
          <section
            data-dlens-presence="card"
            style={{
              display: "grid",
              gap: 6,
              padding: "12px 14px",
              borderRadius: tokens.radius.card,
              border: `1px solid ${tokens.color.line}`,
              background: tokens.color.surface
            }}
          >
            <Kicker>AI 建議主題</Kicker>
            <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.6 }}>
              目前有 {pendingSignalCount} 則未分流訊號。Slice B 會在這裡補 AI 主題建議。
            </div>
          </section>
        ) : null}

        {/* New topic button */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <SecondaryButton onClick={onCreateTopic} style={{ padding: "6px 9px", fontSize: 10.5 }}>
            新建主題
          </SecondaryButton>
        </div>
      </WorkspaceSurface>
    </div>
  );
}

export const casebookViewTestables = {
  filterTopics,
  TopicRow
};
