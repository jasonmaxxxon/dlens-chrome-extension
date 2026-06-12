import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migratedSources = [
  "entrypoints/threads.content.ts",
  "src/ui/useInPageCollectorAppState.ts",
  "src/ui/useTopicState.ts",
  "src/ui/useProcessingCoordinator.ts"
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function extractEmitBodies(source: string): string[] {
  const bodies: string[] = [];
  let searchIndex = 0;
  const marker = "emitPipelineEvent({";
  while (true) {
    const start = source.indexOf(marker, searchIndex);
    if (start < 0) {
      break;
    }
    let depth = 0;
    let bodyStart = start + "emitPipelineEvent(".length;
    let end = bodyStart;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    bodies.push(source.slice(bodyStart, end));
    searchIndex = end;
  }
  return bodies;
}

test("pipeline trace slice absorbs ad-hoc markQaTrace production strings", () => {
  for (const relativePath of migratedSources) {
    const source = readRepoFile(relativePath);
    assert.doesNotMatch(source, /markQaTrace\("/, `${relativePath} still emits untyped qa trace strings`);
    assert.match(source, /emitPipelineEvent\(\{/, `${relativePath} should emit typed pipeline events`);
  }
});

test("every migrated pipeline emit includes phase, step, target, and result", () => {
  const bodies = migratedSources.flatMap((relativePath) => extractEmitBodies(readRepoFile(relativePath)));
  assert.ok(bodies.length >= 30, "expected the existing qa trace call sites to be migrated, not deleted");

  for (const body of bodies) {
    assert.match(body, /\bphase:\s*"/, `missing phase in ${body}`);
    assert.match(body, /\bstep:\s*"/, `missing step in ${body}`);
    assert.match(body, /\btarget:\s*\{/, `missing target in ${body}`);
    assert.match(body, /\bresult:\s*/, `missing result in ${body}`);
  }
});

test("qa-trace UI module is only a typed adapter over the state pipeline trace", () => {
  const source = readRepoFile("src/ui/qa-trace.ts");
  assert.doesNotMatch(source, /function markQaTrace|markQaTrace\(/);
  assert.match(source, /from "\.\.\/state\/pipeline-trace/);
});
