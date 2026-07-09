import assert from "node:assert/strict";
import test from "node:test";

import type { CommentShardReading, EvidencePacket, ReactionPattern } from "../src/compare/topic-audit.ts";
import { buildReactionPatternFullList } from "../src/viewmodel/reaction-pattern-full-list.ts";

function packet(shortCode: string, replies: Array<{ ref: string; text: string; author?: string; likes?: number }>): EvidencePacket {
  return {
    auditRunId: "audit-1",
    inputHash: "hash-1",
    topicId: "topic-1",
    signalId: `signal-${shortCode}`,
    itemId: `item-${shortCode}`,
    shortCode,
    sourceUrl: `https://threads.net/${shortCode}`,
    capturedAt: "2026-07-09T00:00:00.000Z",
    status: "succeeded",
    opAuthor: `op-${shortCode}`,
    opText: `source ${shortCode}`,
    opLikes: 1,
    commentCount: replies.length,
    replyFragments: replies.map((reply) => ({
      ref: reply.ref,
      author: reply.author ?? "reader",
      text: reply.text,
      likes: reply.likes ?? null,
      role: "audience"
    })),
    gaps: [],
    notes: []
  };
}

const pattern: ReactionPattern = {
  id: "reaction-steps",
  label: "追問實際步驟",
  dynamicImplication: "群眾在等一份 step-by-step。",
  nComments: 4,
  nAuthors: 3,
  coverageDenominator: 9,
  supportRefs: ["S1.R1"],
  counterRefs: ["S2.R1"],
  representativeRefs: ["S1.R1"],
  counterRepresentativeRefs: ["S2.R1"],
  icon: "message-circle"
};

test("buildReactionPatternFullList resolves a shard-backed full list grouped by post and de-duplicated", () => {
  const packets = [
    packet("S1", [
      { ref: "S1.R1", text: "想知實際申請步驟", author: "a", likes: 8 },
      { ref: "S1.R2", text: "Reply to @a 想知實際申請步驟", author: "b", likes: 2 },
      { ref: "S1.R3", text: "預算要幾多先安全", author: "c", likes: 4 }
    ]),
    packet("S2", [
      { ref: "S2.R1", text: "不是每個人都適合照抄", author: "d", likes: 1 }
    ])
  ];
  const shardReadings: CommentShardReading[] = [{
    auditRunId: "audit-1",
    inputHash: "hash-1",
    topicId: "topic-1",
    signalId: "signal-S1",
    shortCode: "S1",
    shardIndex: 0,
    shardCount: 1,
    commentRefsInShard: ["S1.R1", "S1.R2", "S1.R3"],
    patternCandidates: [{
      label: "追問實際步驟",
      gist: "步驟追問",
      dynamicImplication: "攻略需求",
      supportRefs: ["S1.R1", "S1.R2", "S1.R3"],
      counterRefs: ["S2.R1"],
      representativeRefs: ["S1.R1"],
      counterRepresentativeRefs: ["S2.R1"],
      nInShard: 4,
      uncertainty: ""
    }],
    lexiconCandidates: [],
    promptVersion: "topic-audit-p0_5.v1",
    model: "mock",
    generatedAt: "2026-07-09T00:00:00.000Z"
  }];

  const fullList = buildReactionPatternFullList({ pattern, packets, shardReadings });

  assert.equal(fullList.path, "true-full-list");
  assert.equal(fullList.traceLabel, "可追 3 / 全量 4");
  assert.equal(fullList.groups.length, 2);
  assert.deepEqual(fullList.groups.map((group) => group.shortCode), ["S1", "S2"]);
  assert.deepEqual(fullList.groups[0]?.comments.map((comment) => comment.ref), ["S1.R1", "S1.R3"]);
  assert.equal(fullList.groups[0]?.comments[0]?.mergedRefs.length, 1);
  assert.deepEqual(fullList.groups[0]?.comments[0]?.mergedRefs, ["S1.R2"]);
  assert.equal(fullList.groups[1]?.comments[0]?.ref, "S2.R1");
});

test("buildReactionPatternFullList degrades honestly when shard data cannot back a true full list", () => {
  const packets = [
    packet("S1", [{ ref: "S1.R1", text: "想知實際申請步驟", author: "a", likes: 8 }]),
    packet("S2", [{ ref: "S2.R1", text: "不是每個人都適合照抄", author: "d", likes: 1 }])
  ];

  const fullList = buildReactionPatternFullList({ pattern, packets, shardReadings: [] });

  assert.equal(fullList.path, "fallback");
  assert.equal(fullList.traceLabel, "可追 2 / 全量 4");
  assert.deepEqual(fullList.groups.map((group) => group.shortCode), ["S1", "S2"]);
  assert.equal(fullList.groups[0]?.comments[0]?.ref, "S1.R1");
  assert.equal(fullList.groups[1]?.comments[0]?.ref, "S2.R1");
});
