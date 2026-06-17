/**
 * Phase B fixture replay for the threads extraction crawler audit.
 *
 * Loads tests/fixtures/threads/descriptor/rich-thread.html (sanitized,
 * captured 2026-06-17 from threads.com/@aiposthub/post/DZpehhuAdCe)
 * into JSDOM and replays findCardCandidate + buildTargetDescriptor
 * against it for the labels the capture supports.
 *
 * The starting element for each replay is a span inside the post body
 * text. This mirrors real hover behavior — users hover on the
 * post text, not on the timestamp/permalink anchor (which by itself
 * scores too weak to find a proper card root and would surface the
 * F2 wrong-author heuristic spuriously).
 *
 * What it locks: target_type, post_url, author_hint, engagement.likes
 * and engagement_source for the OP and the first OP-continuation
 * reply at today's behavior. Drift on these fails the test. F-area
 * selector "fixes" must update the snapshot in the same PR.
 *
 * What it does NOT cover (no fixture):
 *   - direct-reply, reply-with-nested-quote, repost, quoted-post,
 *     post-with-unrelated-page-counts. Each is test.skip below and
 *     will start asserting when a future authorized capture adds a
 *     fixture under tests/fixtures/threads/descriptor/<label>.html.
 *
 * JSDOM caveat: there is no layout engine, so getBoundingClientRect
 * returns zeros and window.innerWidth is 0. collectCandidateSignals
 * therefore reports widthRatio=0 for every card and the width-based
 * scoring penalties never fire. That makes the scoring slightly more
 * generous than production but does not change which card root is
 * picked here because the body-text starting points already land
 * inside data-pressable-container=true cards (score=9, hard).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { JSDOM } from "jsdom";

import { buildTargetDescriptor, findCardCandidate } from "../src/targeting/threads.ts";

const FIXTURE_PATH = path.join(
  import.meta.dirname,
  "fixtures",
  "threads",
  "descriptor",
  "rich-thread.html"
);

const PAGE_URL = "https://www.threads.net/@aiposthub/post/DZpehhuAdCe";

function installJsdomGlobals(html: string, pageUrl: string): { dom: JSDOM; restore: () => void } {
  const dom = new JSDOM(html, { url: pageUrl });
  const prior = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    HTMLElement: (globalThis as any).HTMLElement,
    Element: (globalThis as any).Element,
    Node: (globalThis as any).Node,
    SVGElement: (globalThis as any).SVGElement,
  };
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).HTMLElement = dom.window.HTMLElement;
  (globalThis as any).Element = dom.window.Element;
  (globalThis as any).Node = dom.window.Node;
  (globalThis as any).SVGElement = dom.window.SVGElement;
  return {
    dom,
    restore() {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) {
          delete (globalThis as any)[key];
        } else {
          (globalThis as any)[key] = value;
        }
      }
      dom.window.close();
    },
  };
}

function withJsdom<T>(handler: (dom: JSDOM) => T): T {
  const html = readFileSync(FIXTURE_PATH, "utf8");
  const { dom, restore } = installJsdomGlobals(html, PAGE_URL);
  try {
    return handler(dom);
  } finally {
    restore();
  }
}

/**
 * Find a text node that contains the needle and return its parent
 * element. Used to simulate a hover on the post body text — the real
 * user gesture that hits findCardCandidate.
 */
function findHoverTargetByText(dom: JSDOM, needle: string): HTMLElement | null {
  const document = dom.window.document;
  const walker = document.createTreeWalker(document.body, dom.window.NodeFilter.SHOW_TEXT);
  while (true) {
    const node = walker.nextNode();
    if (!node) break;
    if ((node.textContent || "").includes(needle)) {
      return node.parentElement as unknown as HTMLElement | null;
    }
  }
  return null;
}

test("rich-thread fixture loads and exposes the expected pressable cards", () => {
  withJsdom((dom) => {
    const document = dom.window.document;
    const pressables = document.querySelectorAll('[data-pressable-container]');
    // capture_meta.json recorded 7 structured cards (1 OP + 5 OP
    // self-replies + 1 pinned CTA card).
    assert.equal(pressables.length, 7);
  });
});

