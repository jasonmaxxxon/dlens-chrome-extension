import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  buildTargetDescriptor,
  classifyCandidateStrength,
  classifyMetric,
  extractImageUrl,
  findCardCandidate,
  inferThreadFollowersFromText,
  inferThreadViewsFromText,
  scoreCardCandidateSignals,
  threadsTargetingTestables,
  type CardCandidateSignals
} from "../src/targeting/threads.ts";

function makeSignals(overrides: Partial<CardCandidateSignals> = {}): CardCandidateSignals {
  return {
    isArticleLike: true,
    hasPermalink: true,
    isPressable: true,
    hasAuthorHint: true,
    hasEngagementRow: true,
    isComposer: false,
    isRecommendation: false,
    isFeedShell: false,
    widthRatio: 0.62,
    permalinkCount: 1,
    articleDescendants: 1,
    nestedPermalinkCount: 0,
    ...overrides
  };
}

test("scoreCardCandidateSignals marks strong post cards as hard candidates", () => {
  const score = scoreCardCandidateSignals(makeSignals());
  assert.equal(classifyCandidateStrength(score), "hard");
});

test("scoreCardCandidateSignals demotes oversized uncertain cards to soft candidates", () => {
  const score = scoreCardCandidateSignals(
    makeSignals({
      isArticleLike: false,
      hasPermalink: false,
      widthRatio: 0.88,
      hasEngagementRow: true,
      hasAuthorHint: true,
      isPressable: true
    })
  );

  assert.equal(classifyCandidateStrength(score), "soft");
});

test("scoreCardCandidateSignals rejects composer and feed shell blocks", () => {
  const composerScore = scoreCardCandidateSignals(
    makeSignals({
      isComposer: true,
      hasPermalink: false,
      hasEngagementRow: false
    })
  );
  const shellScore = scoreCardCandidateSignals(
    makeSignals({
      isFeedShell: true,
      permalinkCount: 4,
      articleDescendants: 4,
      widthRatio: 0.98
    })
  );

  assert.equal(classifyCandidateStrength(composerScore), null);
  assert.equal(classifyCandidateStrength(shellScore), null);
});

test("scoreCardCandidateSignals keeps quoted-post outer cards eligible", () => {
  const score = scoreCardCandidateSignals(
    makeSignals({
      isArticleLike: true,
      hasPermalink: true,
      hasAuthorHint: true,
      hasEngagementRow: true,
      widthRatio: 0.68,
      permalinkCount: 2,
      articleDescendants: 2,
      nestedPermalinkCount: 1,
      isFeedShell: false
    })
  );

  assert.equal(classifyCandidateStrength(score), "hard");
});

test("composer detection does not reject post detail wrappers with reply composers", () => {
  const postDetailWrapper = {
    querySelector(selector: string) {
      if (selector === "textarea, [contenteditable='true']") return {};
      if (selector === 'a[href*="/post/"]') return {};
      if (selector === "a[href^='/@'], a[href*='threads.net/@']") return {};
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === "svg[aria-label]") {
        return [
          { getAttribute: () => "Like" },
          { getAttribute: () => "Reply" }
        ];
      }
      return [];
    },
    innerText: "Follow sswirll 2d 第二次上樓 Like 1.8K Reply 86",
    textContent: "Follow sswirll 2d 第二次上樓 Like 1.8K Reply 86"
  };
  const pureComposer = {
    querySelector(selector: string) {
      if (selector === "textarea, [contenteditable='true']") return {};
      return null;
    },
    querySelectorAll: () => [],
    innerText: "Start a thread",
    textContent: "Start a thread"
  };

  assert.equal(threadsTargetingTestables.isComposerLike(postDetailWrapper as any), false);
  assert.equal(threadsTargetingTestables.isComposerLike(pureComposer as any), true);
});

// classifyMetric tests

test("classifyMetric identifies likes from aria-label", () => {
  assert.equal(classifyMetric("2 likes"), "likes");
  assert.equal(classifyMetric("Like"), "likes");
  assert.equal(classifyMetric("1 like"), "likes");
});

