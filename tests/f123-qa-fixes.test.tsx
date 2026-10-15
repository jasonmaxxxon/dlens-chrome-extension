// Regressions from the 2026-10-14 real-Chrome QA of F1–F3 (reviews/dlens-inline-wheel-2026-10-07/codex-1014-F123-qa-report.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { CollectionWorkspaceShell } from "../src/ui/CollectionWorkspaceShell.tsx";
import { readingAgo } from "../src/viewmodel/collection-browser.ts";
import { buildProductReaderModel } from "../src/viewmodel/product-reader.ts";
import { createEmptyGlobalState, type ProductSignalAnalysis } from "../src/state/types.ts";
import { capture, item } from "./collection-browser.fixtures.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a long 畫面上 line cannot widen the side panel", () => {
  const html = renderToStaticMarkup(
    <CollectionWorkspaceShell tab="collection" onTabChange={() => undefined} onSettings={() => undefined}
      inView={{ author: "ka_yan1111", summary: "身為一個讀engine嘅女仔".repeat(20) }} onInView={() => undefined}>
      <p>body</p>
    </CollectionWorkspaceShell>
  );
  const doc = new JSDOM(html).window.document;
  const shell = doc.querySelector<HTMLElement>('[data-collection-workspace-shell="true"]')!;
  assert.equal(shell.style.gridTemplateColumns, "minmax(0, 1fr)");
  assert.match(doc.querySelector<HTMLElement>("[data-collection-in-view]")!.style.minWidth, /^0(px)?$/);
});

test("finished readings read in minutes, hours, then days", () => {
  assert.equal(readingAgo(30_000), "啱啱");
  assert.equal(readingAgo(12 * 60_000), "12 分前");
  assert.equal(readingAgo(1062 * 60_000), "17 小時前");
  assert.equal(readingAgo(50 * 3_600_000), "2 日前");
});

test("點試 explains itself when a 觀察 analysis has no step to try", () => {
  const settings = { ...createEmptyGlobalState().settings, oneLinerProvider: "google" as const, googleApiKey: "fixture" };
  const saved = item("p", { status: "succeeded", latestCapture: capture({ text: "root", author: "author" }) });
  const watch = { signalId: "s", status: "complete", verdict: "watch", contentSummary: "summary", whyRelevant: "why", reason: "未有人做過", evidenceRefs: [] } as unknown as ProductSignalAnalysis;
  const model = buildProductReaderModel(saved, "session", "s", watch, settings, true, "try");
  assert.equal(model.tryNote, "判斷係「觀察」，暫時未有可以即刻試嘅步驟。");
  assert.equal(model.tryReason, "未有人做過");
  const withStep = buildProductReaderModel(saved, "session", "s", { ...watch, experimentHint: "試吓" } as ProductSignalAnalysis, settings, true, "try");
  assert.equal(withStep.tryNote, null);
});

