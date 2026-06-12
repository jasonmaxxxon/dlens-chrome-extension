import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

async function writeTrace(name: string, trace: unknown[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "dlens-trace-summary-"));
  const tracePath = path.join(dir, name);
  await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  return tracePath;
}

async function runNode(args: string[]) {
  return execFileAsync(process.execPath, args, {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024
  });
}

const completeTypedTrace = [
  { id: 1, phase: "hover.detected", step: "content.hover.publish", target: { tabId: 7 }, result: "ok", requestId: "req-1", at: 10, isoTime: "2026-06-12T00:00:00.010Z" },
  { id: 2, phase: "preview.confirmed", step: "content.collect.click.capture", target: { sessionId: "session-1", tabId: 7 }, result: "ok", requestId: "req-1", at: 42, isoTime: "2026-06-12T00:00:00.042Z" },
  { id: 3, phase: "signal.saved", step: "background.session.save-current-preview.response", target: { sessionId: "session-1", signalId: "signal-1", tabId: 7 }, result: "ok", requestId: "req-1", at: 95, isoTime: "2026-06-12T00:00:00.095Z" },
  { id: 4, phase: "crawl.queued", step: "background.queue-session-item.response", target: { sessionId: "session-1", itemId: "item-1", tabId: 7 }, result: "pending", requestId: "req-2", at: 140, isoTime: "2026-06-12T00:00:00.140Z" },
  { id: 5, phase: "capture.ready", step: "background.session.refresh-all.response", target: { sessionId: "session-1", itemId: "item-1", tabId: 7 }, result: "ok", requestId: "req-3", at: 260, isoTime: "2026-06-12T00:00:00.260Z" },
  { id: 6, phase: "analysis.ready", step: "popup.product.analyze.response", target: { sessionId: "session-1", signalId: "signal-1" }, result: "ok", requestId: "req-4", at: 410, isoTime: "2026-06-12T00:00:00.410Z" },
  { id: 7, phase: "ui.ready", step: "popup.product.vm.ready", target: { sessionId: "session-1" }, result: "ok", at: 455, isoTime: "2026-06-12T00:00:00.455Z" }
];

test("qa trace summary reports typed phase journey and terminal ui.ready", async () => {
  const tracePath = await writeTrace("complete-trace.json", completeTypedTrace);
  const summaryPath = path.join(path.dirname(tracePath), "summary.json");
  const markdownPath = path.join(path.dirname(tracePath), "summary.md");

  await runNode([
    "scripts/qa-trace-summary.mjs",
    "--trace", tracePath,
    "--out", summaryPath,
    "--markdown", markdownPath,
    "--label", "typed-smoke",
    "--require-terminal", "ui.ready"
  ]);

  const summary = JSON.parse(await readFile(summaryPath, "utf8"));
  assert.equal(summary.status, "pass");
  assert.equal(summary.eventCount, 7);
  assert.deepEqual(summary.phaseCounts, {
    "analysis.ready": 1,
    "capture.ready": 1,
    "crawl.queued": 1,
    "hover.detected": 1,
    "preview.confirmed": 1,
    "signal.saved": 1,
    "ui.ready": 1
  });
  assert.deepEqual(summary.terminal, {
    requiredPhase: "ui.ready",
    reached: true,
    eventId: 7,
    step: "popup.product.vm.ready",
    result: "ok",
    at: 455,
    target: { sessionId: "session-1" }
  });
  assert.equal(summary.firstError, null);
  assert.deepEqual(summary.phaseJourney.map((hop: { phase: string }) => hop.phase), [
    "hover.detected",
    "preview.confirmed",
    "signal.saved",
    "crawl.queued",
    "capture.ready",
    "analysis.ready",
    "ui.ready"
  ]);
  assert.deepEqual(
    summary.phaseTransitions.map((transition: { fromPhase: string; toPhase: string; latencyMs: number }) => ({
      fromPhase: transition.fromPhase,
      toPhase: transition.toPhase,
      latencyMs: transition.latencyMs
    })),
    [
      { fromPhase: "hover.detected", toPhase: "preview.confirmed", latencyMs: 32 },
      { fromPhase: "preview.confirmed", toPhase: "signal.saved", latencyMs: 53 },
      { fromPhase: "signal.saved", toPhase: "crawl.queued", latencyMs: 45 },
      { fromPhase: "crawl.queued", toPhase: "capture.ready", latencyMs: 120 },
      { fromPhase: "capture.ready", toPhase: "analysis.ready", latencyMs: 150 },
      { fromPhase: "analysis.ready", toPhase: "ui.ready", latencyMs: 45 }
    ]
  );

  const markdown = await readFile(markdownPath, "utf8");
  assert.match(markdown, /Terminal `ui\.ready`: reached/);
  assert.match(markdown, /\| analysis\.ready -> ui\.ready \| 45 \|/);
});

test("qa trace summary fails the terminal gate when ui.ready is missing", async () => {
  const tracePath = await writeTrace("missing-ui-ready.json", completeTypedTrace.slice(0, -1));

  await assert.rejects(
    runNode([
      "scripts/qa-trace-summary.mjs",
      "--trace", tracePath,
      "--require-terminal", "ui.ready"
    ]),
    (error: any) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /Missing required terminal phase: ui\.ready/);
      assert.match(error.stdout, /"status": "fail"/);
      return true;
    }
  );
});

test("qa trace summary reports the first typed pipeline error", async () => {
  const tracePath = await writeTrace("error-trace.json", [
    ...completeTypedTrace.slice(0, 4),
    { id: 5, phase: "capture.ready", step: "background.session.refresh-all.response", target: { sessionId: "session-1", itemId: "item-1" }, result: "error", requestId: "req-3", at: 260, isoTime: "2026-06-12T00:00:00.260Z", detail: { error: "Backend offline" } }
  ]);

  await assert.rejects(
    runNode([
      "scripts/qa-trace-summary.mjs",
      "--trace", tracePath,
      "--require-terminal", "ui.ready"
    ]),
    (error: any) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /Missing required terminal phase: ui\.ready|First pipeline error: capture\.ready/);
      const summary = JSON.parse(error.stdout);
      assert.equal(summary.status, "fail");
      assert.deepEqual(summary.firstError, {
        eventId: 5,
        phase: "capture.ready",
        step: "background.session.refresh-all.response",
        event: null,
        at: 260,
        isoTime: "2026-06-12T00:00:00.260Z",
        target: { sessionId: "session-1", itemId: "item-1" },
        detail: { error: "Backend offline" }
      });
      return true;
    }
  );
});

test("qa live pipeline harness gates a live trace dump on terminal ui.ready", async () => {
  const tracePath = await writeTrace("live-dump.json", completeTypedTrace);
  const evidencePath = path.join(path.dirname(tracePath), "live-harness.json");

  await runNode([
    "scripts/qa-live-pipeline-harness.mjs",
    "--trace", tracePath,
    "--out", evidencePath,
    "--label", "live-fixture",
    "--skip-build"
  ]);

  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.equal(evidence.type, "dlens-live-pipeline-harness");
  assert.deepEqual(evidence.build, { skipped: true });
  assert.deepEqual(evidence.assertions.terminalUiReady, {
    requiredPhase: "ui.ready",
    reached: true,
    eventId: 7,
    step: "popup.product.vm.ready"
  });
  assert.equal(evidence.summary.status, "pass");
});
