/**
 * Product Action card presentation ViewModel — pure, boundary-safe.
 *
 * Maps one completed `ProductSignalAnalysis` plus its grounded citations and
 * captured source text to the three-axis card model (verdict density, product
 * category, evidence-shaped hero). No chrome / DOM / React / fetch / Date /
 * Math.random — heroes are described as data; the View renders them.
 *
 * Grounding is the whole point: a hero exists only when its evidence is
 * verifiable from captured data, never from a model field's mere presence.
 * When nothing qualifies, the hero is `editorial` — that is a correct result.
 */
import type { ProductSignalAnalysis } from "../state/types.ts";
import { PRODUCT_SIGNAL_ROOT_REF } from "../compare/product-signal-analysis.ts";

export type ProductPrimaryCategory = "lift" | "need" | "rival" | "market" | "learn";
export type ProductHeroKind = "resource" | "quote" | "tally" | "editorial";
export type ResourceVerification = "captured" | "resolved-unverified" | "verified";

/** A citation carrying the REAL captured reply/post span (never a model summary). */
export interface ProductCardCitation {
  ref: string;
  text: string | null;
  author?: string | null;
  likeCount?: number | null;
}

export interface ProductCardTally {
  total: number;
  attributed: number;
  rows: Array<{ label: string; count: number; refs: string[] }>;
}

/** Explicit ref for the root post span, so a URL grounded in the root post still
 *  carries a non-null `sourceRef`. Aliases the analyzer's single source of truth. */
export const ROOT_SPAN_REF = PRODUCT_SIGNAL_ROOT_REF;

/** A captured span (root post or a reply) with its ref, used to ground resource URLs. */
export interface CapturedSpan {
  ref: string;
  text: string;
}

export interface ProductCardInput {
  analysis: ProductSignalAnalysis;
  /** Citations built from captured reply evidence (e.g. `citationsForAnalysis`). */
  citations: ProductCardCitation[];
  /** Captured spans (root post first with `ROOT_SPAN_REF`, then replies) for URL grounding. */
  capturedSpans: CapturedSpan[];
  /** Structured tally, only present once the analyzer supplies backing refs (W2). */
  tally?: ProductCardTally | null;
}

export interface ResourceHeroPayload {
  url: string;
  sourceRef: string;
  verification: ResourceVerification;
}
export interface QuoteHeroPayload {
  text: string;
  ref: string;
  author: string | null;
}
export type TallyHeroPayload = ProductCardTally;

export interface ProductHeroResult {
  heroKind: ProductHeroKind;
  heroPayload: ResourceHeroPayload | QuoteHeroPayload | TallyHeroPayload | null;
}

export interface ProductCardPresentation extends ProductHeroResult {
  primaryCategory: ProductPrimaryCategory | null;
  secondaryTags: ProductPrimaryCategory[];
  density: "full" | "compact";
  briefEligible: boolean;
  agentBriefReady: boolean;
}

/* ── category: deterministic mapping over EXISTING analyzer fields ── */
const CATEGORY_PRIORITY: ProductPrimaryCategory[] = ["lift", "need", "rival", "market", "learn"];

function categoryMatches(cat: ProductPrimaryCategory, a: ProductSignalAnalysis): boolean {
  switch (cat) {
    case "lift":
      return a.signalType === "technical"
        || a.referenceType === "technical_learning"
        || a.referenceType === "workflow_pattern"
        || a.referenceType === "product_reference";
    case "need":
      return a.signalType === "demand";
    case "rival":
      return a.signalType === "competitor";
    case "market":
      return a.signalType === "marketing" || a.referenceType === "market_language";
    case "learn":
      return a.signalType === "learning"
        || a.referenceType === "general_learning"
        || a.referenceType === "no_direct_fit";
  }
}

