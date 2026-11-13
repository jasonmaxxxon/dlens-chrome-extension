import type { SessionItem } from "../state/types";
import type { InlineReading } from "../compare/inline-reading";
import { readCommentEligibility } from "../compare/comment-eligibility";
import { blockEvidenceHref, sortEntityRows, type AnalysisBlocksModel, type EntityRow, type QaPerson, type QaStatus } from "./analysis-blocks";

export interface WheelSector {
  key: string; rank: number; count: number; share: number; likeShare: number;
  aiName: string | null; quote: string; topId: string | null; noise: number;
}
export interface WheelComment {
  id: string; author: string; text: string; likes: number; replies: number;
  replyTo: string | null; parentId: string | null; parentContext: string | null; sector: string | null; isOp: boolean;
  noiseFlag: string | null; href: string | null; qa: QaStatus | null;
}
export type WheelObservation =
  | { key: "react"; ai: false; kind: "apart" | "same" | "single"; big: string; loud: string;
      rows: { sector: string; top: string | null }[]; loudTopLikeShare: number | null; aiGist: string }
  | { key: "split"; ai: true; agree: string; sides: { claim: string; why: string; refs: string[] }[] }
  | { key: "topic"; ai: boolean }
  | { key: "how"; ai: true; methods: { name: string; fit: string; refs: string[] }[] }
  | { key: "link"; ai: false; entities: EntityRow[]; refs: string[] }
  | { key: "qa"; ai: false; total: number; unanswered: number; unseen: number;
      /** Post questions have no comment id; retain their source data without inventing a comment. */
      items: { id: string | null; question: QaPerson; status: QaStatus; answers: string[] }[] };
