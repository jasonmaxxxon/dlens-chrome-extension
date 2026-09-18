import assert from "node:assert/strict";
import test from "node:test";

import { createSessionItem } from "../src/state/store-helpers.ts";
import type { SessionItem } from "../src/state/types.ts";
import {
  LIBRARY_SEARCH_MIN_ITEMS,
  parseLibrarySearchTokens,
  searchSessionItems,
  sessionItemMatchesTokens
} from "../src/viewmodel/library-search.ts";

function makeItem(id: string, authorHint: string, textSnippet: string): SessionItem {
  return createSessionItem(
    {
      target_type: "post",
      page_url: `https://www.threads.net/@${authorHint}/post/${id}`,
      post_url: `https://www.threads.net/@${authorHint}/post/${id}`,
      author_hint: authorHint,
      text_snippet: textSnippet,
      time_token_hint: "1h",
      dom_anchor: `card-${id}`,
      engagement: {},
      engagement_present: {},
      captured_at: "2026-09-01T00:00:00.000Z"
    },
    "2026-09-01T00:00:00.000Z"
  );
}

const items = [
  makeItem("a", "alpha", "租金管制真係幫到人？"),
  makeItem("b", "beta", "Remote work is dead, says CEO"),
  makeItem("c", "gamma", "租金升幅同工資脫節")
];

test("searchSessionItems returns every row for an empty or whitespace query", () => {
  for (const query of ["", "   ", "\t"]) {
    const result = searchSessionItems(items, query);
    assert.equal(result.isFiltering, false);
    assert.equal(result.items.length, items.length);
    assert.equal(result.matchCount, items.length);
    assert.equal(result.totalCount, items.length);
  }
});

test("searchSessionItems matches text_snippet without whitespace tokenisation (CJK)", () => {
  const result = searchSessionItems(items, "租金");
  assert.equal(result.isFiltering, true);
  assert.deepEqual(result.items.map((item) => item.descriptor.author_hint), ["alpha", "gamma"]);
  assert.equal(result.matchCount, 2);
  assert.equal(result.totalCount, 3);
});

test("searchSessionItems matches author_hint case-insensitively and ignores a typed @", () => {
  assert.deepEqual(
    searchSessionItems(items, "BETA").items.map((item) => item.descriptor.author_hint),
    ["beta"]
  );
  assert.deepEqual(
    searchSessionItems(items, "@beta").items.map((item) => item.descriptor.author_hint),
    ["beta"]
  );
});

test("searchSessionItems ANDs whitespace-separated tokens across both fields", () => {
  assert.deepEqual(
    searchSessionItems(items, "gamma 租金").items.map((item) => item.descriptor.author_hint),
    ["gamma"]
  );
  assert.equal(searchSessionItems(items, "alpha remote").matchCount, 0);
});

test("searchSessionItems reports an honest zero match instead of falling back to the full list", () => {
  const result = searchSessionItems(items, "無關字串");
  assert.equal(result.isFiltering, true);
  assert.equal(result.items.length, 0);
  assert.equal(result.matchCount, 0);
  assert.equal(result.totalCount, 3);
});

test("search reads only text_snippet and author_hint, never the post URL", () => {
  const result = searchSessionItems(items, "threads.net");
  assert.equal(result.matchCount, 0);
});

test("rows missing either field never throw and simply do not match", () => {
  const bare = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@ghost/post/z",
      post_url: "https://www.threads.net/@ghost/post/z",
      author_hint: "",
      text_snippet: "",
      time_token_hint: "",
      dom_anchor: "card-z",
      engagement: {},
      engagement_present: {},
      captured_at: "2026-09-01T00:00:00.000Z"
    },
    "2026-09-01T00:00:00.000Z"
  );
  assert.equal(sessionItemMatchesTokens(bare, ["ghost"]), false);
  assert.equal(sessionItemMatchesTokens(bare, []), true);
  assert.equal(searchSessionItems([bare], "ghost").matchCount, 0);
});

test("parseLibrarySearchTokens normalises case, @ prefixes, and blank tokens", () => {
  assert.deepEqual(parseLibrarySearchTokens("  @Alpha   Beta "), ["alpha", "beta"]);
  assert.deepEqual(parseLibrarySearchTokens("@@@"), []);
});

test("the search row threshold stays above a list that is already scannable", () => {
  assert.ok(LIBRARY_SEARCH_MIN_ITEMS >= 5);
});
