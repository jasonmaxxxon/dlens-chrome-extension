import type { SessionItem } from "../state/types.ts";
import type { CrawlComment } from "./inline-reading.ts";
import { classifyCommentQuality } from "./comment-quality.ts";

export const COMMENT_ELIGIBILITY_VERSION = "v1";
export interface EligibleComment extends CrawlComment {
  aliases: string[];
  permalink?: string;
  parentConflict?: boolean;
}
export interface CommentEligibility {
  all: EligibleComment[];
  audience: EligibleComment[];
  authorReplies: EligibleComment[];
  authorContinuations: EligibleComment[];
  unknown: EligibleComment[];
  op: string;
  byId: Map<string, EligibleComment>;
  structureKnown: boolean;
  excluded: { root: number; duplicates: number; op: number; unknown: number };
}
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const UNKNOWN_AUTHOR = new Set(["unknown", "anonymous", "none", "null", "undefined", "作者", "author", "pinned", "pin icon", "verified", "follow", "following", "more", "top", "translate", "edited", "置頂", "追蹤", "更多", "翻譯", "已編輯"]);
export const normalizeEligibilityHandle = (value: unknown): string => text(value).replace(/^@/, "").toLowerCase();
const knownHandle = (value: unknown, corroborated = false): string => {
  const handle = normalizeEligibilityHandle(value);
  return /^[a-z0-9._-]+$/.test(handle) && (corroborated || !UNKNOWN_AUTHOR.has(handle)) ? handle : "";
};
const THREADS_CHROME_LINE = /^(?:reply to|回覆|回复)\s+@?[\p{L}\p{N}._]+\s*(?:…|\.{3})?$/iu;
export const cleanEligibilityText = (value: unknown): string =>
  (typeof value === "string" ? value : "").split("\n").filter(line => !THREADS_CHROME_LINE.test(line.trim())).join("\n").trim();
