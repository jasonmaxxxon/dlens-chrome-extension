import assert from "node:assert/strict";
import test from "node:test";

import type { EvidencePacket } from "../src/compare/topic-audit.ts";
import {
  validateCrossTopicCalibrationDraft,
  validateTopicAuditDraft
} from "../src/compare/topic-audit-validator.ts";

function makePacket(overrides: Partial<EvidencePacket> = {}): EvidencePacket {
  return {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    topicId: "topic-work",
    signalId: "signal-1",
    itemId: "item-1",
    shortCode: "S1",
    sourceUrl: "https://www.threads.net/@op/post/work",
    capturedAt: "2026-05-22T09:00:00.000Z",
    status: "succeeded",
    opAuthor: "op",
    opText: "大家唔好再讀碩士啦。",
    opLikes: 1900,
    commentCount: 139,
    replyFragments: [
      { ref: "S1.R1", author: "reader", text: "master 一向係高級興趣班", likes: 309, role: "audience" }
    ],
    gaps: [],
    notes: [],
    ...overrides
  };
}

test("validateTopicAuditDraft flags missing and unknown citations without rewriting", () => {
  const flags = validateTopicAuditDraft({
    packets: [makePacket()],
    reportMarkdown: [
      "§2 讀者把 master 說成高級興趣班（S9.R1）。",
      "§5 這個議題完全沒有希望。"
    ].join("\n")
  });

  assert.deepEqual(flags.map((flag) => [flag.severity, flag.kind]), [
    ["FAIL", "unknown-ref"],
    ["SCOPE", "ungrounded-generalization"]
  ]);
  assert.match(flags[0]?.reason ?? "", /S9\.R1/);
  assert.equal(flags.some((flag) => /改寫/.test(flag.reason)), false);
});

test("validateTopicAuditDraft treats an unknown OPR ref as the full token instead of truncating it to OP", () => {
  const flags = validateTopicAuditDraft({
    packets: [makePacket()],
    reportMarkdown: "§4 OP 回覆建立了新的限制條件 [S1.OPR9]。"
  });

  assert.deepEqual(flags.map((flag) => flag.kind), ["unknown-ref"]);
  assert.deepEqual(flags[0]?.evidenceRefs, ["S1.OPR9"]);
  assert.match(flags[0]?.reason ?? "", /S1\.OPR9/);
});

test("validateTopicAuditDraft flags likes mismatches and queued-as-zero arithmetic", () => {
  const flags = validateTopicAuditDraft({
    packets: [
      makePacket(),
      makePacket({
        signalId: "signal-2",
        shortCode: "S2",
        status: "queued",
        opLikes: null,
        commentCount: null,
        replyFragments: [],
        gaps: ["capture not completed"]
      })
    ],
    reportMarkdown: [
      "§2 top reply 有 999 likes：master 一向係高級興趣班（S1.R1）。",
      "§3 兩篇平均 OP likes 是 950，因為 queued 當 0。"
    ].join("\n")
  });

  assert.deepEqual(flags.map((flag) => flag.kind), ["likes-mismatch", "queued-as-zero"]);
  assert.equal(flags[0]?.severity, "FAIL");
  assert.equal(flags[1]?.severity, "FAIL");
});

test("validateTopicAuditDraft flags thin evidence patterns", () => {
  const flags = validateTopicAuditDraft({
    packets: [makePacket()],
    reportMarkdown: "§4 這是一個穩定 pattern，n=1（S1.R1）。"
  });

  assert.deepEqual(flags.map((flag) => [flag.severity, flag.kind]), [["WEAK", "thin-evidence"]]);
});

test("validateCrossTopicCalibrationDraft flags overstrong platform claims from two topics", () => {
  const flags = validateCrossTopicCalibrationDraft({
    topicCount: 2,
    calibrationMarkdown: "兩個 topic 都有中間層真空，所以這已經證實是 Threads platform affordance。"
  });

  assert.deepEqual(flags.map((flag) => [flag.severity, flag.kind]), [["WEAK", "overstrong-platform-claim"]]);
  assert.match(flags[0]?.reason ?? "", /strongly consistent with/);
});
