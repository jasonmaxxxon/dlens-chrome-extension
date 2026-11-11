import type { AnalysisBlockEvidenceSnapshot, AnalysisBlockSnapshot } from "../contracts/ingest";
import type { SessionItem } from "../state/types";
import { readThreadsPostLocator } from "../compare/comment-eligibility";

/* blocks-v1 reader projection. The backend decides which blocks a post gets and their order;
 * this only detects them, keeps that order, drops unknown types and links every item back to its comment. */

export const BLOCK_TYPES = ["opinion_overview", "entity_list", "qa_pairs", "top_comments", "noise_summary"] as const;
export type BlockType = typeof BLOCK_TYPES[number];
export const POST_TYPES = ["discussion", "resource", "help", "news", "entertainment", "unknown"] as const;
export type PostTypeKey = typeof POST_TYPES[number];
export const QA_STATUSES = ["answered_by_op", "answered", "unanswered", "replies_not_captured", "unknown"] as const;
export type QaStatus = typeof QA_STATUSES[number];

/** `text` is the captured comment body, when this capture still holds it. */
export interface BlockEvidenceLink { commentId: string; author: string; likes: number | null; isOp: boolean; href: string | null; text: string | null }
/** A comment (or the post itself) quoted inside a qa pair. A post question has no comment id and links to the original post. */
export interface QaPerson { commentId: string | null; author: string; text: string; likes: number | null; isOp: boolean; isPost: boolean; href: string | null }
/** Crawler link on a top comment; `kind` is external|threads_post, not the entity kind. */
export interface CommentLink { url: string; href: string | null; kind: string }
export const NOISE_FLAGS = ["bookmark", "acknowledgment", "reaction", "tag_friend", "emoji_only", "very_short"] as const;
export interface EntityRow {
  key: string; name: string; url: string; href: string | null; domain: string; github: boolean;
  mentions: number; likes: number; recommenders: string[]; context: string; inPost: boolean; byOp: boolean; evidence: BlockEvidenceLink[];
}
interface BlockBase { id: string; titleKey: string; primary: boolean; shown: number; total: number; truncated: boolean }
export type AnalysisBlockView = BlockBase & (
  | { type: "opinion_overview"; items: { label: string; generic: boolean; count: number | null; pct: number | null; substantive: number | null; noise: number | null; noiseOnly: boolean; evidence: BlockEvidenceLink[] }[] }
  | { type: "entity_list"; items: EntityRow[] }
  | { type: "qa_pairs"; items: { status: QaStatus; question: QaPerson; answers: QaPerson[]; answerCount: number }[]; statusCounts: Record<QaStatus, number> | null }
  | { type: "top_comments"; items: { author: string; text: string | null; likes: number | null; replies: number | null; isOp: boolean; links: CommentLink[]; evidence: BlockEvidenceLink[] }[] }
  | { type: "noise_summary"; audience: number | null; noise: number | null; share: number | null; flags: { flag: string; count: number; share: number | null }[] });

export interface AnalysisBlocksModel {
  /** legacy: no usable `blocks` (old four-cell reading); blocks: render `blocks`; empty: `blocks` present but nothing to render. */
  mode: "legacy" | "blocks" | "empty";
  postType: PostTypeKey | null;
  error: boolean;
  blocks: AnalysisBlockView[];
  omitted: { type: string; reason: string }[];
  /** Unknown block types, skipped instead of rendered. */
  skipped: string[];
}

const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown): string => typeof v === "string" ? v.trim() : "";
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const handle = (v: unknown): string => str(v).replace(/^@/, "");
/** Threads post/reply shortcodes are 11 base64url characters; internal ids are not rebuilt into URLs. */
const SHORTCODE = /^[A-Za-z0-9_-]{11}$/;

/** Link order: own permalink → the captured comment's own Threads URL → @author/post/<shortcode> → none (plain id). */
export function blockEvidenceHref(evidence: AnalysisBlockEvidenceSnapshot, item: SessionItem | null): string | null {
  const own = readThreadsPostLocator(evidence.permalink);
  if (own) return own.permalink;
  const raw = (item?.latestCapture?.result?.comments ?? []).find(c => str(c.comment_id) === evidence.comment_id || str(c.source_comment_id) === evidence.comment_id);
  const captured = raw ? [raw.permalink, raw.url, raw.post_url, raw.source_locator].map(readThreadsPostLocator).find(Boolean) : null;
  if (captured) return captured.permalink;
  const author = handle(evidence.author);
  return author && SHORTCODE.test(evidence.comment_id) ? readThreadsPostLocator(`https://www.threads.com/@${author}/post/${evidence.comment_id}`)?.permalink ?? null : null;
}

