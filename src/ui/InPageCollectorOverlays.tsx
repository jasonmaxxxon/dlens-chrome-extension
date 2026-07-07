import { useEffect, useState, type CSSProperties } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { Signal, Topic } from "../state/types";
import { PrimaryButton, SecondaryButton, TOKENS, surfaceCardStyle } from "./components";
import { CollectorGist, CollectorMetricStrip, COLLECTOR_MOTION_CSS } from "./CollectorMetricStrip";
import { flashPreviewAvatar } from "./inpage-helpers";
import { modeThemes, tokens } from "./tokens";
import type { InPageCollectorAppModel, PreviewSaveResult } from "./useInPageCollectorAppState";

const ARCHIVE_MODE_THEME = modeThemes.archive;
const MODE_ACCENT = `var(--dlens-mode-accent, ${ARCHIVE_MODE_THEME.accent})`;
const MODE_ACCENT_MID = `var(--dlens-mode-accent-mid, ${ARCHIVE_MODE_THEME.accentMid})`;
const MODE_ACCENT_SOFT = `var(--dlens-mode-accent-soft, ${ARCHIVE_MODE_THEME.accentSoft})`;
const MODE_ACCENT_GLOW = `var(--dlens-mode-accent-glow, ${ARCHIVE_MODE_THEME.accentGlow})`;
const MODE_HOVER_BORDER_SOFT = `var(--dlens-mode-hover-border-soft, ${ARCHIVE_MODE_THEME.hoverBorderSoft})`;

type TopicDestination = Pick<Topic, "id" | "name" | "signalIds">;
type SignalDestination = Pick<Signal, "id" | "inboxStatus" | "topicId">;
type InlineSuccessState = {
  descriptor: TargetDescriptor;
  targetName: string;
  detail: string;
  style: CSSProperties;
};
type FlashPreviewCardProps = {
  descriptor: TargetDescriptor;
  hoverSaved: boolean;
  mode: string;
  topics: TopicDestination[];
  signals: SignalDestination[];
  selectedTopicId?: string | null;
  collectionTopicId?: string | null;
  success?: Pick<InlineSuccessState, "targetName" | "detail"> | null;
  onSave: () => void;
  onOpen: () => void;
  onSelectTopicTarget: (topicId: string | null) => void;
  onCreateTopic: () => void;
};

function topicName(topic: Pick<Topic, "name">): string {
  return topic.name.trim() || "未命名議題";
}

function activeTopicId(selectedTopicId?: string | null, collectionTopicId?: string | null): string | null {
  return selectedTopicId || collectionTopicId || null;
}

function countTopicSignals(topic: TopicDestination, signals: SignalDestination[]): number {
  const owned = new Set(topic.signalIds);
  for (const signal of signals) {
    if (signal.topicId === topic.id) {
      owned.add(signal.id);
    }
  }
  return owned.size;
}

function untriagedSignalCount(signals: SignalDestination[]): number {
  return signals.filter((signal) => signal.inboxStatus === "unprocessed").length;
}

function destinationLabel(topics: TopicDestination[], topicId: string | null): string {
  if (!topicId) {
    return "未分流";
  }
  const topic = topics.find((entry) => entry.id === topicId);
  return topic ? topicName(topic) : "未命名議題";
}

function isPreviewSaveSuccess(result: PreviewSaveResult | void): result is Extract<PreviewSaveResult, { ok: true }> {
  return Boolean(result && result.ok);
}

function fallbackSuccessStyle(popupOpen: boolean): CSSProperties {
  return {
    position: "fixed",
    right: 24,
    top: popupOpen ? 84 : 80,
    width: 320,
    maxWidth: "calc(100vw - 48px)"
  };
}

function topicChipStyle(selected: boolean, dashed = false): CSSProperties {
  return {
    border: `1px ${dashed ? "dashed" : "solid"} ${selected ? MODE_ACCENT : tokens.color.line}`,
    borderRadius: tokens.radius.pill,
    background: selected ? MODE_ACCENT : tokens.color.elevated,
    color: selected ? tokens.color.inverse : tokens.color.ink,
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    minHeight: 28,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%"
  };
}

