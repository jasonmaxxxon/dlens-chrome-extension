import assert from "node:assert/strict";
import test from "node:test";

import type { EvidencePacket } from "../src/compare/topic-audit.ts";

interface ContinuityModule {
  buildTopicAuditRunId(
    fingerprints: { evidence: string; definition: string; pipeline: string },
    executionNonce?: string
  ): string;
  materializeNarrativeState(input: Record<string, unknown>): unknown;
  evolveTopicAuditEpisodes(existing: unknown[], input: Record<string, unknown>): unknown[];
}

async function loadContinuityModule(): Promise<ContinuityModule | null> {
  try {
    return await import("../src/compare/topic-audit-continuity.ts") as unknown as ContinuityModule;
  } catch {
    return null;
  }
}

function makePacket(shortCode = "S1", ref = "S1.R1"): EvidencePacket {
  return {
    auditRunId: "audit-1",
    inputHash: "pipeline-1",
    topicId: "topic-1",
    signalId: "signal-1",
    itemId: "item-1",
    shortCode,
    sourceUrl: "https://www.threads.net/@op/post/1",
    capturedAt: "2026-07-11T00:00:00.000Z",
    status: "succeeded",
    opAuthor: "op",
    opText: "root",
    opLikes: 3,
    commentCount: 1,
    replyFragments: [{
      ref,
      commentId: "comment-1",
      commentIdSource: "captured",
      author: "reader",
      text: "reply",
      likes: 2,
      role: "audience"
    }],
    gaps: [],
    notes: []
  };
}

const fingerprints = {
  evidence: "sha256:evidence-1",
  definition: "sha256:definition-1",
  pipeline: "sha256:pipeline-1"
};

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    topicId: "topic-1",
    auditRunId: "audit-1",
    packets: [makePacket()],
    fingerprints,
    generatedAt: "2026-07-11T00:00:00.000Z",
    previousState: null,
    review: {
      carriedClaims: [],
      newClaims: [{ statement: "讀者開始校正 OP 的框架", rationale: "新證據出現", evidenceRefs: ["S1.R1"] }],
      voices: [{ label: "校正者", position: "用個人反例收窄命題", evidenceRefs: ["S1.R1"] }],
      openQuestions: ["這個反例會否持續？"]
    },
    ...overrides
  };
}

test("materializeNarrativeState allocates handler-owned ids and stable evidence anchors", async () => {
  const module = await loadContinuityModule();
  assert.ok(module, "topic-audit-continuity module must exist");
  if (!module) return;

  const state = module.materializeNarrativeState(baseInput()) as any;
  assert.equal(state.version, "topic-narrative-state.v1");
  assert.equal(state.claims[0].id, "claim-1");
  assert.equal(state.claims[0].trajectory, "new");
  assert.equal(state.claims[0].evidence[0].displayRef, "S1.R1");
  assert.match(state.claims[0].evidence[0].anchorId, /^a_[a-f0-9]{16}$/);
  assert.equal(state.voices[0].id, "voice-1");
  assert.equal(state.openQuestions[0].id, "question-1");
  assert.ok(JSON.stringify(state).length <= 4096);
});

test("materializeNarrativeState requires every active prior claim exactly once", async () => {
  const module = await loadContinuityModule();
  assert.ok(module);
  if (!module) return;
  const prior = module.materializeNarrativeState(baseInput()) as any;

  assert.throws(
    () => module.materializeNarrativeState(baseInput({
      auditRunId: "audit-2",
      previousState: prior,
      review: { carriedClaims: [], newClaims: [], voices: [], openQuestions: [] }
    })),
    /account for every active prior claim/
  );
  assert.throws(
    () => module.materializeNarrativeState(baseInput({
      auditRunId: "audit-2",
      previousState: prior,
      review: {
        carriedClaims: [
          { claimId: "claim-1", outcome: "stable", statement: prior.claims[0].statement, rationale: "仍有證據", evidenceRefs: ["S1.R1"] },
          { claimId: "claim-1", outcome: "stable", statement: prior.claims[0].statement, rationale: "重複", evidenceRefs: ["S1.R1"] }
        ],
        newClaims: [], voices: [], openQuestions: []
      }
    })),
    /duplicate carried claim id/
  );
});

