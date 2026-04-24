import type { SavedAnalysisSnapshot } from "../state/types.ts";
import { COMPARE_BRIEF_PROMPT_VERSION } from "./provider.ts";

export const SAVED_ANALYSES_STORAGE_KEY = "dlens:v1:saved-analyses";

interface StorageAreaLike {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBriefSource(value: unknown): SavedAnalysisSnapshot["briefSource"] {
  return value === "ai" || value === "fallback" || value === "unknown" ? value : "unknown";
}

function readJudgmentSource(value: unknown): NonNullable<SavedAnalysisSnapshot["judgmentSource"]> | null {
  return value === "ai" || value === "fallback" || value === "unknown" ? value : null;
}

function readJudgmentRecommendedState(value: unknown): NonNullable<SavedAnalysisSnapshot["judgmentResult"]>["recommendedState"] | null {
  return value === "park" || value === "watch" || value === "act" ? value : null;
}

function readJudgmentRelevance(value: unknown): NonNullable<SavedAnalysisSnapshot["judgmentResult"]>["relevance"] | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}

function readJudgmentResult(value: unknown): SavedAnalysisSnapshot["judgmentResult"] {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const relevance = readJudgmentRelevance(raw.relevance);
  const recommendedState = readJudgmentRecommendedState(raw.recommendedState ?? raw.recommended_state);
  const whyThisMatters = readString(raw.whyThisMatters ?? raw.why_this_matters).trim();
  const actionCue = readString(raw.actionCue ?? raw.action_cue).trim();

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

export function normalizeSavedAnalysisSnapshot(value: unknown): SavedAnalysisSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const resultId = readString(raw.resultId).trim();
  const compareKey = readString(raw.compareKey).trim();
  const itemAId = readString(raw.itemAId).trim();
  const itemBId = readString(raw.itemBId).trim();
  const headline = readString(raw.headline).trim();
  const deck = readString(raw.deck).trim();

  if (!resultId || !compareKey || !itemAId || !itemBId || !headline || !deck) {
    return null;
  }

  return {
    resultId,
    compareKey,
    itemAId,
    itemBId,
    sourceLabelA: readString(raw.sourceLabelA, "@unknown").trim() || "@unknown",
    sourceLabelB: readString(raw.sourceLabelB, "@unknown").trim() || "@unknown",
    headline,
    deck,
    primaryTensionSummary: readString(raw.primaryTensionSummary).trim() || deck,
    groupSummary: readString(raw.groupSummary).trim(),
    totalComments: readNumber(raw.totalComments, 0),
    dateRangeLabel: readString(raw.dateRangeLabel).trim(),
    savedAt: readString(raw.savedAt, "1970-01-01T00:00:00.000Z").trim() || "1970-01-01T00:00:00.000Z",
    analysisVersion: readString(raw.analysisVersion, "unknown").trim() || "unknown",
    briefVersion: readString(raw.briefVersion, "unknown").trim() || "unknown",
    briefSource: readBriefSource(raw.briefSource),
    judgmentResult: readJudgmentResult(raw.judgmentResult),
    judgmentVersion: readString(raw.judgmentVersion).trim() || null,
    judgmentSource: readJudgmentSource(raw.judgmentSource)
  };
}

export function buildSavedAnalysisSnapshot(
  input: Omit<SavedAnalysisSnapshot, "primaryTensionSummary" | "analysisVersion" | "briefVersion" | "judgmentResult" | "judgmentVersion" | "judgmentSource">
): SavedAnalysisSnapshot {
  return {
    ...input,
    primaryTensionSummary: input.deck,
    analysisVersion: "v1",
    briefVersion: COMPARE_BRIEF_PROMPT_VERSION,
    judgmentResult: null,
    judgmentVersion: null,
    judgmentSource: null
  };
}

export async function loadSavedAnalyses(storageArea: StorageAreaLike): Promise<SavedAnalysisSnapshot[]> {
  const raw = await storageArea.get(SAVED_ANALYSES_STORAGE_KEY);
  const entries = Array.isArray(raw[SAVED_ANALYSES_STORAGE_KEY]) ? raw[SAVED_ANALYSES_STORAGE_KEY] : [];
  return entries
    .map((entry) => normalizeSavedAnalysisSnapshot(entry))
    .filter((entry): entry is SavedAnalysisSnapshot => entry !== null);
}

async function writeSavedAnalyses(
  storageArea: StorageAreaLike,
  snapshots: SavedAnalysisSnapshot[]
): Promise<SavedAnalysisSnapshot[]> {
  await storageArea.set({ [SAVED_ANALYSES_STORAGE_KEY]: snapshots });
  return snapshots;
}

export async function saveSavedAnalysis(
  storageArea: StorageAreaLike,
  snapshot: SavedAnalysisSnapshot
): Promise<SavedAnalysisSnapshot[]> {
  const normalized = normalizeSavedAnalysisSnapshot(snapshot);
  if (!normalized) {
    throw new Error("Invalid saved analysis snapshot");
  }
  const existing = await loadSavedAnalyses(storageArea);
  const deduped = existing.filter((entry) => entry.resultId !== normalized.resultId);
  const next = [normalized, ...deduped].slice(0, 100);
  return writeSavedAnalyses(storageArea, next);
}

export async function saveSavedAnalysisJudgment(
  storageArea: StorageAreaLike,
  input: {
    resultId: string;
    judgmentResult: SavedAnalysisSnapshot["judgmentResult"];
    judgmentVersion: SavedAnalysisSnapshot["judgmentVersion"];
    judgmentSource: SavedAnalysisSnapshot["judgmentSource"];
  }
): Promise<SavedAnalysisSnapshot[]> {
  const existing = await loadSavedAnalyses(storageArea);
  const targetIndex = existing.findIndex((entry) => entry.resultId === input.resultId);
  if (targetIndex === -1) {
    throw new Error("Saved analysis snapshot not found");
  }

  const updated = normalizeSavedAnalysisSnapshot({
    ...existing[targetIndex],
    judgmentResult: input.judgmentResult ?? null,
    judgmentVersion: input.judgmentVersion ?? null,
    judgmentSource: input.judgmentSource ?? null
  });
  if (!updated) {
    throw new Error("Invalid saved analysis judgment update");
  }

  const next = [...existing];
  next[targetIndex] = updated;
  return writeSavedAnalyses(storageArea, next);
}
