import type { AnalysisBlockEvidenceSnapshot, AnalysisBlockSnapshot } from "../contracts/ingest";
import type { SessionItem } from "../state/types";
import { readThreadsPostLocator } from "../compare/comment-eligibility";

/* blocks-v1 reader projection. The backend decides which blocks a post gets and their order;
 * this only detects them, keeps that order, drops unknown types and links every item back to its comment.
 * Revision 2 fields are all optional: revision 1 payloads project the same way, minus the extras. */

export const BLOCK_TYPES = ["opinion_overview", "entity_list", "qa_pairs", "top_comments", "noise_summary"] as const;
export type BlockType = typeof BLOCK_TYPES[number];
export const POST_TYPES = ["discussion", "resource", "help", "news", "entertainment", "unknown"] as const;
export type PostTypeKey = typeof POST_TYPES[number];
export const QA_STATUSES = ["answered_by_op", "answered", "unanswered", "replies_not_captured", "unknown"] as const;
export type QaStatus = typeof QA_STATUSES[number];
export const OMITTED_REASONS = ["empty", "all_duplicate", "noise_only"] as const;
export type OmittedReason = typeof OMITTED_REASONS[number];

/** `text` is the captured comment body, when this capture still holds it. */
export interface BlockEvidenceLink { commentId: string; author: string; likes: number | null; isOp: boolean; href: string | null; text: string | null }
/** A comment (or the post itself) quoted inside a qa pair. A post question has no comment id and links to the original post. */
export interface QaPerson { commentId: string | null; author: string; text: string; likes: number | null; isOp: boolean; isPost: boolean; href: string | null }
/** Crawler link on a top comment; `kind` is external|threads_post, not the entity kind. */
export interface CommentLink { url: string; href: string | null; kind: string }
export const NOISE_FLAGS = ["bookmark", "acknowledgment", "reaction", "tag_friend", "emoji_only", "very_short", "placeholder"] as const;
export interface EntityRow {
  key: string; name: string; url: string; href: string | null; domain: string; github: boolean;
  mentions: number; likes: number; recommenders: string[]; context: string; inPost: boolean; byOp: boolean; evidence: BlockEvidenceLink[];
  /** One-line summary: the tool's own description (revision 2), else the comment context. */
  summary: string;
  /** The context quote, kept apart only when `summary` is the tool's own description. */
  quote: string;
  /** The context comment (`context_comment_id`), inferred from the most-liked evidence in rev 1. */
  link: BlockEvidenceLink | null;
  /** Extra mentions whose quotes are not already shown in top comments or the lead. */
  extra: BlockEvidenceLink[];
  repo: { stars: string; language: string; archived: boolean; pushed: string } | null;
  site: string;
}
export interface OpinionRow {
  label: string; generic: boolean; keywords: string[]; count: number | null; pct: number | null; substantive: number | null; noise: number | null;
  lowSignal: boolean; evidence: BlockEvidenceLink[];
  /** The backend label is the opening words of one comment (`label_source: representative_comment`, text starts with the label)
   *  and `rep` is that same comment: the reader shows the comment once, as the quote, instead of a clipped title above its own text. */
  quoteLabel: boolean; labelId: string;
  /** Prefer an unquoted comment, but repeat a quote before falling back to a link-only row. */
  rep: BlockEvidenceLink | null; repText: string | null;
}
interface BlockBase { id: string; titleKey: string; primary: boolean; shown: number; total: number; truncated: boolean }
export type AnalysisBlockView = BlockBase & (
  | { type: "opinion_overview"; items: OpinionRow[]; noiseOnlyGroups: number }
  | { type: "entity_list"; items: EntityRow[] }
  | { type: "qa_pairs"; items: { status: QaStatus; question: QaPerson; answers: QaPerson[]; answerCount: number }[]; statusCounts: Record<QaStatus, number> | null; replyStructureKnown: boolean | null }
  | { type: "top_comments"; items: { id: string; author: string; text: string | null; likes: number | null; replies: number | null; isOp: boolean; links: CommentLink[]; evidence: BlockEvidenceLink[] }[] }
  | { type: "noise_summary"; audience: number | null; noise: number | null; share: number | null; flags: { flag: string; count: number; share: number | null }[] });

