import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveLoadState,
  deriveProductSignalLoadState,
  deriveTopicLoadState
} from "../src/state/load-state.ts";

test("deriveLoadState gives one explicit answer for a data region", () => {
  assert.equal(deriveLoadState({ isLoading: true, hasData: false }), "loading");
  assert.equal(deriveLoadState({ isLoading: true, hasData: true }), "ready");
  assert.equal(deriveLoadState({ hasData: false }), "empty");
  assert.equal(deriveLoadState({ hasError: true }), "error");
  assert.equal(deriveLoadState({ hasError: true, isRecovering: true }), "recovering");
});

test("deriveProductSignalLoadState preserves Product hydration and recovered-analysis behavior", () => {
  assert.equal(
    deriveProductSignalLoadState({ isHydrating: true, signalCount: 0, analysisCount: 0, hasError: false }),
    "loading"
  );
  assert.equal(
    deriveProductSignalLoadState({ isHydrating: false, signalCount: 0, analysisCount: 1, hasError: false }),
    "recovering"
  );
  assert.equal(
    deriveProductSignalLoadState({ isHydrating: false, signalCount: 1, analysisCount: 0, hasError: false }),
    "empty"
  );
  assert.equal(
    deriveProductSignalLoadState({ isHydrating: false, signalCount: 1, analysisCount: 1, hasError: false }),
    "ready"
  );
  assert.equal(
    deriveProductSignalLoadState({ isHydrating: true, signalCount: 0, analysisCount: 1, hasError: true }),
    "error"
  );
});

test("deriveTopicLoadState keeps stale Topic data visible while hydration recovers", () => {
  assert.equal(
    deriveTopicLoadState({ isHydrating: true, topicCount: 0, signalCount: 0, hasError: false }),
    "loading"
  );
  assert.equal(
    deriveTopicLoadState({ isHydrating: false, topicCount: 0, signalCount: 0, hasError: false }),
    "empty"
  );
  assert.equal(
    deriveTopicLoadState({ isHydrating: false, topicCount: 1, signalCount: 0, hasError: false }),
    "ready"
  );
  assert.equal(
    deriveTopicLoadState({ isHydrating: false, topicCount: 0, signalCount: 0, hasError: true }),
    "error"
  );
  assert.equal(
    deriveTopicLoadState({ isHydrating: false, topicCount: 1, signalCount: 2, hasError: true }),
    "recovering"
  );
});
