import { useState } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { SessionProcessingSummary } from "../state/processing-state";
import type { FolderMode, SessionItem, Signal, SignalTagsRecord } from "../state/types";
import {
  ModeHeader,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  lineClamp,
  surfaceCardStyle,
  viewRootStyle
} from "./components";
import { useUiText } from "./i18n";
import { CollectorGist, CollectorMetricStrip, COLLECTOR_MOTION_CSS } from "./CollectorMetricStrip";
import { textStyles, tokens } from "./tokens";

const MODE_ACCENT = `var(--dlens-mode-accent, ${tokens.color.accent})`;
interface CollectViewProps {
  preview: TargetDescriptor | null;
  folderName: string;
  mode?: FolderMode;
  isSaved: boolean;
  canSavePreview?: boolean;
  disabledReason?: string;
  selectionMode: boolean;
  onSavePreview: () => void;
  onOpenPreview: () => void;
  onToggleCollectMode: () => void;
  recentItems?: SessionItem[];
  processingSummary?: SessionProcessingSummary;
  untriagedSignals?: Signal[];
  signalPreviewById?: Record<string, string>;
  signalTagsByItemId?: Record<string, SignalTagsRecord>;
  onCreateTopicFromSignals?: (signalIds: string[]) => void;
  onSignalDeleted?: (signalId: string) => void;
}

function canCreateTopicFromSelection(signalIds: string[]): boolean {
  return signalIds.length >= 3;
}

function suggestTagsForSignal(signal: Signal, signalTagsByItemId: Record<string, SignalTagsRecord>): string[] {
  const record = signal.itemId ? signalTagsByItemId[signal.itemId] : null;
  return record?.status === "complete" ? record.signalTags.slice(0, 2) : [];
}

