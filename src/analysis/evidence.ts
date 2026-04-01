import type {
  AnalysisEvidenceCommentSnapshot,
  AnalysisEvidenceSnapshot,
} from "../contracts/ingest.ts";

function sortEvidenceComments(
  comments: readonly AnalysisEvidenceCommentSnapshot[],
): AnalysisEvidenceCommentSnapshot[] {
  return [...comments].sort((left, right) => {
    const likeDelta = (right.like_count ?? -1) - (left.like_count ?? -1);
    if (likeDelta !== 0) return likeDelta;

    const leftText = left.text.trim().toLowerCase();
    const rightText = right.text.trim().toLowerCase();
    const textCompare = leftText.localeCompare(rightText);
    if (textCompare !== 0) return textCompare;

    return left.comment_id.localeCompare(right.comment_id);
  });
}

export function buildEvidenceLookup(
  evidence: readonly AnalysisEvidenceSnapshot[],
): Map<number, AnalysisEvidenceCommentSnapshot[]> {
  const lookup = new Map<number, AnalysisEvidenceCommentSnapshot[]>();

  for (const group of evidence) {
    lookup.set(group.cluster_key, sortEvidenceComments(group.comments));
  }

  return lookup;
}

export function pickEvidenceComments(
  evidence: readonly AnalysisEvidenceSnapshot[],
  clusterKey: number,
  limit = 3,
): AnalysisEvidenceCommentSnapshot[] {
  const groups = buildEvidenceLookup(evidence);
  return (groups.get(clusterKey) ?? []).slice(0, Math.max(0, limit));
}

