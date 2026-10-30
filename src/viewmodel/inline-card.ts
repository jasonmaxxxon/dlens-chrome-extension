import { describeProcessingError, getProcessingFailureUiMessage } from "../state/processing-errors";
import { clipReadingCopy, cleanReadingCopy } from "../compare/reading-copy";
import { buildReplyThreads, isReplyQuestion } from "../compare/reply-thread";
import type { FolderMode, SessionItem } from "../state/types";
import { guardInlineAudienceReading, readCrawlComments, readOpHandle, normalizeHandle as handle, type CrawlComment } from "../compare/inline-reading";
import type { InlineReadingRecord } from "../compare/inline-reading-storage";
import type { InlineReading } from "../compare/inline-reading";

/**
 * One card under a saved post. Without AI it shows only what the crawl and quant analysis store
 * (大家點睇 / 樣本內最高讚 / 作者回應 / 大家問咩); with a finished AI reading 有咩做法 / 有咩分歧 replace
 * the middle two. Shares are always the backend's percentages.
 */
export type InlineCardPhase = "saved" | "queued" | "running" | "failed" | "done";
export type InlineCardEntryKey = "stance" | "method" | "split" | "top" | "op" | "ask";
export interface InlineCardQuote { text: string; author: string; likes: number | null; isAuthor?: boolean }
export interface InlineCardEntry { key: InlineCardEntryKey; label: string; mark: string; finding: string }
export type InlineCardAnswer =
  | { kind: "clusters"; headline: string; segments: { label: string; pct: number; noise: boolean }[]; quote: InlineCardQuote | null }
  | { kind: "quotes"; rows: InlineCardQuote[] }
  | { kind: "op"; rows: { text: string; inReplyTo: string; author?: string; likes?: number | null }[] }
  | { kind: "ask"; headline: string; rows: { text: string; status: "author" | "other" | "none" }[] }
  | { kind: "methods"; rows: { name: string; fit: string }[]; quote: InlineCardQuote }
  | { kind: "split"; agree: string; sides: { claim: string; why: string; quote: InlineCardQuote }[]; note: string | null }
  | { kind: "empty"; text: string };
/** The AI pass for this item, or the reason there is none. */
export type InlineCardAiInput = { status: "no-key"; reason?: string } | InlineReadingRecord;
/** Replies the post page ships in its own HTML, read on save; the crawl replaces them. */
export type InlineCardPeekInput = { state: "loading" } | { state: "ready"; replies: InlineCardQuote[] } | { state: "unavailable" };
export type InlineCardPeek = { state: "loading" } | { state: "ready"; total: number; top: InlineCardQuote | null };
export interface InlineCardContext {
  /** Every saved item, to count crawls ahead of this one on the single backend worker. */
  queue?: SessionItem[];
  submitting?: boolean;
  cancelSupported?: boolean;
  /** The side panel keeps its lens bar available for small / pending captures. */
  forReader?: boolean;
  peek?: InlineCardPeekInput;
  /** The latest crawl request itself failed (backend down, or refused), so no job came of it. */
  startError?: string | null;
  /** The backend refused this post until a later time (cooldown); the caller compares against its clock. */
  retryBlocked?: boolean;
  ai?: InlineCardAiInput | null;
  /** Wall clock from the caller; the viewmodel never reads time itself. */
  now?: number;
}
export interface InlineCardViewModel {
  mode: FolderMode;
  sessionName: string;
  phase: InlineCardPhase;
  /** Estimate only: backend queue counts, or a local queue fallback. The view counts down from `from` and says 「比平常久」 past it. */
  eta: { from: string; seconds: number; ahead: number } | null;
  peek: InlineCardPeek | null;
  error: string | null;
  rawError: string | null;
  retry: { attempts: number; at: string } | null;
  canCancel: boolean;
  /** Hide 重試: the backend would refuse it until its cooldown ends. */
  retryBlocked: boolean;
  countLabel: string | null;
  readingCounts: { frames: number; comments: number };
  /** Fewer than MIN_COMMENTS read: list them instead of grouping. */
  few: InlineCardQuote[] | null;
  entries: InlineCardEntry[];
  answers: Partial<Record<InlineCardEntryKey, InlineCardAnswer>>;
  /** Only for a 觀眾反應 card with enough replies to read. */
  ai: { state: "running" | "failed" | "complete" | "no-key"; error: string | null } | null;
  /** 展開證據 has something to show. */
  hasEvidence: boolean;
  /** Crawl done, backend quant clusters still being computed. */
  analysisPending: boolean;
}

