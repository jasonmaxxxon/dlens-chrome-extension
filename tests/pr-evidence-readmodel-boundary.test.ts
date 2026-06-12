import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prEvidenceViewSource = readFileSync(new URL("../src/ui/PrEvidenceViews.tsx", import.meta.url), "utf8");
const appStateSource = readFileSync(new URL("../src/ui/useInPageCollectorAppState.ts", import.meta.url), "utf8");
const popupSource = readFileSync(new URL("../src/ui/InPageCollectorPopup.tsx", import.meta.url), "utf8");

test("PrEvidenceView receives campaign rows as a shell-owned resource", () => {
  assert.doesNotMatch(prEvidenceViewSource, /pr\/list-campaigns/);
  assert.doesNotMatch(prEvidenceViewSource, /pr\/list-evidence-rows/);
  assert.match(appStateSource, /pr\/list-campaigns/);
  assert.match(appStateSource, /pr\/list-evidence-rows/);
  assert.match(popupSource, /resource=\{app\.prEvidenceResource\}/);
  assert.match(popupSource, /onResourceChange=\{app\.onPrEvidenceResourceChange\}/);
});
