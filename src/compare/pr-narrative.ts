import type { PrCampaign, PrEvidenceRow } from "../state/pr-evidence-storage.ts";
import { normalizePrNarrativeSettings } from "../state/pr-evidence-storage.ts";
import type { SessionRecord } from "../state/types.ts";

export const PR_NARRATIVE_PROMPT_VERSION = "pr-narrative.v1";
export const PR_NARRATIVE_BATCH_MAX_ROWS = 20;
export const PR_NARRATIVE_BATCH_MAX_CHARS = 18_000;

export type PrNarrativeTextQuality = "canonical" | "snippet";
export type PrNarrativeMode = "attitude" | "experience" | "behavior" | "actionable";
export type PrNarrativeAlignment = "challenges" | "mixed" | "echoes";
export type PrNarrativeReadStatus = "complete" | "insufficient_evidence";

export interface PrNarrativeSource {
  ref: string;
  rowId: string;
  itemId: string;
  sourceUrl: string;
  authorHandle: string;
  text: string;
  textQuality: PrNarrativeTextQuality;
}

export interface PrNarrativeSnapshot {
  campaignId: string;
  sourceHash: string;
  collectedRowCount: number;
  snippetFallbackCount: number;
  sources: PrNarrativeSource[];
}

export interface PrNarrativePostReading {
  ref: string;
  gist: string;
  evidenceSummary: string;
  alignmentScore: number;
  actionabilityScore: number;
  claimSeeds: string[];
  caveat: string;
}

export interface PrNarrativeSynthesisClaimDraft {
  id: string;
  title: string;
  statement: string;
  implication: string;
  supportRefs: string[];
  counterRefs: string[];
}

export interface PrNarrativeSynthesisDraft {
  status: PrNarrativeReadStatus;
  priorityClaimId: string | null;
  claims: PrNarrativeSynthesisClaimDraft[];
}

export interface PrNarrativeEvidenceRef {
  rowId: string;
  summary: string;
}

export interface PrNarrativeClaim {
  id: string;
  title: string;
  statement: string;
  implication: string;
  mode: PrNarrativeMode;
  alignment: PrNarrativeAlignment;
  supportRefs: PrNarrativeEvidenceRef[];
  counterRefs: PrNarrativeEvidenceRef[];
}

export interface PrNarrativeRead {
  schemaVersion: 1;
  campaignId: string;
  sourceRowIds: string[];
  collectedRowCount: number;
  snippetFallbackCount: number;
  sourceHash: string;
  promptVersion: string;
  provider: string;
  model: string;
  generatedAt: string;
  status: PrNarrativeReadStatus;
  priorityClaimId: string | null;
  claims: PrNarrativeClaim[];
}

export interface PrNarrativeChunkOptions {
  maxRows?: number;
  maxChars?: number;
}

export interface PrNarrativeProseViolation {
  context: string;
  kind: "temporal" | "aggregate";
  severity: "hard" | "soft";
  sentence: string;
  matched: string;
}

export class PrNarrativeValidationError extends Error {
  readonly violations: PrNarrativeProseViolation[];

  constructor(violations: PrNarrativeProseViolation[], message?: string) {
    super(message ?? violations.map(describePrNarrativeProseViolation).join("; "));
    this.name = "PrNarrativeValidationError";
    this.violations = violations;
  }
}

