import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";

import { getItemReadinessStatus } from "../state/processing-state.ts";
import type { SessionItem, Signal, Topic } from "../state/types.ts";
import { tokens } from "./tokens";
import { ModeHeader } from "./components.tsx";
import {
  TopicAuditStatusPill,
  type TopicAuditSummary
} from "./topic-audit-components.tsx";

export interface TopicSourceSummary {
  total: number;
  ready: number;
  processing: number;
  pending: number;
}

function defaultSummary(topic: Topic): TopicAuditSummary {
  return {
    reportStatus: "none",
    analyzedCount: 0,
    queuedCount: topic.signalIds.length
  };
}

function statStyle(muted = false): CSSProperties {
  return {
    display: "grid",
    gap: 4,
    minWidth: 54,
    color: muted ? tokens.color.softInk : tokens.color.ink
  };
}

function Stat({ value, label, muted }: { value: string | number; label: string; muted?: boolean }) {
  return (
    <span style={statStyle(muted)}>
      <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ fontSize: 10.5, color: tokens.color.softInk, fontWeight: 700 }}>{label}</span>
    </span>
  );
}

function Divider() {
  return <span aria-hidden="true" style={{ width: 1, height: 24, background: tokens.color.line, margin: "0 12px" }} />;
}

function TopicSourceProgress({ source }: { source: TopicSourceSummary }) {
  const total = Math.max(1, source.total);
  const readyPct = Math.min(100, Math.max(0, (source.ready / total) * 100));
  const processingPct = Math.min(100 - readyPct, Math.max(0, (source.processing / total) * 100));
  const queueState = source.pending > 0 ? "pending" : "clear";

  return (
    <span data-topic-source-progress="true" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          flex: 1,
          minWidth: 80,
          height: 6,
          borderRadius: 999,
          background: tokens.color.neutralSurface,
          overflow: "hidden"
        }}
      >
        <span
          data-topic-source-progress-ready="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${readyPct}%`,
            background: tokens.topicAccent.primary
          }}
        />
        <span
          data-topic-source-progress-processing="true"
          style={{
            position: "absolute",
            left: `${readyPct}%`,
            top: 0,
            bottom: 0,
            width: `${processingPct}%`,
            background: tokens.topicAccent.warm
          }}
        />
      </span>
      <span
        data-topic-source-queue={queueState}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 8px",
          borderRadius: 999,
          background: queueState === "pending" ? tokens.color.queuedSoft : tokens.color.successSoft,
          color: queueState === "pending" ? tokens.topicAccent.warm : tokens.topicAccent.primary,
          fontSize: 10.5,
          fontWeight: 800,
          whiteSpace: "nowrap"
        }}
      >
        {source.pending > 0 ? `${source.pending} 待處理` : "queue clear"}
      </span>
    </span>
  );
}

export function TopicCard({
  topic,
  summary,
  sourceSummary,
  onOpenTopic,
  onDeleteTopic
}: {
  topic: Topic;
  summary: TopicAuditSummary;
  sourceSummary?: TopicSourceSummary;
  onOpenTopic: (topicId: string) => void;
  onDeleteTopic?: (topicId: string) => void;
}) {
  const signalCount = topic.signalIds.length;
  const source = sourceSummary ?? {
    total: signalCount,
    ready: 0,
    processing: 0,
    pending: signalCount
  };
  const canDelete = typeof onDeleteTopic === "function";
  // Frame 05 colour spine: sage = narrative ready, rose = failed/tension, amber = still building.
  const spineColor = summary.reportStatus === "ready"
    ? tokens.topicAccent.primary
    : summary.reportStatus === "failed"
      ? tokens.topicAccent.fail
      : tokens.topicAccent.warm;
  const openTopic = () => onOpenTopic(topic.id);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openTopic();
    }
  };
  const handleDelete = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDeleteTopic?.(topic.id);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      data-topic-card={topic.id}
      onClick={openTopic}
      onKeyDown={handleKeyDown}
      style={{
        textAlign: "left",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        border: "none",
        borderRadius: tokens.radius.cardLg,
        background: tokens.color.elevated,
        boxShadow: tokens.shadow.topicCard,
        padding: "16px 18px",
        position: "relative",
        cursor: "pointer",
        display: "grid",
        gap: 12,
        overflow: "hidden",
        fontFamily: tokens.font.sans,
        color: tokens.color.ink,
        transition: tokens.motion.preset.cardLift
      }}
    >
      <span aria-hidden data-topic-card-spine={summary.reportStatus} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: spineColor }} />
      <span style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
        <span style={{ display: "grid", gap: 5, minWidth: 0 }}>
          <span style={{ fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 18, fontWeight: 900, lineHeight: 1.2 }}>
            {topic.name}
          </span>
          <span style={{ fontSize: 11.5, color: tokens.color.softInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {topic.description || topic.tags.join(" · ") || "採集批次待整理"}
          </span>
        </span>
        <span data-topic-card-actions="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 8, minWidth: 0, maxWidth: "100%" }}>
          <TopicAuditStatusPill summary={summary} />
          {canDelete ? (
            <button
              type="button"
              data-topic-delete-button="true"
              aria-label={`移除議題 ${topic.name}`}
              onClick={handleDelete}
              style={{
                flex: "0 0 28px",
                width: 28,
                height: 28,
                borderRadius: 999,
                border: `1px solid ${tokens.color.line}`,
                background: tokens.color.surface,
                color: tokens.color.softInk,
                cursor: "pointer",
                fontFamily: tokens.font.sans,
                fontSize: 16,
                lineHeight: "24px",
                display: "grid",
                placeItems: "center"
              }}
            >
              ×
            </button>
          ) : null}
        </span>
      </span>
      <span
        style={{
          display: "grid",
          gap: 8,
          minWidth: 0,
          borderRadius: tokens.radius.button,
          background: tokens.color.contextSurface,
          padding: "10px 14px"
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 0, minWidth: 0 }}>
          <Stat value={signalCount} label="訊號" />
          <Divider />
          <Stat value={`${source.ready}/${source.total}`} label="已完成" />
          <Divider />
          <Stat value={source.processing} label="處理中" muted={source.processing === 0} />
          <Divider />
          <Stat value={source.pending} label="待處理" muted />
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: tokens.topicAccent.primary }}>打開 ›</span>
        </span>
        <TopicSourceProgress source={source} />
      </span>
    </div>
  );
}

