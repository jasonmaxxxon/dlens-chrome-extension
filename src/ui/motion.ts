import { tokens } from "./tokens";

/**
 * Single owner for DLens motion.
 *
 * Every `@keyframes` definition lives in `DLENS_KEYFRAMES_CSS` and is injected
 * once per mount context (threads overlay, in-page collector, audit-report
 * page) so animations resolve identically everywhere. Previously keyframes were
 * split across `threads.content.ts`, `usePopupKeyframes.ts`, `components.tsx`
 * and `topic-audit-components.tsx`; `dlens-success-pulse` was defined twice
 * under one name (a box-shadow ring in the overlay, a scale pop in the popup),
 * so whichever `<style>` loaded last won. The two animations are now distinct:
 * `dlens-success-ring` (row filed-flash) and `dlens-success-pop` (collector dot).
 *
 * Ownership contract (enforced by tests/motion-registry.test.ts): every DLens
 * `@keyframes` lives in this string and nowhere else. The Signal Atlas drift/pulse
 * used to define its own keyframes inline in TopicDetailView; they now live here so
 * "single owner" is literally true.
 */
export const DLENS_KEYFRAMES_CSS = `
@keyframes dlens-slide-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes dlens-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@keyframes dlens-bump {
  0% { transform: scale(1); }
  32% { transform: scale(1.34); }
  62% { transform: scale(0.94); }
  100% { transform: scale(1); }
}
@keyframes dlens-success-ring {
  0% { box-shadow: 0 0 0 0 transparent; }
  16% { box-shadow: 0 0 0 6px ${tokens.color.successFlashStrong}; }
  40% { box-shadow: 0 0 0 0 transparent; }
  58% { box-shadow: 0 0 0 5px ${tokens.color.successFlashSoft}; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes dlens-popup-pulse {
  0%, 100% { opacity: 0.55; transform: scale(0.92); }
  50% { opacity: 1; transform: scale(1); }
}
@keyframes dlens-popup-shimmer {
  0% { background-position: 200% 50%; }
  100% { background-position: -200% 50%; }
}
@keyframes dlens-popup-indeterminate {
  0% { transform: translateX(-115%); }
  100% { transform: translateX(240%); }
}
@keyframes dlens-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes dlens-success-pop {
  0% { opacity: 0.75; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.14); }
  100% { opacity: 0.9; transform: scale(1); }
}
@keyframes dlens-mode-swap-in {
  0% { opacity: 0.45; transform: translateY(2px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes dlens-product-stage-forward-in {
  from { transform: translateX(${tokens.motion.presence.cardRisePx}px); }
  to { transform: translateX(0); }
}
@keyframes dlens-product-stage-backward-in {
  from { transform: translateX(-${tokens.motion.presence.cardRisePx}px); }
  to { transform: translateX(0); }
}
@keyframes dlens-product-reading-beam {
  from { --dlens-reading-beam-angle: 42deg; }
  to { --dlens-reading-beam-angle: 402deg; }
}
@keyframes dlens-product-reading-glow {
  from { --dlens-reading-beam-glow: 0; }
  to { --dlens-reading-beam-glow: 1; }
}
@keyframes dlens-product-reading-hue {
  0%, 100% { filter: hue-rotate(-30deg) brightness(1.30) saturate(1.50); }
  50% { filter: hue-rotate(30deg) brightness(1.30) saturate(1.50); }
}
@keyframes dlens-source-row-pulse {
  0%, 100% { box-shadow: 0 0 0 3px ${tokens.color.queuedBorder}; }
  50%      { box-shadow: 0 0 0 6px ${tokens.color.queuedWash}; }
}
@keyframes dlens-atlas-aura-drift {
  from { transform: translate(0, 0) scale(1); }
  to { transform: translate(-18px, 14px) scale(1.08); }
}
@keyframes dlens-atlas-dot-pulse {
  from { opacity: 0.72; }
  to { opacity: 1; }
}
`;

