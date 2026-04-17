import assert from "node:assert/strict";
import test from "node:test";

import { getProcessingFailureMessage } from "../src/state/processing-errors.ts";

test("getProcessingFailureMessage explains unavailable backend errors", () => {
  const message = getProcessingFailureMessage(
    "Optional ingest backend unavailable at http://127.0.0.1:8000/worker/drain. Check ingestBaseUrl or start the backend. Original error: fetch failed"
  );

  assert.equal(message, "Backend unavailable. Check Settings > backend URL or start the ingest backend.");
});

test("getProcessingFailureMessage falls back to the original server error", () => {
  const message = getProcessingFailureMessage("500 Internal Server Error: worker crashed");

  assert.equal(message, "500 Internal Server Error: worker crashed");
});

test("getProcessingFailureMessage falls back to a generic message when missing", () => {
  assert.equal(getProcessingFailureMessage(""), "Processing failed.");
});
