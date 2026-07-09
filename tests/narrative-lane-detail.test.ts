import assert from "node:assert/strict";
import test from "node:test";

import { buildNarrativeLaneDetail } from "../src/viewmodel/narrative-lane-detail.ts";
import type { EvidencePacket } from "../src/compare/topic-audit.ts";

function packet(overrides: Partial<EvidencePacket> & { shortCode: string }): EvidencePacket {
  return {
    auditRunId: "run-1",
    inputHash: "hash-1",
    topicId: "topic-1",
    signalId: `sig-${overrides.shortCode}`,
    itemId: `item-${overrides.shortCode}`,
    shortCode: overrides.shortCode,
    sourceUrl: "https://threads.net/x",
    capturedAt: "2026-06-01T00:00:00.000Z",
    status: "succeeded",
    opAuthor: overrides.opAuthor ?? "op",
    opText: overrides.opText ?? "",
    opLikes: overrides.opLikes ?? null,
    commentCount: overrides.commentCount ?? null,
    replyFragments: overrides.replyFragments ?? [],
    gaps: [],
    notes: [],
    ...overrides
  };
}

test("buildNarrativeLaneDetail maps lane refs to packets and derives real content", () => {
  const packets: EvidencePacket[] = [
    packet({
      shortCode: "S1",
      opAuthor: "alice",
      opText: "失業之後每天都很焦慮",
      replyFragments: [
        { ref: "S1.R1", author: "bob", text: "我也失業了，超焦慮", likes: 12, role: "audience" },
        { ref: "S1.R2", author: "cara", text: "撐住", likes: 3, role: "audience" }
      ]
    }),
    packet({
      shortCode: "S2",
      opAuthor: "dan",
      opText: "被裁員，焦慮到失眠",
      replyFragments: [
        { ref: "S2.R1", author: "bob", text: "裁員潮真的很慘", likes: 20, role: "audience" }
      ]
    }),
    // Not referenced by the lane — must be ignored.
    packet({ shortCode: "S9", opAuthor: "zoe", opText: "今天天氣很好" })
  ];

  const detail = buildNarrativeLaneDetail({
    lane: { id: "lane-anxiety", signalRefs: ["S1.OP", "S2.OP"] },
    packets
  });

  assert.equal(detail.postCount, 2);
  assert.equal(detail.commentCount, 3);

  // Most-liked reply leads the representative comments and keeps attribution.
  assert.equal(detail.comments[0]!.text, "裁員潮真的很慘");
  assert.equal(detail.comments[0]!.author, "bob");
  assert.equal(detail.comments[0]!.shortCode, "S2");
  assert.equal(detail.comments[0]!.kind, "reply");

  // Voices aggregate OP + reply authorship; bob spoke twice.
  const bob = detail.voices.find((v) => v.handle === "bob");
  assert.ok(bob && bob.comments === 2 && bob.posts === 0);
  assert.ok(!detail.voices.some((v) => v.handle === "zoe"));
});

test("buildNarrativeLaneDetail degrades gracefully when a lane has no replies", () => {
  const packets: EvidencePacket[] = [
    packet({ shortCode: "S1", opAuthor: "alice", opText: "失業焦慮的一天" })
  ];
  const detail = buildNarrativeLaneDetail({
    lane: { id: "lane-1", signalRefs: ["S1.OP"] },
    packets
  });
  assert.equal(detail.postCount, 1);
  assert.equal(detail.commentCount, 0);
  // Representative quotes fall back to OP text instead of being empty.
  assert.equal(detail.comments[0]!.kind, "op");
  assert.equal(detail.comments[0]!.shortCode, "S1");
});
