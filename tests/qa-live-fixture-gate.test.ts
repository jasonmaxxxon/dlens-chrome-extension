import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const fixturePath = "docs/qa/assets/2026-06-13/full-live-backend-llm/live-trace-full-hover-save-queue-analysis.json";
const requiredPhases = [
  "hover.detected",
  "preview.confirmed",
  "signal.saved",
  "backend.request",
  "crawl.queued",
  "capture.ready",
  "llm.call",
  "analysis.ready",
  "ui.ready"
];

test("qa harness fixture script gates the committed full live trace on terminal ui.ready", async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const script = packageJson.scripts?.["qa:harness:fixture"] ?? "";
  assert.match(script, new RegExp(fixturePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(packageJson.scripts?.["qa:harness:fixture"] ?? "", /qa-live-pipeline-harness\.mjs/);
  assert.match(packageJson.scripts?.["qa:harness:fixture"] ?? "", /--terminal ui\.ready/);
  for (const phase of requiredPhases) {
    assert.match(script, new RegExp(phase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const fixture = JSON.parse(await readFile(path.join(repoRoot, fixturePath), "utf8"));
  assert.equal(Array.isArray(fixture), true);
  assert.equal(fixture.some((entry: any) => entry?.phase === "ui.ready" && entry?.result === "ok"), true);
  for (const phase of requiredPhases) {
    assert.equal(fixture.some((entry: any) => entry?.phase === phase && entry?.result === "ok"), true);
  }

  const evidenceDir = await mkdtemp(path.join(tmpdir(), "dlens-live-fixture-"));
  const evidencePath = path.join(evidenceDir, "fixture-harness.json");
  await execFileAsync("npm", ["run", "qa:harness:fixture", "--", "--out", evidencePath], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024
  });

  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.equal(evidence.status, "pass");
  assert.equal(evidence.traceSource.mode, "trace-file");
  assert.equal(evidence.assertions.terminalUiReady.requiredPhase, "ui.ready");
  assert.equal(evidence.assertions.terminalUiReady.reached, true);
  assert.equal(evidence.assertions.noPipelineError.ok, true);
});

test("CI runs the live fixture harness gate after build", async () => {
  const workflow = await readFile(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  const buildIndex = workflow.indexOf("npm run build");
  const fixtureIndex = workflow.indexOf("npm run qa:harness:fixture");
  assert.notEqual(buildIndex, -1);
  assert.notEqual(fixtureIndex, -1);
  assert.equal(fixtureIndex > buildIndex, true);
});
