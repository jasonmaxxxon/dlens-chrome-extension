import type { StorageAreaLike } from "./product-signal-storage.ts";
import type { SignalReadingComment, SignalReadingSourcePacket } from "./signal-reading.ts";

export const SIGNAL_READINGS_STORAGE_KEY = "dlens:v1:signal-readings";

export type SignalReadingReviewState = "pending" | "filed" | "deferred" | "rejected";
// 中文對應：待 review / 收錄 / 待看 / 退回

export type SignalReadingFeedbackType = "filed" | "deferred" | "rejected" | "added_to_brief";

export interface SignalReadingFeedbackEvent {
  type: SignalReadingFeedbackType;
  at: string;
  note?: string;
}

export interface SignalReadingStaleness {
  stale: boolean;
  reasons: ("prompt_version" | "missing_provenance")[];
}

export interface SignalReading {
  signalId: string;
  cacheKey: string;
  productContextHash: string;
  sourcePacketHash: string;
  promptVersion: string;
  reading: string;
  generatedAt: string;
  model: string;
  sourceRefs: string[];
  sourcePacket: SignalReadingSourcePacket;
  reviewState: SignalReadingReviewState;
  feedbackEvents: SignalReadingFeedbackEvent[];
}

export function buildSignalReadingCacheKey(parts: {
  signalId: string;
  productContextHash: string;
  sourcePacketHash: string;
  promptVersion: string;
}): string {
  return [parts.signalId, parts.productContextHash, parts.sourcePacketHash, parts.promptVersion].join("::");
}

function normalizeSourcePacket(value: unknown): SignalReadingSourcePacket {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const comments = Array.isArray(raw.representativeComments) ? raw.representativeComments : [];
  return {
    assembledContent: typeof raw.assembledContent === "string" ? raw.assembledContent : "",
    postUrl: typeof raw.postUrl === "string" ? raw.postUrl : "",
    representativeComments: comments
      .map((entry): SignalReadingComment | null => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }
        const comment = entry as Record<string, unknown>;
        const ref = typeof comment.ref === "string" ? comment.ref : "";
        if (!ref) {
          return null;
        }
        return {
          ref,
          author: typeof comment.author === "string" ? comment.author : "",
          text: typeof comment.text === "string" ? comment.text : ""
        };
      })
      .filter((comment): comment is SignalReadingComment => comment !== null),
    analysisPromptVersion: typeof raw.analysisPromptVersion === "string" ? raw.analysisPromptVersion : ""
  };
}

function normalizeReviewState(value: unknown): SignalReadingReviewState {
  return value === "filed" || value === "deferred" || value === "rejected" ? value : "pending";
}

function normalizeFeedbackEvents(value: unknown): SignalReadingFeedbackEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): SignalReadingFeedbackEvent | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const type = raw.type;
      if (type !== "filed" && type !== "deferred" && type !== "rejected" && type !== "added_to_brief") {
        return null;
      }
      const at = typeof raw.at === "string" ? raw.at : "";
      if (!at) {
        return null;
      }
      const note = typeof raw.note === "string" ? raw.note : undefined;
      return note ? { type, at, note } : { type, at };
    })
    .filter((event): event is SignalReadingFeedbackEvent => event !== null);
}

function normalizeSignalReading(value: unknown): SignalReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const signalId = typeof raw.signalId === "string" ? raw.signalId.trim() : "";
  const cacheKey = typeof raw.cacheKey === "string" ? raw.cacheKey.trim() : "";
  const reading = typeof raw.reading === "string" ? raw.reading.trim() : "";
  const generatedAt = typeof raw.generatedAt === "string" ? raw.generatedAt.trim() : "";
  if (!signalId || !cacheKey || !reading || !generatedAt) {
    return null;
  }
  return {
    signalId,
    cacheKey,
    productContextHash: typeof raw.productContextHash === "string" ? raw.productContextHash : "",
    sourcePacketHash: typeof raw.sourcePacketHash === "string" ? raw.sourcePacketHash : "",
    promptVersion: typeof raw.promptVersion === "string" ? raw.promptVersion : "",
    reading,
    generatedAt,
    model: typeof raw.model === "string" ? raw.model : "",
    sourceRefs: Array.isArray(raw.sourceRefs)
      ? raw.sourceRefs.filter((ref): ref is string => typeof ref === "string")
      : [],
    sourcePacket: normalizeSourcePacket(raw.sourcePacket),
    reviewState: normalizeReviewState(raw.reviewState),
    feedbackEvents: normalizeFeedbackEvents(raw.feedbackEvents)
  };
}