export function NewTopicButton({ onCreateTopic }: { onCreateTopic: () => void }) {
  return (
    <button
      data-new-topic-button="triage"
      onClick={onCreateTopic}
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        marginTop: 14,
        border: `1.5px dashed ${tokens.color.lineStrong}`,
        borderRadius: tokens.radius.card,
        background: "transparent",
        color: tokens.color.subInk,
        fontFamily: tokens.font.sans,
        fontSize: 12.5,
        fontWeight: 700,
        padding: "12px 16px",
        cursor: "pointer",
        textAlign: "left"
      }}
    >
      + 建立新議題 · 從採集匣選 ≥3 訊號開始
    </button>
  );
}

export function TopicsListView({
  topics,
  signals = [],
  sessionItems = [],
  auditSummariesByTopicId = {},
  onOpenTopic,
  onCreateTopic,
  onDeleteTopic
}: {
  topics: Topic[];
  signals?: Signal[];
  sessionItems?: SessionItem[];
  auditSummariesByTopicId?: Record<string, TopicAuditSummary>;
  onOpenTopic: (topicId: string) => void;
  onCreateTopic: () => void;
  onDeleteTopic?: (topicId: string) => void;
}) {
  const sourceSummariesByTopicId = buildTopicSourceSummaries(topics, signals, sessionItems);
  return (
    <div data-topics-list="audit" style={{ display: "grid", gap: 14 }}>
      <ModeHeader
        mode="topics"
        title="議題"
        deck="每個議題收一批 Threads 訊號；點進去看詞群、敘事與源清單。"
        stamp={<span style={{ fontSize: 11, color: tokens.color.softInk, whiteSpace: "nowrap" }}>{topics.length} 個議題</span>}
      />
      <div style={{ display: "grid", gap: 12 }}>
        {topics.map((topic) => (
          <TopicCard
            key={topic.id}
            topic={topic}
            summary={auditSummariesByTopicId[topic.id] ?? defaultSummary(topic)}
            sourceSummary={sourceSummariesByTopicId[topic.id]}
            onOpenTopic={onOpenTopic}
            onDeleteTopic={onDeleteTopic}
          />
        ))}
      </div>
      <NewTopicButton onCreateTopic={onCreateTopic} />
    </div>
  );
}

export const topicsListViewTestables = {
  TopicCard,
  NewTopicButton,
  buildTopicSourceSummaries
};

export function buildTopicSourceSummaries(
  topics: Topic[],
  signals: Signal[],
  sessionItems: SessionItem[]
): Record<string, TopicSourceSummary> {
  const itemById = new Map(sessionItems.map((item) => [item.id, item]));
  return Object.fromEntries(
    topics.map((topic) => {
      const signalIds = new Set(topic.signalIds);
      const topicSignals = signals.filter((signal) => signalIds.has(signal.id) || signal.topicId === topic.id);
      const total = topicSignals.length || topic.signalIds.length;
      let ready = 0;
      let processing = 0;
      let pending = 0;
      for (const signal of topicSignals) {
        const item = signal.itemId ? itemById.get(signal.itemId) : null;
        if (!item) {
          pending += 1;
          continue;
        }
        const status = getItemReadinessStatus(item);
        if (status === "ready") {
          ready += 1;
        } else if (status === "crawling" || status === "analyzing") {
          processing += 1;
        } else {
          pending += 1;
        }
      }
      if (topicSignals.length === 0) {
        pending = total;
      }
      return [topic.id, { total, ready, processing, pending }] as const;
    })
  );
}
