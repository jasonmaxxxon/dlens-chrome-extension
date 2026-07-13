import type { KeyboardEvent, MouseEvent } from "react";

import { getItemReadinessStatus } from "../state/processing-state.ts";
import type { SessionItem, Signal, Topic } from "../state/types.ts";
import { tokens } from "./tokens";
import { ModeHeader } from "./components.tsx";
import { useCausalListMotion } from "./useCausalListMotion.ts";
import {
  type TopicAuditReportStatus,
  type TopicAuditSummary
} from "./topic-audit-components.tsx";

/* Status-led card kicker — same mono status voice as the masthead StatusRail
 * (idle · n/n ready). One token per audit state; the five states stay distinct. */
const AUDIT_STATUS_TOKEN: Record<TopicAuditReportStatus, { label: string; color: string }> = {
  ready: { label: "READY", color: tokens.topicAccent.primary },
  running: { label: "BUILDING", color: tokens.topicAccent.warm },
  none: { label: "QUEUED", color: tokens.color.softInk },
  failed: { label: "FAILED", color: tokens.topicAccent.fail },
  stale: { label: "STALE", color: tokens.topicAccent.warm }
};

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

function formatTopicCardDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function TopicTagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }
  return (
    <span style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
      {tags.map((tag) => (
        <span
          key={tag}
          data-topic-card-tag={tag}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 20,
            padding: "0 8px",
            borderRadius: tokens.radius.round,
            border: `1px solid ${tokens.color.line}`,
            background: tokens.color.surface,
            color: tokens.color.subInk,
            fontSize: 10.5,
            fontWeight: 700,
            lineHeight: 1
          }}
        >
          #{tag}
        </span>
      ))}
    </span>
  );
}

/* One quiet evidence line with real denominators, plus a slim two-tone
 * coverage bar once any source is actually ready (an empty track carries no
 * information; a partial bar is honest coverage, not progress theater). */
function TopicSourceProgress({ source }: { source: TopicSourceSummary }) {
  const safeTotal = Math.max(1, source.total);
  const readyPct = source.total > 0 ? Math.min(100, Math.max(0, (source.ready / safeTotal) * 100)) : 0;
  const processingPct = source.total > 0 ? Math.min(100 - readyPct, Math.max(0, (source.processing / safeTotal) * 100)) : 0;
  const inFlight = source.processing > 0 || source.pending > 0;

  return (
    <span
      data-topic-source-progress="true"
      data-topic-completion-progress="true"
      data-topic-source-state={inFlight ? "working" : "settled"}
      style={{
        display: "grid",
        gap: 6,
        minWidth: 0,
        borderTop: `1px solid ${tokens.color.line}`,
        paddingTop: 10
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
          minWidth: 0,
          fontFamily: tokens.font.mono,
          fontSize: 11,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums"
        }}
      >
        <span data-topic-completion-label="true" style={{ color: tokens.color.subInk }}>
          已完成 {source.ready}/{source.total}
        </span>
        {source.processing > 0 ? (
          <span data-topic-source-processing-count="true" style={{ color: tokens.topicAccent.warm }}>
            處理中 {source.processing}
          </span>
        ) : null}
        {source.pending > 0 ? (
          <span data-topic-source-queue="pending" style={{ color: tokens.topicAccent.warm }}>
            {source.pending} 待處理
          </span>
        ) : null}
      </span>
      {source.ready > 0 ? (
        <span
          aria-hidden="true"
          style={{
            position: "relative",
            width: "100%",
            minWidth: 80,
            height: 4,
            borderRadius: tokens.radius.round,
            background: tokens.color.neutralSurface,
            overflow: "hidden"
          }}
        >
          <span
            data-topic-completion-bar-fill="true"
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
              background: tokens.topicAccent.warm,
              opacity: 0.5
            }}
          />
        </span>
      ) : null}
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
  const statusToken = AUDIT_STATUS_TOKEN[summary.reportStatus];
  const gist = summary.headline || topic.description || "採集批次待整理";
  return (
    <div
      role="button"
      tabIndex={0}
      data-topic-card={topic.id}
      data-dlens-list-key={topic.id}
      className="dlens-card-lift"
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
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span
          data-audit-status={summary.reportStatus}
          style={{
            fontFamily: tokens.font.mono,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.08em",
            color: statusToken.color,
            whiteSpace: "nowrap",
            flexShrink: 0
          }}
        >
          {statusToken.label}
        </span>
        <span style={{ fontFamily: tokens.font.mono, fontSize: 10, fontWeight: 700, color: tokens.color.softInk, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          · {source.total} 訊號
        </span>
        {summary.reportStatus === "stale" && summary.staleDelta?.added ? (
          <span
            data-topic-stale-delta="true"
            style={{
              fontFamily: tokens.font.mono,
              fontSize: 10,
              fontWeight: 800,
              color: tokens.topicAccent.warm,
              background: tokens.color.queuedSoft,
              borderRadius: tokens.radius.pill,
              padding: "1px 6px",
              fontVariantNumeric: "tabular-nums"
            }}
          >
            +{summary.staleDelta.added}
          </span>
        ) : null}
        <span data-topic-card-actions="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 8, minWidth: 0, maxWidth: "100%", marginLeft: "auto" }}>
          <span data-topic-card-updated-at="true" style={{ fontFamily: tokens.font.mono, fontSize: 10.5, fontWeight: 500, color: tokens.color.softInk, whiteSpace: "nowrap" }}>
            更新 {formatTopicCardDate(topic.updatedAt)}
          </span>
          {canDelete ? (
            <button
              type="button"
              data-topic-delete-button="true"
              aria-label={`移除議題 ${topic.name}`}
              onClick={handleDelete}
              style={{
                flex: "0 0 24px",
                width: 24,
                height: 24,
                borderRadius: 999,
                border: `1px solid ${tokens.color.line}`,
                background: tokens.color.surface,
                color: tokens.color.softInk,
                cursor: "pointer",
                fontFamily: tokens.font.sans,
                fontSize: 14,
                lineHeight: "20px",
                display: "grid",
                placeItems: "center"
              }}
            >
              ×
            </button>
          ) : null}
        </span>
      </span>
      <span style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <span style={{ fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 22, fontWeight: 900, lineHeight: 1.25 }}>
          {topic.name}
        </span>
        <span data-topic-card-gist="true" style={{ fontSize: 12, lineHeight: 1.6, color: tokens.color.subInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {gist}
        </span>
        <TopicTagRow tags={topic.tags} />
      </span>
      <TopicSourceProgress source={source} />
    </div>
  );
}

export function NewTopicButton({ onCreateTopic }: { onCreateTopic: () => void }) {
  return (
    <button
      data-new-topic-button="triage"
      data-dlens-button="secondary"
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
  const listMotionRef = useCausalListMotion(topics.map((topic) => topic.id).join("|"));
  return (
    <div data-topics-list="audit" style={{ display: "grid", gap: 14 }}>
      <ModeHeader
        mode="topics"
        title="議題"
        deck="每個議題收一批 Threads 訊號；點進去看詞群、敘事與源清單。"
        stamp={<span style={{ fontSize: 11, color: tokens.color.softInk, whiteSpace: "nowrap" }}>{topics.length} 個議題</span>}
      />
      <div ref={listMotionRef} data-topic-list-motion="causal" style={{ display: "grid", gap: 12 }}>
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