/**
 * Custom properties the beam animates. An unregistered custom property is not
 * interpolable — Chrome flips it discretely at the halfway point, so the
 * Product reading beam rendered as a frozen segment that jumped once per cycle
 * instead of orbiting the card. `@property` gives the angle/number a syntax so
 * the keyframes actually tween. Registration is document-global, which is why
 * it ships with the registry injector rather than any one surface.
 */
export const DLENS_PROPERTY_CSS = `
@property --dlens-reading-beam-angle {
  syntax: "<angle>";
  initial-value: 42deg;
  inherits: true;
}
@property --dlens-reading-beam-glow {
  syntax: "<number>";
  initial-value: 0;
  inherits: true;
}
`;

/* ─── Reading Beam (ported from docs/mockups/2026-07-23-product-action-deep-reading-orb-beam.html) ───
 *
 * Nine light sources sit around the card, a rotating conic mask reveals only the
 * arc currently sweeping past them, and three stacked layers separate the crisp
 * 1px edge (::after), the soft inner wash (::before), and the blurred halo
 * (the bloom span). Geometry, stop positions, the 1.96s spin, and the 12s hue
 * cycle are the mockup's; only the colour VALUES moved into tokens.ts.
 */
const BEAM_LIGHTS = [
  `radial-gradient(ellipse 70px 40px at 33% -7.4%,${tokens.color.beamRose},transparent)`,
  `radial-gradient(ellipse 60px 35px at 12% -5%,${tokens.color.beamAzure},transparent)`,
  `radial-gradient(ellipse 40px 70px at 2.1% 68.3%,${tokens.color.beamJade},transparent)`,
  `radial-gradient(ellipse 20px 35px at 2.1% 68.3%,${tokens.color.beamTeal},transparent)`,
  `radial-gradient(ellipse 180px 32px at 74.4% 100%,${tokens.color.beamIndigo},transparent)`,
  `radial-gradient(ellipse 85px 26px at 55% 100%,${tokens.color.beamAzure},transparent)`,
  `radial-gradient(ellipse 74px 32px at 93.9% 0%,${tokens.color.beamAmber},transparent)`,
  `radial-gradient(ellipse 26px 42px at 100% 27.1%,${tokens.color.beamMagenta},transparent)`,
  `radial-gradient(ellipse 52px 48px at 100% 27.1%,${tokens.color.beamViolet},transparent)`
].join(",");

/** Ink at a given alpha — the mockup's black beam-core stops, routed through tokens. */
const beamInk = (percent: number) => `color-mix(in srgb,${tokens.color.ink} ${percent}%,transparent)`;
/** Mask luminance at a given alpha — the mockup's white taper stops. */
const beamMask = (percent: number) => `color-mix(in srgb,${tokens.color.elevated} ${percent}%,transparent)`;

const BEAM_CORE = `conic-gradient(from var(--dlens-reading-beam-angle),transparent 0%,transparent 54%,${beamInk(8)} 57%,${beamInk(20)} 60%,${beamInk(40)} 63%,${beamInk(55)} 66%,${beamInk(40)} 69%,${beamInk(20)} 72%,${beamInk(8)} 75%,transparent 78%,transparent 100%)`;
const BEAM_BLOOM_CORE = `conic-gradient(from var(--dlens-reading-beam-angle),transparent 0%,transparent 58%,${beamInk(2)} 62%,${beamInk(8)} 65%,${beamInk(20)} 67%,${beamInk(40)} 69%,${beamInk(60)} 70%,${beamInk(60)} 70.5%,${beamInk(40)} 71.5%,${beamInk(20)} 73%,${beamInk(8)} 75%,${beamInk(2)} 78%,transparent 82%)`;
/** The rotating window: only the arc under this taper is lit. */
const BEAM_SWEEP_MASK = `conic-gradient(from var(--dlens-reading-beam-angle),transparent 0%,transparent 30%,${beamMask(10)} 36%,${beamMask(35)} 44%,${tokens.color.elevated} 52%,${tokens.color.elevated} 80%,${beamMask(35)} 86%,${beamMask(10)} 92%,transparent 95%,transparent 100%)`;
const BEAM_EDGE_FADE = `linear-gradient(${tokens.color.elevated},transparent 28px,transparent calc(100% - 28px),${tokens.color.elevated}),linear-gradient(to right,${tokens.color.elevated},transparent 28px,transparent calc(100% - 28px),${tokens.color.elevated})`;
const BEAM_RING_MASK = `linear-gradient(${tokens.color.ink} 0 0) content-box,linear-gradient(${tokens.color.ink} 0 0)`;

