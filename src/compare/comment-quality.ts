import { isYesNoReplyQuestion } from "./reply-thread.ts";

export type CommentQualityFlag = "bookmark" | "acknowledgment";
export type CommentQualityReason = "bookmark_pattern" | "acknowledgment_pattern" | "bare_affirmation_without_context" | "contextual_yes_no_answer" | "substantive";
export interface CommentQualityAssessment { flag: CommentQualityFlag | null; reason: CommentQualityReason }
/** Alias retained for row/quote contracts that use the shorter type name. */
export type CommentQuality = CommentQualityAssessment;
export interface CommentQualityContext { parentText?: string | null }

const BOOKMARK = /^(?:留己看|留個位|留个位|留位|留名|留低先|留嚟睇|留黎睇|留來看|留来看|收藏|先收藏|收藏先|先存起來|先存起来|蹲|蹲一個|蹲一个|mark|bookmark|bookmarked|saved)$/;
const ACKNOWLEDGMENT = /^(?:多謝|多谢|謝謝|谢谢|感謝|感谢|收到|明白|知道了|了解|好的|好|讚|赞|thanks|thankyou|ok|okay|noted)$/;
const AFFIRMATIVE = /^(?:有|有啊|有呀|有喔|冇|無|无|係|系|唔係|yes|yeah|yep|no|nope)$/;

/** Exact patterns only. A flag is a quiet reading cue, never a deletion/spam verdict. */
export function classifyCommentQuality(text: string, context: CommentQualityContext = {}): CommentQualityAssessment {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  if (BOOKMARK.test(normalized)) return { flag: "bookmark", reason: "bookmark_pattern" };
  if (AFFIRMATIVE.test(normalized)) {
    return context.parentText && isYesNoReplyQuestion(context.parentText)
      ? { flag: null, reason: "contextual_yes_no_answer" }
      : { flag: "acknowledgment", reason: "bare_affirmation_without_context" };
  }
  if (ACKNOWLEDGMENT.test(normalized)) return { flag: "acknowledgment", reason: "acknowledgment_pattern" };
  return { flag: null, reason: "substantive" };
}

export const commentQualityLabel = (flag: CommentQualityFlag | null | undefined): string | null =>
  flag === "bookmark" ? "留位／收藏" : flag === "acknowledgment" ? "簡短回應" : null;
