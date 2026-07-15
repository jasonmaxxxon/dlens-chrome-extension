import {
  buildPrNarrativePostReadPrompt,
  buildPrNarrativeSnapshot,
  chunkPrNarrativeSources,
  materializePrNarrativeRead,
  PrNarrativeValidationError,
  type PrNarrativePostReading,
  type PrNarrativeRead,
  type PrNarrativeSnapshot,
  type PrNarrativeSynthesisDraft
} from "../compare/pr-narrative.ts";
import { emitPipelineEvent } from "./pipeline-trace.ts";
import type { PrCampaign, PrEvidenceRow, PrNarrativeSettings } from "./pr-evidence-storage.ts";
import { normalizePrNarrativeSettings } from "./pr-evidence-storage.ts";
import { loadPrNarrativeRead, savePrNarrativeRead } from "./pr-narrative-storage.ts";
import type { StorageAreaLike } from "./topic-storage.ts";
import type { SessionRecord } from "./types.ts";

export type PrNarrativeProvider = "openai" | "claude" | "google";

export type GeneratePrNarrativePostReadings = (
  provider: PrNarrativeProvider,
  apiKey: string,
  prompt: string,
  expectedRefs: string[],
  traceLabel?: string
) => Promise<PrNarrativePostReading[]>;

export type GeneratePrNarrativeSynthesis = (
  provider: PrNarrativeProvider,
  apiKey: string,
  readings: PrNarrativePostReading[],
  campaign: PrCampaign,
  traceLabel?: string
) => Promise<PrNarrativeSynthesisDraft>;

export type VerifyPrNarrativeSourceHash = (sourceHash: string) => Promise<boolean>;

export class PrNarrativeSourceChangedError extends Error {
  constructor() {
    super("PR narrative source changed during generation. Run the narrative read again.");
    this.name = "PrNarrativeSourceChangedError";
  }
}

export interface PrNarrativeReadState {
  read: PrNarrativeRead | null;
  currentSourceHash: string;
  settings: PrNarrativeSettings;
}

export async function getPrNarrativeReadState({
  storageArea,
  campaign,
  rows,
  session
}: {
  storageArea: StorageAreaLike;
  campaign: PrCampaign;
  rows: readonly PrEvidenceRow[];
  session: SessionRecord;
}): Promise<PrNarrativeReadState> {
  const snapshot = await buildPrNarrativeSnapshot({ campaign, rows, session });
  return {
    read: await loadPrNarrativeRead(storageArea, campaign.id),
    currentSourceHash: snapshot.sourceHash,
    settings: normalizePrNarrativeSettings(campaign.narrativeSettings)
  };
}

// When a stage fails validation, name the exact posts behind each flagged ref so
// the surfaced error says which article (author + URL) and which sentence broke.
function enrichValidationError(error: unknown, snapshot: PrNarrativeSnapshot): unknown {
  if (!(error instanceof PrNarrativeValidationError)) {
    return error;
  }
  const sourceByRef = new Map(snapshot.sources.map((source) => [source.ref, source]));
  const refs = [...new Set(
    error.violations.flatMap((violation) => violation.context.match(/\bP\d{2,}\b/g) ?? [])
  )];
  const refLines = refs
    .map((ref) => sourceByRef.get(ref))
    .filter((source): source is NonNullable<typeof source> => Boolean(source))
    .map((source) => `${source.ref} = @${source.authorHandle.replace(/^@/, "")} ${source.sourceUrl}`);
  if (!refLines.length) {
    return error;
  }
  return new PrNarrativeValidationError(error.violations, `${error.message}\n${refLines.join("\n")}`);
}

export async function runPrNarrativeRead({
  storageArea,
  campaign,
  rows,
  session,
  provider,
  apiKey,
  model,
  generatePostReadings,
  generateSynthesis,
  verifyCurrentSourceHash,
  now,
  requestId
}: {
  storageArea: StorageAreaLike;
  campaign: PrCampaign;
  rows: readonly PrEvidenceRow[];
  session: SessionRecord;
  provider: PrNarrativeProvider;
  apiKey: string;
  model: string;
  generatePostReadings: GeneratePrNarrativePostReadings;
  generateSynthesis: GeneratePrNarrativeSynthesis;
  verifyCurrentSourceHash: VerifyPrNarrativeSourceHash;
  now: string;
  requestId?: string;
}): Promise<PrNarrativeRead> {
  const normalizedApiKey = apiKey.trim();
  const normalizedModel = model.trim();
  const generatedAt = now.trim();
  if (!normalizedApiKey) {
    throw new Error("A configured PR narrative provider API key is required.");
  }
  if (!normalizedModel || !generatedAt) {
    throw new Error("PR narrative provider model and generation time are required.");
  }

  const snapshot = await buildPrNarrativeSnapshot({ campaign, rows, session });
  if (!snapshot.sources.length) {
    throw new Error("No readable collected Threads posts are available for narrative reading.");
  }

  const target = { sessionId: campaign.sessionId };
  const chunks = chunkPrNarrativeSources(snapshot.sources);
  emitPipelineEvent({
    phase: "llm.call",
    step: "pr-narrative.run.start",
    target,
    result: "pending",
    requestId,
    detail: {
      campaignId: campaign.id,
      sourceCount: snapshot.sources.length,
      stageAChunkCount: chunks.length,
      chunkRefs: chunks.map((sources) => sources.map((source) => source.ref))
    }
  });

  try {
    const postReadings: PrNarrativePostReading[] = [];
    for (const [chunkIndex, sources] of chunks.entries()) {
      const expectedRefs = sources.map((source) => source.ref);
      const prompt = buildPrNarrativePostReadPrompt(campaign, sources);
      const traceLabel = `pr-narrative.stageA.${chunkIndex + 1}of${chunks.length}`;
      const readings = await generatePostReadings(provider, normalizedApiKey, prompt, expectedRefs, traceLabel);
      postReadings.push(...readings);
      emitPipelineEvent({
        phase: "llm.call",
        step: `${traceLabel}.done`,
        target,
        result: "ok",
        requestId,
        detail: { refs: expectedRefs }
      });
    }

    const synthesis = await generateSynthesis(provider, normalizedApiKey, postReadings, campaign, "pr-narrative.stageB");
    const read = materializePrNarrativeRead({
      snapshot,
      postReadings,
      synthesis,
      generatedAt,
      provider,
      model: normalizedModel
    });
    const saved = await savePrNarrativeRead(storageArea, read, async () => {
      if (!(await verifyCurrentSourceHash(snapshot.sourceHash))) {
        throw new PrNarrativeSourceChangedError();
      }
    });
    emitPipelineEvent({
      phase: "llm.call",
      step: "pr-narrative.run.complete",
      target,
      result: "ok",
      requestId,
      detail: {
        campaignId: campaign.id,
        stageACallCount: chunks.length,
        stageBCallCount: 1,
        status: saved.status
      }
    });
    return saved;
  } catch (error) {
    const enriched = enrichValidationError(error, snapshot);
    emitPipelineEvent({
      phase: "llm.call",
      step: "pr-narrative.run.error",
      target,
      result: "error",
      requestId,
      detail: {
        campaignId: campaign.id,
        error: enriched instanceof Error ? enriched.message : String(enriched)
      }
    });
    throw enriched;
  }
}
