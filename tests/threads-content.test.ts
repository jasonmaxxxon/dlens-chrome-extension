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
  const end = source.indexOf("\nfunction installSpaNavigationReset", start);
  assert.notEqual(end, -1);
  const block = source.slice(start, end);

  assert.match(block, /root\.style\.position = "fixed";/);
  assert.match(block, /root\.style\.inset = "0";/);
  assert.match(block, /root\.style\.pointerEvents = "none";/);
});

test("content wheel CSS follows the existing head injection route", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  assert.match(source, /style\.textContent = DLENS_INLINE_COLLECT_CSS/);
  assert.match(source, /document\.head\.appendChild\(style\)/);
});

test("content wheel keeps the shared reduced-motion keyframe registry", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  assert.match(source, /ensureDlensKeyframes\(document\)/);
  assert.match(source, /root\.setAttribute\("data-dlens-control", "true"\)/);
});

test("launcher and popup surfaces opt back into pointer events inside the inert root host", () => {
  const overlaySource = readFileSync(new URL("../src/ui/InPageCollectorOverlays.tsx", import.meta.url), "utf8");
  const popupSource = readFileSync(new URL("../src/ui/InPageCollectorPopup.tsx", import.meta.url), "utf8");

  assert.match(overlaySource, /pointerEvents: "auto"/);
  assert.match(popupSource, /pointerEvents: "auto"/);
});

test("content no longer intercepts native post clicks for hover saves", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /session\/save-current-preview|selection\/hovered|function onClick|startSelectionMode/);
  assert.match(source, /startInlineCollectRuntime\(root\)/);
});

test("Threads pages no longer mount the old workspace popup; the side panel hosts it", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /InPageCollectorApp|ReactDOM|createRoot/);
  const panel = readFileSync(new URL("../entrypoints/sidepanel/main.tsx", import.meta.url), "utf8");
  assert.match(panel, /<InPageCollectorApp embedded \/>/);
  assert.match(panel, /sidepanel\/take-workspace-open/);
});

test("SPA navigation resets the wheel before publishing the changed page href", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  const callback = source.indexOf("checkLocationChange(window.location.href, (href) => {");
  const clear = source.indexOf("inlineCollect?.reset();", callback);
  const publish = source.indexOf("dispatchPageLocationChange(href);", callback);
  assert.ok(callback >= 0 && clear > callback && publish > clear);
});

test("content pagehide disposes wheel injection and SPA reset", () => {
  const source = readFileSync(new URL("../entrypoints/threads.content.ts", import.meta.url), "utf8");
  const cleanup = source.slice(source.indexOf('window.addEventListener("pagehide"'));
  assert.match(cleanup, /inlineCollect\?\.destroy\(\)/);
  assert.match(cleanup, /removeSpaNavigationReset\?\.\(\)/);
});
