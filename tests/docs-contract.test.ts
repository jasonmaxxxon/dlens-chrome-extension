import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import test from "node:test";

function readRepoFile(relativePath: string): string {
  const fileUrl = new URL(`../${relativePath}`, import.meta.url);
  assert.equal(existsSync(fileUrl), true, `${relativePath} must exist`);
  return readFileSync(fileUrl, "utf8");
}

test("code review checklist covers the committed engineering review gates", () => {
  const checklist = readRepoFile("docs/CODE_REVIEW.md");

  for (const pattern of [
    /snapshot write path/i,
    /lock seam/i,
    /migration plan/i,
    /LLM[\s\S]*fallback/i,
    /usage accounting/i,
    /React prop stability/i,
    /mount-time fetches/i,
    /response shape[\s\S]*optional fields/i,
    /message handler[\s\S]*RMW/i
  ]) {
    assert.match(checklist, pattern);
  }
});

test("pull request template links the code review checklist", () => {
  const template = readRepoFile(".github/pull_request_template.md");

  assert.match(template, /docs\/CODE_REVIEW\.md/);
  assert.match(template, /Code review checklist/i);
});
