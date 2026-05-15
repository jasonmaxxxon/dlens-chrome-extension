import { useEffect, useMemo, useState } from "react";

import type { Topic, TopicStatus } from "../state/types.ts";
import { Kicker, ModeHeader, PrimaryButton, SCAN_ROW_HOVER_CSS, Stamp, WorkspaceSurface, lineClamp, scanRowStyle, viewRootStyle } from "./components.tsx";
import { tokens } from "./tokens.ts";

type CasebookFilter = "all" | TopicStatus;

interface CasebookViewProps {
  sessionId: string;
  onNavigateToTopic: (topicId: string) => void;
  onCreateTopic: () => void;
  onGoToCollect?: () => void;
  initialTopics?: Topic[];
  pendingSignalCount?: number;
}

const FILTERS: Array<{ key: CasebookFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待核" },
  { key: "watching", label: "觀察" },
  { key: "learning", label: "學習" },
  { key: "testing", label: "測試" },
  { key: "archived", label: "已歸檔" }
];

function readTopicsFromResponse(response: unknown): Topic[] {
  if (!response || typeof response !== "object") {
    return [];
  }
  const raw = (response as { topics?: unknown[] }).topics;
  return Array.isArray(raw) ? (raw as Topic[]) : [];
}

function statusTone(status: TopicStatus): "neutral" | "accent" | "success" | "warning" {
  switch (status) {
    case "watching":
      return "accent";
    case "learning":
      return "success";
    case "testing":
      return "warning";
    case "archived":
      return "neutral";
    default:
      return "warning";
  }
}

function formatUpdatedAt(value: string): string {
  if (!value || value.startsWith("1970-01-01")) {
    return "剛建立";
  }
  return new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric" }).format(new Date(value));
}

export function filterTopics(topics: Topic[], filter: CasebookFilter): Topic[] {
  if (filter === "all") {
    return topics;
  }
  return topics.filter((topic) => topic.status === filter);
}

function topicCount(topics: Topic[], filter: CasebookFilter): number {
  return filterTopics(topics, filter).length;
}

function FilterTabs({
  topics,
  activeFilter,
  onSelect
}: {
  topics: Topic[];
  activeFilter: CasebookFilter;
  onSelect: (filter: CasebookFilter) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {FILTERS.map((filter) => {
        const active = filter.key === activeFilter;
        return (
          <button
            key={filter.key}
            type="button"
            onClick={() => onSelect(filter.key)}
            style={{
              borderRadius: 999,
              border: `1px solid ${active ? tokens.color.lineStrong : tokens.color.line}`,
              padding: "7px 10px",
              background: active ? tokens.color.elevated : tokens.color.surface,
              color: active ? tokens.color.ink : tokens.color.subInk,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            {filter.label} {topicCount(topics, filter.key)}
          </button>
        );
      })}
    </div>
  );
}

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
      data-scan-row="true"
      onClick={() => onSelect(topic.id)}
      style={scanRowStyle({
        width: "100%",
        border: "none",
        display: "grid",
        gridTemplateColumns: "8px minmax(0, 1fr) auto auto",
        alignItems: "center",
        gap: 10,
        padding: "10px 4px",
        cursor: "pointer",
        textAlign: "left"
      })}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: "var(--dlens-mode-accent)"
        }}
      />
      <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: tokens.color.ink, ...lineClamp(1) }}>{topic.name}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11, color: tokens.color.subInk }}>
          {topic.tags.slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Stamp tone={statusTone(topic.status)}>{topic.status}</Stamp>
        <Stamp tone="neutral">{topic.signalIds.length} 則訊號</Stamp>
      </div>
      <div style={{ display: "grid", gap: 2, justifyItems: "end", minWidth: 72, fontSize: 11, color: tokens.color.softInk }}>
        <span>最近更新 {formatUpdatedAt(topic.updatedAt)}</span>
        <span>{topic.pairIds.length} pair</span>
      </div>
    </button>
  );
}

export function CasebookView({
  sessionId,
  onNavigateToTopic,
  onCreateTopic,
  onGoToCollect,
  initialTopics = [],
  pendingSignalCount = 0
}: CasebookViewProps) {
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [filter, setFilter] = useState<CasebookFilter>("all");

  useEffect(() => {
    setTopics(initialTopics);
  }, [initialTopics]);

  useEffect(() => {
    let cancelled = false;
    if (initialTopics.length) {
      return;
    }
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      return;
    }
    void chrome.runtime
      .sendMessage({ type: "topic/list", sessionId })
      .then((response) => {
        if (!cancelled) {
          setTopics(readTopicsFromResponse(response));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTopics([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialTopics.length, sessionId]);

  const visibleTopics = useMemo(() => filterTopics(topics, filter), [filter, topics]);
  const hasOrganizableContent = topics.length > 0 || pendingSignalCount > 0;

  return (
    <div style={viewRootStyle()}>
      <ModeHeader
        mode="casebook"
        kicker="Casebook"
        title="整理這個 folder 裡的訊號"
        deck="先收進案例本，再把值得追蹤的線索分組。"
        stamp={<Stamp tone="accent">Signals</Stamp>}
      />

      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: tokens.spacing.md }}>
        <style>{SCAN_ROW_HOVER_CSS}</style>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <FilterTabs topics={topics} activeFilter={filter} onSelect={setFilter} />
          {hasOrganizableContent ? <PrimaryButton onClick={onCreateTopic}>新增線索</PrimaryButton> : null}
        </div>

        {pendingSignalCount > 0 ? (
          <section
            style={{
              display: "grid",
              gap: 6,
              padding: "12px 14px",
              borderRadius: tokens.radius.card,
              border: `1px solid ${tokens.color.line}`,
              background: tokens.color.surface
            }}
          >
            <Kicker>未分流訊號</Kicker>
            <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.6 }}>
              目前有 {pendingSignalCount} 則未分流訊號。建立追蹤線索後可以開始歸類。
            </div>
          </section>
        ) : null}

        {visibleTopics.length ? (
          <div data-scan-list="casebook" style={{ display: "grid" }}>
            {visibleTopics.map((topic) => (
              <TopicRow key={topic.id} topic={topic} onSelect={onNavigateToTopic} />
            ))}
          </div>
        ) : (
          <div
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
            <div>{pendingSignalCount > 0 ? "未分流訊號等待整理，新增一條線索開始追蹤。" : "這個 folder 尚無可整理的訊號。先到採集收進貼文。"}</div>
            {!hasOrganizableContent && onGoToCollect ? (
              <div style={{ marginTop: 12 }}>
                <PrimaryButton onClick={onGoToCollect}>前往採集</PrimaryButton>
              </div>
            ) : null}
          </div>
        )}
      </WorkspaceSurface>
    </div>
  );
}

export const casebookViewTestables = {
  filterTopics,
  TopicRow
};
