import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const auditFixtureFiles = [
  "scripts/qa-code-path-audit.mjs",
  "entrypoints/threads.content.ts",
  "src/ui/ProductSignalViews.tsx",
  "src/compare/product-analysis-reading.ts",
  "src/ui/useInPageCollectorAppState.ts",
  "entrypoints/background.ts",
  "src/state/store-helpers.ts"
];

async function writeAuditFixture() {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "dlens-code-path-audit-"));
  for (const relativePath of auditFixtureFiles) {
    const destination = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(repoRoot, relativePath), destination);
  }

  const productViewPath = path.join(fixtureRoot, "src/ui/ProductSignalViews.tsx");
  const productViewSource = await readFile(productViewPath, "utf8");
  const detachedSource = productViewSource.replace(
    "<VerdictFilterTiles stats={stats} selectedKey={completed.length ? resolvedFilter : null} onSelect={selectFilter} />",
    "<div data-test-detached-verdict-tiles=\"true\" />"
  );
  assert.notEqual(detachedSource, productViewSource, "fixture must remove the ProductActionStage VerdictFilterTiles mount");
  await writeFile(productViewPath, detachedSource, "utf8");
  return fixtureRoot;
}

test("B-07 fails when VerdictFilterTiles is defined but not mounted in ProductActionStage", async () => {
  const fixtureRoot = await writeAuditFixture();
  try {
    const { stdout } = await execFileAsync(process.execPath, ["scripts/qa-code-path-audit.mjs"], {
      cwd: fixtureRoot,
      maxBuffer: 1024 * 1024
    });
    const audit = JSON.parse(stdout) as { checks: Array<{ id: string; status: string }> };
    const b07 = audit.checks.find((check) => check.id === "B-07");

    assert.equal(b07?.status, "fail");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("B-08 identifies analyzer materialization as the sole Product Reading producer", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["scripts/qa-code-path-audit.mjs"], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024
  });
  const audit = JSON.parse(stdout) as {
    checks: Array<{
      id: string;
      status: string;
      summary: string;
      evidence?: {
        producerHits?: unknown[];
        legacyProducerHits?: unknown[];
        readingCardHits?: unknown[];
      };
    }>;
  };
  const b08 = audit.checks.find((check) => check.id === "B-08");

  assert.equal(b08?.status, "pass");
  assert.match(b08?.summary ?? "", /sole Product Reading producer/);
  assert.ok((b08?.evidence?.producerHits?.length ?? 0) >= 2);
  assert.equal(b08?.evidence?.legacyProducerHits?.length, 0);
  assert.equal(b08?.evidence?.readingCardHits?.length, 1);
});
