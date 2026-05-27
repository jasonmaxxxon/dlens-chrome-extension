import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backgroundSource = readFileSync(new URL("../entrypoints/background.ts", import.meta.url), "utf8");

test("collect save runs inside the snapshot lock", () => {
  const saveFunction = backgroundSource.match(
    /async function saveCurrentPreviewToSession[\s\S]*?\n}\n\nasync function createSession/
  )?.[0] ?? "";

  assert.match(
    saveFunction,
    /return withSnapshotLock\(async \(\) => \{/,
    "session/save-current-preview must share the snapshot lock with refresh/queue writes"
  );
});

test("refresh-all final tab update does not write a stale global snapshot", () => {
  const refreshAllFunction = backgroundSource.match(
    /async function refreshAllItems[\s\S]*?\n}\n\nexport default/
  )?.[0] ?? "";

  assert.match(
    refreshAllFunction,
    /return withSnapshotLock\(async \(\) => \{[\s\S]*?const latest = await loadSnapshot\(tabId\);[\s\S]*?global: latest\.global/,
    "session/refresh-all must reload latest global state before its final tab-only save"
  );
});

test("refresh-all skips the final storage write when the tab error is unchanged", () => {
  const refreshAllFunction = backgroundSource.match(
    /async function refreshAllItems[\s\S]*?\n}\n\nexport default/
  )?.[0] ?? "";

  assert.match(
    refreshAllFunction,
    /if \(latest\.tab\.error === firstFailureMessage\) \{\s*return latest;\s*\}/,
    "session/refresh-all must not enqueue a no-op saveSnapshot that competes with mode switching"
  );
});
