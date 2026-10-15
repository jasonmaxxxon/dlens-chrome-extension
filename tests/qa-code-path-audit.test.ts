import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("analyzer materialization remains the sole current Product Reading producer", async () => {
  const [materializer, background, provider] = await Promise.all([
    readFile(new URL("../src/compare/product-analysis-reading.ts", import.meta.url), "utf8"),
    readFile(new URL("../entrypoints/background.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/compare/provider.ts", import.meta.url), "utf8")
  ]);
  assert.match(materializer, /export function materializeProductAnalysisReading/);
  assert.equal([...background.matchAll(/materializeProductAnalysisReading\s*\(/g)].length, 1);
  assert.doesNotMatch(provider, /export async function generateSignalReading\s*\(/);
  assert.doesNotMatch(background, /case "product\/synthesize-signal-reading"/);
});