export const INLINE_CARD_MIN_COMMENTS = 10;
// The backend writes its quant analysis a few seconds after the crawl (18s on 2026-10-07); give up waiting after this.
const ANALYSIS_WAIT_MS = 5 * 60_000;
export function awaitingAnalysis(item: SessionItem, now: number): boolean {
  if (item.status !== "succeeded") return false;
  const status = item.latestCapture?.analysis?.status;
  if (status === "succeeded" || status === "failed") return false;
  const since = Date.parse(item.completedAt ?? item.lastStatusAt ?? "");
  return Number.isFinite(since) && now - since < ANALYSIS_WAIT_MS;
}
// Fitted to the ingest log 2026-08-24 → 09-21 (p50 84s, p90 163s): a fixed overhead plus time per reply.
export const estimateCrawlSeconds = (item: SessionItem) =>
  Math.round(55 + Math.min(item.descriptor.engagement?.comments ?? 0, 500) * 0.22);

type Comment = CrawlComment;
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const short = (text: string, max = 24) => clipReadingCopy(text, max) || "提問詳見原留言";

function phaseOf(item: SessionItem): InlineCardPhase {
  if (item.status === "succeeded") return "done";
  if (item.status === "failed") return "failed";
  if (item.status === "running") return "running";
  if (item.status === "queued") return "queued";
  return "saved";
}

function etaOf(item: SessionItem, phase: InlineCardPhase, queue: SessionItem[]): InlineCardViewModel["eta"] {
  const own = estimateCrawlSeconds(item);
  if (phase === "running") {
    const from = item.lastStatusAt ?? item.queuedAt;
    return from ? { from, seconds: own, ahead: 0 } : null;
  }
  if (phase !== "queued" || !item.queuedAt) return null;
  const job = item.latestJob;
  const count = num(job?.jobs_ahead) ?? (num(job?.queue_position) !== null ? job!.queue_position! - 1 : null);
  if (count !== null && Number.isInteger(count) && count >= 0) {
    return { from: job?.updated_at || item.queuedAt, seconds: own * (count + 1), ahead: count };
  }
  const ahead = queue.filter((other) => other.id !== item.id
    && (other.status === "running" || (other.status === "queued" && !!other.queuedAt && other.queuedAt < item.queuedAt!)));
  return { from: item.queuedAt, seconds: own + ahead.reduce((sum, other) => sum + estimateCrawlSeconds(other), 0), ahead: ahead.length };
}

function peekOf(input: InlineCardPeekInput | undefined): InlineCardPeek | null {
  if (!input || input.state === "unavailable") return null;
  if (input.state === "loading") return input;
  const top = [...input.replies].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))[0] ?? null;
  return { state: "ready", total: input.replies.length, top };
}

/** Everything the card and 展開證據 read from one crawl, derived the same way for both. */
export function readInlineCardThread(item: SessionItem) {
  const comments = readCrawlComments(item);
  const op = readOpHandle(item);
  const byId = new Map(comments.map((c) => [c.id, c]));
  const children = new Map<string, Comment[]>();
  for (const c of comments) if (c.parent) children.set(c.parent, [...(children.get(c.parent) ?? []), c]);
  const clusters = [...(item.latestCapture?.analysis?.clusters ?? [])].sort((a, b) => b.size_share - a.size_share).slice(0, 4);
  const evidence = item.latestCapture?.analysis?.evidence ?? [];
  const ranked = comments.filter((c) => c.likes !== null).sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  // 作者回應: the author's replies under someone else's comment.
  const opReplies = comments.filter((c) => op && handle(c.author) === op && c.parent && byId.has(c.parent) && handle(byId.get(c.parent)!.author) !== op);
  // 大家問咩: a question rule plus the reply chain. A reply is not proof of an answer.
  const asks = comments.filter((c) => handle(c.author) !== op && isReplyQuestion(c.text)).map((c) => {
    const kids = children.get(c.id) ?? [];
    const status: "author" | "other" | "none" = kids.some((k) => handle(k.author) === op) ? "author" : kids.length ? "other" : "none";
    return { c, status, reply: kids.find((k) => handle(k.author) === op) ?? kids[0] ?? null };
  }).sort((a, b) => (a.status === "none" ? 0 : 1) - (b.status === "none" ? 0 : 1) || (b.c.likes ?? 0) - (a.c.likes ?? 0));
  return { comments, op, byId, clusters, evidence, ranked, opReplies, asks };
}
const isNoise = (cluster: { cluster_key: number }, reading: InlineReading | null) => !!reading?.noiseClusters.includes(String(cluster.cluster_key));
/** Largest first, but noise (spam, ads, off-topic) after every real reaction. */
const orderClusters = <C extends { cluster_key: number }>(clusters: C[], reading: InlineReading | null) =>
  [...clusters.filter((c) => !isNoise(c, reading)), ...clusters.filter((c) => isNoise(c, reading))];
