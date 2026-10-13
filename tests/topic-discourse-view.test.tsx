import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { act } from "react";
import { TopicDiscourseView, type TopicDiscourseCommand } from "../src/ui/TopicDiscourseView.tsx";
import type { TopicDiscourseViewModel } from "../src/viewmodel/topic-discourse.ts";

const post = (author: string, text: string, inView = false) => ({ signalId: `s-${author}`, itemId: `i-${author}`, postKey: `threads-post:${author}`, author, text, date: "10/7", likes: 12, url: `https://www.threads.com/@${author}/post/x`, inView });
const vm: TopicDiscourseViewModel = {
  postCount: 5, topicCount: 2,
  chips: [{ id: "t1", name: "AI 工具額度", count: 4, selected: true }, { id: "t2", name: "香港拍拖", count: 0, selected: false }],
  inbox: [{ signalId: "s-anna", author: "anna", text: "香港有咩調情好地方？", meta: "19h · 85 則留言", inView: false }],
  picks: [{ id: "t1", name: "AI 工具額度" }, { id: "t2", name: "香港拍拖" }],
  topic: {
    id: "t1", name: "AI 工具額度", coverage: "4 篇貼文 · 已抓留言 40 則 · 更新 10:38",
    inView: { kind: "here", author: "jth", text: "突然就被重置了", frameName: "reset / 額度" },
    findings: [
      { kind: "trend", text: "〈reset / 額度〉係新講法：最早 10/6，2 篇全部喺最近 7 日。", frameKey: "reset", weeks: [{ label: "9/11 週", count: 0, hot: false }, { label: "9/18 週", count: 0, hot: false }, { label: "9/25 週", count: 1, hot: false }, { label: "10/2 週", count: 2, hot: true }] },
      { kind: "ask", text: "「積分點樣計？」喺 2 篇貼文都有人問，只有 1 篇有人回覆。", question: "積分點樣計？", where: [{ author: "a", replied: false, postKey: "k1" }, { author: "b", replied: true, postKey: "k2" }] }
    ],
    frames: [
      { key: "reset", name: "reset / 額度", posts: [post("jth", "突然就被重置了", true), post("prompt_case", "今天 Codex 應該會 Reset 了")], first: "10/6", thisWeek: 2, isNew: true, inView: true },
      { key: "grok", name: "grok / agent", posts: [post("grok_fan", "Grok Bot 真的超級好用")], first: "9/18", thisWeek: 0, isNew: false, inView: false }
    ],
    loose: [],
    meme: { phrase: "reset", posts: 3 }
  }
};

test("the 觀眾反應 view leads with 話題, 未分流, 畫面上, 發現 and 講法, and sends every action as a command", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const host = dom.window.document.getElementById("root")!;
  const root = createRoot(host);
  const commands: TopicDiscourseCommand[] = [];
  try {
    await act(async () => root.render(<TopicDiscourseView viewModel={vm} onCommand={(command) => commands.push(command)} />));
    assert.deepEqual([...host.querySelectorAll("[data-discourse-topic]")].map((b) => b.textContent), ["AI 工具額度4", "香港拍拖0"]);
    assert.equal(host.querySelector('[data-discourse-in-view="here"]')!.textContent, "畫面上：@jth 屬〈reset / 額度〉突然就被重置了");
    assert.deepEqual([...host.querySelectorAll("[data-discourse-finding]")].map((el) => el.getAttribute("data-discourse-finding")), ["trend", "ask"]);
    assert.ok(host.querySelectorAll('[data-dlens-presence="card"]').length >= 3, "findings, 未分流 and the Atlas row join the shared card motion");

    await act(async () => host.querySelector<HTMLButtonElement>('[data-discourse-topic="t2"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>("[data-discourse-inbox] button")!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-discourse-inbox-row="s-anna"] [data-discourse-assign="t2"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-discourse-atlas="t1"]')!.click());
    assert.deepEqual(commands, [
      { kind: "select-topic", topicId: "t2" },
      { kind: "assign", signalId: "s-anna", topicId: "t2" },
      { kind: "open-atlas", topicId: "t1" }
    ]);

    assert.equal(host.querySelector('[data-discourse-frame="grok"] a'), null);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-discourse-frame="grok"] button')!.click());
    assert.equal(host.querySelector('[data-discourse-frame="grok"] a')!.getAttribute("href"), "https://www.threads.com/@grok_fan/post/x", "a 講法 opens to its posts, each linking to Threads");
    await act(async () => host.querySelector<HTMLButtonElement>("[data-discourse-finding=trend] button")!.click());
    assert.ok(host.querySelector('[data-discourse-frame="reset"] a'), "a finding opens the 講法 it names");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});