test("classifyMetric identifies comments/replies", () => {
  assert.equal(classifyMetric("5 replies"), "comments");
  assert.equal(classifyMetric("Reply"), "comments");
  assert.equal(classifyMetric("3 comments"), "comments");
});

test("classifyMetric identifies reposts", () => {
  assert.equal(classifyMetric("Repost"), "reposts");
  assert.equal(classifyMetric("12 reposts"), "reposts");
});

test("classifyMetric identifies forwards/shares", () => {
  assert.equal(classifyMetric("Share"), "forwards");
  assert.equal(classifyMetric("Send"), "forwards");
});

test("classifyMetric uses word boundaries to avoid false positives", () => {
  assert.equal(classifyMetric("preview"), null);
  assert.equal(classifyMetric("overview"), null);
  assert.equal(classifyMetric("slideshow"), null);
});

test("classifyMetric supports Chinese labels", () => {
  assert.equal(classifyMetric("讚"), "likes");
  assert.equal(classifyMetric("回覆"), "comments");
  assert.equal(classifyMetric("轉發"), "reposts");
  assert.equal(classifyMetric("分享"), "forwards");
  assert.equal(classifyMetric("瀏覽"), "views");
  assert.equal(classifyMetric("觀看"), "views");
});

test("inferThreadViewsFromText extracts visible Threads view counts without matching view controls", () => {
  assert.equal(inferThreadViewsFromText("132 views seeor 今日嚟萬寧 BoostUP 好狀態嘉年華"), 132);
  assert.equal(inferThreadViewsFromText("1.5K views · BoostUP"), 1500);
  assert.equal(inferThreadViewsFromText("1.2萬瀏覽"), 12000);
  assert.equal(inferThreadViewsFromText("View replies"), null);
});

test("inferThreadFollowersFromText extracts visible profile-card follower counts", () => {
  assert.equal(inferThreadFollowersFromText("Charlene\ncharlene89tian\n756 followers\nFollow"), 756);
  assert.equal(inferThreadFollowersFromText("yrzhe\n12.4K followers\nFollow"), 12400);
  assert.equal(inferThreadFollowersFromText("創作者\n1.2萬 followers\nFollow"), 12000);
  assert.equal(inferThreadFollowersFromText("View followers"), null);
});

test("cleanBodyText keeps CJK post text even when it has no spaces", () => {
  assert.equal(
    threadsTargetingTestables.cleanBodyText("一張圖讓你知道現在的就業出路有多艱難\nLike\n7"),
    "一張圖讓你知道現在的就業出路有多艱難"
  );
});

test("findCardCandidate promotes depth-capped fragment wins to the enclosing post root", () => {
  const source = readFileSync(new URL("../src/targeting/threads.ts", import.meta.url), "utf8");

  const promoteStart = source.indexOf("function promoteCandidateToPostRoot(");
  assert.notEqual(promoteStart, -1, "promotion helper must exist");
  const promoteEnd = source.indexOf("\nexport function findCardCandidate", promoteStart);
  assert.notEqual(promoteEnd, -1, "promotion helper must precede findCardCandidate");
  const promoteBlock = source.slice(promoteStart, promoteEnd);

  // Walks past the depth budget to the real article root, and only promotes
  // when the root classifies at least as strongly as the fragment.
  assert.match(promoteBlock, /closest\("article, div\[role='article'\]"\)/);
  // Post-detail pages render posts without an article wrapper (run22
  // b10-hover.json: articles=[]), so promotion must fall back to the per-post
  // pressable container — article stays first so feed behavior is unchanged.
  assert.match(promoteBlock, /closest\("div\[data-pressable-container\]"\)/);
  assert.match(promoteBlock, /score >= candidate\.score/);

  const findStart = source.indexOf("export function findCardCandidate(");
  const findBlock = source.slice(findStart, source.indexOf("\nexport function findCardRoot", findStart));
  assert.match(findBlock, /return promoteCandidateToPostRoot\(best\);/);
});

