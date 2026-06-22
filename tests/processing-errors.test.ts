import assert from "node:assert/strict";
import test from "node:test";

import { getProcessingFailureMessage, getProcessingFailureUiMessage } from "../src/state/processing-errors.ts";

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

test("getProcessingFailureUiMessage maps backend failures to user-facing Chinese", () => {
  const message = getProcessingFailureUiMessage(
    "Optional ingest backend unavailable at http://127.0.0.1:8000/worker/status. Check ingestBaseUrl or start the backend. Original error: Failed to fetch"
  );

  assert.equal(message, "Backend 無法連線。請到設定確認 backend URL，或先啟動 ingest backend。");
  assert.doesNotMatch(message, /http:\/\/127\.0\.0\.1|Failed to fetch|Optional ingest/i);
});

test("getProcessingFailureUiMessage maps Playwright setup errors without raw paths", () => {
  const message = getProcessingFailureUiMessage(
    "BrowserType.launch: Executable doesn't exist at /Users/tung/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell\nLooks like Playwright was just installed or updated. Please run: playwright install"
  );

  assert.equal(message, "後端瀏覽器設定有問題。請在 ingest-core 安裝 Playwright Chromium 後再重試。");
  assert.doesNotMatch(message, /BrowserType\.launch|ms-playwright|\/Users\/tung|chrome-headless-shell/i);
});
