import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BUILD_VERSION } from "../src/ui/version.ts";
import config from "../wxt.config.ts";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

test("manifest host permissions include Google Generative Language API for Gemini compare requests", () => {
  const hostPermissions = config.manifest?.host_permissions ?? [];

  assert.ok(
    hostPermissions.includes("https://generativelanguage.googleapis.com/*"),
    "Missing Google Generative Language API host permission"
  );
});

test("extension version is synchronized across package, manifest, and UI", () => {
  assert.equal(packageJson.version, "0.1.5");
  assert.equal(config.manifest?.version, packageJson.version);
  assert.equal(BUILD_VERSION, packageJson.version);
});
