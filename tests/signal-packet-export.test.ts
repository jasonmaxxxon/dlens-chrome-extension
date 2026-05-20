import assert from "node:assert/strict";
import test from "node:test";

import {
  exportSignalPackets
} from "../src/compare/signal-packet-export.ts";
import { DLENS_SIGNAL_PACKET_VERSION, type DLensSignalPacket } from "../src/compare/signal-packet.ts";

function makePacket(overrides: Partial<DLensSignalPacket> = {}): DLensSignalPacket {
  return {
    packetVersion: DLENS_SIGNAL_PACKET_VERSION,
    source: {
      signalId: "signal-1",
      source: "threads",
      sessionId: "session-1",
      sessionName: "Product signals",
      sessionMode: "product",
      itemId: "item-1",
      itemStatus: "succeeded",
      url: "https://www.threads.net/@builder/post/abc",
      pageUrl: "https://www.threads.net/@builder/post/abc",
      author: "builder",
      textSnippet: "Agent handoff workflow.",
      capturedAt: "2026-05-19T08:00:00.000Z",
      captureId: "cap-1",
      canonicalTargetUrl: "https://www.threads.net/@builder/post/abc"
    },
    evidence: {
      textEvidence: [
        {
          id: "comment-1",
          ref: "e1",
          author: "pm",
          text: "This could become a weekly agent handoff.",
          likeCount: 9
        }
      ],
      imageEvidence: [],
      sourcePacket: {
        assembledContent: "Root post plus OP continuation.",
        postUrl: "https://www.threads.net/@builder/post/abc",
        representativeComments: [
          { ref: "e1", author: "pm", text: "This could become a weekly agent handoff." }
        ],
        analysisPromptVersion: "v16"
      },
      assembledContent: "Root post plus OP continuation."
    },
    judgment: {
      signalId: "signal-1",
      signalType: "learning",
      signalSubtype: "agent_handoff_workflow",
      contentType: "mixed",
      contentSummary: "把社群 signal 變成 agent handoff。",
      relevance: 5,
      relevantTo: ["coreWorkflows"],
      whyRelevant: "直接對應 DLens 的 service layer。",
      verdict: "try",
      reason: "可做成低風險 read-model。",
      experimentHint: "先輸出可索引 packet。",
      agentTaskSpec: {
        targetAgent: "codex",
        taskTitle: "寫 packet",
        taskPrompt: "1. 讀取 signal storage\n2. 組成 packet\n3. 輸出測試覆蓋",
        requiredContext: ["signal storage", "product signal analysis"]
      },
      evidenceRefs: ["e1"],
      productContextHash: "ctx_1",
      promptVersion: "v16",
      model: "google:gemini-3.1-flash-lite-preview",
      analyzedAt: "2026-05-19T08:06:00.000Z",
      status: "complete"
    },
    productContext: {
      hash: "ctx_export_1",
      compiledAt: "2026-05-19T08:00:00.000Z",
      productPromise: "把 Threads signal 變成 agent-readable product decisions.",
      targetAudience: "indie builders",
      agentRoles: ["collector", "judge"],
      coreWorkflows: ["save signal", "review reading"],
      currentCapabilities: ["Product signal analysis"],
      explicitConstraints: ["local-first"],
      nonGoals: ["multi-tenant SaaS"],
      preferredTechDirection: "Chrome extension first",
      evaluationCriteria: ["decision quality"],
      unknowns: ["mobile share"],
      sourceFileIds: ["file-1"],
      promptVersion: "v1"
    },
    reading: {
      latest: null,
      filed: [],
      all: []
    },
    userFeedback: {
      currentReadingState: "filed",
      readingFeedback: [],
      agentTaskFeedback: [],
      feedbackTimeline: [
        {
          kind: "reading",
          readingCacheKey: "signal-1::ctx::pkt::v1",
          type: "filed",
          at: "2026-05-19T08:09:00.000Z",
          note: "這個 pattern 可留。"
        },
        {
          kind: "agent_task",
          taskPromptHash: "task_1",
          feedback: "adopted",
          at: "2026-05-19T08:11:00.000Z"
        }
      ]
    },
    agentHandoff: {
      taskSpec: {
        targetAgent: "codex",
        taskTitle: "寫 packet",
        taskPrompt: "1. 讀取 signal storage\n2. 組成 packet\n3. 輸出測試覆蓋",
        requiredContext: ["signal storage", "product signal analysis"]
      },
      targetAgent: "codex",
      taskPrompt: "1. 讀取 signal storage\n2. 組成 packet\n3. 輸出測試覆蓋",
      requiredContext: ["signal storage", "product signal analysis"]
    },
    topicContext: {
      inboxStatus: "assigned",
      topicId: "topic-1",
      suggestedTopicIds: [],
      topics: [{ id: "topic-1", name: "Agent workflows", status: "learning", tags: ["agent"] }]
    },
    decisionTrace: {
      traceVersion: "v1",
      stages: [
        {
          stage: "structured_judgment",
          outputKind: "verdict_fields",
          generatedAt: "2026-05-19T08:06:00.000Z",
          promptVersion: "v16",
          model: "google:gemini-3.1-flash-lite-preview",
          modelKnown: true,
          reasoningDetails: {
            summary: "把社群 signal 變成 agent handoff。Verdict try：可做成低風險 read-model。",
            keyDecisions: ["直接對應 DLens 的 service layer。", "先輸出可索引 packet。"],
            keyInsights: ["直接對應 DLens 的 service layer。", "先輸出可索引 packet。"],
            tradeoffs: [],
            uncertainties: []
          },
          evidenceRefs: ["e1"],
          evidence: [
            {
              ref: "e1",
              text: "This could become a weekly agent handoff."
            }
          ]
        },
        {
          stage: "free_reading",
          outputKind: "interpretive_reading",
          generatedAt: "2026-05-19T08:07:00.000Z",
          promptVersion: "v1",
          model: "google:gemini",
          modelKnown: true,
          reasoningDetails: {
            summary: "這條 signal 的價值在於 agent handoff 直接可用。",
            keyDecisions: ["這是 interpretation layer，不是原始事實。"],
            keyInsights: ["這是 interpretation layer，不是原始事實。"],
            tradeoffs: [],
            uncertainties: []
          },
          evidenceRefs: ["e1"],
          evidence: [
            {
              ref: "e1",
              text: "This could become a weekly agent handoff."
            }
          ]
        }
      ]
    },
    ...overrides
  };
}