const keywordLabel = (keywords: string[]) => keywords.map(cleanReadingCopy).filter(Boolean).slice(0, 3).join(" / ") || "未有關鍵詞";
const pct = (share: number) => Math.round(share * 100);

function readingOf(item: SessionItem, ai: InlineCardAiInput | null | undefined) {
  return ai?.status === "complete" && ai.captureId === item.latestCapture?.id ? guardInlineAudienceReading(ai.reading, buildReplyThreads(readCrawlComments(item), readOpHandle(item))) : null;
}
function aiStateOf(item: SessionItem, ai: InlineCardAiInput | null | undefined): InlineCardViewModel["ai"] {
  if (!ai) return null;
  if (ai.status === "no-key") return { state: "no-key", error: ai.reason ?? null };
  if (ai.captureId !== item.latestCapture?.id) return null;
  return { state: ai.status, error: ai.status === "failed" ? ai.error : null };
}

export function buildInlineCardViewModel(item: SessionItem, mode: FolderMode, sessionName: string, context: InlineCardContext = {}): InlineCardViewModel {
  // A failed item can be retried too; a refusal of that retry is newer than the old job's failure.
  const startError = phaseOf(item) === "saved" || phaseOf(item) === "failed" ? context.startError ?? null : null;
  const phase = context.submitting ? "queued" : startError ? "failed" : phaseOf(item);
  const job = item.latestJob;
  const retry = !context.submitting && phase === "queued" && job?.status === "pending" && job.attempt_count > 0
    ? { attempts: job.attempt_count, at: job.scheduled_at } : null;
  const rawError = startError ?? (phase === "failed" ? item.lastError || item.lastErrorKind || null : retry ? job?.last_error ?? null : null);
  const mappedError = getProcessingFailureUiMessage(rawError);
  const errorKind = startError ? null : job?.last_error_kind ?? item.lastErrorKind;
  const error = rawError || retry || phase === "failed"
    ? errorKind || retry
      ? describeProcessingError({ lastErrorKind: errorKind, lastError: rawError, pendingRetry: !!retry })?.detail ?? getProcessingFailureUiMessage(null)
      : mappedError.startsWith("處理失敗：") ? getProcessingFailureUiMessage(null) : mappedError
    : null;
  const reads = mode === "topic" || mode === "product";
  const base: InlineCardViewModel = {
    mode, sessionName, phase,
    eta: etaOf(item, phase, context.queue ?? []),
    peek: reads && phase !== "done" ? peekOf(context.peek) : null,
    error, rawError, retry,
    canCancel: !context.submitting && phase === "queued" && !!item.jobId && job?.status === "pending" && context.cancelSupported !== false,
    retryBlocked: phase === "failed" && !!context.retryBlocked,
    countLabel: null, readingCounts: { frames: 0, comments: 0 }, few: null, entries: [], answers: {}, ai: null, hasEvidence: false, analysisPending: false
  };
  if (phase !== "done" || mode !== "topic") {
    if (context.forReader && mode === "topic") {
      base.entries = ([['stance','大家點睇'],['top','樣本內最高讚'],['op','作者回應'],['ask','大家問咩']] as const).map(([key,label])=>({key,label,mark:'',finding:''}));
      for (const e of base.entries) base.answers[e.key]={kind:'empty',text:phase === 'failed' ? '抓取失敗' : phase === 'saved' ? '未抓取留言' : '讀緊留言'};
    }
    return base;
  }
  base.analysisPending = context.now !== undefined && awaitingAnalysis(item, context.now);

  const t = readInlineCardThread(item);
  const quote = (c: Pick<Comment, "text" | "author" | "likes">): InlineCardQuote => ({ text: c.text, author: c.author, likes: c.likes, isAuthor: !!t.op && handle(c.author) === t.op });
  const total = num(item.descriptor.engagement?.comments);
  base.countLabel = `${t.comments.length} / ${total ?? "?"} 則`;
  const currentReading = readingOf(item, context.ai);
  base.readingCounts = { comments: t.comments.length, frames: t.comments.length < INLINE_CARD_MIN_COMMENTS ? 0
    : (item.latestCapture?.analysis?.clusters ?? []).filter(cluster => !isNoise(cluster, currentReading)).length };
  if (t.comments.length < INLINE_CARD_MIN_COMMENTS) {
    base.few = t.comments.slice(0, 9).map(quote);
    if (!context.forReader) return base;
  }
  base.ai = base.analysisPending ? null : aiStateOf(item, context.ai);
  const reading = readingOf(item, context.ai);
  const nameOf = (cluster: { cluster_key: number; keywords: string[] }) => reading?.clusterNames[String(cluster.cluster_key)] || keywordLabel(cluster.keywords);

  // 大家點睇: quant clusters, shares as percentages only; AI only names them, flags spam/off-topic ones and writes the gist.
  // The entry's number and words always describe the same cluster: the largest one that is not noise.
  if (t.clusters.length) {
    const ordered = orderClusters(t.clusters, reading);
    const lead = ordered[0];
    const evidence = t.evidence.find((e) => e.cluster_key === lead.cluster_key)?.comments?.[0];
    base.entries.push({ key: "stance", label: "大家點睇", mark: `${pct(lead.size_share)}%`, finding: nameOf(lead) });
    base.answers.stance = {
      kind: "clusters",
      headline: reading?.gist ?? `最大一群講「${nameOf(lead)}」，佔已讀留言 ${pct(lead.size_share)}%。`,
      segments: ordered.map((c) => ({ label: nameOf(c), pct: pct(c.size_share), noise: isNoise(c, reading) })),
      quote: evidence ? { text: evidence.text, author: evidence.author ?? "", likes: evidence.like_count ?? null, isAuthor: !!t.op && handle(evidence.author) === t.op } : null
    };
  }

  if (context.forReader && !base.answers.stance) {
    base.entries.push({key:'stance',label:'大家點睇',mark:'',finding:''});
    base.answers.stance={kind:'empty',text:t.comments.length < INLINE_CARD_MIN_COMMENTS ? '留言未夠歸納，先睇原句。' : '未有可用的回應分群。'};
  }
  if (reading) {
    base.entries.push({ key: "method", label: "有咩做法", mark: reading.methods.length ? `${reading.methods.length} 種` : "", finding: reading.find.method });
    base.answers.method = reading.methods.length
      ? { kind: "methods", rows: reading.methods.map((m) => ({ name: m.name, fit: m.fit })), quote: quote(reading.methods[0].quote) }
      : { kind: "empty", text: "留言多是推薦和意見，未見可以照做的方法。" };
    base.entries.push({ key: "split", label: "有咩分歧", mark: reading.split.sides.length ? "2 邊" : "", finding: reading.find.split });
    base.answers.split = {
      kind: "split",
      agree: reading.split.agree || reading.find.split,
      sides: reading.split.sides.map((side) => ({ claim: side.claim, why: side.why, quote: quote(side.quote) })),
      note: reading.split.sides.length ? null : `只根據已讀的 ${t.comments.length} 則留言。`
    };
  } else {
    if (t.ranked.length) {
      base.entries.push({ key: "top", label: "樣本內最高讚", mark: `${t.ranked[0].likes} 讚`, finding: t.ranked[0].text });
      base.answers.top = { kind: "quotes", rows: t.ranked.slice(0, 3).map(quote) };
    }
    if (context.forReader && !base.answers.top) {
      base.entries.push({key:'top',label:'樣本內最高讚',mark:'',finding:''});
      base.answers.top={kind:'empty',text:'樣本內未有讚數。'};
    }
    base.entries.push({ key: "op", label: "作者回應", mark: t.opReplies.length ? `${t.opReplies.length} 則` : "", finding: t.opReplies[0]?.text ?? "未有回覆留言" });
    base.answers.op = t.opReplies.length
      ? { kind: "op", rows: t.opReplies.slice(0, 4).map((c) => ({ text: c.text, inReplyTo: short(t.byId.get(c.parent!)!.text), author: t.op, likes: c.likes ?? null })) }
      : { kind: "empty", text: "作者未有回覆任何留言。" };
  }

  const open = t.asks.filter((a) => a.status === "none").length;
  base.entries.push({ key: "ask", label: "大家問咩", mark: t.asks.length ? (open ? `${open} 未回` : "都有回覆") : "", finding: cleanReadingCopy(reading?.find.ask ?? t.asks[0]?.c.text) || "未見提問" });
  base.answers.ask = t.asks.length
    ? { kind: "ask", headline: open ? `${open} 條問題樣本內未見回覆` : "問題都有人回覆", rows: t.asks.slice(0, 5).map((a) => ({ text: cleanReadingCopy(a.c.text), status: a.status })) }
    : { kind: "empty", text: "已讀留言裡未見提問。" };
  base.hasEvidence = t.clusters.length > 0 || t.ranked.length > 0 || (!!context.forReader && t.comments.length > 0);
  return base;
}

