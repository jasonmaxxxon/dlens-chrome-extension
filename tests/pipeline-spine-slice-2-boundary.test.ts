import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("pipeline event and message contracts carry requestId for response correlation", () => {
  const traceSource = readRepoFile("src/state/pipeline-trace.ts");
  const messageSource = readRepoFile("src/state/messages.ts");

  assert.match(traceSource, /requestId\?: string/);
  assert.match(messageSource, /requestId\?: string/);
});

test("collect to capture background boundary emits every vertical phase with requestId", () => {
  const source = readRepoFile("entrypoints/background.ts");

  assert.match(source, /emitPipelineEvent/);
  for (const step of [
    "background.session.save-current-preview",
    "background.session.queue-item",
    "background.session.queue-all-pending",
    "background.worker.start-processing",
    "background.session.refresh-all",
    "background.worker.get-status"
  ]) {
    assert.match(source, new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${step}`);
  }

  assert.match(source, /step: `\$\{step\}\.request`/);
  assert.match(source, /step: `\$\{step\}\.response`/);
  assert.match(source, /phase:\s*"signal\.saved"/);
  assert.match(source, /phase:\s*"crawl\.queued"/);
  assert.match(source, /phase:\s*"capture\.ready"/);
  assert.match(source, /requestId/);
  assert.doesNotMatch(source, /findCardCandidate\(|buildTargetDescriptor\(/, "background slice must not rewrite hover extraction");
});

test("collect save request and response emitters pass a shared requestId", () => {
  for (const relativePath of [
    "entrypoints/threads.content.ts",
    "src/ui/useInPageCollectorAppState.ts",
    "src/ui/useProcessingCoordinator.ts"
  ]) {
    const source = readRepoFile(relativePath);
    assert.match(source, /createPipelineRequestId/, `${relativePath} should create trace request ids`);
    assert.match(source, /requestId/, `${relativePath} should pass requestId through request and response events`);
  }
});
