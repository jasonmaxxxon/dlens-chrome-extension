import { useState } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { SessionProcessingSummary } from "../state/processing-state";
import type { FolderMode, SessionItem, Signal, SignalTagsRecord } from "../state/types";
import {
  Kicker,
  ModeHeader,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  lineClamp,
  surfaceCardStyle,
  viewRootStyle
} from "./components";
import { CollectorGist, CollectorMetricStrip, COLLECTOR_MOTION_CSS } from "./CollectorMetricStrip";
import { tokens } from "./tokens";

const MODE_ACCENT = `var(--dlens-mode-accent, ${tokens.color.accent})`;
const MODE_ACCENT_MID = `var(--dlens-mode-accent-mid, ${tokens.color.accentMid})`;
const MODE_ACCENT_BUTTON_SHADOW = `var(--dlens-mode-accent-button-shadow, ${tokens.shadow.previewAvatar})`;

const kbdChipStyle = {
  fontFamily: tokens.font.mono,
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1.4,
  color: tokens.color.subInk,
  padding: "2px 6px",
  borderRadius: tokens.radius.sm,
  border: `1px solid ${tokens.color.line}`,
  background: tokens.color.elevated
} as const;

function avatarInitial(author: string | undefined): string {
  if (!author) return "?";
  const clean = author.replace(/^@/, "");
  return clean.charAt(0).toUpperCase();
}

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
  preview,
  folderName,
  mode = "archive",
  isSaved,
  canSavePreview = true,
  disabledReason = "",
  selectionMode,
  onSavePreview,
  onOpenPreview,
  onToggleCollectMode,
  recentItems = [],
  processingSummary,
  untriagedSignals = [],
  signalPreviewById = {},
  signalTagsByItemId = {},
  onCreateTopicFromSignals,
  onSignalDeleted
}: CollectViewProps) {
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const hasPreview = Boolean(preview);
  const isProductMode = mode === "product";
  const isTopicMode = mode === "topic";
  const isPrEvidenceMode = mode === "pr-evidence";
  const isArchiveMode = mode === "archive";
  const targetLabel = isPrEvidenceMode ? "PR evidence ledger" : isProductMode ? "產品訊號收件匣" : isTopicMode ? "主題" : "資料庫";
  const title = isPrEvidenceMode ? "快速收集，加入 PR evidence" : isProductMode ? "快速判斷，加入產品訊號" : isTopicMode ? "快速採集，存入主題" : "快速判斷，存入資料庫";
  const deck = isProductMode
    ? "指向 Threads 貼文即可預覽，按下加入產品訊號收件匣。"
    : isPrEvidenceMode
      ? "指向已找到的 Threads 貼文即可預覽；儲存只建立 evidence row，不跑 AI。"
      : isTopicMode
      ? "指向 Threads 貼文即可預覽，儲存後可在主題頁分配或追蹤。"
      : "指向 Threads 貼文即可預覽，按下存入資料庫。";
  const savedCopy = isPrEvidenceMode ? "已加入 PR evidence" : isProductMode ? "已加入產品訊號" : isTopicMode ? "已加入主題" : "已儲存到資料庫";
  const saveCopy = isPrEvidenceMode ? "加入 evidence row" : isProductMode ? "加入產品訊號" : isTopicMode ? "加入主題" : "儲存到資料庫";
  const previewPostUrl = preview?.post_url || "";
  const recentCaptures = [...recentItems]
    .filter((item) => item.descriptor.post_url !== previewPostUrl)
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
        <div
          data-collector-panel-header="true"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: tokens.spacing.sm,
            minWidth: 0
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: tokens.spacing.sm, minWidth: 0 }}>
            <span
              data-collector-status={selectionMode ? "capturing" : "idle"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: tokens.spacing.xs + 2,
                minWidth: 0,
                color: selectionMode ? MODE_ACCENT : tokens.color.softInk,
                fontSize: 11,
                fontWeight: 800,
                flexShrink: 0
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: tokens.spacing.xs + 2,
                  height: tokens.spacing.xs + 2,
                  borderRadius: tokens.radius.round,
                  background: selectionMode ? MODE_ACCENT : tokens.color.lineStrong,
                  boxShadow: selectionMode ? MODE_ACCENT_BUTTON_SHADOW : "none"
                }}
              />
              {selectionMode ? "採集中" : "待命"}
            </span>
            <span aria-hidden="true" style={{ width: 1, height: 14, background: tokens.color.line, flexShrink: 0 }} />
            <span
              data-collector-target-chip="true"
              title={`${targetLabel} · ${folderName}`}
              style={{
                minWidth: 0,
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: tokens.color.subInk,
                fontSize: 11,
                fontWeight: 700
              }}
            >
              <span style={{ color: tokens.color.softInk, fontWeight: 500 }}>{targetLabel} · </span>
              {folderName}
            </span>
          </div>
          {selectionMode ? (
            <SecondaryButton
              dataAttrs={{ "data-collector-mode-toggle": "true" }}
              onClick={onToggleCollectMode}
              style={{ padding: `${tokens.spacing.xs + 2}px ${tokens.spacing.md}px`, fontSize: 11, flexShrink: 0 }}
            >
              關閉採集
            </SecondaryButton>
          ) : (
            <PrimaryButton
              dataAttrs={{ "data-collector-mode-toggle": "true" }}
              onClick={onToggleCollectMode}
              style={{ padding: `${tokens.spacing.xs + 2}px ${tokens.spacing.md}px`, fontSize: 11, flexShrink: 0 }}
            >
              開啟採集
            </PrimaryButton>
          )}
        </div>

        {hasPreview ? (
          <div
            data-collector-viewfinder="preview"
            style={{
              display: "grid",
              gap: 8,
              minWidth: 0,
              padding: "12px 14px",
              borderRadius: tokens.radius.card,
              border: `1px solid ${tokens.color.cardEdge}`,
              background: tokens.color.elevated,
              boxShadow: tokens.shadow.card
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div
                aria-hidden="true"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: tokens.radius.card,
                  background: `linear-gradient(135deg, ${MODE_ACCENT}, ${MODE_ACCENT_MID})`,
                  color: tokens.color.elevated,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: tokens.font.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                  boxShadow: MODE_ACCENT_BUTTON_SHADOW
                }}
              >
                {avatarInitial(preview?.author_hint)}
              </div>
              <div style={{ display: "grid", gap: 1, minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {preview?.author_hint || "未知作者"}
                </div>
                {preview?.time_token_hint ? (
                  <div style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.softInk }}>
                    {preview.time_token_hint}
                  </div>
                ) : null}
              </div>
              <SecondaryButton onClick={onOpenPreview} disabled={!preview?.post_url} style={{ padding: "6px 10px", fontSize: 11, flexShrink: 0 }}>
                在 Threads 開啟
              </SecondaryButton>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk, ...lineClamp(3) }}>
              {preview?.text_snippet || "（無文字內容）"}
            </div>
          </div>
        ) : (
          <div
            data-collector-viewfinder="empty"
            style={{
              display: "grid",
              placeItems: "center",
              minHeight: 88,
              padding: "16px 14px",
              borderRadius: tokens.radius.card,
              border: `1px dashed ${tokens.color.lineStrong}`,
              color: tokens.color.softInk,
              fontSize: 12,
              lineHeight: 1.65,
              textAlign: "center"
            }}
          >
            {selectionMode ? "將游標移到 Threads 貼文上，這裡會顯示快速預覽。" : "開啟採集後，滑過 Threads 貼文即可在這裡預覽。"}
          </div>
        )}

        {hasPreview ? (
          <PrimaryButton onClick={onSavePreview} disabled={isSaved || !canSavePreview} activateOnPointerDown style={{ width: "100%" }}>
            {isSaved ? savedCopy : saveCopy}
          </PrimaryButton>
        ) : null}
        {disabledReason ? (
          <div
            data-collect-disabled-reason="true"
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
            {disabledReason}
          </div>
        ) : null}
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

        {selectionMode ? (
          <div
            data-collector-key-hints="true"
            style={{
              display: "flex",
              alignItems: "center",
              gap: tokens.spacing.sm,
              flexWrap: "wrap",
              color: tokens.color.softInk,
              fontSize: 11
            }}
          >
            <span style={kbdChipStyle}>S</span>
            <span>儲存</span>
            <span aria-hidden="true" style={{ color: tokens.color.lineStrong }}>·</span>
            <span style={kbdChipStyle}>Esc</span>
            <span>離開</span>
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
              <Kicker tone="accent">Triage</Kicker>
              <div style={{ fontSize: 15, fontWeight: 800, color: tokens.color.ink }}>未分流</div>
            </div>
            <span style={{ fontSize: 11, color: tokens.color.softInk }}>{visibleUntriagedSignals.length} 篇</span>
          </div>

          <div style={{ display: "grid", gap: 2 }}>
            {visibleUntriagedSignals.map((signal) => {
              const tags = suggestTagsForSignal(signal, signalTagsByItemId);
              const checked = selectedSignalIds.includes(signal.id);
              return (
                <label
                  key={signal.id}
                  data-untriaged-row={signal.id}
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
                    <span style={{ fontSize: 12.5, lineHeight: 1.55, color: tokens.color.subInk, ...lineClamp(2) }}>
                      {signalPreviewById[signal.id] || "資料不完整的 Threads 訊號"}
                    </span>
                    <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {tags.length ? tags.map((tag) => (
                        <span key={tag} style={{ fontSize: 10.5, color: tokens.topicAccent.primary, background: tokens.topicAccent.tintSage, borderRadius: tokens.radius.round, padding: "2px 6px" }}>
                          {tag}
                        </span>
                      )) : (
                        <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>建議議題待標籤完成</span>
                      )}
                    </span>
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
              gap: 10,
              padding: "10px 12px",
              borderRadius: tokens.radius.card,
              background: tokens.color.surface,
              border: `1px solid ${tokens.color.line}`
            }}
          >
            <span style={{ fontSize: 11.5, color: tokens.color.softInk, fontWeight: 700 }}>
              已選 {selectedSignalIds.length} 篇 · 建立議題需要 ≥ 3
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <SecondaryButton onClick={selectAll} style={{ padding: "6px 10px", fontSize: 11 }}>全選</SecondaryButton>
              {onSignalDeleted ? (
                <SecondaryButton
                  dataAttrs={{ "data-untriaged-delete-selected": "true" }}
                  onClick={deleteSelected}
                  disabled={selectedSignalIds.length === 0}
                  style={{ padding: "6px 10px", fontSize: 11, color: tokens.color.failed, borderColor: tokens.color.failedBorder }}
                >
                  刪除
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
