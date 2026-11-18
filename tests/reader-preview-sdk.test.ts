import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

test("the offline reader preserves the wheel and SDK indicator from topic selection to evidence", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dlens-reader-sdk-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const capture = join(dir, "capture.json");
  const preview = join(dir, "preview.html");
  writeFileSync(capture, JSON.stringify({
    result: {
      canonical_post: { post_id: "root", author: "op", text: "原帖", metrics: { reply_count: 2 } },
      thread_read_model: { discussion_replies: [
        { comment_id: "r1", author: "reader", text: "甲組留言", like_count: 2 },
        { comment_id: "r2", author: "reader", text: "乙組留言", like_count: 1 },
      ] },
    },
    analysis: { evidence: [{ cluster_key: 1, comments: [{ comment_id: "r2" }, { comment_id: "r1" }] }], blocks: [
      { type: "qa_pairs", items: [{ question: { comment_id: "r2" }, status: "replies_not_captured", answers: [] }] },
      { type: "entity_list", items: [{ url: "https://example.org/item", name: "例子", comment_ids: ["r1"] }] },
    ], clusters: [
      { cluster_key: 0, comment_count: 1, member_comment_ids: ["r1"], top_comment_id: "r1" },
      { cluster_key: 1, comment_count: 1, member_comment_ids: ["r2"], top_comment_id: "r2" },
    ] },
  }));
  const builder = fileURLToPath(new URL("../scripts/reader-preview/build.py", import.meta.url));
  execFileSync("python3", [builder, capture, "--output", preview]);
  const dom = new JSDOM(readFileSync(preview, "utf8"), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(win) {
      win.Element.prototype.getAnimations = () => [];
    },
  });
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  const [post] = JSON.parse(doc.getElementById("capture-data")!.textContent!);
  assert.deepEqual(post.groups[1].evidenceIds, ["r2"]);
  assert.equal(doc.querySelector("script[src], link[rel=stylesheet]"), null);
  const ink = doc.querySelector("[role=tablist] [data-wheel-ink]");
  assert.ok(ink, "the generated offline page must mount the shared SDK indicator");
  // jsdom has no layout. The SDK reads the two real tab positions to choose a direction.
  doc.querySelectorAll('[role="tab"]').forEach((tab, index) => {
    tab.getBoundingClientRect = () => new dom.window.DOMRect(index * 60, 0, 60, 30);
  });
  const nextSector = doc.querySelector('.wheel-slice[data-value="1"]');
  assert.ok(nextSector);
  doc.querySelector<HTMLButtonElement>('.topic-chip[data-value="1"]')!.click();
  assert.equal(doc.querySelector(".wheel-slice.is-selected"), nextSector);
  const cta = doc.querySelector<HTMLButtonElement>('[data-action="group-evidence"]');
  assert.ok(cta);
  cta.click();
  const selected = doc.querySelector('[role=tab][aria-selected="true"]');
  assert.equal(selected?.textContent, "原文");
  const panel = doc.getElementById(selected!.getAttribute("aria-controls")!);
  assert.equal(panel?.getAttribute("data-activation-direction"), "right");
  assert.deepEqual([...panel!.querySelectorAll(".evidence-card p")].map(el => el.textContent), ["乙組留言"]);
  assert.equal(doc.querySelector("[data-wheel-ink]"), ink);
  doc.querySelector<HTMLButtonElement>('[data-action="filter"][data-value="links"]')!.click();
  assert.equal(doc.querySelector(".source-reference a")?.getAttribute("href"), "https://example.org/item");
  assert.equal(doc.querySelector<HTMLElement>(".evidence-card")?.dataset.evidenceId, "r1");
  doc.querySelector<HTMLButtonElement>('[data-wheel-tab="questions"]')!.click();
  assert.match(doc.querySelector(".questions")!.textContent!, /有回覆，未擷取到原文/);
  assert.equal(doc.querySelector<HTMLElement>(".questions [data-jump-comment]")?.dataset.value, "r2");
});
