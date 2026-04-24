import { useEffect, useMemo, useState } from "react";

import type { Topic, TopicStatus } from "../state/types.ts";
import { Kicker, ModeHeader, PrimaryButton, Stamp, WorkspaceSurface, viewRootStyle } from "./components.tsx";
import { tokens } from "./tokens.ts";

type CasebookFilter = "all" | TopicStatus;

interface CasebookViewProps {
  sessionId: string;
  onNavigateToTopic: (topicId: string) => void;
  onCreateTopic: () => void;
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
      onClick={() => onSelect(topic.id)}
      style={{
        width: "100%",
        border: `1px solid ${tokens.color.line}`,
        borderRadius: tokens.radius.card,
        background: tokens.color.elevated,
        padding: "14px 16px",
        display: "grid",
        gap: 10,
        cursor: "pointer",
        textAlign: "left"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: tokens.color.ink }}>{topic.name}</div>
          <div style={{ fontSize: 11, color: tokens.color.softInk }}>最近更新 {formatUpdatedAt(topic.updatedAt)}</div>
        </div>
        <Stamp tone={statusTone(topic.status)}>{topic.status}</Stamp>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {topic.tags.slice(0, 3).map((tag) => (
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

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: tokens.color.subInk }}>
        <span>{topic.signalIds.length} 則訊號</span>
        <span>{topic.pairIds.length} 則成對分析</span>
      </div>
    </button>
  );
}

export function CasebookView({
  sessionId,
  onNavigateToTopic,
  onCreateTopic,
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

  return (
    <div style={viewRootStyle()}>
      <ModeHeader
        mode="casebook"
        kicker="Casebook"
        title="把訊號整理成持續追蹤的主題"
        deck="先收進案例本，再決定哪些主題值得往下讀。"
        stamp={<Stamp tone="accent">Topic</Stamp>}
      />

      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: tokens.spacing.md }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <FilterTabs topics={topics} activeFilter={filter} onSelect={setFilter} />
          <PrimaryButton onClick={onCreateTopic}>新建主題</PrimaryButton>
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
            <Kicker>AI 建議主題</Kicker>
            <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.6 }}>
              目前有 {pendingSignalCount} 則未分流訊號。Slice B 會在這裡補 AI 主題建議。
            </div>
          </section>
        ) : null}

        {visibleTopics.length ? (
          <div style={{ display: "grid", gap: 10 }}>
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
            尚無主題，新增一個開始追蹤
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