test("descriptor replay: op-post — body-text hover resolves to the OP card", () => {
  withJsdom((dom) => {
    const opBody = findHoverTargetByText(dom, "把 Hermes Agent 部署到雲端");
    assert.ok(opBody, "OP body text not found in fixture");
    const candidate = findCardCandidate(opBody);
    assert.equal(candidate.strength, "hard", `expected hard candidate, got ${candidate.strength} (score ${candidate.score})`);
    assert.ok(candidate.root, "no card root resolved for OP");

    const descriptor = buildTargetDescriptor(candidate.root!, PAGE_URL);
    assert.ok(descriptor, "buildTargetDescriptor returned null");

    assert.equal(descriptor!.target_type, "post");
    assert.match(descriptor!.post_url, /\/post\/DZpehhuAdCe$/);
    assert.equal(descriptor!.author_hint, "aiposthub");

    // Card engagement is read from SVG aria-label + sibling span.
    // Locked at the values from the live capture; drift fails.
    assert.equal(descriptor!.engagement.likes, 137);
    assert.equal(descriptor!.engagement.comments, 13);
    assert.equal(descriptor!.engagement.reposts, 8);
    assert.equal(descriptor!.engagement.forwards, 38);

    // F1 telemetry — OP page card has all four primary metrics inside
    // the card itself, so the body fallback never fires.
    assert.equal(descriptor!.engagement_source, "card");
  });
});

test("descriptor replay: op-continuation-chain — body-text hover on first self-reply", () => {
  withJsdom((dom) => {
    const replyBody = findHoverTargetByText(dom, "筆電蓋起來");
    assert.ok(replyBody, "First OP-reply body text not found in fixture");
    const candidate = findCardCandidate(replyBody);
    assert.equal(candidate.strength, "hard", `expected hard candidate, got ${candidate.strength} (score ${candidate.score})`);
    assert.ok(candidate.root, "no card root resolved for OP self-reply");

    const descriptor = buildTargetDescriptor(candidate.root!, PAGE_URL);
    assert.ok(descriptor, "buildTargetDescriptor returned null");

    // The page URL is for DZpehhuAdCe; this card is for DZpeh3tAYBq —
    // so classifyTargetType pegs it as comment.
    assert.equal(descriptor!.target_type, "comment");
    assert.match(descriptor!.post_url, /\/post\/DZpeh3tAYBq$/);
    // F2 audit: author_hint must NOT lose the OP author identity when
    // the user hovers on a self-reply. This is the signal the backend
    // read model uses to detect op_continuations.
    assert.equal(descriptor!.author_hint, "aiposthub");

    // Capture-time card metrics
    assert.equal(descriptor!.engagement.likes, 5);
    assert.equal(descriptor!.engagement.comments, 1);

    assert.equal(descriptor!.engagement_source, "card");
  });
});

test("descriptor replay: thread-with-expanded-replies — five-link chain is present in fixture", () => {
  withJsdom((dom) => {
    // Page-shape assertion (not a descriptor assertion). The presence
    // of all five OP-continuation permalinks is what makes this thread
    // a useful drill fixture for PR 4 backend parser replay.
    const document = dom.window.document;
    const chain = ["DZpeh3tAYBq", "DZpeiZ-AQxV", "DZpei-QgSEf", "DZpejaiAZiD", "DZpej-UgaLJ"];
    for (const id of chain) {
      const anchor = document.querySelector(`a[href*="/post/${id}"]`);
      assert.ok(anchor, `expected chain link ${id} to be present in fixture`);
    }
  });
});

// === Labels that this single capture does not exercise. ===
// Each test below is a TODO placeholder; remove the .skip + add real
// assertions when a future authorized capture lands fixtures for the
// label under tests/fixtures/threads/descriptor/<label>.html. The
// fixture coverage table lives in the backend repo at
// tests/crawlers/fixtures/threads/LABEL_COVERAGE.md.

test.skip("descriptor replay: direct-reply — needs a thread with non-OP replies (no fixture yet)", () => {
  /* TODO: capture a thread where someone other than the OP replies. */
});

test.skip("descriptor replay: reply-with-nested-quote — needs a reply embedding a quoted post (no fixture yet)", () => {
  /* TODO: capture a thread where a reply embeds another post. */
});

test.skip("descriptor replay: repost — needs a real 'X reposted' header (no fixture yet)", () => {
  /* TODO: capture a thread with a real repost header (not the CSS-variable false positive in rich-thread). */
});

test.skip("descriptor replay: quoted-post — needs a quoted-post pressable card (no fixture yet)", () => {
  /* TODO: capture a thread containing a quoted-post pressable. */
});

test.skip("descriptor replay: post-with-unrelated-page-counts — needs profile-side counters surrounding the post (no fixture yet)", () => {
  /* TODO: capture a post-detail page where the surrounding chrome shows author follower / view counts outside the card. */
});
