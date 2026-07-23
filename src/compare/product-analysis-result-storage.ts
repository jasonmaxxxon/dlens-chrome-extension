import type { ProductSignalAnalysis } from "../state/types.ts";
import {
  buildProductAnalysisReadingCacheKey,
  buildProductAnalysisReadingSourcePacketHash,
  canonicalizeProductReadingSupportRefs
} from "./product-analysis-reading.ts";
import {
  PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY,
  loadProductSignalAnalysisMap,
  normalizeProductSignalAnalysisRecord,
  type StorageAreaLike
} from "./product-signal-storage.ts";
import {
  SIGNAL_READINGS_STORAGE_KEY,
  loadSignalReadingMap,
  normalizeSignalReadingRecord,
  type SignalReading
} from "./signal-reading-storage.ts";

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.every((entry, index) => entry === right[index]);
}

function matchesProductAnalysisReadingIdentity(
  analysis: ProductSignalAnalysis,
  reading: SignalReading
): boolean {
  const productReading = analysis.productReading;
  if (!productReading) {
    return false;
  }
  const canonicalAnalysisRefs = canonicalizeProductReadingSupportRefs(
    productReading.supportRefs
  );
  const canonicalReadingRefs = canonicalizeProductReadingSupportRefs(
    reading.sourceRefs
  );
  if (
    reading.signalId !== analysis.signalId
    || reading.productContextHash !== analysis.productContextHash
    || reading.promptVersion !== analysis.promptVersion
    || reading.headline !== productReading.headline
    || reading.reading !== productReading.body
    || !sameStringArray(canonicalReadingRefs, canonicalAnalysisRefs)
    || reading.generatedAt !== analysis.analyzedAt
    || reading.model !== (analysis.model ?? "")
    || reading.origin !== "product_analysis"
    || reading.sourcePacket.analysisPromptVersion !== analysis.promptVersion
  ) {
    return false;
  }
  if (
    buildProductAnalysisReadingSourcePacketHash(reading.sourcePacket)
    !== reading.sourcePacketHash
  ) {
    return false;
  }
  return reading.cacheKey === buildProductAnalysisReadingCacheKey({
    analysis,
    sourcePacketHash: reading.sourcePacketHash
  });
}

function hasSameReviewIdentity(left: SignalReading, right: SignalReading): boolean {
  const leftRefs = canonicalizeProductReadingSupportRefs(left.sourceRefs);
  const rightRefs = canonicalizeProductReadingSupportRefs(right.sourceRefs);
  return left.cacheKey === right.cacheKey
    && left.signalId === right.signalId
    && left.productContextHash === right.productContextHash
    && left.sourcePacketHash === right.sourcePacketHash
    && left.promptVersion === right.promptVersion
    && left.headline === right.headline
    && left.reading === right.reading
    && sameStringArray(leftRefs, rightRefs)
    && left.origin === right.origin
    && JSON.stringify(left.sourcePacket) === JSON.stringify(right.sourcePacket);
}

export async function saveProductAnalysisResult(
  storageArea: StorageAreaLike,
  analysis: ProductSignalAnalysis,
  reading: SignalReading | null
): Promise<{ analysis: ProductSignalAnalysis; reading: SignalReading | null }> {
  const normalizedAnalysis = normalizeProductSignalAnalysisRecord(analysis);
  if (!normalizedAnalysis) {
    throw new Error("Invalid product signal analysis");
  }
  const actionable = normalizedAnalysis.signalType !== "noise"
    && (normalizedAnalysis.verdict === "try" || normalizedAnalysis.verdict === "watch");
  const normalizedReading = actionable && reading
    ? normalizeSignalReadingRecord(reading)
    : null;
  if (actionable && reading && !normalizedReading) {
    throw new Error("Invalid signal reading");
  }
  if (actionable && !normalizedReading) {
    throw new Error("Actionable Product analysis requires a projected reading");
  }
  if (
    normalizedReading
    && !matchesProductAnalysisReadingIdentity(normalizedAnalysis, normalizedReading)
  ) {
    throw new Error("Invalid projected reading identity");
  }

  const [analyses, readings] = await Promise.all([
    loadProductSignalAnalysisMap(storageArea),
    loadSignalReadingMap(storageArea)
  ]);
  const existing = normalizedReading ? readings[normalizedReading.cacheKey] : null;
  const preservedReading: SignalReading | null = normalizedReading
    && existing
    && hasSameReviewIdentity(existing, normalizedReading)
    ? {
        ...normalizedReading,
        reviewState: existing.reviewState,
        feedbackEvents: existing.feedbackEvents
      }
    : normalizedReading
      ? {
          ...normalizedReading,
          reviewState: "pending",
          feedbackEvents: []
        }
      : null;

  await storageArea.set({
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      ...analyses,
      [normalizedAnalysis.signalId]: normalizedAnalysis
    },
    [SIGNAL_READINGS_STORAGE_KEY]: preservedReading
      ? { ...readings, [preservedReading.cacheKey]: preservedReading }
      : readings
  });
  return {
    analysis: normalizedAnalysis,
    reading: preservedReading
  };
}