test("stable claims keep ids while evidence aliases remap through stable anchors", async () => {
  const module = await loadContinuityModule();
  assert.ok(module);
  if (!module) return;
  const prior = module.materializeNarrativeState(baseInput()) as any;
  const next = module.materializeNarrativeState(baseInput({
    auditRunId: "audit-2",
    packets: [makePacket("S2", "S2.R4")],
    previousState: prior,
    review: {
      carriedClaims: [{
        claimId: "claim-1",
        outcome: "stable",
        statement: prior.claims[0].statement,
        rationale: "本次仍看見相同校正",
        evidenceRefs: ["S2.R4"]
      }],
      newClaims: [], voices: [], openQuestions: []
    }
  })) as any;

  assert.equal(next.claims[0].id, "claim-1");
  assert.equal(next.claims[0].trajectory, "stable");
  assert.equal(next.claims[0].evidence[0].anchorId, prior.claims[0].evidence[0].anchorId);
  assert.equal(next.claims[0].evidence[0].displayRef, "S2.R4");
});

test("strengthened claims require a current anchor not present in the prior state", async () => {
  const module = await loadContinuityModule();
  assert.ok(module);
  if (!module) return;
  const prior = module.materializeNarrativeState(baseInput()) as any;

  assert.throws(
    () => module.materializeNarrativeState(baseInput({
      auditRunId: "audit-2",
      previousState: prior,
      review: {
        carriedClaims: [{
          claimId: "claim-1",
          outcome: "strengthened",
          statement: prior.claims[0].statement,
          rationale: "沒有新增錨點",
          evidenceRefs: ["S1.R1"]
        }],
        newClaims: [], voices: [], openQuestions: []
      }
    })),
    /new evidence anchor/
  );
});

test("narrative state rejects oversized text instead of truncating silently", async () => {
  const module = await loadContinuityModule();
  assert.ok(module);
  if (!module) return;

  assert.throws(
    () => module.materializeNarrativeState(baseInput({
      review: {
        carriedClaims: [],
        newClaims: [{ statement: "過".repeat(500), rationale: "too long", evidenceRefs: ["S1.R1"] }],
        voices: [],
        openQuestions: []
      }
    })),
    /statement exceeds/
  );
});

