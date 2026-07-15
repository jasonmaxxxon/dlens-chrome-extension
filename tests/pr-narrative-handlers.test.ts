import assert from "node:assert/strict";
import test from "node:test";

import type {
  PrNarrativePostReading,
  PrNarrativeSynthesisDraft
} from "../src/compare/pr-narrative.ts";
import {
  getPrNarrativeReadState,
  runPrNarrativeRead,
  type GeneratePrNarrativePostReadings,
  type GeneratePrNarrativeSynthesis
} from "../src/state/pr-narrative-handlers.ts";
import { loadPrNarrativeRead } from "../src/state/pr-narrative-storage.ts";
import { normalizePrCriteria, type PrCampaign, type PrEvidenceRow } from "../src/state/pr-evidence-storage.ts";
import type { SessionItem, SessionRecord } from "../src/state/types.ts";

const NOW = "2026-07-14T03:00:00.000Z";

const campaign: PrCampaign = {
  id: "campaign-1",
  sessionId: "session-1",
  name: "BoostUP Launch",
  briefText: "Make everyday wellness practical and social.",
  criteria: normalizePrCriteria([]),
  narrativeSettings: {
    narrativeAnchor: "Wellness fits everyday life",
    targetAudience: "Young working adults",
    desiredAction: "Register for the event"
  },
  createdAt: NOW,
  updatedAt: NOW
};

function createMemoryStorage(bucket: Record<string, unknown> = {}) {
  return {
    async get(key?: string | string[] | Record<string, unknown> | null) {
      if (typeof key === "string") return { [key]: bucket[key] };
      return bucket;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(bucket, structuredClone(items));
    }
  };
}

function makeItem(index: number, readable = true): SessionItem {
  const id = `item-${index}`;
  return {
    id,
    descriptor: {
      target_type: "post",
      page_url: `https://www.threads.net/@author/post/${index}`,
      post_url: `https://www.threads.net/@author/post/${index}`,
      author_hint: `@author${index}`,
      text_snippet: "",
      time_token_hint: "1h",
      dom_anchor: id,
      engagement: { likes: null, comments: null, reposts: null, forwards: null, views: null },
      engagement_present: { likes: false, comments: false, reposts: false, forwards: false, views: false },
      captured_at: NOW
    },
    status: "succeeded",
    selectedAt: NOW,
    savedAt: NOW,
    queuedAt: NOW,
    completedAt: NOW,
    captureId: `capture-${index}`,
    jobId: `job-${index}`,
    canonicalTargetUrl: `https://www.threads.net/@author/post/${index}`,
    latestJob: null,
    latestCapture: {
      result: { canonical_post: { text: readable ? `Canonical campaign post ${index}` : "" } }
    } as SessionItem["latestCapture"],
    commentsPreview: [],
    lastStatusAt: NOW,
    lastErrorKind: null,
    lastError: null
  };
}

function makeInputs(count: number, readable = true): { rows: PrEvidenceRow[]; session: SessionRecord } {
  const rows: PrEvidenceRow[] = Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return {
      id: `row-${index}`,
      campaignId: campaign.id,
      itemId: `item-${index}`,
      postUrl: `https://www.threads.net/@author/post/${index}`,
      authorHandle: `@author${index}`,
      caption: readable ? `Fallback ${index}` : "",
      metrics: {},
      expectedEngagement: "",
      criteriaMatches: { c1: false, c2: false, c3: false, c4: false, c5: false, c6: false },
      collectedAt: `2026-07-14T02:${String(index).padStart(2, "0")}:00.000Z`
    };
  });
  return {
    rows,
    session: {
      id: campaign.sessionId,
      name: "PR campaign",
      mode: "pr-evidence",
      createdAt: NOW,
      updatedAt: NOW,
      items: Array.from({ length: count }, (_, offset) => makeItem(offset + 1, readable))
    }
  };
}

