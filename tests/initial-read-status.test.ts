import assert from "node:assert/strict";
import test from "node:test";

import { classifyInitialReadError, type InitialReadStatus } from "../src/ingest/initial-read-status.ts";

test("classifyInitialReadError flags backend_unavailable when client raises optional-ingest-backend error", () => {
  const status: InitialReadStatus = classifyInitialReadError(
    new Error("Optional ingest backend unavailable at http://127.0.0.1:8000. Check ingestBaseUrl ...")
  );
  assert.equal(status, "backend_unavailable");
});

test("classifyInitialReadError flags route_error for 404 / route-not-found responses", () => {
  assert.equal(classifyInitialReadError(new Error("404 Not Found: not found")), "route_error");
  assert.equal(classifyInitialReadError(new Error("405 Method Not Allowed: nope")), "route_error");
});

test("classifyInitialReadError flags version_mismatch when response shape obviously diverges", () => {
  assert.equal(
    classifyInitialReadError(new Error("422 Unprocessable Entity: extra field 'foo'")),
    "version_mismatch"
  );
  assert.equal(
    classifyInitialReadError(new TypeError("Cannot read properties of undefined (reading 'status')")),
    "version_mismatch"
  );
});

test("classifyInitialReadError flags lag_tolerated when capture/job lookup briefly 404s right after queue", () => {
  const status = classifyInitialReadError(new Error("404 Not Found: not found"), {
    secondsSinceQueueSubmission: 0.4
  });
  assert.equal(status, "lag_tolerated");
});

test("classifyInitialReadError returns ok for a non-error / null input", () => {
  assert.equal(classifyInitialReadError(null), "ok");
  assert.equal(classifyInitialReadError(undefined), "ok");
});
