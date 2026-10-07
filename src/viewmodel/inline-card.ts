import type { FolderMode, SessionItem } from "../state/types";

/** One card under a saved post. Built only from data the crawl and quant analysis already store; no AI. */
export type InlineCardPhase = "saved" | "queued" | "running" | "failed" | "done";
export type InlineCardEntryKey = "stance" | "top" | "op" | "ask";
export interface InlineCardQuote { text: string; author: string; likes: number | null }
export interface InlineCardEntry { key: InlineCardEntryKey; label: string; mark: string; finding: string }
export type InlineCardAnswer =
  | { kind: "clusters"; headline: string; segments: { label: string; pct: number }[]; quote: InlineCardQuote | null }
  | { kind: "quotes"; rows: InlineCardQuote[] }
  | { kind: "op"; rows: { text: string; inReplyTo: string }[] }
  | { kind: "ask"; headline: string; rows: { text: string; status: "author" | "other" | "none" }[] }
  | { kind: "empty"; text: string };
export interface InlineCardViewModel {
  mode: FolderMode;
  sessionName: string;
  phase: InlineCardPhase;
  /** ISO time the current wait started; the view turns it into 「已等 m:ss」. */
  waitingSince: string | null;
  error: string | null;
  countLabel: string | null;
  /** Fewer than MIN_COMMENTS read: list them instead of grouping. */
  few: InlineCardQuote[] | null;
  entries: InlineCardEntry[];
  answers: Partial<Record<InlineCardEntryKey, InlineCardAnswer>>;
}

export const INLINE_CARD_MIN_COMMENTS = 10;
const QUESTION = /[？?]|點解|點樣|點算|有冇|係咪|會唔會|可唔可以|幾時|邊度|邊個|幾多|\b(what|why|how|when|where|who)\b/i;

interface Comment { id: string; parent: string | null; author: string; text: string; likes: number | null }
const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const handle = (value: unknown) => str(value).replace(/^@/, "").trim().toLowerCase();

function readComments(item: SessionItem): Comment[] {
  const raw = item.latestCapture?.result?.comments ?? [];
  return raw.map((c) => ({
    id: str(c.comment_id) || str(c.source_comment_id),
    parent: str(c.parent_comment_id) || null,
    author: str(c.author),
    text: str(c.text).trim(),
    likes: num(c.like_count)
  })).filter((c) => c.text.length > 0);
}
const quote = (c: Comment): InlineCardQuote => ({ text: c.text, author: c.author, likes: c.likes });
const short = (text: string, max = 24) => (text.length > max ? `${text.slice(0, max)}…` : text);

function phaseOf(item: SessionItem): InlineCardPhase {
  if (item.status === "succeeded") return "done";
  if (item.status === "failed") return "failed";
  if (item.status === "running") return "running";
  if (item.status === "queued") return "queued";
  return "saved";
}

export function buildInlineCardViewModel(item: SessionItem, mode: FolderMode, sessionName: string): InlineCardViewModel {
  const phase = phaseOf(item);
  const base: InlineCardViewModel = {
    mode, sessionName, phase,
    waitingSince: phase === "running" ? item.lastStatusAt ?? item.queuedAt : phase === "queued" ? item.queuedAt : null,
    error: phase === "failed" ? item.lastError || item.lastErrorKind || "原因不明" : null,
    countLabel: null, few: null, entries: [], answers: {}
  };
  if (phase !== "done" || mode !== "topic") return base;

  const comments = readComments(item);
  const total = num(item.descriptor.engagement?.comments);
  base.countLabel = `${comments.length} / ${total ?? "?"} 則`;
  if (comments.length < INLINE_CARD_MIN_COMMENTS) {
    base.few = comments.slice(0, 9).map(quote);
    return base;
  }

  const op = handle(item.latestCapture?.result?.canonical_post?.author ?? item.descriptor.author_hint);
  const byId = new Map(comments.map((c) => [c.id, c]));
  const children = new Map<string, Comment[]>();
  for (const c of comments) if (c.parent) children.set(c.parent, [...(children.get(c.parent) ?? []), c]);

  // 大家點睇: quant clusters, shares as percentages only.
  const clusters = [...(item.latestCapture?.analysis?.clusters ?? [])].sort((a, b) => b.size_share - a.size_share);
  const label = (keywords: string[]) => keywords.map((k) => k.trim()).filter(Boolean).slice(0, 3).join(" / ") || "未有關鍵詞";
  if (clusters.length) {
    const top = clusters[0];
    const evidence = item.latestCapture?.analysis?.evidence?.find((e) => e.cluster_key === top.cluster_key)?.comments?.[0];
    const pct = (share: number) => Math.round(share * 100);
    base.entries.push({ key: "stance", label: "大家點睇", mark: `${pct(top.size_share)}%`, finding: label(top.keywords) });
    base.answers.stance = {
      kind: "clusters",
      headline: `最大一群講「${label(top.keywords)}」，佔已讀留言 ${pct(top.size_share)}%。`,
      segments: clusters.slice(0, 4).map((c) => ({ label: label(c.keywords), pct: pct(c.size_share) })),
      quote: evidence ? { text: evidence.text, author: evidence.author ?? "", likes: evidence.like_count ?? null } : null
    };
  }

  // 樣本內最高讚
  const ranked = comments.filter((c) => c.likes !== null).sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  if (ranked.length) {
    base.entries.push({ key: "top", label: "樣本內最高讚", mark: `${ranked[0].likes} 讚`, finding: ranked[0].text });
    base.answers.top = { kind: "quotes", rows: ranked.slice(0, 3).map(quote) };
  }

  // 作者回應: the author's replies under someone else's comment.
  const opReplies = comments.filter((c) => op && handle(c.author) === op && c.parent && byId.has(c.parent) && handle(byId.get(c.parent)!.author) !== op);
  base.entries.push({ key: "op", label: "作者回應", mark: opReplies.length ? `${opReplies.length} 則` : "", finding: opReplies[0]?.text ?? "未有回覆留言" });
  base.answers.op = opReplies.length
    ? { kind: "op", rows: opReplies.slice(0, 4).map((c) => ({ text: c.text, inReplyTo: short(byId.get(c.parent!)!.text) })) }
    : { kind: "empty", text: "作者未有回覆任何留言。" };

  // 大家問咩: a question rule plus the reply chain. A reply is not proof of an answer.
  const asks = comments.filter((c) => handle(c.author) !== op && QUESTION.test(c.text)).map((c) => {
    const kids = children.get(c.id) ?? [];
    const status: "author" | "other" | "none" = kids.some((k) => handle(k.author) === op) ? "author" : kids.length ? "other" : "none";
    return { c, status };
  }).sort((a, b) => (a.status === "none" ? 0 : 1) - (b.status === "none" ? 0 : 1) || (b.c.likes ?? 0) - (a.c.likes ?? 0));
  const open = asks.filter((a) => a.status === "none").length;
  base.entries.push({ key: "ask", label: "大家問咩", mark: asks.length ? (open ? `${open} 未回` : "都有回覆") : "", finding: asks[0]?.c.text ?? "未見提問" });
  base.answers.ask = asks.length
    ? { kind: "ask", headline: open ? `${open} 條問題樣本內未見回覆` : "問題都有人回覆", rows: asks.slice(0, 5).map((a) => ({ text: a.c.text, status: a.status })) }
    : { kind: "empty", text: "已讀留言裡未見提問。" };
  return base;
}
