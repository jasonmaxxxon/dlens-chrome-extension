import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkspacePanelCards } from "../src/viewmodel/workspace-panel.ts";
import { buildWorkspaceCards } from "../src/viewmodel/collection-browser.ts";
import { descriptor, item, session } from "./collection-browser.fixtures.ts";

const now = Date.parse("2026-11-05T03:00:00Z");
const saved = new Date(now - 17 * 3600000).toISOString();

test("workspace panel keeps existing source cards while adding unique queued/running counts and Chinese time", () => {
  const statuses = ["saved", "queued", "running", "succeeded", "failed"] as const;
  const sessions = [session("mixed", statuses.map((status, index) => item(String(index), { status, savedAt: saved,
    descriptor: descriptor({ post_url: `https://www.threads.com/@author/post/${index}` }) })), "topic"), session("empty", [], "archive")];
  const before = structuredClone(sessions), legacy = buildWorkspaceCards(sessions, now);
  const cards = buildWorkspacePanelCards(sessions, now);
  assert.equal(cards[0].count, 5);
  assert.equal(cards[0].queuedCount, 1); assert.equal(cards[0].runningCount, 1); assert.equal(cards[0].readingCount, 2);
  assert.equal(cards[0].lastSavedRelative, "17 小時");
  assert.equal(cards[0].purpose, legacy[0].purpose); assert.deepEqual(cards[0].previews, legacy[0].previews);
  assert.deepEqual(cards.map(card => card.session.id), ["mixed", "empty"]);
  assert.equal(cards[1].lastSavedRelative, null); assert.equal(cards[1].readingCount, 0);
  assert.deepEqual(buildWorkspaceCards(sessions, now), legacy, "legacy export keeps every output");
  assert.deepEqual(sessions, before, "panel projection never edits sessions");
});

test("workspace panel counts a duplicated post only once with running taking precedence over queued", () => {
  const sessions = [session("mixed", [item("running", { status: "running", savedAt: saved }), item("queued", { status: "queued", savedAt: saved })], "product")];
  const card = buildWorkspacePanelCards(sessions, now)[0];
  assert.equal(card.previews.length, 1);
  assert.equal(card.readingCount, 1); assert.equal(card.runningCount, 1); assert.equal(card.queuedCount, 0);
  assert.ok(card.readingCount <= card.count);
  assert.equal(card.count, 2, "existing count contract remains the number of saved items");
});

test("workspace panel relative labels use Chinese whole units and leave the suffix to the view", () => {
  for (const [elapsed, label] of [[3 * 60000, "3 分"], [2 * 86400000, "2 日"], [0, "0 分"]] as const) {
    const cards = buildWorkspacePanelCards([session("one", [item("one", { savedAt: new Date(now - elapsed).toISOString() })])], now);
    assert.equal(cards[0].lastSavedRelative, label);
    assert.doesNotMatch(cards[0].lastSavedRelative!, /前/);
  }
});
