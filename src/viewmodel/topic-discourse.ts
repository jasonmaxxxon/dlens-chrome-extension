import type { SessionItem, Signal, Topic } from "../state/types";
import { inlineCollectPostKey } from "../state/inline-collect";
import { readCrawlComments, readOpHandle, normalizeHandle } from "../compare/inline-reading";
import type { InlineReadingRecord } from "../compare/inline-reading-storage";

/**
 * The 觀眾反應 workspace as a discourse layer (side panel A, 2026-10-08): 話題 the user filled by hand, their 講法
 * (posts grouped by the keyword of their largest comment cluster, as TopicSynthesis groups them), and 發現 that only
 * show across posts. Every sentence is a template filled with counts; no AI writes here.
 */
export const DISCOURSE_MIN_POSTS = 3;
const WEEK_MS = 7 * 24 * 3600_000;
const QUESTION = /[？?]|點解|點樣|點算|有冇|係咪|會唔會|可唔可以|幾時|邊度|邊個|幾多/;

export interface TopicSuggestion { topicId: string; name: string; reason: string }
const suggestionWords = (text: string): string[] => [...new Set((text.match(/[a-z][a-z0-9_+-]{2,}|[\u3400-\u9fff]{2,}/gi) ?? []).flatMap(word =>
  /^[a-z]/i.test(word) ? [word] : Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))))];
/** One substantive Latin word or two CJK bigrams; short generic words never suggest a topic. */
export function suggestTopic(item: SessionItem, topics: Topic[], signals: Signal[], items: SessionItem[]): TopicSuggestion | null {
  const rootText = item.latestCapture?.result?.canonical_post?.text;
  const source = new Set(suggestionWords([item.descriptor.text_snippet ?? "", typeof rootText === "string" ? rootText : ""].join(" ")).map(w => w.toLowerCase()));
  const candidates = topics.map(topic => {
    const ids = new Set(signals.filter(s => s.sessionId === topic.sessionId && s.topicId === topic.id).map(s => s.itemId));
    const keywords = items.filter(i => i.id !== item.id && ids.has(i.id)).flatMap(i => (i.latestCapture?.analysis?.clusters ?? []).flatMap(c => c.keywords));
    const words = suggestionWords([topic.name, topic.context?.researchQuestion ?? "", ...keywords].join(" "));
    const hits = [...new Map(words.filter(w => source.has(w.toLowerCase())).map(w => [w.toLowerCase(), w])).values()];
    const score = hits.reduce((n, w) => n + (/^[a-z]/i.test(w) && w.length >= 4 ? 2 : 1), 0);
    return { topic, hits, score };
  }).filter(c => c.score >= 2).sort((a, b) => b.score - a.score || b.topic.updatedAt.localeCompare(a.topic.updatedAt) || a.topic.id.localeCompare(b.topic.id));
  const best = candidates[0];
  return best ? { topicId: best.topic.id, name: best.topic.name, reason: `都提到 ${best.hits.join("、")}` } : null;
}

export interface DiscoursePost {
  signalId: string;
  itemId: string;
  postKey: string;
  author: string;
  text: string;
  date: string;
  likes: number | null;
  url: string;
  inView: boolean;
}
export interface DiscourseFrame {
  key: string;
  name: string;
  posts: DiscoursePost[];
  first: string;
  thisWeek: number;
  isNew: boolean;
  inView: boolean;
}
export type DiscourseFinding =
  | { kind: "trend"; text: string; frameKey: string | null; weeks: { label: string; count: number; hot: boolean }[] }
  | { kind: "like"; text: string; frameKey: string | null; rows: { name: string; avg: number; hot: boolean }[] }
  | { kind: "ask"; text: string; question: string; where: { author: string; replied: boolean; postKey: string }[] };
export type DiscourseInView =
  | { kind: "here"; author: string; text: string; frameName: string | null }
  | { kind: "elsewhere"; author: string; topicName: string }
  | { kind: "unassigned"; author: string; signalId: string }
  | null;