test("findCardCandidate walks and promotes without reading layout rects", () => {
  const dom = new JSDOM(`
    <main>
      <article id="post">
        <a href="/@alpha">alpha</a>
        <a href="/@alpha/post/one">1h</a>
        <svg aria-label="Like"></svg>
        <svg aria-label="Reply"></svg>
        <div><span id="hover-target">post body</span></div>
      </article>
    </main>
  `, { url: "https://www.threads.net/" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    SVGElement: globalThis.SVGElement
  };
  let rectReads = 0;
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 1000 });
  Object.defineProperty(dom.window.HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return this.id === "post" ? 600 : 200;
    }
  });
  dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    rectReads += 1;
    return {
      top: 0,
      left: 0,
      width: this.id === "post" ? 600 : 200,
      height: 100,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect;
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    SVGElement: dom.window.SVGElement
  });

  try {
    const target = dom.window.document.getElementById("hover-target");
    const candidate = findCardCandidate(target);

    assert.equal(candidate.root?.id, "post");
    assert.equal(candidate.strength, "hard");
    assert.equal(rectReads, 0);
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});

test("findCardCandidate preserves wide-card demotion with a non-rect width signal", () => {
  const dom = new JSDOM(`
    <div id="wide-card" data-pressable-container="true">
      <a href="/@alpha">alpha</a>
      <a href="/@alpha/post/one">1h</a>
      <svg aria-label="Like"></svg>
      <svg aria-label="Reply"></svg>
      <span>post body</span>
    </div>
    <div>Suggested for you</div>
  `, { url: "https://www.threads.net/" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    SVGElement: globalThis.SVGElement
  };
  let rectReads = 0;
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 1000 });
  Object.defineProperty(dom.window.HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return this.id === "wide-card" ? 950 : 0;
    }
  });
  dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    rectReads += 1;
    return {
      top: 0,
      left: 0,
      width: this.id === "wide-card" ? 950 : 0,
      height: 100,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect;
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    SVGElement: dom.window.SVGElement
  });

  try {
    const wideCard = dom.window.document.getElementById("wide-card");
    const candidate = findCardCandidate(wideCard);

    assert.equal(candidate.root?.id, "wide-card");
    assert.equal(candidate.strength, "soft");
    assert.equal(rectReads, 0);
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});

