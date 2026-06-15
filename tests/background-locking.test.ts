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
    /return (?:withSnapshotLock|mutateSnapshot)\(.*?async \([^)]*\) => \{/s,
    "session/save-current-preview must share the snapshot lock with refresh/queue writes"
  );
});

test("refresh-all final tab update does not write a stale global snapshot", () => {
  const refreshAllFunction = extractSource(
    /async function refreshAllItems[\s\S]*?\n}\n\nfunction resetBackgroundTestState/,
    "refreshAllItems"
  );

  assert.match(
    refreshAllFunction,
    /return withSnapshotLock\(async \(\) => \{[\s\S]*?const latest = await loadSnapshot\(tabId\);[\s\S]*?global: latest\.global/,
    "session/refresh-all must reload latest global state before its final tab-only save"
  );
});

test("mutateSnapshot is the read-modify-write seam for snapshot handlers", () => {
  const mutateFunction = extractSource(
    /async function mutateSnapshot[\s\S]*?\n}\n\n\/\*\* Merge in-memory hover state/,
    "mutateSnapshot"
  );

  assert.match(mutateFunction, /return withSnapshotLock\(async \(\) => \{/);
  assert.match(mutateFunction, /const current = await loadSnapshot\(tabId\);/);
  assert.match(mutateFunction, /return saveSnapshot\(tabId, nextSnapshot, saveOptions\);/);
});

test("settings and tab-only message handlers route RMW writes through mutateSnapshot", () => {
  for (const messageType of [
    "settings/set-ingest-base-url",
    "settings/set-product-profile",
    "settings/set-one-liner-config",
    "settings/set-layout-preferences",
    "popup/navigate-active-tab",
    "selection/selected",
    "selection/mode-changed",
    "topic/set-collection-target",
    "compare/set-active-draft",
    "compare/set-active-result"
  ]) {
    const caseSource = extractSource(
      new RegExp(`case "${messageType.replace("/", "\\/")}":[\\s\\S]*?\\n\\s*return;`),
      messageType
    );
    assert.match(
      caseSource,
      /mutateSnapshot\(tabId,/,
      `${messageType} must use mutateSnapshot for its RMW write`
    );
    assert.doesNotMatch(
      caseSource,
      /const current = await loadSnapshot\(tabId\);[\s\S]*?saveSnapshot\(tabId,/,
      `${messageType} should not keep raw loadSnapshot -> saveSnapshot writes inline`
    );
  }
});

test("global-only background writes go through the global persistence helper", () => {
  assert.match(
    backgroundSource,
    /async function persistGlobalStateOnly[\s\S]*?writeGlobalStateSnapshot\(chrome\.storage\.local, GLOBAL_STORAGE_KEY, nextGlobal\);/,
    "global-only storage writes must share cache and timing bookkeeping"
  );
  assert.equal(
    [...backgroundSource.matchAll(/chrome\.storage\.local\.set\(\{ \[GLOBAL_STORAGE_KEY\]/g)].length,
    0,
    "cold-start and global-only refresh paths should not write the global key inline"
  );
});