test("episode evolution distinguishes first advance rebase and same-fingerprint replacement", async () => {
  const module = await loadContinuityModule();
  assert.ok(module);
  if (!module) return;
  const firstState = module.materializeNarrativeState(baseInput()) as any;
  const first = module.evolveTopicAuditEpisodes([], {
    topicId: "topic-1",
    auditRunId: "audit-1",
    inputHash: "input-1",
    generatedAt: "2026-07-11T00:00:00.000Z",
    state: firstState,
    packets: [makePacket()],
    audienceMemo: null
  }) as any[];
  assert.equal(first.length, 1);
  assert.equal(first[0].transition, "first");
  assert.equal(first[0].delta[0].trajectory, "new");

  const replaced = module.evolveTopicAuditEpisodes(first, {
    topicId: "topic-1",
    auditRunId: "audit-1b",
    inputHash: "input-1b",
    generatedAt: "2026-07-11T00:05:00.000Z",
    state: {
      ...firstState,
      auditRunId: "audit-1b",
      updatedAt: "2026-07-11T00:05:00.000Z",
      claims: firstState.claims.map((claim: any) => ({
        ...claim,
        evidence: claim.evidence.map((anchor: any) => ({ ...anchor, displayRef: "S2.R4" }))
      }))
    },
    packets: [makePacket("S2", "S2.R4")],
    audienceMemo: null
  }) as any[];
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].id, first[0].id);
  assert.equal(replaced[0].transition, "first");
  assert.equal(replaced[0].stateSnapshot.claims[0].evidence[0].displayRef, "S2.R4");
  assert.equal(replaced[0].stateSnapshot.claims[0].evidence[0].anchorId, replaced[0].delta[0].evidence[0].anchorId);
  assert.equal(replaced[0].delta[0].evidence[0].displayRef, "S2.R4");

  const advancedState = {
    ...firstState,
    auditRunId: "audit-2",
    fingerprints: { ...firstState.fingerprints, evidence: "sha256:evidence-2" },
    claims: [{ ...firstState.claims[0], trajectory: "strengthened" }]
  };
  const advanced = module.evolveTopicAuditEpisodes(replaced, {
    topicId: "topic-1",
    auditRunId: "audit-2",
    inputHash: "input-2",
    generatedAt: "2026-07-12T00:00:00.000Z",
    state: advancedState,
    packets: [makePacket()],
    audienceMemo: null
  }) as any[];
  assert.equal(advanced.length, 2);
  assert.equal(advanced[1].transition, "advance");
  assert.equal(advanced[1].delta[0].trajectory, "strengthened");

  const rebased = module.evolveTopicAuditEpisodes(advanced, {
    topicId: "topic-1",
    auditRunId: "audit-3",
    inputHash: "input-3",
    generatedAt: "2026-07-13T00:00:00.000Z",
    state: {
      ...advancedState,
      auditRunId: "audit-3",
      fingerprints: { ...advancedState.fingerprints, pipeline: "sha256:pipeline-2" }
    },
    packets: [makePacket()],
    audienceMemo: null
  }) as any[];
  assert.equal(rebased.length, 3);
  assert.equal(rebased[2].transition, "rebase");
  assert.deepEqual(rebased[2].delta, []);
});

test("same-fingerprint episode revision retains prior episode-relative deltas and merges current changes", async () => {
  const module = await loadContinuityModule();
  assert.ok(module);
  if (!module) return;

  const firstState = module.materializeNarrativeState(baseInput()) as any;
  const first = module.evolveTopicAuditEpisodes([], {
    topicId: "topic-1",
    auditRunId: "audit-1",
    inputHash: "input-1",
    generatedAt: "2026-07-11T00:00:00.000Z",
    state: firstState,
    packets: [makePacket()],
    audienceMemo: null
  }) as any[];
  const revisionState = module.materializeNarrativeState(baseInput({
    auditRunId: "audit-1b",
    generatedAt: "2026-07-11T00:05:00.000Z",
    packets: [makePacket("S2", "S2.R4")],
    previousState: firstState,
    review: {
      carriedClaims: [{
        claimId: "claim-1",
        outcome: "stable",
        statement: "讀者開始校正 OP 的框架",
        rationale: "本次仍看見相同校正",
        evidenceRefs: ["S2.R4"]
      }],
      newClaims: [{
        statement: "第二個獨立命題",
        rationale: "新觀察",
        evidenceRefs: ["S2.R4"]
      }],
      voices: [],
      openQuestions: []
    }
  })) as any;

  const revised = module.evolveTopicAuditEpisodes(first, {
    topicId: "topic-1",
    auditRunId: "audit-1b",
    inputHash: "input-1b",
    generatedAt: "2026-07-11T00:05:00.000Z",
    state: revisionState,
    packets: [makePacket("S2", "S2.R4")],
    audienceMemo: null
  }) as any[];

  assert.equal(revised.length, 1);
  assert.equal(revised[0].id, first[0].id);
  assert.equal(new Set(revised[0].delta.map((entry: any) => entry.claimId)).size, revised[0].delta.length);
  assert.deepEqual(
    revised[0].delta.map((entry: any) => ({
      claimId: entry.claimId,
      trajectory: entry.trajectory,
      statement: entry.statement,
      rationale: entry.rationale,
      evidenceRefs: entry.evidence.map((anchor: any) => anchor.displayRef)
    })),
    [{
      claimId: "claim-1",
      trajectory: "new",
      statement: "讀者開始校正 OP 的框架",
      rationale: "本次仍看見相同校正",
      evidenceRefs: ["S2.R4"]
    }, {
      claimId: "claim-2",
      trajectory: "new",
      statement: "第二個獨立命題",
      rationale: "新觀察",
      evidenceRefs: ["S2.R4"]
    }]
  );
});

