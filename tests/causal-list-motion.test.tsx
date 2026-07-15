import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { useCausalListMotion } from "../src/ui/useCausalListMotion.ts";

function MotionList({ keys }: { keys: string[] }) {
  const ref = useCausalListMotion(keys.join("|"));
  return (
    <div ref={ref} data-test-motion-list="true">
      {keys.map((key, index) => (
        <div key={key} data-dlens-list-key={key} data-dlens-presence="row" data-test-index={index} />
      ))}
    </div>
  );
}

test("useCausalListMotion animates derived changes, skips first paint, and honours reduced motion", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element
  });
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

  let reduceMotion = false;
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: reduceMotion })
  });

  const originalRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
  const originalAnimate = dom.window.HTMLElement.prototype.animate;
  const originalOffsetTop = Object.getOwnPropertyDescriptor(dom.window.HTMLElement.prototype, "offsetTop");
  const originalOffsetLeft = Object.getOwnPropertyDescriptor(dom.window.HTMLElement.prototype, "offsetLeft");
  const animationCalls: Array<{ key: string | null; frames: Keyframe[]; animation: Animation }> = [];
  const lifecycleEvents: string[] = [];
  dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const index = Number(this.getAttribute("data-test-index") ?? 0);
    const top = this.hasAttribute("data-test-motion-list") ? 0 : index * 40;
    if (this.hasAttribute("data-dlens-list-key")) lifecycleEvents.push(`visual-measure:${this.getAttribute("data-dlens-list-key")}`);
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 100,
      bottom: top + 30,
      width: 100,
      height: 30,
      toJSON: () => ({})
    } as DOMRect;
  };
  Object.defineProperty(dom.window.HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get() {
      const index = Number(this.getAttribute("data-test-index") ?? 0);
      if (this.hasAttribute("data-dlens-list-key")) lifecycleEvents.push(`layout-measure:${this.getAttribute("data-dlens-list-key")}`);
      return index * 40;
    }
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "offsetLeft", {
    configurable: true,
    get() {
      return 0;
    }
  });
  dom.window.HTMLElement.prototype.animate = function animate(frames) {
    const key = this.getAttribute("data-dlens-list-key");
    const animation = { cancel: () => lifecycleEvents.push(`cancel:${key}`) } as Animation;
    animationCalls.push({
      key,
      frames: frames as Keyframe[],
      animation
    });
    return animation;
  };

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  try {
    await act(async () => root.render(<MotionList keys={["a", "b"]} />));
    assert.equal(animationCalls.length, 0, "first paint stays still");
    assert.equal(rootElement.querySelector('[data-dlens-list-key="a"]')?.hasAttribute("data-dlens-presence-settled"), false);

    await act(async () => root.render(<MotionList keys={["b", "c"]} />));
    assert.deepEqual(animationCalls.map((call) => call.key), ["b", "c"]);
    assert.equal(animationCalls[0]!.frames[0]!.translate, "0px 40px");
    assert.equal(animationCalls[1]!.frames[0]!.opacity, 0);
    assert.ok(animationCalls.every((call) => call.animation.id === "dlens-causal-list"));
    assert.equal(rootElement.querySelector<HTMLElement>('[data-dlens-list-key="b"]')?.dataset.dlensPresenceSettled, "causal");
    assert.equal(rootElement.querySelector<HTMLElement>('[data-dlens-list-key="c"]')?.dataset.dlensPresenceSettled, "causal");

    animationCalls.length = 0;
    lifecycleEvents.length = 0;
    await act(async () => root.render(<MotionList keys={["c", "b"]} />));
    assert.deepEqual(lifecycleEvents.slice(0, 2).sort(), ["cancel:b", "cancel:c"], "running animations cancel before the next layout measurement");
    assert.equal(lifecycleEvents.some((event) => event.startsWith("visual-measure:")), false, "layout reads ignore visual transforms");
    assert.deepEqual(animationCalls.map((call) => call.key), ["c", "b"]);

    animationCalls.length = 0;
    await act(async () => root.render(<MotionList keys={[]} />));
    await act(async () => root.render(<MotionList keys={["d"]} />));
    assert.deepEqual(animationCalls.map((call) => call.key), ["d"], "empty filter to populated filter is a state change, not first paint");
    assert.equal(animationCalls[0]!.frames[0]!.opacity, 0);

    animationCalls.length = 0;
    lifecycleEvents.length = 0;
    reduceMotion = true;
    await act(async () => root.render(<MotionList keys={["d", "e"]} />));
    assert.equal(animationCalls.length, 0, "reduced motion suppresses JS animations");
    assert.ok(lifecycleEvents.includes("cancel:d"), "switching to reduced motion cancels an animation already in flight");
  } finally {
    await act(async () => root.unmount());
    dom.window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    dom.window.HTMLElement.prototype.animate = originalAnimate;
    if (originalOffsetTop) Object.defineProperty(dom.window.HTMLElement.prototype, "offsetTop", originalOffsetTop);
    if (originalOffsetLeft) Object.defineProperty(dom.window.HTMLElement.prototype, "offsetLeft", originalOffsetLeft);
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    else reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