test("exportSignalPackets jsonl preserves packetVersion, feedback timeline, agent handoff, and decision trace", () => {
  const result = exportSignalPackets([makePacket()], {
    format: "jsonl",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  assert.equal(result.mimeType, "application/x-ndjson;charset=utf-8");
  assert.equal(result.filename, "dlens-signal-packets-2026-05-19T08-30-00-000Z.jsonl");
  const rows = result.content.trim().split("\n").map((line) => JSON.parse(line) as DLensSignalPacket);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.packetVersion, DLENS_SIGNAL_PACKET_VERSION);
  assert.equal(rows[0]?.userFeedback.feedbackTimeline.length, 2);
  assert.equal(rows[0]?.productContext.hash, "ctx_export_1");
  assert.equal(rows[0]?.productContext.productPromise, "把 Threads signal 變成 agent-readable product decisions.");
  assert.deepEqual(rows[0]?.productContext.coreWorkflows, ["save signal", "review reading"]);
  assert.match(rows[0]?.agentHandoff.taskPrompt ?? "", /讀取 signal storage/);
  assert.equal(rows[0]?.decisionTrace.traceVersion, "v1");
  assert.equal(rows[0]?.decisionTrace.stages[0]?.model, "google:gemini-3.1-flash-lite-preview");
  assert.equal(rows[0]?.decisionTrace.stages[1]?.stage, "free_reading");
  assert.deepEqual(rows[0]?.decisionTrace.stages[0]?.evidenceRefs, ["e1"]);
});

test("exportSignalPackets markdown keeps useful reading fields and skips empty image section", () => {
  const result = exportSignalPackets([makePacket()], {
    format: "markdown",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  assert.equal(result.mimeType, "text/markdown;charset=utf-8");
  assert.equal(result.filename, "dlens-signal-packets-2026-05-19T08-30-00-000Z.md");
  assert.match(result.content, new RegExp(`packetVersion: ${DLENS_SIGNAL_PACKET_VERSION}`));
  assert.match(result.content, /## signal-1/);
  assert.match(result.content, /Product context/);
  assert.match(result.content, /ctx_export_1/);
  assert.match(result.content, /把 Threads signal 變成 agent-readable product decisions/);
  assert.match(result.content, /Core workflows: save signal \/ review reading/);
  assert.match(result.content, /Verdict: try/);
  assert.match(result.content, /Decision trace/);
  assert.match(result.content, /structured_judgment/);
  assert.match(result.content, /Model: google:gemini-3\.1-flash-lite-preview/);
  assert.match(result.content, /Feedback timeline/);
  assert.match(result.content, /reading filed/);
  assert.match(result.content, /Agent handoff/);
  assert.match(result.content, /1\. 讀取 signal storage/);
  assert.doesNotMatch(result.content, /Image evidence/);
});

test("exportSignalPackets html renders scannable verdict lanes and collapsed signal details", () => {
  const base = makePacket();
  const watch = makePacket({
    source: { ...base.source, signalId: "signal-2", url: "https://www.threads.net/@builder/post/watch" },
    judgment: {
      ...base.judgment!,
      signalId: "signal-2",
      verdict: "watch",
      relevance: 3,
      reason: "先觀察這個 workflow 是否重複出現。",
      agentTaskSpec: undefined
    },
    agentHandoff: { taskSpec: null, targetAgent: null, taskPrompt: null, requiredContext: [] },
    userFeedback: { ...base.userFeedback, feedbackTimeline: [] }
  });
  const skip = makePacket({
    source: { ...base.source, signalId: "signal-3", url: "https://www.threads.net/@builder/post/skip" },
    judgment: {
      ...base.judgment!,
      signalId: "signal-3",
      verdict: "park",
      relevance: 2,
      reason: "目前只是泛泛而談，沒有足夠 evidence。",
      agentTaskSpec: undefined
    },
    agentHandoff: { taskSpec: null, targetAgent: null, taskPrompt: null, requiredContext: [] },
    userFeedback: { ...base.userFeedback, feedbackTimeline: [] }
  });

  const result = exportSignalPackets([base, watch, skip], {
    format: "html",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  assert.equal(result.mimeType, "text/html;charset=utf-8");
  assert.equal(result.filename, "dlens-signal-packets-2026-05-19T08-30-00-000Z.html");
  assert.match(result.content, /<title>DLens Signal Reading<\/title>/);
  assert.match(result.content, /共 3 條/);
  assert.match(result.content, /Try \(1\)/);
  assert.match(result.content, /Watch \(1\)/);
  assert.match(result.content, /Skip \(1\)/);
  assert.match(result.content, /data-signal-card="signal-1"/);
  assert.match(result.content, /<section class="reading-panel">/);
  assert.ok(
    result.content.indexOf('<section class="reading-panel">') < result.content.indexOf('<details class="signal-detail">'),
    "Reading should be visible before raw details"
  );
  assert.match(result.content, /<summary>原始資料<\/summary>/);
  assert.doesNotMatch(result.content, /Decision trace/);
  assert.doesNotMatch(result.content, /structured_judgment/);
  assert.doesNotMatch(result.content, /free_reading/);
  assert.doesNotMatch(result.content, /google:gemini-3\.1-flash-lite-preview/);
  assert.doesNotMatch(result.content, /Key insights/);
  assert.match(result.content, /Agent handoff tasks/);
  assert.match(result.content, /Codex/);
  assert.match(result.content, /agent_task adopted/);
});

test("exportSignalPackets html keeps raw details sparse with cited evidence only and no empty feedback", () => {
  const base = makePacket();
  const packet = makePacket({
    evidence: {
      ...base.evidence,
      textEvidence: [
        { id: "comment-1", ref: "e1", author: "pm", text: "Cited by judgment.", likeCount: 9 },
        { id: "comment-2", ref: "e2", author: "ops", text: "Uncited dense reply should stay out of HTML.", likeCount: 8 },
        { id: "comment-3", ref: "e3", author: "research", text: "Cited by reading.", likeCount: 7 }
      ]
    },
    judgment: {
      ...base.judgment!,
      evidenceRefs: ["e1"]
    },
    reading: {
      latest: {
        signalId: "signal-1",
        cacheKey: "reading-1",
        productContextHash: "ctx_1",
        sourcePacketHash: "pkt_1",
        promptVersion: "v1",
        reading: "這段 reading 應該直接出現在卡片頂層。",
        generatedAt: "2026-05-19T08:07:00.000Z",
        model: "google:gemini",
        sourceRefs: ["e3"],
        sourcePacket: {
          assembledContent: "source",
          postUrl: "",
          representativeComments: [],
          analysisPromptVersion: "v16"
        },
        reviewState: "filed",
        feedbackEvents: []
      },
      filed: [],
      all: []
    },
    userFeedback: {
      ...base.userFeedback,
      feedbackTimeline: []
    }
  });

  const result = exportSignalPackets([packet], {
    format: "html",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  assert.match(result.content, /這段 reading 應該直接出現在卡片頂層/);
  assert.match(result.content, /Cited by judgment/);
  assert.match(result.content, /Cited by reading/);
  assert.doesNotMatch(result.content, /Uncited dense reply should stay out of HTML/);
  assert.doesNotMatch(result.content, /No feedback events/);
  assert.doesNotMatch(result.content, /Feedback timeline/);
});

test("exportSignalPackets html escapes source and evidence text", () => {
  const packet = makePacket({
    source: {
      ...makePacket().source,
      signalId: "signal-html",
      author: "<script>alert(1)</script>"
    },
    evidence: {
      ...makePacket().evidence,
      assembledContent: "<img src=x onerror=alert(1)>",
      textEvidence: [{
        id: "comment-html",
        ref: "e1",
        author: "evil",
        text: "<script>alert(2)</script>",
        likeCount: 1
      }]
    }
  });

  const result = exportSignalPackets([packet], {
    format: "html",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  assert.doesNotMatch(result.content, /<script>alert/);
  assert.doesNotMatch(result.content, /<img src=x/);
  assert.match(result.content, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
});

test("exportSignalPackets html renders safe inline markdown in visible reading text", () => {
  const packet = makePacket({
    reading: {
      latest: {
        signalId: "signal-1",
        cacheKey: "reading-1",
        productContextHash: "ctx_1",
        sourcePacketHash: "pkt_1",
        promptVersion: "v1",
        reading: "使用者對於**資訊呈現形式**的個人化需求，也包括 _read later_ 工作流。",
        generatedAt: "2026-05-19T08:07:00.000Z",
        model: "google:gemini",
        sourceRefs: ["e1"],
        sourcePacket: {
          assembledContent: "source",
          postUrl: "",
          representativeComments: [],
          analysisPromptVersion: "v16"
        },
        reviewState: "filed",
        feedbackEvents: []
      },
      filed: [],
      all: []
    },
    decisionTrace: {
      traceVersion: "v1",
      stages: [{
        stage: "free_reading",
        outputKind: "interpretive_reading",
        generatedAt: "2026-05-19T08:07:00.000Z",
        promptVersion: "v1",
        model: "google:gemini",
        modelKnown: true,
        reasoningDetails: {
          summary: "這是**關鍵洞察**。",
          keyDecisions: ["產品啟示是**雙重檢查**。"],
          keyInsights: ["產品啟示是**雙重檢查**。"],
          tradeoffs: [],
          uncertainties: []
        },
        evidenceRefs: [],
        evidence: []
      }]
    }
  });

  const result = exportSignalPackets([packet], {
    format: "html",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  assert.match(result.content, /<strong>資訊呈現形式<\/strong>/);
  assert.match(result.content, /<em>read later<\/em>/);
  assert.doesNotMatch(result.content, /\*\*資訊呈現形式\*\*/);
  assert.doesNotMatch(result.content, /_read later_/);
  assert.doesNotMatch(result.content, /產品啟示是/);
  assert.doesNotMatch(result.content, /Decision trace/);
});
