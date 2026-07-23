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
import {
  PRODUCT_CONTEXT_FIELDS,
  type ProductContextField,
  type ProductSignalAnalysis
} from "../state/types.ts";
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

export type ProductCardRecommendation =
  | {
      kind: "experiment";
      text: string;
      support: "analysis";
      sourceRef: null;
    }
  | {
      kind: "pattern";
      text: string;
      support: "text_grounded";
      sourceRef: string;
    }
  | {
      kind: "application";
      support: "text_grounded";
      sourcePattern: string;
      fitReason: string;
      smallTest: string;
      sourceRefs: string[];
      productContextTarget: ProductContextField;
      verificationQuestion: string;
    };

export type ProductCardRecommendationKind = ProductCardRecommendation["kind"];
export type ProductCardRecommendationSupport = ProductCardRecommendation["support"];

/** Honest strength of the rendered recommendation rows: a grounded application
 *  ("try this"), a borrowable inspiration (experiment/pattern fallback), or none. */
export type ProductRecommendationTier = "application" | "inspiration" | "none";

function recommendationTierFor(
  recommendations: ProductCardRecommendation[]
): ProductRecommendationTier {
  if (recommendations.some((row) => row.kind === "application")) return "application";
  if (recommendations.length > 0) return "inspiration";
  return "none";
}

export interface ProductCardPresentation extends ProductHeroResult {
  primaryCategory: ProductPrimaryCategory | null;
  secondaryTags: ProductPrimaryCategory[];
  density: "full" | "compact";
  recommendations: ProductCardRecommendation[];
  recommendationTier: ProductRecommendationTier;
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

function normalizeRecommendationText(text: string): string {
  return text.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

function deriveFallbackRecommendations(input: ProductCardInput): ProductCardRecommendation[] {
  const recommendations: ProductCardRecommendation[] = [];
  const seenTexts = new Set<string>();
  const add = (recommendation: Extract<ProductCardRecommendation, { kind: "experiment" | "pattern" }>) => {
    const normalized = normalizeRecommendationText(recommendation.text);
    if (!normalized || seenTexts.has(normalized) || recommendations.length >= 3) return false;
    seenTexts.add(normalized);
    recommendations.push(recommendation);
    return true;
  };

  const experimentHint = input.analysis.experimentHint?.trim();
  if (experimentHint) {
    add({ kind: "experiment", text: experimentHint, support: "analysis", sourceRef: null });
  }

  const capturedRefs = new Set(
    input.capturedSpans
      .filter((span) => span.ref.trim().length > 0 && span.text.trim().length > 0)
      .map((span) => span.ref.trim())
  );
  let patternCount = 0;
  for (const note of input.analysis.evidenceNotes ?? []) {
    if (patternCount >= 2) break;
    if (note.grounding !== "text_grounded") continue;
    const sourceRef = note.ref.trim();
    const reusablePattern = note.reusablePattern?.trim();
    if (!sourceRef || !reusablePattern || !capturedRefs.has(sourceRef)) continue;
    if (add({ kind: "pattern", text: reusablePattern, support: "text_grounded", sourceRef })) {
      patternCount += 1;
    }
  }

  return recommendations;
}

function readBoundedRecommendationText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function deriveApplicationRecommendations(input: ProductCardInput): ProductCardRecommendation[] {
  const { analysis } = input;
  if (analysis.verdict !== "try" || analysis.signalType === "noise") return [];

  const persistedEvidenceRefs = new Set(analysis.evidenceRefs);
  const textGroundedRefs = new Set(
    (analysis.evidenceNotes ?? [])
      .filter((note) => note.grounding === "text_grounded")
      .map((note) => note.ref)
  );
  const capturedRefs = new Set(
    input.capturedSpans
      .filter((span) => span.ref.trim().length > 0 && span.text.trim().length > 0)
      .map((span) => span.ref)
  );
  const productContextFields = new Set<ProductContextField>(PRODUCT_CONTEXT_FIELDS);
  const recommendations: ProductCardRecommendation[] = [];

  for (const suggestion of analysis.applicationSuggestions ?? []) {
    if (!suggestion || typeof suggestion !== "object") continue;
    const sourcePattern = readBoundedRecommendationText(suggestion.sourcePattern, 80);
    const fitReason = readBoundedRecommendationText(suggestion.fitReason, 100);
    const smallTest = readBoundedRecommendationText(suggestion.smallTest, 100);
    const verificationQuestion = readBoundedRecommendationText(suggestion.verificationQuestion, 100);
    const target = suggestion.productContextTarget;
    const refs = suggestion.supportRefs;
    if (
      !sourcePattern
      || !fitReason
      || !smallTest
      || !verificationQuestion
      || !productContextFields.has(target)
      || !Array.isArray(refs)
      || refs.length < 1
      || refs.length > 3
      || refs.some((ref) => typeof ref !== "string" || ref.length === 0 || ref !== ref.trim())
      || new Set(refs).size !== refs.length
      || refs.some((ref) => !persistedEvidenceRefs.has(ref))
      || refs.some((ref) => !textGroundedRefs.has(ref))
      || refs.some((ref) => !capturedRefs.has(ref))
    ) {
      continue;
    }
    recommendations.push({
      kind: "application",
      support: "text_grounded",
      sourcePattern,
      fitReason,
      smallTest,
      sourceRefs: [...refs],
      productContextTarget: target,
      verificationQuestion
    });
    if (recommendations.length >= 3) break;
  }

  return recommendations;
}

export function deriveProductCardRecommendations(input: ProductCardInput): ProductCardRecommendation[] {
  if (densityFor(input.analysis) === "compact") return [];
  const applicationRecommendations = deriveApplicationRecommendations(input);
  return applicationRecommendations.length > 0
    ? applicationRecommendations
    : deriveFallbackRecommendations(input);
}

export function deriveProductCardPresentation(input: ProductCardInput): ProductCardPresentation {
  const { primary, secondary } = derivePrimaryCategory(input.analysis);
  const hero = resolveProductHero(input);
  const recommendations = deriveProductCardRecommendations(input);
  return {
    primaryCategory: primary,
    secondaryTags: secondary,
    ...hero,
    density: densityFor(input.analysis),
    recommendations,
    recommendationTier: recommendationTierFor(recommendations),
    briefEligible: briefEligibleFor(input.analysis),
    agentBriefReady: agentBriefReadyFor(input.analysis)
  };
}
