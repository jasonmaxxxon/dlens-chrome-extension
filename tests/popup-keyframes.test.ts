import assert from "node:assert/strict";
import test from "node:test";

import { buildPopupTokenCss } from "../src/ui/usePopupKeyframes.ts";

test("buildPopupTokenCss carries the popup's fonts and :root token bridge", () => {
  const css = buildPopupTokenCss();

  assert.match(css, /--dlens-canvas-deep/);
  // The popup's display + mono fonts must load, or headings fall back to Times.
  assert.match(css, /@import url\("https:\/\/fonts\.googleapis\.com.*Instrument\+Serif/);
});

test("buildPopupTokenCss no longer bundles keyframes — the shared registry owns them", () => {
  // Keyframes now come from ensureDlensKeyframes so the Threads document holds one copy,
  // not one from the content script and one from the popup hook.
  assert.doesNotMatch(buildPopupTokenCss(), /@keyframes/);
});