const normalizedText = (value: string): string => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** Own locator fields only; body mentions and arbitrary linked text are excluded. */
export function readThreadsPostLocator(value: unknown): { code: string; handle: string; permalink: string } | null {
  const raw = text(value);
  if (!raw || /[\s\\]/.test(raw)) return null;
  try {
    const url = new URL(raw, "https://www.threads.com/");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        !["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/@([a-z0-9._-]+)\/post\/([A-Za-z0-9_-]+)(?:\/media)?\/?$/i);
    return match ? { code: match[2], handle: match[1].toLowerCase(), permalink: "https://www.threads.com/@" + match[1].toLowerCase() + "/post/" + match[2] } : null;
  } catch { return null; }
}

export function readEligibilityOp(item: SessionItem): string {
  const post = object(item.latestCapture?.result?.canonical_post);
  const descriptor = object(item.descriptor);
  const locators = [post.url, descriptor.post_url, descriptor.page_url].map(readThreadsPostLocator).filter(value => value !== null);
  for (const candidate of [post.author, descriptor.author_hint]) {
    const handle = knownHandle(candidate, locators.some(locator => locator.handle === normalizeEligibilityHandle(candidate)));
    if (handle) return handle;
  }
  return locators[0]?.handle ?? "";
}

export function readCommentEligibility(item: SessionItem): CommentEligibility {
  const result = item.latestCapture?.result;
  const op = readEligibilityOp(item);
  const post = object(result?.canonical_post), descriptor = object(item.descriptor);
  const rootIds = new Set([post.post_id, post.postId, post.source_post_code, post.source_comment_id].map(text).filter(Boolean));
  for (const value of [post.url, descriptor.post_url, descriptor.page_url]) {
    const locator = readThreadsPostLocator(value);
    if (locator) rootIds.add(locator.code);
  }
  const rawPayload = object(object(result).raw_payload);
  const rawRows = Array.isArray(rawPayload.threads_comments) ? rawPayload.threads_comments.map(object) : [];
  const rawById = new Map<string, Record<string, unknown>>();
  for (const row of rawRows) for (const id of [row.comment_id, row.source_comment_id].map(text).filter(Boolean)) rawById.set(id, row);
  const rows = (result?.comments ?? []).map((value, index) => {
    const row = object(value);
    const id = text(row.comment_id ?? row.commentId), sourceId = text(row.source_comment_id ?? row.sourceCommentId);
    const raw = rawById.get(id) ?? rawById.get(sourceId) ?? {};
    const locator = [row.source_locator, row.permalink, row.post_url, row.url, raw.source_locator].map(readThreadsPostLocator).find(Boolean);
    const aliases = [...new Set([id, sourceId, locator?.code ?? ""].filter(Boolean))];
    const suppliedAuthor = knownHandle(row.author, (!!locator && locator.handle === normalizeEligibilityHandle(row.author))
      || (!!op && op === normalizeEligibilityHandle(row.author)));
    const authorConflict = !!suppliedAuthor && !!locator && suppliedAuthor !== locator.handle;
    // A legacy locator can reject a root or corroborate a supplied handle, but
    // it does not turn an unknown author into a known audience member.
    const author = authorConflict ? "" : suppliedAuthor;
    return {
      id: id || sourceId || locator?.code || "unresolved-" + (index + 1),
      aliases, sourceId: sourceId || undefined,
      parent: text(row.parent_comment_id ?? row.parentCommentId) || null,
      parentSourceId: text(row.parent_source_comment_id ?? row.parentSourceCommentId) || null,
      author, authorConflict, text: cleanEligibilityText(row.text), likes: finite(row.like_count ?? row.likeCount),
      replies: finite(row.reply_count ?? row.replyCount), time: text(row.time_token ?? row.timeToken) || null,
      ...(locator ? { permalink: locator.permalink } : {}),
    };
  }).filter(row => row.text);
  // Retain all aliases after identity and known-author/text deduplication.
  const parents = rows.map((_, index) => index);
  const find = (index: number): number => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const join = (a: number, b: number): void => { parents[find(b)] = find(a); };
  const identities = new Map<string, number>(), bodies = new Map<string, number>();
  rows.forEach((row, index) => {
    for (const alias of row.aliases) {
      const previous = identities.get(alias);
      if (previous !== undefined) join(previous, index); else identities.set(alias, index);
    }
    if (row.author) {
      const key = row.author + "|" + normalizedText(row.text);
      const previous = bodies.get(key);
      if (previous !== undefined) join(previous, index); else bodies.set(key, index);
    }
  });
  const groups = new Map<number, typeof rows>();
  rows.forEach((row, index) => { const key = find(index); groups.set(key, [...(groups.get(key) ?? []), row]); });
  const all: EligibleComment[] = [], parentCandidates = new Map<EligibleComment, string[]>();
  let roots = 0, duplicates = 0;
  for (const group of groups.values()) {
    const aliases = [...new Set(group.flatMap(row => row.aliases))];
    if (aliases.some(alias => rootIds.has(alias))) { roots += group.length; continue; }
    duplicates += group.length - 1;
    const authors = [...new Set(group.map(row => row.author).filter(Boolean))];
    const chosen = group.reduce((a, b) => b.text.length > a.text.length ? b : a);
    const comment: EligibleComment = { ...chosen, id: group[0].id, aliases, author: authors.length === 1 && !group.some(row => row.authorConflict) ? authors[0] : "",
      sourceId: group.find(row => row.sourceId)?.sourceId,
      likes: group.reduce<number | null>((best, row) => row.likes === null ? best : Math.max(best ?? row.likes, row.likes), null) };
    all.push(comment);
    parentCandidates.set(comment, [...new Set(group.flatMap(row => [row.parent, row.parentSourceId]).filter((value): value is string => !!value))]);
  }
  const byId = new Map<string, EligibleComment>();
  for (const row of all) for (const alias of [row.id, ...row.aliases]) byId.set(alias, row);
  for (const row of all) {
    const candidates = parentCandidates.get(row) ?? [];
    const rootKey = rootIds.values().next().value;
    const canonical = [...new Set(candidates.map(parent => rootIds.has(parent) ? rootKey! : byId.get(parent)?.id ?? parent))];
    if (canonical.length > 1) {
      row.parent = row.parentSourceId = null;
      row.parentConflict = true;
    } else if (canonical.length === 1) row.parent = canonical[0];
    if (row.parent && byId.get(row.parent) === row) {
      row.parent = row.parentSourceId = null;
      row.parentConflict = true;
    }
  }
  for (const row of all) {
    const chain: EligibleComment[] = [];
    let current: EligibleComment | undefined = row;
    while (current?.parent) {
      const repeated = chain.indexOf(current);
      if (repeated >= 0) {
        for (const cyclic of chain.slice(repeated)) {
          cyclic.parent = cyclic.parentSourceId = null;
          cyclic.parentConflict = true;
        }
        break;
      }
      chain.push(current);
      current = byId.get(current.parent);
    }
  }
  for (const row of all) row.quality = classifyCommentQuality(row.text, {
    parentText: !row.parentConflict && row.parent ? byId.get(row.parent)?.text : undefined,
  });
  const audience = all.filter(row => !!op && !!row.author && row.author !== op);
  const audienceIds = new Set(audience.map(row => row.id));
  const authorReplies = all.filter(row => !!op && row.author === op && !row.parentConflict &&
    !!row.parent && audienceIds.has(byId.get(row.parent)?.id ?? ""));
  const authorIds = new Set(authorReplies.map(row => row.id));
  const authorContinuations = all.filter(row => !!op && row.author === op && !authorIds.has(row.id));
  const unknown = all.filter(row => !op || !row.author);
  return { all, audience, authorReplies, authorContinuations, unknown, op, byId,
    structureKnown: all.length > 0 && all.every(row => !!row.parent && !row.parentConflict &&
      (!!byId.get(row.parent) || rootIds.has(row.parent))),
    excluded: { root: roots, duplicates, op: authorContinuations.length + authorReplies.length, unknown: unknown.length } };
}
