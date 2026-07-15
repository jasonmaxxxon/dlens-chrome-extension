import assert from "node:assert/strict";
import test from "node:test";

import type { PrNarrativeRead } from "../src/compare/pr-narrative.ts";
import {
  loadPrNarrativeRead,
  normalizePrNarrativeRead,
  PR_NARRATIVE_READS_STORAGE_KEY,
  savePrNarrativeRead
} from "../src/state/pr-narrative-storage.ts";

function createMemoryStorage(bucket: Record<string, unknown> = {}) {
  return {
    bucket,
    async get(key?: string | string[] | Record<string, unknown> | null) {
      if (typeof key === "string") {
        return { [key]: bucket[key] };
      }
      return bucket;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(bucket, structuredClone(items));
    }
  };
}

function makeRead(campaignId = "campaign-1", generatedAt = "2026-07-14T03:00:00.000Z"): PrNarrativeRead {
  return {
    schemaVersion: 1,
    campaignId,
    sourceRowIds: [`${campaignId}-row-1`, `${campaignId}-row-2`, `${campaignId}-row-3`],
    collectedRowCount: 4,
    snippetFallbackCount: 1,
    sourceHash: `sha256:${campaignId}`,
    promptVersion: "pr-narrative.v1",
    provider: "openai",
    model: "gpt-4.1-mini",
    generatedAt,
    status: "complete",
    priorityClaimId: "claim-1",
    claims: [
      {
        id: "claim-1",
        title: "Setup friction shapes the story",
        statement: "Collected posts describe setup friction.",
        implication: "Lead with a simpler onboarding proof.",
        mode: "actionable",
        alignment: "challenges",
        supportRefs: [
          { rowId: `${campaignId}-row-1`, summary: "Setup takes several steps." },
          { rowId: `${campaignId}-row-2`, summary: "Instructions feel dense." }
        ],
        counterRefs: [{ rowId: `${campaignId}-row-3`, summary: "The guided route feels clear." }]
      },
      {
        id: "claim-2",
        title: "Concrete demos remain useful",
        statement: "A practical demonstration makes the offer legible.",
        implication: "Keep one concrete walkthrough.",
        mode: "behavior",
        alignment: "echoes",
        supportRefs: [{ rowId: `${campaignId}-row-3`, summary: "The demo clarifies the action." }],
        counterRefs: []
      }
    ]
  };
}

test("missing narrative storage hydrates as null", async () => {
  assert.equal(await loadPrNarrativeRead(createMemoryStorage({}), "campaign-1"), null);
});

test("save keeps one latest read per campaign without replacing other campaigns", async () => {
  const storage = createMemoryStorage({});
  const other = makeRead("campaign-2", "2026-07-14T02:00:00.000Z");
  const first = makeRead("campaign-1", "2026-07-14T03:00:00.000Z");
  const latest = makeRead("campaign-1", "2026-07-14T04:00:00.000Z");

  await savePrNarrativeRead(storage, other);
  await savePrNarrativeRead(storage, first);
  await savePrNarrativeRead(storage, latest);

  assert.deepEqual(await loadPrNarrativeRead(storage, "campaign-1"), latest);
  assert.deepEqual(await loadPrNarrativeRead(storage, "campaign-2"), other);
  assert.deepEqual(Object.keys(storage.bucket[PR_NARRATIVE_READS_STORAGE_KEY] as object).sort(), ["campaign-1", "campaign-2"]);
});

test("concurrent saves serialize the shared narrative map read-modify-write", async () => {
  const bucket: Record<string, unknown> = {};
  let getCount = 0;
  let setCount = 0;
  let releaseFirstGet: (() => void) | null = null;
  let markFirstGetStarted: (() => void) | null = null;
  let markSecondSetStarted: (() => void) | null = null;
  const firstGetGate = new Promise<void>((resolve) => {
    releaseFirstGet = resolve;
  });
  const firstGetStarted = new Promise<void>((resolve) => {
    markFirstGetStarted = resolve;
  });
  const secondSetStarted = new Promise<void>((resolve) => {
    markSecondSetStarted = resolve;
  });
  const storage = {
    bucket,
    async get(key?: string | string[] | Record<string, unknown> | null) {
      getCount += 1;
      const snapshot = structuredClone(bucket[PR_NARRATIVE_READS_STORAGE_KEY]);
      if (getCount === 1) {
        markFirstGetStarted?.();
        await firstGetGate;
      }
      if (typeof key === "string") {
        return { [key]: snapshot };
      }
      return { [PR_NARRATIVE_READS_STORAGE_KEY]: snapshot };
    },
    async set(items: Record<string, unknown>) {
      setCount += 1;
      Object.assign(bucket, structuredClone(items));
      if (setCount === 1) {
        markSecondSetStarted?.();
      }
    }
  };
  const first = makeRead("campaign-concurrent-a");
  const second = makeRead("campaign-concurrent-b");

  const firstSave = savePrNarrativeRead(storage, first);
  await firstGetStarted;
  const secondSave = savePrNarrativeRead(storage, second);
  if (getCount === 2) {
    await secondSetStarted;
  }
  releaseFirstGet?.();
  await Promise.all([firstSave, secondSave]);

  assert.equal(getCount, 2);
  assert.equal(setCount, 2);
  assert.deepEqual(await loadPrNarrativeRead(storage, first.campaignId), first);
  assert.deepEqual(await loadPrNarrativeRead(storage, second.campaignId), second);
});