/* ---------- 展開證據: the replies behind the open answer, in Threads' own reply shape ---------- */
export interface InlineEvidenceRow { author: string; text: string; likes: number | null; replies: number | null; time: string | null; isAuthor: boolean }
export interface InlineEvidenceChain { row: InlineEvidenceRow; reply: InlineEvidenceRow | null; unanswered: boolean }
export interface InlineEvidenceGroup {
  tone: "cluster" | "noise" | "method" | "side" | "none" | "author" | "other";
  /** Same index as the cluster's segment on the card, so colours match. */
  index: number;
  title: string;
  meta: string;
  context: string | null;
  chains: InlineEvidenceChain[];
  /** Replies left out to keep the window short. */
  more: number;
  expanded?: boolean;
}
const EVIDENCE_ROWS = 3;
export interface InlineCardEvidence { heading: string; sub: string; section: string; groups: InlineEvidenceGroup[] }

function shownTexts(answer: InlineCardAnswer | undefined): string[] {
  if (!answer) return [];
  if (answer.kind === "clusters" || answer.kind === "methods") return answer.quote ? [answer.quote.text] : [];
  if (answer.kind === "quotes" || answer.kind === "op") return answer.rows.map((row) => row.text);
  if (answer.kind === "split") return answer.sides.map((side) => side.quote.text);
  return [];
}

