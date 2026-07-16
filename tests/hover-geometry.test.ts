import assert from "node:assert/strict";
import test from "node:test";

import * as hoverGeometryModule from "../src/targeting/hover-geometry.ts";
import { hoverFingerprint, shouldPublishHover } from "../src/targeting/hover-geometry.ts";
import type { HoverRectInput } from "../src/targeting/hover-geometry.ts";

const rect = { top: 100, left: 50, width: 400, height: 200 };

type TestStrength = "soft" | "hard";

interface TestCard {
  id: string;
  rect: HoverRectInput;
  rectReads: number;
}

interface TestTarget {
  root: TestCard | null;
  strength: TestStrength | null;
}

interface TestPublication {
  cardId: string | null;
  strength: TestStrength | null;
  rect: HoverRectInput | null;
}

type TestFrameControllerFactory = (options: {
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  resolveCandidate(target: TestTarget): TestTarget;
  getCardId(card: TestCard): string;
  readRect(card: TestCard): HoverRectInput;
  publish(card: TestCard | null, strength: TestStrength | null, rect: HoverRectInput | null): void;
}) => {
  enqueue(target: TestTarget): void;
  cancel(): void;
};

function getFrameControllerFactory(): TestFrameControllerFactory {
  const factory = (
    hoverGeometryModule as unknown as {
      createHoverFrameController?: TestFrameControllerFactory;
    }
  ).createHoverFrameController;
  assert.equal(typeof factory, "function", "hover geometry must expose an injectable frame controller");
  return factory;
}

function makeCard(id: string, overrides: Partial<HoverRectInput> = {}): TestCard {
  return {
    id,
    rect: { ...rect, ...overrides },
    rectReads: 0
  };
}

function createFrameHarness() {
  let nextHandle = 1;
  const scheduled = new Map<number, () => void>();
  const cancelled: number[] = [];
  const publications: TestPublication[] = [];
  const controller = getFrameControllerFactory()({
    requestFrame(callback) {
      const handle = nextHandle;
      nextHandle += 1;
      scheduled.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) {
      cancelled.push(handle);
      scheduled.delete(handle);
    },
    resolveCandidate(target) {
      return target;
    },
    getCardId(card) {
      return card.id;
    },
    readRect(card) {
      card.rectReads += 1;
      return card.rect;
    },
    publish(card, strength, measuredRect) {
      publications.push({
        cardId: card?.id ?? null,
        strength,
        rect: measuredRect
      });
    }
  });

  return {
    controller,
    cancelled,
    publications,
    scheduled,
    flushNext() {
      const next = scheduled.entries().next().value as [number, () => void] | undefined;
      assert.ok(next, "expected a scheduled animation frame");
      const [handle, callback] = next;
      scheduled.delete(handle);
      callback();
    },
    peekNext() {
      const next = scheduled.entries().next().value as [number, () => void] | undefined;
      assert.ok(next, "expected a scheduled animation frame");
      return next;
    }
  };
}

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

test("hover frame controller coalesces a pointer burst to the latest target", () => {
  const harness = createFrameHarness();
  const first = makeCard("card-a");
  const second = makeCard("card-b");
  const latest = makeCard("card-c");

  harness.controller.enqueue({ root: first, strength: "hard" });
  harness.controller.enqueue({ root: second, strength: "soft" });
  harness.controller.enqueue({ root: latest, strength: "hard" });

  assert.equal(harness.scheduled.size, 1);
  harness.flushNext();
  assert.deepEqual(harness.publications.map((entry) => entry.cardId), ["card-c"]);
  assert.equal(first.rectReads, 0);
  assert.equal(second.rectReads, 0);
  assert.equal(latest.rectReads, 1);
});

test("hover frame controller publishes 1,000 stable-card frames only once", () => {
  const harness = createFrameHarness();
  const card = makeCard("card-a");

  for (let index = 0; index < 1000; index += 1) {
    harness.controller.enqueue({ root: card, strength: "hard" });
    harness.flushNext();
  }

  assert.equal(harness.publications.length, 1);
  assert.equal(card.rectReads, 1000);
});

test("hover frame controller publishes a different card object with the same id and geometry", () => {
  const harness = createFrameHarness();
  const original = makeCard("card-a");
  const replacement = makeCard("card-a");

  harness.controller.enqueue({ root: original, strength: "hard" });
  harness.flushNext();
  harness.controller.enqueue({ root: replacement, strength: "hard" });
  harness.flushNext();

  assert.equal(harness.publications.length, 2);
  assert.equal(original.rectReads, 1);
  assert.equal(replacement.rectReads, 1);
});

test("hover frame controller republishes the same card when geometry moves", () => {
  const harness = createFrameHarness();
  const card = makeCard("card-a");

  harness.controller.enqueue({ root: card, strength: "hard" });
  harness.flushNext();
  card.rect = { ...card.rect, top: card.rect.top - 120 };
  harness.controller.enqueue({ root: card, strength: "hard" });
  harness.flushNext();

  assert.equal(harness.publications.length, 2);
  assert.equal(harness.publications[1].rect?.top, -20);
});

test("hover frame controller publishes repeated hides only once", () => {
  const harness = createFrameHarness();

  for (let index = 0; index < 5; index += 1) {
    harness.controller.enqueue({ root: null, strength: null });
    harness.flushNext();
  }

  assert.deepEqual(harness.publications.map((entry) => entry.cardId), [null]);
});

test("navigation cancellation drops the queued target and cancels its frame", () => {
  const harness = createFrameHarness();
  const current = makeCard("card-current");
  const stale = makeCard("card-stale");

  harness.controller.enqueue({ root: current, strength: "hard" });
  harness.flushNext();
  harness.controller.enqueue({ root: stale, strength: "hard" });
  const [staleHandle, staleCallback] = harness.peekNext();

  harness.controller.cancel();

  assert.deepEqual(harness.cancelled, [staleHandle]);
  assert.deepEqual(harness.publications.map((entry) => entry.cardId), ["card-current", null]);
  staleCallback();
  assert.deepEqual(harness.publications.map((entry) => entry.cardId), ["card-current", null]);
  assert.equal(stale.rectReads, 0);
});

test("stop then restart cannot let the pre-stop frame consume the restarted target", () => {
  const harness = createFrameHarness();
  const stale = makeCard("card-stale");
  const restarted = makeCard("card-restarted");

  harness.controller.enqueue({ root: stale, strength: "hard" });
  const [, staleCallback] = harness.peekNext();
  harness.controller.cancel();
  harness.controller.enqueue({ root: restarted, strength: "hard" });

  staleCallback();
  assert.deepEqual(harness.publications.map((entry) => entry.cardId), [null]);
  harness.flushNext();
  assert.deepEqual(harness.publications.map((entry) => entry.cardId), [null, "card-restarted"]);
  assert.equal(stale.rectReads, 0);
  assert.equal(restarted.rectReads, 1);
});

test("hover frame controller reads the selected card rect once per processed frame", () => {
  const harness = createFrameHarness();
  const card = makeCard("card-a");

  harness.controller.enqueue({ root: card, strength: "hard" });
  harness.flushNext();

  assert.equal(card.rectReads, 1);
  assert.equal(harness.publications.length, 1);
});
