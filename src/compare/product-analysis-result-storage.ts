import type { ProductSignalAnalysis } from "../state/types.ts";
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

export async function saveProductAnalysisResult(
  storageArea: StorageAreaLike,
  analysis: ProductSignalAnalysis,
  reading: SignalReading | null
): Promise<{ analysis: ProductSignalAnalysis; reading: SignalReading | null }> {
  const normalizedAnalysis = normalizeProductSignalAnalysisRecord(analysis);
  if (!normalizedAnalysis) {
    throw new Error("Invalid product signal analysis");
  }
  const normalizedReading = reading ? normalizeSignalReadingRecord(reading) : null;
  if (reading && !normalizedReading) {
    throw new Error("Invalid signal reading");
  }
  if (
    (normalizedAnalysis.verdict === "try" || normalizedAnalysis.verdict === "watch")
    && !normalizedReading
  ) {
    throw new Error("Actionable Product analysis requires a projected reading");
  }

  const [analyses, readings] = await Promise.all([
    loadProductSignalAnalysisMap(storageArea),
    loadSignalReadingMap(storageArea)
  ]);
  const existing = normalizedReading ? readings[normalizedReading.cacheKey] : null;
  const preservedReading = normalizedReading && existing
    ? {
        ...normalizedReading,
        reviewState: existing.reviewState,
        feedbackEvents: existing.feedbackEvents
      }
    : normalizedReading;

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
