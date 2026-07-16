import assert from "node:assert/strict";
import test from "node:test";
import { readSourceTree } from "./helpers/read-source-tree.ts";

type AllowlistEntry = {
  file: string;
  pattern: RegExp;
  reason: string;
};

const ALLOWLIST: AllowlistEntry[] = [];

const uiDir = new URL("../src/ui/", import.meta.url);
const colorLiteralPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g;

function isAllowlisted(file: string, line: string): boolean {
  return ALLOWLIST.some((entry) => entry.file === file && entry.pattern.test(line));
}

// Recursively scans `root` (via readSourceTree) for color literals, skipping
// any relative path in `exclude`. `prefix` turns each relativePath into a
// repo-relative full path (e.g. "src/ui/nested/Foo.tsx") for allowlisting.
function findColorLiteralViolations(root: URL, prefix: string, exclude: Set<string>): string[] {
  const violations: string[] = [];

  for (const { relativePath, source } of readSourceTree(root)) {
    if (exclude.has(relativePath)) continue;

    const file = `${prefix}/${relativePath}`;
    source.split("\n").forEach((line, index) => {
      if (isAllowlisted(file, line)) return;

      for (const match of line.matchAll(colorLiteralPattern)) {
        violations.push(`${file}:${index + 1}: ${match[0]}`);
      }
    });
  }

  return violations;
}

test("color literal allowlist entries document a narrow reason", () => {
  const missingReasons = ALLOWLIST.filter((entry) => entry.reason.trim().length === 0).map((entry) => entry.file);

  assert.deepEqual(missingReasons, [], "every color literal allowlist entry must carry a reason");
});

test("recursive scan catches a nested color literal a first-level scan would miss", () => {
  // tests/fixtures/ui-color-literal/nested/BadView.tsx hardcodes #ff0000 one
  // directory below the fixture root. A first-level-only readdirSync scan
  // (the guard's old approach) never descends into nested/ and misses it;
  // readSourceTree's recursive walk catches it.
  const fixtureDir = new URL("./fixtures/ui-color-literal/", import.meta.url);
  const violations = findColorLiteralViolations(fixtureDir, "fixtures/ui-color-literal", new Set());

  assert.ok(
    violations.some((v) => v.includes("nested/BadView.tsx")),
    `expected recursive scan to catch the nested fixture violation:\n${violations.join("\n")}`
  );
});

test("src/ui files use color tokens instead of hard-coded literals", () => {
  const violations = findColorLiteralViolations(uiDir, "src/ui", new Set(["tokens.ts"]));

  assert.deepEqual(
    violations,
    [],
    `src/ui color literals must route through tokens.ts:\n${violations.join("\n")}`
  );
});
