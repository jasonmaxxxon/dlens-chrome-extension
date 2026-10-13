import { tokens } from "./tokens";

/** Single keyframe owner for the side panel readers and Threads collection controls.
 * Registry injection is idempotent; all DLens motion shares the scoped reduced-motion guard.
 */
export const DLENS_KEYFRAMES_CSS = `
@media (prefers-reduced-motion: no-preference) {
  [data-deep-skeleton], [data-topic-reading-skeleton] { animation: dlens-card-shimmer ${tokens.motion.collectCard.shimmerMs}ms linear infinite; }
}

@keyframes dlens-collection-rise { from { opacity: 0; transform: translateY(${tokens.motion.collection.risePx}px); } to { opacity: 1; transform: none; } }
@keyframes dlens-collection-fold { from { grid-template-rows: 1fr; opacity: 1; } to { grid-template-rows: 0fr; opacity: 0; } }
@keyframes dlens-collection-glide { from { transform: translateY(var(--collection-delta)); } to { transform: none; } }
@keyframes dlens-collection-image { from { opacity: 0; } to { opacity: 1; } }
@keyframes dlens-collection-mist { to { transform: translate(${tokens.motion.collection.mistX}px, ${tokens.motion.collection.mistY}px); } }

@keyframes dlens-collect-topic-fan { from { opacity: 0; transform: scale(${tokens.motion.collectWheel.topicScale}); } to { opacity: 1; transform: scale(1); } }
@keyframes dlens-collect-topic-label { from { opacity: 0; } to { opacity: 1; } }
@keyframes dlens-collect-charge { from { --dlens-collect-charge: 0%; } to { --dlens-collect-charge: 100%; } }
@keyframes dlens-collect-spin { to { transform: rotate(1turn); } }
@keyframes dlens-collect-burst {
  from { transform: scale(${tokens.motion.collectWheel.burstStartScale}); opacity: ${tokens.motion.collectWheel.burstOpacity}; }
  to { transform: scale(${tokens.motion.collectWheel.burstEndScale}); opacity: 0; }
}
@keyframes dlens-collect-pop {
  0% { transform: scale(1); }
  ${tokens.motion.collectWheel.popDipAt}% { transform: scale(${tokens.motion.collectWheel.popDipScale}); }
  ${tokens.motion.collectWheel.popPeakAt}% { transform: scale(${tokens.motion.collectWheel.popPeakScale}); }
  100% { transform: scale(1); }
}
@keyframes dlens-card-return { 25% { background: color-mix(in srgb, var(--acc) ${tokens.motion.collectCard.returnTint}%, ${tokens.collectCard.wash}); } }
@keyframes dlens-card-in { from { opacity: 0; transform: translateY(-${tokens.motion.collectCard.enterOffset}px); } to { opacity: 1; transform: none; } }
@keyframes dlens-card-fresh { from { opacity: 0; transform: translateY(${tokens.motion.collectCard.freshOffset}px); } to { opacity: 1; transform: none; } }
@keyframes dlens-card-breathe { 50% { box-shadow: 0 0 0 ${tokens.motion.collectCard.breatheSpread}px color-mix(in srgb, var(--acc) ${tokens.motion.collectCard.breatheTint}%, transparent); } }
@keyframes dlens-card-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@keyframes dlens-collect-chip-in {
  from { opacity: 0; transform: translateX(${tokens.motion.collectWheel.chipOffset}px) scale(${tokens.motion.collectWheel.chipScale}); }
  to { opacity: 1; transform: none; }
}
@keyframes dlens-popup-pulse {
  0%, 100% { opacity: 0.55; transform: scale(0.92); }
  50% { opacity: 1; transform: scale(1); }
}
@keyframes dlens-popup-indeterminate {
  0% { transform: translateX(-115%); }
  100% { transform: translateX(240%); }
}
@keyframes dlens-success-pop {
  0% { opacity: 0.75; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.14); }
  100% { opacity: 0.9; transform: scale(1); }
}
`;

/** Registered charge percentage interpolates the inline wheel's hold gesture. */
export const DLENS_PROPERTY_CSS = `
@property --dlens-collect-charge { syntax: '<percentage>'; inherits: false; initial-value: 0%; }
`;

