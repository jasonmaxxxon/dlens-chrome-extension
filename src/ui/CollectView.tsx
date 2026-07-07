import { useState } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { SessionProcessingSummary } from "../state/processing-state";
import type { FolderMode, SessionItem, Signal, SignalTagsRecord } from "../state/types";
import {
  Kicker,
  ModeHeader,
  PrimaryButton,
  SecondaryButton,
  SideMark,
  Stamp,
  lineClamp,
  viewRootStyle
} from "./components";
import { CollectorGist, CollectorMetricStrip, COLLECTOR_MOTION_CSS } from "./CollectorMetricStrip";
import { tokens } from "./tokens";

const MODE_ACCENT = `var(--dlens-mode-accent, ${tokens.color.accent})`;
const MODE_ACCENT_MID = `var(--dlens-mode-accent-mid, ${tokens.color.accentMid})`;
const MODE_ACCENT_BUTTON_SHADOW = `var(--dlens-mode-accent-button-shadow, ${tokens.shadow.previewAvatar})`;

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
        kicker={selectionMode ? "Collect mode live" : "Collect"}
        title={title}
        deck={deck}
        stamp={<Stamp tone={selectionMode ? "accent" : "neutral"}>{selectionMode ? "Active" : "Idle"}</Stamp>}
      />

      <section
        data-paper-grain="true"
        style={{
          position: "relative",
          overflow: "hidden",
          display: "grid",
          gap: 12,
          padding: "14px 16px",
          borderRadius: tokens.radius.card,
          border: `1px solid ${tokens.color.line}`,
          background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`,
          boxShadow: tokens.shadow.shell
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
            <span style={{ fontFamily: tokens.font.serif, fontSize: 22, lineHeight: 1, color: MODE_ACCENT, flexShrink: 0 }}>
              DLens
            </span>
            <span
              data-collector-status={selectionMode ? "capturing" : "idle"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: tokens.spacing.xs,
                minWidth: 0,
                color: selectionMode ? MODE_ACCENT : tokens.color.softInk,
                fontSize: 11,
                fontWeight: 800
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: tokens.spacing.xs + 2,
                  height: tokens.spacing.xs + 2,
                  borderRadius: tokens.radius.round,
                  background: selectionMode ? MODE_ACCENT : tokens.color.glassBorder,
                  boxShadow: selectionMode ? MODE_ACCENT_BUTTON_SHADOW : tokens.shadow.glass
                }}
              />
              {selectionMode ? "採集中" : "待命"}
            </span>
            <span
              data-collector-target-chip="true"
              style={{
                minWidth: 0,
                maxWidth: 170,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                padding: `${tokens.spacing.xs}px ${tokens.spacing.sm}px`,
                borderRadius: tokens.radius.pill,
                border: `1px solid ${tokens.color.cardEdge}`,
                background: tokens.color.contextSurface,
                color: tokens.color.subInk,
                fontSize: 11,
                fontWeight: 700
              }}
            >
              {folderName}
            </span>
          </div>
          <SecondaryButton
            dataAttrs={{ "data-collector-mode-toggle": "true" }}
            onClick={onToggleCollectMode}
            style={{ padding: `${tokens.spacing.xs + 2}px ${tokens.spacing.sm}px`, fontSize: 11, flexShrink: 0 }}
          >
            {selectionMode ? "關閉" : "開啟"}
          </SecondaryButton>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "3px minmax(0, 1fr)", gap: 12 }}>
          <SideMark tone={hasPreview ? "accent" : "muted"} />
          <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: tokens.radius.card,
                  background: hasPreview
                    ? `linear-gradient(135deg, ${MODE_ACCENT}, ${MODE_ACCENT_MID})`
                    : tokens.color.neutralSurface,
                  color: hasPreview ? tokens.color.elevated : tokens.color.softInk,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: tokens.font.sans,
                  fontSize: 13,
                  fontWeight: 700,
                  flexShrink: 0,
                  boxShadow: hasPreview ? MODE_ACCENT_BUTTON_SHADOW : tokens.shadow.previewAvatar
                }}
              >
                {hasPreview ? avatarInitial(preview?.author_hint) : "·"}
              </div>

              <div style={{ display: "grid", gap: 4, minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {preview?.author_hint || "尚無預覽"}
                    </div>
                    <div style={{ fontSize: 10, color: tokens.color.softInk }}>
                      {targetLabel} · <span style={{ color: tokens.color.subInk }}>{isProductMode ? "Product mode" : isPrEvidenceMode ? "PR Evidence mode" : folderName}</span>
                    </div>
                  </div>
                  {hasPreview ? (
                    <SecondaryButton onClick={onOpenPreview} disabled={!preview?.post_url} style={{ padding: "6px 10px", fontSize: 11 }}>
                      在 Threads 開啟
                    </SecondaryButton>
                  ) : null}
                </div>

                <div style={{ fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk, ...lineClamp(3) }}>
                  {preview?.text_snippet || "將游標移到 Threads 貼文上，這裡會顯示快速預覽。"}
                </div>
              </div>
            </div>

            <PrimaryButton onClick={onSavePreview} disabled={!hasPreview || isSaved || !canSavePreview} activateOnPointerDown style={{ width: "100%" }}>
              {isSaved ? savedCopy : saveCopy}
            </PrimaryButton>
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
          </div>
        </div>

        {recentCaptures.length ? (
          <div
            data-collector-recent-captures="true"
            style={{
              display: "grid",
              gap: 0,
              borderTop: `1px solid ${tokens.color.line}`
            }}
          >
            {recentCaptures.map((item) => (
              <div
                key={item.id}
                data-collector-recent-row={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: tokens.spacing.sm,
                  alignItems: "center",
                  padding: `${tokens.spacing.sm}px 0`,
                  borderBottom: `1px solid ${tokens.color.line}`
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
        ) : null}

        <div
          data-collector-key-hints="true"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: tokens.spacing.sm,
            flexWrap: "wrap"
          }}
        >
          <span style={{ display: "inline-flex", gap: tokens.spacing.xs, flexWrap: "wrap" }}>
            <Stamp tone="neutral">S · 儲存</Stamp>
            <Stamp tone="neutral">Esc · 離開</Stamp>
          </span>
          <span style={{ fontSize: 11, color: tokens.color.softInk }}>
            {selectionMode ? "滑過貼文即可預覽" : "開啟後滑過貼文"}
          </span>
        </div>

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
