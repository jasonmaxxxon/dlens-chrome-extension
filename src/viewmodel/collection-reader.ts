import type { SessionRecord, Signal, Topic } from "../state/types";
import type { InlineReadingRecord } from "../compare/inline-reading-storage";
import { INLINE_READING_PROMPT_VERSION } from "../compare/inline-reading";
import type { CollectionPost } from "./collection-browser";
import { buildInlineCardViewModel, buildInlineCardEvidence, type InlineCardEntryKey } from "./inline-card";

export function collectionAudienceSource(post: CollectionPost | undefined, sessions: SessionRecord[]) {
  const membership = post?.memberships.find(m => m.mode === "topic");
  const session = sessions.find(s => s.id === membership?.sessionId);
  const item = session?.items.find(i => i.id === membership?.itemId);
  return session && item ? { session, item } : null;
}

/** A finished crawl with no stored reading, or one from an older prompt, should be (re)generated when its reader opens.
 * A stored error is left alone; the reader shows it with its own retry. */
export function readerNeedsReading(item: SessionRecord["items"][number], stored: InlineReadingRecord | undefined): boolean {
  if (item.status !== "succeeded" || item.latestCapture?.analysis?.status !== "succeeded") return false;
  return !stored || stored.captureId !== item.latestCapture?.id || (stored.status === "complete" && stored.reading.promptVersion !== INLINE_READING_PROMPT_VERSION);
}

/** Projection only: the reading and evidence remain owned by inline-card. */
export function buildCollectionReaderModel(post: CollectionPost, sessions: SessionRecord[], topics: Topic[], signals: Signal[], readings: Record<string, InlineReadingRecord>, now: number, lens: InlineCardEntryKey | null = null, groupLimits: Record<string, number> = {}) {
  const source = collectionAudienceSource(post, sessions);
  if (!source) return null;
  const { session, item } = source;
  const stored = readings[item.id];
  // An older prompt's reading stays on screen while the reader asks for a fresh one (readerNeedsReading).
  const ai = stored ?? null;
  const card = buildInlineCardViewModel(item, "topic", session.name, { ai, now, forReader:true, queue: sessions.flatMap(s => s.items) });
  const selected = card.entries.find(e => e.key === lens)?.key ?? card.entries[0]?.key ?? null;
  const ownTopics = topics.filter(t => t.sessionId === session.id);
  const liveSignals = signals.filter(s => s.sessionId === session.id && session.items.some(i => i.id === s.itemId));
  const signal = liveSignals.find(s => s.itemId === item.id);
  const current = ownTopics.some(t => t.id === signal?.topicId) ? signal!.topicId : null;
  const chips = [{ id: null, name: "未分流", count: liveSignals.filter(s => !ownTopics.some(t => t.id === s.topicId)).length, selected: !current },
    ...ownTopics.map(t => ({ id: t.id, name: t.name, count: liveSignals.filter(s => s.topicId === t.id).length, selected: current === t.id }))];
  let stateLine = card.phase === "failed" ? `抓取失敗：${card.error}` : card.phase === "saved" ? "未抓取留言" : card.countLabel ?? "已抓取";
  if (card.phase === "running" || card.phase === "queued") {
    const left = card.eta ? card.eta.seconds - Math.floor((now - Date.parse(card.eta.from)) / 1000) : null;
    const eta = left === null ? "" : !Number.isFinite(left) || left < 0 ? " · 比平常久" : ` · 約 ${left < 60 ? `${left} 秒` : `${Math.floor(left / 60)} 分 ${String(left % 60).padStart(2, "0")} 秒`}`;
    stateLine = `${card.phase === "running" ? "抓取中" : `排隊${card.eta?.ahead ? ` · 前面 ${card.eta.ahead} 篇` : ""}`}${eta}`;
  }
  if (card.analysisPending) stateLine += " · 分群整理中";
  else if (card.ai?.state === "running") stateLine += " · AI 整理中";
  // A finished reading's count already sits in the source meta (讀咗 N); repeating it here was noise.
  else if (card.phase === "done") stateLine = "";
  const aiNote = card.ai?.state === "failed" ? `AI 整理失敗：${card.ai.error}`
    : card.entries.length && !card.ai && !card.analysisPending ? "尚未有已存 AI 閱讀 · 字詞同回覆" : null;
  return { sessionId: session.id, sessionName: session.name, signalId: signal?.id ?? null, chips, card, selected,
    answer: selected ? card.answers[selected] : undefined, stateLine, aiNote,
    evidence: buildInlineCardEvidence(item, card, selected, ai, groupLimits) };
}
export type CollectionReaderModel = NonNullable<ReturnType<typeof buildCollectionReaderModel>>;

/** Audience membership has priority; otherwise product, never changes domain context. */
export function collectionReadingSource(post: CollectionPost | undefined, sessions: SessionRecord[]) {
 const audience=collectionAudienceSource(post,sessions); if (audience) return audience;
 const m=post?.memberships.find(m=>m.mode==='product');
 const session=sessions.find(s=>s.id===m?.sessionId), item=session?.items.find(i=>i.id===m?.itemId);
 return session && item ? {session,item} : null;
}
export function resolveCollectionReaderOpen(posts: CollectionPost[], itemId: string, lens?: string) {
 const post=posts.find(p=>p.memberships.some(m=>m.itemId===itemId));
 return post ? {key:post.key,lens:lens ?? null} : null;
}
export function expandReaderEvidenceGroup(limits: Record<string,number>, key:string) { return {...limits,[key]:13}; }
