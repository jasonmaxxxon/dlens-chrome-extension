import assert from "node:assert/strict";
import test from "node:test";

import { buildPrSummaryDocx } from "../src/ui/pr-summary-export.ts";

test("buildPrSummaryDocx creates a Word-compatible docx package", async () => {
  const blob = buildPrSummaryDocx("# Campaign Summary\n\n## Executive Read\nCollected evidence only.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder().decode(bytes);

  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(text, /\[Content_Types\]\.xml/);
  assert.match(text, /word\/document\.xml/);
  assert.match(text, /Campaign Summary/);
});
