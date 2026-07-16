import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { brotliCompressSync, gzipSync } from "node:zlib";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

// A small, deterministic fake bundle. Its exact byte sizes don't matter —
// the test derives the real gzip/brotli sizes from this same buffer so the
// limits below can be set precisely above or below the actual measurements.
const fixtureSource = Buffer.from(
  `// fake bundle for bundle-budget CLI test\n${"console.log('x');\n".repeat(200)}`,
  "utf8"
);

const actual = {
  rawBytes: fixtureSource.length,
  gzip9Bytes: gzipSync(fixtureSource, { level: 9 }).length,
  brotliBytes: brotliCompressSync(fixtureSource).length
};

async function writeFixtures(limits: Record<string, number>) {
  const dir = await mkdtemp(path.join(tmpdir(), "dlens-bundle-budget-"));
  const bundlePath = path.join(dir, "fixture-bundle.js");
  const limitsPath = path.join(dir, "fixture-limits.json");
  await writeFile(bundlePath, fixtureSource);
  await writeFile(limitsPath, JSON.stringify({ threads: limits }, null, 2), "utf8");
  return { bundlePath, limitsPath };
}

function runGuard(bundlePath: string, limitsPath: string) {
  return execFileAsync(
    process.execPath,
    ["scripts/check-ui-bundle-budget.mjs", bundlePath, limitsPath],
    { cwd: repoRoot, maxBuffer: 1024 * 1024 }
  );
}

test("bundle-budget CLI exits 0 and prints numbers when the fixture is within every limit", async () => {
  const { bundlePath, limitsPath } = await writeFixtures({
    rawBytes: actual.rawBytes + 1,
    gzip9Bytes: actual.gzip9Bytes + 1,
    brotliBytes: actual.brotliBytes + 1
  });

  const { stdout } = await runGuard(bundlePath, limitsPath);
  assert.match(stdout, new RegExp(`rawBytes: ${actual.rawBytes} / ${actual.rawBytes + 1} bytes`));
  assert.match(stdout, new RegExp(`gzip9Bytes: ${actual.gzip9Bytes} / ${actual.gzip9Bytes + 1} bytes`));
  assert.match(stdout, new RegExp(`brotliBytes: ${actual.brotliBytes} / ${actual.brotliBytes + 1} bytes`));
  assert.doesNotMatch(stdout, /OVER BUDGET/);
});

test("bundle-budget CLI exits 1 and reports rawBytes when only the raw limit is exceeded", async () => {
  const { bundlePath, limitsPath } = await writeFixtures({
    rawBytes: actual.rawBytes - 1,
    gzip9Bytes: actual.gzip9Bytes + 1,
    brotliBytes: actual.brotliBytes + 1
  });

  await assert.rejects(runGuard(bundlePath, limitsPath), (error: any) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, new RegExp(`rawBytes: ${actual.rawBytes} / ${actual.rawBytes - 1} bytes  <-- OVER BUDGET`));
    assert.doesNotMatch(error.stdout, /gzip9Bytes:.*OVER BUDGET/);
    assert.doesNotMatch(error.stdout, /brotliBytes:.*OVER BUDGET/);
    return true;
  });
});

test("bundle-budget CLI exits 1 and reports gzip9Bytes when only the gzip limit is exceeded", async () => {
  const { bundlePath, limitsPath } = await writeFixtures({
    rawBytes: actual.rawBytes + 1,
    gzip9Bytes: actual.gzip9Bytes - 1,
    brotliBytes: actual.brotliBytes + 1
  });

  await assert.rejects(runGuard(bundlePath, limitsPath), (error: any) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, new RegExp(`gzip9Bytes: ${actual.gzip9Bytes} / ${actual.gzip9Bytes - 1} bytes  <-- OVER BUDGET`));
    assert.doesNotMatch(error.stdout, /rawBytes:.*OVER BUDGET/);
    assert.doesNotMatch(error.stdout, /brotliBytes:.*OVER BUDGET/);
    return true;
  });
});

test("bundle-budget CLI exits 1 and reports brotliBytes when only the brotli limit is exceeded", async () => {
  const { bundlePath, limitsPath } = await writeFixtures({
    rawBytes: actual.rawBytes + 1,
    gzip9Bytes: actual.gzip9Bytes + 1,
    brotliBytes: actual.brotliBytes - 1
  });

  await assert.rejects(runGuard(bundlePath, limitsPath), (error: any) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, new RegExp(`brotliBytes: ${actual.brotliBytes} / ${actual.brotliBytes - 1} bytes  <-- OVER BUDGET`));
    assert.doesNotMatch(error.stdout, /rawBytes:.*OVER BUDGET/);
    assert.doesNotMatch(error.stdout, /gzip9Bytes:.*OVER BUDGET/);
    return true;
  });
});
