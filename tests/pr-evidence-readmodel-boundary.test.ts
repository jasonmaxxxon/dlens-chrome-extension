import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prEvidenceViewSource = readFileSync(new URL("../src/ui/PrEvidenceViews.tsx", import.meta.url), "utf8");
const prEvidenceViewModelSource = readFileSync(new URL("../src/viewmodel/pr-evidence.ts", import.meta.url), "utf8");
const appStateSource = readFileSync(new URL("../src/ui/useInPageCollectorAppState.ts", import.meta.url), "utf8");
const popupSource = readFileSync(new URL("../src/ui/InPageCollectorPopup.tsx", import.meta.url), "utf8");
const backgroundSource = readFileSync(new URL("../entrypoints/background.ts", import.meta.url), "utf8");

test("PrEvidence shell owns campaign rows and passes the VM boundary", () => {
  assert.doesNotMatch(prEvidenceViewSource, /pr\/list-campaigns/);
  assert.doesNotMatch(prEvidenceViewSource, /pr\/list-evidence-rows/);
  assert.match(appStateSource, /pr\/list-campaigns/);
  assert.match(appStateSource, /pr\/list-evidence-rows/);
  assert.doesNotMatch(popupSource, /resource=\{app\.prEvidenceResource\}/);
  assert.doesNotMatch(popupSource, /onResourceChange=\{app\.onPrEvidenceResourceChange\}/);
  assert.match(popupSource, /viewModel=\{app\.prEvidenceViewModel\}/);
  assert.match(popupSource, /onCommand=\{handlePrEvidenceCommand\}/);
});

test("PrEvidenceView is VM-in and command-out after the read model lift", () => {
  assert.doesNotMatch(prEvidenceViewSource, /sendExtensionMessage/);
  assert.doesNotMatch(prEvidenceViewSource, /buildPrEvidenceCsv(?:Rows)?/);
  assert.doesNotMatch(prEvidenceViewSource, /extractPrCoreMessages|inferPrViewsFromText|normalizePrCriteria/);
  assert.doesNotMatch(prEvidenceViewSource, /new Date\(|Date\.now\(|Math\.random/);
  assert.doesNotMatch(prEvidenceViewSource, /new Blob|URL\.createObjectURL|document\.createElement/);
  assert.doesNotMatch(prEvidenceViewSource, /exportPrSummaryMarkdown|exportPrSummaryDocx/);
  assert.match(prEvidenceViewSource, /viewModel:\s*PrEvidenceViewModel/);
  assert.match(prEvidenceViewSource, /onCommand:\s*\(command:\s*PrEvidenceCommand\)/);
  assert.match(popupSource, /viewModel=\{app\.prEvidenceViewModel\}/);
  assert.match(popupSource, /onCommand=\{handlePrEvidenceCommand\}/);
  assert.doesNotMatch(prEvidenceViewModelSource, /File\b|uploadBriefFile/);
  assert.match(prEvidenceViewModelSource, /requestBriefUpload/);
});

test("PR campaign save intent is stamped at the background storage boundary", () => {
  assert.match(backgroundSource, /case "pr\/save-campaign"/);
  assert.match(backgroundSource, /savePrCampaignDraft\(\s*chrome\.storage\.local,[\s\S]*createPrCampaignStamp\(\)/);
  assert.doesNotMatch(prEvidenceViewSource, /createdAt|updatedAt|Date\.now|Math\.random/);
});
