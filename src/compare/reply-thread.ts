import type { CrawlComment } from "./inline-reading.ts";

export type ReplyQuestionReason = "empty" | "non_prose_only" | "punctuation_only" | "no_question_intent"
  | "yue_interrogative" | "zh_interrogative" | "english_interrogative" | "request_clause";
export interface ReplyQuestionAssessment { isQuestion: boolean; reason: ReplyQuestionReason; surface: string }

/** Detection-only surface. The original reply is never rewritten or removed. */
export function replyQuestionSurface(text: string): string {
  return text.normalize("NFKC")
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, " ")
    .replace(/<(?:code|pre|blockquote)\b[^>]*>[\s\S]*?<\/(?:code|pre|blockquote)>/gi, " ")
    .replace(/`+[^`]*`+/g, " ")
    .replace(/^\s*>.*$/gm, " ")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[「『“‘《〈][^」』”’》〉]*[」』”’》〉]/gu, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, " ")
    .replace(/(^|[\s:：([])'[^'\r\n]*'(?=$|[\s.,!?;:)\]])/g, "$1 ")
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>"「」“”，。！？；、]+/giu, " ")
    .replace(/(^|\s)\/[^\s<>]+\?[^\s<>]*/g, "$1 ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\t ]+/g, " ").trim();
}

const YUE_INTERROGATIVE = /點解|點樣|點算|點(?:整|做|用|試|買|搵|搞|申請|設定|設置|入|開|收費)|有冇|係咪|會唔會|可唔可以|得唔得|使唔使|識唔識|係唔係|幾時|邊度|邊個|邊間|邊款|邊種|幾多|乜(?:嘢|野)|(?:^|[用做講搵食買睇係])咩/;
const ZH_INTERROGATIVE = /為什麼|为什么|為何|为何|怎麼|怎么|怎樣|怎样|如何|什麼|什么|哪裡|哪里|哪裏|哪個|哪个|哪間|哪间|多少|何時|何时|是否|能否|可否|有沒有|有没有|可不可以|能不能|會不會|会不会|是不是|要不要/;
const YES_NO_CLAUSE = /有冇|有沒有|有没有|係咪|係唔係|會唔會|可唔可以|得唔得|使唔使|識唔識|可不可以|能不能|會不會|会不会|是不是|要不要|是否|能否|可否/;
const EN_AUXILIARY = /^(?:does?|did|can|could|will|would|should|is|are|was|were|has|have|had|may|might|must)\s+[a-z][\w'-]*(?:\s|$)/i;
const NARRATIVE_CJK = /^(?:這是|这是)?(?:我|我們|我们|大家)?(?:已經|已经|早就|都|就)?(?:知道|明白|解釋|解释|分享|示範|示范|教你|介紹|介绍|說明|说明|記錄|记录)/;
const REQUEST_CJK = /^(?:(?:請問|请问|想問|想问|想請教|想请教|請教|请教|想知道|想了解).+|(?:可以|可否|能否|請|请|麻煩|麻烦|求).*(?:分享|提供|教|指教|解釋|解释|告訴|告诉|推薦|推荐|介紹|介绍|示範|示范|貼|贴|給|给).+|(?:分享|介紹|介绍|解釋|解释|示範|示范)(?:一下|下|吓).+|教(?:我|我們|我们).+)/;
const REQUEST_EN = /^(?:please\s+(?:share|show|explain|tell|recommend|provide|help|teach)\b|(?:could|can|would)\s+(?:you|someone|anyone)\s+(?:please\s+)?(?:share|show|explain|tell|recommend|provide|help|teach)\b|any\s+(?:tutorials?|guides?|instructions?|recommendations?|examples?)\b)/i;

/** A deterministic intent heuristic, not semantic adjudication or proof of an answer. */
export function classifyReplyQuestion(text: string): ReplyQuestionAssessment {
  const surface = replyQuestionSurface(text);
  const result = (isQuestion: boolean, reason: ReplyQuestionReason) => ({ isQuestion, reason, surface });
  if (!text.trim()) return result(false, "empty");
  if (!surface) return result(false, "non_prose_only");
  if (!/[\p{L}\p{N}]/u.test(surface)) return result(false, "punctuation_only");
  for (const raw of surface.split(/[\n.!?。！？;；]+/)) {
    const clause = raw.replace(/^[\s,:：，]+|[\s,:：，]+$/g, "");
    if (!clause || !/[\p{L}]{2}/u.test(clause.replace(/\s+/g, ""))) continue;
    if (REQUEST_CJK.test(clause) || REQUEST_EN.test(clause)) return result(true, "request_clause");
    if (/[嗎吗麼么]$/.test(clause)) return result(true, "zh_interrogative");
    if (!NARRATIVE_CJK.test(clause)) {
      if (YUE_INTERROGATIVE.test(clause)) return result(true, "yue_interrogative");
      if (ZH_INTERROGATIVE.test(clause)) return result(true, "zh_interrogative");
    }
    if (/^(?:what\s+(?:a|an)\b|how\s+(?:lovely|beautiful|great)\b|(?:what|how)\s+(?:i|we)\s+(?:did|built|made|found|learned)\b)/i.test(clause)) continue;
    if (/^(?:what|why|how|when|where|who|whom|whose|which)\b/i.test(clause) || EN_AUXILIARY.test(clause)) {
      return result(true, "english_interrogative");
    }
  }
  return result(false, "no_question_intent");
}
export const replyQuestionReason = (text: string): ReplyQuestionReason => classifyReplyQuestion(text).reason;
export const isReplyQuestion = (text: string): boolean => classifyReplyQuestion(text).isQuestion;

/** Only grammatical yes/no context can rescue a bare affirmative as an answer. */
export function isYesNoReplyQuestion(text: string): boolean {
  const assessment = classifyReplyQuestion(text);
  return assessment.isQuestion && assessment.surface.split(/[\n.!?。！？;；]+/).some(clause =>
    YES_NO_CLAUSE.test(clause) || /[嗎吗麼么]\s*$/.test(clause) || EN_AUXILIARY.test(clause.trim()));
}

const MISSING_HANDLES = new Set(["unknown", "undefined", "null", "anonymous", "none"]);
const UI_HANDLES = new Set(["author", "pinned", "follow", "following", "verified", "top", "more", "translate", "edited"]);
const normalizedHandle = (text: string) => text.trim().replace(/^@/, "").trim().toLowerCase();
const handle = (text: string, corroborated = false) => {
  const value = normalizedHandle(text);
  return /^[a-z0-9._-]+$/.test(value) && (corroborated || (!MISSING_HANDLES.has(value) && !UI_HANDLES.has(value))) ? value : "";
};

/** Eligibility supplies this owned canonical permalink and retains its code as
 * an identity alias. Do not promote a label from body links or unrelated URLs. */
const ownedAuthorCorroborated = (row: CrawlComment): boolean => {
  if (!("permalink" in row) || typeof row.permalink !== "string" || /[\s\\]/.test(row.permalink)) return false;
  try {
    const url = new URL(row.permalink, "https://www.threads.com/");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port ||
      !["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(url.hostname)) return false;
    const match = url.pathname.match(/^\/@([a-z0-9._-]+)\/post\/([a-zA-Z0-9_-]+)(?:\/media)?\/?$/i);
    return !!match && match[1].toLowerCase() === normalizedHandle(row.author)
      && [row.id, row.sourceId, ...(row.aliases ?? [])].includes(match[2]);
  } catch { return false; }
};
export interface ThreadReply extends CrawlComment {
  ref: string;
  role: "op" | "reply" | "unknown";
  answeredBy: string[];
  answers: string | null;
  pairing: "parent" | "adjacency" | null;
  pairingReason: "explicit_parent" | "inferred_adjacency" | "unresolved_parent" | "conflicting_parent" | "self_parent" | "cycle" | "no_parent";
}
export interface ThreadTerm { term: string; count: number }
export type PostKind = "technical" | "general";
export const REPLY_CHARACTER_BUDGET = 24_000;
export const REPLY_HARD_CEILING = 200;
export const THREAD_TERM_LIMIT = 20;

/** The supplied OP comes from validated eligibility/readOpHandle context. A real
 * handle may itself be "author"; matching that known OP corroborates only its own
 * rows, never a generic/unknown audience label. Valid parents stay authoritative;
 * adjacency remains explicitly inferred context only. */
export function buildReplyThreads(comments: CrawlComment[], op: string): ThreadReply[] {
  const normalizedOp = MISSING_HANDLES.has(normalizedHandle(op)) ? "" : handle(op, true);
  const rows: ThreadReply[] = comments.map((c, i) => {
    const author = handle(c.author, ownedAuthorCorroborated(c) || (!!normalizedOp && normalizedHandle(c.author) === normalizedOp));
    return { ...c, ref: `e${i + 1}`, role: !normalizedOp || !author ? "unknown" : author === normalizedOp ? "op" : "reply", answeredBy: [], answers: null, pairing: null, pairingReason: "no_parent" };
  });
  const byAlias = new Map<string, Set<ThreadReply>>();
  for (const row of rows) for (const alias of [row.id, row.sourceId, ...(row.aliases ?? [])]) {
    if (!alias) continue;
    const matches = byAlias.get(alias) ?? new Set<ThreadReply>();
    matches.add(row);
    byAlias.set(alias, matches);
  }
  const resolve = (alias: string | null | undefined) => {
    const matches = alias ? byAlias.get(alias) : undefined;
    return matches?.size === 1 ? [...matches][0] : undefined;
  };
  const targets = new Map<ThreadReply, ThreadReply>();
  rows.forEach((row, i) => {
    if (row.parentConflict) { row.pairingReason = "conflicting_parent"; return; }
    const explicit = !!(row.parent || row.parentSourceId);
    const parent = resolve(row.parent), sourceParent = resolve(row.parentSourceId);
    if (parent && sourceParent && parent !== sourceParent) { row.pairingReason = "conflicting_parent"; return; }
    const target = explicit ? parent ?? sourceParent : row.role === "op" && rows[i - 1]?.role === "reply" ? rows[i - 1] : undefined;
    if (!target) { if (explicit) row.pairingReason = "unresolved_parent"; return; }
    if (target === row) { row.pairingReason = "self_parent"; return; }
    targets.set(row, target);
    row.pairing = explicit ? "parent" : "adjacency";
    row.pairingReason = explicit ? "explicit_parent" : "inferred_adjacency";
  });
  const cyclic = new Set<ThreadReply>();
  for (const row of rows) {
    const chain: ThreadReply[] = [];
    let cursor: ThreadReply | undefined = row;
    while (cursor && targets.has(cursor)) {
      const index = chain.indexOf(cursor);
      if (index >= 0) {
        const cycle = chain.slice(index);
        // An inferred adjacent link cannot invalidate a valid explicit edge.
        const inferred = cycle.filter(node => node.pairing === "adjacency");
        (inferred.length ? inferred : cycle).forEach(node => cyclic.add(node));
        break;
      }
      chain.push(cursor);
      cursor = targets.get(cursor);
    }
  }
  for (const row of cyclic) { targets.delete(row); row.pairing = null; row.pairingReason = "cycle"; }
  for (const [row, target] of targets) { row.answers = target.id; target.answeredBy.push(row.id); }
  return rows;
}

/** Preserve crawl order; explicit cross-order links remain visible by ref, without pretending adjacency is fact. */
export function renderReplyThreads(rows: ThreadReply[]): string {
  const byId = new Map(rows.map(c => [c.id, c]));
  return rows.map(c => {
    const parent = c.answers ? byId.get(c.answers) : undefined;
    const link = parent ? ` [回覆 ${parent.ref}${c.pairing === "adjacency" ? "，相鄰推定" : ""}]` : "";
    return `${parent ? "  ↳ " : ""}${c.ref}${c.role === "op" ? " [作者]" : c.role === "unknown" ? " [歸屬未確認]" : ""} @${c.author.replace(/^@/, "") || "unknown"}: ${c.text} [♥${c.likes ?? 0}]${link}`;
  }).join("\n");
}

const STOP_WORDS = new Set("a an the and or but if then else so to of in on at for from with by as is are was were be been being it its this that these those i me my we us our you your he she they them their have has had do does did can could should would will may might not no yes all any some just very really also about more most much many only even get got like good great ok okay thanks thank hello lol haha what why how when where who which than into out up down now here there please use used using one two need want know think actually because something anything everything nothing over under same such still too well let say see etc user users reader readers people someone everyone anyone reply replies post thread comment comments www com http https".split(" "));
const CJK_TERMS = ["知識圖譜", "本體論", "事理圖譜", "結構化", "知識化", "向量", "切片", "檢索", "語意", "索引", "重排序", "召回率", "準確率", "精確率", "自然語言", "模型", "微調", "資料庫", "嵌入", "分詞"];

/** Latin/mixed tokens (case folded); known CJK terms count only within 24 chars of a Latin token. No external vocabulary or AI. */
export function scanThreadTerms(postText: string, replies: Pick<CrawlComment, "text">[], limit = THREAD_TERM_LIMIT): ThreadTerm[] {
  const counts = new Map<string, ThreadTerm>();
  const add = (term: string) => {
    const key = term.toLowerCase();
    const old = counts.get(key);
    if (old) old.count++;
    else counts.set(key, { term, count: 1 });
  };
  for (const raw of [postText, ...replies.map(r => r.text)]) {
    const text = raw.replace(/https?:\/\/\S+/gi, " ").replace(/@[A-Za-z0-9_.]+/g, " ");
    const latin = [...text.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*\b/g)]
      .filter(m => m[0].length > 1 && !STOP_WORDS.has(m[0].toLowerCase()));
    for (const m of latin) add(/^[A-Z0-9]+$/.test(m[0]) ? m[0] : m[0].toLowerCase());
    for (const term of CJK_TERMS) {
      for (const m of text.matchAll(new RegExp(term, "g"))) {
        if (latin.some(l => Math.max(0, l.index - (m.index + term.length), m.index - (l.index + l[0].length)) <= 24)) add(term);
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0)).slice(0, limit);
}

const TECHNICAL_TERMS = new Set([...CJK_TERMS, ..."rag kg bm25 mcp embedding embeddings rerank reranking f1 ontology graphrag llm llm-wiki nlp bert dsl gigo retrieval chunking metadata precision recall evaluator agentic api sql json markdown token tokens hybrid".split(" ")].map(t => t.toLowerCase()));
/** Technical heuristic: >=3 distinct terms, >=4 occurrences, >=2 known technical terms; ordinary English and one repeated acronym are insufficient. */
export function classifyPostKind(terms: ThreadTerm[]): PostKind {
  return terms.length >= 3 && terms.reduce((sum, t) => sum + t.count, 0) >= 4 && terms.filter(t => TECHNICAL_TERMS.has(t.term.toLowerCase())).length >= 2 ? "technical" : "general";
}

/** Budget includes rendered labels/links. Questions and author replies go in first; when even they cannot all fit,
 * the most-liked of them are kept, so an oversized thread still gets a reading instead of failing. */
export function selectReplyThreads(rows: ThreadReply[], terms: ThreadTerm[], budget = REPLY_CHARACTER_BUDGET): ThreadReply[] {
  const selected = new Set<ThreadReply>();
  const inOrder = () => rows.filter(c => selected.has(c));
  const tryAdd = (row: ThreadReply) => {
    if (selected.size >= REPLY_HARD_CEILING) return;
    selected.add(row);
    if (renderReplyThreads(inOrder()).length > budget) selected.delete(row);
  };
  const hits = (c: ThreadReply) => terms.reduce((n, t) => n + (c.text.toLowerCase().split(t.term.toLowerCase()).length - 1), 0);
  const byWeight = (a: ThreadReply, b: ThreadReply) => (b.likes ?? 0) - (a.likes ?? 0) || b.text.length - a.text.length || hits(b) - hits(a);
  const mandatory = rows.filter(c => c.role === "op" || isReplyQuestion(c.text));
  for (const row of [...mandatory].sort(byWeight)) tryAdd(row);
  for (const row of rows.filter(c => !mandatory.includes(c)).sort(byWeight)) tryAdd(row);
  return inOrder();
}
