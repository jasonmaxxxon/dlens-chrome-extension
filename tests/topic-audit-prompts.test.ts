import assert from "node:assert/strict";
import test from "node:test";

import type { EvidencePacket, LensMemo, SignalReading } from "../src/compare/topic-audit.ts";
import {
  TOPIC_AUDIT_PROMPT_VERSIONS,
  buildP1SignalReadingPrompt,
  buildP2LexiconPrompt,
  buildP3NarrativePrompt,
  buildP4AudiencePrompt,
  buildP5AbsencePrompt,
  buildP6FinalReportPrompt,
  buildP7ValidatorPrompt,
  buildP8CrossTopicCalibrationPrompt,
  findForbiddenFindingAssertions,
  parseAuditPromptEnvelopeResponse
} from "../src/compare/topic-audit-prompts.ts";

function makePacket(): EvidencePacket {
  return {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    topicId: "topic-love",
    signalId: "signal-1",
    itemId: "item-1",
    shortCode: "S1",
    sourceUrl: "https://www.threads.net/@op/post/love",
    capturedAt: "2026-05-22T09:00:00.000Z",
    status: "succeeded",
    opAuthor: "op",
    opText: "靚女玩 app 會遇到市場錯配。",
    opLikes: 81,
    commentCount: 4,
    replyFragments: [
      { ref: "S1.OPC1", author: "op", text: "第一點：app 會放大選擇成本。", likes: 7, role: "op_continuation" },
      { ref: "S1.R1", author: "reader", text: "我同老公就是 app 識的。", likes: null, role: "audience" }
    ],
    aiArtifacts: {
      gist: "這篇把交友 app 寫成選擇成本與價值錯配問題。",
      tags: ["交友 app", "戀愛市場"]
    },
    gaps: [],
    notes: []
  };
}

function makeSignalReading(): SignalReading {
  return {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    topicId: "topic-love",
    signalId: "signal-1",
    shortCode: "S1",
    reading: "OP 先把 app 寫成市場錯配，讀者用個人反例校正這個框架。",
    evidenceRefs: ["S1.OP", "S1.R1"],
    watchNotes: ["reader personal counterexample"],
    promptVersion: "p1.v1",
    model: "google:test",
    generatedAt: "2026-05-22T09:10:00.000Z"
  };
}

function makeMemo(stageName: LensMemo["stageName"], prose: string): LensMemo {
  return {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    topicId: "topic-love",
    stageName,
    prose,
    evidenceRefs: ["S1.OP", "S1.R1"],
    caveats: [],
    coverage: "1/1",
    promptVersion: `${stageName}.v1`,
    model: "google:test",
    generatedAt: "2026-05-22T09:11:00.000Z"
  };
}

test("P1 prompt starts with a cold read and excludes existing AI tags/gist from the evidence block", () => {
  const prompt = buildP1SignalReadingPrompt(makePacket());

  assert.match(prompt, /你看到什麼？這篇在發生什麼？/);
  assert.match(prompt, /S1\.OP \[♥81\] @op: 靚女玩 app 會遇到市場錯配。/);
  assert.match(prompt, /S1\.OPC1 \[♥7\] @op: 第一點：app 會放大選擇成本。/);
  assert.match(prompt, /S1\.R1 \[♥unknown\] @reader: 我同老公就是 app 識的。/);
  assert.match(prompt, /optional lens/);
  assert.match(prompt, /"prose"/);
  assert.match(prompt, /"evidenceRefs"/);
  assert.doesNotMatch(prompt, /這篇把交友 app 寫成選擇成本/);
  assert.doesNotMatch(prompt, /戀愛市場/);
  assert.equal(TOPIC_AUDIT_PROMPT_VERSIONS.p1, "topic-audit-p1.v2");
  assert.match(prompt, /\[Sx\.OP\] \/ \[Sx\.R1\]/);
});

test("P2-P6 prompts use prior prose memos but keep findings as probes instead of planted conclusions", () => {
  const packet = makePacket();
  const reading = makeSignalReading();
  const lexicon = makeMemo("lexicon", "app、條件、選擇成本形成市場語彙。");
  const narrative = makeMemo("narrative", "一條敘事是 app 被寫成市場，但讀者以反例拉回個人經驗。");
  const audience = makeMemo("audience", "reader 不是同方向共鳴，而是直接校正 OP。");
  const absence = makeMemo("absence", "[中] 男性第一身聲音沒有出現在 captured evidence。");

  assert.match(buildP2LexiconPrompt({ topicName: "love", packets: [packet], signalReadings: [reading] }), /有沒有 future-positive 詞/);
  assert.match(buildP3NarrativePrompt({ topicName: "love", packets: [packet], signalReadings: [reading], lexiconMemo: lexicon }), /自然長出敘事/);
  assert.match(buildP4AudiencePrompt({ topicName: "love", packets: [packet], signalReadings: [reading], lensMemos: [lexicon, narrative] }), /看到才寫/);
  const p5 = buildP5AbsencePrompt({ topicName: "love", packets: [packet], signalReadings: [reading], lensMemos: [lexicon, narrative, audience] });
  const p6 = buildP6FinalReportPrompt({ topicName: "love", packets: [packet], signalReadings: [reading], lensMemos: [lexicon, narrative, audience, absence] });

  assert.match(p5, /data gap 必須與真 absence 區分/);
  assert.match(p6, /7 節/);
  assert.match(p6, /editorial/);
  assert.deepEqual(findForbiddenFindingAssertions(p5), []);
  assert.deepEqual(findForbiddenFindingAssertions(p6), []);
});

