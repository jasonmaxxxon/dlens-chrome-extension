import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createInlineCollectInjection } from "../src/content/inline-collect-injection.ts";

// Role-button + SVG title is the current Threads action grammar, not aria-labelled buttons.
function post(id: string, nested = "") {
  return `<article data-id="${id}"><div data-pressable-container="true"><a href="/@author">author</a><a href="/@author/post/${id}"><time>1h</time></a><div>A real source body for ${id}</div>${nested}<div class="actions">${["Like", "Reply", "Repost", "Share"].map((title) => `<div class="metric"><div role="button" tabindex="0"><svg role="img"><title>${title}</title></svg><span>12</span></div></div>`).join("")}</div></div></article>`;
}
function setup(html: string, url = "https://www.threads.com/") {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  const keys = ["window", "document", "Element", "HTMLElement", "Node", "MutationObserver"] as const;
  const saved = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  keys.forEach((key) => Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] }));
  const controller = createInlineCollectInjection({ document: dom.window.document, getPageUrl: () => dom.window.location.href, onAdd: () => () => {} });
  return { dom, controller, cleanup() { controller.destroy(); dom.window.close(); keys.forEach((key, index) => saved[index] ? Object.defineProperty(globalThis, key, saved[index]!) : Reflect.deleteProperty(globalThis, key)); } };
}

test("inline injection appends exactly one button to each top-level action bar", () => {
  const s = setup(post("a") + post("b"));
  try {
    s.controller.scan();
    assert.equal(s.dom.window.document.querySelectorAll(".dlens-collect-button").length, 2);
    for (const actions of s.dom.window.document.querySelectorAll(".actions")) {
      assert.equal(actions.lastElementChild?.getAttribute("data-dlens-control"), "true");
      assert.equal(actions.querySelectorAll(".dlens-collect-button").length, 1);
    }
  } finally { s.cleanup(); }
});
test("inline injection is idempotent across repeated mutations", async () => {
  const s = setup(post("a"));
  try {
    s.controller.scan();
    for (let i = 0; i < 4; i++) { s.dom.window.document.querySelector("article")!.appendChild(s.dom.window.document.createTextNode(" ")); s.controller.scan(); }
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(s.dom.window.document.querySelectorAll(".dlens-collect-button").length, 1);
  } finally { s.cleanup(); }
});
test("inline injection replaces detached post controls and handles recycled identity", () => {
  const s = setup(post("a"));
  try {
    s.controller.scan();
    s.dom.window.document.querySelector("article")!.outerHTML = post("a");
    s.controller.scan();
    assert.equal(s.dom.window.document.querySelectorAll(".dlens-collect-button").length, 1);
    const link = s.dom.window.document.querySelector<HTMLAnchorElement>('a[href*="/post/"]')!;
    link.href = "/@author/post/b";
    s.controller.scan();
    assert.equal(s.controller.entries()[0].identity, "threads-post:b");
    assert.equal(s.dom.window.document.querySelectorAll(".dlens-collect-button").length, 1);
  } finally { s.cleanup(); }
});
test("inline injection excludes post-detail replies and all dialog posts", () => {
  const s = setup(post("a") + post("reply") + `<div role="dialog">${post("modal")}</div>`, "https://www.threads.com/@author/post/a");
  try { s.controller.scan(); assert.equal(s.dom.window.document.querySelectorAll(".dlens-collect-button").length, 1); assert.equal(s.controller.entries()[0].identity, "threads-post:a"); } finally { s.cleanup(); }
});
test("inline injection excludes nested comment or quoted action bars", () => {
  const s = setup(post("a", `<blockquote>${post("nested")}</blockquote>`));
  try { s.controller.scan(); assert.equal(s.dom.window.document.querySelectorAll(".dlens-collect-button").length, 1); assert.equal(s.dom.window.document.querySelector("blockquote .dlens-collect-button"), null); } finally { s.cleanup(); }
});
test("inline injection works against captured Threads post DOM", () => {
  const html = readFileSync(new URL("./fixtures/threads/descriptor/rich-thread.html", import.meta.url), "utf8");
  const s = setup(html, "https://www.threads.com/@aiposthub/post/DZpehhuAdCe");
  try { s.controller.scan(); assert.equal(s.dom.window.document.querySelectorAll(".dlens-collect-button").length, 1); assert.match(s.controller.entries()[0].descriptor.text_snippet, /Hermes/); assert.equal(s.dom.window.document.querySelector('[role="dialog"] .dlens-collect-button'), null); } finally { s.cleanup(); }
});

test("inline injection adopts a replaced clone without duplicating its old control", () => {
  const s = setup(post("a"));
  try {
    const original = s.dom.window.document.querySelector("article")!;
    original.replaceWith(original.cloneNode(true));
    s.controller.scan();
    assert.equal(s.dom.window.document.querySelectorAll(".dlens-collect-button").length, 1);
  } finally { s.cleanup(); }
});

test("inline injection reinserts a control when Threads replaces only the action bar", () => {
  const s = setup(post("a"));
  try {
    const actions = s.dom.window.document.querySelector(".actions")!;
    const replacement = actions.cloneNode(true) as Element;
    replacement.querySelector('[data-dlens-control="true"]')!.remove();
    actions.replaceWith(replacement);
    s.controller.scan();
    assert.equal(s.dom.window.document.querySelectorAll(".dlens-collect-button").length, 1);
  } finally { s.cleanup(); }
});

test("inline hover is cleared when the pointer leaves the document or the window blurs", () => {
  const s = setup(post("a"));
  try {
    const article = s.dom.window.document.querySelector("article")!;
    article.dispatchEvent(new s.dom.window.MouseEvent("pointermove", { bubbles: true }));
    assert.equal(s.controller.getHoveredPost()?.identity, "threads-post:a");
    s.dom.window.document.dispatchEvent(new s.dom.window.Event("pointerleave"));
    assert.equal(s.controller.getHoveredPost(), null);
    article.dispatchEvent(new s.dom.window.MouseEvent("pointermove", { bubbles: true }));
    assert.equal(s.controller.getHoveredPost()?.identity, "threads-post:a");
    s.dom.window.dispatchEvent(new s.dom.window.Event("blur"));
    assert.equal(s.controller.getHoveredPost(), null);
  } finally { s.cleanup(); }
});