export function buildInlineCardEvidence(item: SessionItem, vm: InlineCardViewModel, lens: InlineCardEntryKey | null, ai?: InlineCardAiInput | null, groupLimits: Record<string, number> = {}): InlineCardEvidence | null {
  if (!vm.hasEvidence) return null;
  const t = readInlineCardThread(item);
  const reading = readingOf(item, ai);
  // The card already quotes these; 展開證據 never repeats them.
  const shown = new Set(lens === "ask" ? [] : shownTexts(lens ? vm.answers[lens] : undefined));
  const toRow = (c: Pick<Comment, "author" | "text" | "likes" | "replies" | "time">): InlineEvidenceRow =>
    ({ author: c.author, text: c.text, likes: c.likes, replies: c.replies, time: c.time, isAuthor: !!t.op && handle(c.author) === t.op });
  const lookup = (id: string, fallback: { text: string; author?: string; likes: number | null }) =>
    t.byId.get(id) ?? { id, parent: null, text: fallback.text, author: fallback.author ?? "", likes: fallback.likes, replies: null, time: null };
  // Spam often repeats one text verbatim; show each text once, and only a few per group.
  const pick = (list: Comment[], cap = EVIDENCE_ROWS) => {
    const seen = new Set<string>();
    const fresh = list.filter((c) => {
      const key = c.text.replace(/\s+/g, " ").trim();
      if (shown.has(c.text) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { chains: fresh.slice(0, cap).map((c) => ({ row: toRow(c), reply: null, unanswered: false })), more: Math.max(0, fresh.length - cap) };
  };

  const limit = (tone: InlineEvidenceGroup["tone"], index: number) => Math.min(tone === "noise" ? 11 : 13, Math.max(tone === "noise" ? 1 : EVIDENCE_ROWS, groupLimits[`${tone}:${index}`] ?? (tone === "noise" ? 1 : EVIDENCE_ROWS)));
  let section: string;
  let groups: InlineEvidenceGroup[];
  if (lens === "method" && reading?.methods.length) {
    section = "做法：適用情境與原句";
    groups = reading.methods.map((m, index) => ({ tone: "method", index, title: m.name, meta: "", context: m.fit || null, ...pick([lookup(m.quote.commentId, m.quote)], limit("method", index)) }));
  } else if (lens === "split" && reading?.split.sides.length) {
    section = "兩邊的理由與原句";
    groups = reading.split.sides.map((side, index) => ({ tone: "side", index, title: side.claim, meta: "", context: side.why || null, ...pick([lookup(side.quote.commentId, side.quote)], limit("side", index)) }));
  } else if (lens === "ask" && t.asks.length) {
    section = "問題與回覆";
    const NAME = { none: "樣本內未見回覆", author: "作者回覆", other: "有人回覆" } as const;
    groups = (["none", "author", "other"] as const).flatMap((status, index) => {
      const asks = t.asks.filter((a) => a.status === status);
      if (!asks.length) return [];
      const take = (budget:number) => {
        const chains:InlineEvidenceChain[]=[];
        let rows=0;
        for (const ask of asks) {
          const size=ask.reply ? 2 : 1;
          if (rows+size>budget) break;
          chains.push({row:toRow(ask.c),reply:ask.reply ? toRow(ask.reply) : null,unanswered:status==='none'});
          rows+=size;
        }
        return {chains,rows};
      };
      const initial=take(EVIDENCE_ROWS);
      const visible=take(Math.min(limit(status,index),initial.rows+10));
      const totalRows=asks.reduce((n,a)=>n+(a.reply ? 2 : 1),0);
      return [{tone:status,index,title:NAME[status],meta:`${asks.length} 條`,context:null,chains:visible.chains,more:totalRows-visible.rows}];
    });
  } else if (t.clusters.length) {
    section = reading ? "按回應類別的原句" : "按關鍵詞分群的原句";
    groups = orderClusters(t.clusters, reading).map((cluster, index) => {
      const noise = isNoise(cluster, reading);
      return {
        tone: noise ? "noise" : "cluster", index,
        title: reading?.clusterNames[String(cluster.cluster_key)] || keywordLabel(cluster.keywords),
        meta: `${pct(cluster.size_share)}%`, context: noise ? "AI 判斷為廣告、洗版或離題，不計作觀眾反應。" : null,
        ...pick((t.evidence.find((e) => e.cluster_key === cluster.cluster_key)?.comments ?? [])
          .map((e) => lookup(e.comment_id, { text: e.text, author: e.author, likes: e.like_count ?? null })), limit(noise ? "noise" : "cluster", index))
      };
    });
  } else {
    section = "樣本內最高讚";
    groups = [{ tone: "cluster", index: 0, title: "最多讚的留言", meta: "", context: null, ...pick(t.ranked.length ? t.ranked : t.comments, limit("cluster", 0)) }];
  }
  const total = num(item.descriptor.engagement?.comments);
  return {
    heading: `@${t.op || "作者"} 的留言證據`,
    sub: `已讀 ${t.comments.length} / ${total ?? "?"} 則 · 卡片上已見的句子不重複`,
    section,
    groups: groups.filter((group) => group.chains.length || group.context).map(group=>({...group,expanded:!!groupLimits[`${group.tone}:${group.index}`]}))
  };
}

/** Completion belongs to the captured reading, never a newly invented backend clock. */
export function inlineReadingFinishedAt(item: SessionItem, ai: InlineCardAiInput | null | undefined, now: number): string | null {
  if (item.status !== "succeeded") return null;
  const current = ai && "captureId" in ai && ai.captureId === item.latestCapture?.id ? ai : null;
  if (current?.status === "running" || awaitingAnalysis(item, now)) return null;
  if (current?.status === "complete") return current.reading.generatedAt;
  return item.latestCapture?.analysis?.generated_at ?? item.completedAt ?? item.latestCapture?.result?.fetched_at ?? item.latestCapture?.captured_at ?? null;
}
export interface InlineSaveLine {
  destination: string; status: string; busy: boolean; ready: boolean; retry: boolean;
  rawError?: string | null; canCancel?: boolean;
}
export function buildInlineSaveLine(vm: InlineCardViewModel, now: number, savedAt: number | null, topicName: string | null): InlineSaveLine {
  const ready = vm.phase === "done" && !vm.analysisPending && vm.ai?.state !== "running";
  const busy = vm.phase === "queued" || vm.phase === "running" || vm.analysisPending || vm.ai?.state === "running";
  let status: string;
  if (vm.phase === "failed") status = `抓取失敗 · ${vm.error ?? "原因不明"}`;
  else if (vm.retry) status = `${retryStatus(vm)} · ${vm.error ?? ""}`;
  else if (vm.phase === "queued") status = `排隊中${vm.eta?.ahead ? ` · 前面 ${vm.eta.ahead} 篇` : ""}${etaMinutes(vm, now)}`;
  else if (busy && savedAt !== null && now - savedAt < 1000) {
    const top = vm.peek?.state === "ready" ? vm.peek.top : null;
    status = top ? `「${top.text}」 ♡ ${top.likes ?? 0}` : "睇緊第一批留言";
  } else if (ready) {
    status = `讀完 · ${vm.readingCounts.frames} 種講法 · ${vm.readingCounts.comments} 則留言`;
  } else if (busy) {
    const left = vm.eta ? vm.eta.seconds - Math.floor((now - Date.parse(vm.eta.from)) / 1000) : null;
    status = vm.analysisPending || vm.ai?.state === "running" ? "整理緊留言" : `讀緊留言${left === null ? "" : ` · ${!Number.isFinite(left) || left < 0 ? "比平常久" : `約 ${Math.max(1, Math.ceil(left / 60))} 分`}`}`;
  } else status = "未抓取留言";
  return { rawError: vm.rawError, canCancel: vm.canCancel, destination: `已存入 觀眾反應${topicName ? `〈${topicName}〉` : " · 未分流"}`, status, busy, ready, retry: (vm.phase === "failed" || vm.phase === "saved") && !vm.retryBlocked };
}
export function nextInlineDisclosure(expanded: boolean, ready: boolean) {
  return { expanded: ready && !expanded, markOpened: ready && !expanded };
}
export interface InlineReturnGlow { ready: boolean; pending: boolean; glow: boolean }
export function nextReturnGlow(previous: InlineReturnGlow | undefined, ready: boolean, visible: boolean): InlineReturnGlow {
  const pending = ready && (!!previous?.pending || (!!previous && !previous.ready && !visible));
  return { ready, pending: pending && !visible, glow: pending && visible };
}

export function inlineReplyRow(c: CrawlComment, op: string): InlineEvidenceRow {
 return {author:c.author,text:c.text,likes:c.likes,replies:c.replies,time:c.time,isAuthor:!!op && handle(c.author)===op};
}

export function retryStatus(vm: InlineCardViewModel): string {
  if (!vm.retry) return "";
  const at = new Date(vm.retry.at);
  const time = Number.isFinite(at.getTime()) ? at.toLocaleString("zh-HK", { hour12: false }) : vm.retry.at;
  // No 「/M」: max_attempts is the job's ceiling, but an empty result stops after 2.
  return `第 ${vm.retry.attempts} 次失敗 · 下次重試 ${time}`;
}
function etaMinutes(vm: InlineCardViewModel, now: number): string {
  if (!vm.eta) return "";
  const left = vm.eta.seconds - Math.floor((now - Date.parse(vm.eta.from)) / 1000);
  return ` · ${!Number.isFinite(left) || left < 0 ? "比平常久" : `約 ${Math.max(1, Math.ceil(left / 60))} 分`}`;
}
