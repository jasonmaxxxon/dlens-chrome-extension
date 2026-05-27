import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backgroundSource = readFileSync(new URL("../entrypoints/background.ts", import.meta.url), "utf8");

function extractSource(pattern: RegExp, label: string): string {
  const match = backgroundSource.match(pattern)?.[0] ?? "";
  assert.notEqual(match, "", `${label} source must be present`);
  return match;
}

test("collect save runs inside the snapshot lock", () => {
  const saveFunction = extractSource(
    /async function saveCurrentPreviewToSession[\s\S]*?\n}\n\nasync function createSession/,
    "saveCurrentPreviewToSession"
  );

  assert.match(
    saveFunction,
    /return withSnapshotLock\(async \(\) => \{/,
    "session/save-current-preview must share the snapshot lock with refresh/queue writes"
  );
});

test("refresh-all final tab update does not write a stale global snapshot", () => {
  const refreshAllFunction = extractSource(
    /async function refreshAllItems[\s\S]*?\n}\n\nexport default/,
    "refreshAllItems"
  );

  assert.match(
    refreshAllFunction,
    /return withSnapshotLock\(async \(\) => \{[\s\S]*?const latest = await loadSnapshot\(tabId\);[\s\S]*?global: latest\.global/,
    "session/refresh-all must reload latest global state before its final tab-only save"
  );
});

test("refresh-all skips the final storage write when the tab error is unchanged", () => {
  const refreshAllFunction = extractSource(
    /async function refreshAllItems[\s\S]*?\n}\n\nexport default/,
    "refreshAllItems"
  );

  assert.match(
    refreshAllFunction,
    /if \(latest\.tab\.error === firstFailureMessage\) \{\s*return latest;\s*\}/,
    "session/refresh-all must not enqueue a no-op saveSnapshot that competes with mode switching"
  );
});

test("session/set-mode fast path writes only active-session and tab keys", () => {
  const setModeCase = extractSource(
    /case "session\/set-mode": \{[\s\S]*?\n          case "topic\/list":/,
    "session/set-mode case"
  );
  const activeSessionSave = extractSource(
    /async function saveActiveSessionSnapshot[\s\S]*?\n}\n\n\/\*\* Merge in-memory hover state/,
    "saveActiveSessionSnapshot"
  );

  assert.match(
    setModeCase,
    /const sessionsRefEqual = global\.sessions === current\.global\.sessions;/,
    "session/set-mode must keep the reference-equality guard for the fast path"
  );
  assert.match(
    setModeCase,
    /sessionsRefEqual\s*\?\s*await saveActiveSessionSnapshot\(tabId, nextSnapshotInput\)\s*:\s*await saveSnapshot\(tabId, nextSnapshotInput, \{ persistActiveSessionId: true \}\)/,
    "existing mode sessions must use the active-session-only write path"
  );
  assert.match(activeSessionSave, /\[ACTIVE_SESSION_ID_STORAGE_KEY\]/);
  assert.match(activeSessionSave, /\[tabStorageKey\(tabId\)\]/);
  assert.doesNotMatch(
    activeSessionSave,
    /GLOBAL_STORAGE_KEY/,
    "saveActiveSessionSnapshot must not write the full global snapshot"
  );
});

test("session/set-mode slow path persists the global key for new target-mode sessions", () => {
  const saveSnapshotFunction = extractSource(
    /async function saveSnapshot[\s\S]*?\n}\n\nasync function saveActiveSessionSnapshot/,
    "saveSnapshot"
  );
  const setModeCase = extractSource(
    /case "session\/set-mode": \{[\s\S]*?\n          case "topic\/list":/,
    "session/set-mode case"
  );

  assert.match(
    setModeCase,
    /await saveSnapshot\(tabId, nextSnapshotInput, \{ persistActiveSessionId: true \}\)/,
    "new target-mode sessions must persist the created session in the global snapshot"
  );
  assert.match(saveSnapshotFunction, /\[GLOBAL_STORAGE_KEY\]: nextSnapshot\.global/);
  assert.match(saveSnapshotFunction, /\[ACTIVE_SESSION_ID_STORAGE_KEY\] = nextSnapshot\.global\.activeSessionId/);
});

test("saveSnapshot broadcast stays fire-and-forget", () => {
  const broadcastFunction = extractSource(
    /function broadcastSnapshotUpdate[\s\S]*?\n}\n\nfunction logSlowSnapshotSave/,
    "broadcastSnapshotUpdate"
  );
  const persistFunction = extractSource(
    /async function persistSnapshot[\s\S]*?\n}\n\nasync function saveSnapshot/,
    "persistSnapshot"
  );

  assert.match(
    broadcastFunction,
    /void chrome\.tabs\s*\.sendMessage\(/,
    "state/updated broadcast must not await the tab ack"
  );
  assert.doesNotMatch(broadcastFunction, /\bawait\b/);
  assert.match(
    persistFunction,
    /broadcastSnapshotUpdate\(tabId, snapshot\);/,
    "saveSnapshot must keep broadcasting after storage write without making the response wait for tab ack"
  );
});