export const DLENS_ATTENTION_CSS = `[data-attention-beam]{position:relative;box-sizing:border-box;width:100%;max-width:100%;min-width:0;overflow:hidden;isolation:isolate;padding:0;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:${tokens.radius.button}px}[data-attention-beam="generating"]{padding:1px 0;background:linear-gradient(90deg,${tokens.color.runningSoft},${tokens.color.surface},${tokens.color.runningSoft});box-shadow:inset 0 0 0 1px ${tokens.color.runningBorder}}[data-attention-beam="actionable"]{padding:1px 0;background:linear-gradient(90deg,var(--dlens-mode-accent-soft),${tokens.color.surface} 20%);box-shadow:inset 2px 0 var(--dlens-mode-accent)}[data-attention-beam-sweep="true"]::before{content:"";position:absolute;z-index:-1;inset:0 auto 0 -34%;width:34%;background:linear-gradient(90deg,transparent,${tokens.color.signalGlow},transparent);opacity:.82;animation:${tokens.motion.keyframes.indeterminate};pointer-events:none}[data-searching-orb="true"]{width:16px;height:16px;flex:0 0 16px;border-radius:${tokens.radius.round}px;box-shadow:0 0 14px ${tokens.color.signalGlow}}`;


/**
 * Reduced-motion safety net, injected alongside the keyframe registry into every
 * DLens surface (Threads controls and side panel readers). Scoped to
 * `[data-dlens-control="true"]` so it never touches the host page's own animations.
 * This is the guarantee behind the contract "all motion keeps a prefers-reduced-motion
 * guard": individual `animation:` callsites no longer each need their own media query —
 * the registry neutralises them wherever it lands.
 */
export const DLENS_REDUCED_MOTION_CSS = `
@media (prefers-reduced-motion: reduce) {
  [data-dlens-control="true"],
  [data-dlens-control="true"] *,
  [data-dlens-control="true"] *::before,
  [data-dlens-control="true"] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    animation-delay: 0ms !important;
    transition-duration: 0.01ms !important;
  }
  [data-dlens-control="true"] [data-searching-orb="true"] {
    animation: none !important;
  }
  [data-dlens-control="true"] [data-attention-beam-sweep="true"]::before {
    animation: none !important;
    display: none !important;
    transform: none !important;
  }

}
`;

/** Single guard id for the shared keyframe registry — see `ensureDlensKeyframes`. */
export const DLENS_KEYFRAMES_STYLE_ID = "__dlens_keyframes__";

/**
 * Idempotent injector for the keyframe registry + reduced-motion safety net.
 * Each mount context (Threads content script and side panel) calls this; the shared guard id means the registry lands exactly once per
 * document no matter which context renders first. Previously the content script and
 * the popup hook injected the same registry under two different ids, so a Threads page
 * carried two copies.
 */
export function ensureDlensKeyframes(doc: Document = document): void {
  if (doc.getElementById(DLENS_KEYFRAMES_STYLE_ID)) {
    return;
  }
  const style = doc.createElement("style");
  style.id = DLENS_KEYFRAMES_STYLE_ID;
  style.textContent = DLENS_PROPERTY_CSS + DLENS_KEYFRAMES_CSS + DLENS_ATTENTION_CSS + DLENS_REDUCED_MOTION_CSS;
  doc.head.appendChild(style);
}

/* Shared motion layer — injected globally by the threads content script.
 * Applies across every workspace mode; classes are opt-in so unstyled
 * elements are unaffected. `prefers-reduced-motion` neutralises all of it. */
