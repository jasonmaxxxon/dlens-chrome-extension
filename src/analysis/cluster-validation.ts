interface ClusterOneLinerPayload {
  cluster_id: number;
  label?: string;
  one_liner?: string;
  label_style?: string;
  evidence_ids?: string[];
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
