import { inlineCollectPostKey } from "../state/inline-collect";
import { providerKeyFromSettings } from "../state/ai-key";
import { productReadingFinishedAt, PRODUCT_VERDICT_LABELS } from "./product-reader";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { ProductSignalAnalysis, Signal, ExtensionSettings, SessionItem, SessionRecord } from "../state/types";
import { stripThreadsTranslationChrome } from "../state/source-text";
import { buildInlineCardViewModel, buildInlineSaveLine, inlineReadingFinishedAt } from "./inline-card";
import type { InlineReadingRecord } from "../compare/inline-reading-storage";
import { INLINE_READING_PROMPT_VERSION } from "../compare/inline-reading";
import type { OpenedReadings } from "../state/opened-readings-storage";
import { postedAt } from "./topic-discourse";
/** AND-combined local search tokens; leading @ matches stored author handles. */
export function parseLibrarySearchTokens(rawQuery: string): string[] {
  return rawQuery.trim().toLowerCase().split(/\s+/).map(token => token.replace(/^@+/, "")).filter(Boolean);
}

export interface CollectionMembership {
  sessionId: string;
  sessionName: string;
  mode: SessionRecord["mode"];
  itemId: string;
  savedAt: string;
  status: SessionItem["status"];
  captureId: string | null;
  item: SessionItem;
}