export const DLENS_MOTION_CSS = `
[data-collection-workspace-shell] [data-collection-search] { background: ${tokens.collection.wash}; }
[data-collection-workspace-shell] [data-collection-search]:focus-within { background: ${tokens.color.elevated}; box-shadow: ${tokens.collection.focusShadow}; }
[data-collection-workspace-shell] [data-collection-post]:hover { background: ${tokens.collection.hover} !important; }
[data-collection-row] + [data-collection-row] [data-collection-post]::before { content: ""; position: absolute; top: 0; left: ${tokens.layout.collectionThumbnailSize + tokens.spacing.md + tokens.spacing.sm}px; right: ${tokens.spacing.sm}px; height: ${tokens.collection.indicatorHeight / 2}px; background: ${tokens.collection.hairline}; }
[data-collection-row]:hover [data-collection-post]::before,
[data-collection-row]:hover + [data-collection-row] [data-collection-post]::before { opacity: 0; }
@media (prefers-reduced-motion: no-preference) {
  [data-collection-workspace-shell] [data-collection-arrival] { animation: dlens-collection-rise ${tokens.motion.collection.riseMs}ms ${tokens.motion.easing.entrance} var(--collection-delay, 0ms) backwards; }
  [data-reading-arrival] { animation: dlens-collection-rise ${tokens.motion.collection.riseMs}ms ${tokens.motion.easing.entrance} backwards; }
  [data-collection-state="arc"], [data-discourse-arc] { animation: dlens-collect-spin ${tokens.motion.collectWheel.spinMs}ms linear infinite; }
  [data-collection-row][data-collection-glide] { animation: dlens-collection-glide ${tokens.motion.collection.glideMs}ms ${tokens.motion.easing.entrance} backwards; }
  [data-collection-row][data-collection-exiting="true"] { animation: dlens-collection-fold ${tokens.motion.collection.foldMs}ms ${tokens.motion.easing.exit} forwards; }
  [data-collection-tab-indicator], [data-collection-sort-knob] { transition: transform ${tokens.motion.duration.slower} ${tokens.motion.easing.entrance}; }
  [data-collection-workspace-shell] [data-collection-post], [data-collection-workspace-shell] [data-workspace-card] { transition: transform ${tokens.motion.duration.base} ${tokens.motion.easing.entrance}, background ${tokens.motion.duration.base} ${tokens.motion.easing.standard}, box-shadow ${tokens.motion.duration.base} ${tokens.motion.easing.standard}; }
  [data-collection-workspace-shell] [data-collection-post]:hover, [data-collection-workspace-shell] [data-workspace-card]:hover { transform: translateY(${tokens.collection.rowLift}px); }
  [data-collection-workspace-shell] [data-workspace-card]:hover { box-shadow: ${tokens.shadow.card}; }
  [data-collection-workspace-shell] [data-workspace-card]:active { transform: scale(${tokens.collection.cardPress}); transition-duration: ${tokens.motion.duration.instant}; }
  [data-collection-search] { transition: background ${tokens.motion.duration.base} ${tokens.motion.easing.standard}, box-shadow ${tokens.motion.duration.slow} ${tokens.motion.easing.entrance}; }
  [data-collection-image-loaded="false"] { opacity: 0; }
  [data-collection-image-loaded="true"] { animation: dlens-collection-image ${tokens.motion.collection.fadeMs}ms ${tokens.motion.easing.entrance} backwards; }
  [data-collection-mist] { animation: dlens-collection-mist ${tokens.motion.collection.mistMs}ms ${tokens.motion.easing.standard} infinite alternate; }
}
[data-dlens-control="true"] .dlens-card-lift {
  transition: ${tokens.motion.preset.cardLift};
  will-change: transform;
  transform: ${tokens.motion.transform.cardRest};
}
[data-dlens-control="true"] .dlens-card-lift:hover,
[data-dlens-control="true"] .dlens-card-lift:focus-within {
  transform: ${tokens.motion.transform.cardHover};
  box-shadow: ${tokens.shadow.cardLiftHover} !important;
  border-color: ${tokens.color.lineHover} !important;
}
[data-dlens-control="true"] .dlens-card-lift:active {
  transform: ${tokens.motion.transform.cardPress};
  transition: transform 90ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-tactile-row {
  transform: ${tokens.motion.transform.rowRest};
  transition: transform ${tokens.motion.duration.base} ${tokens.motion.easing.springSoft}, background-color ${tokens.motion.duration.fast} ${tokens.motion.easing.standard}, box-shadow ${tokens.motion.duration.base} ${tokens.motion.easing.springSoft}, border-color ${tokens.motion.duration.fast} ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-tactile-row:hover,
[data-dlens-control="true"] .dlens-tactile-row:focus-visible {
  transform: ${tokens.motion.transform.rowHover};
  box-shadow: ${tokens.shadow.cardLiftHover} !important;
  border-color: ${tokens.color.lineHover} !important;
}
[data-dlens-control="true"] .dlens-tactile-row:active {
  transform: ${tokens.motion.transform.rowPress};
  transition: transform 90ms ${tokens.motion.easing.standard};
}
@media (prefers-reduced-motion: reduce) {
  [data-dlens-control="true"] .dlens-card-lift,
  [data-dlens-control="true"] .dlens-tactile-row {
    transition: none !important;
  }
  [data-dlens-control="true"] .dlens-card-lift:hover,
  [data-dlens-control="true"] .dlens-card-lift:focus-within,
  [data-dlens-control="true"] .dlens-card-lift:active,
  [data-dlens-control="true"] .dlens-tactile-row:hover,
  [data-dlens-control="true"] .dlens-tactile-row:focus-visible,
  [data-dlens-control="true"] .dlens-tactile-row:active {
    transform: none !important;
  }

}
`;