export interface AnalysisBlocksModel {
  /** legacy: no usable `blocks` (old four-cell reading); blocks: render `blocks`; empty: `blocks` present but nothing to render. */
  mode: "legacy" | "blocks" | "empty";
  postType: PostTypeKey | null;
  error: boolean;
  blocks: AnalysisBlockView[];
  omitted: { type: string; reason: OmittedReason }[];
  /** Unknown block types, skipped instead of rendered. */
  skipped: string[];
}

const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown): string => typeof v === "string" ? v.trim() : "";
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const handle = (v: unknown): string => str(v).replace(/^@/, "");
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
/** Threads post/reply shortcodes are 11 base64url characters; internal ids are not rebuilt into URLs. */
const SHORTCODE = /^[A-Za-z0-9_-]{11}$/;

function rawComment(item: SessionItem | null, commentId: string) {
  return (item?.latestCapture?.result?.comments ?? []).find(c => str(c.comment_id) === commentId || str(c.source_comment_id) === commentId);
}

/** A capture can use an internal id and a source id for the same comment. */
function includeCommentIds(ids: Set<string>, commentId: string, item: SessionItem | null) {
  if (!commentId) return;
  ids.add(commentId);
  const raw = rawComment(item, commentId);
  for (const id of [raw?.comment_id, raw?.source_comment_id]) if (str(id)) ids.add(str(id));
}

/** Link order: own permalink → the captured comment's own Threads URL → @author/post/<shortcode> → none (plain id). */
export function blockEvidenceHref(evidence: AnalysisBlockEvidenceSnapshot, item: SessionItem | null): string | null {
  const own = readThreadsPostLocator(evidence.permalink);
  if (own) return own.permalink;
  const raw = rawComment(item, evidence.comment_id);
  const captured = raw ? [raw.permalink, raw.url, raw.post_url, raw.source_locator].map(readThreadsPostLocator).find(Boolean) : null;
  if (captured) return captured.permalink;
  const author = handle(evidence.author);
  return author && SHORTCODE.test(evidence.comment_id) ? readThreadsPostLocator(`https://www.threads.com/@${author}/post/${evidence.comment_id}`)?.permalink ?? null : null;
}

function capturedText(item: SessionItem | null, commentId: string): string | null {
  return str(rawComment(item, commentId)?.text) || null;
}

function evidenceLinks(value: unknown, item: SessionItem | null): BlockEvidenceLink[] {
  return list(value).flatMap(raw => {
    const e = obj(raw), commentId = str(e.comment_id);
    if (!commentId) return [];
    const ev: AnalysisBlockEvidenceSnapshot = { comment_id: commentId, author: str(e.author), like_count: num(e.like_count) ?? undefined, permalink: str(e.permalink) || undefined };
    return [{ commentId, author: handle(e.author), likes: num(e.like_count), isOp: e.is_op === true, href: blockEvidenceHref(ev, item), text: str(e.text) || capturedText(item, commentId) }];
  });
}

/** Only http(s) links become anchors; the full URL text is always kept. */
function safeHref(url: string): string | null {
  try { const u = new URL(url); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? url : null; } catch { return null; }
}

function qaPerson(raw: unknown, item: SessionItem | null): QaPerson | null {
  const q = obj(raw), text = str(q.text), isPost = q.is_post === true, commentId = str(q.comment_id) || null, permalink = str(q.permalink);
  if (!text || (!isPost && !commentId)) return null;
  // The post question links to the original post's own permalink as the backend sent it (threads.net stays); only when that is
  // missing or invalid does it fall back to the saved descriptor's post URL, again used as-is once validated.
  const postUrl = str(item?.descriptor?.post_url);
  const href = isPost ? (readThreadsPostLocator(permalink) ? permalink : readThreadsPostLocator(postUrl) ? postUrl : null)
    : blockEvidenceHref({ comment_id: commentId!, author: str(q.author), permalink: permalink || undefined }, item);
  return { commentId, author: handle(q.author), text, likes: num(q.like_count), isOp: q.is_op === true, isPost, href };
}

/** 12400 → 12.4k; keeps the reader from counting digits. */
function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10;
  return k >= 1000 ? `${Math.round(k / 100) / 10}M` : `${k}k`;
}