const READING_BEAM_CSS = `[data-product-reading-beam]{box-sizing:border-box;max-width:100%;min-width:0;overflow:hidden;isolation:isolate;--dlens-reading-beam-angle:42deg}`
  + `[data-product-reading-beam="generating"]{animation:dlens-product-reading-beam 1960ms linear infinite,dlens-product-reading-glow 600ms ease forwards}`
  + `[data-product-reading-beam="generating"]::after{content:"";position:absolute;z-index:3;inset:0;padding:1px;border-radius:inherit;pointer-events:none;background:${BEAM_CORE},${BEAM_LIGHTS};-webkit-mask:${BEAM_SWEEP_MASK},${BEAM_RING_MASK};-webkit-mask-composite:source-in,xor;mask:${BEAM_SWEEP_MASK},${BEAM_RING_MASK};mask-composite:intersect,exclude;box-shadow:none;opacity:calc(var(--dlens-reading-beam-glow) * .12);animation:dlens-product-reading-hue 12s ease-in-out infinite}`
  + `[data-product-reading-beam="generating"]::before{content:"";position:absolute;z-index:2;inset:0;border-radius:inherit;pointer-events:none;background:${BEAM_LIGHTS};box-shadow:inset 0 0 9px 1px ${tokens.color.beamShade};-webkit-mask-image:${BEAM_SWEEP_MASK},${BEAM_EDGE_FADE};-webkit-mask-composite:source-in,source-over;mask-image:${BEAM_SWEEP_MASK},${BEAM_EDGE_FADE};mask-composite:intersect,add;opacity:calc(var(--dlens-reading-beam-glow) * .12);animation:dlens-product-reading-hue 12s ease-in-out infinite}`
  /* Two-attribute selectors so the bloom outranks the generic
   * `[data-attention-surface="true"]>*` stacking rule that follows it. */
  + `[data-attention-surface="true"] [data-attention-bloom="true"]{display:none;position:absolute;z-index:4;inset:0;padding:1px;border-radius:inherit;pointer-events:none;background:${BEAM_BLOOM_CORE};-webkit-mask:${BEAM_RING_MASK};-webkit-mask-composite:xor;mask:${BEAM_RING_MASK};mask-composite:exclude;filter:blur(8px) brightness(1.30) saturate(1.50)}`
  + `[data-attention-surface="true"][data-product-reading-beam="generating"] [data-attention-bloom="true"]{display:block;opacity:calc(var(--dlens-reading-beam-glow) * .34)}`;

