import assert from "node:assert/strict";
import test from "node:test";

import { buildRefreshFailureMessage } from "../src/state/refresh-errors.ts";

test("buildRefreshFailureMessage produces readable item-scoped copy", () => {
  const message = buildRefreshFailureMessage("#2 beta", new Error("500 Internal Server Error"));

  assert.equal(message, "Refresh failed for #2 beta: 500 Internal Server Error");
});

test("buildRefreshFailureMessage handles non-Error throw values", () => {
  const message = buildRefreshFailureMessage("#1 alpha", "timeout");

  assert.equal(message, "Refresh failed for #1 alpha: timeout");
});