test("the panel follows only its own window's active tab for the post in view", () => {
  const hook = source("src/ui/useDiscourseFeeds.ts");
  assert.match(hook, /sender\?\.tab\?\.id === activeTabId/);
  assert.match(hook, /chrome\.tabs\?\.onActivated\?\.addListener\(onActivated\)/);
  assert.match(hook, /type: "inline\/in-view-get", \.\.\.\(tabId \? \{ tabId \} : \{\}\)/);
  const background = source("entrypoints/background.ts");
  assert.match(background, /case "inline\/in-view-get": \{\s*const tabId = await resolveTabId\(sender, message\.tabId\);/);
  const runtime = source("src/content/inline-collect-runtime.ts");
  assert.match(runtime, /inView = null; void send\(\{ type: "inline\/in-view", postKey: null \}\)/);
  assert.match(runtime, /document\.addEventListener\("visibilitychange", onVisibility\)/);
});

test("worker polling with DevTools focused falls back to a normal window's active tab", () => {
  const background = source("entrypoints/background.ts");
  const body = background.slice(background.indexOf("async function getActiveTabId"), background.indexOf("async function resolveTabId"));
  assert.match(body, /windowType: "normal"/);
  assert.match(body, /throw new Error\("No active tab available"\)/);
});

test("quoted replies render as Threads cards apart from DLens' own words, with long text folded", async () => {
  const { ReaderReply } = await import("../src/ui/CollectionAudienceReading.tsx");
  const long = "留言".repeat(200);
  const html = renderToStaticMarkup(<ReaderReply row={{ author: "alexandranous1019", text: long, likes: 12, replies: 3, time: "2h", isAuthor: false }} />);
  const doc = new JSDOM(html).window.document;
  const card = doc.querySelector<HTMLElement>("article[data-reader-reply]")!;
  assert.ok(card, "a reply is its own card");
  assert.match(card.style.border, /1px solid/);
  assert.match(card.textContent!, /alexandranous1019/);
  assert.ok(doc.querySelector("[data-reader-reply-full]"), "long replies fold behind 全文");
  assert.match(card.textContent!, /12/);
  assert.match(card.textContent!, /3/);
});

test("the reader's 大家問咩 answer is only its headline; the questions appear once, grouped in evidence", async () => {
  const src = readFileSync(new URL("../src/ui/CollectionAudienceReading.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(answer\.kind === "ask"\) return <h3 style=\{h3\}>\{answer\.headline\}<\/h3>;/);
});

test("the 畫面上 bar is near-opaque and spans the panel", () => {
  const html = renderToStaticMarkup(<CollectionWorkspaceShell tab="workspaces" onTabChange={() => undefined} onSettings={() => undefined} inView={{ author: "s.s_santa", summary: "想問點解香港職場" }} onInView={() => undefined}><p>body</p></CollectionWorkspaceShell>);
  const bar = new JSDOM(html).window.document.querySelector<HTMLElement>("[data-collection-in-view]")!;
  assert.match(bar.style.background, /0\.96/);
  assert.match(bar.style.margin, /^0px -\d+px/);
});

test("crawled replies drop Threads' own reply-box line", async () => {
  const { cleanCrawlText } = await import("../src/compare/inline-reading.ts");
  assert.equal(cleanCrawlText("閒魚更新咗可以俾港幣\nReply to ella_www0210..."), "閒魚更新咗可以俾港幣");
  assert.equal(cleanCrawlText("回覆 ella_www0210…\n假的"), "假的");
  assert.equal(cleanCrawlText("Reply to the team about it"), "Reply to the team about it");
});

test("lens switches animate once: the reader re-keys its answer and the card marks only the click render", () => {
  const motion = source("src/ui/motion.ts");
  assert.match(motion, /@keyframes dlens-lens-swap/);
  assert.match(motion, /@keyframes dlens-lens-ink/);
  assert.match(motion, /\[data-reader-answer-swap\] \{ animation: dlens-lens-swap/);
  assert.match(source("src/ui/CollectionAudienceReading.tsx"), /data-reader-answer-swap="" key=\{model\.selected/);
  const runtime = source("src/content/inline-collect-runtime.ts");
  assert.match(runtime, /swapping\.add\(post\.identity\); renderCard\(post\); swapping\.delete\(post\.identity\);/);
  assert.match(source("src/content/inline-collect-card.ts"), /\.dlens-card\.swap \.answer \{animation:dlens-lens-swap/);
});

test("reading sources are a short line of links, not a wall of chips", async () => {
  const { RefLinks } = await import("../src/ui/ReadingParts.tsx");
  const items = ["a", "b", "c", "d", "e"].map(k => ({ key: k, label: k, onClick: () => undefined }));
  const html = renderToStaticMarkup(<RefLinks items={items} />);
  assert.equal((html.match(/data-reading-ref=/g) ?? []).length, 3);
  assert.match(html, /\+2/);
});