test("same-fingerprint episode revision retains a retired delta after the claim leaves current state", async () => {
  const module = await loadContinuityModule();
  assert.ok(module);
  if (!module) return;

  const firstState = module.materializeNarrativeState(baseInput()) as any;
  const first = module.evolveTopicAuditEpisodes([], {
    topicId: "topic-1",
    auditRunId: "audit-1",
    inputHash: "input-1",
    generatedAt: "2026-07-11T00:00:00.000Z",
    state: firstState,
    packets: [makePacket()],
    audienceMemo: null
  }) as any[];
  const retiredState = module.materializeNarrativeState(baseInput({
    auditRunId: "audit-1b",
    generatedAt: "2026-07-11T00:05:00.000Z",
    previousState: firstState,
    review: {
      carriedClaims: [{
        claimId: "claim-1",
        outcome: "retired",
        notReobserved: true,
        statement: firstState.claims[0].statement,
        rationale: "本次沒有再次觀察到",
        evidenceRefs: []
      }],
      newClaims: [],
      voices: [],
      openQuestions: []
    }
  })) as any;
  const retired = module.evolveTopicAuditEpisodes(first, {
    topicId: "topic-1",
    auditRunId: "audit-1b",
    inputHash: "input-1b",
    generatedAt: "2026-07-11T00:05:00.000Z",
    state: retiredState,
    packets: [makePacket()],
    audienceMemo: null
  }) as any[];
  assert.deepEqual(
    retired[0].delta.map((entry: any) => ({ claimId: entry.claimId, trajectory: entry.trajectory })),
    [{ claimId: "claim-1", trajectory: "retired" }]
  );

  const emptyState = module.materializeNarrativeState(baseInput({
    auditRunId: "audit-1c",
    generatedAt: "2026-07-11T00:10:00.000Z",
    previousState: retiredState,
    review: { carriedClaims: [], newClaims: [], voices: [], openQuestions: [] }
  })) as any;
  const revised = module.evolveTopicAuditEpisodes(retired, {
    topicId: "topic-1",
    auditRunId: "audit-1c",
    inputHash: "input-1c",
    generatedAt: "2026-07-11T00:10:00.000Z",
    state: emptyState,
    packets: [makePacket()],
    audienceMemo: null
  }) as any[];

  assert.equal(revised.length, 1);
  assert.deepEqual(
    revised[0].delta.map((entry: any) => ({ claimId: entry.claimId, trajectory: entry.trajectory })),
    [{ claimId: "claim-1", trajectory: "retired" }]
  );
});

test("published audit run ids change with evidence fingerprints even when cache input metadata does not", async () => {
  const module = await loadContinuityModule();
  assert.ok(module);
  if (!module) return;

  const first = module.buildTopicAuditRunId({ evidence: "sha256:evidence-1", definition: "sha256:def", pipeline: "sha256:pipe" });
  const changed = module.buildTopicAuditRunId({ evidence: "sha256:evidence-2", definition: "sha256:def", pipeline: "sha256:pipe" });
  assert.notEqual(first, changed);
  assert.match(first, /^audit_[a-f0-9]{16}$/);
});

test("published audit run ids distinguish forced executions with identical fingerprints", async () => {
  const module = await loadContinuityModule();
  assert.ok(module);
  if (!module) return;

  const fingerprints = { evidence: "sha256:evidence", definition: "sha256:def", pipeline: "sha256:pipe" };
  const first = module.buildTopicAuditRunId(fingerprints, "execution-1");
  const forced = module.buildTopicAuditRunId(fingerprints, "execution-2");
  assert.notEqual(first, forced);
});
