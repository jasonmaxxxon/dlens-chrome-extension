import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

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

test("color literal allowlist entries document a narrow reason", () => {
  const missingReasons = ALLOWLIST.filter((entry) => entry.reason.trim().length === 0).map((entry) => entry.file);

  assert.deepEqual(missingReasons, [], "every color literal allowlist entry must carry a reason");
});

test("src/ui files use color tokens instead of hard-coded literals", () => {
  const violations: string[] = [];
  const files = readdirSync(uiDir)
    .filter((name) => /\.(ts|tsx)$/.test(name))
    .filter((name) => name !== "tokens.ts")
    .sort();

  for (const name of files) {
    const file = join("src/ui", name);
    const source = readFileSync(new URL(name, uiDir), "utf8");
    const lines = source.split("\n");

    lines.forEach((line, index) => {
      if (isAllowlisted(file, line)) return;

      for (const match of line.matchAll(colorLiteralPattern)) {
        violations.push(`${file}:${index + 1}: ${match[0]}`);
      }
    });
  }

  assert.deepEqual(
    violations,
    [],
    `src/ui color literals must route through tokens.ts:\n${violations.join("\n")}`
  );
});