function evidenceLinks(value: unknown, item: SessionItem | null): BlockEvidenceLink[] {
  return (Array.isArray(value) ? value : []).flatMap(raw => {
    const e = obj(raw), commentId = str(e.comment_id);
    if (!commentId) return [];
    const ev: AnalysisBlockEvidenceSnapshot = { comment_id: commentId, author: str(e.author), like_count: num(e.like_count) ?? undefined, permalink: str(e.permalink) || undefined };
    return [{ commentId, author: handle(e.author), likes: num(e.like_count), isOp: e.is_op === true, href: blockEvidenceHref(ev, item), text: capturedText(item, commentId) }];
  });
}

function capturedText(item: SessionItem | null, commentId: string): string | null {
  const raw = (item?.latestCapture?.result?.comments ?? []).find(c => str(c.comment_id) === commentId || str(c.source_comment_id) === commentId);
  return str(raw?.text) || null;
}

/** Only http(s) links become anchors; the full URL text is always kept. */
function safeHref(url: string): string | null {
  try { const u = new URL(url); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? url : null; } catch { return null; }
}

function qaPerson(raw: unknown, item: SessionItem | null): QaPerson | null {
  const q = obj(raw), text = str(q.text), isPost = q.is_post === true, commentId = str(q.comment_id) || null, permalink = str(q.permalink);
  if (!text || (!isPost && !commentId)) return null;
  // The post question links to the original post's own permalink (it may be threads.net); comments use the shared evidence fallback.
  const href = isPost ? (readThreadsPostLocator(permalink) ? permalink : readThreadsPostLocator(item?.descriptor?.post_url)?.permalink ?? null)
    : blockEvidenceHref({ comment_id: commentId!, author: str(q.author), permalink: permalink || undefined }, item);
  return { commentId, author: handle(q.author), text, likes: num(q.like_count), isOp: q.is_op === true, isPost, href };
}

