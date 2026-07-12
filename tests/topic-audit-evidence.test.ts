import assert from "node:assert/strict";
import test from "node:test";

import * as evidenceModule from "../src/compare/topic-audit-evidence.ts";
import type { EvidencePacket } from "../src/compare/topic-audit.ts";

interface AnchorShape {
  stableKey: string;
  displayRef: string;
  signalId: string;
  stability: "stable" | "synthetic";
}

type BuildAnchors = (packets: readonly EvidencePacket[]) => AnchorShape[];

function makePacket(shortCode: string, refs: [string, string, string]): EvidencePacket {
  return {
    auditRunId: "audit-1",
    inputHash: "input-1",
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
    commentCount: 3,
    replyFragments: [
      { ref: refs[0], commentId: "comment-1", author: "reader", text: "same comment", likes: 2, role: "audience" },
      { ref: refs[1], sourceId: "source-2", author: "op", text: "same reply", likes: 1, role: "op_reply" },
      { ref: refs[2], author: "reader-2", text: "fallback comment", likes: 0, role: "audience" }
    ],
    gaps: [],
    notes: []
  };
}

test("extractTopicEvidenceRefs recognizes full OPR tokens and de-duplicates in reading order", () => {
  assert.deepEqual(
    evidenceModule.extractTopicEvidenceRefs("[S1.OPR9] [S1.OP] [S1.OPR9] [S2.OPC2]"),
    ["S1.OPR9", "S1.OP", "S2.OPC2"]
  );
});

test("extractTopicEvidenceRefs requires complete identifier boundaries", () => {
  assert.deepEqual(
    evidenceModule.extractTopicEvidenceRefs("XS1.R1 S1.OPR9foo S1.OPR9_suffix [S2.R3] plain S3.OP"),
    ["S2.R3", "S3.OP"]
  );
});

test("buildTopicEvidenceAnchors keeps stable keys when display aliases move", () => {
  const buildAnchors = (evidenceModule as unknown as { buildTopicEvidenceAnchors?: BuildAnchors }).buildTopicEvidenceAnchors;
  assert.equal(typeof buildAnchors, "function");
  if (!buildAnchors) return;

  const first = buildAnchors([makePacket("S1", ["S1.R1", "S1.OPR1", "S1.R2"])]);
  const moved = buildAnchors([makePacket("S2", ["S2.R4", "S2.OPR2", "S2.R5"])]);

  assert.deepEqual(first.map((anchor) => anchor.stableKey), moved.map((anchor) => anchor.stableKey));
  assert.notDeepEqual(first.map((anchor) => anchor.displayRef), moved.map((anchor) => anchor.displayRef));
  assert.equal(first[0]?.stableKey, "signal:signal-1:op");
  assert.equal(first[1]?.stableKey, "signal:signal-1:comment:comment-1");
  assert.equal(first[2]?.stableKey, "signal:signal-1:source:source-2");
  assert.match(first[3]?.stableKey ?? "", /^signal:signal-1:synthetic:/);
  assert.equal(first[3]?.stability, "synthetic");
});

test("buildTopicEvidenceAnchors does not promote projection fallback ids over real source ids", () => {
  const buildAnchors = (evidenceModule as unknown as { buildTopicEvidenceAnchors?: BuildAnchors }).buildTopicEvidenceAnchors;
  assert.equal(typeof buildAnchors, "function");
  if (!buildAnchors) return;

  const packet = makePacket("S1", ["S1.R1", "S1.OPR1", "S1.R2"]);
  packet.replyFragments[0] = {
    ...packet.replyFragments[0]!,
    commentId: "reply_1",
    sourceId: "real-source-1",
    commentIdSource: "fallback"
  } as EvidencePacket["replyFragments"][number];
  packet.replyFragments[2] = {
    ...packet.replyFragments[2]!,
    commentId: "reply_3",
    commentIdSource: "fallback"
  } as EvidencePacket["replyFragments"][number];

  const anchors = buildAnchors([packet]);
  assert.equal(anchors[1]?.stableKey, "signal:signal-1:source:real-source-1");
  assert.match(anchors[3]?.stableKey ?? "", /^signal:signal-1:synthetic:/);
  assert.equal(anchors[3]?.stability, "synthetic");
});
