import { useLayoutEffect, useRef, type RefObject } from "react";

import { planCausalListTransitions, type MotionLayoutPoint } from "./motion";
import { tokens } from "./tokens";
import { settleWorkspacePresenceTree } from "./useWorkspaceScrollMotion";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function durationMs(value: string): number {
  return Number.parseFloat(value) || 0;
}

function directMotionChildren(container: HTMLElement): HTMLElement[] {
  return Array.from(container.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute("data-dlens-list-key")
  );
}

function readLayout(children: HTMLElement[]): Map<string, MotionLayoutPoint> {
  const layout = new Map<string, MotionLayoutPoint>();
  for (const child of children) {
    const key = child.getAttribute("data-dlens-list-key");
    if (!key) continue;
    layout.set(key, {
      left: child.offsetLeft,
      top: child.offsetTop
    });
  }
  return layout;
}

/**
 * Animate only real list derivations (filter, reorder, expand/collapse).
 * Initial render is still; JS explicitly honours reduced motion because the
 * CSS safety net cannot cancel a Web Animations API call reliably.
 */
export function useCausalListMotion(dependency: string): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousLayoutRef = useRef<Map<string, MotionLayoutPoint>>(new Map());
  const hasMeasuredLayoutRef = useRef(false);
  const activeAnimationsRef = useRef<WeakMap<HTMLElement, Animation>>(new WeakMap());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const children = directMotionChildren(container);
    for (const child of children) {
      const activeAnimation = activeAnimationsRef.current.get(child);
      if (!activeAnimation) continue;
      activeAnimation.cancel();
      activeAnimationsRef.current.delete(child);
    }
    // offsetLeft/offsetTop describe layout position without hover transforms or
    // an in-flight WAAPI translate leaking into the next FLIP measurement.
    const currentLayout = readLayout(children);
    if (!hasMeasuredLayoutRef.current) {
      hasMeasuredLayoutRef.current = true;
      previousLayoutRef.current = currentLayout;
      return;
    }
    // Initial presence is allowed, but a real filter/reorder owns every direct
    // child (and any marked card inside it) before FLIP starts.
    children.forEach(settleWorkspacePresenceTree);
    const transitions = planCausalListTransitions(previousLayoutRef.current, currentLayout);
    previousLayoutRef.current = currentLayout;

    const reduceMotion = typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia(REDUCED_MOTION_QUERY).matches;
    if (reduceMotion) return;

    const childByKey = new Map(children.map((child) => [child.getAttribute("data-dlens-list-key")!, child]));
    for (const transition of transitions) {
      const child = childByKey.get(transition.key);
      if (!child || typeof child.animate !== "function") continue;

      const keyframes: Keyframe[] = transition.kind === "move"
        ? [
            { translate: `${transition.deltaX}px ${transition.deltaY}px` },
            { translate: "0px 0px" }
          ]
        : [
            { translate: `0px ${tokens.spacing.xs}px`, opacity: 0 },
            { translate: "0px 0px", opacity: 1 }
          ];
      const animation = child.animate(keyframes, {
        duration: durationMs(tokens.motion.duration.slow),
        easing: tokens.motion.easing.springSoft
      });
      animation.id = "dlens-causal-list";
      activeAnimationsRef.current.set(child, animation);
    }
  }, [dependency]);

  return containerRef;
}
