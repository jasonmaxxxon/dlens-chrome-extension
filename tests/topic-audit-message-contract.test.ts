import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { CrossTopicCalibration, EvidencePacket, TopicAuditEpisode, TopicAuditReport } from "../src/compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../src/compare/topic-audit-validator.ts";
import type { ExtensionMessage, ExtensionSuccessResponse } from "../src/state/messages.ts";
import type { TopicAuditMemoBundle } from "../src/state/topic-audit-storage.ts";

test("ExtensionMessage exposes topic audit and cross-topic calibration contracts", () => {
  const messages = [
    { type: "topic/audit/build-evidence", sessionId: "session-1", topicId: "topic-1" },
    { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1", fromStage: "lexicon" },
    { type: "topic/audit/get", topicId: "topic-1" },
    { type: "topic/audit/validate", topicId: "topic-1" },
    { type: "topic/audit/clear", topicId: "topic-1" },
    { type: "cross-topic/calibrate", topicIds: ["topic-1", "topic-2"] }
  ] satisfies ExtensionMessage[];

  assert.deepEqual(messages.map((message) => message.type), [
    "topic/audit/build-evidence",
    "topic/audit/run",
    "topic/audit/get",
    "topic/audit/validate",
    "topic/audit/clear",
    "cross-topic/calibrate"
  ]);
});

test("ExtensionSuccessResponse carries topic audit payloads", () => {
  const response = {
    ok: true,
    auditEvidence: [] as EvidencePacket[],
    auditReport: null as TopicAuditReport | null,
    auditMemos: null as TopicAuditMemoBundle | null,
    auditEpisodes: [] as TopicAuditEpisode[],
    auditValidatorFlags: [] as TopicAuditValidationFlag[],
    crossTopicCalibration: null as CrossTopicCalibration | null
  } satisfies ExtensionSuccessResponse;

  assert.equal(response.ok, true);
  assert.equal(response.auditReport, null);
  assert.deepEqual(response.auditEpisodes, []);
});

test("background routes topic audit messages through the audit handler", async () => {
  const source = await readFile(new URL("../entrypoints/background.ts", import.meta.url), "utf8");

  assert.match(source, /handleTopicAuditMessage/);
  for (const messageType of [
    "topic/audit/build-evidence",
    "topic/audit/run",
    "topic/audit/get",
    "topic/audit/validate",
    "topic/audit/clear",
    "cross-topic/calibrate"
  ]) {
    assert.match(source, new RegExp(`case "${messageType}"`));
  }
});
