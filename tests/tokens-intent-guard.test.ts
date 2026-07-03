import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const intent = readFileSync(new URL("../src/ui/tokens-intent.md", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/ui/tokens.ts", import.meta.url), "utf8");

test("tokens-intent.md contains no literal design values", () => {
  const banned: Array<[RegExp, string]> = [
    [/#[0-9a-fA-F]{3,8}\b/, "hex color"],
    [/rgba?\(/, "rgb/rgba color"],
    [/\b\d+(\.\d+)?px\b/, "pixel value"],
    [/\b\d+(\.\d+)?ms\b/, "millisecond duration"],
    [/cubic-bezier/, "easing curve"],
  ];

  for (const [pattern, label] of banned) {
    const match = intent.match(pattern);
    assert.equal(
      match,
      null,
      `tokens-intent.md must not contain a literal ${label} (found "${match?.[0]}"); design values live only in tokens.ts`
    );
  }
});

test("every token path cited in tokens-intent.md exists in tokens.ts", () => {
  const tokenNamespaces = /^(tokens|color|radius|shadow|effect|motion|spacing|font|textStyles|modeThemes|TOKENS)\./;
  const cited = intent.match(/`[a-zA-Z][a-zA-Z0-9.]*`/g) ?? [];
  const missing: string[] = [];

  for (const raw of cited) {
    const name = raw.slice(1, -1);
    if (!tokenNamespaces.test(name)) continue;
    if (/\.(ts|tsx|md)$/.test(name)) continue;
    const leaf = name.split(".").pop()!;
    if (!source.includes(leaf)) missing.push(name);
  }

  assert.deepEqual(missing, [], "tokens-intent.md cites token paths that do not exist in tokens.ts");
});

test("tokens-intent.md stays within its hard cap", () => {
  const lines = intent.split("\n").length;
  assert.ok(lines <= 160, `tokens-intent.md is ${lines} lines; cap is ~150 — replace content, don't append`);
});
