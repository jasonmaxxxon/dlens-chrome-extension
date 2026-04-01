import assert from "node:assert/strict";
import test from "node:test";

import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { createEmptyTabState } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { applyHoveredPreview, createInlineToast, isDescriptorSavedInFolder, setCollectModeState } from "../src/state/ui-state.ts";

function makeDescriptor(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    target_type: "post",
    page_url: "https://www.threads.net/@alpha/post/abc",
    post_url: "https://www.threads.net/@alpha/post/abc?x=1#y",
    author_hint: "alpha",
    text_snippet: "alpha snippet",
    time_token_hint: "1h",
    dom_anchor: "card-1",
    engagement: {
      likes: 12,
      comments: 3,
      reposts: 2,
      forwards: 1,
      views: 100
    },
    engagement_present: {
      likes: true,
      comments: true,
      reposts: true,
      forwards: true,
      views: true
    },
    captured_at: "2026-03-25T10:00:00Z",
    ...overrides
  };
}

test("setCollectModeState toggles banner and clears hover state when disabled", () => {
  const descriptor = makeDescriptor();
  const enabled = setCollectModeState(
    applyHoveredPreview(createEmptyTabState(), descriptor),
    true
  );

  assert.equal(enabled.selectionMode, true);
  assert.equal(enabled.collectModeBannerVisible, true);
  assert.deepEqual(enabled.hoveredTarget, descriptor);
  assert.equal(enabled.hoveredTargetStrength, "hard");

  const disabled = setCollectModeState(enabled, false);
  assert.equal(disabled.selectionMode, false);
  assert.equal(disabled.collectModeBannerVisible, false);
  assert.equal(disabled.hoveredTarget, null);
  assert.equal(disabled.hoveredTargetStrength, null);
  assert.equal(disabled.flashPreview, null);
});

test("applyHoveredPreview updates currentPreview and flashPreview without clearing currentPreview on hover leave", () => {
  const descriptor = makeDescriptor();
  const hovered = applyHoveredPreview(createEmptyTabState(), descriptor);

  assert.deepEqual(hovered.currentPreview, descriptor);
  assert.deepEqual(hovered.hoveredTarget, descriptor);
  assert.equal(hovered.hoveredTargetStrength, "hard");
  assert.deepEqual(hovered.flashPreview, descriptor);

  const cleared = applyHoveredPreview(hovered, null);
  assert.deepEqual(cleared.currentPreview, descriptor);
  assert.equal(cleared.hoveredTarget, null);
  assert.equal(cleared.hoveredTargetStrength, null);
  assert.equal(cleared.flashPreview, null);
});

test("createInlineToast uses folder copy for saved and queued actions", () => {
  assert.equal(createInlineToast("saved", "Signals", "2026-03-25T10:00:00Z").message, "Saved to Signals");
  assert.equal(createInlineToast("queued", "Signals", "2026-03-25T10:00:01Z").message, "Queued from Signals");
});

test("isDescriptorSavedInFolder normalizes post_url", () => {
  const folder = createSessionRecord("Signals", "2026-03-25T10:00:00Z");
  folder.items.push(createSessionItem(makeDescriptor({ post_url: "https://www.threads.net/@alpha/post/abc/" }), "2026-03-25T10:00:01Z"));

  assert.equal(isDescriptorSavedInFolder(folder, makeDescriptor()), true);
  assert.equal(isDescriptorSavedInFolder(folder, makeDescriptor({ post_url: "https://www.threads.net/@alpha/post/def" })), false);
});
