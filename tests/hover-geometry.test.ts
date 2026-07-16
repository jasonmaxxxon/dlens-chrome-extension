import assert from "node:assert/strict";
import test from "node:test";

import { hoverFingerprint, shouldPublishHover } from "../src/targeting/hover-geometry.ts";

const rect = { top: 100, left: 50, width: 400, height: 200 };

test("same card + same strength + same normalized rect does not publish", () => {
  const previous = hoverFingerprint("card-a", "hard", rect);
  assert.equal(shouldPublishHover(previous, "card-a", "hard", rect), false);
});

test("sub-pixel jitter normalizes to the same fingerprint", () => {
  const previous = hoverFingerprint("card-a", "hard", rect);
  const jittered = { top: 100.4, left: 49.6, width: 400.2, height: 200.3 };
  assert.equal(shouldPublishHover(previous, "card-a", "hard", jittered), false);
});

test("same card with a moved rect (e.g. after scroll) still publishes", () => {
  const previous = hoverFingerprint("card-a", "hard", rect);
  const moved = { ...rect, top: rect.top - 120 };
  assert.equal(shouldPublishHover(previous, "card-a", "hard", moved), true);
});

test("same card with a resized rect still publishes", () => {
  const previous = hoverFingerprint("card-a", "hard", rect);
  const resized = { ...rect, width: rect.width + 40 };
  assert.equal(shouldPublishHover(previous, "card-a", "hard", resized), true);
});

test("same card with a changed strength still publishes", () => {
  const previous = hoverFingerprint("card-a", "hard", rect);
  assert.equal(shouldPublishHover(previous, "card-a", "soft", rect), true);
});

test("a different card publishes", () => {
  const previous = hoverFingerprint("card-a", "hard", rect);
  assert.equal(shouldPublishHover(previous, "card-b", "hard", rect), true);
});

test("1,000 same-card events publish 0 further times after the first stable event", () => {
  let previous: string | null = null;
  let publishes = 0;
  for (let i = 0; i < 1000; i++) {
    if (shouldPublishHover(previous, "card-a", "hard", rect)) {
      publishes++;
      previous = hoverFingerprint("card-a", "hard", rect);
    }
  }
  assert.equal(publishes, 1);
});

test("repeated hide publishes null only once", () => {
  // A card was showing, then the pointer leaves and keeps moving over empty space.
  let previous: string | null = hoverFingerprint("card-a", "hard", rect);
  let hides = 0;
  for (let i = 0; i < 5; i++) {
    if (shouldPublishHover(previous, null, null, null)) {
      hides++;
      previous = hoverFingerprint(null, null, null);
    }
  }
  assert.equal(hides, 1);
});

test("an empty-permalink card stays distinct from the hidden state", () => {
  const hidden = hoverFingerprint(null, null, null);
  const emptyId = hoverFingerprint("", "hard", rect);
  assert.notEqual(emptyId, hidden);
});
