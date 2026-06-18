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
      assembledContent: "Root post plus OP continuation.",
      citedInReadingRefs: {}
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

test("exportSignalPackets html uses compact density without changing packet contract", () => {
  const base = makePacket();
  const htmlResult = exportSignalPackets([base, makePacket({
    source: { ...base.source, signalId: "signal-2" }
  })], {
    format: "html",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  assert.match(htmlResult.content, /<main data-signal-packet-density="compact">/);
  assert.match(htmlResult.content, /\.signal-card \{\n      margin: 0 0 44px;/);
  assert.match(htmlResult.content, /\.signal-card \+ \.signal-card \{\n      padding-top: 44px;/);
  assert.match(htmlResult.content, /\.reading-text \{\n      font: 400 16px\/1\.75 var\(--serif\);/);
  assert.match(htmlResult.content, /\.cited-quote \{\n      margin: 0 0 12px;\n      padding: 12px 16px 12px 18px;/);

  const jsonlResult = exportSignalPackets([makePacket()], {
    format: "jsonl",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });
  const [packet] = jsonlResult.content.trim().split("\n").map((line) => JSON.parse(line) as DLensSignalPacket);

  assert.equal(packet?.packetVersion, DLENS_SIGNAL_PACKET_VERSION);
  assert.doesNotMatch(jsonlResult.content, /signalPacketDensity|htmlDensity/);
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

test("exportSignalPackets html renames cited evidence section and collapses beyond top 5", () => {
  const base = makePacket();
  const textEvidence = Array.from({ length: 7 }, (_, index) => ({
    id: `comment-${index + 1}`,
    ref: `e${index + 1}`,
    author: `user${index + 1}`,
    text: `留言 ${index + 1} 的文字內容。`,
    likeCount: (7 - index) * 10
  }));
  const packet = makePacket({
    evidence: { ...base.evidence, textEvidence },
    judgment: {
      ...base.judgment!,
      evidenceRefs: textEvidence.map((entry) => entry.ref)
    },
    reading: {
      latest: {
        signalId: "signal-1",
        cacheKey: "reading-collapse",
        productContextHash: "ctx_1",
        sourcePacketHash: "pkt_1",
        promptVersion: "v9",
        reading: "判讀文本。",
        generatedAt: "2026-05-19T08:07:00.000Z",
        model: "google:gemini-3.1-flash-lite-preview",
        sourceRefs: textEvidence.map((entry) => entry.ref),
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
    }
  });

  const result = exportSignalPackets([packet], {
    format: "html",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  // Renamed heading and aria-label
  assert.match(result.content, /<h4>判讀輸入證據<\/h4>/);
  assert.match(result.content, /aria-label="判讀輸入證據"/);
  assert.doesNotMatch(result.content, /<h4>Cited evidence<\/h4>/);

  // Collapse summary appears with the count of hidden refs (7 - 5 = 2)
  assert.match(result.content, /data-evidence-collapse="cited"/);
  assert.match(result.content, /展開其餘 2 則/);

  // Top 5 (by likeCount desc) appear above the collapse summary,
  // remaining 2 appear inside the collapsed body
  const collapseStart = result.content.indexOf('data-evidence-collapse="cited"');
  assert.ok(collapseStart > -1);
  const headPortion = result.content.slice(0, collapseStart);
  const tailPortion = result.content.slice(collapseStart);
  // e1 has highest likeCount (70), e7 has lowest (10).
  // Sorted desc: e1, e2, e3, e4, e5 are visible; e6, e7 are collapsed.
  for (const ref of ["e1", "e2", "e3", "e4", "e5"]) {
    assert.ok(headPortion.includes(`data-evidence-ref="${ref}"`), `${ref} should be in visible section`);
  }
  for (const ref of ["e6", "e7"]) {
    assert.ok(tailPortion.includes(`data-evidence-ref="${ref}"`), `${ref} should be in collapsed section`);
    assert.ok(!headPortion.includes(`data-evidence-ref="${ref}"`), `${ref} should not appear before collapse`);
  }
});

test("exportSignalPackets html surfaces provenance strip with reading + analysis + model + counts", () => {
  const base = makePacket();
  const textEvidence = [
    { id: "c1", ref: "e1", author: "alice", text: "first", likeCount: 12 },
    { id: "c2", ref: "e2", author: "bob", text: "second", likeCount: 3 }
  ];
  const packet = makePacket({
    evidence: { ...base.evidence, textEvidence },
    judgment: { ...base.judgment!, evidenceRefs: ["e1", "e2"], promptVersion: "v16" },
    source: { ...base.source, capturedAt: "2026-05-15T10:00:00.000Z" },
    reading: {
      latest: {
        signalId: "signal-1",
        cacheKey: "reading-prov",
        productContextHash: "ctx_1",
        sourcePacketHash: "pkt_1",
        promptVersion: "v9",
        reading: "判讀文本。",
        generatedAt: "2026-05-19T08:07:00.000Z",
        model: "google:gemini-3.1-flash-lite-preview",
        sourceRefs: ["e1", "e2"],
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
    }
  });

  const result = exportSignalPackets([packet], {
    format: "html",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  assert.match(result.content, /data-signal-provenance="true"/);
  // Each provenance fragment present in order
  assert.match(result.content, /判讀 v9 · 分析 v16 · Gemini Flash · 2 則留言 · max ♥12 · captured 2026-05-15/);
});

test("exportSignalPackets html provenance strip displays existing source metadata only", () => {
  const base = makePacket();
  const packet = makePacket({
    source: {
      ...base.source,
      source: "threads",
      itemStatus: "succeeded",
      captureId: "cap-html-1"
    }
  });

  const result = exportSignalPackets([packet], {
    format: "html",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  assert.match(result.content, /來源 threads · capture cap-html-1 · item succeeded/);
  assert.doesNotMatch(result.content, /packetSourceProvenance|sourceProvenance/);
});

test("exportSignalPackets html catalog block also collapses beyond top 5", () => {
  const base = makePacket();
  const textEvidence = Array.from({ length: 8 }, (_, index) => ({
    id: `c-${index + 1}`,
    ref: `e${index + 1}`,
    author: `u${index + 1}`,
    text: `catalog item ${index + 1}`,
    likeCount: (8 - index) * 2
  }));
  const packet = makePacket({
    evidence: { ...base.evidence, textEvidence },
    judgment: {
      ...base.judgment!,
      evidenceRefs: textEvidence.map((entry) => entry.ref)
    },
    reading: {
      latest: {
        signalId: "signal-1",
        cacheKey: "reading-catalog",
        productContextHash: "ctx_1",
        sourcePacketHash: "pkt_1",
        promptVersion: "v9",
        reading: "判讀。",
        generatedAt: "2026-05-19T08:07:00.000Z",
        model: "google:gemini-3.1-flash-lite-preview",
        sourceRefs: textEvidence.map((entry) => entry.ref),
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
    }
  });

  const result = exportSignalPackets([packet], {
    format: "html",
    generatedAt: "2026-05-19T08:30:00.000Z"
  });

  assert.match(result.content, /data-evidence-collapse="catalog"/);
  // 8 entries, 5 visible, 3 collapsed
  assert.match(result.content, /展開其餘 3 則/);
});

test("formatModelShortName fallback table covers Gemini/Claude/GPT and other providers", () => {
  // Run via exportSignalPackets with different model identifiers to exercise the path
  const base = makePacket();
  const cases: Array<{ model: string; expected: string }> = [
    { model: "google:gemini-3.1-flash-lite-preview", expected: "Gemini Flash" },
    { model: "google:gemini-3.1-pro", expected: "Gemini Pro" },
    { model: "anthropic:claude-sonnet-4.7", expected: "Claude Sonnet" },
    { model: "anthropic:claude-opus-4", expected: "Claude Opus" },
    { model: "openai:gpt-4o", expected: "GPT-4" },
    { model: "mistral:mixtral-8x7b", expected: "Mixtral" }
  ];
  for (const { model, expected } of cases) {
    const packet = makePacket({
      reading: {
        latest: {
          signalId: "signal-1",
          cacheKey: `reading-${model}`,
          productContextHash: "ctx_1",
          sourcePacketHash: "pkt_1",
          promptVersion: "v9",
          reading: "判讀。",
          generatedAt: "2026-05-19T08:07:00.000Z",
          model,
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
      judgment: { ...base.judgment!, evidenceRefs: ["e1"], promptVersion: "v16" }
    });
    const result = exportSignalPackets([packet], {
      format: "html",
      generatedAt: "2026-05-19T08:30:00.000Z"
    });
    assert.ok(
      result.content.includes(expected),
      `Expected ${expected} in provenance strip for model ${model}`
    );
  }
});
