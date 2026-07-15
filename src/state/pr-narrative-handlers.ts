import {
  buildPrNarrativePostReadPrompt,
  buildPrNarrativeSnapshot,
  chunkPrNarrativeSources,
  materializePrNarrativeRead,
  type PrNarrativePostReading,
  type PrNarrativeRead,
  type PrNarrativeSynthesisDraft
} from "../compare/pr-narrative.ts";
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
  expectedRefs: string[]
) => Promise<PrNarrativePostReading[]>;

export type GeneratePrNarrativeSynthesis = (
  provider: PrNarrativeProvider,
  apiKey: string,
  readings: PrNarrativePostReading[],
  campaign: PrCampaign
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
  now
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

  const postReadings: PrNarrativePostReading[] = [];
  for (const sources of chunkPrNarrativeSources(snapshot.sources)) {
    const expectedRefs = sources.map((source) => source.ref);
    const prompt = buildPrNarrativePostReadPrompt(campaign, sources);
    const readings = await generatePostReadings(provider, normalizedApiKey, prompt, expectedRefs);
    postReadings.push(...readings);
  }

  const synthesis = await generateSynthesis(provider, normalizedApiKey, postReadings, campaign);
  const read = materializePrNarrativeRead({
    snapshot,
    postReadings,
    synthesis,
    generatedAt,
    provider,
    model: normalizedModel
  });
  return savePrNarrativeRead(storageArea, read, async () => {
    if (!(await verifyCurrentSourceHash(snapshot.sourceHash))) {
      throw new PrNarrativeSourceChangedError();
    }
  });
}
