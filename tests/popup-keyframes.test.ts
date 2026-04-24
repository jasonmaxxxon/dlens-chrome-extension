import assert from "node:assert/strict";
import test from "node:test";

import { buildPopupKeyframeCss } from "../src/ui/usePopupKeyframes.ts";

test("buildPopupKeyframeCss keeps the warm-paper variables and popup animation tokens together", () => {
  const css = buildPopupKeyframeCss();

  assert.match(css, /--dlens-canvas-deep/);
  assert.match(css, /@keyframes dlens-popup-pulse/);
  assert.match(css, /@keyframes dlens-popup-shimmer/);
  assert.match(css, /@keyframes dlens-popup-indeterminate/);
});
