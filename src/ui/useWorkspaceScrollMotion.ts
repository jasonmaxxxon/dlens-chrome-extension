import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { tokens } from "./tokens";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PRESENCE_SELECTOR = '[data-dlens-presence="card"], [data-dlens-presence="row"]';
const PRESENCE_SETTLE_EVENT = "dlens:presence-settle";
const PRESENCE_ANIMATION_ID = "dlens-scroll-presence";
const CAUSAL_ANIMATION_ID = "dlens-causal-list";

type WorkspaceScrollMotionOptions = {
  active: boolean;
  routeKey: string;
};

function clearPresenceStyle(element: HTMLElement): void {
  element.style.removeProperty("opacity");
  element.style.removeProperty("translate");
  element.style.removeProperty("scale");
  element.style.removeProperty("will-change");
}

function usesLeadSoftPop(element: HTMLElement, leadCard: HTMLElement | null): boolean {
  return element.dataset.dlensPresence === "card" && element === leadCard;
}

function isTopLevelPresenceTarget(element: HTMLElement): boolean {
  return element.dataset.dlensPresence !== "card"
    || element.parentElement?.closest<HTMLElement>('[data-dlens-presence="card"]') == null;
}

function presenceTargetsWithin(root: Element): HTMLElement[] {
  const targets: HTMLElement[] = [];
  if (root.matches(PRESENCE_SELECTOR) && isTopLevelPresenceTarget(root as HTMLElement)) {
    targets.push(root as HTMLElement);
  }
  targets.push(
    ...Array.from(root.querySelectorAll<HTMLElement>(PRESENCE_SELECTOR))
      .filter(isTopLevelPresenceTarget)
  );
  return targets;
}

/** Give a real filter/reorder ownership over a target and any marked children. */
export function settleWorkspacePresenceTree(root: Element): void {
  for (const element of presenceTargetsWithin(root)) {
    element.dataset.dlensPresenceSettled = "causal";
    for (const animation of element.getAnimations?.() ?? []) {
      if (animation.id === PRESENCE_ANIMATION_ID) {
        animation.cancel();
      }
    }
    clearPresenceStyle(element);
    const EventConstructor = element.ownerDocument.defaultView?.Event;
    if (EventConstructor) {
      element.dispatchEvent(new EventConstructor(PRESENCE_SETTLE_EVENT, { bubbles: true }));
    }
  }
}

function hasActiveCausalAnimation(element: HTMLElement): boolean {
  return (element.getAnimations?.() ?? []).some(
    (animation) => animation.id === CAUSAL_ANIMATION_ID && animation.playState !== "finished"
  );
}

function cancelAnimationsById(root: HTMLElement, animationId: string): void {
  const elements = [root, ...root.querySelectorAll<HTMLElement>("*")];
  for (const element of elements) {
    for (const animation of element.getAnimations?.() ?? []) {
      if (animation.id === animationId) {
        animation.cancel();
      }
    }
  }
}

/**
 * Owns the two forms of motion tied to the popup scroll viewport:
 * one-shot, opt-in content presence and the small trackpad rebound at the end.
 * Presence uses individual `translate`; hover keeps `transform`, while causal
 * list motion can explicitly settle presence before taking translate ownership.
 */
