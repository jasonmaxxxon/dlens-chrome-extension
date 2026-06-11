import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSessionItemActionTarget,
  buildSaveCurrentPreviewTarget,
  requireSessionItemActionTarget,
  requireSaveCurrentPreviewTarget
} from "../src/state/action-target.ts";

test("buildSaveCurrentPreviewTarget picks the visible session and topic target", () => {
  assert.deepEqual(
    buildSaveCurrentPreviewTarget({
      activeFolderMode: "topic",
      sessionId: "session-topic",
      selectedTopicId: "topic-selected",
      collectionTopicId: "topic-stored"
    }),
    {
      sessionId: "session-topic",
      topicId: "topic-selected"
    }
  );
});

test("buildSaveCurrentPreviewTarget does not leak topic ids into non-topic sessions", () => {
  assert.deepEqual(
    buildSaveCurrentPreviewTarget({
      activeFolderMode: "product",
      sessionId: "session-product",
      selectedTopicId: "topic-selected",
      collectionTopicId: "topic-stored"
    }),
    {
      sessionId: "session-product",
      topicId: null
    }
  );
});

test("buildSaveCurrentPreviewTarget returns null without an explicit session", () => {
  assert.equal(
    buildSaveCurrentPreviewTarget({
      activeFolderMode: "topic",
      sessionId: null,
      selectedTopicId: "topic-selected",
      collectionTopicId: "topic-stored"
    }),
    null
  );
});

test("requireSaveCurrentPreviewTarget rejects missing or blank message targets", () => {
  assert.throws(() => requireSaveCurrentPreviewTarget(undefined), /Explicit save target is required/);
  assert.throws(() => requireSaveCurrentPreviewTarget({ sessionId: " ", topicId: null }), /Explicit save target is required/);
});

test("buildSessionItemActionTarget requires both session and item identity", () => {
  assert.deepEqual(buildSessionItemActionTarget({ sessionId: "session-1", itemId: "item-1" }), {
    sessionId: "session-1",
    itemId: "item-1"
  });
  assert.equal(buildSessionItemActionTarget({ sessionId: "session-1", itemId: null }), null);
  assert.equal(buildSessionItemActionTarget({ sessionId: null, itemId: "item-1" }), null);
});

test("requireSessionItemActionTarget rejects missing or blank item targets", () => {
  assert.throws(() => requireSessionItemActionTarget(undefined), /Explicit item target is required/);
  assert.throws(() => requireSessionItemActionTarget({ sessionId: "session-1", itemId: " " }), /Explicit item target is required/);
});