function TopicDestinationPicker({
  topics,
  signals,
  selectedTopicId,
  collectionTopicId,
  onSelectTopicTarget,
  onCreateTopic
}: {
  topics: TopicDestination[];
  signals: SignalDestination[];
  selectedTopicId?: string | null;
  collectionTopicId?: string | null;
  onSelectTopicTarget: (topicId: string | null) => void;
  onCreateTopic: () => void;
}) {
  const activeId = activeTopicId(selectedTopicId, collectionTopicId);
  const untriagedSelected = !activeId;
  return (
    <div data-collector-topic-picker="true" style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: tokens.color.softInk, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        存入議題
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
        <button
          type="button"
          data-collector-topic-chip="untriaged"
          data-collector-topic-chip-selected={untriagedSelected ? "untriaged" : undefined}
          onClick={() => onSelectTopicTarget(null)}
          style={topicChipStyle(untriagedSelected)}
        >
          <span>未分流</span>
          <span style={{ color: untriagedSelected ? tokens.color.inversePanel : tokens.color.softInk, fontFamily: tokens.font.mono }}>
            {untriagedSignalCount(signals)}
          </span>
        </button>
        {topics.map((topic) => {
          const selected = activeId === topic.id;
          return (
            <button
              key={topic.id}
              type="button"
              data-collector-topic-chip={topic.id}
              data-collector-topic-chip-selected={selected ? topic.id : undefined}
              onClick={() => onSelectTopicTarget(topic.id)}
              style={topicChipStyle(selected)}
            >
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topicName(topic)}</span>
              <span style={{ color: selected ? tokens.color.inversePanel : tokens.color.softInk, fontFamily: tokens.font.mono }}>
                {countTopicSignals(topic, signals)}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          data-collector-new-topic-chip="true"
          onClick={onCreateTopic}
          style={{ ...topicChipStyle(false, true), color: tokens.color.softInk }}
        >
          ＋新議題
        </button>
      </div>
    </div>
  );
}

export function FlashPreviewCard({
  descriptor,
  hoverSaved,
  mode,
  topics,
  signals,
  selectedTopicId,
  collectionTopicId,
  success = null,
  onSave,
  onOpen,
  onSelectTopicTarget,
  onCreateTopic
}: FlashPreviewCardProps) {
  const isTopicMode = mode === "topic";
  const targetName = destinationLabel(topics, activeTopicId(selectedTopicId, collectionTopicId));
  if (success) {
    return (
      <div
        data-collector-success-flip="true"
        style={surfaceCardStyle({
          padding: tokens.spacing.md,
          borderRadius: tokens.radius.card,
          background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`,
          border: `1px solid ${tokens.color.successBorder}`,
          boxShadow: tokens.shadow.popup,
          display: "grid",
          gap: tokens.spacing.sm,
          minWidth: 0
        })}
      >
        <div style={{ display: "flex", alignItems: "center", gap: tokens.spacing.sm, minWidth: 0 }}>
          <span
            data-collector-success-dot="true"
            aria-hidden="true"
            style={{
              width: 30,
              height: 30,
              borderRadius: tokens.radius.round,
              background: tokens.color.success,
              color: tokens.color.inverse,
              display: "grid",
              placeItems: "center",
              fontSize: 15,
              fontWeight: 900,
              flexShrink: 0,
              boxShadow: tokens.shadow.glass
            }}
          >
            ✓
          </span>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: 1.3, fontWeight: 800, color: tokens.color.success }}>
              ✓ 已存入 · {success.targetName}
            </div>
            <div style={{ fontSize: 11, color: tokens.color.softInk, lineHeight: 1.5 }}>
              {success.detail}
            </div>
          </div>
        </div>
        <CollectorMetricStrip descriptor={descriptor} marker="success-inline" />
      </div>
    );
  }

  return (
    <div
      style={surfaceCardStyle({
        padding: tokens.spacing.md,
        borderRadius: tokens.radius.card,
        background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`,
        border: `1px solid ${tokens.color.cardEdge}`,
        boxShadow: tokens.shadow.popup,
        display: "grid",
        gap: tokens.spacing.sm,
        minWidth: 0
      })}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: tokens.spacing.sm, minWidth: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: tokens.radius.lg,
            background: `linear-gradient(135deg, ${MODE_ACCENT}, ${MODE_ACCENT_MID})`,
            color: tokens.color.inverse,
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0,
            boxShadow: tokens.shadow.previewAvatar
          }}
        >
          {flashPreviewAvatar(descriptor.author_hint)}
        </div>
        <div style={{ display: "grid", gap: tokens.spacing.xs, minWidth: 0 }}>
          <div
            style={{
              color: tokens.color.ink,
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.3,
              minWidth: 0
            }}
          >
            {descriptor.author_hint || "Unknown author"}
          </div>
          <CollectorGist lines={2}>{descriptor.text_snippet || "No snippet"}</CollectorGist>
        </div>
      </div>

      <CollectorMetricStrip descriptor={descriptor} marker="hover-preview" />

      {isTopicMode ? (
        <TopicDestinationPicker
          topics={topics}
          signals={signals}
          selectedTopicId={selectedTopicId}
          collectionTopicId={collectionTopicId}
          onSelectTopicTarget={onSelectTopicTarget}
          onCreateTopic={onCreateTopic}
        />
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <PrimaryButton onClick={onSave}>
          {isTopicMode ? `${hoverSaved ? "已存入" : "存入"} · ${targetName}` : hoverSaved ? "Saved" : "Save"}
        </PrimaryButton>
        <SecondaryButton onClick={onOpen}>
          Open
        </SecondaryButton>
      </div>
    </div>
  );
}

export function InPageCollectorOverlays({ app }: { app: InPageCollectorAppModel }) {
  const {
    snapshot,
    tabId,
    hoverRect,
    hoverSaved,
    flashPreview,
    flashStyle,
    displayToast,
    successToastDescriptor,
    preview,
    popupOpen
  } = app;
  const [inlineSuccess, setInlineSuccess] = useState<InlineSuccessState | null>(null);

  useEffect(() => {
    if (!inlineSuccess) {
      return;
    }
    const timer = window.setTimeout(() => setInlineSuccess(null), 1600);
    return () => window.clearTimeout(timer);
  }, [inlineSuccess]);

  const activeMode = app.activeFolderMode ?? app.activeFolder?.mode ?? "archive";
  const cardDescriptor = inlineSuccess?.descriptor ?? flashPreview ?? null;
  const cardStyle = inlineSuccess?.style ?? flashStyle ?? null;
  const shouldRenderPreviewCard = Boolean((snapshot?.tab.selectionMode || inlineSuccess) && cardDescriptor && cardStyle);

  async function handleSavePreview() {
    const descriptorForSuccess = flashPreview ?? preview ?? null;
    const styleForSuccess = flashStyle ?? fallbackSuccessStyle(popupOpen);
    const result = await app.onSavePreview();
    if (!isPreviewSaveSuccess(result)) {
      return;
    }
    const descriptor = result.descriptor ?? descriptorForSuccess;
    if (!descriptor) {
      return;
    }
    setInlineSuccess({
      descriptor,
      targetName: result.targetName,
      detail: result.detail,
      style: styleForSuccess
    });
  }

  return (
    <>
      <style>{COLLECTOR_MOTION_CSS}</style>
      <button
        id="__dlens_extension_v0_launcher__"
        data-dlens-control="true"
        aria-label={popupOpen ? "Close DLens popup" : "Open DLens popup"}
        onClick={() => void app.onTogglePopup()}
        style={{
          position: "fixed",
          right: 24,
          top: 24,
          width: 48,
          height: 48,
          borderRadius: 16,
          border: `1px solid ${TOKENS.glassBorder}`,
          background: popupOpen
            ? `linear-gradient(135deg, ${MODE_ACCENT}, ${MODE_ACCENT_MID})`
            : TOKENS.glassBg,
          backdropFilter: TOKENS.glassBlur,
          WebkitBackdropFilter: TOKENS.glassBlur,
          boxShadow: popupOpen
            ? `0 8px 24px ${MODE_ACCENT_GLOW}`
            : TOKENS.glassShadow,
          color: popupOpen ? tokens.color.inverse : MODE_ACCENT,
          fontSize: 22,
          fontWeight: 700,
          zIndex: 2147483640,
          cursor: "pointer",
          pointerEvents: "auto",
          transition: TOKENS.transition,
          display: "grid",
          placeItems: "center"
        }}
      >
        {popupOpen ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        )}
      </button>

      {snapshot?.tab.collectModeBannerVisible ? (
        <div
          data-dlens-control="true"
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2147483646,
            padding: "10px 20px",
            borderRadius: 999,
            background: `linear-gradient(135deg, ${MODE_ACCENT}, ${MODE_ACCENT_MID})`,
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            color: tokens.color.inverse,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.02em",
            boxShadow: `0 12px 40px ${MODE_ACCENT_GLOW}`,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: MODE_ACCENT_MID, display: "inline-block", animation: "dlens-pulse 2s ease-in-out infinite" }} />
          Hover to preview
          <span style={{ opacity: 0.4 }}>|</span>
          <kbd style={{ padding: "1px 6px", borderRadius: 4, background: tokens.color.inversePanel, fontSize: 11 }}>S</kbd> save
          <span style={{ opacity: 0.4 }}>|</span>
          <kbd style={{ padding: "1px 6px", borderRadius: 4, background: tokens.color.inversePanel, fontSize: 11 }}>Esc</kbd> exit
        </div>
      ) : null}

      {snapshot?.tab.selectionMode && hoverRect ? (
        <div
          data-dlens-control="true"
          style={{
            position: "fixed",
            top: Math.max(12, hoverRect.top - 14),
            left: Math.max(12, hoverRect.right - 88),
            zIndex: 2147483646,
            padding: "4px 10px",
            borderRadius: 999,
            background: hoverSaved ? TOKENS.successSoft : MODE_ACCENT_SOFT,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${hoverSaved ? tokens.color.successBorder : MODE_HOVER_BORDER_SOFT}`,
            color: hoverSaved ? TOKENS.success : MODE_ACCENT,
            fontSize: 11,
            fontWeight: 700,
            boxShadow: TOKENS.hudGlow,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 4,
            animation: "dlens-slide-in 150ms cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        >
          {hoverSaved ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : null}
          {hoverSaved ? "Saved" : snapshot?.tab.hoveredTargetStrength === "soft" ? "Preview only" : "Ready"}
        </div>
      ) : null}

      {shouldRenderPreviewCard && cardDescriptor && cardStyle ? (
        <div data-dlens-control="true" style={{ ...cardStyle, pointerEvents: "auto" }}>
          <FlashPreviewCard
            descriptor={cardDescriptor}
            hoverSaved={hoverSaved}
            mode={activeMode}
            topics={app.topics}
            signals={app.signals}
            selectedTopicId={app.selectedTopicId}
            collectionTopicId={app.collectTargetTopicId}
            success={inlineSuccess ? { targetName: inlineSuccess.targetName, detail: inlineSuccess.detail } : null}
            onSave={() => void handleSavePreview()}
            onOpen={() => {
              if (!cardDescriptor.post_url) {
                return;
              }
              window.open(cardDescriptor.post_url, "_blank", "noopener,noreferrer");
            }}
            onSelectTopicTarget={app.onSelectTopicTarget}
            onCreateTopic={() => void app.onCreateTopic()}
          />
        </div>
      ) : null}

      {displayToast && displayToast.kind === "saved" && successToastDescriptor ? (
        <div
          data-dlens-control="true"
          data-collector-success-popup="true"
          style={{
            position: "fixed",
            right: 24,
            top: popupOpen ? 84 : 80,
            zIndex: 2147483647,
            width: 320,
            maxWidth: "calc(100vw - 48px)",
            padding: tokens.spacing.md,
            borderRadius: tokens.radius.card,
            background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`,
            backdropFilter: tokens.effect.glassBlur,
            WebkitBackdropFilter: tokens.effect.glassBlur,
            border: `1px solid ${tokens.color.successBorder}`,
            color: tokens.color.ink,
            boxShadow: TOKENS.hudGlow,
            pointerEvents: "auto",
            display: "grid",
            gap: tokens.spacing.sm
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacing.sm }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: tokens.spacing.xs, minWidth: 0 }}>
              <span
                data-collector-success-dot="true"
                aria-hidden="true"
                style={{
                  width: tokens.spacing.sm,
                  height: tokens.spacing.sm,
                  borderRadius: tokens.radius.round,
                  background: tokens.color.success,
                  boxShadow: tokens.shadow.glass
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 800, color: tokens.color.success }}>{displayToast.message}</span>
            </span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tokens.color.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <CollectorGist>{successToastDescriptor.text_snippet || "已保存的 Threads 貼文"}</CollectorGist>
          <CollectorMetricStrip descriptor={successToastDescriptor} marker="success" />
        </div>
      ) : displayToast ? (
        <div
          data-dlens-control="true"
          style={{
            position: "fixed",
            right: 24,
            top: popupOpen ? 84 : 80,
            zIndex: 2147483647,
            padding: "10px 16px",
            borderRadius: TOKENS.pillRadius,
            background: displayToast.kind === "queued" ? TOKENS.queuedSoft : TOKENS.successSoft,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${displayToast.kind === "queued" ? tokens.color.queuedBorder : tokens.color.successBorder}`,
            color: displayToast.kind === "queued" ? TOKENS.queued : TOKENS.success,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.45,
            maxWidth: 360,
            boxShadow: TOKENS.hudGlow,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            animation: "dlens-slide-in 200ms cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            {displayToast.kind === "saved" ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 2v10l4 2" />}
          </svg>
          {displayToast.message}
        </div>
      ) : null}
    </>
  );
}

export const inPageCollectorOverlaysTestables = {
  renderFlashPreviewCard: (props: FlashPreviewCardProps) => <FlashPreviewCard {...props} />
};