export const DLENS_ATTENTION_CSS = `[data-attention-beam],[data-attention-surface="true"]{position:relative;box-sizing:border-box;width:100%;max-width:100%;min-width:0;overflow:hidden;isolation:isolate;padding:0}[data-attention-beam]{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:${tokens.radius.button}px}[data-attention-beam="generating"]{padding:1px 0;background:linear-gradient(90deg,${tokens.color.runningSoft},${tokens.color.surface},${tokens.color.runningSoft});box-shadow:inset 0 0 0 1px ${tokens.color.runningBorder}}[data-attention-beam="actionable"]{padding:1px 0;background:linear-gradient(90deg,var(--dlens-mode-accent-soft),${tokens.color.surface} 20%);box-shadow:inset 2px 0 var(--dlens-mode-accent)}[data-attention-beam-sweep="true"]::before{content:"";position:absolute;z-index:-1;inset:0 auto 0 -34%;width:34%;background:linear-gradient(90deg,transparent,${tokens.color.signalGlow},transparent);opacity:.82;animation:${tokens.motion.keyframes.indeterminate};pointer-events:none}${READING_BEAM_CSS}[data-searching-orb="true"]{width:16px;height:16px;flex:0 0 16px;border-radius:${tokens.radius.round}px;box-shadow:0 0 14px ${tokens.color.signalGlow}}[data-attention-surface="true"]{display:grid;border-radius:${tokens.radius.cardLg}px;align-items:stretch;justify-content:stretch;gap:inherit}[data-attention-surface="true"]>*{position:relative;z-index:1}[data-attention-surface="true"][data-attention-beam-sweep="true"]::before{z-index:0}[data-attention-surface="true"][data-attention-beam="actionable"]::after{content:"";position:absolute;z-index:2;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px var(--dlens-mode-accent);opacity:.58;pointer-events:none}[data-attention-surface="true"][data-attention-beam="actionable"]{padding:0;box-shadow:none}`;

/**
 * Reduced-motion safety net, injected alongside the keyframe registry into every
 * DLens surface (threads overlay, in-page collector, audit-report page). Scoped to
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
  [data-dlens-control="true"] [data-product-reading-beam] {
    animation: none !important;
    --dlens-reading-beam-angle: 42deg;
    --dlens-reading-beam-glow: 1;
  }
  [data-dlens-control="true"] [data-product-reading-beam]::after {
    animation: none !important;
    filter: none !important;
    --dlens-reading-beam-angle: 42deg;
  }
  [data-dlens-control="true"] [data-product-reading-beam]::before {
    animation: none !important;
    display: none !important;
  }
}
`;

/** Single guard id for the shared keyframe registry — see `ensureDlensKeyframes`. */
export const DLENS_KEYFRAMES_STYLE_ID = "__dlens_keyframes__";