function entityRow(i: Record<string, unknown>, item: SessionItem | null, shown: ReadonlySet<string>, quoted: Set<string>): EntityRow | null {
  const url = str(i.url);
  if (!url) return null;
  const domain = str(i.domain);
  const enr = obj(i.enrichment);
  // Only a successful enrichment is used; any other status (not_found, rate_limited…) contributes nothing, and is never shown.
  const ok = str(enr.status) === "ok";
  const dropped = str(enr.description_dropped) || str(i.description_dropped);
  const description = ok && !dropped ? str(enr.description) : "";
  const evidence = evidenceLinks(i.evidence, item);
  const context = str(i.context);
  const contextId = str(i.context_comment_id);
  const contextLink = contextId ? evidence.find(e => e.commentId === contextId) ?? evidenceLinks([{ comment_id: contextId, author: rawComment(item, contextId)?.author }], item)[0] ?? null
    : evidence.reduce<BlockEvidenceLink | null>((best, e) => !best || (e.likes ?? 0) > (best.likes ?? 0) ? e : best, null);
  let summary = description || context, quote = description && description !== context ? context : "";
  let summaryLink = contextLink;
  if (contextLink && shown.has(contextLink.commentId)) {
    quote = "";
    if (!description) {
      summaryLink = evidence.find(e => e.text && !shown.has(e.commentId)) ?? null;
      summary = summaryLink?.text ?? "";
    }
  }
  const extra = evidence.filter(e => e.commentId !== contextLink?.commentId && e.commentId !== summaryLink?.commentId
    && !shown.has(e.commentId) && e.text?.trim() !== summary.trim() && e.text?.trim() !== quote.trim());
  if (!description && summary && summaryLink) includeCommentIds(quoted, summaryLink.commentId, item);
  if (quote && contextLink) includeCommentIds(quoted, contextLink.commentId, item);
  for (const e of extra) if (e.text) includeCommentIds(quoted, e.commentId, item);
  const github = i.kind === "github_repo" || domain === "github.com";
  const stars = num(enr.stars), language = str(enr.language), pushed = str(enr.pushed_at).slice(0, 10);
  const repo = ok && str(enr.source) === "github_api" && (stars !== null || language || enr.archived === true || pushed)
    ? { stars: stars !== null ? compactCount(stars) : "", language, archived: enr.archived === true, pushed } : null;
  const title = ok ? str(enr.title) : "";
  const name = str(i.name);
  return { key: str(i.key) || url, name: !name || name === domain ? title || domain || url : name, url, href: safeHref(url), domain, github,
    mentions: num(i.mention_count) ?? 0, likes: num(i.total_likes) ?? 0, recommenders: list(i.recommenders).map(handle).filter(Boolean),
    context, inPost: i.in_post === true, byOp: i.mentioned_by_op === true, evidence,
    summary, quote, link: contextLink, extra, repo,
    site: ok && str(enr.source) === "og_meta" ? str(enr.site_name) : "" };
}

const GENERIC = (keywords: string[]) => keywords.length === 1 && keywords[0] === "general";

function opinionRows(items: Record<string, unknown>[], item: SessionItem | null, aiNames: Record<string, string>): { rows: OpinionRow[]; noiseOnly: number } {
  let noiseOnly = 0;
  const rows: OpinionRow[] = [];
  for (const i of items) {
    if (i.noise_only === true) { noiseOnly++; continue; }
    const key = num(i.cluster_key);
    const keywords = list(i.keywords).map(str).filter(Boolean);
    const quant = list(i.quant_keywords).map(str).filter(Boolean);
    const share = num(i.size_share);
    // The AI name wins when it matches this cluster's own key (never by position: backend order is by substantive count); then the backend label.
    const ai = key !== null ? str(aiNames[String(key)]) : "";
    const named = ai || str(i.label);
    const generic = !named && GENERIC(keywords);
    const topical = [...new Set([...keywords, ...quant])].filter(k => k !== "general");
    const evidence = evidenceLinks(i.evidence, item);
    const label = named || (generic ? "" : keywords.join("、"));
    if (!label && !generic && !evidence.length) continue;
    rows.push({ label, generic, keywords: named ? topical.slice(0, 6) : quant.filter(k => k !== "general" && !keywords.includes(k)).slice(0, 6), count: num(i.comment_count), pct: share === null ? null : Math.round(share * 100),
      substantive: num(i.substantive_count), noise: num(i.noise_count), lowSignal: i.low_signal === true, evidence, rep: null, repText: null,
      quoteLabel: !ai && !!str(i.label) && str(i.label_source) === "representative_comment", labelId: str(i.label_comment_id) });
  }
  // Several catch-all groups read as one 「其他留言」.
  const generics = rows.filter(r => r.generic);
  if (generics.length < 2) return { rows, noiseOnly };
  const sum = (pick: (r: OpinionRow) => number | null) => generics.some(r => pick(r) !== null) ? generics.reduce((n, r) => n + (pick(r) ?? 0), 0) : null;
  const seen = new Set<string>();
  const merged: OpinionRow = { ...generics[0], quoteLabel: false, labelId: "", count: sum(r => r.count), pct: sum(r => r.pct), substantive: sum(r => r.substantive), noise: sum(r => r.noise), lowSignal: generics.every(r => r.lowSignal),
    evidence: generics.flatMap(r => r.evidence).filter(e => !seen.has(e.commentId) && !!seen.add(e.commentId)) };
  return { rows: rows.flatMap((r, at) => !r.generic ? [r] : at === rows.indexOf(generics[0]) ? [merged] : []), noiseOnly };
}