export interface CollectionPost {
  key: string;
  postedAtMs: number | null;
  tileCharacter: string;
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

// When the post card has no image, the crawler falls back to every <img> on the
// page. That sweep always carries avatars (t51.*-19) and Threads' own sticker
// art (t1.*-9), so a list holding either is the page, not the post's media.
const PAGE_SWEEP_IMAGE_RE = /\/(t51\.\d+-19|t1\.\d+-9)\//;

function capturedImages(item: SessionItem): string[] {
  const images = item.latestCapture?.result?.canonical_post?.images;
  if (!Array.isArray(images)) return [];
  // The crawler's normalized canonical_post.images contract is string[].
  const urls = [...new Set(images.map(safeWebUrl).filter((url): url is string => url !== null))];
  return urls.some((url) => PAGE_SWEEP_IMAGE_RE.test(url)) ? [] : urls;
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
      key, postedAtMs: postedAt(latest), tileCharacter: [...body.trim()][0] || "？", descriptor: latest.descriptor, author, body,
      bodySource: bodySource ? "capture" : body ? "snippet" : "none",
      postUrl: sourceUrl(latest), imageUrls: images ?? (thumbnail ? [thumbnail] : []),
      savedAt: latest.savedAt, capturedAt: bodySource ? captureTime(bodySource) : null,
      status: latest.status,
      captureLimit: !bodySource && body ? "目前保存的是收藏時擷取的文字；完整內容可查看原帖。" : null,
      memberships: sources.map(({ session, item }) => ({
        sessionId: session.id, sessionName: session.name, mode: session.mode, itemId: item.id,
        savedAt: item.savedAt, status: item.status, captureId: item.captureId, item
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


export type CollectionSort = "saved" | "posted" | "comments";
export const COLLECTION_SORTS = [
  { key: "saved", label: "最近收藏" }, { key: "posted", label: "發帖時間" }, { key: "comments", label: "留言最多" }
] as const;

export function collectionRelativeTime(timeMs: number | null, nowMs: number): string | null {
  if (timeMs === null || !Number.isFinite(timeMs)) return null;
  const elapsed = Math.max(0, nowMs - timeMs);
  return elapsed < 3600000 ? `${Math.floor(elapsed / 60000)}m`
    : elapsed < 86400000 ? `${Math.floor(elapsed / 3600000)}h` : `${Math.floor(elapsed / 86400000)}d`;
}

export function collectionSavedTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-HK", { dateStyle: "medium", timeStyle: "short" }) : value;
}

function collectionDay(timeMs: number | null, nowMs: number): { key: string; label: string } | null {
  if (timeMs === null || !Number.isFinite(timeMs)) return null;
  const date = new Date(timeMs), today = new Date(nowMs), yesterday = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = new Date(timeMs); day.setHours(0, 0, 0, 0);
  return { key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    label: day.getTime() === today.getTime() ? "今天" : day.getTime() === yesterday.getTime() ? "昨天" : `${date.getMonth() + 1}月${date.getDate()}日` };
}

export interface CollectionBrowserRow {
  post: CollectionPost;
  dayLabel: string | null;
  postedRelative: string | null;
  comments: number | null;
}

export function buildCollectionBrowserModel(posts: CollectionPost[], query: string, sort: CollectionSort, nowMs: number) {
  const timeOf = (p: CollectionPost) => sort === "posted" ? p.postedAtMs : Number.isFinite(Date.parse(p.savedAt)) ? Date.parse(p.savedAt) : null;
  const visible = [...searchCollectionPosts(posts, query)].sort((a, b) => {
    const primary = sort === "comments"
      ? (b.descriptor.engagement.comments ?? -1) - (a.descriptor.engagement.comments ?? -1)
      : (timeOf(b) ?? -Infinity) - (timeOf(a) ?? -Infinity);
    return (Number.isNaN(primary) ? 0 : primary) || timestamp(b.savedAt) - timestamp(a.savedAt) || a.key.localeCompare(b.key);
  });
  let previousDay: string | null = null;
  const rows: CollectionBrowserRow[] = visible.map(post => {
    const day = sort === "comments" ? null : collectionDay(timeOf(post), nowMs);
    const dayLabel = day && day.key !== previousDay ? day.label : null;
    previousDay = day?.key ?? null;
    return { post, dayLabel, postedRelative: collectionRelativeTime(post.postedAtMs, nowMs), comments: post.descriptor.engagement.comments };
  });
  return { rows, count: visible.length };
}

const WORKSPACE_PURPOSE: Record<SessionRecord["mode"], string> = {
  topic: "睇大家點講、有咩分歧", product: "收落嚟自己要用嘅做法",
  "pr-evidence": "核對活動帖子有冇照 brief 講", archive: "未分去工作區嘅收藏"
};

export function buildWorkspaceCards(sessions: SessionRecord[], nowMs: number) {
  return sessions.map(session => {
    const posts = buildCollectionPosts([session]);
    const saved = posts[0] ? Date.parse(posts[0].savedAt) : null;
    return { session, purpose: WORKSPACE_PURPOSE[session.mode], count: session.items.length,
      previews: posts.slice(0, 4), lastSavedRelative: collectionRelativeTime(saved, nowMs) };
  });
}


/** How long ago a reading finished, in the largest whole unit: 啱啱, N 分前, N 小時前, N 日前. */
export function readingAgo(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "啱啱";
  if (minutes < 60) return `${minutes} 分前`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} 小時前` : `${Math.floor(hours / 24)} 日前`;
}
interface CollectionFinished {post:CollectionPost;mode:"topic"|"product";itemId:string;at:string;summary:string;ago:string}
export function buildCollectionArrivalModel(posts: CollectionPost[], readings: Record<string, InlineReadingRecord>, opened: OpenedReadings, now: number, finishedOnly: boolean, product: CollectionProductInputs = {}) {
  const finished = posts.flatMap(post => post.memberships.flatMap<CollectionFinished>(m => {
    if (m.mode !== "topic" && m.mode !== "product") return [];
    const record = readings[m.itemId];
    const ai = record?.status === "complete" && record.reading.promptVersion !== INLINE_READING_PROMPT_VERSION ? null : record;
    const analysis=product.analyses?.[product.signals?.find(s=>s.itemId===m.itemId && s.sessionId===m.sessionId)?.id ?? ""];
    const at = m.mode === "product" ? productReadingFinishedAt(m.item, analysis, product.loaded === false || (!!product.hasContext && !!product.settings && !!providerKeyFromSettings(product.settings))) : inlineReadingFinishedAt(m.item, ai, now);
    if (!at || !Number.isFinite(Date.parse(at)) || Date.parse(at) > now) return [];
    if (m.mode === "product") return [{post,mode:m.mode,itemId:m.itemId,at,summary:`讀完${analysis?.status === "complete" ? ` · ${PRODUCT_VERDICT_LABELS[analysis.verdict]}` : ""}`,ago: readingAgo(now - Date.parse(at))}];
    const card = buildInlineCardViewModel(m.item, "topic", m.sessionName, { ai, now });
    const line = buildInlineSaveLine(card, now, null, null);
    return [{ post, mode: m.mode, itemId: m.itemId, at, summary: line.status.replace(/ · \d+ 則留言$/, ""),
      ago: readingAgo(now - Date.parse(at)) }];
  })).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.itemId.localeCompare(b.itemId));
  const unique = finished.filter((r, i) => finished.findIndex(other => other.post.key === r.post.key) === i);
  const states = Object.fromEntries(posts.map(post => {
    const live = post.memberships.some(m => m.status === "queued" || m.status === "running" || (m.status === "succeeded" && (m.mode === "topic" || m.mode === "product") && !finished.some(r=>r.itemId===m.itemId)));
    const unread = finished.some(r => r.post.key === post.key && (!opened[r.itemId] || Date.parse(opened[r.itemId]) < Date.parse(r.at)));
    return [post.key, live ? "arc" : unread ? "dot" : "none"] as const;
  }));
  return { recent: unique.filter(r => now - Date.parse(r.at) <= 86400000).slice(0, 3),
    posts: finishedOnly ? unique.map(r => r.post) : posts, states, finished };
}

export interface CollectionProductInputs {analyses?: Record<string,ProductSignalAnalysis>; signals?:Signal[]; settings?:ExtensionSettings; hasContext?:boolean; loaded?:boolean}
export type CollectionFilter='all'|'topic'|'product'|'archive'|'reading'|'finished';
export function buildCollectionFilters(posts: CollectionPost[], arrival: ReturnType<typeof buildCollectionArrivalModel>, selected: CollectionFilter, sessions: SessionRecord[] = []) {
  const matches = (post: CollectionPost, key: CollectionFilter) => {
    if (key === "all") return true;
    if (key === "topic" || key === "product" || key === "archive") return post.memberships.some(member => member.mode === key);
    return key === "reading" ? arrival.states[post.key] === "arc" : arrival.finished.some(row => row.post.key === post.key);
  };
  const options: Array<{ key: CollectionFilter; label: string }> = [{ key: "all", label: "全部" }, { key: "topic", label: "觀眾反應" }, { key: "product", label: "個人應用" }];
  if (sessions.some(session => session.mode === "archive")) options.push({ key: "archive", label: "收藏整理" });
  options.push({ key: "reading", label: "讀緊" }, { key: "finished", label: "讀完" });
  return { chips: options.map(chip => ({ ...chip, count: posts.filter(post => matches(post, chip.key)).length, selected: chip.key === selected })), posts: posts.filter(post => matches(post, selected)) };
}
export function buildCollectionInView(posts:CollectionPost[], inView:string|null, openKey:string|null) {
 if (!inView) return null;
 const post=posts.find(p=>p.memberships.some(m=>inlineCollectPostKey(m.item.descriptor)===inView));
 return post && post.key!==openKey ? {key:post.key,author:post.author,summary:post.body.replace(/\s+/g,' ').slice(0,60)} : null;
}