test("buildTargetDescriptor marks feed post cards as posts beyond the first article", () => {
  const dom = new JSDOM(`
    <main>
      <article>
        <a href="/@alpha">alpha</a>
        <a href="/@alpha/post/one">1h</a>
        <svg aria-label="Like"></svg><span>1</span>
        <p>first feed post</p>
      </article>
      <article id="second-post">
        <a href="/@beta">beta</a>
        <a href="/@beta/post/two">2h</a>
        <svg aria-label="Like"></svg><span>2</span>
        <p>second feed post</p>
      </article>
    </main>
  `, { url: "https://www.threads.net/" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    SVGElement: globalThis.SVGElement
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    SVGElement: dom.window.SVGElement
  });

  try {
    const card = dom.window.document.getElementById("second-post");
    assert.ok(card);
    const descriptor = buildTargetDescriptor(card, "https://www.threads.net/");

    assert.equal(descriptor?.post_url, "https://www.threads.net/@beta/post/two");
    assert.equal(descriptor?.target_type, "post");
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});

/**
 * Thumbnail extraction.
 *
 * JSDOM has no layout engine, so naturalWidth/offsetWidth are 0 for every
 * image here — the same blind spot the fixture replay documents. These cases
 * therefore exercise exactly the signals production relies on: declared
 * attributes, alt text, the media-family path segment, and the enclosing link.
 */
function withImageCard<T>(html: string, handler: (card: HTMLElement) => T): T {
  const dom = new JSDOM(`<main><article id="card">${html}</article></main>`, {
    url: "https://www.threads.net/@alpha/post/one"
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    SVGElement: globalThis.SVGElement
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    SVGElement: dom.window.SVGElement
  });
  try {
    const card = dom.window.document.getElementById("card");
    assert.ok(card);
    return handler(card as unknown as HTMLElement);
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
  }
}

// Shapes copied from tests/fixtures/threads/descriptor/rich-thread.html.
const AVATAR_IMG =
  `<img height="36" width="36" alt="alpha's profile picture" ` +
  `src="https://instagram.fna.fbcdn.net/v/t51.2885-19/371158559_823109449283951_n.jpg?oe=6A37F69F">`;
const FAVICON_IMG =
  `<img height="14" width="14" alt="" aria-hidden="true" ` +
  `src="https://external.fna.fbcdn.net/emg1/v/t13/580727449633084326?url=https%3A%2F%2Fluma.com%2Ffavicon.ico">`;
const PHOTO_URL =
  "https://scontent.cdninstagram.com/v/t51.2885-15/482913746_18072936105628190_n.jpg?oe=68D9F3A2";
const PHOTO_IMG = `<img height="100%" width="100%" alt="A chart" src="${PHOTO_URL}">`;

test("extractImageUrl picks the post attachment over the author avatar", () => {
  const url = withImageCard(`${AVATAR_IMG}<p>post body</p>${PHOTO_IMG}`, extractImageUrl);
  assert.equal(url, PHOTO_URL);
});

test("extractImageUrl returns null for a text-only post that only shows avatars", () => {
  const url = withImageCard(`${AVATAR_IMG}<p>text only</p>${AVATAR_IMG}`, extractImageUrl);
  assert.equal(url, null);
});

test("extractImageUrl ignores link-preview favicons", () => {
  const url = withImageCard(`${AVATAR_IMG}${FAVICON_IMG}<p>a shared link</p>`, extractImageUrl);
  assert.equal(url, null);
});

test("extractImageUrl falls back to a video poster so video posts get a thumbnail", () => {
  const poster = "https://scontent.cdninstagram.com/v/t51.2885-15/poster_frame.jpg?oe=68D9F3A2";
  const url = withImageCard(
    `${AVATAR_IMG}<video poster="${poster}"></video>`,
    extractImageUrl
  );
  assert.equal(url, poster);
});

test("extractImageUrl rejects an image whose only link is the author profile", () => {
  // Same media family as a real photo, but wrapped in a bare profile permalink —
  // the path check alone would let this through.
  const url = withImageCard(
    `<a href="/@alpha"><img height="120" width="120" alt="alpha" src="${PHOTO_URL}"></a>`,
    extractImageUrl
  );
  assert.equal(url, null);
});

test("extractImageUrl drops over-long proxied URLs instead of truncating them", () => {
  // A truncated URL is a broken URL, and these proxy URLs run past 1,600 chars
  // in the captured fixture. Dropping keeps per-record storage bounded.
  const long = `https://external.fna.fbcdn.net/emg1/v/t13/1?url=${"a".repeat(1100)}`;
  assert.ok(long.length > 1024);
  const url = withImageCard(`<img height="400" width="400" src="${long}">`, extractImageUrl);
  assert.equal(url, null);
});

test("extractImageUrl ignores non-http sources", () => {
  const url = withImageCard(
    `<img height="400" width="400" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`,
    extractImageUrl
  );
  assert.equal(url, null);
});

test("extractImageUrl takes the first surviving image in document order", () => {
  const second = "https://scontent.cdninstagram.com/v/t51.2885-15/quoted_post.jpg";
  const url = withImageCard(
    `${PHOTO_IMG}<blockquote><img height="200" width="200" src="${second}"></blockquote>`,
    extractImageUrl
  );
  assert.equal(url, PHOTO_URL);
});

test("buildTargetDescriptor carries image_url, and reports null rather than omitting it", () => {
  const withPhoto = withImageCard(
    `<a href="/@alpha/post/one">1h</a>${PHOTO_IMG}<p>body</p>`,
    (card) => buildTargetDescriptor(card, "https://www.threads.net/@alpha/post/one")
  );
  assert.equal(withPhoto?.image_url, PHOTO_URL);

  const withoutPhoto = withImageCard(
    `<a href="/@alpha/post/one">1h</a>${AVATAR_IMG}<p>body</p>`,
    (card) => buildTargetDescriptor(card, "https://www.threads.net/@alpha/post/one")
  );
  assert.equal(withoutPhoto?.image_url, null);
  assert.equal("image_url" in (withoutPhoto ?? {}), true);
});
