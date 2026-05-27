import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backgroundSource = readFileSync(new URL("../entrypoints/background.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/ui/SettingsView.tsx", import.meta.url), "utf8");
const appStateSource = readFileSync(new URL("../src/ui/useInPageCollectorAppState.ts", import.meta.url), "utf8");

test("background exposes storage/get-usage through chrome.storage.local.getBytesInUse", () => {
  assert.match(backgroundSource, /case "storage\/get-usage"/);
  assert.match(backgroundSource, /chrome\.storage\.local\.getBytesInUse\(\)/);
  assert.match(backgroundSource, /bytesInUse/);
  assert.match(backgroundSource, /quotaBytes/);
});

test("SettingsView renders storage usage from props without direct chrome.storage access", () => {
  assert.doesNotMatch(settingsSource, /chrome\.storage/);
  assert.match(settingsSource, /storageUsage/);
  assert.match(settingsSource, /Storage 用量/);
});

test("popup app state fetches storage usage only while Settings is open", () => {
  assert.match(appStateSource, /type: "storage\/get-usage"/);
  assert.match(appStateSource, /page !== "settings"/);
});