export interface DiscourseInboxRow { signalId: string; author: string; text: string; meta: string; inView: boolean; suggestion?: TopicSuggestion | null }
export interface TopicDiscourseViewModel {
  postCount: number;
  topicCount: number;
  chips: { id: string; name: string; count: number; selected: boolean }[];
  inbox: DiscourseInboxRow[];
  /** Topics for the 放入 chips, most recently touched first. */
  picks: { id: string; name: string }[];
  topic: null | {
    id: string;
    name: string;
    researchQuestion?: string;
    coverage: string;
    inView: DiscourseInView;
    findings: DiscourseFinding[];
    frames: DiscourseFrame[] | null;
    /** Below DISCOURSE_MIN_POSTS, or posts whose comments are not analysed yet. */
    loose: DiscoursePost[];
    meme: { phrase: string; posts: number } | null;
  };
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const md = (ms: number) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };

/** When the post itself was published: Threads' relative time token measured from the capture, else the capture time. */
export function postedAt(item: SessionItem): number | null {
  const captured = Date.parse(item.descriptor.captured_at || item.savedAt || "");
  const token = str(item.descriptor.time_token_hint).trim();
  const rel = token.match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (rel && Number.isFinite(captured)) {
    const unit = { s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7, w: 6.048e8 }[rel[2].toLowerCase() as "s"]!;
    return captured - Number(rel[1]) * unit;
  }
  const abs = token.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (abs && Number.isFinite(captured)) {
    const year = abs[3] ? Number(abs[3].length === 2 ? `20${abs[3]}` : abs[3]) : new Date(captured).getFullYear();
    return new Date(year, Number(abs[1]) - 1, Number(abs[2])).getTime();
  }
  return Number.isFinite(captured) ? captured : null;
}

/** The 講法 a post joins: the keywords of its largest comment cluster that the AI pass did not flag as spam/off-topic. */
export function frameOf(item: SessionItem, reading?: InlineReadingRecord | null): { key: string; name: string } | null {
  const analysis = item.latestCapture?.analysis;
  if (!analysis || analysis.status !== "succeeded") return null;
  const noise = new Set(reading?.status === "complete" && reading.captureId === item.latestCapture?.id ? reading.reading.noiseClusters : []);
  const lead = [...(analysis.clusters ?? [])]
    .filter((cluster) => (cluster.keywords ?? []).some((k) => k.trim()) && !noise.has(String(cluster.cluster_key)))
    .sort((a, b) => b.size_share - a.size_share)[0];
  if (!lead) return null;
  const words = lead.keywords.map((k) => k.trim()).filter(Boolean);
  return { key: words[0].toLowerCase(), name: words.slice(0, 2).join(" / ") };
}

export interface TopicDiscourseInput {
  topics: Topic[];
  signals: Signal[];
  items: SessionItem[];
  readings?: Record<string, InlineReadingRecord>;
  selectedTopicId: string | null;
  inViewPostKey: string | null;
  now: number;
}

function toPost(signal: Signal, item: SessionItem, inViewPostKey: string | null): DiscoursePost {
  const posted = postedAt(item);
  const postKey = inlineCollectPostKey(item.descriptor);
  return {
    signalId: signal.id, itemId: item.id, postKey,
    author: str(item.descriptor.author_hint).replace(/^@/, "") || "unknown",
    text: str(item.descriptor.text_snippet).replace(/\s+/g, " ").trim(),
    date: posted === null ? "" : md(posted),
    likes: typeof item.descriptor.engagement?.likes === "number" ? item.descriptor.engagement.likes : null,
    url: item.descriptor.post_url,
    inView: postKey === inViewPostKey
  };
}