export function useWorkspaceScrollMotion(
  viewportRef: RefObject<HTMLDivElement | null>,
  { active, routeKey }: WorkspaceScrollMotionOptions
): RefObject<HTMLDivElement | null> {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const presenceHistoryRef = useRef<{ routeKey: string; seen: WeakSet<Element>; leadConsumed: boolean }>({
    routeKey: "",
    seen: new WeakSet<Element>(),
    leadConsumed: false
  });
  const [motionPreferenceRevision, setMotionPreferenceRevision] = useState(0);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!active || !viewport || !track || typeof window === "undefined") {
      return;
    }

    if (presenceHistoryRef.current.routeKey !== routeKey) {
      presenceHistoryRef.current = { routeKey, seen: new WeakSet<Element>(), leadConsumed: false };
    }

    const presenceHistory = presenceHistoryRef.current;
    const mediaQuery = window.matchMedia?.(REDUCED_MOTION_QUERY);
    let reducedMotion = mediaQuery?.matches ?? false;
    const targets = new Set<HTMLElement>();
    const seen = presenceHistoryRef.current.seen;
    const runningAnimations = new Map<HTMLElement, Animation>();
    let observer: IntersectionObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let leadCard: HTMLElement | null = null;
    let leadConsumed = presenceHistory.leadConsumed;
    let cardStaggerBucket = 0;
    let rowStaggerBucket = 0;
    let staggerResetTimer: number | null = null;
    let settleTimer: number | null = null;
    let reboundAnimation: Animation | null = null;
    let pendingWheel = 0;
    let overshoot = 0;
    let cooldownUntil = 0;
    let disposed = false;

    const cancelRebound = () => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (reboundAnimation) {
        reboundAnimation.onfinish = null;
        reboundAnimation.oncancel = null;
        reboundAnimation.cancel();
        reboundAnimation = null;
      }
      pendingWheel = 0;
      overshoot = 0;
      track.style.removeProperty("translate");
      track.style.removeProperty("will-change");
    };

    const settleRebound = () => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      pendingWheel = 0;
      if (overshoot <= 0) {
        track.style.removeProperty("translate");
        track.style.removeProperty("will-change");
        return;
      }

      const start = overshoot;
      overshoot = 0;
      cooldownUntil = window.performance.now() + tokens.motion.bottomRebound.cooldownMs;
      if (typeof track.animate !== "function") {
        track.style.removeProperty("translate");
        track.style.removeProperty("will-change");
        return;
      }

      reboundAnimation = track.animate(
        [{ translate: `0 -${start}px` }, { translate: "0 0" }],
        {
          duration: tokens.motion.bottomRebound.durationMs,
          easing: tokens.motion.easing.springSoft,
          fill: "both"
        }
      );
      track.style.removeProperty("translate");

      const release = () => {
        const finishedAnimation = reboundAnimation;
        reboundAnimation = null;
        track.style.removeProperty("translate");
        track.style.removeProperty("will-change");
        if (finishedAnimation) {
          finishedAnimation.onfinish = null;
          finishedAnimation.oncancel = null;
          finishedAnimation.cancel();
        }
      };
      reboundAnimation.onfinish = release;
      reboundAnimation.oncancel = () => {
        reboundAnimation = null;
        track.style.removeProperty("translate");
        track.style.removeProperty("will-change");
      };
    };

    const onWheel = (event: WheelEvent) => {
      const rebound = tokens.motion.bottomRebound;
      const scrollable = viewport.scrollHeight > viewport.clientHeight + rebound.bottomTolerancePx;
      const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - rebound.bottomTolerancePx;

      if (reducedMotion || !scrollable || !atBottom || event.deltaY <= 0) {
        if (pendingWheel > 0 || overshoot > 0) {
          settleRebound();
        }
        return;
      }
      if (window.performance.now() < cooldownUntil) {
        return;
      }

      pendingWheel += event.deltaY;
      if (pendingWheel < rebound.hysteresisPx) {
        return;
      }

      overshoot = Math.min(rebound.amplitudePx, overshoot + event.deltaY * rebound.wheelGain);
      track.style.willChange = "translate";
      track.style.setProperty("translate", `0 -${overshoot}px`);
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      settleTimer = window.setTimeout(settleRebound, rebound.settleDelayMs);
    };

    const cancelPresenceAnimation = (element: HTMLElement) => {
      const animation = runningAnimations.get(element);
      if (!animation) return;
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
      runningAnimations.delete(element);
    };

    const settlePresenceTarget = (element: HTMLElement) => {
      seen.add(element);
      observer?.unobserve(element);
      cancelPresenceAnimation(element);
      clearPresenceStyle(element);
    };

    const onPresenceSettle = (event: Event) => {
      const element = event.target;
      if (element instanceof window.HTMLElement && element.matches(PRESENCE_SELECTOR)) {
        settlePresenceTarget(element);
      }
    };

    const consumeLeadCard = (element: HTMLElement) => {
      if (element.dataset.dlensPresence !== "card" || leadConsumed) return;
      leadCard = element;
      leadConsumed = true;
      presenceHistory.leadConsumed = true;
    };

    const armPresenceTarget = (element: HTMLElement) => {
      targets.add(element);
      consumeLeadCard(element);
      if (
        reducedMotion
        || seen.has(element)
        || element.dataset.dlensPresenceSettled === "causal"
        || hasActiveCausalAnimation(element)
      ) {
        settlePresenceTarget(element);
        return;
      }
      const isRow = element.dataset.dlensPresence === "row";
      const leadSoftPop = usesLeadSoftPop(element, leadCard);
      const opacityFrom = isRow
        ? tokens.motion.presence.rowOpacityFrom
        : leadSoftPop
          ? tokens.motion.presence.leadSoftPop.opacityFrom
          : tokens.motion.presence.cardOpacityFrom;
      const risePx = isRow
        ? tokens.motion.presence.rowRisePx
        : leadSoftPop
          ? tokens.motion.presence.leadSoftPop.risePx
          : tokens.motion.presence.cardRisePx;
      element.style.opacity = String(opacityFrom);
      element.style.setProperty("translate", `0 ${risePx}px`);
      if (leadSoftPop) {
        element.style.setProperty("scale", String(tokens.motion.presence.leadSoftPop.scaleFrom));
      }
      element.style.willChange = leadSoftPop ? "opacity, translate, scale" : "opacity, translate";
      observer?.observe(element);
    };

    const settleAllPresence = () => {
      mutationObserver?.disconnect();
      mutationObserver = null;
      observer?.disconnect();
      observer = null;
      if (staggerResetTimer !== null) {
        window.clearTimeout(staggerResetTimer);
        staggerResetTimer = null;
      }
      for (const [element, animation] of runningAnimations) {
        animation.onfinish = null;
        animation.oncancel = null;
        animation.cancel();
        clearPresenceStyle(element);
      }
      runningAnimations.clear();
      for (const element of targets) {
        clearPresenceStyle(element);
        element.removeAttribute("data-dlens-presence-settled");
      }
      targets.clear();
    };

    const initialTargets = presenceTargetsWithin(track);
    if (!reducedMotion && typeof window.IntersectionObserver === "function") {
      observer = new window.IntersectionObserver(
        (entries) => {
          if (disposed) return;
          let startedAnimation = false;
          for (const entry of entries) {
            if (!entry.isIntersecting || seen.has(entry.target)) {
              continue;
            }
            const element = entry.target as HTMLElement;
            if (element.dataset.dlensPresenceSettled === "causal" || hasActiveCausalAnimation(element)) {
              element.dataset.dlensPresenceSettled = "causal";
              settlePresenceTarget(element);
              continue;
            }

            seen.add(element);
            observer?.unobserve(element);
            const isRow = element.dataset.dlensPresence === "row";
            const leadSoftPop = usesLeadSoftPop(element, leadCard);
            const opacityFrom = isRow
              ? tokens.motion.presence.rowOpacityFrom
              : leadSoftPop
                ? tokens.motion.presence.leadSoftPop.opacityFrom
                : tokens.motion.presence.cardOpacityFrom;
            const risePx = isRow
              ? tokens.motion.presence.rowRisePx
              : leadSoftPop
                ? tokens.motion.presence.leadSoftPop.risePx
                : tokens.motion.presence.cardRisePx;
            const duration = isRow
              ? tokens.motion.presence.rowDurationMs
              : leadSoftPop
                ? tokens.motion.presence.leadSoftPop.durationMs
                : tokens.motion.presence.cardDurationMs;
            const staggerIndex = Math.min(
              isRow ? rowStaggerBucket : cardStaggerBucket,
              tokens.motion.presence.staggerCap - 1
            );
            const delay = leadSoftPop
              ? 0
              : isRow
                ? staggerIndex * tokens.motion.presence.staggerMs
                : tokens.motion.presence.cardDelayMs
                  + staggerIndex * tokens.motion.presence.cardStaggerMs;
            if (!leadSoftPop) {
              if (isRow) {
                rowStaggerBucket += 1;
              } else {
                cardStaggerBucket += 1;
              }
            }
            startedAnimation = true;

            if (typeof element.animate !== "function") {
              clearPresenceStyle(element);
              continue;
            }
            const keyframes: Keyframe[] = leadSoftPop
              ? [
                  {
                    opacity: tokens.motion.presence.leadSoftPop.opacityFrom,
                    translate: `0 ${tokens.motion.presence.leadSoftPop.risePx}px`,
                    scale: tokens.motion.presence.leadSoftPop.scaleFrom,
                    offset: 0
                  },
                  {
                    opacity: 1,
                    translate: `0 ${tokens.motion.presence.leadSoftPop.overshootPx}px`,
                    scale: tokens.motion.presence.leadSoftPop.scaleOvershoot,
                    offset: 0.72
                  },
                  { opacity: 1, translate: "0 0", scale: 1, offset: 1 }
                ]
              : [
                  { opacity: opacityFrom, translate: `0 ${risePx}px` },
                  { opacity: 1, translate: "0 0" }
                ];
            const animation = element.animate(
              keyframes,
              {
                duration,
                delay,
                easing: leadSoftPop || !isRow ? tokens.motion.easing.softPop : tokens.motion.easing.entrance,
                fill: "both"
              }
            );
            animation.id = PRESENCE_ANIMATION_ID;
            runningAnimations.set(element, animation);
            clearPresenceStyle(element);

            const release = () => {
              animation.onfinish = null;
              animation.oncancel = null;
              if (runningAnimations.get(element) === animation) {
                runningAnimations.delete(element);
              }
              clearPresenceStyle(element);
              animation.cancel();
            };
            animation.onfinish = release;
            animation.oncancel = () => {
              if (runningAnimations.get(element) === animation) {
                runningAnimations.delete(element);
              }
              clearPresenceStyle(element);
            };
          }

          if (startedAnimation) {
            if (staggerResetTimer !== null) {
              window.clearTimeout(staggerResetTimer);
            }
            staggerResetTimer = window.setTimeout(() => {
              cardStaggerBucket = 0;
              rowStaggerBucket = 0;
              staggerResetTimer = null;
            }, tokens.motion.presence.staggerResetMs);
          }
        },
        {
          root: viewport,
          threshold: tokens.motion.presence.threshold,
          rootMargin: tokens.motion.presence.rootMargin
        }
      );

      track.addEventListener(PRESENCE_SETTLE_EVENT, onPresenceSettle);
      initialTargets.forEach(armPresenceTarget);

      if (typeof window.MutationObserver === "function") {
        // Presence markers are a mount-time render contract. State changes add,
        // remove, or move marked nodes; they do not toggle the marker in place.
        mutationObserver = new window.MutationObserver((records) => {
          if (disposed) return;
          const removedRoots: Element[] = [];
          const addedRoots: Element[] = [];
          for (const record of records) {
            for (const node of record.removedNodes) {
              if (node.nodeType !== 1) continue;
              removedRoots.push(node as Element);
            }
            for (const node of record.addedNodes) {
              if (node.nodeType !== 1) continue;
              addedRoots.push(node as Element);
            }
          }

          let removedCard = false;
          for (const root of removedRoots) {
            for (const element of presenceTargetsWithin(root)) {
              if (track.contains(element)) continue;
              if (element.dataset.dlensPresence === "card") removedCard = true;
              observer?.unobserve(element);
              cancelPresenceAnimation(element);
              clearPresenceStyle(element);
              targets.delete(element);
            }
          }

          const hasConnectedCard = Array.from(targets).some(
            (element) => element.dataset.dlensPresence === "card" && track.contains(element)
          );
          if (removedCard && !hasConnectedCard) {
            leadCard = null;
            leadConsumed = false;
            presenceHistory.leadConsumed = false;
            cardStaggerBucket = 0;
            rowStaggerBucket = 0;
            if (staggerResetTimer !== null) {
              window.clearTimeout(staggerResetTimer);
              staggerResetTimer = null;
            }
          }

          for (const root of addedRoots) {
            presenceTargetsWithin(root).forEach(armPresenceTarget);
          }
        });
        mutationObserver.observe(track, { childList: true, subtree: true });
      }
    } else {
      initialTargets.forEach((element) => {
        consumeLeadCard(element);
        if (reducedMotion) seen.add(element);
        clearPresenceStyle(element);
      });
    }

    viewport.addEventListener("wheel", onWheel, { passive: true });

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (disposed) return;
      const wasReducedMotion = reducedMotion;
      reducedMotion = event.matches;
      if (reducedMotion) {
        presenceTargetsWithin(track).forEach((element) => {
          consumeLeadCard(element);
          seen.add(element);
        });
        settleAllPresence();
        cancelAnimationsById(track, CAUSAL_ANIMATION_ID);
        cancelRebound();
      } else if (wasReducedMotion) {
        // Anything rendered while motion was reduced was already shown statically.
        presenceTargetsWithin(track).forEach((element) => {
          consumeLeadCard(element);
          seen.add(element);
        });
      }
      setMotionPreferenceRevision((revision) => revision + 1);
    };
    mediaQuery?.addEventListener?.("change", onMotionPreferenceChange);

    return () => {
      disposed = true;
      mediaQuery?.removeEventListener?.("change", onMotionPreferenceChange);
      viewport.removeEventListener("wheel", onWheel);
      track.removeEventListener(PRESENCE_SETTLE_EVENT, onPresenceSettle);
      settleAllPresence();
      cancelRebound();
    };
  }, [active, motionPreferenceRevision, routeKey, viewportRef]);

  return trackRef;
}
