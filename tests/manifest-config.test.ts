import assert from "node:assert/strict";
import test from "node:test";

import config from "../wxt.config.ts";

test("manifest host permissions include Google Generative Language API for Gemini compare requests", () => {
  const hostPermissions = config.manifest?.host_permissions ?? [];

  assert.ok(
    hostPermissions.includes("https://generativelanguage.googleapis.com/*"),
    "Missing Google Generative Language API host permission"
  );
});