function project(block: AnalysisBlockSnapshot, type: BlockType, item: SessionItem | null, aiNames: Record<string, string>, noise: Record<string, unknown>, shownCommentIds: ReadonlySet<string> = new Set(), quoted: Set<string> = new Set()): AnalysisBlockView {
  const items = list(block.items).map(obj);
  const shown = num(block.item_count) ?? items.length, total = num(block.total_count) ?? shown;
  const base: BlockBase = { id: str(block.id) || type, titleKey: str(block.title_key) || `blocks.${type}.title`, primary: block.priority === "primary", shown, total, truncated: block.truncated === true && total > shown };
  if (type === "entity_list") return { ...base, type, items: items.flatMap(i => entityRow(i, item, shownCommentIds, quoted) ?? []) };
  if (type === "opinion_overview") {
    const { rows, noiseOnly } = opinionRows(items, item, aiNames);
    // Rev 2 drops noise-only clusters itself and lists their keys; rev 1 sends them flagged. Either way no empty group is drawn.
    const dropped = list(obj(block.meta).noise_only_cluster_keys).length;
    return { ...base, type, items: rows, noiseOnlyGroups: noiseOnly || dropped };
  }
  if (type === "qa_pairs") {
    const meta = obj(block.meta), counts = obj(meta.status_counts);
    const statusCounts = QA_STATUSES.every(k => num(counts[k]) !== null) ? Object.fromEntries(QA_STATUSES.map(k => [k, num(counts[k])])) as Record<QaStatus, number> : null;
    const pairs = items.flatMap(i => {
      const question = qaPerson(i.question, item);
      if (!question) return [];
      const status = (QA_STATUSES as readonly string[]).includes(str(i.status)) ? str(i.status) as QaStatus : "unknown";
      const answers = list(i.answers).flatMap(a => qaPerson(a, item) ?? []);
      return [{ status, question, answers, answerCount: Math.max(num(i.answer_count) ?? 0, answers.length) }];
    });
    // The backend sorts a post-as-question first; keep that even if a payload does not.
    return { ...base, type, items: [...pairs.filter(x => x.question.isPost), ...pairs.filter(x => !x.question.isPost)], statusCounts, replyStructureKnown: typeof meta.reply_structure_known === "boolean" ? meta.reply_structure_known : null };
  }
  if (type === "top_comments") {
    const seen = new Set<string>();
    for (const i of items) includeCommentIds(seen, str(i.comment_id) || str(obj(list(i.evidence)[0]).comment_id), item);
    const restored = list(obj(block.meta).excluded_as_duplicate).flatMap<Record<string, unknown>>(value => {
      const id = str(obj(value).comment_id);
      if (!id || seen.has(id)) return [];
      const captured = rawComment(item, id);
      if (!captured) return [];
      includeCommentIds(seen, id, item);
      return [{ ...captured, comment_id: id, links: [], evidence: [{ ...captured, comment_id: id }] }];
    });
    const rows = [...items, ...restored].map(i => {
      const evidence = evidenceLinks(i.evidence, item);
      const id = str(i.comment_id) || evidence[0]?.commentId || "";
      const links = list(i.links).flatMap(l => { const url = str(obj(l).url); return url ? [{ url, href: safeHref(url), kind: str(obj(l).kind) }] : []; });
      return { id, author: handle(i.author) || evidence[0]?.author || "", text: str(i.text) || (id ? capturedText(item, id) : null), likes: num(i.like_count) ?? evidence[0]?.likes ?? null, replies: num(i.reply_count), isOp: i.is_op === true || evidence.some(e => e.isOp), links, evidence };
    }).sort((a, b) => a.likes === null ? (b.likes === null ? 0 : 1) : b.likes === null ? -1 : b.likes - a.likes);
    const mergedTotal = Math.max(rows.length, total + restored.length);
    return { ...base, type, items: rows, shown: rows.length, total: mergedTotal, truncated: block.truncated === true && mergedTotal > rows.length };
  }
  // noise_summary: numbers only; items are {flag, count, comment_ids} and the noise comments never become body rows.
  const meta = obj(block.meta);
  const audience = num(noise.audience_count) ?? num(meta.audience_count);
  const fromItems = items.flatMap(i => { const count = num(i.count), flag = str(i.flag); return flag && count ? [[flag, count] as const] : []; });
  const byFlag = Object.keys(obj(noise.by_flag)).length ? obj(noise.by_flag) : obj(meta.by_flag);
  const entries = fromItems.length ? fromItems : Object.entries(byFlag).flatMap(([flag, value]) => { const count = num(value); return count ? [[flag, count] as const] : []; });
  const order = (flag: string) => { const at = (NOISE_FLAGS as readonly string[]).indexOf(flag); return at < 0 ? NOISE_FLAGS.length : at; };
  const flags = entries.map(([flag, count]) => ({ flag, count, share: audience ? count / audience : null })).sort((a, b) => order(a.flag) - order(b.flag));
  return { ...base, type: "noise_summary", audience, noise: num(noise.noise_count) ?? num(meta.noise_count), share: num(noise.noise_share) ?? num(meta.noise_share), flags };
}

