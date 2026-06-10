import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOVER_INTENT_DELAY_MS, createLocationChangeChecker } from "../src/targeting/navigation-reset.ts";
import {
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