export interface ReaderWheelModel {
  sectors: WheelSector[]; comments: Record<string, WheelComment>; audience: string[];
  observations: WheelObservation[];
  /** A succeeded capture may have neither sectors nor usable blocks. */
  initial: WheelObservation["key"] | null;
  entityRefs: Record<string, string[]>;
  raw: { links: EntityRow[] | null; op: string[]; noise: string[] };
  coverage: { got: number; replies: number } | null; likeTotal: number;
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
  const totalShare = clusters.reduce((n, c) => n + nonnegative(c.size_share), 0);
  // First sector wins if malformed membership repeats an identity across clusters.
  for (const cluster of clusters) for (const id of resolveIds(cluster.member_comment_ids ?? [])) {
    comments[id].sector ??= String(cluster.cluster_key);
  }
  const sectors: WheelSector[] = clusters.map((cluster, rank) => {
    const key = String(cluster.cluster_key), members = audience.filter(id => comments[id].sector === key);
    const topId = members[0] ?? null;
    const opinion = opinions.find(row => String(row.cluster_key) === key);
    return { key, rank, count: cluster.comment_count ?? members.length,
      share: totalShare > 0 ? nonnegative(cluster.size_share) / totalShare : 1 / clusters.length,
      likeShare: nonnegative(cluster.like_share), aiName: text(reading?.clusterNames[key]) || null,
      quote: text(opinion?.label) || (topId ? comments[topId].text.slice(0, 24) : ""), topId,
      noise: typeof opinion?.noise_count === "number" ? nonnegative(opinion.noise_count) : members.filter(id => comments[id].noiseFlag).length };
  });
  const likeTotal = audience.reduce((n, id) => n + comments[id].likes, 0);
  const observations: WheelObservation[] = [];
  if (sectors.length) {
    const big = sectors[0], loud = sectors.reduce((a, b) => b.likeShare > a.likeShare ? b : a);
    observations.push({ key: "react", ai: false, kind: sectors.length === 1 ? "single" : big.key === loud.key ? "same" : "apart",
      big: big.key, loud: loud.key, rows: sectors.map(s => ({ sector: s.key, top: s.topId })),
      loudTopLikeShare: loud.topId && likeTotal > 0 ? comments[loud.topId].likes / likeTotal : null, aiGist: reading?.gist ?? "" });
  }
  const sides = reading?.split.sides.flatMap(side => {
    const id = resolve(side.quote.commentId);
    return id ? [{ claim: side.claim, why: side.why, refs: [id] }] : [];
  }) ?? [];
  if (sides.length >= 2) observations.push({ key: "split", ai: true, agree: reading!.split.agree, sides });
  if (sectors.length) observations.push({ key: "topic", ai: sectors.some(s => s.aiName !== null) });
  const methods = reading?.methods.flatMap(method => {
    const id = resolve(method.quote.commentId);
    return id ? [{ name: method.name, fit: method.fit, refs: [id] }] : [];
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
  const preferred = blocks.postType === "help" ? "qa" : blocks.postType === "resource" ? has("link") ? "link" : "how" : "react";
  const replies = item.descriptor.engagement?.comments;
  return { sectors, comments, audience, observations, initial: has(preferred) ? preferred : observations[0]?.key ?? null,
    entityRefs, raw: { links: !linkObservation && entities.length ? entities : null,
      op: [...eligibility.authorReplies].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).map(c => c.id),
      noise: audience.filter(id => comments[id].noiseFlag !== null) },
    coverage: typeof replies === "number" && Number.isFinite(replies) && replies > 0 ? { got: captured.length, replies } : null, likeTotal };
}

/** Evidence order matches the pane: sector order for topics; question then answers for QA. */
export function observationRefs(model: ReaderWheelModel, key: WheelObservation["key"]): string[] {
  const observation = model.observations.find(o => o.key === key);
  if (!observation) return [];
  let refs: string[];
  switch (observation.key) {
    case "react": refs = observation.rows.flatMap(r => r.top ?? []); break;
    case "topic": refs = model.sectors.flatMap(s => model.audience.filter(id => model.comments[id].sector === s.key)); break;
    case "split": refs = observation.sides.flatMap(s => s.refs); break;
    case "how": refs = observation.methods.flatMap(m => m.refs); break;
    case "link": refs = observation.refs; break;
    case "qa": refs = observation.items.flatMap(q => [...(q.id ? [q.id] : []), ...q.answers]); break;
  }
  return unique(refs).filter(id => Object.hasOwn(model.comments, id));
}
export function dotsBySector(model: ReaderWheelModel, key: WheelObservation["key"]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const id of observationRefs(model, key)) {
    const sector = model.comments[id].sector;
    if (sector !== null) counts.set(sector, (counts.get(sector) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

export interface WheelPoint { x: number; y: number }
export interface WheelGeometryOptions { cx: number; cy: number; r0: number; rmin: number; rmax: number; pad?: number }
export interface WheelSectorGeometry {
  key: string; d: string; startAngle: number; endAngle: number; midAngle: number; outerRadius: number;
  label: WheelPoint | null;
  /** Count is clamped to seven; each call distributes its dots evenly inside this sector. */
  dots: (count: number) => WheelPoint[];
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
      label: span >= 30 ? point((r0 + outerRadius) / 2, midAngle) : null,
      dots: (count: number) => {
        const n = Math.min(7, Math.floor(nonnegative(count)));
        // Keep the prototype's inset, clamped for callers using a narrower annulus.
        const radius = Math.min((r0 + outerRadius) / 2 + (outerRadius - r0) / 2 * .9, Math.max(r0 + 12, outerRadius - 13));
        return Array.from({ length: n }, (_, i) => point(radius, startAngle + (endAngle - startAngle) * (i + 1) / (n + 1)));
      } };
  });
}

export type WheelRawKey = "all" | "link" | "op" | "noise";
/** UI selection projection: data filtering, ordering, counts and verdicts stay outside React. */
export function wheelSelection(model: ReaderWheelModel, key: WheelObservation["key"] | null, selected: string | null) {
  const observation = model.observations.find(o => o.key === key) ?? null;
  const sector = model.sectors.find(s => s.key === selected) ?? model.sectors[0] ?? null;
  const refs = key ? observationRefs(model, key) : [];
  const accepts = (id: string) => !selected || model.comments[id]?.sector === selected;
  const filtered = refs.filter(accepts);
  const topic = sector ? model.audience.filter(id => model.comments[id].sector === sector.key) : [];
  const groups = observation?.key === "split" ? observation.sides.map(s => ({ title: s.claim, detail: s.why, refs: s.refs.filter(accepts) }))
    : observation?.key === "how" ? observation.methods.map(m => ({ title: m.name, detail: m.fit, refs: m.refs.filter(accepts) })) : [];
  const react = observation?.key === "react" ? observation.rows.filter(r => !selected || r.sector === selected).map(r => ({ ...r, sector: model.sectors.find(s => s.key === r.sector)! })) : [];
  const questions = observation?.key === "qa" ? observation.items.filter(q => !selected || (q.id && accepts(q.id)) || q.answers.some(accepts)).map(q => ({ ...q, answers: q.answers.filter(accepts), showQuestion: !selected || !q.id || accepts(q.id) })) : [];
  const loud = observation?.key === "react" ? model.sectors.find(s => s.key === observation.loud) ?? null : null;
  const link = observation?.key === "link" ? sortEntityRows(observation.entities, "mentions")[0] : null;
  const parentSeen = new Set<string>();
  const parents: Record<string, string> = {};
  for (const id of model.raw.op) {
    const c = model.comments[id];
    if (c.parentId && c.parentContext && !model.raw.op.includes(c.parentId) && !parentSeen.has(c.parentId)) {
      parents[id] = c.parentContext; parentSeen.add(c.parentId);
    }
  }
  return { observation, sector, refs: filtered, topic, groups, react, questions, loud, link,
    spread: new Set(filtered.map(id => model.comments[id].sector).filter(s => s !== null)).size > 1,
    questionCount: questions.length,
    dots: key ? dotsBySector(model, key) : {},
    verdict: sector ? sector.likeShare > sector.share * 1.25 ? "more" : sector.likeShare < sector.share * .6 ? "less" : "same" : "same",
    raw: { all: model.audience, op: model.raw.op, noise: model.raw.noise },
    rawChips: ([{ key: "all", n: model.audience.length }, { key: "link", n: model.raw.links?.length ?? 0 }, { key: "op", n: model.raw.op.length }, { key: "noise", n: model.raw.noise.length }] as { key: WheelRawKey; n: number }[]).filter(r => r.key === "all" || r.n > 0),
    rawLinkRefs: unique((model.raw.links ?? []).flatMap(e => model.entityRefs[e.key] ?? [])),
    likeRatios: Object.fromEntries(model.audience.map(id => [id, model.comments[id].likes / Math.max(1, model.comments[model.audience[0]]?.likes ?? 0)])),
    parents,
    coverage: model.coverage ? Math.min(1, model.coverage.got / model.coverage.replies) : null,
  };
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
