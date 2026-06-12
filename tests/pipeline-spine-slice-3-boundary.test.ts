import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("pipeline slice 3 wires ui.ready terminal events from VM shell boundaries", () => {
  const popupSource = readRepoFile("src/ui/InPageCollectorPopup.tsx");
  const resultSource = readRepoFile("src/ui/InPageCollectorResultWorkspace.tsx");

  assert.match(popupSource, /usePipelineUiReadyTrace/);
  assert.match(popupSource, /buildProductUiReadyEvent/);
  assert.match(popupSource, /buildTopicUiReadyEvent/);
  assert.match(popupSource, /buildPrEvidenceUiReadyEvent/);
  assert.match(resultSource, /usePipelineUiReadyTrace/);
  assert.match(resultSource, /buildCompareUiReadyEvent/);
});

test("VM builders stay pure and do not import the pipeline emitter", () => {
  const viewModelDir = new URL("../src/viewmodel/", import.meta.url);
  const files = readdirSync(viewModelDir).filter((file) => file.endsWith(".ts"));

  for (const file of files) {
    const source = readFileSync(new URL(file, viewModelDir), "utf8");
    assert.doesNotMatch(source, /emitPipelineEvent|pipeline-trace/, `${file} should not emit trace events directly`);
    assert.doesNotMatch(source, /from ["']react["']|useEffect|useMemo|useRef/, `${file} should stay outside React`);
    assert.doesNotMatch(source, /\bchrome\.|\bfetch\(|\bdocument\.|\bwindow\./, `${file} should not use runtime side effects`);
  }
});

test("slice 3 does not add the live QA harness or package script", () => {
  const packageSource = readRepoFile("package.json");
  assert.doesNotMatch(packageSource, /qa:trace|live-qa|smoke:pipeline|pipeline:harness/);
});
