import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { SessionItem, SessionRecord } from "../state/types";
import { stripThreadsTranslationChrome } from "../state/source-text";
import { parseLibrarySearchTokens } from "./library-search";

export interface CollectionMembership {
  sessionId: string;
  sessionName: string;
  mode: SessionRecord["mode"];
  itemId: string;
  savedAt: string;
  status: SessionItem["status"];
  captureId: string | null;
}

export interface CollectionPost {
  key: string;
  descriptor: TargetDescriptor;
  author: string;
  body: string;
  bodySource: "capture" | "snippet" | "none";
  postUrl: string | null;
  imageUrls: string[];
  savedAt: string;
  capturedAt: string | null;
  status: SessionItem["status"];
  captureLimit: string | null;
  memberships: CollectionMembership[];
}

interface SavedSource { session: SessionRecord; item: SessionItem }

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeWebUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    return url.username || url.password ? null : url.href;
  } catch { return null; }
}

function normalizePostUrl(value: unknown): string | null {
  const safe = safeWebUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (/^(www\.)?threads\.(net|com)$/i.test(url.hostname)) {
    // A feed/profile page does not identify a saved post.
    if (!/\/(?:post|t)\/[^/]+/i.test(url.pathname)) return null;
    url.protocol = "https:";
    url.hostname = "www.threads.com";
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

function sourceUrl(item: SessionItem): string | null {
  return [item.descriptor.post_url, item.canonicalTargetUrl, item.latestCapture?.source_post_url,
    item.latestCapture?.canonical_target_url].map(normalizePostUrl).find(Boolean) ?? null;
}

function timestamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function byNewestSave(a: SavedSource, b: SavedSource): number {
  return timestamp(b.item.savedAt) - timestamp(a.item.savedAt)
    || timestamp(b.item.descriptor.captured_at) - timestamp(a.item.descriptor.captured_at)
    || a.session.id.localeCompare(b.session.id) || a.item.id.localeCompare(b.item.id);
}

function captureTime(source: SavedSource): string | null {
  const capture = source.item.latestCapture;
  return capture?.result?.fetched_at || capture?.captured_at || null;
}

function capturedBody(item: SessionItem): string {
  const result = item.latestCapture?.result;
  if (!result) return "";
  const thread = result.thread_read_model ?? result.threadReadModel;
  const root = text((thread?.root_post ?? thread?.rootPost)?.text) || text(result.canonical_post?.text);
  const continuations = thread?.op_continuations ?? thread?.opContinuations ?? [];
  // These are captured root/OP spans. Audience replies and analysis prose are
  // deliberately outside the original-post reading projection.
  if (root) return [root, ...continuations.map((part) => text(part.text)).filter(Boolean)].join("\n\n");
  return text(thread?.assembled_content ?? thread?.assembledContent);
}

function capturedImages(item: SessionItem): string[] {
  const images = item.latestCapture?.result?.canonical_post?.images;
  if (!Array.isArray(images)) return [];
  // The crawler's normalized canonical_post.images contract is string[].
  return [...new Set(images.map(safeWebUrl).filter((url): url is string => url !== null))];
}

/** Read-only source projection across every workspace; never creates stored rows. */
export function buildCollectionPosts(sessions: SessionRecord[]): CollectionPost[] {
  const groups = new Map<string, SavedSource[]>();
  for (const session of sessions) {
    for (const item of session.items) {
      const url = sourceUrl(item);
      const key = url ? `url:${url}` : `item:${encodeURIComponent(session.id)}/${encodeURIComponent(item.id)}`;
      const sources = groups.get(key) ?? [];
      sources.push({ session, item });
      groups.set(key, sources);
    }
  }
  return [...groups].map(([key, group]): CollectionPost => {
    const sources = [...group].sort(byNewestSave);
    const latest = sources[0].item;
    const captures = [...sources].sort((a, b) => timestamp(captureTime(b)) - timestamp(captureTime(a)) || byNewestSave(a, b));
    const bodySource = captures.find(({ item }) => capturedBody(item));
    const snippet = sources.map(({ item }) => stripThreadsTranslationChrome(text(item.descriptor.text_snippet)) || text(item.latestCapture?.text_snippet)).find(Boolean) ?? "";
    const body = bodySource ? capturedBody(bodySource.item) : snippet;
    const images = captures.map(({ item }) => capturedImages(item)).find((urls) => urls.length > 0);
    const thumbnail = sources.map(({ item }) => safeWebUrl(item.descriptor.image_url)).find(Boolean);
    const author = text(latest.descriptor.author_hint)
      || text(bodySource?.item.latestCapture?.result?.canonical_post?.author)
      || sources.map(({ item }) => text(item.descriptor.author_hint)).find(Boolean) || "";
    return {
      key, descriptor: latest.descriptor, author, body,
      bodySource: bodySource ? "capture" : body ? "snippet" : "none",
      postUrl: sourceUrl(latest), imageUrls: images ?? (thumbnail ? [thumbnail] : []),
      savedAt: latest.savedAt, capturedAt: bodySource ? captureTime(bodySource) : null,
      status: latest.status,
      captureLimit: !bodySource && body ? "目前保存的是收藏時擷取的文字；完整內容可查看原帖。" : null,
      memberships: sources.map(({ session, item }) => ({
        sessionId: session.id, sessionName: session.name, mode: session.mode, itemId: item.id,
        savedAt: item.savedAt, status: item.status, captureId: item.captureId
      }))
    };
  }).sort((a, b) => timestamp(b.savedAt) - timestamp(a.savedAt) || a.key.localeCompare(b.key));
}

export function searchCollectionPosts(posts: CollectionPost[], query: string): CollectionPost[] {
  const tokens = parseLibrarySearchTokens(query);
  if (!tokens.length) return posts;
  return posts.filter((post) => {
    const haystack = `${post.author}\n${post.body}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
