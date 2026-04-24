import { useMemo, useState } from "react";

import type { FolderMode, SavedAnalysisSnapshot, Signal, Topic } from "../state/types.ts";
import { Kicker, ModeHeader, SecondaryButton, Stamp, WorkspaceSurface, viewRootStyle } from "./components.tsx";
import { tokens } from "./tokens.ts";
import { pickPrimaryJudgmentPair } from "./useTopicState.ts";

type TopicDetailTab = "overview" | "signals" | "pairs";

interface TopicDetailViewProps {
  topic: Topic;
  signals: Signal[];
  pairs: SavedAnalysisSnapshot[];
  onBack: () => void;
  onOpenPair: (resultId: string) => void;
  onUpdateTopic: (patch: Partial<Topic>) => void;
  defaultTab?: TopicDetailTab;
  sessionMode?: FolderMode;
  onSaveJudgmentOverride?: (resultId: string, patch: { relevance: 1 | 2 | 3 | 4 | 5; recommendedState: "park" | "watch" | "act" }) => void;
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
      <span>← 案例本</span>
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

export function TopicDetailView({
  topic,
  signals,
  pairs,
  onBack,
  onOpenPair,
  onUpdateTopic,
  defaultTab = "overview",
  sessionMode = "topic",
  onSaveJudgmentOverride
}: TopicDetailViewProps) {
  const [tab, setTab] = useState<TopicDetailTab>(defaultTab);
  const [draftDescription, setDraftDescription] = useState(topic.description || "");
  const [manualJudgment, setManualJudgment] = useState<{
    resultId: string;
    relevance: 1 | 2 | 3 | 4 | 5;
    recommendedState: "park" | "watch" | "act";
  } | null>(null);

  const primaryJudgmentPair = useMemo(() => pickPrimaryJudgmentPair(pairs), [pairs]);
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
        <ModeHeader
          mode="topic-detail"
          kicker="Topic detail"
          title={topic.name}
          deck={topic.description || "補一段描述，讓案例本保留這個主題的判讀邏輯。"}
          stamp={<Stamp tone={statusTone(topic.status)}>{topic.status}</Stamp>}
        />
      </div>

      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: tokens.spacing.md }}>
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

        <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
          描述
          <textarea
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            onBlur={() => draftDescription !== (topic.description || "") && onUpdateTopic({ description: draftDescription })}
            rows={3}
            style={{
              resize: "vertical",
              borderRadius: 10,
              border: `1px solid ${tokens.color.line}`,
              background: tokens.color.surface,
              color: tokens.color.ink,
              padding: "10px 12px",
              fontSize: 12,
              fontFamily: tokens.font.sans
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { key: "overview", label: "總覽" },
            { key: "signals", label: "討論訊號" },
            { key: "pairs", label: "成對分析" }
          ].map((entry) => {
            const active = tab === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key as TopicDetailTab)}
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
                {entry.label}
              </button>
            );
          })}
        </div>

        {tab === "overview" ? (
          <section style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
              {[
                { label: "訊號", value: String(signals.length) },
                { label: "成對分析", value: String(pairs.length) },
                { label: "建立時間", value: formatTopicDate(topic.createdAt) }
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "grid",
                    gap: 4,
                    padding: "12px 14px",
                    borderRadius: tokens.radius.card,
                    border: `1px solid ${tokens.color.line}`,
                    background: tokens.color.surface
                  }}
                >
                  <Kicker>{item.label}</Kicker>
                  <div style={{ fontSize: 16, fontWeight: 700, color: tokens.color.ink }}>{item.value}</div>
                </div>
              ))}
            </div>

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
          </section>
        ) : null}

        {tab === "signals" ? (
          signals.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {signals.map((signal) => (
                <div
                  key={signal.id}
                  style={{
                    display: "grid",
                    gap: 4,
                    padding: "12px 14px",
                    borderRadius: tokens.radius.card,
                    border: `1px solid ${tokens.color.line}`,
                    background: tokens.color.elevated
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: tokens.color.ink }}>{signal.source}</div>
                  <div style={{ fontSize: 11, color: tokens.color.subInk }}>加入時間 {formatTopicDate(signal.capturedAt)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: tokens.color.subInk }}>尚未加入討論訊號</div>
          )
        ) : null}

        {tab === "pairs" ? (
          pairs.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {pairs.map((pair) => (
                <PairRow key={pair.resultId} pair={pair} onOpenPair={onOpenPair} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: tokens.color.subInk }}>尚未加入成對分析</div>
          )
        ) : null}
      </WorkspaceSurface>
    </div>
  );
}

export const topicDetailViewTestables = {
  Breadcrumb,
  PairRow,
  pickPrimaryJudgmentPair
};
