import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { findUnauthorizedRawStorage } from "../scripts/check-no-raw-storage.mjs";

test("flags raw chrome.storage.local.set without marker", () => {
  const source = `await chrome.storage.local.set({ foo: 1 });`;
  const { findings } = findUnauthorizedRawStorage(source);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].op, "set");
});

test("flags raw chrome.storage.local.remove without marker", () => {
  const source = `await chrome.storage.local.remove("legacy-key");`;
  const { findings } = findUnauthorizedRawStorage(source);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].op, "remove");
});

test("flags raw chrome.storage.local.clear without marker", () => {
  const source = `await chrome.storage.local.clear();`;
  const { findings } = findUnauthorizedRawStorage(source);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].op, "clear");
});

test("allows raw set with TODO(seam-bypass) marker on previous line", () => {
  const source = [
    `// TODO(seam-bypass): test-key`,
    `await chrome.storage.local.set({ foo: 1 });`
  ].join("\n");
  const { findings, allowlisted } = findUnauthorizedRawStorage(source);
  assert.equal(findings.length, 0);
  assert.equal(allowlisted.length, 1);
});

test("allows raw set with trailing same-line marker", () => {
  const source = `await chrome.storage.local.set({ foo: 1 }); // TODO(seam-bypass): trailing-key`;
  const { findings, allowlisted } = findUnauthorizedRawStorage(source);
  assert.equal(findings.length, 0);
  assert.equal(allowlisted.length, 1);
});

test("rejects marker two lines above (must be immediately preceding)", () => {
  const source = [
    `// TODO(seam-bypass): too-far`,
    `const intermediate = 1;`,
    `await chrome.storage.local.set({ foo: 1 });`
  ].join("\n");
  const { findings } = findUnauthorizedRawStorage(source);
  assert.equal(findings.length, 1);
});

test("does not flag chrome.storage.local.get (read is unrestricted)", () => {
  const source = `const raw = await chrome.storage.local.get("key");`;
  const { findings } = findUnauthorizedRawStorage(source);
  assert.equal(findings.length, 0);
});

test("does not flag DI pattern passing chrome.storage.local as argument", () => {
  const source = `await loadSignals(chrome.storage.local, sessionId);`;
  const { findings } = findUnauthorizedRawStorage(source);
  assert.equal(findings.length, 0);
});

test("entrypoints/background.ts has zero unauthorized raw writes", () => {
  const source = readFileSync("entrypoints/background.ts", "utf8");
  const { findings, allowlisted } = findUnauthorizedRawStorage(source, {
    filePath: "entrypoints/background.ts"
  });
  assert.deepEqual(
    findings,
    [],
    `unauthorized raw writes:\n${findings.map((f) => `  ${f.filePath}:${f.line} ${f.op}  ${f.snippet}`).join("\n")}`
  );
  assert.ok(allowlisted.length > 0, "expected at least one allowlisted legacy bypass");
});
