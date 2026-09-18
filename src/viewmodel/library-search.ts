import type { SessionItem } from "../state/types";

/**
 * Local-only search over the collection list. It reads the two descriptor fields
 * that are always present on a saved Threads post — `text_snippet` and
 * `author_hint` — so it works on every row without a crawl, an analysis, or a
 * new storage field. Nothing here talks to the backend.
 */

/** Below this many rows the list is already scannable, so the search row is noise. */
export const LIBRARY_SEARCH_MIN_ITEMS = 6;

export interface LibrarySearchResult {
  /** Rows to render: the full input when the query is empty. */
  items: SessionItem[];
  /** True once the query narrows the list, so the caller can show a count/reset. */
  isFiltering: boolean;
  matchCount: number;
  totalCount: number;
}

function itemHaystack(item: SessionItem): string {
  const descriptor = item.descriptor;
  return `${descriptor.text_snippet || ""}\n${descriptor.author_hint || ""}`.toLowerCase();
}

/** Whitespace-separated tokens, AND-combined. CJK queries carry no whitespace,
 *  so they stay a single substring match. A leading `@` is dropped because the
 *  list renders authors as `@handle` while `author_hint` stores the bare handle. */
export function parseLibrarySearchTokens(rawQuery: string): string[] {
  return rawQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^@+/, ""))
    .filter(Boolean);
}

export function sessionItemMatchesTokens(item: SessionItem, tokens: string[]): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const haystack = itemHaystack(item);
  return tokens.every((token) => haystack.includes(token));
}

export function searchSessionItems(items: SessionItem[], rawQuery: string): LibrarySearchResult {
  const tokens = parseLibrarySearchTokens(rawQuery);
  if (tokens.length === 0) {
    return { items, isFiltering: false, matchCount: items.length, totalCount: items.length };
  }
  const matched = items.filter((item) => sessionItemMatchesTokens(item, tokens));
  return {
    items: matched,
    isFiltering: true,
    matchCount: matched.length,
    totalCount: items.length
  };
}
