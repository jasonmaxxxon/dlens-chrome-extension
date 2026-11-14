import type { SessionItem } from "../state/types";
import type { InlineReading } from "../compare/inline-reading";
import { readCommentEligibility } from "../compare/comment-eligibility";
import { readClusterReadings } from "../compare/cluster-reading";
import { blockEvidenceHref, type AnalysisBlocksModel, type EntityRow, type QaPerson, type QaStatus } from "./analysis-blocks";

export interface WheelSector {
  key: string; rank: number; count: number; share: number; likeShare: number;
  aiName: string | null; quote: string; topId: string | null; noise: number;
  /** Null when membership or any member's captured like count is incomplete. */
  likeTotal: number | null;
}
export interface WheelComment {
  id: string; author: string; text: string; likes: number; replies: number;
  replyTo: string | null; parentId: string | null; parentContext: string | null; sector: string | null; isOp: boolean;
  noiseFlag: string | null; href: string | null; qa: QaStatus | null;
}
export type WheelObservation =
  | { key: "split"; ai: true; agree: string; sides: { claim: string; why: string; refs: string[] }[] }
  /** `loud` names the most liked topic only when it is not the most discussed one. */
  | { key: "topic"; ai: boolean; loud: string | null }
  | { key: "how"; ai: true; methods: { name: string; fit: string; refs: string[] }[] }
  | { key: "link"; ai: false; entities: EntityRow[]; refs: string[] }
  | { key: "qa"; ai: false; total: number; unanswered: number; unseen: number;
      /** Post questions have no comment id; retain their source data without inventing a comment. */
      items: { id: string | null; question: QaPerson; status: QaStatus; answers: string[] }[] };
export interface ReaderWheelModel {
  sectors: WheelSector[]; comments: Record<string, WheelComment>; audience: string[];
  /** Only comparable complete clusters establish denominators for this captured audience. */
  totals: { comments: number; likes: number | null } | null;
  /** The AI gist sums up the other observations, so it heads them instead of sitting beside them with its own evidence. */
  headline: { text: string; grounded: boolean } | null;
  observations: WheelObservation[];
  /** The observation this kind of post is read for first. A succeeded capture may have neither sectors nor usable blocks. */
  initial: WheelObservation["key"] | null;
  postType: AnalysisBlocksModel["postType"];
  /** Whether any AI-written text is present; `withoutAi` clears it. */
  ai: boolean;
  entityRefs: Record<string, string[]>;
  raw: { links: EntityRow[] | null; op: string[]; noise: string[] };
  coverage: { got: number; replies: number } | null;
}

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const text = (v: unknown): string => typeof v === "string" ? v.trim() : "";
const nonnegative = (v: unknown): number => typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
const unique = (ids: string[]): string[] => [...new Set(ids)];

