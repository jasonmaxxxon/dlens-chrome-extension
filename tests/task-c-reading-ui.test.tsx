import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { CollectionAudienceReading } from "../src/ui/CollectionAudienceReading.tsx";
import { ReaderReply } from "../src/ui/ReaderReply.tsx";
import { buildCollectionPosts } from "../src/viewmodel/collection-browser.ts";
import { buildCollectionReaderModel } from "../src/viewmodel/collection-reader.ts";
import { inlineReplyRow } from "../src/viewmodel/inline-card.ts";
import { readCommentEligibility } from "../src/compare/comment-eligibility.ts";
import { capture, descriptor, item, session } from "./collection-browser.fixtures.ts";
import type { SessionItem } from "../src/state/types.ts";

function fixture(size: number): SessionItem {
  const comments = Array.from({ length: size }, (_, index) => ({
    comment_id: "C" + index, parent_comment_id: "ROOT", author: "fan" + index,
    text: index === 0 ? "觀眾最高讚的原句。" : "其他觀眾看法 " + index + "。",
    like_count: size - index, reply_count: 0,
  }));
  const latest = capture({ post_id: "ROOT", url: "https://www.threads.com/@op/post/ROOT", author: "op", text: "原帖正文" });
  latest.result!.comments = comments;
  latest.analysis = { status: "succeeded", source_comment_count: size,
    clusters: [{ cluster_key: 0, size_share: 1, like_share: 1, keywords: ["the", "one", "drop"],
      member_comment_ids: comments.map(comment => comment.comment_id), comment_count: size, top_comment_id: "C0" }],
    evidence: [] } as never;
  return item("card", { status: "succeeded",
    descriptor: descriptor({ post_url: "https://www.threads.com/@op/post/ROOT", author_hint: "op" }),
    latestCapture: latest });
}

function renderReader(source: SessionItem) {
  const sessions = [session("audience", [source], "topic")];
  const model = buildCollectionReaderModel(buildCollectionPosts(sessions)[0], sessions, [], [], {}, 0, "stance")!;
  assert.ok(model);
  const html = renderToStaticMarkup(<CollectionAudienceReading model={model} onMore={() => {}} onLens={() => {}} onAssign={() => {}} />);
  return { model, dom: new JSDOM(html) };
}

for (const size of [1, 14, 15, 30]) test("rendered cluster size " + size + " keeps counts and percentages at the supported boundary", () => {
  const { model, dom } = renderReader(fixture(size));
  try {
    assert.ok(model.answer?.kind === "clusters");
    assert.equal(model.answer.segments[0].label, "觀眾最高讚的原句。");
    const document = dom.window.document;
    const visible = document.body.textContent ?? "";
    const accessible = [...document.querySelectorAll("[aria-label], [title]")].flatMap(element =>
      [element.getAttribute("aria-label"), element.getAttribute("title")]).filter(Boolean).join(" ");
    assert.match(visible, /觀眾最高讚的原句/);
    if (size < 15) {
      assert.ok(visible.includes("約 " + size + " 則"));
      assert.doesNotMatch(visible + " " + accessible, /[%％]|百分之/);
    } else {
      assert.match(visible, /100%/);
    }
    assert.doesNotMatch(visible, /the|one|drop/);
  } finally { dom.window.close(); }
});

test("legacy cluster UI keeps membership uncertainty and never invents a leader or count", () => {
  const source = fixture(30), analysis = source.latestCapture!.analysis!;
  delete analysis.clusters[0].member_comment_ids;
  delete analysis.clusters[0].comment_count;
  source.latestCapture!.result!.comments.push({ comment_id: "ROOT", author: "op", text: "不應成為群組領句", like_count: 999999 });
  analysis.evidence = [{ cluster_key: 0, comments: [{ comment_id: "ROOT", author: "op", text: "不應成為群組領句", like_count: 999999 }] }];
  const { model, dom } = renderReader(source);
  try {
    assert.ok(model.answer?.kind === "clusters");
    assert.equal(model.answer.quote, null);
    const document = dom.window.document;
    const copy = (document.body.textContent ?? "") + [...document.querySelectorAll("[aria-label],[title]")].map(element =>
      (element.getAttribute("aria-label") ?? "") + (element.getAttribute("title") ?? "")).join(" ");
    assert.match(copy, /分群資料未完整/);
    assert.match(copy, /未能確認則數/);
    assert.match(copy, /分群成員資料未完整，未能確認代表原句與則數/);
    assert.doesNotMatch(copy, /支持原句已喺上面顯示/);
    assert.doesNotMatch(copy, /不應成為群組領句|約 30 則|100%|the|one|drop/);
  } finally { dom.window.close(); }
});

test("reply flags stay in the existing footer while raw bookmark text remains intact", () => {
  const source = fixture(1);
  source.latestCapture!.result!.comments = [{ comment_id: "bookmark", author: "fan", text: "留己看！！", like_count: 2 }];
  const comment = readCommentEligibility(source).all[0];
  const dom = new JSDOM(renderToStaticMarkup(<ReaderReply row={inlineReplyRow(comment, "op")} />));
  try {
    const article = dom.window.document.querySelector("[data-reader-reply]")!;
    assert.equal(article.querySelector("p")?.textContent, "留己看！！");
    assert.equal(article.querySelector('[data-reader-comment-quality="bookmark"]')?.textContent, "留位／收藏");
    assert.equal(dom.window.document.querySelectorAll("article").length, 1);
  } finally { dom.window.close(); }
});

test("explicit yes/no answers and short substantive questions have no low-content badge", () => {
  const source = fixture(1);
  source.latestCapture!.result!.comments = [
    { comment_id: "question", author: "fan", text: "有冇教學？" },
    { comment_id: "answer", author: "other", text: "有", parent_source_comment_id: "question" },
    { comment_id: "short", author: "buyer", text: "邊度買？" },
  ];
  const eligibility = readCommentEligibility(source);
  for (const id of ["answer", "short"]) {
    const row = eligibility.byId.get(id)!;
    assert.equal(row.quality?.flag, null);
    const dom = new JSDOM(renderToStaticMarkup(<ReaderReply row={inlineReplyRow(row, "op")} />));
    try {
      assert.equal(dom.window.document.querySelector("[data-reader-comment-quality]"), null);
      assert.equal(dom.window.document.querySelector("p")?.textContent, row.text);
    } finally { dom.window.close(); }
  }
});