/** Old analyses have no `blocks` key: they keep the four-cell reading. `aiNames` reuses the AI cluster renames by cluster key; `aiGist` is the stored AI one-liner, if any. */
export function buildAnalysisBlocks(item: SessionItem | null | undefined, aiNames: Record<string, string> = {}): AnalysisBlocksModel {
  const analysis = item?.latestCapture?.analysis;
  const rawType = str(obj(analysis?.post_type).type);
  const postType = analysis?.post_type ? ((POST_TYPES as readonly string[]).includes(rawType) ? rawType as PostTypeKey : "unknown") : null;
  const error = !!analysis?.blocks_error;
  const reason = (value: unknown): OmittedReason => (OMITTED_REASONS as readonly string[]).includes(str(value)) ? str(value) as OmittedReason : "empty";
  const omitted = list(analysis?.blocks_omitted).map(obj).map(o => ({ type: str(o.type), reason: reason(o.reason) })).filter(o => (BLOCK_TYPES as readonly string[]).includes(o.type));
  const empty: AnalysisBlocksModel = { mode: "legacy", postType, error, blocks: [], omitted, skipped: [] };
  // `blocks_error` means the backend sent no blocks at all: a notice over the old four-cell reading.
  if (!analysis || error || !Array.isArray(analysis.blocks)) return empty;
  const skipped: string[] = [];
  const raw = analysis.blocks.map((block, index) => ({ block: obj(block) as unknown as AnalysisBlockSnapshot, index }))
    .sort((a, b) => (num(a.block.order) ?? Infinity) - (num(b.block.order) ?? Infinity) || a.index - b.index)
    .flatMap(({ block }) => {
      const type = str(block.type);
      if (!(BLOCK_TYPES as readonly string[]).includes(type)) { skipped.push(type || "(none)"); return []; }
      return [{ type: type as BlockType, block, view: type === "top_comments" ? project(block, "top_comments", item ?? null, aiNames, obj(analysis.noise)) : null }];
    });

  // Top comments reserve their quotes regardless of block order;
  // folded rows still reserve their quotes so opening a tool never repeats them.
  const shown = new Set<string>();
  for (const { view } of raw) if (view?.type === "top_comments") for (const row of view.items) includeCommentIds(shown, row.id, item ?? null);
  const quoted = new Set(shown);
  const blocks = raw.map(({ type, block, view }) => view ?? project(block, type, item ?? null, aiNames, obj(analysis.noise), shown, quoted));
  const dedupOmitted: { type: string; reason: OmittedReason }[] = [];
  // Opinion groups always keep a quote when evidence has text, even when every candidate repeats.
  for (const block of blocks) if (block.type === "opinion_overview") for (const row of block.items) {
    // A label cut from a comment is shown as that comment itself, whether or not it is also a top comment.
    const own = row.quoteLabel && row.labelId ? row.evidence.find(e => e.commentId === row.labelId && e.text)
      ?? evidenceLinks([{ comment_id: row.labelId, author: rawComment(item ?? null, row.labelId)?.author, like_count: rawComment(item ?? null, row.labelId)?.like_count }], item ?? null).find(e => e.text) ?? null : null;
    // Only a label that really is the comment's opening counts; a condensed name stays a name over its quote.
    const flat = (text: string) => text.replace(/\s+/g, "").replace(/(\.{3}|…)+$/, "");
    const cut = !!own?.text && flat(own.text).startsWith(flat(row.label));
    row.quoteLabel = cut;
    row.rep = (cut ? own : null) ?? row.evidence.find(e => e.text && !quoted.has(e.commentId)) ?? row.evidence.find(e => e.text) ?? row.evidence[0] ?? null;
    row.repText = row.rep?.text ?? null;
  }
  const visible = blocks.filter(b => b.type === "noise_summary" ? b.flags.length > 0 || !!b.noise : b.items.length > 0);
  for (const b of blocks) if (b.type === "opinion_overview" && !b.items.length && b.noiseOnlyGroups) dedupOmitted.push({ type: b.type, reason: "noise_only" });

  // Without any priority flag, the first two non-noise blocks lead (the backend's own rule).
  const primary = visible.some(b => b.primary) ? visible : visible.map(b => ({ ...b }));
  if (!visible.some(b => b.primary)) primary.filter(b => b.type !== "noise_summary").slice(0, 2).forEach(b => { b.primary = true; });
  const hasTopComments = visible.some(b => b.type === "top_comments");
  const allOmitted = [...omitted.filter(o => !(hasTopComments && o.type === "top_comments" && o.reason === "all_duplicate") && !dedupOmitted.some(d => d.type === o.type)), ...dedupOmitted];
  if (!visible.length) return { ...empty, mode: "empty", omitted: allOmitted, skipped };
  return { ...empty, mode: "blocks", blocks: primary, omitted: allOmitted, skipped };
}

