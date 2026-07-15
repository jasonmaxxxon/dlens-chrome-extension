import type {
  PrNarrativeAlignment,
  PrNarrativeClaim,
  PrNarrativeEvidenceRef,
  PrNarrativeMode,
  PrNarrativeRead
} from "../compare/pr-narrative.ts";
import { createAsyncLock } from "./snapshot-lock.ts";
import type { StorageAreaLike } from "./topic-storage.ts";

export const PR_NARRATIVE_READS_STORAGE_KEY = "dlens:v1:pr-narrative-reads";

const withPrNarrativeReadMapWriteLock = createAsyncLock();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const entries = value.map(text);
  if (entries.some((entry) => !entry) || new Set(entries).size !== entries.length) {
    return null;
  }
  return entries;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function narrativeMode(value: unknown): PrNarrativeMode | null {
  return value === "attitude" || value === "experience" || value === "behavior" || value === "actionable"
    ? value
    : null;
}

function narrativeAlignment(value: unknown): PrNarrativeAlignment | null {
  return value === "challenges" || value === "mixed" || value === "echoes" ? value : null;
}

function normalizeEvidenceRefs(
  value: unknown,
  sourceRowIds: ReadonlySet<string>,
  allowEmpty: boolean
): PrNarrativeEvidenceRef[] | null {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    return null;
  }
  const refs: PrNarrativeEvidenceRef[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const raw = entry as Record<string, unknown>;
    const rowId = text(raw.rowId);
    const summary = text(raw.summary);
    if (!rowId || !summary || !sourceRowIds.has(rowId) || seen.has(rowId)) {
      return null;
    }
    seen.add(rowId);
    refs.push({ rowId, summary });
  }
  return refs;
}

function normalizeClaim(value: unknown, sourceRowIds: ReadonlySet<string>): PrNarrativeClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = text(raw.id);
  const title = text(raw.title);
  const statement = text(raw.statement);
  const implication = text(raw.implication);
  const mode = narrativeMode(raw.mode);
  const alignment = narrativeAlignment(raw.alignment);
  const supportRefs = normalizeEvidenceRefs(raw.supportRefs, sourceRowIds, false);
  const counterRefs = normalizeEvidenceRefs(raw.counterRefs, sourceRowIds, true);
  if (!id || !title || !statement || !implication || !mode || !alignment || !supportRefs || !counterRefs) {
    return null;
  }
  const supportIds = new Set(supportRefs.map((ref) => ref.rowId));
  if (counterRefs.some((ref) => supportIds.has(ref.rowId))) {
    return null;
  }
  return { id, title, statement, implication, mode, alignment, supportRefs, counterRefs };
}

export function normalizePrNarrativeRead(value: unknown): PrNarrativeRead | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) {
    return null;
  }
  const campaignId = text(raw.campaignId);
  const sourceRowIds = uniqueStrings(raw.sourceRowIds);
  const collectedRowCount = integer(raw.collectedRowCount);
  const snippetFallbackCount = integer(raw.snippetFallbackCount);
  const sourceHash = text(raw.sourceHash);
  const promptVersion = text(raw.promptVersion);
  const provider = text(raw.provider);
  const model = text(raw.model);
  const generatedAt = text(raw.generatedAt);
  if (
    !campaignId
    || !sourceRowIds
    || collectedRowCount === null
    || collectedRowCount < sourceRowIds.length
    || snippetFallbackCount === null
    || snippetFallbackCount > sourceRowIds.length
    || !sourceHash
    || !promptVersion
    || !provider
    || !model
    || !generatedAt
  ) {
    return null;
  }
  if (raw.status !== "complete" && raw.status !== "insufficient_evidence") {
    return null;
  }
  if (!Array.isArray(raw.claims)) {
    return null;
  }
  const sourceRowIdSet = new Set(sourceRowIds);
  const claims = raw.claims.map((claim) => normalizeClaim(claim, sourceRowIdSet));
  if (claims.some((claim) => claim === null)) {
    return null;
  }
  const normalizedClaims = claims as PrNarrativeClaim[];
  const claimIds = normalizedClaims.map((claim) => claim.id);
  if (new Set(claimIds).size !== claimIds.length) {
    return null;
  }
  const priorityClaimId = raw.priorityClaimId === null ? null : text(raw.priorityClaimId);
  if (raw.status === "insufficient_evidence") {
    if (priorityClaimId !== null || normalizedClaims.length !== 0) {
      return null;
    }
  } else if (
    sourceRowIds.length === 0
    || normalizedClaims.length < 2
    || normalizedClaims.length > 4
    || !priorityClaimId
    || !claimIds.includes(priorityClaimId)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    campaignId,
    sourceRowIds,
    collectedRowCount,
    snippetFallbackCount,
    sourceHash,
    promptVersion,
    provider,
    model,
    generatedAt,
    status: raw.status,
    priorityClaimId,
    claims: normalizedClaims
  };
}

function normalizePrNarrativeReadMap(value: unknown): Record<string, PrNarrativeRead> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.create(null) as Record<string, PrNarrativeRead>;
  }
  const result = Object.create(null) as Record<string, PrNarrativeRead>;
  for (const [campaignId, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizePrNarrativeRead(entry);
    if (normalized && normalized.campaignId === campaignId) {
      result[campaignId] = normalized;
    }
  }
  return result;
}

async function readPrNarrativeReadMap(storageArea: StorageAreaLike): Promise<Record<string, PrNarrativeRead>> {
  const raw = await storageArea.get(PR_NARRATIVE_READS_STORAGE_KEY);
  return normalizePrNarrativeReadMap(raw[PR_NARRATIVE_READS_STORAGE_KEY]);
}

export async function loadPrNarrativeRead(
  storageArea: StorageAreaLike,
  campaignId: string
): Promise<PrNarrativeRead | null> {
  const map = await readPrNarrativeReadMap(storageArea);
  const key = campaignId.trim();
  return Object.hasOwn(map, key) ? map[key] ?? null : null;
}

export async function savePrNarrativeRead(
  storageArea: StorageAreaLike,
  read: PrNarrativeRead,
  validateBeforeWrite?: () => void | Promise<void>
): Promise<PrNarrativeRead> {
  const normalized = normalizePrNarrativeRead(read);
  if (!normalized) {
    throw new Error("Invalid PR narrative read");
  }
  return withPrNarrativeReadMapWriteLock(async () => {
    await validateBeforeWrite?.();
    const map = await readPrNarrativeReadMap(storageArea);
    await storageArea.set({
      [PR_NARRATIVE_READS_STORAGE_KEY]: {
        ...map,
        [normalized.campaignId]: normalized
      }
    });
    return normalized;
  });
}
