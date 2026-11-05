import type { SessionItem } from "../state/types";
import { readCommentEligibility } from "../compare/comment-eligibility";

export interface CollectionReaderDetails {
  audience: number;
  authorReplies: number;
  excluded: number;
  analysisVersion: string | null;
  commentLabel: string;
}

/** Display only: retain the eligibility rules that also own the reader's audience. */
export function buildCollectionReaderDetails(item: SessionItem | null | undefined): CollectionReaderDetails | null {
  if (!item) return null;
  const eligibility = readCommentEligibility(item);
  const audience = eligibility.audience.length;
  const authorReplies = eligibility.authorReplies.length;
  const excluded = eligibility.excluded.root + eligibility.excluded.duplicates + eligibility.excluded.op + eligibility.excluded.unknown;
  const analysisVersion = item.latestCapture?.analysis?.analysis_version?.trim() || null;
  return { audience, authorReplies, excluded, analysisVersion,
    commentLabel: `${audience} 則觀眾 · ${authorReplies} 則作者回覆 · 排除 ${excluded}` };
}
