import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getWorkspaceCrashMessage } from "../src/ui/runtime-guard.ts";

test("getWorkspaceCrashMessage returns a readable message for unknown throw values", () => {
  assert.equal(getWorkspaceCrashMessage(new Error("CompareView exploded")), "CompareView exploded");
  assert.equal(getWorkspaceCrashMessage("plain string failure"), "plain string failure");
  assert.equal(getWorkspaceCrashMessage({ reason: "opaque failure" }), "opaque failure");
  assert.equal(getWorkspaceCrashMessage(null), "Unknown extension render error");
});

test("InPageCollectorApp is wrapped in a React tree error boundary", () => {
  const source = readFileSync(new URL("../src/ui/InPageCollectorApp.tsx", import.meta.url), "utf8");

  assert.match(source, /WorkspaceErrorBoundary/);
  assert.match(source, /<WorkspaceErrorBoundary>[\s\S]*<InPageCollectorPopup app=\{app\}[^>]*\/>[\s\S]*<\/WorkspaceErrorBoundary>/);
});
