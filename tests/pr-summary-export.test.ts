import assert from "node:assert/strict";
import test from "node:test";

import { buildPrSummaryDocxExport } from "../src/compare/pr-summary-export.ts";

test("buildPrSummaryDocxExport creates a Word-compatible docx package descriptor", () => {
  const file = buildPrSummaryDocxExport("# Campaign Summary\n\n## Executive Read\nCollected evidence only.", "Campaign");
  assert.ok(file.content instanceof Uint8Array);
  const bytes = file.content;
  const text = new TextDecoder().decode(bytes);

  assert.equal(file.mime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(file.filename, "Campaign-summary.docx");
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(text, /\[Content_Types\]\.xml/);
  assert.match(text, /word\/document\.xml/);
  assert.match(text, /Campaign Summary/);
});
