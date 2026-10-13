import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionPosts } from "../src/viewmodel/collection-browser.ts";
import { buildCollectionReaderModel } from "../src/viewmodel/collection-reader.ts";
import { item, session } from "./collection-browser.fixtures.ts";
import type { Signal, Topic } from "../src/state/types.ts";

test("reader uses its topic membership and excludes other workspaces and orphan signals from chip counts", () => {
  const sessions = [session("audience", [item("one")], "topic"), session("other", [], "topic")];
  const topics = ["audience", "other"].map(id => ({ id, sessionId: id, name: id } as Topic));
  const signals = [
    { id: "s1", sessionId: "audience", itemId: "one", topicId: "audience" },
    { id: "s2", sessionId: "audience", itemId: "gone", topicId: "audience" },
    { id: "s3", sessionId: "other", itemId: "one", topicId: "other" }
  ] as Signal[];
  const model = buildCollectionReaderModel(buildCollectionPosts(sessions)[0], sessions, topics, signals, {}, 0)!;
  assert.equal(model.sessionId, "audience");
  assert.equal(model.signalId, "s1");
  assert.deepEqual(model.chips.map(c => [c.id, c.count, c.selected]), [[null, 0, false], ["audience", 1, true]]);
});

test("reader state uses the crawl estimate and actual failure reason; other modes have no audience projection", () => {
  const queued = item("one", { status: "running", lastStatusAt: "2026-10-13T00:00:00Z" });
  const sessions = [session("audience", [queued], "topic")];
  let model = buildCollectionReaderModel(buildCollectionPosts(sessions)[0], sessions, [], [], {}, Date.parse("2026-10-13T00:10:00Z"))!;
  assert.equal(model.stateLine, "抓取中 · 比平常久");
  queued.status = "failed"; queued.lastError = "頁面載入異常";
  model = buildCollectionReaderModel(buildCollectionPosts(sessions)[0], sessions, [], [], {}, 0)!;
  assert.equal(model.stateLine, "抓取失敗：頁面載入異常");
  sessions[0].mode = "product";
  assert.equal(buildCollectionReaderModel(buildCollectionPosts(sessions)[0], sessions, [], [], {}, 0), null);
});
