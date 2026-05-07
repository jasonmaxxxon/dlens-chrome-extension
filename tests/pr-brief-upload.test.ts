import assert from "node:assert/strict";
import test from "node:test";

import {
  extractPdfTextFromBytes,
  isSupportedPrBriefFile,
  readPrBriefFile
} from "../src/ui/pr-brief-upload.ts";

function bytesFromBinary(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

test("readPrBriefFile accepts plain text press release files", async () => {
  const result = await readPrBriefFile({
    name: "boostup.md",
    size: 42,
    type: "text/markdown",
    text: async () => "Mannings BoostUP press release",
    arrayBuffer: async () => new ArrayBuffer(0)
  } as any);

  assert.equal(result.sourceKind, "text");
  assert.equal(result.inferredName, "boostup");
  assert.match(result.text, /Mannings BoostUP/);
});

test("isSupportedPrBriefFile allows PDF and rejects unsupported binary files", () => {
  assert.equal(isSupportedPrBriefFile({ name: "press-release.pdf", type: "application/pdf" } as any), true);
  assert.equal(isSupportedPrBriefFile({ name: "press-release.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as any), false);
});

test("extractPdfTextFromBytes reads simple ToUnicode text-based PDFs", async () => {
  const pdf = `%PDF-1.7
1 0 obj
<</Type/Page/Resources<</Font<</F1 2 0 R>>>>/Contents 3 0 R>>
endobj
2 0 obj
<</Type/Font/Subtype/Type0/ToUnicode 4 0 R>>
endobj
3 0 obj
<</Length 68>>
stream
BT
/F1 12 Tf
1 0 0 1 54 700 Tm
[<0001><0002><0003><0004>] TJ
ET
endstream
endobj
4 0 obj
<</Length 128>>
stream
begincmap
beginbfchar
<0001> <842C>
<0002> <5BE7>
<0003> <0042>
<0004> <006F>
endbfchar
endcmap
endstream
endobj`;

  const text = await extractPdfTextFromBytes(bytesFromBinary(pdf));

  assert.match(text, /萬寧Bo/);
});