export function CollectView({
  folderName,
  mode = "archive",
  recentItems = [],
  processingSummary,
  untriagedSignals = [],
  signalPreviewById = {},
  onCreateTopicFromSignals,
  onSignalDeleted
}: CollectViewProps) {
  const t = useUiText();
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const isProductMode = mode === "product";
  const isTopicMode = mode === "topic";
  const isPrEvidenceMode = mode === "pr-evidence";
  const isArchiveMode = mode === "archive";
  const targetLabel = isPrEvidenceMode ? "PR evidence ledger" : isProductMode ? "產品訊號收件匣" : isTopicMode ? "主題" : "資料庫";
  const title = t("收藏貼文", "Save a post");
  const deck = t("點按貼文按鈕收藏，按住或拖動選擇工作區。", "Tap the post button to save; hold or flick to choose a workspace.");
  const recentCaptures = [...recentItems]
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, 3);
  const showProcessingStrip = Boolean(processingSummary?.hasInflight && processingSummary.total > 0);
  const visibleUntriagedSignals = isTopicMode ? untriagedSignals.filter((signal) => signal.inboxStatus === "unprocessed") : [];
  const canCreateTopic = canCreateTopicFromSelection(selectedSignalIds);
  const toggleSignal = (signalId: string) => {
    setSelectedSignalIds((current) =>
      current.includes(signalId) ? current.filter((id) => id !== signalId) : [...current, signalId]
    );
  };
  const selectAll = () => {
    setSelectedSignalIds(visibleUntriagedSignals.map((signal) => signal.id));
  };
  const deleteSignal = (signalId: string) => {
    onSignalDeleted?.(signalId);
    setSelectedSignalIds((current) => current.filter((id) => id !== signalId));
  };
  const deleteSelected = () => {
    selectedSignalIds.forEach((signalId) => onSignalDeleted?.(signalId));
    setSelectedSignalIds([]);
  };

  return (
    <div style={viewRootStyle({ gap: tokens.spacing.md })}>
      <style>{COLLECTOR_MOTION_CSS}</style>
      <ModeHeader
        mode="collect"
        kicker="Collect"
        title={title}
        deck={deck}
      />

      <section
        data-collector-stage="hero"
        data-dlens-presence="card"
        style={{
          display: "grid",
          gap: 12,
          padding: "14px 16px",
          borderRadius: tokens.radius.cardLg,
          border: `1px solid ${tokens.color.atlasEdge}`,
          background: tokens.color.atlasPaper,
          boxShadow: tokens.shadow.atlasCard,
          backdropFilter: tokens.effect.atlasBlur,
          WebkitBackdropFilter: tokens.effect.atlasBlur
        }}
      >
        <div data-collector-panel-header="true" style={{ color: tokens.color.subInk, fontSize: 11, fontWeight: 700 }}>
          <span data-collector-target-chip="true" title={`${targetLabel} · ${folderName}`}>
            <span style={{ color: tokens.color.softInk, fontWeight: 500 }}>{targetLabel} · </span>
            {folderName}
          </span>
        </div>

        {isArchiveMode ? (
          <div
            data-archive-no-ai-notice="collect"
            style={{
              fontSize: 11,
              lineHeight: 1.55,
              color: tokens.color.softInk,
              padding: "8px 10px",
              borderRadius: tokens.radius.sm,
              border: `1px solid ${tokens.color.line}`,
              background: tokens.color.contextSurface
            }}
          >
            儲存為原文記錄，不跑 AI 分析。要分析請切換到 Topic 或 Product 模式。
          </div>
        ) : null}

        {showProcessingStrip && processingSummary ? (
          <div
            data-collector-processing-strip="true"
            style={{
              display: "grid",
              gap: tokens.spacing.xs,
              padding: `${tokens.spacing.sm}px ${tokens.spacing.sm}px`,
              borderRadius: tokens.radius.card,
              border: `1px solid ${tokens.color.cardEdge}`,
              background: tokens.color.contextSurface
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: tokens.spacing.sm, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: tokens.color.subInk }}>背景整理中</span>
              <span data-collector-processing-counter="true" style={{ fontFamily: tokens.font.mono, fontSize: 11, fontWeight: 800, color: tokens.color.ink, fontVariantNumeric: "tabular-nums" }}>
                {processingSummary.ready}/{processingSummary.total}
              </span>
            </div>
            <div
              aria-hidden="true"
              style={{
                position: "relative",
                overflow: "hidden",
                height: 4,
                borderRadius: tokens.radius.round,
                background: tokens.color.neutralSurfaceSoft
              }}
            >
              <span
                data-collector-processing-fill="true"
                style={{
                  position: "absolute",
                  insetBlock: 0,
                  width: "38%",
                  borderRadius: tokens.radius.round,
                  background: `linear-gradient(90deg, ${tokens.color.neutralSurfaceSoft}, ${MODE_ACCENT}, ${tokens.color.neutralSurfaceSoft})`
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {recentCaptures.length ? (
        <section
          data-collector-recent-captures="true"
          data-dlens-presence="card"
          style={surfaceCardStyle({ padding: "14px 16px 6px" })}
        >
          <SectionHeader title="最近採集" caption={`${recentCaptures.length} 篇`} style={{ marginBottom: 2 }} />
          <div style={{ display: "grid" }}>
            {recentCaptures.map((item, index) => (
              <div
                key={item.id}
                data-collector-recent-row={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: tokens.spacing.sm,
                  alignItems: "center",
                  padding: `${tokens.spacing.sm + 2}px 0`,
                  borderBottom: index === recentCaptures.length - 1 ? "none" : `1px solid ${tokens.color.line}`
                }}
              >
                <span style={{ display: "grid", gap: tokens.spacing.xs, minWidth: 0 }}>
                  <CollectorGist>{item.descriptor.text_snippet || "已保存的 Threads 貼文"}</CollectorGist>
                  <CollectorMetricStrip descriptor={item.descriptor} marker={item.id} />
                </span>
                <span
                  aria-label="已收"
                  title="已收"
                  style={{
                    display: "inline-grid",
                    placeItems: "center",
                    width: 22,
                    height: 22,
                    borderRadius: tokens.radius.round,
                    border: `1px solid ${tokens.color.successBorder}`,
                    background: tokens.color.successSoft,
                    color: tokens.color.success,
                    flexShrink: 0
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isTopicMode && visibleUntriagedSignals.length ? (
        <section
          data-topic-triage="untriaged"
          data-dlens-presence="card"
          style={{
            display: "grid",
            gap: 10,
            padding: "14px 16px",
            borderRadius: tokens.radius.cardLg,
            border: `1px solid ${tokens.color.line}`,
            background: tokens.color.elevated,
            boxShadow: tokens.shadow.topicCard
          }}
        >
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "grid", gap: 3 }}>
              <div style={{ ...textStyles.cardTitle, color: tokens.color.ink }}>未分流</div>
              <span style={{ ...textStyles.caption, color: tokens.color.softInk }}>選取至少 3 篇建立議題</span>
            </div>
            <SecondaryButton onClick={selectAll} style={{ padding: "6px 10px", fontSize: 11 }}>全選</SecondaryButton>
          </div>

          <div style={{ display: "grid", gap: 2 }}>
            {visibleUntriagedSignals.map((signal) => {
              const item = recentItems.find((entry) => entry.id === signal.itemId);
              const author = item?.descriptor.author_hint?.replace(/^@/, "");
              const checked = selectedSignalIds.includes(signal.id);
              return (
                <label
                  key={signal.id}
                  data-untriaged-row={signal.id}
                  data-dlens-presence="row"
                  className="dlens-card-lift"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr) auto",
                    alignItems: "start",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: `1px solid ${tokens.color.line}`,
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSignal(signal.id)}
                    style={{ width: 16, height: 16, marginTop: 2, accentColor: tokens.topicAccent.primary }}
                  />
                  <span style={{ display: "grid", gap: 5, minWidth: 0 }}>
                    <span data-untriaged-snippet={signal.id} style={{ ...textStyles.bodyTight, color: tokens.color.subInk, ...lineClamp(2) }}>
                      {signalPreviewById[signal.id] || item?.descriptor.text_snippet || "資料不完整的 Threads 訊號"}
                    </span>
                    {author ? <span data-untriaged-author={signal.id} style={{ ...textStyles.caption, color: tokens.color.softInk }}>@{author}</span> : null}
                  </span>
                  {onSignalDeleted ? (
                    <button
                      type="button"
                      data-untriaged-delete={signal.id}
                      aria-label="刪除此訊號"
                      title="刪除"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deleteSignal(signal.id);
                      }}
                      style={{
                        display: "inline-grid",
                        placeItems: "center",
                        width: 22,
                        height: 22,
                        marginTop: 1,
                        flexShrink: 0,
                        borderRadius: tokens.radius.round,
                        border: `1px solid ${tokens.color.line}`,
                        background: "transparent",
                        color: tokens.color.failed,
                        cursor: "pointer"
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div
            data-topic-triage-action-bar="true"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
              padding: "10px 12px",
              borderRadius: tokens.radius.card,
              background: tokens.color.surface,
              border: `1px solid ${tokens.color.line}`
            }}
          >
            <span style={{ fontSize: 11.5, color: tokens.color.softInk, fontWeight: 700 }}>
              已選 {selectedSignalIds.length} 篇
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              {onSignalDeleted ? (
                <SecondaryButton
                  dataAttrs={{ "data-untriaged-delete-selected": "true" }}
                  onClick={deleteSelected}
                  disabled={selectedSignalIds.length === 0}
                  style={{ padding: "6px 10px", fontSize: 11, color: tokens.color.failed, borderColor: tokens.color.failedBorder }}
                >
                  刪除所選
                </SecondaryButton>
              ) : null}
              <PrimaryButton
                onClick={() => onCreateTopicFromSignals?.(selectedSignalIds)}
                disabled={!canCreateTopic}
                style={{ padding: "7px 11px", fontSize: 11 }}
              >
                建立議題
              </PrimaryButton>
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export const collectViewTestables = {
  canCreateTopicFromSelection,
  suggestTagsForSignal
};
