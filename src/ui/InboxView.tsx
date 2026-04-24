import { useEffect, useMemo, useState } from "react";

import type { Signal, Topic, TriageAction } from "../state/types.ts";
import { Kicker, ModeHeader, SecondaryButton, Stamp, WorkspaceSurface, viewRootStyle } from "./components.tsx";
import { tokens } from "./tokens.ts";

type InboxFilter = "all" | "unprocessed" | "marked" | "archived";

interface InboxViewProps {
  sessionId: string;
  topics: Topic[];
  onSignalTriaged: (signalId: string, action: TriageAction) => void;
  initialSignals?: Signal[];
  signalPreviewById?: Record<string, string>;
  showJudgmentBadges?: boolean;
  judgmentByTopicId?: Record<string, { relevance: number; recommendedState: string }>;
}

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "unprocessed", label: "未處理" },
  { key: "marked", label: "已標記" },
  { key: "archived", label: "已歸檔" }
];

function readSignalsFromResponse(response: unknown): Signal[] {
  if (!response || typeof response !== "object") {
    return [];
  }
  const raw = (response as { signals?: unknown[] }).signals;
  return Array.isArray(raw) ? (raw as Signal[]) : [];
}

export function filterSignals(signals: Signal[], filter: InboxFilter): Signal[] {
  switch (filter) {
    case "unprocessed":
      return signals.filter((signal) => signal.inboxStatus === "unprocessed");
    case "marked":
      return signals.filter((signal) => signal.inboxStatus === "assigned" || signal.inboxStatus === "archived");
    case "archived":
      return signals.filter((signal) => signal.inboxStatus === "archived");
    default:
      return signals;
  }
}

function countSignals(signals: Signal[], filter: InboxFilter): number {
  return filterSignals(signals, filter).length;
}

function previewText(signalId: string, previews: Record<string, string>): string {
  return previews[signalId] || "尚無預覽文字";
}

function formatCapturedAt(value: string): string {
  if (!value || value.startsWith("1970-01-01")) {
    return "剛加入";
  }
  return new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function SignalRowView({
  signal,
  preview,
  topics,
  showJudgmentBadges,
  judgment,
  onAssign,
  onCreateTopic,
  onArchive
}: {
  signal: Signal;
  preview: string;
  topics: Topic[];
  showJudgmentBadges?: boolean;
  judgment?: { relevance: number; recommendedState: string };
  onAssign: (topicId: string) => void;
  onCreateTopic: (name: string) => void;
  onArchive: () => void;
}) {
  const [selectedTopicId, setSelectedTopicId] = useState(topics[0]?.id || "");

  return (
    <div
      data-inbox-signal-id={signal.id}
      style={{
        display: "grid",
        gap: 10,
        padding: "14px 16px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.elevated
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Stamp tone="accent">Threads</Stamp>
          <span style={{ fontSize: 11, color: tokens.color.softInk }}>{formatCapturedAt(signal.capturedAt)}</span>
          {showJudgmentBadges && judgment ? (
            <Stamp tone="warning">{`相關 ${judgment.relevance} ${judgment.recommendedState.toUpperCase()}`}</Stamp>
          ) : null}
        </div>
        <span style={{ fontSize: 11, color: tokens.color.subInk }}>{signal.inboxStatus}</span>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.65, color: tokens.color.ink }}>{preview}</div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
          併入主題
          <select
            value={selectedTopicId}
            onChange={(event) => setSelectedTopicId(event.target.value)}
            style={{
              borderRadius: 10,
              border: `1px solid ${tokens.color.line}`,
              background: tokens.color.surface,
              color: tokens.color.ink,
              padding: "9px 10px",
              fontSize: 12
            }}
          >
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SecondaryButton onClick={() => selectedTopicId && onAssign(selectedTopicId)} disabled={!selectedTopicId}>
            併入主題
          </SecondaryButton>
          <SecondaryButton onClick={() => onCreateTopic("新主題")}>建立主題</SecondaryButton>
          <SecondaryButton onClick={onArchive}>略過</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

export function InboxView({
  sessionId,
  topics,
  onSignalTriaged,
  initialSignals = [],
  signalPreviewById = {},
  showJudgmentBadges = false,
  judgmentByTopicId = {}
}: InboxViewProps) {
  const [signals, setSignals] = useState<Signal[]>(initialSignals);
  const [filter, setFilter] = useState<InboxFilter>("all");

  useEffect(() => {
    setSignals(initialSignals);
  }, [initialSignals]);

  useEffect(() => {
    let cancelled = false;
    if (initialSignals.length) {
      return;
    }
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      return;
    }
    void chrome.runtime
      .sendMessage({ type: "signal/list", sessionId })
      .then((response) => {
        if (!cancelled) {
          setSignals(readSignalsFromResponse(response));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSignals([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialSignals.length, sessionId]);

  const visibleSignals = useMemo(() => filterSignals(signals, filter), [filter, signals]);

  return (
    <div style={viewRootStyle()}>
      <ModeHeader
        mode="inbox"
        kicker="Inbox"
        title="先把訊號分流，再決定要不要立題"
        deck="收件匣先處理未分流訊號，避免直接堆進案例本。"
        stamp={<Stamp tone="accent">Signal</Stamp>}
      />

      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: tokens.spacing.md }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((entry) => {
            const active = entry.key === filter;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setFilter(entry.key)}
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
                {entry.label} {countSignals(signals, entry.key)}
              </button>
            );
          })}
        </div>

        {visibleSignals.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {visibleSignals.map((signal) => (
              <SignalRowView
                key={signal.id}
                signal={signal}
                preview={previewText(signal.id, signalPreviewById)}
                topics={topics}
                showJudgmentBadges={showJudgmentBadges}
                judgment={signal.topicId ? judgmentByTopicId[signal.topicId] : undefined}
                onAssign={(topicId) => onSignalTriaged(signal.id, { kind: "assign", topicId })}
                onCreateTopic={(name) => onSignalTriaged(signal.id, { kind: "create-topic", name })}
                onArchive={() => onSignalTriaged(signal.id, { kind: "archive" })}
              />
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
            收件匣是空的
          </div>
        )}
      </WorkspaceSurface>
    </div>
  );
}

export const inboxViewTestables = {
  filterSignals,
  SignalRow({
    signal,
    onTriage
  }: {
    signal: Signal;
    previewText: string;
    topics: Topic[];
    onTriage: (signalId: string, action: TriageAction) => void;
  }) {
    return {
      props: {
        onAssign: (topicId: string) => onTriage(signal.id, { kind: "assign", topicId }),
        onCreateTopic: (name: string) => onTriage(signal.id, { kind: "create-topic", name })
      }
    };
  }
};
