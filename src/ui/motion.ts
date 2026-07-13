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
 * `dlens-glow-border` and `dlens-scan` are currently unreferenced but retained
 * (pre-existing, removed by nobody's request).
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
@keyframes dlens-glow-border {
  0%, 100% { border-color: ${tokens.color.successFlashSoft}; }
  50% { border-color: ${tokens.color.successBorder}; }
}
@keyframes dlens-scan {
  0% { background-position: 0% 0%; }
  100% { background-position: 0% 100%; }
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
  style.textContent = DLENS_KEYFRAMES_CSS + DLENS_REDUCED_MOTION_CSS;
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
  transition: transform ${tokens.motion.duration.base} ${tokens.motion.easing.springSoft}, background-color ${tokens.motion.duration.fast} ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-tactile-row:hover,
[data-dlens-control="true"] .dlens-tactile-row:focus-visible {
  transform: ${tokens.motion.transform.rowHover};
}
[data-dlens-control="true"] .dlens-tactile-row:active {
  transform: ${tokens.motion.transform.rowPress};
  transition: transform 90ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-quote-row {
  transition: background 200ms ${tokens.motion.easing.standard};
  border-radius: 6px;
}
[data-dlens-control="true"] .dlens-quote-row:hover {
  background: ${tokens.color.inkWash};
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
  transition: transform 280ms ${tokens.motion.easing.spring}, background-color 220ms ${tokens.motion.easing.standard}, border-color 220ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-verdict-tile-count],
[data-dlens-control="true"] [data-verdict-tile-bar] {
  transition: transform 200ms ${tokens.motion.easing.springSoft}, background-color 220ms ${tokens.motion.easing.standard} 40ms;
}
[data-dlens-control="true"] [data-verdict-tile]:hover [data-verdict-tile-count] {
  transform: scale(1.1);
}
[data-dlens-control="true"] [data-verdict-tile]:active [data-verdict-tile-count] {
  transform: scale(0.96);
  transition: transform 90ms ${tokens.motion.easing.standard};
}
@media (prefers-reduced-motion: reduce) {
  [data-dlens-control="true"] [data-verdict-filter-plate],
  [data-dlens-control="true"] [data-verdict-tile-count],
  [data-dlens-control="true"] [data-verdict-tile-bar] {
    transition: none !important;
  }
  [data-dlens-control="true"] [data-verdict-tile]:hover [data-verdict-tile-count],
  [data-dlens-control="true"] [data-verdict-tile]:active [data-verdict-tile-count] {
    transform: none !important;
  }
  [data-dlens-control="true"] .dlens-card-lift,
  [data-dlens-control="true"] .dlens-tactile-row,
  [data-dlens-control="true"] .dlens-quote-row,
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
  [data-dlens-control="true"] [data-button-shimmer="true"] {
    animation: none !important;
    opacity: 0 !important;
  }
}
`;
