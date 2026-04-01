import test from "node:test";
import assert from "node:assert/strict";

import { buildSelectionModeMessage } from "../src/state/selection-mode-messages.ts";

test("buildSelectionModeMessage returns a disable message for manual cancel", () => {
  assert.deepEqual(buildSelectionModeMessage(false, "manual-cancel"), {
    type: "selection/mode-changed",
    enabled: false
  });
});

test("buildSelectionModeMessage suppresses disable messages after a completed selection", () => {
  assert.equal(buildSelectionModeMessage(false, "selection-complete"), null);
});