/**
 * Idempotent injector for the keyframe registry + reduced-motion safety net.
 * Every mount context (threads content script, in-page collector popup, audit-report
 * page) calls this; the shared guard id means the registry lands exactly once per
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

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const WORKSPACE_SCROLL_VIEWPORT_SELECTOR = '[data-workspace-popup-scroll="viewport"]';

export type MatchMediaLike = (query: string) => Pick<MediaQueryList, "matches">;

/** Resolve scrolling motion from an injected media matcher so the policy is testable. */
export function resolveMotionScrollBehavior(matchMedia?: MatchMediaLike): ScrollBehavior {
  return matchMedia?.(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
}

/** Keep Compare navigation inside DLens; only standalone renders scroll the host window. */
export function scrollWorkspaceViewportToTop(
  queryRoot: Pick<Document, "querySelector">,
  fallbackTarget: Pick<Window, "scrollTo">,
  behavior: ScrollBehavior
): "workspace" | "fallback" {
  const workspaceViewport = queryRoot.querySelector<HTMLElement>(WORKSPACE_SCROLL_VIEWPORT_SELECTOR);
  if (workspaceViewport) {
    workspaceViewport.scrollTo({ top: 0, behavior });
    return "workspace";
  }
  fallbackTarget.scrollTo({ top: 0, behavior });
  return "fallback";
}

export interface MotionLayoutPoint {
  left: number;
  top: number;
}

export interface CausalListTransition {
  key: string;
  kind: "move" | "enter";
  deltaX: number;
  deltaY: number;
}

/**
 * Build a FLIP-style transition plan from two derived list layouts.
 *
 * Retained rows move from their old coordinates and newly-derived rows receive
 * a short state-change entrance. First-paint suppression belongs to the hook,
 * because an empty previous layout can also be a real filter result. This is
 * deliberately driven by list state, never by viewport intersection or scrolling.
 */
export function planCausalListTransitions(
  previous: ReadonlyMap<string, MotionLayoutPoint>,
  current: ReadonlyMap<string, MotionLayoutPoint>
): CausalListTransition[] {
  const transitions: CausalListTransition[] = [];
  for (const [key, point] of current) {
    const prior = previous.get(key);
    if (!prior) {
      transitions.push({ key, kind: "enter", deltaX: 0, deltaY: 0 });
      continue;
    }
    const deltaX = prior.left - point.left;
    const deltaY = prior.top - point.top;
    if (deltaX !== 0 || deltaY !== 0) {
      transitions.push({ key, kind: "move", deltaX, deltaY });
    }
  }
  return transitions;
}

/* Shared motion layer — injected globally by the threads content script.
 * Applies across every workspace mode; classes are opt-in so unstyled
 * elements are unaffected. `prefers-reduced-motion` neutralises all of it. */
export const DLENS_MOTION_CSS = `
@media (prefers-reduced-motion: no-preference) {
  [data-dlens-control="true"] [data-product-action-stage][data-direction="forward"] {
    animation: dlens-product-stage-forward-in ${tokens.motion.duration.slow} ${tokens.motion.easing.entrance} both;
  }
  [data-dlens-control="true"] [data-product-action-stage][data-direction="backward"] {
    animation: dlens-product-stage-backward-in ${tokens.motion.duration.slow} ${tokens.motion.easing.entrance} both;
  }
}
[data-dlens-control="true"][data-workspace-popup-material] [data-shell-masthead="editorial"] {
  animation: dlens-mode-swap-in ${tokens.motion.duration.slow} ${tokens.motion.easing.entrance} backwards;
  animation-delay: ${tokens.motion.cascadeDelay.masthead};
}
[data-dlens-control="true"][data-workspace-popup-material] [data-shell-header="workspace"] {
  animation: dlens-mode-swap-in ${tokens.motion.duration.slow} ${tokens.motion.easing.entrance} backwards;
  animation-delay: ${tokens.motion.cascadeDelay.rail};
}
[data-dlens-control="true"][data-workspace-popup-material] [data-shell-main="workspace"] {
  animation: dlens-mode-swap-in ${tokens.motion.duration.slow} ${tokens.motion.easing.entrance} backwards;
  animation-delay: ${tokens.motion.cascadeDelay.main};
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
[data-dlens-control="true"] .dlens-atlas-distribution-row {
  transition: background-color ${tokens.motion.duration.fast} ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-atlas-distribution-row:hover,
[data-dlens-control="true"] .dlens-atlas-distribution-row:focus-visible {
  background: ${tokens.color.inkWash} !important;
}
[data-dlens-control="true"] .dlens-atlas-distribution-row:active {
  background: ${tokens.color.inkWashStrong} !important;
}
[data-dlens-control="true"] .dlens-expand-trigger {
  transition: background 120ms ${tokens.motion.easing.standard}, border-color 120ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-details-summary:hover .dlens-expand-trigger {
  background: ${tokens.color.inkWashStrong};
  border-color: ${tokens.color.lineStrong};
}
[data-dlens-control="true"] .dlens-details-summary:hover [data-evidence-source-toggle="true"] {
  background: ${tokens.color.productSoft} !important;
  border-color: ${tokens.color.product} !important;
}
[data-dlens-control="true"] .dlens-details-smooth {
  display: grid;
}
[data-dlens-control="true"] .dlens-details-summary {
  transition: color 140ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-details-summary:hover {
  color: ${tokens.color.ink};
}
[data-dlens-control="true"] .dlens-details-chevron {
  display: inline-block;
  transition: transform 220ms ${tokens.motion.easing.spring};
}
[data-dlens-control="true"] [data-dlens-details-open="true"] > .dlens-details-summary .dlens-details-chevron {
  transform: rotate(180deg);
}
[data-dlens-control="true"] .dlens-details-panel {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  overflow: hidden;
  transition: grid-template-rows 240ms ${tokens.motion.easing.entrance}, opacity 160ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-dlens-details-open="true"] > .dlens-details-panel {
  grid-template-rows: 1fr;
  opacity: 1;
}
[data-dlens-control="true"] .dlens-details-panel-inner {
  min-height: 0;
  overflow: hidden;
}
[data-dlens-control="true"] [data-rail-icon] {
  transition: transform 220ms ${tokens.motion.easing.springSoft};
  will-change: transform;
}
[data-dlens-control="true"] [data-mode-style="rail"]:hover [data-rail-icon] {
  transform: translateY(-2px);
}
[data-dlens-control="true"] [data-mode-style="rail"]:active [data-rail-icon] {
  transform: translateY(0) scale(0.86);
  transition: transform 90ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-verdict-filter-plate] {
  transition: transform ${tokens.motion.duration.slow} ${tokens.motion.easing.spring}, background-color ${tokens.motion.duration.base} ${tokens.motion.easing.standard}, border-color ${tokens.motion.duration.base} ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-verdict-tile-count] {
  transform: scale(1);
  transition: transform ${tokens.motion.duration.base} ${tokens.motion.easing.springSoft};
}
[data-dlens-control="true"] [data-verdict-tile]:hover [data-verdict-tile-count],
[data-dlens-control="true"] [data-verdict-tile][aria-pressed="true"] [data-verdict-tile-count] {
  transform: scale(1.1);
}
[data-dlens-control="true"] [data-verdict-tile]:active [data-verdict-tile-count] {
  transform: scale(0.96);
  transition: transform 90ms ${tokens.motion.easing.standard};
}
@media (prefers-reduced-motion: reduce) {
  [data-dlens-control="true"] [data-product-action-stage] {
    animation: none !important;
    transform: none !important;
  }
  [data-dlens-control="true"] [data-verdict-filter-plate],
  [data-dlens-control="true"] [data-verdict-tile-count] {
    transition: none !important;
  }
  [data-dlens-control="true"] [data-verdict-tile]:hover [data-verdict-tile-count],
  [data-dlens-control="true"] [data-verdict-tile][aria-pressed="true"] [data-verdict-tile-count],
  [data-dlens-control="true"] [data-verdict-tile]:active [data-verdict-tile-count] {
    transform: none !important;
  }
  [data-dlens-control="true"] .dlens-card-lift,
  [data-dlens-control="true"] .dlens-tactile-row,
  [data-dlens-control="true"] .dlens-atlas-distribution-row,
  [data-dlens-control="true"] .dlens-details-summary,
  [data-dlens-control="true"] .dlens-details-chevron,
  [data-dlens-control="true"] .dlens-details-panel,
  [data-dlens-control="true"] .dlens-expand-trigger,
  [data-dlens-control="true"] [data-rail-icon] {
    transition: none !important;
  }
  [data-dlens-control="true"] .dlens-card-lift:hover,
  [data-dlens-control="true"] .dlens-card-lift:focus-within,
  [data-dlens-control="true"] .dlens-card-lift:active,
  [data-dlens-control="true"] .dlens-tactile-row:hover,
  [data-dlens-control="true"] .dlens-tactile-row:focus-visible,
  [data-dlens-control="true"] .dlens-tactile-row:active,
  [data-dlens-control="true"] .dlens-details-summary:hover,
  [data-dlens-control="true"] [data-mode-style="rail"]:hover [data-rail-icon],
  [data-dlens-control="true"] [data-mode-style="rail"]:active [data-rail-icon] {
    transform: none !important;
  }
  [data-dlens-control="true"] [data-bump-number="true"],
  [data-dlens-control="true"] [data-signal-reading-filed-flash="true"],
  [data-dlens-control="true"] [data-signal-reading-compose-flash="true"] {
    animation: none !important;
  }
}
`;