export type EntitySort = "mentions" | "likes" | "github";
export const ENTITY_SORTS: EntitySort[] = ["mentions", "likes", "github"];
/** Local reordering of backend items only. */
export function sortEntityRows(rows: EntityRow[], sort: EntitySort): EntityRow[] {
  if (sort === "github") return rows.filter(r => r.github);
  const key = sort === "likes" ? (r: EntityRow) => r.likes : (r: EntityRow) => r.mentions;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => key(b.row) - key(a.row) || a.index - b.index).map(x => x.row);
}

export interface EntityExportLabels { mentions: string; likes: string; by: string; columns: [string, string, string, string, string, string, string] }
export function entityMarkdown(rows: EntityRow[], title: string, labels: EntityExportLabels): string {
  const esc = (s: string) => s.replace(/([\\[\]])/g, "\\$1");
  return [`# ${title}`, "", ...rows.map(r => `- [${esc(r.name)}](${r.url.replace(/[()\s]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))})${r.context ? ` — ${r.context}` : ""} · ${r.mentions} ${labels.mentions} · ${r.likes} ${labels.likes}${r.recommenders.length ? ` · ${labels.by} ${r.recommenders.map(h => "@" + h).join("、")}` : ""}`)].join("\n");
}
export function entityCsv(rows: EntityRow[], labels: EntityExportLabels): string {
  // Quote every cell; a leading formula character is neutralised for spreadsheet apps.
  const cell = (v: string | number) => { const s = String(v); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`; };
  return [labels.columns.map(cell).join(","), ...rows.map(r => [r.name, r.url, r.domain, r.mentions, r.likes, r.recommenders.join("; "), r.context].map(cell).join(","))].join("\n");
}