export function buildTopicDiscourseViewModel(input: TopicDiscourseInput): TopicDiscourseViewModel {
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const live = input.signals.filter((signal) => signal.itemId && itemById.has(signal.itemId));
  const topics = [...input.topics].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const inTopic = (topicId: string) => live.filter((signal) => signal.topicId === topicId);
  const inViewSignal = input.inViewPostKey
    ? live.find((signal) => inlineCollectPostKey(itemById.get(signal.itemId!)!.descriptor) === input.inViewPostKey) ?? null
    : null;
  // The panel follows the feed: the post in view picks its topic unless the user chose one.
  const selectedId = input.selectedTopicId && topics.some((t) => t.id === input.selectedTopicId)
    ? input.selectedTopicId
    : inViewSignal?.topicId && topics.some((t) => t.id === inViewSignal.topicId) ? inViewSignal.topicId : topics[0]?.id ?? null;

  const inbox = live.filter((signal) => !signal.topicId && signal.inboxStatus === "unprocessed").map((signal) => {
    const item = itemById.get(signal.itemId!)!;
    const post = toPost(signal, item, input.inViewPostKey);
    const comments = item.descriptor.engagement?.comments;
    return { suggestion: suggestTopic(item, topics, live, input.items), signalId: signal.id, author: post.author, text: post.text, inView: post.inView, meta: [str(item.descriptor.time_token_hint), typeof comments === "number" ? `${comments} 則留言` : ""].filter(Boolean).join(" · ") };
  });

  const vm: TopicDiscourseViewModel = {
    postCount: live.length,
    topicCount: topics.length,
    chips: topics.map((topic) => ({ id: topic.id, name: topic.name, count: inTopic(topic.id).length, selected: topic.id === selectedId })),
    inbox,
    picks: topics.map((topic) => ({ id: topic.id, name: topic.name })),
    topic: null
  };
  const topic = topics.find((t) => t.id === selectedId);
  if (!topic) return vm;

  const members = inTopic(topic.id).map((signal) => ({ signal, item: itemById.get(signal.itemId!)! }));
  const posts = members.map(({ signal, item }) => ({ post: toPost(signal, item, input.inViewPostKey), item, frame: frameOf(item, input.readings?.[item.id]) }))
    .sort((a, b) => (postedAt(b.item) ?? 0) - (postedAt(a.item) ?? 0));
  const comments = members.reduce((sum, { item }) => sum + readCrawlComments(item).length, 0);
  const updated = members.map(({ item }) => Date.parse(item.lastStatusAt ?? item.savedAt ?? "")).filter(Number.isFinite).sort((a, b) => b - a)[0];
  const hhmm = (ms: number) => { const d = new Date(ms); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };

  // 講法: posts sharing the keyword of their largest real comment cluster.
  const groups = new Map<string, { name: string; rows: typeof posts }>();
  for (const row of posts) {
    if (!row.frame) continue;
    const group = groups.get(row.frame.key) ?? { name: row.frame.name, rows: [] };
    group.rows.push(row);
    groups.set(row.frame.key, group);
  }
  const enough = posts.length >= DISCOURSE_MIN_POSTS && groups.size > 0;
  const frames: DiscourseFrame[] | null = enough ? [...groups.entries()].map(([key, group]) => {
    const dates = group.rows.map((row) => postedAt(row.item)).filter((ms): ms is number => ms !== null);
    const first = dates.length ? Math.min(...dates) : null;
    const thisWeek = dates.filter((ms) => input.now - ms < WEEK_MS).length;
    return {
      key, name: group.name, posts: group.rows.map((row) => row.post),
      first: first === null ? "" : md(first), thisWeek,
      isNew: first !== null && input.now - first < WEEK_MS && group.rows.length >= 2,
      inView: group.rows.some((row) => row.post.inView)
    };
  }).sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name)) : null;

  const inViewRow = posts.find((row) => row.post.inView);
  let inView: DiscourseInView = null;
  if (inViewRow) inView = { kind: "here", author: inViewRow.post.author, text: inViewRow.post.text, frameName: inViewRow.frame?.name ?? null };
  else if (inViewSignal) {
    const author = toPost(inViewSignal, itemById.get(inViewSignal.itemId!)!, null).author;
    const other = topics.find((t) => t.id === inViewSignal.topicId);
    inView = other ? { kind: "elsewhere", author, topicName: other.name } : { kind: "unassigned", author, signalId: inViewSignal.id };
  }

  vm.topic = {
    id: topic.id,
    name: topic.name,
    researchQuestion: topic.context?.researchQuestion,
    coverage: [`${posts.length} 篇貼文`, `已抓留言 ${comments} 則`, updated ? `更新 ${hhmm(updated)}` : ""].filter(Boolean).join(" · "),
    inView,
    findings: frames && frames.length >= 2 ? buildFindings(frames, posts.map((row) => ({ item: row.item, post: row.post, frameKey: row.frame?.key ?? null })), input.now) : [],
    frames,
    loose: frames ? posts.filter((row) => !row.frame).map((row) => row.post) : posts.map((row) => row.post),
    meme: buildMeme(posts.map((row) => row.item))
  };
  return vm;
}