function makeReading(ref: string): PrNarrativePostReading {
  return {
    ref,
    gist: `Gist ${ref}`,
    evidenceSummary: `Evidence ${ref}`,
    alignmentScore: 0.4,
    actionabilityScore: 0.7,
    claimSeeds: [`Seed ${ref}`],
    caveat: ""
  };
}

function makeCompleteSynthesis(refs: readonly string[]): PrNarrativeSynthesisDraft {
  const first = refs[0]!;
  const second = refs[1] ?? first;
  const counter = refs[2];
  return {
    status: "complete",
    priorityClaimId: "claim-1",
    claims: [
      {
        id: "claim-1",
        title: "Setup friction shapes the story",
        statement: `${first} and ${second} describe setup friction.`,
        implication: "Lead with a simpler onboarding proof.",
        supportRefs: Array.from(new Set([first, second])),
        counterRefs: counter ? [counter] : []
      },
      {
        id: "claim-2",
        title: "Concrete examples remain useful",
        statement: `${second} gives a concrete example.`,
        implication: "Keep one practical walkthrough.",
        supportRefs: [second],
        counterRefs: []
      }
    ]
  };
}

const acceptCurrentSourceHash = async () => true;

test("producer batches current posts and atomically publishes one validated read", async () => {
  const storageArea = createMemoryStorage();
  const { rows, session } = makeInputs(32);
  const stageACalls: string[][] = [];
  const stageBCalls: PrNarrativePostReading[][] = [];
  const generatePostReadings: GeneratePrNarrativePostReadings = async (_provider, _key, _prompt, refs) => {
    stageACalls.push([...refs]);
    return refs.map(makeReading);
  };
  const generateSynthesis: GeneratePrNarrativeSynthesis = async (_provider, _key, readings) => {
    stageBCalls.push([...readings]);
    return makeCompleteSynthesis(readings.map((reading) => reading.ref));
  };

  const result = await runPrNarrativeRead({
    storageArea,
    campaign,
    rows,
    session,
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-4.1-mini",
    generatePostReadings,
    generateSynthesis,
    verifyCurrentSourceHash: acceptCurrentSourceHash,
    now: NOW
  });

  assert.equal(stageACalls.length, 2);
  assert.deepEqual(stageACalls.map((refs) => refs.length), [20, 12]);
  assert.equal(stageBCalls.length, 1);
  assert.equal(stageBCalls[0]?.length, 32);
  assert.equal(result.sourceRowIds.length, 32);
  assert.deepEqual(await loadPrNarrativeRead(storageArea, campaign.id), result);
});

test("failed synthesis preserves the last successful read", async () => {
  const storageArea = createMemoryStorage();
  const { rows, session } = makeInputs(3);
  const common = {
    storageArea,
    campaign,
    rows,
    session,
    provider: "openai" as const,
    apiKey: "test-key",
    model: "gpt-4.1-mini",
    generatePostReadings: (async (_provider, _key, _prompt, refs) => refs.map(makeReading)) as GeneratePrNarrativePostReadings,
    verifyCurrentSourceHash: acceptCurrentSourceHash,
    now: NOW
  };
  const previous = await runPrNarrativeRead({
    ...common,
    generateSynthesis: (async (_provider, _key, readings) => makeCompleteSynthesis(readings.map((reading) => reading.ref))) as GeneratePrNarrativeSynthesis
  });

  await assert.rejects(() => runPrNarrativeRead({
    ...common,
    now: "2026-07-14T04:00:00.000Z",
    generateSynthesis: async () => { throw new Error("invalid synthesis"); }
  }), /invalid synthesis/);
  assert.deepEqual(await loadPrNarrativeRead(storageArea, campaign.id), previous);
});