test("pre-write validation runs inside the narrative map lock immediately before storage access", async () => {
  const bucket: Record<string, unknown> = {};
  let setCount = 0;
  let validationCalls = 0;
  let releaseFirstSet: (() => void) | null = null;
  let markFirstSetStarted: (() => void) | null = null;
  const firstSetGate = new Promise<void>((resolve) => {
    releaseFirstSet = resolve;
  });
  const firstSetStarted = new Promise<void>((resolve) => {
    markFirstSetStarted = resolve;
  });
  const storage = {
    bucket,
    async get(key?: string | string[] | Record<string, unknown> | null) {
      if (typeof key === "string") {
        return { [key]: structuredClone(bucket[key]) };
      }
      return structuredClone(bucket);
    },
    async set(items: Record<string, unknown>) {
      setCount += 1;
      if (setCount === 1) {
        markFirstSetStarted?.();
        await firstSetGate;
      }
      Object.assign(bucket, structuredClone(items));
    }
  };

  const firstSave = savePrNarrativeRead(storage, makeRead("campaign-lock-holder"));
  await firstSetStarted;
  const blockedSave = savePrNarrativeRead(
    storage,
    makeRead("campaign-rejected"),
    async () => {
      validationCalls += 1;
      throw new Error("source changed while queued");
    }
  );
  await Promise.resolve();

  assert.equal(validationCalls, 0);
  releaseFirstSet?.();
  await firstSave;
  await assert.rejects(blockedSave, /source changed while queued/i);
  assert.equal(validationCalls, 1);
  assert.equal(setCount, 1);
  assert.equal(await loadPrNarrativeRead(storage, "campaign-rejected"), null);
});

test("normalizer accepts explicit insufficient evidence and rejects malformed publication shapes", () => {
  const insufficient: PrNarrativeRead = {
    ...makeRead(),
    sourceRowIds: [],
    collectedRowCount: 2,
    snippetFallbackCount: 0,
    status: "insufficient_evidence",
    priorityClaimId: null,
    claims: []
  };
  assert.deepEqual(normalizePrNarrativeRead(insufficient), insufficient);

  assert.equal(normalizePrNarrativeRead({ ...makeRead(), campaignId: "" }), null);
  assert.equal(normalizePrNarrativeRead({ ...makeRead(), sourceRowIds: ["campaign-1-row-1", "campaign-1-row-1"] }), null);
  assert.equal(normalizePrNarrativeRead({ ...makeRead(), collectedRowCount: 1 }), null);
  assert.equal(normalizePrNarrativeRead({ ...makeRead(), snippetFallbackCount: 4 }), null);
  assert.equal(normalizePrNarrativeRead({ ...makeRead(), priorityClaimId: "missing" }), null);

  const overlap = makeRead();
  overlap.claims[0]!.counterRefs = [{ ...overlap.claims[0]!.supportRefs[0]! }];
  assert.equal(normalizePrNarrativeRead(overlap), null);

  const unknownRow = makeRead();
  unknownRow.claims[0]!.supportRefs = [{ rowId: "unknown-row", summary: "Unknown." }];
  assert.equal(normalizePrNarrativeRead(unknownRow), null);
});

test("malformed map entries are ignored without destroying valid campaign reads", async () => {
  const valid = makeRead("campaign-valid");
  const storage = createMemoryStorage({
    [PR_NARRATIVE_READS_STORAGE_KEY]: {
      "campaign-valid": valid,
      "campaign-bad": { ...makeRead("campaign-bad"), priorityClaimId: "missing" },
      "wrong-map-key": makeRead("different-campaign")
    }
  });

  assert.deepEqual(await loadPrNarrativeRead(storage, "campaign-valid"), valid);
  assert.equal(await loadPrNarrativeRead(storage, "campaign-bad"), null);
  assert.equal(await loadPrNarrativeRead(storage, "wrong-map-key"), null);
  assert.equal(await loadPrNarrativeRead(storage, "constructor"), null);
  assert.equal(await loadPrNarrativeRead(storage, "toString"), null);
  assert.equal(await loadPrNarrativeRead(storage, "__proto__"), null);
});

test("save rejects an invalid read instead of corrupting the existing map", async () => {
  const existing = makeRead("campaign-existing");
  const storage = createMemoryStorage({
    [PR_NARRATIVE_READS_STORAGE_KEY]: { "campaign-existing": existing }
  });

  await assert.rejects(
    () => savePrNarrativeRead(storage, { ...makeRead("campaign-new"), priorityClaimId: "missing" }),
    /invalid PR narrative read/i
  );
  assert.deepEqual(await loadPrNarrativeRead(storage, "campaign-existing"), existing);
});