function buildFindings(frames: DiscourseFrame[], rows: { item: SessionItem; post: DiscoursePost; frameKey: string | null }[], now: number): DiscourseFinding[] {
  const out: DiscourseFinding[] = [];
  const name = (frame: DiscourseFrame) => `〈${frame.name}〉`;
  const weekOf = (item: SessionItem) => { const ms = postedAt(item); return ms === null ? -1 : 3 - Math.floor((now - ms) / WEEK_MS); };
  const weeksFor = (keys: Set<string> | null) => [0, 1, 2, 3].map((week) => rows.filter((row) => (!keys || (row.frameKey && keys.has(row.frameKey))) && weekOf(row.item) === week).length);
  const label = (week: number) => `${md(now - (3 - week) * WEEK_MS - 6 * 24 * 3600_000)} 週`;

  // 走勢: a 講法 first seen this week with 2+ posts, else one whose last 7 days are 2+ posts and 1.5× its earlier weekly average.
  const fresh = frames.filter((f) => f.isNew).sort((a, b) => b.posts.length - a.posts.length)[0];
  let trendText: string, trendFrame: DiscourseFrame | null = null;
  if (fresh) { trendFrame = fresh; trendText = `${name(fresh)}係新講法：最早 ${fresh.first}，${fresh.posts.length} 篇全部喺最近 7 日。`; }
  else {
    const rising = frames.map((f) => { const w = weeksFor(new Set([f.key])); return { f, recent: w[3], earlier: (w[0] + w[1] + w[2]) / 3 }; })
      .filter((x) => x.recent >= 2 && x.recent >= 1.5 * x.earlier).sort((a, b) => (b.recent - b.earlier) - (a.recent - a.earlier))[0];
    if (rising) { trendFrame = rising.f; trendText = `${name(rising.f)}升緊：最近 7 日 ${rising.recent} 篇，之前每星期平均 ${rising.earlier.toFixed(1)} 篇。`; }
    else { const all = weeksFor(null); trendText = `近 4 星期冇講法明顯升跌；全話題每星期 ${Math.min(...all)}–${Math.max(...all)} 篇。`; }
  }
  const weeks = weeksFor(trendFrame ? new Set([trendFrame.key]) : null);
  out.push({ kind: "trend", text: trendText, frameKey: trendFrame?.key ?? null, weeks: weeks.map((count, i) => ({ label: label(i), count, hot: !!trendFrame && i === 3 })) });

  // 共鳴: likes per post; only claimed when the top 講法 is 1.5× the others' average.
  const avgs = frames.map((f) => {
    const likes = f.posts.map((p) => p.likes).filter((n): n is number => n !== null);
    return { f, avg: likes.length ? likes.reduce((a, b) => a + b, 0) / likes.length : 0 };
  }).sort((a, b) => b.avg - a.avg);
  const top = avgs[0], others = avgs.slice(1).reduce((n, x) => n + x.avg, 0) / Math.max(1, avgs.length - 1);
  const claims = top.avg > 0 && others > 0 && top.avg >= 1.5 * others;
  const fewest = frames.every((f) => f === top.f || f.posts.length > top.f.posts.length);
  out.push({
    kind: "like",
    text: claims
      ? `${name(top.f)}${fewest ? `篇數最少（${top.f.posts.length} 篇），但` : ""}平均每篇 ${Math.round(top.avg)} 讚，係其他講法平均（${Math.round(others)}）嘅 ${(top.avg / others).toFixed(1)} 倍。`
      : `各講法平均讚數相近：${Math.round(avgs[avgs.length - 1].avg)}–${Math.round(top.avg)}。`,
    frameKey: claims ? top.f.key : null,
    rows: avgs.map((x) => ({ name: x.f.name, avg: Math.round(x.avg), hot: claims && x === top }))
  });

  // 重複問題: the same question (after trimming punctuation) asked under 2+ posts; a reply is not proof of an answer.
  const asked = new Map<string, { question: string; where: Map<string, { author: string; replied: boolean; postKey: string }> }>();
  for (const { item, post } of rows) {
    const comments = readCrawlComments(item);
    const op = readOpHandle(item);
    for (const c of comments) {
      if (normalizeHandle(c.author) === op || !QUESTION.test(c.text)) continue;
      const key = c.text.replace(/[\s？?！!。，,~～…]+/g, "").toLowerCase();
      if (key.length < 4) continue;
      const entry = asked.get(key) ?? { question: c.text.trim(), where: new Map() };
      const replied = comments.some((k) => k.parent === c.id);
      const prev = entry.where.get(post.postKey);
      entry.where.set(post.postKey, { author: post.author, replied: replied || !!prev?.replied, postKey: post.postKey });
      asked.set(key, entry);
    }
  }
  const repeated = [...asked.values()].filter((entry) => entry.where.size >= 2).sort((a, b) => b.where.size - a.where.size)[0];
  if (repeated) {
    const where = [...repeated.where.values()];
    const replied = where.filter((w) => w.replied).length;
    out.push({ kind: "ask", question: repeated.question, where,
      text: `「${repeated.question}」喺 ${where.length} 篇貼文都有人問，${replied ? `只有 ${replied} 篇有人回覆` : "樣本內都未見回覆"}。` });
  }
  return out;
}

