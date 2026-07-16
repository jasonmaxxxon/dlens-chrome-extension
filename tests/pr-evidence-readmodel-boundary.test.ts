import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readSourceFamily, readUiSourceFamily } from "./helpers/read-ui-source-family.ts";

const prEvidenceViewSource = readFileSync(new URL("../src/ui/PrEvidenceViews.tsx", import.meta.url), "utf8");
const prEvidenceViewModelSource = readFileSync(new URL("../src/viewmodel/pr-evidence.ts", import.meta.url), "utf8");
const prEvidenceResourceSource = readFileSync(new URL("../src/ui/pr-evidence-resource.ts", import.meta.url), "utf8");
const appStateSource = readFileSync(new URL("../src/ui/useInPageCollectorAppState.ts", import.meta.url), "utf8");
const popupSource = readFileSync(new URL("../src/ui/InPageCollectorPopup.tsx", import.meta.url), "utf8");
const backgroundSource = readFileSync(new URL("../entrypoints/background.ts", import.meta.url), "utf8");

// The facade file (PrEvidenceViews.tsx) is the only file required today, but a
// future wave splits it into a facade + sibling modules under src/ui/pr-evidence/
// (see UI_SOURCE_FAMILIES.PrEvidenceViews). Every forbidden-API check below must
// scan the whole family so a sibling module can't reintroduce direct messaging/
// storage/clock access unguarded once the split happens. The positive facade
// contract (viewModel/onCommand props) stays locked to the facade file only —
// future sibling modules are not required to re-declare that API.
const prEvidenceViewFamily = readUiSourceFamily("PrEvidenceViews");
const prEvidenceViewFamilySource = prEvidenceViewFamily.map((entry) => entry.source).join("\n");

test("PrEvidence shell owns campaign rows and passes the VM boundary", () => {
  assert.doesNotMatch(prEvidenceViewFamilySource, /pr\/list-campaigns/);
  assert.doesNotMatch(prEvidenceViewFamilySource, /pr\/list-evidence-rows/);
  assert.match(appStateSource, /pr\/list-campaigns/);
  assert.match(appStateSource, /pr\/list-evidence-rows/);
  assert.doesNotMatch(popupSource, /resource=\{app\.prEvidenceResource\}/);
  assert.doesNotMatch(popupSource, /onResourceChange=\{app\.onPrEvidenceResourceChange\}/);
  assert.match(popupSource, /viewModel=\{app\.prEvidenceViewModel\}/);
  assert.match(popupSource, /onCommand=\{handlePrEvidenceCommand\}/);
});

test("PrEvidenceView is VM-in and command-out after the read model lift", () => {
  assert.doesNotMatch(prEvidenceViewFamilySource, /sendExtensionMessage/);
  assert.doesNotMatch(prEvidenceViewFamilySource, /buildPrEvidenceCsv(?:Rows)?/);
  assert.doesNotMatch(prEvidenceViewFamilySource, /extractPrCoreMessages|inferPrViewsFromText|normalizePrCriteria/);
  assert.doesNotMatch(prEvidenceViewFamilySource, /new Date\(|Date\.now\(|Math\.random/);
  assert.doesNotMatch(prEvidenceViewFamilySource, /new Blob|URL\.createObjectURL|document\.createElement/);
  assert.doesNotMatch(prEvidenceViewFamilySource, /exportPrSummaryMarkdown|exportPrSummaryDocx/);
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
  assert.doesNotMatch(prEvidenceViewFamilySource, /createdAt|updatedAt|Date\.now|Math\.random/);
});

test("PR narrative state stays in the resource and ViewModel command boundary", () => {
  assert.match(prEvidenceResourceSource, /narrativeRead/);
  assert.match(prEvidenceResourceSource, /narrativeCurrentSourceHash/);
  assert.match(prEvidenceResourceSource, /narrativeError/);
  assert.match(prEvidenceViewModelSource, /kind:\s*"setLens"/);
  assert.match(prEvidenceViewModelSource, /kind:\s*"generateNarrative"/);
  assert.match(prEvidenceViewModelSource, /kind:\s*"selectNarrativeClaim"/);
  assert.doesNotMatch(prEvidenceViewModelSource, /sendExtensionMessage|chrome\.storage|Date\.now\(|Math\.random\(/);
});

test("family reader catches a forbidden API hidden in a nested PR evidence sibling (RED-first proof)", () => {
  const FIXTURE_FACADE = "tests/fixtures/pr-evidence-source-family/FacadeView.tsx";
  const FIXTURE_SIBLING_DIR = "tests/fixtures/pr-evidence-source-family/sibling";
  const forbiddenSendMessage = /sendExtensionMessage/;

  // RED: a guard that only reads the single hardcoded facade file (the old
  // approach this task replaces) never looks at the sibling directory, so it
  // misses the violation planted in sibling/nested/BadPrEvidenceModule.tsx.
  const facadeOnlySource = readFileSync(
    fileURLToPath(new URL("./fixtures/pr-evidence-source-family/FacadeView.tsx", import.meta.url)),
    "utf8"
  );
  assert.doesNotMatch(
    facadeOnlySource,
    forbiddenSendMessage,
    "sanity check: the violation must live in the nested sibling, not the facade file itself"
  );

  // GREEN: the family reader walks the sibling directory recursively (via
  // readSourceTree) and surfaces the violation the facade-only read missed.
  const family = readSourceFamily(FIXTURE_FACADE, FIXTURE_SIBLING_DIR);
  const offenders = family.filter((entry) => forbiddenSendMessage.test(entry.source));
  assert.ok(
    offenders.some((entry) => entry.relativePath.includes("sibling/nested/")),
    `expected the family scan to catch the nested fixture violation among: ${family.map((entry) => entry.relativePath).join(", ")}`
  );
});
