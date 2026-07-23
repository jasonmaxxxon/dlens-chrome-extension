import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { JSDOM } from "jsdom";

import { HOVER_INTENT_DELAY_MS, createLocationChangeChecker } from "../src/targeting/navigation-reset.ts";
import {
  dispatchPageLocationChange,
  PAGE_LOCATION_EVENT,
  OPTIMISTIC_SAVE_CONFIRMED_EVENT,
  OPTIMISTIC_SAVE_EVENT,
  OPTIMISTIC_SAVE_FAILED_EVENT
} from "../src/ui/inpage-helpers.tsx";

test("threads content keeps hover intent delay at or below 180ms", () => {
  assert.ok(HOVER_INTENT_DELAY_MS <= 180);
});

test("createLocationChangeChecker only clears hover state when the URL changes", () => {
  const seen: string[] = [];
  const checker = createLocationChangeChecker("https://www.threads.net/@alpha");

  assert.equal(checker("https://www.threads.net/@alpha", (href) => seen.push(href)), false);
  assert.deepEqual(seen, []);

  assert.equal(checker("https://www.threads.net/@alpha/post/abc", (href) => seen.push(href)), true);
  assert.deepEqual(seen, ["https://www.threads.net/@alpha/post/abc"]);

  assert.equal(checker("https://www.threads.net/@alpha/post/abc", (href) => seen.push(href)), false);
  assert.deepEqual(seen, ["https://www.threads.net/@alpha/post/abc"]);
});

test("location checker publishes one same-window page event for one real href change", () => {
  assert.equal(PAGE_LOCATION_EVENT, "dlens:page-location");
  const dom = new JSDOM("", { url: "https://www.threads.net/@alpha" });
  const seen: string[] = [];
  dom.window.addEventListener(PAGE_LOCATION_EVENT, (event) => {
    seen.push((event as CustomEvent<{ href: string }>).detail.href);
  });
  const checker = createLocationChangeChecker(dom.window.location.href);
  const publish = (href: string) => {
    dispatchPageLocationChange(href, dom.window as unknown as Window);
  };

  try {
    assert.equal(checker(dom.window.location.href, publish), false);
    assert.equal(checker("https://www.threads.net/@alpha/post/abc", publish), true);
    assert.equal(checker("https://www.threads.net/@alpha/post/abc", publish), false);
    assert.deepEqual(seen, ["https://www.threads.net/@alpha/post/abc"]);
  } finally {
    dom.window.close();
  }
});

test("content-script saves have a confirmed event for refreshing the in-page UI", () => {
  assert.equal(OPTIMISTIC_SAVE_CONFIRMED_EVENT, "dlens:optimistic-save-confirmed");
  assert.notEqual(OPTIMISTIC_SAVE_CONFIRMED_EVENT, OPTIMISTIC_SAVE_EVENT);
  assert.notEqual(OPTIMISTIC_SAVE_CONFIRMED_EVENT, OPTIMISTIC_SAVE_FAILED_EVENT);
});

test("content root is a viewport host so fixed launcher remains hit-testable", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  const start = source.indexOf("function ensureRoot()");
  assert.notEqual(start, -1);
  const end = source.indexOf("\nfunction renderWorkspaceCrashFallback", start);
  assert.notEqual(end, -1);
  const block = source.slice(start, end);

  assert.match(block, /root\.style\.position = "fixed";/);
  assert.match(block, /root\.style\.inset = "0";/);
  assert.match(block, /root\.style\.pointerEvents = "none";/);
});

test("content selection overlay uses the steel-blue product theme", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  const start = source.indexOf("  product: {");
  assert.notEqual(start, -1);
  const end = source.indexOf('\n  "pr-evidence"', start);
  assert.notEqual(end, -1);
  const block = source.slice(start, end);

  assert.match(block, /accent: "#234f7a"/);
  assert.match(block, /accentMid: "#2f6a96"/);
  assert.match(block, /borderStrong: "rgba\(35,79,122,0\.58\)"/);
  assert.doesNotMatch(block, /#c2401f|#d65a36|194,64,31/);
});

test("content selection overlay joins the scoped reduced-motion safety net", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  const start = source.indexOf("function ensureOverlay()");
  assert.notEqual(start, -1);
  const end = source.indexOf("\nfunction ensureRoot()", start);
  assert.notEqual(end, -1);
  const block = source.slice(start, end);

  assert.match(block, /overlay\.setAttribute\("data-dlens-control", "true"\);/);
  assert.match(block, /overlay\.style\.transition = "[^"]*120ms[^"]*";/);
});