/** 重複用語: a comment-cluster keyword that recurs under 2+ posts (TopicSynthesis.memes' rule). */
function buildMeme(items: SessionItem[]): { phrase: string; posts: number } | null {
  const counts = new Map<string, { phrase: string; posts: number }>();
  for (const item of items) {
    const seen = new Set<string>();
    for (const cluster of item.latestCapture?.analysis?.clusters ?? []) {
      for (const keyword of cluster.keywords ?? []) {
        const key = keyword.trim().toLowerCase();
        if (key.length < 2 || seen.has(key)) continue;
        seen.add(key);
        const entry = counts.get(key) ?? { phrase: keyword.trim(), posts: 0 };
        entry.posts += 1;
        counts.set(key, entry);
      }
    }
  }
  return [...counts.values()].filter((entry) => entry.posts >= 2).sort((a, b) => b.posts - a.posts || a.phrase.localeCompare(b.phrase))[0] ?? null;
}

/** The line on a 觀眾反應 card: pick a 話題, or where the post sits. */
export type CardTopicLine =
  | { kind: "unassigned"; signalId: string; picks: { id: string; name: string }[] }
  | { kind: "assigned"; topicId: string; topicName: string; frameName: string | null; count: number };
export function buildCardTopicLine(itemId: string, topics: Topic[], signals: Signal[], items: SessionItem[], readings?: Record<string, InlineReadingRecord>): CardTopicLine | null {
  const signal = signals.find((entry) => entry.itemId === itemId);
  if (!signal) return null;
  const sessionTopics = topics.filter((topic) => topic.sessionId === signal.sessionId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const topic = signal.topicId ? sessionTopics.find((entry) => entry.id === signal.topicId) : null;
  if (!topic) return { kind: "unassigned", signalId: signal.id, picks: sessionTopics.slice(0, 3).map((t) => ({ id: t.id, name: t.name })) };
  const item = items.find((entry) => entry.id === itemId);
  const count = signals.filter((entry) => entry.topicId === topic.id && items.some((i) => i.id === entry.itemId)).length;
  const frame = item && count >= DISCOURSE_MIN_POSTS ? frameOf(item, readings?.[itemId]) : null;
  return { kind: "assigned", topicId: topic.id, topicName: topic.name, frameName: frame?.name ?? null, count };
}
