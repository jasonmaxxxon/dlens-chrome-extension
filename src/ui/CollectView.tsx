import { useState } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { FolderMode, Signal, SignalTagsRecord } from "../state/types";
import {
  Kicker,
  MetricChip,
  ModeHeader,
  PrimaryButton,
  SecondaryButton,
  SideMark,
  Stamp,
  lineClamp,
  viewRootStyle
} from "./components";
import { tokens } from "./tokens";

const MODE_ACCENT = `var(--dlens-mode-accent, ${tokens.color.accent})`;
const MODE_ACCENT_MID = `var(--dlens-mode-accent-mid, ${tokens.color.accentMid})`;
const MODE_ACCENT_BUTTON_SHADOW = `var(--dlens-mode-accent-button-shadow, ${tokens.shadow.previewAvatar})`;

function avatarInitial(author: string | undefined): string {
  if (!author) return "?";
  const clean = author.replace(/^@/, "");
  return clean.charAt(0).toUpperCase();
}

function collectMetrics(preview: TargetDescriptor | null) {
  if (!preview) return [];
  return [
    { key: "likes" as const, value: preview.engagement.likes, present: preview.engagement_present.likes },
    { key: "comments" as const, value: preview.engagement.comments, present: preview.engagement_present.comments },
    { key: "reposts" as const, value: preview.engagement.reposts, present: preview.engagement_present.reposts },
    { key: "forwards" as const, value: preview.engagement.forwards, present: preview.engagement_present.forwards },
    { key: "views" as const, value: preview.engagement.views, present: preview.engagement_present.views }
  ].filter((metric) => metric.present || metric.value !== null && metric.value !== undefined);
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
  untriagedSignals?: Signal[];
  signalPreviewById?: Record<string, string>;
  signalTagsByItemId?: Record<string, SignalTagsRecord>;
  onCreateTopicFromSignals?: (signalIds: string[]) => void;
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
  untriagedSignals = [],
  signalPreviewById = {},
  signalTagsByItemId = {},
  onCreateTopicFromSignals
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
  const metrics = collectMetrics(preview);
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

  return (
    <div style={viewRootStyle({ gap: tokens.spacing.md })}>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Kicker tone="accent">{selectionMode ? "Live capture" : "Hover preview"}</Kicker>
          {hasPreview ? <Stamp tone={isSaved ? "success" : "accent"}>{isSaved ? "已儲存" : "預覽中"}</Stamp> : null}
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
                {metrics.length ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {metrics.map((metric) => (
                      <span
                        key={metric.key}
                        data-collect-metric={metric.key}
                      >
                        <MetricChip kind={metric.key} value={metric.value} present={metric.present} />
                      </span>
                    ))}
                  </div>
                ) : null}
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
      </section>

      <section
        style={{
          display: "grid",
          gap: 12,
          padding: "14px 16px",
          borderRadius: tokens.radius.card,
          border: `1px solid ${tokens.color.line}`,
          background: tokens.color.surface,
          boxShadow: tokens.shadow.glass
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <Kicker>{selectionMode ? "Selection active" : "Selection idle"}</Kicker>
            <div style={{ fontSize: 15, fontWeight: 700, color: tokens.color.ink }}>
              收集模式：{selectionMode ? "開啟" : "關閉"}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: tokens.color.subInk }}>
              {selectionMode ? "移動游標選取貼文。" : "開啟後滑過貼文即可快速預覽。"}
            </div>
          </div>
          <SecondaryButton onClick={onToggleCollectMode} style={{ padding: "8px 12px", fontSize: 11 }}>
            {selectionMode ? "關閉收集模式" : "開啟收集模式"}
          </SecondaryButton>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Stamp tone="neutral">S · 儲存</Stamp>
          <Stamp tone="neutral">Esc · 離開</Stamp>
        </div>
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
                    gridTemplateColumns: "auto minmax(0, 1fr)",
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
                    style={{ width: 16, height: 16, accentColor: tokens.topicAccent.primary }}
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
                </label>
              );
            })}
          </div>

          <div
            data-topic-triage-action-bar="true"
            style={{
              position: "sticky",
              bottom: 0,
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
