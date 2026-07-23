import type { ProductSignalAnalysis } from "../state/types.ts";
import type { ProductSignalAnalyzerInput } from "./product-signal-analysis.ts";
import {
  buildSignalReadingCacheKey,
  type SignalReading
} from "./signal-reading-storage.ts";
import type { SignalReadingSourcePacket } from "./signal-reading.ts";

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildProductAnalysisReadingSourcePacketHash(
  sourcePacket: SignalReadingSourcePacket
): string {
  return hashText(JSON.stringify(sourcePacket));
}

export function buildProductAnalysisReadingCacheKey({
  analysis,
  sourcePacketHash
}: {
  analysis: ProductSignalAnalysis;
  sourcePacketHash: string;
}): string {
  if (!analysis.productReading) {
    throw new Error("Product analysis is missing productReading");
  }
  return buildSignalReadingCacheKey({
    signalId: analysis.signalId,
    productContextHash: analysis.productContextHash,
    sourcePacketHash,
    promptVersion: analysis.promptVersion,
    contentHash: hashText(JSON.stringify(analysis.productReading))
  });
}

export function materializeProductAnalysisReading({
  analysis,
  analyzerInput,
  postUrl
}: {
  analysis: ProductSignalAnalysis;
  analyzerInput: ProductSignalAnalyzerInput;
  postUrl: string;
}): SignalReading | null {
  const productReading = analysis.productReading;
  if (analysis.verdict !== "try" && analysis.verdict !== "watch") {
    return null;
  }
  if (!productReading) {
    throw new Error("Actionable Product analysis is missing productReading");
  }

  const sourcePacket = {
    rootText: analyzerInput.rootText,
    assembledContent: analyzerInput.assembledContent.slice(0, 8000),
    postUrl,
    representativeComments: analyzerInput.discussionReplies.slice(0, 20).map((reply, index) => ({
      ref: `e${index + 1}`,
      author: reply.author,
      text: reply.text.slice(0, 500),
      likeCount: reply.likeCount ?? null
    })),
    analysisPromptVersion: analysis.promptVersion
  };
  const sourcePacketHash = buildProductAnalysisReadingSourcePacketHash(sourcePacket);
  const cacheKey = buildProductAnalysisReadingCacheKey({
    analysis,
    sourcePacketHash
  });

  return {
    signalId: analysis.signalId,
    cacheKey,
    productContextHash: analysis.productContextHash,
    sourcePacketHash,
    promptVersion: analysis.promptVersion,
    headline: productReading.headline,
    reading: productReading.body,
    generatedAt: analysis.analyzedAt,
    model: analysis.model ?? "",
    sourceRefs: [...productReading.supportRefs],
    sourcePacket,
    origin: "product_analysis",
    reviewState: "pending",
    feedbackEvents: []
  };
}
