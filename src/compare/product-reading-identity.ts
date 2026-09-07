import type { ProductContext, ProductSignalAnalysis } from "../state/types.ts";
import { deriveDerivedRecordStaleness } from "../state/derived-record.ts";
import { buildProductContextHash, PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION } from "./product-signal-analysis.ts";
import { buildProductAnalysisReadingCacheKey, buildProductAnalysisReadingSourcePacketHash, canonicalizeProductReadingSupportRefs } from "./product-analysis-reading.ts";
import type { SignalReading } from "./signal-reading-storage.ts";

/** Shared identity gate for the current card, its brief, and packet projection. */
export function matchesCurrentProductAnalysisReading(
  analysis: ProductSignalAnalysis | null | undefined,
  productContext: ProductContext | null,
  reading: SignalReading | null | undefined
): boolean {
  if (
    !analysis
    || !reading
    || !analysis.signalId?.trim()
    || !analysis.productContextHash?.trim()
    || !analysis.analyzedAt?.trim()
    || analysis.status !== "complete"
    || analysis.promptVersion !== PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION
    || analysis.signalType === "noise"
    || (analysis.verdict !== "try" && analysis.verdict !== "watch")
    || !analysis.productReading
    || reading.origin !== "product_analysis"
    || reading.signalId !== analysis.signalId
    || reading.productContextHash !== analysis.productContextHash
    || reading.promptVersion !== analysis.promptVersion
    || reading.sourcePacket.analysisPromptVersion !== analysis.promptVersion
    || reading.headline !== analysis.productReading.headline
    || reading.reading !== analysis.productReading.body
    || reading.generatedAt !== analysis.analyzedAt
    || reading.model !== (analysis.model ?? "")
  ) {
    return false;
  }
  if (productContext) {
    const staleness = deriveDerivedRecordStaleness({
      record: {
        sourceHash: analysis.productContextHash,
        generatorVersion: analysis.promptVersion,
        generatedAt: analysis.analyzedAt
      },
      currentSourceHash: buildProductContextHash(productContext),
      currentGeneratorVersion: PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
      currentUpdatedAt: productContext.compiledAt
    });
    if (staleness.stale) {
      return false;
    }
  }
  const readingRefs = canonicalizeProductReadingSupportRefs(reading.sourceRefs);
  const analysisRefs = canonicalizeProductReadingSupportRefs(
    analysis.productReading.supportRefs
  );
  if (
    readingRefs.length !== analysisRefs.length
    || readingRefs.some((ref, index) => ref !== analysisRefs[index])
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
