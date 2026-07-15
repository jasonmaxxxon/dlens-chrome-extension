import assert from "node:assert/strict";
import test from "node:test";
import React, { useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

type AnimationCall = {
  target: HTMLElement;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: Animation;
};

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  readonly observed = new Set<Element>();
  disconnected = false;

  constructor(
    readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {}
  ) {
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? "0px";
    this.thresholds = Array.isArray(options.threshold)
      ? options.threshold
      : [options.threshold ?? 0];
    FakeIntersectionObserver.instances.push(this);
  }

  observe = (target: Element) => this.observed.add(target);
  unobserve = (target: Element) => this.observed.delete(target);
  disconnect = () => {
    this.disconnected = true;
    this.observed.clear();
  };
  takeRecords = () => [];
}

test("workspace scroll motion applies a route-independent lead soft-pop then the shared fade-up rhythm", async () => {
  const { settleWorkspacePresenceTree, useWorkspaceScrollMotion } = await import("../src/ui/useWorkspaceScrollMotion.ts");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    IntersectionObserver: globalThis.IntersectionObserver
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    IntersectionObserver: FakeIntersectionObserver
  });
  Object.defineProperty(dom.window, "IntersectionObserver", {
    configurable: true,
    value: FakeIntersectionObserver
  });
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })
  });

  const originalAnimate = dom.window.HTMLElement.prototype.animate;
  const animationCalls: AnimationCall[] = [];
  dom.window.HTMLElement.prototype.animate = function animate(frames, options) {
    const animation = {
      cancel: () => undefined,
      onfinish: null,
      oncancel: null
    } as unknown as Animation;
    animationCalls.push({
      target: this,
      frames: frames as Keyframe[],
      options: options as KeyframeAnimationOptions,
      animation
    });
    return animation;
  };

  function Harness({ routeKey = "product:saved-signals" }: { routeKey?: string }) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const trackRef = useWorkspaceScrollMotion(viewportRef, { active: true, routeKey });
    return (
      <div ref={viewportRef} data-test-viewport="true">
        <div ref={trackRef} data-test-track="true">
          {Array.from({ length: 7 }, (_, index) => (
            <article key={index} data-dlens-presence="card" data-test-card={index}>
              {index === 0 ? <aside data-dlens-presence="card" data-test-nested-card="true" /> : null}
            </article>
          ))}
          <div data-dlens-presence="row" data-test-row="true" />
          <div className="dlens-card-lift" data-test-unmarked="true" />
        </div>
      </div>
    );
  }

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  try {
    FakeIntersectionObserver.instances = [];
    flushSync(() => root.render(<Harness />));

    const viewport = rootElement.querySelector<HTMLElement>('[data-test-viewport="true"]');
    const track = rootElement.querySelector<HTMLElement>('[data-test-track="true"]');
    const nestedCard = rootElement.querySelector<HTMLElement>('[data-test-nested-card="true"]');
    const targets = Array.from(rootElement.querySelectorAll<HTMLElement>("[data-dlens-presence]"))
      .filter((target) => target !== nestedCard);
    const unmarked = rootElement.querySelector<HTMLElement>('[data-test-unmarked="true"]');
    assert.ok(viewport && track && nestedCard && unmarked);
    assert.equal(FakeIntersectionObserver.instances.length, 1);
    const staleObserver = FakeIntersectionObserver.instances[0]!;
    assert.equal(staleObserver.root, viewport);
    assert.equal(staleObserver.rootMargin, "1000px 0px -96px 0px");
    assert.deepEqual(staleObserver.thresholds, [0.08]);
    assert.deepEqual([...staleObserver.observed], targets);
    assert.equal(staleObserver.observed.has(nestedCard), false, "a nested card inherits its parent entrance instead of doubling the motion");
    assert.equal(staleObserver.observed.has(unmarked), false, "presence is opt-in rather than inferred from hover classes");
    assert.equal(targets[0]!.style.opacity, "0.68");
    assert.equal(targets[0]!.style.getPropertyValue("translate"), "0 10px");
    assert.equal(targets[0]!.style.getPropertyValue("scale"), "0.985");
    assert.equal(targets[1]!.style.opacity, "0.28");
    assert.equal(targets[1]!.style.getPropertyValue("scale"), "");
    assert.equal(targets.at(-1)!.style.opacity, "0.92");

    flushSync(() => root.render(<Harness routeKey="product:classification" />));
    assert.equal(staleObserver.disconnected, true);
    assert.equal(FakeIntersectionObserver.instances.length, 2);
    const observer = FakeIntersectionObserver.instances[1]!;
    assert.deepEqual([...observer.observed], targets, "the new route generation observes the reused card nodes");
    const entries = targets.map((target) => ({ isIntersecting: true, target } as IntersectionObserverEntry));
    staleObserver.callback(entries.slice(0, 1), staleObserver as unknown as IntersectionObserver);
    assert.equal(animationCalls.length, 0, "a queued callback from the previous route generation is inert");
    observer.callback(entries.slice(0, 1), observer as unknown as IntersectionObserver);
    observer.callback(entries.slice(1), observer as unknown as IntersectionObserver);
    assert.equal(animationCalls.length, 8);
    assert.deepEqual(animationCalls.map((call) => call.options.delay), [0, 70, 130, 190, 250, 310, 370, 0]);
    assert.equal(animationCalls[0]!.frames[0]!.opacity, 0.68);
    assert.equal(animationCalls[0]!.frames[0]!.translate, "0 10px");
    assert.equal(animationCalls[0]!.options.duration, 420);
    assert.equal(animationCalls[0]!.options.easing, "cubic-bezier(0.25, 0.46, 0.45, 0.94)");
    assert.equal(animationCalls[0]!.animation.id, "dlens-scroll-presence");
    assert.equal(animationCalls[1]!.frames.length, 2, "later cards use fade-up without scale bounce");
    assert.equal(animationCalls[1]!.frames[0]!.opacity, 0.28);
    assert.equal(animationCalls[1]!.frames[0]!.translate, "0 10px");
    assert.equal(animationCalls[1]!.frames[0]!.scale, undefined);
    assert.equal(animationCalls[1]!.options.duration, 480);
    assert.equal(animationCalls.at(-1)!.frames[0]!.opacity, 0.92);
    assert.equal(animationCalls.at(-1)!.options.duration, 220);
    assert.equal(observer.observed.size, 0, "intersecting targets are one-shot");

    observer.callback(entries, observer as unknown as IntersectionObserver);
    assert.equal(animationCalls.length, 8, "a duplicate observer callback cannot replay a settled target");

    await new Promise((resolve) => setTimeout(resolve, 130));
    const dynamic = dom.window.document.createElement("article");
    dynamic.dataset.dlensPresence = "card";
    track.append(dynamic);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(observer.observed.has(dynamic), true, "same-route hydrated marked nodes are armed when they mount");
    assert.equal(dynamic.style.opacity, "0.28");
    assert.equal(dynamic.style.getPropertyValue("translate"), "0 10px");
    assert.equal(dynamic.style.getPropertyValue("scale"), "");
    observer.callback([{ isIntersecting: true, target: dynamic } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
    assert.equal(animationCalls.at(-1)!.options.delay, 70, "a later card restarts the shared fade-up rhythm after the idle window");
    assert.equal(animationCalls.at(-1)!.options.duration, 480);
    assert.equal(animationCalls.at(-1)!.options.easing, "cubic-bezier(0.25, 0.46, 0.45, 0.94)");
    assert.deepEqual(animationCalls.at(-1)!.frames.map((frame) => frame.opacity), [0.28, 1]);
    assert.deepEqual(animationCalls.at(-1)!.frames.map((frame) => frame.translate), ["0 10px", "0 0"]);
    assert.deepEqual(animationCalls.at(-1)!.frames.map((frame) => frame.scale), [undefined, undefined]);

    const causalWrapper = dom.window.document.createElement("div");
    const causalChild = dom.window.document.createElement("article");
    causalChild.dataset.dlensPresence = "card";
    causalWrapper.append(causalChild);
    track.append(causalWrapper);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(observer.observed.has(causalChild), true);
    settleWorkspacePresenceTree(causalWrapper);
    assert.equal(causalChild.dataset.dlensPresenceSettled, "causal");
    assert.equal(observer.observed.has(causalChild), false, "causal state motion settles pending descendant presence");
    assert.equal(causalChild.style.opacity, "");
    const callsBeforeLateObserver = animationCalls.length;
    observer.callback([{ isIntersecting: true, target: causalChild } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
    assert.equal(animationCalls.length, callsBeforeLateObserver, "a queued observer callback cannot override causal motion");

    const internalRouteLead = dom.window.document.createElement("article");
    internalRouteLead.dataset.dlensPresence = "card";
    internalRouteLead.dataset.testInternalRouteCard = "lead";
    const internalRouteLater = dom.window.document.createElement("article");
    internalRouteLater.dataset.dlensPresence = "card";
    internalRouteLater.dataset.testInternalRouteCard = "later";
    targets[0]!.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    track.replaceChildren(internalRouteLead, internalRouteLater);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(internalRouteLead.style.opacity, "0.68", "a full internal surface replacement receives a new lead card");
    assert.equal(internalRouteLater.style.opacity, "0.28");
    const internalCallsBefore = animationCalls.length;
    observer.callback([
      { isIntersecting: true, target: internalRouteLead } as IntersectionObserverEntry,
      { isIntersecting: true, target: internalRouteLater } as IntersectionObserverEntry
    ], observer as unknown as IntersectionObserver);
    assert.deepEqual(
      animationCalls.slice(internalCallsBefore).map((call) => call.options.delay),
      [0, 70],
      "internal Compare-style subroutes restart the lead/follow-up rhythm without changing the shell route key"
    );

    animationCalls.length = 0;
    Object.defineProperties(viewport, {
      scrollTop: { configurable: true, writable: true, value: 400 },
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 1000 }
    });
    viewport.dispatchEvent(new dom.window.WheelEvent("wheel", { bubbles: true, deltaY: 50 }));
    assert.equal(track.style.getPropertyValue("translate"), "0 -3px");
    assert.equal(viewport.style.transform, "");
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(animationCalls.length, 1);
    assert.equal(animationCalls[0]!.target, track);
    assert.deepEqual(animationCalls[0]!.frames.map((frame) => frame.translate), ["0 -3px", "0 0"]);
    assert.equal(animationCalls[0]!.options.duration, 280);
  } finally {
    flushSync(() => root.unmount());
    assert.equal(FakeIntersectionObserver.instances[0]?.disconnected, true);
    dom.window.HTMLElement.prototype.animate = originalAnimate;
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("workspace scroll motion follows live reduced-motion changes without replaying settled cards", async () => {
  const { useWorkspaceScrollMotion } = await import("../src/ui/useWorkspaceScrollMotion.ts");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    IntersectionObserver: globalThis.IntersectionObserver
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    IntersectionObserver: FakeIntersectionObserver
  });
  Object.defineProperty(dom.window, "IntersectionObserver", { configurable: true, value: FakeIntersectionObserver });
  let motionListener: ((event: MediaQueryListEvent) => void) | null = null;
  const mediaQuery = {
    matches: true,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      motionListener = listener;
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      if (motionListener === listener) motionListener = null;
    }
  };
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => mediaQuery
  });

  function ReducedHarness() {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const trackRef = useWorkspaceScrollMotion(viewportRef, { active: true, routeKey: "pr-evidence" });
    return <div ref={viewportRef}><div ref={trackRef}><article data-dlens-presence="card" /></div></div>;
  }

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  try {
    FakeIntersectionObserver.instances = [];
    flushSync(() => root.render(<ReducedHarness />));
    const target = rootElement.querySelector<HTMLElement>('[data-dlens-presence="card"]');
    assert.ok(target);
    assert.equal(FakeIntersectionObserver.instances.length, 0);
    assert.equal(target.style.opacity, "");
    assert.equal(target.style.getPropertyValue("translate"), "");

    const track = target.parentElement;
    assert.ok(track);
    const hydratedWhileReduced = dom.window.document.createElement("article");
    hydratedWhileReduced.dataset.dlensPresence = "card";
    track.append(hydratedWhileReduced);
    await new Promise((resolve) => setTimeout(resolve, 0));

    mediaQuery.matches = false;
    flushSync(() => motionListener?.({ matches: false } as MediaQueryListEvent));
    assert.equal(FakeIntersectionObserver.instances.length, 1, "turning reduced motion off restores future presence observation");
    const firstObserver = FakeIntersectionObserver.instances[0]!;
    assert.equal(firstObserver.observed.has(target), false, "content already shown under reduced motion does not replay");
    assert.equal(
      firstObserver.observed.has(hydratedWhileReduced),
      false,
      "content hydrated while reduced motion is active is already visible and must not replay"
    );

    const futureCard = dom.window.document.createElement("article");
    futureCard.dataset.dlensPresence = "card";
    track.append(futureCard);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(firstObserver.observed.has(futureCard), true);

    let causalCancelCount = 0;
    const causalTarget = dom.window.document.createElement("div");
    causalTarget.getAnimations = () => [{
      id: "dlens-causal-list",
      cancel: () => { causalCancelCount += 1; }
    } as Animation];
    track.append(causalTarget);

    mediaQuery.matches = true;
    flushSync(() => motionListener?.({ matches: true } as MediaQueryListEvent));
    assert.equal(causalCancelCount, 1, "turning reduced motion on cancels an in-flight causal animation");
    assert.equal(firstObserver.disconnected, true);

    mediaQuery.matches = false;
    flushSync(() => motionListener?.({ matches: false } as MediaQueryListEvent));
    const restoredObserver = FakeIntersectionObserver.instances.at(-1)!;
    assert.notEqual(restoredObserver, firstObserver);
    assert.equal(restoredObserver.observed.has(futureCard), false, "a card settled before reduce does not replay afterward");
    const laterCard = dom.window.document.createElement("article");
    laterCard.dataset.dlensPresence = "card";
    track.append(laterCard);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(restoredObserver.observed.has(laterCard), true, "future cards resume the shared motion grammar");
    assert.equal(laterCard.style.opacity, "0.28", "preference changes do not create a second lead card");
    assert.equal(laterCard.style.getPropertyValue("scale"), "");
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});