function project(block: AnalysisBlockSnapshot, type: BlockType, item: SessionItem | null, aiNames: Record<string, string>, noise: Record<string, unknown>): AnalysisBlockView {
  const items = (Array.isArray(block.items) ? block.items : []).map(obj);
  const shown = num(block.item_count) ?? items.length, total = num(block.total_count) ?? shown;
  const base: BlockBase = { id: str(block.id) || type, titleKey: str(block.title_key) || `blocks.${type}.title`, primary: block.priority === "primary", shown, total, truncated: block.truncated === true && total > shown };
  if (type === "entity_list") return { ...base, type, items: items.flatMap(i => {
    const url = str(i.url);
    if (!url) return [];
    const domain = str(i.domain);
    return [{ key: str(i.key) || url, name: str(i.name) || domain || url, url, href: safeHref(url), domain, github: i.kind === "github_repo" || domain === "github.com",
      mentions: num(i.mention_count) ?? 0, likes: num(i.total_likes) ?? 0, recommenders: (Array.isArray(i.recommenders) ? i.recommenders : []).map(handle).filter(Boolean),
      context: str(i.context), inPost: i.in_post === true, byOp: i.mentioned_by_op === true, evidence: evidenceLinks(i.evidence, item) }];
  }) };
  if (type === "opinion_overview") return { ...base, type, items: items.map(i => {
    const key = num(i.cluster_key);
    const keywords = (Array.isArray(i.keywords) ? i.keywords : []).map(str).filter(Boolean);
    const share = num(i.size_share);
    // v1 labels are always null: the title comes from keywords, and ["general"] is a catch-all without topic words.
    const named = str(i.label) || (key !== null ? str(aiNames[String(key)]) : "");
    const generic = !named && keywords.length === 1 && keywords[0] === "general";
    return { label: named || (generic ? "" : keywords.join("、")), generic, count: num(i.comment_count), pct: share === null ? null : Math.round(share * 100), substantive: num(i.substantive_count), noise: num(i.noise_count), noiseOnly: i.noise_only === true, evidence: evidenceLinks(i.evidence, item) };
  }).filter(i => i.label || i.generic || i.evidence.length) };
  if (type === "qa_pairs") {
    const counts = obj(obj(block.meta).status_counts);
    const statusCounts = QA_STATUSES.every(k => num(counts[k]) !== null) ? Object.fromEntries(QA_STATUSES.map(k => [k, num(counts[k])])) as Record<QaStatus, number> : null;
    const pairs = items.flatMap(i => {
      const question = qaPerson(i.question, item);
      if (!question) return [];
      const status = (QA_STATUSES as readonly string[]).includes(str(i.status)) ? str(i.status) as QaStatus : "unknown";
      const answers = (Array.isArray(i.answers) ? i.answers : []).flatMap(a => qaPerson(a, item) ?? []);
      return [{ status, question, answers, answerCount: Math.max(num(i.answer_count) ?? 0, answers.length) }];
    });
    // The backend sorts a post-as-question first; keep that even if a payload does not.
    return { ...base, type, items: [...pairs.filter(x => x.question.isPost), ...pairs.filter(x => !x.question.isPost)], statusCounts };
  }
  if (type === "top_comments") return { ...base, type, items: items.map(i => {
    const evidence = evidenceLinks(i.evidence, item);
    const id = str(i.comment_id) || evidence[0]?.commentId || "";
    const links = (Array.isArray(i.links) ? i.links : []).flatMap(l => { const url = str(obj(l).url); return url ? [{ url, href: safeHref(url), kind: str(obj(l).kind) }] : []; });
    return { author: handle(i.author) || evidence[0]?.author || "", text: str(i.text) || (id ? capturedText(item, id) : null), likes: num(i.like_count) ?? evidence[0]?.likes ?? null, replies: num(i.reply_count), isOp: i.is_op === true || evidence.some(e => e.isOp), links, evidence };
  }) };
  // noise_summary: numbers only; items are {flag, count, comment_ids} and the noise comments never become body cards.
  const meta = obj(block.meta);
  const audience = num(noise.audience_count) ?? num(meta.audience_count);
  const fromItems = items.flatMap(i => { const count = num(i.count), flag = str(i.flag); return flag && count ? [[flag, count] as const] : []; });
  const byFlag = Object.keys(obj(noise.by_flag)).length ? obj(noise.by_flag) : obj(meta.by_flag);
  const entries = fromItems.length ? fromItems : Object.entries(byFlag).flatMap(([flag, value]) => { const count = num(value); return count ? [[flag, count] as const] : []; });
  const order = (flag: string) => { const at = (NOISE_FLAGS as readonly string[]).indexOf(flag); return at < 0 ? NOISE_FLAGS.length : at; };
  const flags = entries.map(([flag, count]) => ({ flag, count, share: audience ? count / audience : null })).sort((a, b) => order(a.flag) - order(b.flag));
  return { ...base, type: "noise_summary", audience, noise: num(noise.noise_count) ?? num(meta.noise_count), share: num(noise.noise_share) ?? num(meta.noise_share), flags };
}

/** Old analyses have no `blocks` key: they keep the four-cell reading. `aiNames` reuses the AI cluster renames by cluster key. */
export function buildAnalysisBlocks(item: SessionItem | null | undefined, aiNames: Record<string, string> = {}): AnalysisBlocksModel {
  const analysis = item?.latestCapture?.analysis;
  const rawType = str(obj(analysis?.post_type).type);
  const postType = analysis?.post_type ? ((POST_TYPES as readonly string[]).includes(rawType) ? rawType as PostTypeKey : "unknown") : null;
  const error = !!analysis?.blocks_error;
  const omitted = (Array.isArray(analysis?.blocks_omitted) ? analysis!.blocks_omitted : []).map(obj).map(o => ({ type: str(o.type), reason: str(o.reason) })).filter(o => (BLOCK_TYPES as readonly string[]).includes(o.type));
  const empty: AnalysisBlocksModel = { mode: "legacy", postType, error, blocks: [], omitted, skipped: [] };
  // `blocks_error` means the backend sent no blocks at all: a notice over the old four-cell reading.
  if (!analysis || error || !Array.isArray(analysis.blocks)) return empty;
  const skipped: string[] = [];
  const blocks = analysis.blocks.map((block, index) => ({ block: obj(block) as unknown as AnalysisBlockSnapshot, index }))
    .sort((a, b) => (num(a.block.order) ?? Infinity) - (num(b.block.order) ?? Infinity) || a.index - b.index)
    .flatMap(({ block }) => {
      const type = str(block.type);
      if (!(BLOCK_TYPES as readonly string[]).includes(type)) { skipped.push(type || "(none)"); return []; }
      return [project(block, type as BlockType, item ?? null, aiNames, obj(analysis.noise))];
    })
    .filter(b => b.type === "noise_summary" ? b.flags.length > 0 || !!b.noise : b.items.length > 0);
  if (blocks.length) return { ...empty, mode: "blocks", blocks, skipped };
  return { ...empty, mode: "empty", skipped };
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
