import type { CompareBrief } from "./brief.ts";
import type { JudgmentResult, JudgmentRecommendedState, ProductProfile } from "../state/types.ts";

export const COMPARE_JUDGMENT_PROMPT_VERSION = "v1";

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function stripCodeFence(value: string): string {
  const trimmed = readTrimmedString(value);
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function readRecommendedState(value: unknown): JudgmentRecommendedState | null {
  return value === "park" || value === "watch" || value === "act" ? value : null;
}

function readRelevance(value: unknown): JudgmentResult["relevance"] | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}

function compactSingleLine(value: string, maxLength: number): string {
  const normalized = readTrimmedString(value);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const firstClause = normalized.split(/[；;。！？!?,，]/).map((part) => part.trim()).find(Boolean) || normalized;
  if (firstClause.length <= maxLength) {
    return firstClause.replace(/[，,：:]$/, "").trim();
  }
  return `${firstClause.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

export function buildJudgmentCacheKey(
  briefHash: string,
  profileHash: string,
  promptVersion: string
): string {
  return ["judgment", promptVersion, briefHash, profileHash].join("|");
}

export function buildJudgmentPrompt(
  brief: CompareBrief,
  productProfile: ProductProfile
): string {
  const observations = brief.supportingObservations
    .map((observation, index) =>
      `${index + 1}. scope=${observation.scope} evidence=[${observation.evidenceIds.join(", ")}] ${observation.text}`
    )
    .join("\n");

  const schema = [
    "{",
    '  "relevance": "1|2|3|4|5",',
    '  "recommended_state": "park|watch|act",',
    '  "why_this_matters": "string",',
    '  "action_cue": "string"',
    "}"
  ].join("\n");

  return [
    "你是產品判斷助手。你會吃一份既有 compare brief，再補一層產品導向 judgment。",
    "不要重寫 brief；只回答這份 brief 對指定產品是否值得追。",
    "",
    "判斷尺度：",
    "  - relevance=1: 幾乎不相關，先放掉",
    "  - relevance=2: 關聯很弱，先暫放",
    "  - relevance=3: 有觀察價值，先 watch",
    "  - relevance=4: 對產品很有用，應進一步跟",
    "  - relevance=5: 極高相關，應立刻 act",
    "  - recommended_state 只能是 park | watch | act",
    "  - why_this_matters: 說明這份 brief 為什麼對這個產品/受眾有價值",
    "  - action_cue: 給 analyst 的短促下一步，不要超過 18 個中文字",
    "",
    "[PRODUCT_PROFILE]",
    `name=${readTrimmedString(productProfile.name)}`,
    `category=${readTrimmedString(productProfile.category)}`,
    `audience=${readTrimmedString(productProfile.audience)}`,
    "",
    "[COMPARE_BRIEF]",
    `headline=${readTrimmedString(brief.headline)}`,
    `relation=${readTrimmedString(brief.relation)}`,
    `a_reading=${readTrimmedString(brief.aReading)}`,
    `b_reading=${readTrimmedString(brief.bReading)}`,
    `why_it_matters=${readTrimmedString(brief.whyItMatters)}`,
    `creator_cue=${readTrimmedString(brief.creatorCue)}`,
    `keywords=[${brief.keywords.join(", ")}]`,
    `audience_alignment_left=${brief.audienceAlignmentLeft}`,
    `audience_alignment_right=${brief.audienceAlignmentRight}`,
    `confidence=${brief.confidence}`,
    "",
    "[SUPPORTING_OBSERVATIONS]",
    observations || "none",
    "",
    "只回傳 JSON，格式：",
    schema
  ].join("\n");
}

interface JudgmentResponsePayload {
  relevance?: unknown;
  recommended_state?: unknown;
  recommendedState?: unknown;
  why_this_matters?: unknown;
  whyThisMatters?: unknown;
  action_cue?: unknown;
  actionCue?: unknown;
}

export function parseJudgmentResponse(raw: string): JudgmentResult | null {
  let parsed: JudgmentResponsePayload;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }

  const relevance = readRelevance(parsed.relevance);
  const recommendedState = readRecommendedState(parsed.recommendedState ?? parsed.recommended_state);
  const whyThisMatters = readTrimmedString(parsed.whyThisMatters ?? parsed.why_this_matters);
  const actionCue = readTrimmedString(parsed.actionCue ?? parsed.action_cue);

  if (relevance == null || recommendedState == null || !whyThisMatters || !actionCue) {
    return null;
  }

  return {
    relevance,
    recommendedState,
    whyThisMatters,
    actionCue
  };
}

export function buildDeterministicJudgment(
  brief: CompareBrief,
  productProfile: ProductProfile,
  fallbackReason = "AI judgment unavailable."
): JudgmentResult {
  const cleanedReason = readTrimmedString(fallbackReason).replace(/ai judgment unavailable\.?/i, "").trim();
  const audience = readTrimmedString(productProfile.audience) || "目標受眾";
  const whyThisMatters = compactSingleLine(
    `${brief.whyItMatters} 但目前只知道這份 brief 對 ${audience} 可能有關，${cleanedReason || "仍需人工判讀產品貼合度。"}`,
    120
  );

  return {
    relevance: 2,
    recommendedState: "park",
    whyThisMatters: whyThisMatters || `這份 brief 對 ${audience} 可能有弱關聯，但仍需人工判讀。`,
    actionCue: "先人工覆核"
  };
}