/** Pure projection. All refs are canonical eligibility ids, including source-id aliases. */
export function buildReaderWheel(item: SessionItem | null | undefined, reading: InlineReading | null, blocks: AnalysisBlocksModel): ReaderWheelModel | null {
  const analysis = item?.latestCapture?.analysis, captured = item?.latestCapture?.result?.comments;
  if (!item || analysis?.status !== "succeeded" || !captured?.length) return null;
  const eligibility = readCommentEligibility(item);
  const resolve = (value: unknown): string | null => eligibility.byId.get(text(value))?.id ?? null;
  const resolveIds = (values: unknown[]): string[] => unique(values.flatMap(value => resolve(value) ?? []));
  const audience = [...eligibility.audience].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).map(c => c.id);
  const audienceSet = new Set(audience);
  const comments: Record<string, WheelComment> = Object.fromEntries(eligibility.all.map(c => [c.id, {
    id: c.id, author: c.author, text: c.text, likes: nonnegative(c.likes), replies: nonnegative(c.replies),
    replyTo: c.parent ? eligibility.byId.get(c.parent)?.author || null : null,
    parentId: c.parent ? eligibility.byId.get(c.parent)?.id ?? null : null,
    parentContext: c.parent ? eligibility.byId.get(c.parent)?.text.slice(0, 44) || null : null,
    sector: null, isOp: !!eligibility.op && c.author === eligibility.op, noiseFlag: null,
    href: c.permalink ?? blockEvidenceHref({ comment_id: c.sourceId || c.id, author: c.author }, item), qa: null,
  }]));
  // AnalysisBlocksModel intentionally discards membership metadata and raw backend labels.
  // Only these missing fields are read here; QA and entity content use the existing projection.
  const rawBlocks = analysis.blocks ?? [];
  for (const block of rawBlocks) if (block.type === "noise_summary") for (const value of list(block.items)) {
    const row = object(value), flag = text(row.flag);
    if (flag) for (const id of resolveIds(list(row.comment_ids))) if (audienceSet.has(id)) comments[id].noiseFlag = flag;
  }
  const opinions = rawBlocks.filter(b => b.type === "opinion_overview").flatMap(b => list(b.items).map(object));
  const clusters = [...analysis.clusters].sort((a, b) => nonnegative(b.size_share) - nonnegative(a.size_share));
  const clusterReadings = readClusterReadings(item);
  const membership = new Map(clusterReadings.map(cluster => [cluster.clusterKey, cluster.membership === "complete"]));
  const totals = clusterReadings.length > 0 && clusterReadings.every(cluster => cluster.pct !== undefined)
    ? { comments: eligibility.audience.length, likes: eligibility.audience.reduce<number | null>((sum, comment) =>
      sum !== null && typeof comment.likes === "number" && Number.isFinite(comment.likes) && comment.likes >= 0 ? sum + comment.likes : null, 0) }
    : null;
  const totalShare = clusters.reduce((n, c) => n + nonnegative(c.size_share), 0);
  // First sector wins if malformed membership repeats an identity across clusters.
  for (const cluster of clusters) for (const id of resolveIds(cluster.member_comment_ids ?? [])) {
    comments[id].sector ??= String(cluster.cluster_key);
  }
  const sectors: WheelSector[] = clusters.map((cluster, rank) => {
    const key = String(cluster.cluster_key), members = audience.filter(id => comments[id].sector === key);
    const topId = members[0] ?? null;
    const opinion = opinions.find(row => String(row.cluster_key) === key);
    const count = cluster.comment_count ?? members.length;
    const complete = membership.get(cluster.cluster_key) === true && count === members.length;
    const likesKnown = members.every(id => {
      const likes = eligibility.byId.get(id)?.likes;
      return typeof likes === "number" && Number.isFinite(likes) && likes >= 0;
    });
    return { key, rank, count, likeTotal: complete && likesKnown ? members.reduce((n, id) => n + comments[id].likes, 0) : null,
      share: totalShare > 0 ? nonnegative(cluster.size_share) / totalShare : 1 / clusters.length,
      likeShare: nonnegative(cluster.like_share), aiName: text(reading?.clusterNames[key]) || null,
      quote: text(opinion?.label) || (topId ? comments[topId].text.slice(0, 24) : ""), topId,
      noise: typeof opinion?.noise_count === "number" ? nonnegative(opinion.noise_count) : members.filter(id => comments[id].noiseFlag).length };
  });
  const gist = text(reading?.gist);
  const headline = gist ? { text: gist, grounded: resolveIds(reading?.gistRefs ?? []).length > 0 } : null;
  const observations: WheelObservation[] = [];
  const sides = reading?.split.sides.flatMap(side => {
    const refs = resolveIds([side.quote.commentId, ...(side.refs ?? [])]);
    return refs.length ? [{ claim: side.claim, why: side.why, refs }] : [];
  }) ?? [];
  if (sides.length >= 2) observations.push({ key: "split", ai: true, agree: reading!.split.agree, sides });
  if (sectors.length) {
    const loud = sectors.reduce((a, b) => b.likeShare > a.likeShare ? b : a);
    observations.push({ key: "topic", ai: sectors.some(s => s.aiName !== null), loud: loud.key !== sectors[0].key ? loud.key : null });
  }
  const methods = reading?.methods.flatMap(method => {
    const refs = resolveIds([method.quote.commentId, ...(method.refs ?? [])]);
    return refs.length ? [{ name: method.name, fit: method.fit, refs }] : [];
  }) ?? [];
  if (methods.length) observations.push({ key: "how", ai: true, methods });
  const entities = blocks.blocks.flatMap(b => b.type === "entity_list" ? b.items : []);
  // A captured repo is substantive even before optional enrichment succeeds.
  const linkObservation = entities.length > 1 || entities.some(e => e.mentions > 1 || e.github || e.repo !== null);
  const entityRefs = Object.fromEntries(entities.map(e => [e.key, resolveIds([...e.evidence.map(r => r.commentId), ...e.extra.map(r => r.commentId), ...(e.link ? [e.link.commentId] : [])])]));
  const rawEntities = rawBlocks.filter(b => b.type === "entity_list").flatMap(b => list(b.items).map(object));
  if (linkObservation) observations.push({ key: "link", ai: false, entities,
    refs: resolveIds(entities.flatMap(e => {
      const raw = rawEntities.find(row => (text(row.key) || text(row.url)) === e.key);
      return [...e.evidence.map(r => r.commentId), ...(e.link ? [e.link.commentId] : []), ...list(raw?.comment_ids)];
    })) });
  const questions = blocks.blocks.flatMap(b => b.type === "qa_pairs" ? b.items : []);
  if (questions.length) {
    const items = questions.map(q => {
      const id = resolve(q.question.commentId);
      if (id) comments[id].qa = q.status;
      return { id, question: q.question, status: q.status, answers: resolveIds(q.answers.map(a => a.commentId)) };
    });
    observations.push({ key: "qa", ai: false, total: items.length,
      unanswered: items.filter(q => q.status === "unanswered").length,
      unseen: items.filter(q => q.status === "replies_not_captured").length, items });
  }
  const has = (key: WheelObservation["key"]) => observations.some(o => o.key === key);
  const preferred = blocks.postType === "help" ? "qa" : blocks.postType === "resource" ? has("link") ? "link" : "how" : "topic";
  const replies = item.descriptor.engagement?.comments;
  return { sectors, comments, audience, totals, headline, observations, postType: blocks.postType, ai: !!headline || observations.some(o => o.ai),
    initial: has(preferred) ? preferred : has("topic") ? "topic" : observations[0]?.key ?? null,
    entityRefs, raw: { links: !linkObservation && entities.length ? entities : null,
      op: [...eligibility.authorReplies].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).map(c => c.id),
      noise: audience.filter(id => comments[id].noiseFlag !== null) },
    coverage: typeof replies === "number" && Number.isFinite(replies) && replies > 0 ? { got: captured.length, replies } : null };
}

