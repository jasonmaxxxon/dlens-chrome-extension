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
export interface EntityRow {
  key: string; name: string; url: string; href: string | null; domain: string; github: boolean;
  mentions: number; likes: number; recommenders: string[]; context: string; inPost: boolean; byOp: boolean; evidence: BlockEvidenceLink[];
}
interface BlockBase { id: string; titleKey: string; primary: boolean; shown: number; total: number; truncated: boolean }
export type AnalysisBlockView = BlockBase & (
  | { type: "opinion_overview"; items: { label: string; count: number | null; pct: number | null; evidence: BlockEvidenceLink[] }[] }
  | { type: "entity_list"; items: EntityRow[] }
  | { type: "qa_pairs"; items: { status: QaStatus; question: string; answer: string | null; evidence: BlockEvidenceLink[] }[] }
  | { type: "top_comments"; items: { author: string; text: string | null; likes: number | null; evidence: BlockEvidenceLink[] }[] }
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
    return { label: str(i.label) || (key !== null ? str(aiNames[String(key)]) : "") || keywords.join("、"), count: num(i.comment_count), pct: share === null ? null : Math.round(share * 100), evidence: evidenceLinks(i.evidence, item) };
  }).filter(i => i.label || i.evidence.length) };
  if (type === "qa_pairs") return { ...base, type, items: items.flatMap(i => {
    const evidence = evidenceLinks(i.evidence, item);
    const question = str(i.question) || str(i.text) || (evidence[0] ? capturedText(item, evidence[0].commentId) ?? "" : "");
    if (!question) return [];
    const status = (QA_STATUSES as readonly string[]).includes(str(i.status)) ? str(i.status) as QaStatus : "unknown";
    return [{ status, question, answer: str(i.answer) || str(obj(i.answer).text) || null, evidence }];
  }) };
  if (type === "top_comments") return { ...base, type, items: items.map(i => {
    const evidence = evidenceLinks(i.evidence, item);
    const id = str(i.comment_id) || evidence[0]?.commentId || "";
    return { author: handle(i.author) || evidence[0]?.author || "", text: str(i.text) || (id ? capturedText(item, id) : null), likes: num(i.like_count) ?? evidence[0]?.likes ?? null, evidence };
  }) };
  // noise_summary: numbers only; the noise comments themselves never become body cards.
  const meta = obj(block.meta);
  const audience = num(noise.audience_count) ?? num(meta.audience_count);
  const byFlag = Object.keys(obj(noise.by_flag)).length ? obj(noise.by_flag) : obj(meta.by_flag);
  const flags = Object.entries(byFlag).flatMap(([flag, value]) => { const count = num(value); return count ? [{ flag, count, share: audience ? count / audience : null }] : []; }).sort((a, b) => b.count - a.count);
  return { ...base, type: "noise_summary", audience, noise: num(noise.noise_count) ?? num(meta.noise_count), share: num(noise.noise_share) ?? num(meta.noise_share), flags };
}

/** Old analyses have no `blocks` key: they keep the four-cell reading. `aiNames` reuses the AI cluster renames by cluster key. */
export function buildAnalysisBlocks(item: SessionItem | null | undefined, aiNames: Record<string, string> = {}): AnalysisBlocksModel {
  const analysis = item?.latestCapture?.analysis;
  const rawType = str(obj(analysis?.post_type).type);
  const postType = analysis?.post_type ? ((POST_TYPES as readonly string[]).includes(rawType) ? rawType as PostTypeKey : "unknown") : null;
  const error = !!analysis?.blocks_error;
  const omitted = (Array.isArray(analysis?.blocks_omitted) ? analysis!.blocks_omitted : []).map(obj).map(o => ({ type: str(o.type), reason: str(o.reason) })).filter(o => o.type);
  const empty: AnalysisBlocksModel = { mode: "legacy", postType, error, blocks: [], omitted, skipped: [] };
  if (!analysis || !Array.isArray(analysis.blocks)) return empty;
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
  // A failed block build keeps the old reading underneath its notice.
  return { ...empty, mode: error ? "legacy" : "empty", skipped };
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
