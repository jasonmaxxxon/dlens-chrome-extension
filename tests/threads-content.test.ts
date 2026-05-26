import assert from "node:assert/strict";
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
