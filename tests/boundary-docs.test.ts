import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const FORBIDDEN = "/Users/tung/Desktop/dlens-ingest-core";

const filesToCheck = [
  "README.md",
  "AGENTS.md",
  "docs/contracts/ingest-core-api.md",
  "docs/decisions/0001-repo-boundary.md",
  "docs/memory/current-state.md",
  ...readdirSync(path.join(REPO_ROOT, "docs/handoff")).map((name) => `docs/handoff/${name}`)
];

test("boundary docs do not depend on a hard-coded desktop ingest-core path", () => {
  for (const relativePath of filesToCheck) {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    const contents = readFileSync(absolutePath, "utf8");
    assert.doesNotMatch(
      contents,
      new RegExp(FORBIDDEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      relativePath
    );
  }
});
