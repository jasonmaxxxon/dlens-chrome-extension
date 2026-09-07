import assert from "node:assert/strict";
import test from "node:test";

import { resolveBackendWorkCopy } from "../src/state/backend-work-copy.ts";
import type { BackendWorkUiState } from "../src/state/processing-state.ts";

test("resolveBackendWorkCopy returns null for idle and draining", () => {
  assert.equal(resolveBackendWorkCopy({ kind: "idle" }), null);
  assert.equal(resolveBackendWorkCopy({ kind: "draining" }), null);
  assert.equal(resolveBackendWorkCopy(null), null);
});

test("resolveBackendWorkCopy labels retry_waiting as waiting, not active crawl", () => {
  const copy = resolveBackendWorkCopy({
    kind: "retry_waiting",
    count: 2,
    earliestRetryAt: "2026-06-16T10:30:00.000Z",
    nextDueAt: null
  });
  assert.ok(copy);
  assert.match(copy!.headline, /retry|waiting/i);
  assert.doesNotMatch(copy!.headline, /processing in progress|crawling/i);
  assert.equal(copy!.tone, "info");
});

test("resolveBackendWorkCopy labels expired_running as reclaimable", () => {
  const copy = resolveBackendWorkCopy({ kind: "expired_running", count: 1 });
  assert.ok(copy);
  assert.match(copy!.headline, /reclaim|restart|expired/i);
  assert.equal(copy!.tone, "blocked");
});

test("resolveBackendWorkCopy labels analysis_waiting clearly", () => {
  const copy = resolveBackendWorkCopy({ kind: "analysis_waiting", count: 2 });
  assert.ok(copy);
  assert.match(copy!.headline, /analysis|analyz/i);
  assert.equal(copy!.tone, "info");
});

test("resolveBackendWorkCopy labels analysis_failed as blocked", () => {
  const copy = resolveBackendWorkCopy({ kind: "analysis_failed", count: 1 });
  assert.ok(copy);
  assert.match(copy!.headline, /analysis.*failed|failed.*analysis|analysis.*blocked/i);
  assert.equal(copy!.tone, "blocked");
});

test("resolveBackendWorkCopy keeps backend_error diagnostic text out of primary copy", () => {
  const copy = resolveBackendWorkCopy({ kind: "backend_error", message: '503 {"detail":"DB unavailable"}' });
  assert.ok(copy);
  assert.equal(copy!.headline, "工作執行失敗");
  assert.doesNotMatch(copy!.hint, /DB unavailable|detail|503/);
  assert.equal(copy!.tone, "blocked");
});

test("work copy distinguishes unobserved and unavailable state from idle", () => {
  assert.equal(resolveBackendWorkCopy({ kind: "unknown" })?.headline, "確認工作狀態中");
  const copy = resolveBackendWorkCopy({ kind: "unavailable", lastVerifiedAt: "2026-09-07T03:00:00.000Z" });
  assert.equal(copy?.headline, "工作狀態暫時無法取得");
  assert.match(copy!.hint, /目前狀態未知/);
  assert.match(copy!.hint, /2026-09-07T03:00:00.000Z/);
  assert.doesNotMatch(copy!.hint, /idle|閒置|服務正常/);
});
