export interface ContextComment {
  id?: string;
  text?: string;
  like_count?: number;
  reply_count?: number;
  parent_comment_id?: string;
}

export interface ContextCard {
  focus_comment: {
    internal_id: string;
    text: string;
    like_count: number;
    reply_count: number;
  };
  parent_comment?: {
    internal_id: string | null;
    text: string | null;
  } | null;
  root_post: { text: string | null };
  siblings_sample: Array<{ internal_id: string | undefined; text: string }>;
  cluster_metrics: Record<string, unknown>;
  context_integrity: "ok" | "weak";
  truncation?: boolean;
}

export interface SelectContextCardsInput {
  goldenDetail: Record<string, { comment_id?: string }>;
  commentsById: Record<string, ContextComment>;
  commentsByParent: Record<string, ContextComment[]>;
  rootPostText: string;
  clusterMetrics: Record<string, unknown>;
  maxCards?: number;
}

export interface SelectContextCardsResult {
  contextCards: ContextCard[];
  evidenceIds: string[];
}

export interface ClusterInterpretationSeed {
  cluster_id: number;
  cluster_metrics: Record<string, unknown>;
  context_cards: ContextCard[];
  allowed_evidence_ids: string[];
  required_evidence_ids: string[];
}

export interface ClusterOneLinerPayload {
  cluster_id: number;
  label?: string;
  one_liner?: string;
  label_style?: string;
  evidence_ids?: string[];
}

const ROLE_ORDER = ["central", "leader", "bridge", "radical", "counter", "random"] as const;
const FIELD_LIMITS = {
  focus: 200,
  parent: 120,
  root: 120,
  sibling: 80,
};

function truncate(text: string | undefined, limit: number): { text: string; truncated: boolean } {
  const value = String(text ?? "").trim();
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: `${value.slice(0, limit).trimEnd()}...`, truncated: true };
}

function hasCjk(text: string): boolean {
  let count = 0;
  for (const char of text) {
    if (char >= "\u4e00" && char <= "\u9fff") {
      count += 1;
      if (count >= 2) return true;
    }
  }
  return false;
}

export function selectContextCards(
  input: SelectContextCardsInput,
): SelectContextCardsResult {
  const contextCards: ContextCard[] = [];
  const evidenceIds: string[] = [];
  const usedIds = new Set<string>();
  const maxCards = Math.max(1, input.maxCards ?? 6);

  for (const role of ROLE_ORDER) {
    const commentId = String(input.goldenDetail[role]?.comment_id ?? "").trim();
    if (!commentId || usedIds.has(commentId)) continue;

    usedIds.add(commentId);
    evidenceIds.push(commentId);

    const focus = input.commentsById[commentId] ?? {};
    const parentId = focus.parent_comment_id ? String(focus.parent_comment_id) : null;
    const parent = parentId ? input.commentsById[parentId] : undefined;
    const siblings = parentId
      ? (input.commentsByParent[parentId] ?? []).filter((candidate) => String(candidate.id ?? "") !== commentId)
      : [];
    const sortedSiblings = [...siblings].sort((left, right) => {
      const likeDelta = (right.like_count ?? 0) - (left.like_count ?? 0);
      if (likeDelta !== 0) return likeDelta;
      return (String(left.id ?? "")).localeCompare(String(right.id ?? ""));
    });

    const focusText = truncate(focus.text, FIELD_LIMITS.focus);
    const parentText = truncate(parent?.text, FIELD_LIMITS.parent);
    const rootText = truncate(input.rootPostText, FIELD_LIMITS.root);
    const siblingCards = sortedSiblings.slice(0, 2).map((sibling) => {
      const text = truncate(sibling.text, FIELD_LIMITS.sibling);
      return {
        internal_id: sibling.id,
        text: text.text,
        truncated: text.truncated,
      };
    });

    const hasTruncation =
      focusText.truncated ||
      parentText.truncated ||
      rootText.truncated ||
      siblingCards.some((sibling) => sibling.truncated);

    contextCards.push({
      focus_comment: {
        internal_id: commentId,
        text: focusText.text,
        like_count: focus.like_count ?? 0,
        reply_count: focus.reply_count ?? 0,
      },
      parent_comment: parentId
        ? {
            internal_id: parentId,
            text: parentText.text || null,
          }
        : null,
      root_post: { text: rootText.text || null },
      siblings_sample: siblingCards.map(({ internal_id, text }) => ({ internal_id, text })),
      cluster_metrics: input.clusterMetrics,
      context_integrity: parentId && parent ? "ok" : "weak",
      ...(hasTruncation ? { truncation: true } : {}),
    });

    if (contextCards.length >= maxCards) break;
  }

  return { contextCards, evidenceIds };
}

export function buildClusterInterpretationSeed(input: {
  clusterKey: number;
  clusterMetrics: Record<string, unknown>;
  contextCards: ContextCard[];
  evidenceIds: string[];
}): ClusterInterpretationSeed {
  return {
    cluster_id: input.clusterKey,
    cluster_metrics: input.clusterMetrics,
    context_cards: input.contextCards,
    allowed_evidence_ids: [...input.evidenceIds],
    required_evidence_ids: [...input.evidenceIds],
  };
}

export function validateClusterOneLinerPayload(
  payload: ClusterOneLinerPayload,
  allowedIds: readonly string[],
  requiredIds: readonly string[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const label = String(payload.label ?? "").trim();
  const oneLiner = String(payload.one_liner ?? "").trim();
  const labelStyle = String(payload.label_style ?? "").trim().toLowerCase();
  const evidenceIds = Array.isArray(payload.evidence_ids)
    ? payload.evidence_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];

  if (!label || !oneLiner) {
    errors.push("missing_label_or_one_liner");
  }
  if (label && !hasCjk(label)) {
    errors.push("label_not_traditional_chinese");
  }
  if (oneLiner && !hasCjk(oneLiner)) {
    errors.push("one_liner_not_traditional_chinese");
  }
  if (labelStyle !== "descriptive") {
    errors.push("label_style_not_descriptive");
  }
  if (evidenceIds.length < 2) {
    errors.push("insufficient_evidence_ids");
  }
  if (evidenceIds.some((id) => !allowedIds.includes(id))) {
    errors.push("evidence_id_not_allowed");
  }
  if (requiredIds.some((id) => id && !evidenceIds.includes(id))) {
    errors.push("missing_required_evidence");
  }

  return { ok: errors.length === 0, errors };
}
