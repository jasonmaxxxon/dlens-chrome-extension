import { PrimaryButton, SecondaryButton, TOKENS, lineClamp, surfaceCardStyle } from "./components";
import { flashPreviewAvatar, flashPreviewMetrics } from "./inpage-helpers";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";

export function InPageCollectorOverlays({ app }: { app: InPageCollectorAppModel }) {
  const { snapshot, tabId, hoverRect, hoverSaved, flashPreview, flashStyle, displayToast, preview, popupOpen } = app;

  return (
    <>
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
            ? `linear-gradient(135deg, ${TOKENS.accent}, ${TOKENS.accentMid})`
            : TOKENS.glassBg,
          backdropFilter: TOKENS.glassBlur,
          WebkitBackdropFilter: TOKENS.glassBlur,
          boxShadow: popupOpen
            ? `0 8px 24px ${TOKENS.accentGlow}`
            : "0 4px 16px rgba(0,0,0,0.12)",
          color: popupOpen ? "#fff" : TOKENS.accent,
          fontSize: 22,
          fontWeight: 700,
          zIndex: 2147483640,
          cursor: "pointer",
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
            background: "rgba(15,23,42,0.88)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.02em",
            boxShadow: "0 12px 40px rgba(15,23,42,0.28)",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: TOKENS.accentMid, display: "inline-block", animation: "dlens-pulse 2s ease-in-out infinite" }} />
          Hover to preview
          <span style={{ opacity: 0.4 }}>|</span>
          <kbd style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.15)", fontSize: 11 }}>S</kbd> save
          <span style={{ opacity: 0.4 }}>|</span>
          <kbd style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.15)", fontSize: 11 }}>Esc</kbd> exit
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
            background: hoverSaved ? "rgba(5,150,105,0.12)" : "rgba(99,102,241,0.12)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${hoverSaved ? "rgba(5,150,105,0.25)" : "rgba(99,102,241,0.25)"}`,
            color: hoverSaved ? TOKENS.success : TOKENS.accent,
            fontSize: 11,
            fontWeight: 700,
            boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
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

      {snapshot?.tab.selectionMode && flashPreview && flashStyle ? (
        <div data-dlens-control="true" style={flashStyle}>
          <div style={surfaceCardStyle({ padding: 12, display: "grid", gap: 10 })}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${TOKENS.accent}, ${TOKENS.accentMid})`,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                  fontSize: 14,
                  flexShrink: 0
                }}
              >
                {flashPreviewAvatar(flashPreview.author_hint)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{flashPreview.author_hint || "Unknown author"}</div>
                <div style={{ fontSize: 12, color: TOKENS.subInk, ...lineClamp(2) }}>{flashPreview.text_snippet || "No snippet"}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{flashPreviewMetrics(flashPreview)}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <PrimaryButton onClick={() => void app.onSavePreview()}>
                {hoverSaved ? "Saved" : "Save"}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  if (!flashPreview.post_url) {
                    return;
                  }
                  window.open(flashPreview.post_url, "_blank", "noopener,noreferrer");
                }}
              >
                Open
              </SecondaryButton>
            </div>
          </div>
        </div>
      ) : null}

      {displayToast ? (
        <div
          data-dlens-control="true"
          style={{
            position: "fixed",
            right: 24,
            top: popupOpen ? 84 : 80,
            zIndex: 2147483647,
            padding: "10px 16px",
            borderRadius: TOKENS.pillRadius,
            background: displayToast.kind === "queued" ? "rgba(217,119,6,0.1)" : "rgba(5,150,105,0.1)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${displayToast.kind === "queued" ? "rgba(217,119,6,0.2)" : "rgba(5,150,105,0.2)"}`,
            color: displayToast.kind === "queued" ? TOKENS.queued : TOKENS.success,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.45,
            maxWidth: 360,
            boxShadow: "0 8px 24px rgba(15,23,42,0.1)",
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
