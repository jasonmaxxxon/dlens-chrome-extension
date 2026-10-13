import type { CrawlComment } from "./inline-reading.ts";

// Shared with 大家問咩; this is a question heuristic, not semantic adjudication.
const QUESTION = /[？?]|點解|點樣|點算|有冇|係咪|會唔會|可唔可以|幾時|邊度|邊個|幾多|\b(what|why|how|when|where|who)\b/i;
export const isReplyQuestion = (text: string): boolean => QUESTION.test(text);
const handle = (text: string) => text.replace(/^@/, "").trim().toLowerCase();
export interface ThreadReply extends CrawlComment {
  ref: string;
  role: "op" | "reply";
  answeredBy: string[];
  answers: string | null;
  pairing: "parent" | "adjacency" | null;
}
export interface ThreadTerm { term: string; count: number }
export type PostKind = "technical" | "general";
export const REPLY_CHARACTER_BUDGET = 24_000;
export const REPLY_HARD_CEILING = 200;
export const THREAD_TERM_LIMIT = 20;

/** Parent ids are authoritative. Adjacency is only a fallback when both parent fields are absent. */
export function buildReplyThreads(comments: CrawlComment[], op: string): ThreadReply[] {
  const normalizedOp = handle(op);
  const rows: ThreadReply[] = comments.map((c, i) => ({ ...c, ref: `e${i + 1}`, role: normalizedOp && handle(c.author) === normalizedOp ? "op" : "reply", answeredBy: [], answers: null, pairing: null }));
  const byId = new Map(rows.filter(c => c.id).map(c => [c.id, c]));
  const bySource = new Map(rows.filter(c => c.sourceId).map(c => [c.sourceId!, c]));
  rows.forEach((row, i) => {
    const explicit = !!(row.parent || row.parentSourceId);
    const parent = (row.parent ? byId.get(row.parent) : undefined)
      ?? (row.parentSourceId ? bySource.get(row.parentSourceId) ?? byId.get(row.parentSourceId) : undefined);
    const target = explicit ? parent : row.role === "op" && rows[i - 1]?.role === "reply" ? rows[i - 1] : undefined;
    if (!target || target === row) return;
    row.answers = target.id;
    row.pairing = explicit ? "parent" : "adjacency";
    target.answeredBy.push(row.id);
  });
  return rows;
}

/** Preserve crawl order; explicit cross-order links remain visible by ref, without pretending adjacency is fact. */
export function renderReplyThreads(rows: ThreadReply[]): string {
  const byId = new Map(rows.map(c => [c.id, c]));
  return rows.map(c => {
    const parent = c.answers ? byId.get(c.answers) : undefined;
    const link = parent ? ` [回覆 ${parent.ref}${c.pairing === "adjacency" ? "，相鄰推定" : ""}]` : "";
    return `${parent ? "  ↳ " : ""}${c.ref}${c.role === "op" ? " [作者]" : ""} @${c.author.replace(/^@/, "") || "unknown"}: ${c.text} [♥${c.likes ?? 0}]${link}`;
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