export function derivePrimaryCategory(analysis: ProductSignalAnalysis): {
  primary: ProductPrimaryCategory | null;
  secondary: ProductPrimaryCategory[];
} {
  if (analysis.signalType === "noise") return { primary: null, secondary: [] };
  const matched = CATEGORY_PRIORITY.filter((cat) => categoryMatches(cat, analysis));
  const primary = matched[0] ?? "learn";
  const secondary = matched.filter((cat) => cat !== primary).slice(0, 2);
  return { primary, secondary };
}

/* ── resource grounding: URL must be verbatim in captured text ── */
const URL_RE =
  /(https?:\/\/[^\s)]+)|((?:[a-z0-9-]+\.)+(?:com|io|dev|ai|net|org|app|co|xyz|sh|gg|me|so|tools)(?:\/[^\s)]*)?)/i;

/** Low-level: first URL-looking token in a single string, or null. */
export function extractCapturedUrl(capturedText: string): string | null {
  if (!capturedText) return null;
  const match = capturedText.match(URL_RE);
  return match ? match[0].replace(/[.,!?;:。！？，、；：”’」』）》】〉》"']+$/u, "") || null : null;
}

/** Span-level: first captured span carrying a URL, with the owning span's ref. */
export function findCapturedUrl(spans: CapturedSpan[]): { url: string; sourceRef: string } | null {
  for (const span of spans) {
    if (span.ref.trim().length === 0) continue;
    const url = extractCapturedUrl(span.text);
    if (url) return { url, sourceRef: span.ref };
  }
  return null;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * A tally is only real when every row is traceable: each count equals the number
 * of distinct captured replies backing it, refs resolve to captured replies, the
 * distinct union of all refs equals `attributed`, and `attributed ≤ total`.
 */
function isValidTally(tally: ProductCardTally | null | undefined, replyRefSet: Set<string>): boolean {
  if (!tally) return false;
  if (!Array.isArray(tally.rows) || tally.rows.length < 3) return false;
  if (!isNonNegativeInteger(tally.total) || !isNonNegativeInteger(tally.attributed)) return false;
  if (tally.attributed > tally.total) return false;

  const union = new Set<string>();
  for (const row of tally.rows) {
    if (typeof row.label !== "string" || row.label.trim().length === 0) return false;
    if (!isNonNegativeInteger(row.count)) return false;
    if (!Array.isArray(row.refs) || row.refs.length === 0) return false;
    const uniqueRefs = new Set(row.refs);
    if (uniqueRefs.size !== row.refs.length) return false;   // no duplicate refs within a row
    if (row.count !== uniqueRefs.size) return false;         // count is the traceable reply count
    for (const ref of uniqueRefs) {
      if (!replyRefSet.has(ref)) return false;               // every ref resolves to a captured reply
      union.add(ref);
    }
  }
  return union.size === tally.attributed;                    // attributed is the distinct union
}

export function resolveProductHero(input: ProductCardInput): ProductHeroResult {
  const found = findCapturedUrl(input.capturedSpans);
  if (found) {
    return { heroKind: "resource", heroPayload: { url: found.url, sourceRef: found.sourceRef, verification: "captured" } };
  }

  // A valid structured tally is the point of a survey post, so it outranks a
  // single reply quote (such posts always have replies that would otherwise win).
  const replyRefSet = new Set(
    input.capturedSpans
      .filter((span) => span.ref !== ROOT_SPAN_REF && span.ref.trim().length > 0 && span.text.trim().length > 0)
      .map((span) => span.ref)
  );
  if (isValidTally(input.tally, replyRefSet)) {
    return { heroKind: "tally", heroPayload: input.tally! };
  }

  const quoted = input.citations.find((c) => typeof c.text === "string" && c.text.trim().length > 0);
  if (quoted) {
    return { heroKind: "quote", heroPayload: { text: quoted.text!.trim(), ref: quoted.ref, author: quoted.author ?? null } };
  }

  return { heroKind: "editorial", heroPayload: null };
}

/* ── composite membership → density; brief eligibility ── */
function densityFor(analysis: ProductSignalAnalysis): "full" | "compact" {
  // Noise belongs to the excluded bucket regardless of any inconsistent verdict
  // field, so it is always compact.
  if (analysis.signalType === "noise") return "compact";
  return analysis.verdict === "park" || analysis.verdict === "insufficient_data" ? "compact" : "full";
}

function briefEligibleFor(analysis: ProductSignalAnalysis): boolean {
  return (analysis.verdict === "try" || analysis.verdict === "watch") && analysis.signalType !== "noise";
}

function agentBriefReadyFor(analysis: ProductSignalAnalysis): boolean {
  return Boolean(analysis.agentTaskSpec && analysis.agentTaskSpec.taskPrompt.trim().length > 0);
}

export function deriveProductCardPresentation(input: ProductCardInput): ProductCardPresentation {
  const { primary, secondary } = derivePrimaryCategory(input.analysis);
  const hero = resolveProductHero(input);
  return {
    primaryCategory: primary,
    secondaryTags: secondary,
    ...hero,
    density: densityFor(input.analysis),
    briefEligible: briefEligibleFor(input.analysis),
    agentBriefReady: agentBriefReadyFor(input.analysis)
  };
}

/* ─── Reading body segmentation ─── */

export type ProductReadingSegmentKind =
  | "intro"
  | "evidence"
  | "inference"
  | "uncertainty"
  | "external"
  | "recommendation";

export interface ProductReadingSegment {
  key: string;
  kind: ProductReadingSegmentKind;
  label: string;
  text: string;
}

const READING_SEGMENT_LABELS: ReadonlyArray<[string, ProductReadingSegmentKind]> = [
  ["證據", "evidence"],
  ["推論", "inference"],
  ["不確定性", "uncertainty"],
  ["外部內容", "external"],
  ["建議", "recommendation"]
];

const READING_SEGMENT_PATTERN = /(證據|推論|不確定性|外部內容|建議)\s*[:：]\s*/g;

/**
 * Split a `product_reading.body` into its labelled parts.
 *
 * The analyzer prompt asks for evidence / inference / uncertainty / next step,
 * and the model complies — but as one run-on paragraph with inline "證據：" style
 * labels, which reads as a wall of text. Splitting here (rather than changing the
 * contract to four fields) keeps every stored reading readable, including the ones
 * generated before this change. Returns `[]` when the prose carries fewer than two
 * labels, so unlabelled bodies stay a single paragraph instead of being mangled.
 */
export function segmentProductReadingBody(body: string): ProductReadingSegment[] {
  const source = body.trim();
  if (!source) return [];

  READING_SEGMENT_PATTERN.lastIndex = 0;
  const marks: { kind: ProductReadingSegmentKind; label: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = READING_SEGMENT_PATTERN.exec(source)) !== null) {
    const label = match[1]!;
    const kind = READING_SEGMENT_LABELS.find(([name]) => name === label)?.[1];
    if (!kind) continue;
    marks.push({ kind, label, start: match.index, end: match.index + match[0].length });
  }
  if (marks.length < 2) return [];

  const segments: ProductReadingSegment[] = [];
  const introSource = source.slice(0, marks[0]!.start).trim();
  if (introSource) {
    const labelledIntro = /^(總結|結論)\s*[:：]\s*(.+)$/s.exec(introSource);
    segments.push({
      key: "intro:0",
      kind: "intro",
      label: labelledIntro?.[1] ?? "概覽",
      text: (labelledIntro?.[2] ?? introSource).trim()
    });
  }
  marks.forEach((mark, index) => {
    const text = source.slice(mark.end, marks[index + 1]?.start ?? source.length).trim();
    if (text) {
      segments.push({
        key: `${mark.kind}:${mark.start}`,
        kind: mark.kind,
        label: mark.label,
        text
      });
    }
  });
  return segments;
}