export function describePrNarrativeProseViolation(violation: PrNarrativeProseViolation): string {
  const label = violation.kind === "temporal"
    ? "a temporal or delta assertion"
    : "an aggregate, count, or distribution assertion";
  return `${violation.context} contains ${label}: sentence "${violation.sentence}" (matched "${violation.matched}")`;
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readCanonicalMainPostText(sessionItem: SessionRecord["items"][number] | undefined): string {
  const canonicalPost = sessionItem?.latestCapture?.result?.canonical_post;
  return trimmedString(canonicalPost?.text);
}

function stableCampaignDefinition(campaign: PrCampaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    briefText: campaign.briefText,
    criteria: campaign.criteria.map(({ id, label }) => ({ id, label })),
    narrativeSettings: normalizePrNarrativeSettings(campaign.narrativeSettings)
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export async function buildPrNarrativeSnapshot({
  campaign,
  rows,
  session
}: {
  campaign: PrCampaign;
  rows: readonly PrEvidenceRow[];
  session: SessionRecord;
}): Promise<PrNarrativeSnapshot> {
  const campaignRows = rows
    .filter((row) => row.campaignId === campaign.id)
    .slice()
    .sort((left, right) => left.collectedAt.localeCompare(right.collectedAt) || left.id.localeCompare(right.id));
  const itemById = session.id === campaign.sessionId
    ? new Map(session.items.map((item) => [item.id, item]))
    : new Map<string, SessionRecord["items"][number]>();
  const sources: PrNarrativeSource[] = [];

  for (const row of campaignRows) {
    const canonicalText = readCanonicalMainPostText(itemById.get(row.itemId));
    const snippetText = trimmedString(row.caption);
    const text = canonicalText || snippetText;
    if (!text) {
      continue;
    }
    sources.push({
      ref: `P${String(sources.length + 1).padStart(2, "0")}`,
      rowId: row.id,
      itemId: row.itemId,
      sourceUrl: row.postUrl,
      authorHandle: row.authorHandle,
      text,
      textQuality: canonicalText ? "canonical" : "snippet"
    });
  }

  const sourceHash = await sha256(JSON.stringify({
    campaign: stableCampaignDefinition(campaign),
    inventory: campaignRows.map((row) => ({
      rowId: row.id,
      itemId: row.itemId,
      sourceUrl: row.postUrl,
      authorHandle: row.authorHandle,
      collectedAt: row.collectedAt
    })),
    sources: sources.map((source) => ({
      ref: source.ref,
      rowId: source.rowId,
      itemId: source.itemId,
      sourceUrl: source.sourceUrl,
      authorHandle: source.authorHandle,
      text: source.text,
      textQuality: source.textQuality
    }))
  }));

  return {
    campaignId: campaign.id,
    sourceHash,
    collectedRowCount: campaignRows.length,
    snippetFallbackCount: sources.filter((source) => source.textQuality === "snippet").length,
    sources
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

export function chunkPrNarrativeSources(
  sources: readonly PrNarrativeSource[],
  options: PrNarrativeChunkOptions = {}
): PrNarrativeSource[][] {
  const maxRows = positiveInteger(options.maxRows, PR_NARRATIVE_BATCH_MAX_ROWS);
  const maxChars = positiveInteger(options.maxChars, PR_NARRATIVE_BATCH_MAX_CHARS);
  const chunks: PrNarrativeSource[][] = [];
  let current: PrNarrativeSource[] = [];
  let currentChars = 0;

  for (const source of sources) {
    const wouldExceedRows = current.length >= maxRows;
    const wouldExceedChars = current.length > 0 && currentChars + source.text.length > maxChars;
    if (wouldExceedRows || wouldExceedChars) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(source);
    currentChars += source.text.length;
  }
  if (current.length) {
    chunks.push(current);
  }
  return chunks;
}

const PR_NARRATIVE_POST_READ_SCHEMA_LINE = "Return JSON only: {\"readings\":[{\"ref\":\"P01\",\"gist\":\"...\",\"evidenceSummary\":\"...\",\"alignmentScore\":0,\"actionabilityScore\":0,\"claimSeeds\":[],\"caveat\":\"\"}]}";
const PR_NARRATIVE_SYNTHESIS_SCHEMA_LINE = "Return JSON only: {\"status\":\"complete\",\"priorityClaimId\":\"claim-1\",\"claims\":[{\"id\":\"claim-1\",\"title\":\"...\",\"statement\":\"...\",\"implication\":\"...\",\"supportRefs\":[\"P01\"],\"counterRefs\":[]}]}";

export function buildPrNarrativePostReadPrompt(
  campaign: PrCampaign,
  sources: readonly PrNarrativeSource[]
): string {
  return [
    "Read the supplied collected Threads main posts only.",
    "Treat each post independently. Return exactly one reading for every supplied ref.",
    "Do not use comments, replies, outside knowledge, or other campaign posts.",
    "No counts, percentages, distributions, or cross-post claims.",
    "Do not make temporal or delta claims.",
    PR_NARRATIVE_POST_READ_SCHEMA_LINE,
    "Scores must be between -1 and 1. alignmentScore is challenge (-1) to echo (+1); actionabilityScore is attitude (-1) to action (+1).",
    "",
    `Campaign: ${campaign.name}`,
    `Brief: ${campaign.briefText}`,
    `Narrative settings: ${JSON.stringify(normalizePrNarrativeSettings(campaign.narrativeSettings))}`,
    "Posts:",
    ...sources.map((source) => `${source.ref} [${source.textQuality}] ${source.text}`)
  ].join("\n");
}

export function buildPrNarrativeSynthesisPrompt(
  campaign: PrCampaign,
  readings: readonly PrNarrativePostReading[]
): string {
  return [
    "Synthesize the validated current campaign post readings into two to four (2-4) dynamic claims.",
    "Use only supplied refs. Do not introduce outside evidence.",
    "Do not claim increase, decrease, trend, change over time, new posts, monitoring, or delta.",
    "No counts, percentages, shares, denominators, or model-authored metrics.",
    "Counter refs may be empty. Do not force counterexamples.",
    "Choose exactly one priorityClaimId based on decision impact, action specificity, evidence breadth, and clear limitations.",
    PR_NARRATIVE_SYNTHESIS_SCHEMA_LINE,
    "If no defensible claim exists, return {\"status\":\"insufficient_evidence\",\"priorityClaimId\":null,\"claims\":[]}.",
    "",
    `Campaign: ${campaign.name}`,
    `Brief: ${campaign.briefText}`,
    `Narrative settings: ${JSON.stringify(normalizePrNarrativeSettings(campaign.narrativeSettings))}`,
    `Validated readings: ${JSON.stringify(readings)}`
  ].join("\n");
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    throw new Error("Invalid PR narrative JSON payload");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PR narrative payload must be an object");
  }
  return parsed as Record<string, unknown>;
}

function assertExactKeys(raw: Record<string, unknown>, allowed: readonly string[], context: string): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(raw).filter((key) => !allowedSet.has(key));
  if (unexpected.length) {
    throw new Error(`${context} has unexpected field: ${unexpected.join(", ")}`);
  }
}

function requiredString(raw: Record<string, unknown>, key: string, context: string): string {
  const value = trimmedString(raw[key]);
  if (!value) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(raw: Record<string, unknown>, key: string): string {
  return trimmedString(raw[key]);
}

function stringArray(value: unknown, context: string, allowEmpty = true): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array`);
  }
  const result = value.map((entry) => trimmedString(entry));
  if (result.some((entry) => !entry)) {
    throw new Error(`${context} must contain only non-empty strings`);
  }
  if (!allowEmpty && result.length === 0) {
    throw new Error(`${context} must not be empty`);
  }
  if (new Set(result).size !== result.length) {
    throw new Error(`${context} contains duplicate refs`);
  }
  return result;
}

function score(raw: Record<string, unknown>, key: string, context: string): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < -1 || value > 1) {
    throw new Error(`${context}.${key} must be between -1 and 1`);
  }
  return value;
}

export function parsePrNarrativePostReadResponse(
  raw: string,
  expectedRefs: readonly string[]
): PrNarrativePostReading[] {
  const payload = parseJsonObject(raw);
  assertExactKeys(payload, ["readings"], "post reading payload");
  if (!Array.isArray(payload.readings)) {
    throw new Error("post reading payload.readings must be an array");
  }

  return normalizePostReadings(payload.readings, expectedRefs);
}

// Two-tier temporal detection. HARD patterns are unambiguous corpus-delta or
// time-comparison language and always reject. SOFT patterns (bare change verbs,
// bare recency words) are legitimate inside a single post's own reported content,
// so they are collected as flags and adjudicated by one semantic repair pass
// instead of hard-failing the whole read.
const TEMPORAL_HARD_PATTERN = new RegExp([
  String.raw`\bover\s+time\b`,
  String.raw`\b(?:since|after)\s+(?:the\s+)?(?:previous|prior|last|earlier)\b`,
  String.raw`\bcompared\s+(?:with|to)\s+(?:the\s+)?(?:previous|prior|last|earlier|baseline)\b`,
  String.raw`\b(?:upward|downward|rising|falling)\s+trend\b|\btrending\b`,
  String.raw`\b(?:new|recent)\s+posts?\s+(?:show|indicate|suggest|reveal|contain|add|bring)\b`,
  String.raw`\b(?:more|less|higher|lower|stronger|weaker)\b.{0,30}\b(?:than\s+before|than\s+previously|than\s+(?:the\s+)?(?:previous|prior|last|earlier))\b`,
  String.raw`\b(?:gain(?:s|ed|ing)|los(?:es|t|ing))\s+momentum\b`,
  String.raw`\bmomentum\s+(?:(?:is|was|has\s+been|appears\s+to\s+be)\s+)?(?:build(?:s|ing)|grow(?:s|ing)|ris(?:es|ing)|wan(?:es|ing)|fad(?:es|ing)|slow(?:s|ing)|accelerat(?:es|ing))\b`,
  String.raw`(?:較|比|自)(?:上次|此前|之前|前次)`,
  String.raw`新帖(?:顯示|指出|反映|帶來|新增)|持續(?:監測|追蹤)|自動發現`,
  String.raw`(?:上升|下降|增加|減少|成長|下滑)趨勢|趨勢(?:上升|下降|增加|減少|轉強|轉弱)`,
  String.raw`(?:聲勢|動能|勢頭)\s*(?:正在|持續|開始|逐漸)?\s*(?:增強|增長|累積|上升|升溫|減弱|消退|下滑|降溫)`
].join("|"), "i");
const TEMPORAL_SOFT_PATTERN = new RegExp([
  String.raw`\b(?:increas(?:e|ed|es|ing)|decreas(?:e|ed|es|ing)|declin(?:e|ed|es|ing)|grew|grown|growing|rose|risen|rising|fell|fallen|falling|shift(?:ed|s|ing)?|surg(?:e|ed|es|ing)|dropp(?:ed|ing)|worsen(?:ed|s|ing)?|improv(?:e|ed|es|ing))\b`,
  String.raw`\b(?:recently|over\s+the\s+(?:last|past))\b`,
  String.raw`上升|下降|增加|減少|成長|下滑|轉強|轉弱|升高|降低|越來越`,
  String.raw`最近\s*\d*\s*(?:天|週|周|月)`
].join("|"), "i");
const ENGLISH_COUNT_TOKEN = String.raw`(?:\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|hundred)`;
const ENGLISH_FRACTION_DENOMINATOR = String.raw`(?:halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?)`;
const ENGLISH_FRACTION_WORD = String.raw`(?:half|third|quarter|fourth|fifth|sixth|seventh|eighth|ninth|tenth)`;
const ENGLISH_CORPUS_NOUN = String.raw`(?:posts?|sources?|rows?|responses?|mentions?|voices?)`;
const CHINESE_COUNT_TOKEN = String.raw`(?:\d+(?:\.\d+)?|[零〇一二兩三四五六七八九十百千]+)`;
const CHINESE_CORPUS_NOUN = String.raw`(?:貼文|帖子|帖文|來源|樣本|回應|留言|聲音)`;
const AGGREGATE_CLAIM_PATTERN = new RegExp([
  String.raw`\b${ENGLISH_COUNT_TOKEN}\s+of\s+(?:the\s+)?${ENGLISH_COUNT_TOKEN}\s+(?:collected\s+)?${ENGLISH_CORPUS_NOUN}\b`,
  String.raw`\b\d+\s*\/\s*\d+\s+(?:of\s+)?(?:the\s+)?${ENGLISH_CORPUS_NOUN}\b`,
  String.raw`\b\d+(?:\.\d+)?\s*(?:%|percent(?:age)?)\s+(?:of\s+)?(?:the\s+)?${ENGLISH_CORPUS_NOUN}\b`,
  String.raw`\b${ENGLISH_COUNT_TOKEN}\s+(?:in|out\s+of)\s+(?:every\s+)?${ENGLISH_COUNT_TOKEN}\s+(?:collected\s+)?${ENGLISH_CORPUS_NOUN}\b`,
  String.raw`\b${ENGLISH_COUNT_TOKEN}(?:-|\s+)${ENGLISH_FRACTION_DENOMINATOR}\s+of\s+(?:the\s+)?${ENGLISH_CORPUS_NOUN}\b`,
  String.raw`\b(?:a\s+)?${ENGLISH_FRACTION_WORD}\s+(?:of\s+)?(?:the\s+)?${ENGLISH_CORPUS_NOUN}\b`,
  String.raw`\b(?:a\s+|the\s+)?(?:majority|minority)\s+of\s+(?:the\s+)?${ENGLISH_CORPUS_NOUN}\b`,
  String.raw`\b(?:half|most|all|many|several|few|no)\s+(?:of\s+the\s+)?${ENGLISH_CORPUS_NOUN}\b`,
  String.raw`\b${ENGLISH_COUNT_TOKEN}\s+(?:collected\s+)?${ENGLISH_CORPUS_NOUN}\b`,
  String.raw`\d+\s*\/\s*\d+\s*(?:篇|則)?\s*${CHINESE_CORPUS_NOUN}`,
  String.raw`\d+(?:\.\d+)?\s*(?:%|％)\s*(?:的)?\s*${CHINESE_CORPUS_NOUN}`,
  String.raw`百分之\s*${CHINESE_COUNT_TOKEN}\s*(?:的)?\s*${CHINESE_CORPUS_NOUN}`,
  String.raw`${CHINESE_COUNT_TOKEN}\s*分之\s*${CHINESE_COUNT_TOKEN}\s*(?:的)?\s*${CHINESE_CORPUS_NOUN}`,
  String.raw`(?:約|大約|近|逾|超過|不到)?\s*${CHINESE_COUNT_TOKEN}\s*成\s*(?:的)?\s*${CHINESE_CORPUS_NOUN}`,
  String.raw`${CHINESE_COUNT_TOKEN}\s*(?:篇|則)\s*(?:${CHINESE_CORPUS_NOUN})?\s*(?:中|裡|內)\s*(?:有)?\s*${CHINESE_COUNT_TOKEN}\s*(?:篇|則)`,
  String.raw`${CHINESE_COUNT_TOKEN}\s*(?:篇|則)\s*${CHINESE_CORPUS_NOUN}`,
  String.raw`(?:多數|少數|大多數|大部分|多半|過半|半數|一半|逾半|超過一半|不到一半|全部|所有|多篇|數篇|若干篇)\s*(?:的)?\s*${CHINESE_CORPUS_NOUN}`
].join("|"), "i");
const INLINE_REF_PATTERN = /\bP\d{2,}\b/g;
const SENTENCE_BOUNDARY_PATTERN = /(?<=[.!?。！？；;\n])/;

function matchProseViolation(
  text: string,
  context: string,
  pattern: RegExp,
  kind: PrNarrativeProseViolation["kind"],
  severity: PrNarrativeProseViolation["severity"]
): PrNarrativeProseViolation | null {
  for (const sentence of text.split(SENTENCE_BOUNDARY_PATTERN)) {
    const matched = pattern.exec(sentence);
    if (matched) {
      return { context, kind, severity, sentence: sentence.trim(), matched: matched[0] };
    }
  }
  return null;
}

function assertCurrentOnlyProse(text: string, context: string): void {
  const violation = matchProseViolation(text, context, TEMPORAL_HARD_PATTERN, "temporal", "hard")
    ?? matchProseViolation(text, context, AGGREGATE_CLAIM_PATTERN, "aggregate", "hard");
  if (violation) {
    throw new PrNarrativeValidationError([violation]);
  }
}

function collectSoftProseFlags(text: string, context: string): PrNarrativeProseViolation[] {
  const violation = matchProseViolation(text, context, TEMPORAL_SOFT_PATTERN, "temporal", "soft");
  return violation ? [violation] : [];
}

export function collectPrNarrativePostReadingSoftFlags(
  readings: readonly PrNarrativePostReading[]
): PrNarrativeProseViolation[] {
  return readings.flatMap((reading) => {
    const prose = [reading.gist, reading.evidenceSummary, ...reading.claimSeeds, reading.caveat]
      .filter(Boolean)
      .join("\n");
    return collectSoftProseFlags(prose, `post reading ${reading.ref}`);
  });
}

export function collectPrNarrativeSynthesisSoftFlags(
  draft: PrNarrativeSynthesisDraft
): PrNarrativeProseViolation[] {
  return draft.claims.flatMap((claim) => {
    const refs = [...claim.supportRefs, ...claim.counterRefs].join(", ");
    const prose = `${claim.title}\n${claim.statement}\n${claim.implication}`;
    return collectSoftProseFlags(prose, `claim ${claim.id}${refs ? ` (refs ${refs})` : ""}`);
  });
}

function normalizePostReadings(
  readings: readonly unknown[],
  expectedRefs: readonly string[]
): PrNarrativePostReading[] {
  const expectedSet = new Set(expectedRefs);
  const byRef = new Map<string, PrNarrativePostReading>();

  for (const entry of readings) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("post reading entry must be an object");
    }
    const item = entry as Record<string, unknown>;
    assertExactKeys(item, ["ref", "gist", "evidenceSummary", "alignmentScore", "actionabilityScore", "claimSeeds", "caveat"], "post reading");
    const ref = requiredString(item, "ref", "post reading");
    if (!expectedSet.has(ref)) {
      throw new Error(`Unknown post reading ref: ${ref}`);
    }
    if (byRef.has(ref)) {
      throw new Error(`Duplicate post reading ref: ${ref}`);
    }
    const gist = requiredString(item, "gist", `post reading ${ref}`);
    const evidenceSummary = requiredString(item, "evidenceSummary", `post reading ${ref}`);
    const claimSeeds = stringArray(item.claimSeeds, `post reading ${ref}.claimSeeds`);
    const caveat = optionalString(item, "caveat");
    const prose = [gist, evidenceSummary, ...claimSeeds, caveat].filter(Boolean).join("\n");
    assertCurrentOnlyProse(prose, `post reading ${ref}`);
    assertAllowedInlineRefs(prose, new Set([ref]), `post reading ${ref}`);
    byRef.set(ref, {
      ref,
      gist,
      evidenceSummary,
      alignmentScore: score(item, "alignmentScore", `post reading ${ref}`),
      actionabilityScore: score(item, "actionabilityScore", `post reading ${ref}`),
      claimSeeds,
      caveat
    });
  }

  const missing = expectedRefs.filter((ref) => !byRef.has(ref));
  if (missing.length) {
    throw new Error(`Missing post reading refs: ${missing.join(", ")}`);
  }
  return expectedRefs.map((ref) => byRef.get(ref)!);
}

function assertAllowedInlineRefs(text: string, allowedRefs: ReadonlySet<string>, context: string): void {
  for (const ref of text.match(INLINE_REF_PATTERN) ?? []) {
    if (!allowedRefs.has(ref)) {
      throw new Error(`${context} cites unknown ref ${ref}`);
    }
  }
}

function parseSynthesisClaim(
  value: unknown,
  allowedRefs: ReadonlySet<string>,
  index: number
): PrNarrativeSynthesisClaimDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`claim ${index + 1} must be an object`);
  }
  const raw = value as Record<string, unknown>;
  assertExactKeys(raw, ["id", "title", "statement", "implication", "supportRefs", "counterRefs"], `claim ${index + 1}`);
  const id = requiredString(raw, "id", `claim ${index + 1}`);
  const title = requiredString(raw, "title", `claim ${id}`);
  const statement = requiredString(raw, "statement", `claim ${id}`);
  const implication = requiredString(raw, "implication", `claim ${id}`);
  const supportRefs = stringArray(raw.supportRefs, `claim ${id}.supportRefs`, false);
  const counterRefs = stringArray(raw.counterRefs, `claim ${id}.counterRefs`);
  const prose = `${title}\n${statement}\n${implication}`;
  const claimContext = `claim ${id} (refs ${[...supportRefs, ...counterRefs].join(", ")})`;
  assertCurrentOnlyProse(prose, claimContext);
  assertAllowedInlineRefs(prose, allowedRefs, `claim ${id}`);
  for (const ref of [...supportRefs, ...counterRefs]) {
    if (!allowedRefs.has(ref)) {
      throw new Error(`claim ${id} contains unknown ref ${ref}`);
    }
  }
  const counterSet = new Set(counterRefs);
  const overlap = supportRefs.filter((ref) => counterSet.has(ref));
  if (overlap.length) {
    throw new Error(`claim ${id} support/counter overlap: ${overlap.join(", ")}`);
  }
  return { id, title, statement, implication, supportRefs, counterRefs };
}

function normalizeSynthesisDraft(
  value: unknown,
  allowedRefs: readonly string[],
  enforceClaimRange: boolean
): PrNarrativeSynthesisDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("synthesis payload must be an object");
  }
  const payload = value as Record<string, unknown>;
  assertExactKeys(payload, ["status", "priorityClaimId", "claims"], "synthesis payload");
  const status = payload.status;
  if (status !== "complete" && status !== "insufficient_evidence") {
    throw new Error("synthesis payload.status is invalid");
  }
  if (!Array.isArray(payload.claims)) {
    throw new Error("synthesis payload.claims must be an array");
  }
  const allowedSet = new Set(allowedRefs);
  const claims = payload.claims.map((claim, index) => parseSynthesisClaim(claim, allowedSet, index));
  const priorityClaimId = payload.priorityClaimId === null ? null : trimmedString(payload.priorityClaimId);

  if (status === "insufficient_evidence") {
    if (priorityClaimId !== null || claims.length !== 0) {
      throw new Error("insufficient_evidence cannot contain claims or a priority claim");
    }
    return { status, priorityClaimId: null, claims: [] };
  }
  if (enforceClaimRange && (claims.length < 2 || claims.length > 4)) {
    throw new Error("complete narrative synthesis must contain two to four claims");
  }
  if (!claims.length) {
    throw new Error("complete narrative synthesis must contain claims");
  }
  const claimIds = claims.map((claim) => claim.id);
  if (new Set(claimIds).size !== claimIds.length) {
    throw new Error("narrative synthesis contains duplicate claim ids");
  }
  if (!priorityClaimId || !claimIds.includes(priorityClaimId)) {
    throw new Error("narrative synthesis priorityClaimId must identify exactly one claim");
  }
  return { status, priorityClaimId, claims };
}

export function parsePrNarrativeSynthesisResponse(
  raw: string,
  allowedRefs: readonly string[]
): PrNarrativeSynthesisDraft {
  const payload = parseJsonObject(raw);
  return normalizeSynthesisDraft(payload, allowedRefs, true);
}

export function buildPrNarrativeRepairPrompt({
  stage,
  originalRaw,
  violations
}: {
  stage: "postRead" | "synthesis";
  originalRaw: string;
  violations: readonly PrNarrativeProseViolation[];
}): string {
  return [
    "Your previous JSON output for this PR narrative stage violated current-state-only rules.",
    "Fix ONLY the flagged sentences below. Keep every other field and value unchanged.",
    "hard violations: rewrite the sentence into current-state phrasing that preserves the meaning and evidence.",
    "soft violations: if the sentence asserts change over time, momentum, or a cross-post aggregate, rewrite it the same way; if it only reports what that single post itself says, keep it as is.",
    "Never introduce counts, percentages, trends, or comparisons with earlier readings.",
    stage === "postRead" ? PR_NARRATIVE_POST_READ_SCHEMA_LINE : PR_NARRATIVE_SYNTHESIS_SCHEMA_LINE,
    "",
    "Violations:",
    ...violations.map((violation) =>
      `- ${violation.context} [${violation.kind}/${violation.severity}] sentence: "${violation.sentence}" (matched: "${violation.matched}")`),
    "",
    "Original JSON:",
    originalRaw
  ].join("\n");
}

export interface PrNarrativeRepairOutcome<T> {
  value: T;
  repaired: boolean;
  violationsBeforeRepair: PrNarrativeProseViolation[];
  keptSoftFlags: PrNarrativeProseViolation[];
}

// One semantic repair pass, at most: parse the raw stage output; on hard prose
// violations or soft flags, ask the model once (via the injected repair callback)
// to rewrite or, for soft flags only, keep the sentence. The repaired output is
// re-parsed under the same hard rules; surviving soft flags were adjudicated as
// in-post language and are accepted (reported in the outcome for tracing).
export async function parsePrNarrativeStageWithRepair<T>({
  raw,
  parse,
  collectSoftFlags,
  repair
}: {
  raw: string;
  parse: (raw: string) => T;
  collectSoftFlags: (value: T) => PrNarrativeProseViolation[];
  repair: (request: { originalRaw: string; violations: PrNarrativeProseViolation[] }) => Promise<string>;
}): Promise<PrNarrativeRepairOutcome<T>> {
  let violations: PrNarrativeProseViolation[];
  try {
    const value = parse(raw);
    violations = collectSoftFlags(value);
    if (!violations.length) {
      return { value, repaired: false, violationsBeforeRepair: [], keptSoftFlags: [] };
    }
  } catch (error) {
    if (!(error instanceof PrNarrativeValidationError)) {
      throw error;
    }
    violations = error.violations;
  }

  let repairedRaw: string;
  try {
    repairedRaw = await repair({ originalRaw: raw, violations });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PrNarrativeValidationError(
      violations,
      `${violations.map(describePrNarrativeProseViolation).join("; ")}; semantic repair attempt failed: ${reason}`
    );
  }
  const value = parse(repairedRaw);
  return {
    value,
    repaired: true,
    violationsBeforeRepair: violations,
    keptSoftFlags: collectSoftFlags(value)
  };
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function alignmentFromScore(value: number): PrNarrativeAlignment {
  if (value <= -0.34) return "challenges";
  if (value >= 0.34) return "echoes";
  return "mixed";
}

function modeFromScore(value: number): PrNarrativeMode {
  if (value >= 0.6) return "actionable";
  if (value >= 0.2) return "behavior";
  if (value >= -0.2) return "experience";
  return "attitude";
}

export function materializePrNarrativeRead({
  snapshot,
  postReadings,
  synthesis,
  generatedAt,
  provider,
  model
}: {
  snapshot: PrNarrativeSnapshot;
  postReadings: readonly PrNarrativePostReading[];
  synthesis: PrNarrativeSynthesisDraft;
  generatedAt: string;
  provider: string;
  model: string;
}): PrNarrativeRead {
  const expectedRefs = snapshot.sources.map((source) => source.ref);
  const validatedReadings = normalizePostReadings(postReadings, expectedRefs);
  const readingByRef = new Map(validatedReadings.map((reading) => [reading.ref, reading]));
  const validatedSynthesis = normalizeSynthesisDraft(synthesis, expectedRefs, true);
  const sourceByRef = new Map(snapshot.sources.map((source) => [source.ref, source]));

  const claims: PrNarrativeClaim[] = validatedSynthesis.claims.map((claim) => {
    const supportReadings = claim.supportRefs.map((ref) => readingByRef.get(ref)!);
    const toEvidenceRef = (ref: string): PrNarrativeEvidenceRef => ({
      rowId: sourceByRef.get(ref)!.rowId,
      summary: readingByRef.get(ref)!.evidenceSummary
    });
    return {
      id: claim.id,
      title: claim.title,
      statement: claim.statement,
      implication: claim.implication,
      alignment: alignmentFromScore(average(supportReadings.map((reading) => reading.alignmentScore))),
      mode: modeFromScore(average(supportReadings.map((reading) => reading.actionabilityScore))),
      supportRefs: claim.supportRefs.map(toEvidenceRef),
      counterRefs: claim.counterRefs.map(toEvidenceRef)
    };
  });

  return {
    schemaVersion: 1,
    campaignId: snapshot.campaignId,
    sourceRowIds: snapshot.sources.map((source) => source.rowId),
    collectedRowCount: snapshot.collectedRowCount,
    snippetFallbackCount: snapshot.snippetFallbackCount,
    sourceHash: snapshot.sourceHash,
    promptVersion: PR_NARRATIVE_PROMPT_VERSION,
    provider: trimmedString(provider),
    model: trimmedString(model),
    generatedAt: trimmedString(generatedAt),
    status: validatedSynthesis.status,
    priorityClaimId: validatedSynthesis.priorityClaimId,
    claims
  };
}