test("source change before publish rejects the generated read and preserves the previous read", async () => {
  const storageArea = createMemoryStorage();
  const { rows, session } = makeInputs(3);
  const common = {
    storageArea,
    campaign,
    rows,
    session,
    provider: "openai" as const,
    apiKey: "test-key",
    model: "gpt-4.1-mini",
    generatePostReadings: (async (_provider, _key, _prompt, refs) => refs.map(makeReading)) as GeneratePrNarrativePostReadings,
    generateSynthesis: (async (_provider, _key, readings) => makeCompleteSynthesis(readings.map((reading) => reading.ref))) as GeneratePrNarrativeSynthesis
  };
  const previous = await runPrNarrativeRead({
    ...common,
    verifyCurrentSourceHash: acceptCurrentSourceHash,
    now: NOW
  });
  let verifiedSourceHash = "";

  await assert.rejects(() => runPrNarrativeRead({
    ...common,
    verifyCurrentSourceHash: async (sourceHash: string) => {
      verifiedSourceHash = sourceHash;
      return false;
    },
    now: "2026-07-14T04:00:00.000Z"
  }), /source.*changed/i);

  assert.equal(verifiedSourceHash, previous.sourceHash);
  assert.deepEqual(await loadPrNarrativeRead(storageArea, campaign.id), previous);
});

test("no readable collected posts and a missing provider key fail before model calls", async () => {
  const storageArea = createMemoryStorage();
  const unreadable = makeInputs(2, false);
  let calls = 0;
  const generatePostReadings: GeneratePrNarrativePostReadings = async () => {
    calls += 1;
    return [];
  };
  const generateSynthesis: GeneratePrNarrativeSynthesis = async () => {
    calls += 1;
    return { status: "insufficient_evidence", priorityClaimId: null, claims: [] };
  };

  await assert.rejects(() => runPrNarrativeRead({
    storageArea,
    campaign,
    ...unreadable,
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-4.1-mini",
    generatePostReadings,
    generateSynthesis,
    verifyCurrentSourceHash: acceptCurrentSourceHash,
    now: NOW
  }), /no readable/i);

  const readable = makeInputs(1);
  await assert.rejects(() => runPrNarrativeRead({
    storageArea,
    campaign,
    ...readable,
    provider: "openai",
    apiKey: "   ",
    model: "gpt-4.1-mini",
    generatePostReadings,
    generateSynthesis,
    verifyCurrentSourceHash: acceptCurrentSourceHash,
    now: NOW
  }), /provider|api key/i);
  assert.equal(calls, 0);
  assert.equal(await loadPrNarrativeRead(storageArea, campaign.id), null);
});

test("validated insufficient evidence is persisted without fabricated claims", async () => {
  const storageArea = createMemoryStorage();
  const { rows, session } = makeInputs(2);
  const result = await runPrNarrativeRead({
    storageArea,
    campaign,
    rows,
    session,
    provider: "google",
    apiKey: "test-key",
    model: "gemini-3.1-flash-lite-preview",
    generatePostReadings: async (_provider, _key, _prompt, refs) => refs.map(makeReading),
    generateSynthesis: async () => ({ status: "insufficient_evidence", priorityClaimId: null, claims: [] }),
    verifyCurrentSourceHash: acceptCurrentSourceHash,
    now: NOW
  });

  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.priorityClaimId, null);
  assert.deepEqual(result.claims, []);
  assert.deepEqual(await loadPrNarrativeRead(storageArea, campaign.id), result);
});

test("get state returns stored read, current source hash, and normalized settings", async () => {
  const storageArea = createMemoryStorage();
  const { rows, session } = makeInputs(2);
  const generated = await runPrNarrativeRead({
    storageArea,
    campaign,
    rows,
    session,
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-4.1-mini",
    generatePostReadings: async (_provider, _key, _prompt, refs) => refs.map(makeReading),
    generateSynthesis: async (_provider, _key, readings) => makeCompleteSynthesis(readings.map((reading) => reading.ref)),
    verifyCurrentSourceHash: acceptCurrentSourceHash,
    now: NOW
  });

  const state = await getPrNarrativeReadState({ storageArea, campaign, rows, session });
  assert.deepEqual(state.read, generated);
  assert.equal(state.currentSourceHash, generated.sourceHash);
  assert.deepEqual(state.settings, campaign.narrativeSettings);
});