test("launcher and popup surfaces opt back into pointer events inside the inert root host", () => {
  const overlaySource = readFileSync(new URL("../src/ui/InPageCollectorOverlays.tsx", import.meta.url), "utf8");
  const popupSource = readFileSync(new URL("../src/ui/InPageCollectorPopup.tsx", import.meta.url), "utf8");

  assert.match(overlaySource, /pointerEvents: "auto"/);
  assert.match(popupSource, /pointerEvents: "auto"/);
});

test("collect mode click interception only happens after a collectable card descriptor is resolved", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  const start = source.indexOf("function onClick(event: MouseEvent)");
  assert.notEqual(start, -1);
  const end = source.indexOf("\nfunction onKeyDown", start);
  assert.notEqual(end, -1);
  const block = source.slice(start, end);

  const candidateIndex = block.indexOf("const candidate = findCardCandidate(event.target);");
  const cardGuardIndex = block.indexOf("if (!card) {");
  const descriptorGuardIndex = block.indexOf("if (!descriptor) {");
  const preventIndex = block.indexOf("event.preventDefault();");
  const stopIndex = block.indexOf("event.stopPropagation();");

  assert.ok(candidateIndex >= 0);
  assert.ok(cardGuardIndex > candidateIndex);
  assert.ok(descriptorGuardIndex > cardGuardIndex);
  assert.ok(preventIndex > descriptorGuardIndex);
  assert.ok(stopIndex > descriptorGuardIndex);
});

test("content hover lifecycle routes pointer, navigation and stop through one frame controller", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  const pointerStart = source.indexOf("function onPointerMove(event: MouseEvent)");
  const pointerEnd = source.indexOf("\nfunction onClick", pointerStart);
  const navigationStart = source.indexOf("function clearHoverStateForNavigation()");
  const navigationEnd = source.indexOf("\nfunction installSpaNavigationReset", navigationStart);
  const stopStart = source.indexOf("function stopSelectionMode(");
  const stopEnd = source.indexOf("\nfunction startSelectionMode", stopStart);

  assert.ok(pointerStart >= 0 && pointerEnd > pointerStart);
  assert.ok(navigationStart >= 0 && navigationEnd > navigationStart);
  assert.ok(stopStart >= 0 && stopEnd > stopStart);
  assert.match(source.slice(pointerStart, pointerEnd), /hoverFrameController\.enqueue\(event\.target\)/);
  assert.match(source.slice(navigationStart, navigationEnd), /hoverFrameController\.cancel\(\)/);
  assert.match(source.slice(stopStart, stopEnd), /hoverFrameController\.cancel\(\)/);
});

test("SPA navigation clears hover before publishing the changed page href", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  const navigationStart = source.indexOf("function installSpaNavigationReset()");
  const navigationEnd = source.indexOf("\nfunction stopSelectionMode", navigationStart);
  assert.ok(navigationStart >= 0 && navigationEnd > navigationStart);
  const block = source.slice(navigationStart, navigationEnd);
  const callbackIndex = block.indexOf("checkLocationChange(window.location.href, (href) => {");
  const clearIndex = block.indexOf("clearHoverStateForNavigation();", callbackIndex);
  const publishIndex = block.indexOf("dispatchPageLocationChange(href);", callbackIndex);

  assert.ok(callbackIndex >= 0);
  assert.ok(clearIndex > callbackIndex);
  assert.ok(publishIndex > clearIndex);
  assert.equal(block.match(/dispatchPageLocationChange\(href\);/g)?.length, 1);
});

test("content hover update path consumes the measured rect without re-reading layout", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  const setStart = source.indexOf("function setHoverCard(");
  const setEnd = source.indexOf("\nconst hoverFrameController", setStart);
  const renderStart = source.indexOf("function renderOverlay(");
  const renderEnd = source.indexOf("\nfunction clearHoverIntent", renderStart);

  assert.ok(setStart >= 0 && setEnd > setStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart);
  assert.doesNotMatch(source.slice(setStart, setEnd), /getBoundingClientRect\(\)/);
  assert.doesNotMatch(source.slice(renderStart, renderEnd), /getBoundingClientRect\(\)/);
});