test("forbidden finding guard flags planted conclusions but allows negative instructions", () => {
  assert.deepEqual(
    findForbiddenFindingAssertions("不要預設沒有 future tense；必須從 evidence 重新長出。"),
    []
  );
  assert.deepEqual(
    findForbiddenFindingAssertions("本 topic 沒有 future tense，而且正面敘事會被壓制。"),
    ["future-tense-absence", "positive-narrative-suppression"]
  );
});

test("P7 and P8 prompts make validation and cross-topic calibration explicit", () => {
  const validatorPrompt = buildP7ValidatorPrompt({
    topicName: "love",
    packets: [makePacket()],
    reportMarkdown: "§7 說這是 platform affordance，但沒有引用。",
    memos: [makeMemo("absence", "中間層缺席。")]
  });
  const calibrationPrompt = buildP8CrossTopicCalibrationPrompt({
    topicReports: [
      { topicId: "work", topicName: "work", absenceMemo: "[強] 中間層缺席", finalSummary: "work report" },
      { topicId: "love", topicName: "love", absenceMemo: "[強] 中間層缺席", finalSummary: "love report" }
    ]
  });

  assert.match(validatorPrompt, /只 flag 不重寫/);
  assert.match(validatorPrompt, /queued\/unknown 不可當 0/);
  assert.match(calibrationPrompt, /strongly consistent with/);
  assert.match(calibrationPrompt, /topic-specific/);
  assert.match(calibrationPrompt, /platform-affordance/);
  assert.equal(TOPIC_AUDIT_PROMPT_VERSIONS.p8, "topic-audit-p8.v1");
});

test("parseAuditPromptEnvelopeResponse accepts prose JSON and filters unknown refs", () => {
  const parsed = parseAuditPromptEnvelopeResponse(
    "```json\n{\"prose\":\"這是一段自由判讀。\",\"evidenceRefs\":[\"S1.OP\",\"S9.R1\"],\"caveats\":[\"top-3 only\"],\"coverage\":\"1/1\",\"displayHints\":{\"themeChips\":[\"市場化戀愛\"],\"narrativeLanes\":[{\"id\":\"lane-1\",\"label\":\"市場化戀愛\",\"signalRefs\":[\"S1.OP\",\"S9.R1\"],\"consensus\":0.7}]}}\n```",
    new Set(["S1.OP"])
  );

  assert.deepEqual(parsed, {
    prose: "這是一段自由判讀。",
    evidenceRefs: ["S1.OP"],
    caveats: ["top-3 only"],
    coverage: "1/1",
    displayHints: {
      themeChips: ["市場化戀愛"],
      narrativeLanes: [{ id: "lane-1", label: "市場化戀愛", signalRefs: ["S1.OP"], consensus: 0.7 }]
    }
  });
  assert.equal(parseAuditPromptEnvelopeResponse("{\"prose\":\"\",\"evidenceRefs\":[]}", new Set(["S1.OP"])), null);
});

test("parseAuditPromptEnvelopeResponse accepts memo aliases and snake_case display hints", () => {
  const parsed = parseAuditPromptEnvelopeResponse(
    "{\"memo\":\"P2 詞彙層判讀。\",\"evidence_refs\":[\"S1.OP\"],\"caveats\":[],\"display_hints\":{\"theme_chips\":[\"戀愛市場\"],\"narrative_lanes\":[{\"label\":\"條件交換焦慮\",\"signal_refs\":[\"S1.OP\"],\"consensus\":0.4}]}}",
    new Set(["S1.OP"])
  );

  assert.deepEqual(parsed, {
    prose: "P2 詞彙層判讀。",
    evidenceRefs: ["S1.OP"],
    caveats: [],
    displayHints: {
      themeChips: ["戀愛市場"],
      narrativeLanes: [{ id: "lane-1", label: "條件交換焦慮", signalRefs: ["S1.OP"], consensus: 0.4 }]
    }
  });
});
