import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkspaceCrashMarkup,
  getWorkspaceCrashMessage,
  isExtensionRuntimeError
} from "../src/ui/runtime-guard.ts";

test("isExtensionRuntimeError only matches errors that point at the extension origin", () => {
  const extensionOrigin = "chrome-extension://abc123/";

  assert.equal(
    isExtensionRuntimeError(new Error(`${extensionOrigin}src/ui/CompareView.tsx crashed`), extensionOrigin),
    true
  );
  assert.equal(
    isExtensionRuntimeError({ message: "site error", filename: "https://www.threads.net/app.js" }, extensionOrigin),
    false
  );
});

test("getWorkspaceCrashMessage returns a readable message for unknown throw values", () => {
  assert.equal(getWorkspaceCrashMessage(new Error("CompareView exploded")), "CompareView exploded");
  assert.equal(getWorkspaceCrashMessage("plain string failure"), "plain string failure");
  assert.equal(getWorkspaceCrashMessage({ reason: "opaque failure" }), "opaque failure");
  assert.equal(getWorkspaceCrashMessage(null), "Unknown extension render error");
});

test("buildWorkspaceCrashMarkup renders a visible fallback shell instead of blanking the workspace", () => {
  const markup = buildWorkspaceCrashMarkup("CompareView exploded");

  assert.match(markup, /DLens hit a render error/i);
  assert.match(markup, /CompareView exploded/);
  assert.match(markup, /Open the page console or reload the tab/i);
  assert.match(markup, /data-dlens-control="true"/);
});
