import assert from "node:assert/strict";
import test from "node:test";

import type { EvidencePacket, LensMemo, SignalReading, TopicNarrativeState } from "../src/compare/topic-audit.ts";
import {
  TOPIC_AUDIT_PROMPT_VERSIONS,
  buildP0_5ShardReadingPrompt,
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
    commentCount: 5,
    replyFragments: [
      { ref: "S1.OPC1", author: "op", text: "第一點：app 會放大選擇成本。", likes: 7, role: "op_continuation" },
      { ref: "S1.R1", commentId: "r1", author: "reader", text: "我同老公就是 app 識的。", likes: null, role: "audience" },
      { ref: "S1.R2", commentId: "r2", author: "reader2", text: "這條 counter quote 可以在 shard distillate 中被引用。", likes: 2, role: "audience" },
      { ref: "S1.R3", commentId: "r3", author: "reader3", text: "這條完全未被引用的 raw reply 不應該出現在上游 prompts。", likes: 1, role: "audience" }
    ],
    aiArtifacts: {
      gist: "這篇把交友 app 寫成選擇成本與價值錯配問題。",
      tags: ["交友 app", "戀愛市場"]
    },
    gaps: [],
    notes: []
  };
}

function makeShardReading() {
  return {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    topicId: "topic-love",
    signalId: "signal-1",
    shortCode: "S1",
    shardIndex: 0,
    shardCount: 1,
    reading: "P0.5 白紙讀：讀者以自身經驗限制 OP 的市場論，另有弱反例提醒樣本差異 [S1.R1] [S1.R2]。",
    commentRefsInShard: ["S1.R1", "S1.R2"],
    patternCandidates: [{
      label: "個人反例校正",
      gist: "讀者用自身關係經驗限制 OP 的市場框架。",
      dynamicImplication: "討論不只共鳴 OP，而是把抽象市場論拉回個人差異。",
      supportRefs: ["S1.R1"],
      counterRefs: ["S1.R2"],
      representativeRefs: ["S1.R1"],
      counterRepresentativeRefs: ["S1.R2"],
      nInShard: 1,
      uncertainty: "S1.R2 是弱反例。"
    }],
    lexiconCandidates: ["app 識", "市場錯配"],
    promptVersion: "topic-audit-p0_5.v1",
    model: "google:test",
    generatedAt: "2026-05-22T09:09:00.000Z"
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

function makeNarrativeState(): TopicNarrativeState {
  return {
    version: "topic-narrative-state.v1",
    topicId: "topic-love",
    auditRunId: "audit-run-0",
    fingerprints: { evidence: "e0", definition: "d0", pipeline: "p0" },
    nextIds: { claim: 2, voice: 1, question: 1 },
    claims: [{
      id: "claim-1",
      statement: "讀者以個人反例收窄 OP 的市場論",
      rationale: "前次 evidence 支持",
      trajectory: "new",
      evidence: [{ anchorId: "a_1234567890abcdef", displayRef: "S1.R1", stability: "stable" }]
    }],
    voices: [],
    openQuestions: [],
    updatedAt: "2026-05-21T09:00:00.000Z"
  };
}

test("P1 prompt reduces persisted P0.5 readings without re-rendering raw audience replies", () => {
  const packet = { ...makePacket(), gaps: ["只擷取 3/5 則留言"] };
  const prompt = buildP1SignalReadingPrompt(packet, [makeShardReading()]);

  assert.match(prompt, /P1 Post synthesis/);
  assert.match(prompt, /S1\.OP \[♥81\] @op: 靚女玩 app 會遇到市場錯配。/);
  assert.match(prompt, /S1\.OPC1 \[♥7\] @op: 第一點：app 會放大選擇成本。/);
  assert.match(prompt, /只擷取 3\/5 則留言/);
  assert.match(prompt, /P0\.5 白紙讀：讀者以自身經驗限制 OP 的市場論/);
  assert.match(prompt, /個人反例校正/);
  assert.match(prompt, /dynamic: 討論不只共鳴 OP/);
  assert.match(prompt, /lexicon: app 識 \/ 市場錯配/);
  assert.match(prompt, /shard 1\/1/);
  assert.doesNotMatch(prompt, /@reader: 我同老公就是 app 識的。/);
  assert.doesNotMatch(prompt, /完全未被引用的 raw reply/);
  assert.match(prompt, /optional lens/);
  assert.match(prompt, /"prose"/);
  assert.match(prompt, /"evidenceRefs"/);
  assert.doesNotMatch(prompt, /這篇把交友 app 寫成選擇成本/);
  assert.doesNotMatch(prompt, /戀愛市場/);
  assert.equal(TOPIC_AUDIT_PROMPT_VERSIONS.p0_5, "topic-audit-p0_5.v2");
  assert.equal(TOPIC_AUDIT_PROMPT_VERSIONS.p1, "topic-audit-p1.v3");
  assert.match(prompt, /\[Sx\.OP\] \/ \[Sx\.R1\]/);
});

test("P1 prompt stays under 24k chars for a 1,000-comment post while spanning the first and last shard", () => {
  const replyFragments: EvidencePacket["replyFragments"] = Array.from({ length: 1_000 }, (_, index) => ({
    ref: `S1.R${index + 1}`,
    commentId: `comment-${index + 1}`,
    author: `reader-${index + 1}`,
    text: `RAW_REPLY_${index + 1}_${"x".repeat(96)}`,
    likes: index,
    role: "audience"
  }));
  const packet: EvidencePacket = {
    ...makePacket(),
    opText: `很長的 OP ${"主張".repeat(4_000)}`,
    commentCount: replyFragments.length,
    replyFragments
  };
  const shardReadings = Array.from({ length: 10 }, (_, shardIndex) => ({
    ...makeShardReading(),
    shardIndex,
    shardCount: 10,
    reading: `DISTILLATE_${shardIndex + 1} ${"獨立白紙閱讀摘要".repeat(280)} [S1.R${shardIndex * 100 + 1}]`,
    commentRefsInShard: Array.from({ length: 100 }, (_, offset) => `S1.R${shardIndex * 100 + offset + 1}`)
  }));

  const prompt = buildP1SignalReadingPrompt(packet, shardReadings);

  assert.ok(prompt.length <= 24_000, `P1 prompt length ${prompt.length} exceeded 24,000 chars`);
  assert.match(prompt, /DISTILLATE_1\b/);
  assert.match(prompt, /DISTILLATE_10\b/);
  assert.doesNotMatch(prompt, /RAW_REPLY_/);
  assert.match(prompt, /只回傳 JSON，不要 markdown fence/);
});

test("P0.5 shard prompt keeps a blank-read discipline and only renders the shard comments", () => {
  const packet = makePacket();
  const prompt = buildP0_5ShardReadingPrompt(packet, [packet.replyFragments[1]!]);

  assert.match(prompt, /先不要套框架/);
  assert.match(prompt, /commentRefsInShard/);
  assert.match(prompt, /patternCandidates/);
  assert.match(prompt, /lexiconCandidates/);
  assert.match(prompt, /S1\.R1 \[♥unknown\] @reader: 我同老公就是 app 識的。/);
  assert.doesNotMatch(prompt, /S1\.R2/);
  assert.doesNotMatch(prompt, /未被引用的 raw reply/);
  assert.equal(TOPIC_AUDIT_PROMPT_VERSIONS.p0_5, "topic-audit-p0_5.v2");
});

test("P2-P6 prompts use prior prose memos but keep findings as probes instead of planted conclusions", () => {
  const packet = makePacket();
  const reading = makeSignalReading();
  const shardReading = makeShardReading();
  const lexicon = makeMemo("lexicon", "app、條件、選擇成本形成市場語彙。");
  const narrative = makeMemo("narrative", "一條敘事是 app 被寫成市場，但讀者以反例拉回個人經驗。");
  const audience = makeMemo("audience", "reader 不是同方向共鳴，而是直接校正 OP。");
  const absence = makeMemo("absence", "[中] 男性第一身聲音沒有出現在 captured evidence。");

  const p2 = buildP2LexiconPrompt({ topicName: "love", packets: [packet], signalReadings: [reading], shardReadings: [shardReading] });
  assert.match(p2, /有沒有 future-positive 詞/);
  assert.match(p2, /app 識/);
  assert.doesNotMatch(p2, /完全未被引用的 raw reply/);
  assert.match(buildP3NarrativePrompt({ topicName: "love", packets: [packet], signalReadings: [reading], lexiconMemo: lexicon }), /自然長出敘事/);
  const p4 = buildP4AudiencePrompt({ topicName: "love", packets: [packet], signalReadings: [reading], lensMemos: [lexicon, narrative], shardReadings: [shardReading] });
  assert.match(p4, /看到才寫/);
  assert.match(p4, /reactionPatterns/);
  assert.match(p4, /coverageDenominator/);
  assert.match(p4, /parser 會丟掉/);
  assert.match(p4, /個人反例校正/);
  assert.doesNotMatch(p4, /完全未被引用的 raw reply/);
  const p5 = buildP5AbsencePrompt({ topicName: "love", packets: [packet], signalReadings: [reading], lensMemos: [lexicon, narrative, audience], shardReadings: [shardReading] });
  const p6 = buildP6FinalReportPrompt({ topicName: "love", packets: [packet], signalReadings: [reading], lensMemos: [lexicon, narrative, audience, absence] });

  assert.match(p5, /data gap 必須與真 absence 區分/);
  assert.match(p5, /S1 shard 1\/1: 2 refs/);
  assert.doesNotMatch(p5, /完全未被引用的 raw reply/);
  assert.match(p6, /7 節/);
  assert.match(p6, /editorial/);
  assert.match(p6, /S1\.OP \[♥81\] @op: 靚女玩 app 會遇到市場錯配。/);
  assert.match(p6, /S1\.R1 \[♥unknown\] @reader: 我同老公就是 app 識的。/);
  assert.doesNotMatch(p6, /S1\.R2/);
  assert.doesNotMatch(p6, /完全未被引用的 raw reply/);
  assert.equal(TOPIC_AUDIT_PROMPT_VERSIONS.p6, "topic-audit-p6.v3");
  assert.deepEqual(findForbiddenFindingAssertions(p5), []);
  assert.deepEqual(findForbiddenFindingAssertions(p6), []);
});

test("P3 P4 and P6 read current evidence before treating prior narrative state as hypotheses", () => {
  const packet = makePacket();
  const reading = makeSignalReading();
  const shardReading = makeShardReading();
  const lexicon = makeMemo("lexicon", "當次詞彙 memo");
  const priorNarrativeState = makeNarrativeState();
  const p3 = buildP3NarrativePrompt({
    topicName: "love",
    packets: [packet],
    signalReadings: [reading],
    lexiconMemo: lexicon,
    priorNarrativeState
  });
  const p4 = buildP4AudiencePrompt({
    topicName: "love",
    packets: [packet],
    signalReadings: [reading],
    lensMemos: [lexicon],
    shardReadings: [shardReading],
    priorNarrativeState
  });
  const p6 = buildP6FinalReportPrompt({
    topicName: "love",
    packets: [packet],
    signalReadings: [reading],
    lensMemos: [lexicon],
    priorNarrativeState
  });

  for (const prompt of [p3, p4, p6]) {
    assert.match(prompt, /歷史假說，不是 evidence/);
    assert.match(prompt, /claim-1/);
  }
  assert.ok(p3.indexOf("[P1 readings]") < p3.indexOf("[Prior narrative state"));
  assert.ok(p4.indexOf("[Post-level merged observations]") < p4.indexOf("[Prior narrative state"));
  assert.ok(p6.indexOf("[Evidence digest") < p6.indexOf("[Prior narrative state"));
  assert.match(p6, /每個 active prior claim ID 恰好一次/);
  assert.match(p6, /continuityReview/);
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

test("parseAuditPromptEnvelopeResponse preserves structured reaction patterns and filters evidence refs", () => {
  const parsed = parseAuditPromptEnvelopeResponse(
    JSON.stringify({
      prose: "P4 讀到身份防守與制度反駁兩種反應。",
      evidenceRefs: ["S1.R1", "S9.R9"],
      caveats: [],
      display_hints: {
        reaction_coverage: {
          post_count: 1,
          captured_comment_count: 342,
          read_comment_count: 342,
          usable_audience_comment_count: 318
        },
        reaction_patterns: [{
          id: "reaction-local-labor-defense",
          label: "本地勞工身份防守",
          dynamic_implication: "留言把政策爭議推向身份與分配正義。",
          n_comments: 118,
          n_authors: 72,
          coverage_denominator: 342,
          support_refs: ["S1.R1", "S1.R2", "S9.R9"],
          counter_refs: ["S1.R3"],
          representative_refs: ["S1.R1"],
          counter_representative_refs: ["S1.R3", "S9.R9"],
          icon: "users"
        }, {
          id: "reaction-unbacked",
          label: "無證據 pattern",
          dynamic_implication: "這條不應該進 UI。",
          n_comments: 9,
          n_authors: 4,
          coverage_denominator: 342,
          support_refs: ["S9.R9"],
          counter_refs: [],
          representative_refs: ["S9.R9"],
          counter_representative_refs: []
        }]
      }
    }),
    new Set(["S1.R1", "S1.R2", "S1.R3"])
  );

  assert.deepEqual(parsed, {
    prose: "P4 讀到身份防守與制度反駁兩種反應。",
    evidenceRefs: ["S1.R1"],
    caveats: [],
    displayHints: {
      reactionCoverage: {
        postCount: 1,
        capturedCommentCount: 342,
        readCommentCount: 342,
        usableAudienceCommentCount: 318
      },
      reactionPatterns: [{
        id: "reaction-local-labor-defense",
        label: "本地勞工身份防守",
        dynamicImplication: "留言把政策爭議推向身份與分配正義。",
        nComments: 118,
        nAuthors: 72,
        coverageDenominator: 342,
        supportRefs: ["S1.R1", "S1.R2"],
        counterRefs: ["S1.R3"],
        representativeRefs: ["S1.R1"],
        counterRepresentativeRefs: ["S1.R3"],
        icon: "users"
      }]
    }
  });
});

test("parseAuditPromptEnvelopeResponse preserves a compact continuity review", () => {
  const parsed = parseAuditPromptEnvelopeResponse(JSON.stringify({
    prose: "本次 report",
    evidenceRefs: ["S1.OP"],
    caveats: [],
    continuityReview: {
      carriedClaims: [{
        claimId: "claim-1",
        outcome: "weakened",
        statement: "舊命題已收窄",
        rationale: "新反例出現",
        evidenceRefs: ["S1.R1"]
      }],
      newClaims: [{ statement: "新命題", rationale: "新訊號", evidenceRefs: ["S1.OP"] }],
      voices: [{ label: "反例者", position: "收窄命題", evidenceRefs: ["S1.R1"] }],
      openQuestions: ["反例會否持續？"]
    }
  }), new Set(["S1.OP", "S1.R1"]));

  assert.equal(parsed?.continuityReview?.carriedClaims[0]?.claimId, "claim-1");
  assert.equal(parsed?.continuityReview?.carriedClaims[0]?.outcome, "weakened");
  assert.deepEqual(parsed?.continuityReview?.newClaims[0]?.evidenceRefs, ["S1.OP"]);
  assert.equal(parsed?.continuityReview?.voices[0]?.label, "反例者");
  assert.deepEqual(parsed?.continuityReview?.openQuestions, ["反例會否持續？"]);
});
