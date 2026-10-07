import { TOKENS } from "./components";
import { CollectorGist, CollectorMetricStrip, COLLECTOR_MOTION_CSS } from "./CollectorMetricStrip";
import { modeThemes, tokens } from "./tokens";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";

const ARCHIVE_MODE_THEME = modeThemes.archive;
const MODE_ACCENT = `var(--dlens-mode-accent, ${ARCHIVE_MODE_THEME.accent})`;
const MODE_ACCENT_MID = `var(--dlens-mode-accent-mid, ${ARCHIVE_MODE_THEME.accentMid})`;
const MODE_ACCENT_GLOW = `var(--dlens-mode-accent-glow, ${ARCHIVE_MODE_THEME.accentGlow})`;

/** The undo affordance inside the save toast. It lives for the toast's 5-second
 *  window only — there is no persistent inline control on the collection list. */
function UndoSaveAction({ onUndo }: { onUndo: () => void }) {
  return (
    <button
      type="button"
      data-collector-undo-save="true"
      onClick={onUndo}
      style={{
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.elevated,
        borderRadius: TOKENS.pillRadius,
        padding: "3px 10px",
        marginLeft: "auto",
        cursor: "pointer",
        fontFamily: tokens.font.sans,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.45,
        color: tokens.color.subInk,
        whiteSpace: "nowrap",
        pointerEvents: "auto"
      }}
    >
      復原
    </button>
  );
}

export function InPageCollectorOverlays({ app }: { app: InPageCollectorAppModel }) {
  const { displayToast, successToastDescriptor, pendingUndoSave, popupOpen } = app;

  const undoSaveAction = pendingUndoSave && displayToast?.kind === "saved"
    ? <UndoSaveAction onUndo={() => void app.onUndoSave()} />
    : null;
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
            {undoSaveAction ?? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tokens.color.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
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
          {undoSaveAction}
        </div>
      ) : null}
    </>
  );
}
