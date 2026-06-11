export type DerivedRecordState = "fresh" | "stale" | "absent";

export type DerivedRecordStalenessReason =
  | "source_hash"
  | "generator_version"
  | "source_delta"
  | "updated_after_generated"
  | "missing_provenance";

export interface DerivedRecordIdentity {
  sourceHash?: string | null;
  generatedAt?: string | null;
  generatorVersion?: string | null;
}

export interface DerivedRecordStaleness {
  state: DerivedRecordState;
  stale: boolean;
  reasons: DerivedRecordStalenessReason[];
  stalenessReason: DerivedRecordStalenessReason | null;
}

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAfter(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!isNonEmpty(left) || !isNonEmpty(right)) {
    return false;
  }
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs > rightMs;
}

export function deriveDerivedRecordStaleness({
  record,
  currentSourceHash,
  currentGeneratorVersion,
  sourceCount,
  currentSourceCount,
  sourceDeltaThreshold,
  currentUpdatedAt,
  missingProvenance = false
}: {
  record: DerivedRecordIdentity | null | undefined;
  currentSourceHash?: string | null;
  currentGeneratorVersion?: string | null;
  sourceCount?: number | null;
  currentSourceCount?: number | null;
  sourceDeltaThreshold?: number | null;
  currentUpdatedAt?: string | null;
  missingProvenance?: boolean;
}): DerivedRecordStaleness {
  if (!record) {
    return { state: "absent", stale: false, reasons: [], stalenessReason: null };
  }

  const reasons: DerivedRecordStalenessReason[] = [];
  if (isNonEmpty(currentSourceHash) && (record.sourceHash ?? "") !== currentSourceHash) {
    reasons.push("source_hash");
  }
  if (isNonEmpty(currentGeneratorVersion) && (record.generatorVersion ?? "") !== currentGeneratorVersion) {
    reasons.push("generator_version");
  }
  if (
    typeof sourceCount === "number"
    && Number.isFinite(sourceCount)
    && typeof currentSourceCount === "number"
    && Number.isFinite(currentSourceCount)
    && typeof sourceDeltaThreshold === "number"
    && Number.isFinite(sourceDeltaThreshold)
    && sourceDeltaThreshold > 0
    && Math.abs(currentSourceCount - sourceCount) >= sourceDeltaThreshold
  ) {
    reasons.push("source_delta");
  }
  if (isAfter(currentUpdatedAt, record.generatedAt)) {
    reasons.push("updated_after_generated");
  }
  if (missingProvenance) {
    reasons.push("missing_provenance");
  }

  return {
    state: reasons.length ? "stale" : "fresh",
    stale: reasons.length > 0,
    reasons,
    stalenessReason: reasons[0] ?? null
  };
}