async function readReadingMap(storageArea: StorageAreaLike): Promise<Record<string, SignalReading>> {
  const raw = await storageArea.get(SIGNAL_READINGS_STORAGE_KEY);
  const entries = raw[SIGNAL_READINGS_STORAGE_KEY];
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(entries as Record<string, unknown>)
      .map(([key, value]) => [key, normalizeSignalReading(value)] as const)
      .filter((entry): entry is readonly [string, SignalReading] => entry[1] !== null)
  );
}

export async function getSignalReading(
  storageArea: StorageAreaLike,
  cacheKey: string
): Promise<SignalReading | null> {
  const map = await readReadingMap(storageArea);
  return map[cacheKey] ?? null;
}

export async function saveSignalReading(
  storageArea: StorageAreaLike,
  reading: SignalReading
): Promise<SignalReading> {
  const normalized = normalizeSignalReading(reading);
  if (!normalized) {
    throw new Error("Invalid signal reading");
  }
  const map = await readReadingMap(storageArea);
  await storageArea.set({ [SIGNAL_READINGS_STORAGE_KEY]: { ...map, [normalized.cacheKey]: normalized } });
  return normalized;
}

export async function listSignalReadings(storageArea: StorageAreaLike): Promise<SignalReading[]> {
  const map = await readReadingMap(storageArea);
  return Object.values(map).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
}

/** Latest reading per signal, by generatedAt — what §1 READING REVIEW shows per signal row. */
export function latestReadingBySignalId(readings: SignalReading[]): Map<string, SignalReading> {
  const map = new Map<string, SignalReading>();
  for (const reading of readings) {
    const existing = map.get(reading.signalId);
    if (!existing || reading.generatedAt > existing.generatedAt) {
      map.set(reading.signalId, reading);
    }
  }
  return map;
}

/** Record a review decision: appends a feedback event and sets reviewState atomically. */
export async function appendSignalReadingReview(
  storageArea: StorageAreaLike,
  cacheKey: string,
  decision: "filed" | "deferred" | "rejected",
  note?: string
): Promise<SignalReading | null> {
  const map = await readReadingMap(storageArea);
  const existing = map[cacheKey];
  if (!existing) {
    return null;
  }
  const event: SignalReadingFeedbackEvent = note
    ? { type: decision, at: new Date().toISOString(), note }
    : { type: decision, at: new Date().toISOString() };
  const updated: SignalReading = {
    ...existing,
    reviewState: decision,
    feedbackEvents: [...existing.feedbackEvents, event]
  };
  await storageArea.set({ [SIGNAL_READINGS_STORAGE_KEY]: { ...map, [cacheKey]: updated } });
  return updated;
}

/** Unified staleness signal — one banner mechanism for both reasons (see contract §6). */
export function signalReadingStaleness(
  reading: SignalReading,
  currentPromptVersion: string
): SignalReadingStaleness {
  const reasons: SignalReadingStaleness["reasons"] = [];
  if (reading.promptVersion !== currentPromptVersion) {
    reasons.push("prompt_version");
  }
  if (!reading.model || !reading.sourcePacket.assembledContent) {
    reasons.push("missing_provenance");
  }
  return { stale: reasons.length > 0, reasons };
}

export const signalReadingStorageTestables = {
  normalizeSignalReading
};