export interface WheelPoint { x: number; y: number }
export interface WheelGeometryOptions { cx: number; cy: number; r0: number; rmin: number; rmax: number; pad?: number }
export interface WheelSectorGeometry {
  key: string; d: string; startAngle: number; endAngle: number; midAngle: number; outerRadius: number;
  label: WheelPoint | null;
}
/** rose.js maths, without presentation state. Degrees run clockwise from twelve o'clock. */
export function wheelGeometry(sectors: readonly WheelSector[], { cx, cy, r0, rmin, rmax, pad = 2.2 }: WheelGeometryOptions): WheelSectorGeometry[] {
  const maxLikeShare = Math.max(...sectors.map(s => nonnegative(s.likeShare)), 1e-6);
  const point = (radius: number, degrees: number): WheelPoint => {
    const radians = (degrees - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
  };
  const coords = (p: WheelPoint) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  let at = 0;
  return sectors.map(s => {
    const span = nonnegative(s.share) * 360, padding = Math.min(nonnegative(pad), span / 4);
    const startAngle = at + padding, endAngle = (at += span) - padding, midAngle = (startAngle + endAngle) / 2;
    const outerRadius = rmin + (rmax - rmin) * Math.sqrt(nonnegative(s.likeShare) / maxLikeShare);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    const p0 = point(r0, startAngle), p1 = point(outerRadius, startAngle), p2 = point(outerRadius, endAngle), p3 = point(r0, endAngle);
    return { key: s.key, startAngle, endAngle, midAngle, outerRadius,
      d: `M${coords(p0)}L${coords(p1)}A${outerRadius} ${outerRadius} 0 ${large} 1 ${coords(p2)}L${coords(p3)}A${r0} ${r0} 0 ${large} 0 ${coords(p0)}Z`,
      label: span >= 30 ? point((r0 + outerRadius) / 2, midAngle) : null };
  });
}

export type ReaderTabKey = "overview" | "split" | "how" | "qa" | "link" | "raw";
export interface ReaderTab { key: ReaderTabKey; ai: boolean; count: number | null }
const TAB_OF = { topic: "overview", split: "split", how: "how", qa: "qa", link: "link" } as const;
/** An entry exists only for content that exists. The entry this kind of post is read for leads; the comments always close. */
export function readerTabs(model: ReaderWheelModel): ReaderTab[] {
  const tabs: ReaderTab[] = model.observations.map(o => ({ key: TAB_OF[o.key], ai: o.key === "split" || o.key === "how",
    count: o.key === "how" ? o.methods.length : o.key === "qa" ? o.total : o.key === "link" ? o.entities.length : null }));
  const order: ReaderTabKey[] = ["overview", "split", "how", "qa", "link"], lead = model.initial ? TAB_OF[model.initial] : null;
  tabs.sort((a, b) => Number(b.key === lead) - Number(a.key === lead) || order.indexOf(a.key) - order.indexOf(b.key));
  return [...tabs, { key: "raw", ai: false, count: model.audience.length }];
}

/** 純統計: the same captured counts with every AI-written part taken out. */
export function withoutAi(model: ReaderWheelModel): ReaderWheelModel {
  const observations = model.observations.filter(o => o.key !== "split" && o.key !== "how").map(o => o.key === "topic" ? { ...o, ai: false } : o);
  const has = (key: WheelObservation["key"] | null) => observations.some(o => o.key === key);
  return { ...model, ai: false, headline: null, sectors: model.sectors.map(s => ({ ...s, aiName: null })), observations,
    initial: has(model.initial) ? model.initial : has("topic") ? "topic" : observations[0]?.key ?? null };
}

/** 概覽: one counted finding, the topic it is about, and the topic in focus. */
export function readerOverview(model: ReaderWheelModel, selected: string | null) {
  const big = model.sectors[0];
  if (!big) return null;
  const loud = model.sectors.reduce((a, b) => b.likeShare > a.likeShare ? b : a);
  const state = model.sectors.length < 2 ? "single" as const : loud.key !== big.key ? "apart" as const : "same" as const;
  const subject = state === "apart" ? loud : big, sector = model.sectors.find(s => s.key === selected) ?? subject;
  const members = model.audience.filter(id => model.comments[id].sector === sector.key);
  // A like percentage is printed only where the numerator and the denominator were both captured in full.
  const likeShare = (s: WheelSector) => s.likeTotal !== null && model.totals?.likes ? s.likeTotal / model.totals.likes : null;
  return { state, subject, sector, members, subjectLikes: likeShare(subject), likes: likeShare(sector),
    liked: state !== "single" && sector.key === loud.key, discussed: state !== "single" && sector.key === big.key };
}

export type ReaderRawKey = "all" | "op" | "noise" | "link" | `topic:${string}`;
/** 原文: every comment once, narrowed by topic, author replies, markers or links. An unknown filter falls back to all. */
export function readerRaw(model: ReaderWheelModel, wanted: ReaderRawKey) {
  const members = (key: string) => model.audience.filter(id => model.comments[id].sector === key);
  const linkRefs = unique((model.raw.links ?? []).flatMap(e => model.entityRefs[e.key] ?? []));
  const chips: { key: ReaderRawKey; n: number; sector: WheelSector | null }[] = [{ key: "all" as ReaderRawKey, n: model.audience.length, sector: null },
    ...(model.sectors.length > 1 ? model.sectors.map(s => ({ key: `topic:${s.key}` as ReaderRawKey, n: members(s.key).length, sector: s })) : []),
    { key: "op" as ReaderRawKey, n: model.raw.op.length, sector: null }, { key: "noise" as ReaderRawKey, n: model.raw.noise.length, sector: null },
    { key: "link" as ReaderRawKey, n: model.raw.links?.length ?? 0, sector: null }].filter(c => c.key === "all" || c.n > 0);
  const filter = chips.some(c => c.key === wanted) ? wanted : "all";
  const ids = filter === "all" ? model.audience : filter === "op" ? model.raw.op : filter === "noise" ? model.raw.noise : filter === "link" ? linkRefs : members(filter.slice(6));
  const top = Math.max(1, ...ids.map(id => model.comments[id]?.likes ?? 0));
  const parentSeen = new Set<string>(), parents: Record<string, string> = {};
  for (const id of model.raw.op) {
    const c = model.comments[id];
    if (c.parentId && c.parentContext && !model.raw.op.includes(c.parentId) && !parentSeen.has(c.parentId)) { parents[id] = c.parentContext; parentSeen.add(c.parentId); }
  }
  return { chips, filter, ids, parents, likeRatios: Object.fromEntries(ids.map(id => [id, (model.comments[id]?.likes ?? 0) / top])) };
}

export function wheelOffset(angle: number, shift: number): WheelPoint {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: Math.cos(radians) * shift, y: Math.sin(radians) * shift };
}

/** Descriptions may fall back to captured text in the blocks parser. Source rows own those words. */
export function wheelEntityDescription(model: ReaderWheelModel, row: EntityRow): string | null {
  const flat = (text: string) => text.replace(/\s+/g, " ").trim();
  return row.summary && !Object.values(model.comments).some(c => flat(c.text) === flat(row.summary)) ? row.summary : null;
}
