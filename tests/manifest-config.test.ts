import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BUILD_VERSION } from "../src/ui/version.ts";
import config from "../wxt.config.ts";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};
const packageLockJson = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8")) as {
  version: string;
  packages: Record<string, { version?: string }>;
};

test("manifest host permissions include Google Generative Language API for Gemini compare requests", () => {
  const hostPermissions = config.manifest?.host_permissions ?? [];

  assert.ok(
    hostPermissions.includes("https://generativelanguage.googleapis.com/*"),
    "Missing Google Generative Language API host permission"
  );
});

test("manifest grants unlimited local storage for the long-lived collection library", () => {
  const permissions = config.manifest?.permissions ?? [];

  assert.ok(
    permissions.includes("unlimitedStorage"),
    "Missing unlimitedStorage permission"
  );
});

test("release target is 0.4.9", () => {
  assert.equal(packageJson.version, "0.4.9");
});

test("manifest keeps loopback required and remote ingest optional, without a hardcoded Tailscale address", () => {
  const hostPermissions = config.manifest?.host_permissions ?? [];
  const optionalHosts = config.manifest?.optional_host_permissions ?? [];
  assert.ok(hostPermissions.includes("http://127.0.0.1/*"));
  assert.ok(hostPermissions.includes("http://localhost/*"));
  assert.equal(hostPermissions.includes("http://*/*"), false);
  assert.equal(hostPermissions.includes("https://*/*"), false);
  assert.ok(optionalHosts.includes("http://*/*"));
  assert.ok(optionalHosts.includes("https://*/*"));
  assert.equal(JSON.stringify(config.manifest).includes("100.115.102.41"), false);
});

test("extension version is synchronized across package lock, manifest, and UI", () => {
  assert.equal(packageLockJson.version, packageJson.version);
  assert.equal(packageLockJson.packages[""]?.version, packageJson.version);
  assert.equal(config.manifest?.version, packageJson.version);
  assert.equal(BUILD_VERSION, packageJson.version);
});
