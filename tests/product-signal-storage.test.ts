import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteProductSignalAnalysis,
  PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY,
  listProductSignalAnalyses,
  saveProductSignalAnalysis
} from "../src/compare/product-signal-storage.ts";
import type { ProductSignalAnalysis } from "../src/state/types.ts";

function makeStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, values);
    }
  };
}

function makeAnalysis(signalId: string, overrides: Partial<ProductSignalAnalysis> = {}): ProductSignalAnalysis {
  return {
    signalId,
    signalType: "learning",
    signalSubtype: "agent_memory_pattern",
    contentType: "content",
    contentSummary: "A useful implementation note.",
    relevance: 4,
    relevantTo: ["coreWorkflows"],
    whyRelevant: "It maps to a current workflow.",
    verdict: "watch",
    reason: "Useful, but not urgent.",
    evidenceRefs: [],
    productContextHash: "ctx_1",
    promptVersion: "v1",
    analyzedAt: "2026-04-27T01:00:00.000Z",
    status: "complete",
    ...overrides
  };
}

test("saveProductSignalAnalysis upserts by signal id", async () => {
  const storage = makeStorage();

  await saveProductSignalAnalysis(storage, makeAnalysis("signal-1"));
  await saveProductSignalAnalysis(storage, makeAnalysis("signal-1", { verdict: "try", reason: "Now concrete." }));

  assert.deepEqual(storage.data[PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY], {
    "signal-1": makeAnalysis("signal-1", { verdict: "try", reason: "Now concrete." })
  });
});

test("deleteProductSignalAnalysis removes only the target signal analysis", async () => {
  const storage = makeStorage({
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-1": makeAnalysis("signal-1"),
      "signal-2": makeAnalysis("signal-2")
    }
  });

  await deleteProductSignalAnalysis(storage, "signal-1");

  assert.deepEqual(await listProductSignalAnalyses(storage), [
    makeAnalysis("signal-2")
  ]);
});

test("saveProductSignalAnalysis preserves marketing signal type", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis("signal-marketing", {
    signalType: "marketing",
    signalSubtype: "case_study_angle",
    contentSummary: "A concrete positioning angle for launch copy."
  });

  await saveProductSignalAnalysis(storage, analysis);
  const analyses = await listProductSignalAnalyses(storage, ["signal-marketing"]);

  assert.deepEqual(analyses, [analysis]);
});

test("saveProductSignalAnalysis preserves product reference fields and learning targets", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis("signal-learning-reference", {
    relevantTo: ["technicalLearning", "generalLearning"],
    referenceType: "technical_learning",
    referenceLabel: "學習 browser automation 的工具邊界",
    referenceTakeaway: "這條 signal 先作為技術知識，不必立即改成 DLens 功能。"
  });

  await saveProductSignalAnalysis(storage, analysis);
  const analyses = await listProductSignalAnalyses(storage, ["signal-learning-reference"]);

  assert.deepEqual(analyses, [analysis]);
});

test("listProductSignalAnalyses normalizes legacy records and filters by signal ids", async () => {
  const storage = makeStorage({
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-1": makeAnalysis("signal-1"),
      "signal-2": makeAnalysis("signal-2", { status: "pending", verdict: "park" }),
      "broken": { signalId: "broken", relevance: 99 }
    }
  });

  const analyses = await listProductSignalAnalyses(storage, ["signal-2", "missing"]);

  assert.deepEqual(analyses, [
    makeAnalysis("signal-2", { status: "pending", verdict: "park" })
  ]);
});

test("saveProductSignalAnalysis preserves agent task specs for try signals", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis("signal-agent", {
    verdict: "try",
    agentTaskSpec: {
      targetAgent: "codex",
      taskPrompt: "You are helping set up a weekly learning digest.",
      requiredContext: ["newsletter link", "summary destination"]
    }
  });

  await saveProductSignalAnalysis(storage, analysis);
  const analyses = await listProductSignalAnalyses(storage, ["signal-agent"]);

  assert.deepEqual(analyses, [analysis]);
});

test("saveProductSignalAnalysis drops agent task specs for non-try signals", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis("signal-watch", {
    verdict: "watch",
    agentTaskSpec: {
      targetAgent: "codex",
      taskPrompt: "You are helping set up a weekly learning digest.",
      requiredContext: ["newsletter link", "summary destination"]
    }
  });

  await saveProductSignalAnalysis(storage, analysis);
  const analyses = await listProductSignalAnalyses(storage, ["signal-watch"]);

  assert.deepEqual(analyses, [
    makeAnalysis("signal-watch", { verdict: "watch" })
  ]);
});

test("saveProductSignalAnalysis preserves legacy optional fields (whyNow, validationMetric, blockers, evidenceNotes, taskTitle)", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis("signal-v3", {
    verdict: "try",
    audienceGap: "作者預期展示 agent workflow；觀眾實際追問資料接入和權限。",
    whyNow: "競品上週剛 ship，現在試最不會被搶先。",
    validationMetric: "兩週內看是否有 3 位 PM 重複使用模板。",
    blockers: ["缺 GitHub API 權限", "需要 Confluence webhook"],
    evidenceRefs: ["e1", "e2"],
    evidenceNotes: [
      {
        ref: "e1",
        quoteSummary: "提到 Claude Skill 取代 Slack tickets。",
        whyItMatters: "直接驗證 PM document workflow。",
        reusablePattern: "多來源工作流轉文件",
        whyItWorks: "把資料來源、處理邏輯和交付物分清楚。",
        grounding: "text_grounded",
        copyableTemplate: "Slack/Jira -> Claude Skill -> Release note",
        workflowStack: ["Claude Skill", "Slack", "Jira"],
        copyRecipeMarkdown: "- 讀取 Slack thread 與 Jira tickets\n- 交給 Claude Skill 摘要\n- 輸出 Release Note",
        tradeoff: "需要工具授權與資料讀取權限。"
      },
      {
        ref: "e2",
        quoteSummary: "建議用 Metabase 做 SQL 分析。",
        whyItMatters: "支撐自動化分析需求。",
        reusablePattern: "資料庫查詢轉產品洞察",
        whyItWorks: "讓 agent 直接處理已存在的營運資料。",
        grounding: "model_inferred",
        copyableTemplate: "Metabase/SQL -> Claude -> 分析摘要",
        workflowStack: ["Metabase", "SQL", "Claude"],
        copyRecipeMarkdown: "- 查詢 Metabase/SQL\n- 交給 Claude 解讀\n- 輸出產品分析摘要",
        tradeoff: "需要避免暴露敏感營運資料。"
      }
    ],
    agentTaskSpec: {
      targetAgent: "codex",
      taskTitle: "競品 Release 監",
      taskPrompt: "You are helping monitor competitor releases.",
      requiredContext: ["RSS feed", "Notion target"]
    }
  });

  await saveProductSignalAnalysis(storage, analysis);
  const analyses = await listProductSignalAnalyses(storage, ["signal-v3"]);

  assert.deepEqual(analyses, [analysis]);
});

test("normalize drops whyNow/validationMetric for non-eligible verdicts and trims blockers to 3", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis("signal-park", {
    verdict: "park",
    whyNow: "should be dropped",
    validationMetric: "should be dropped",
    blockers: ["a", "b", "c", "d", "e"]
  });

  await saveProductSignalAnalysis(storage, analysis);
  const analyses = await listProductSignalAnalyses(storage, ["signal-park"]);

  assert.equal(analyses[0]?.whyNow, undefined);
  assert.equal(analyses[0]?.validationMetric, undefined);
  assert.deepEqual(analyses[0]?.blockers, ["a", "b", "c"]);
});

test("normalize drops evidenceNotes whose ref is not in evidenceRefs", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis("signal-mixed", {
    evidenceRefs: ["e1"],
    evidenceNotes: [
      {
        ref: "e1",
        quoteSummary: "正確引用。",
        whyItMatters: "對應的判斷。",
        reusablePattern: "可借用模式",
        whyItWorks: "原因。",
        copyableTemplate: "input -> agent -> output",
        workflowStack: ["input", "agent"],
        copyRecipeMarkdown: "- input\n- agent\n- output",
        tradeoff: "限制。"
      },
      {
        ref: "e9",
        quoteSummary: "不在 evidenceRefs 裡。",
        whyItMatters: "應該被移除。",
        reusablePattern: "錯誤模式",
        whyItWorks: "不應顯示。",
        copyableTemplate: "none",
        workflowStack: ["bad"],
        copyRecipeMarkdown: "- bad",
        tradeoff: "不應顯示。"
      }
    ]
  });

  await saveProductSignalAnalysis(storage, analysis);
  const analyses = await listProductSignalAnalyses(storage, ["signal-mixed"]);

  assert.deepEqual(analyses[0]?.evidenceNotes, [
    {
      ref: "e1",
      quoteSummary: "正確引用。",
      whyItMatters: "對應的判斷。",
      reusablePattern: "可借用模式",
      whyItWorks: "原因。",
      copyableTemplate: "input -> agent -> output",
      workflowStack: ["input", "agent"],
      copyRecipeMarkdown: "- input\n- agent\n- output",
      tradeoff: "限制。"
    }
  ]);
});

test("normalize accepts snake_case optional fields from legacy storage", async () => {
  const storage = makeStorage({
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-snake": {
        ...makeAnalysis("signal-snake", { verdict: "try" }),
        whyNow: undefined,
        validationMetric: undefined,
        evidenceNotes: undefined,
        agentTaskSpec: undefined,
        why_now: "現在試最有效。",
        validation_metric: "兩週後看保留。",
        evidence_refs: ["e1"],
        evidence_notes: [
          {
            ref: "e1",
            quote_summary: "PM 提到自動化需求。",
            why_it_matters: "直接證據。",
          reusable_pattern: "討論轉週報",
          why_it_works: "降低 PM 整理成本。",
          grounding: "insufficient_detail",
          copyable_template: "Threads replies -> Claude -> weekly digest",
            workflow_stack: ["Threads", "Claude"],
            copy_recipe_markdown: "- 收集 Threads replies\n- 交給 Claude 摘要\n- 產出 weekly digest",
            tradeoff: "需要人工確認引用。"
          }
        ],
        agent_task_spec: {
          target_agent: "claude",
          task_title: "週報自動化",
          task_prompt: "Help draft a weekly digest.",
          required_context: ["source links"]
        }
      }
    }
  });

  const analyses = await listProductSignalAnalyses(storage, ["signal-snake"]);

  assert.equal(analyses[0]?.whyNow, "現在試最有效。");
  assert.equal(analyses[0]?.validationMetric, "兩週後看保留。");
  assert.deepEqual(analyses[0]?.evidenceNotes, [
    {
      ref: "e1",
      quoteSummary: "PM 提到自動化需求。",
      whyItMatters: "直接證據。",
      reusablePattern: "討論轉週報",
      whyItWorks: "降低 PM 整理成本。",
      grounding: "insufficient_detail",
      copyableTemplate: "Threads replies -> Claude -> weekly digest",
      workflowStack: ["Threads", "Claude"],
      copyRecipeMarkdown: "- 收集 Threads replies\n- 交給 Claude 摘要\n- 產出 weekly digest",
      tradeoff: "需要人工確認引用。"
    }
  ]);
  assert.equal(analyses[0]?.agentTaskSpec?.taskTitle, "週報自動化");
});

test("storage preserves valid camelCase application suggestions for non-noise try analyses", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis("signal-applications", {
    verdict: "try",
    evidenceRefs: ["e1", "e2"],
    evidenceNotes: [
      {
        ref: "e1",
        quoteSummary: "使用者希望更快比較證據。",
        whyItMatters: "支撐比較流程改善。",
        grounding: "text_grounded"
      },
      {
        ref: "e2",
        quoteSummary: "使用者會回查來源。",
        whyItMatters: "支撐保留來源入口。",
        grounding: "text_grounded"
      }
    ],
    applicationSuggestions: [
      {
        proposal: "在比較流程加入可回查的證據摘要。",
        productContextTarget: "coreWorkflows",
        supportRefs: ["e1", "e2"],
        verificationQuestion: "現有比較流程是否能在一次操作內回查兩條來源？"
      }
    ]
  });

  await saveProductSignalAnalysis(storage, analysis);

  assert.deepEqual(await listProductSignalAnalyses(storage, [analysis.signalId]), [analysis]);
});

test("storage normalizes snake_case application suggestions and caps proposal and question text", async () => {
  const proposal = `  ${"提".repeat(125)}  `;
  const verificationQuestion = `  ${"問".repeat(105)}  `;
  const storage = makeStorage({
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-snake-applications": {
        ...makeAnalysis("signal-snake-applications", {
          verdict: "try",
          evidenceRefs: ["e1"],
          evidenceNotes: [{
            ref: "e1",
            quoteSummary: "原文提出具體操作困難。",
            whyItMatters: "可用來驗證改善方向。",
            grounding: "text_grounded"
          }]
        }),
        application_suggestions: [{
          proposal,
          product_context_target: "currentCapabilities",
          support_refs: ["e1"],
          verification_question: verificationQuestion
        }]
      }
    }
  });

  const analyses = await listProductSignalAnalyses(storage, ["signal-snake-applications"]);

  assert.deepEqual(analyses[0]?.applicationSuggestions, [{
    proposal: "提".repeat(120),
    productContextTarget: "currentCapabilities",
    supportRefs: ["e1"],
    verificationQuestion: "問".repeat(100)
  }]);
});

test("storage drops a whole application suggestion when any support ref is malformed or ungrounded", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis("signal-invalid-applications", {
    verdict: "try",
    evidenceRefs: ["e1", "e2", "e3"],
    evidenceNotes: [
      {
        ref: "e1",
        quoteSummary: "有直接文字證據。",
        whyItMatters: "可支持提案。",
        grounding: "text_grounded"
      },
      {
        ref: "e2",
        quoteSummary: "只有模型推論。",
        whyItMatters: "不可支持 application suggestion。",
        grounding: "model_inferred"
      }
    ],
    applicationSuggestions: [
      {
        proposal: "混合已知與未知 ref。",
        productContextTarget: "coreWorkflows",
        supportRefs: ["e1", "e9"],
        verificationQuestion: "這個提案是否有完整來源？"
      },
      {
        proposal: "重複 ref。",
        productContextTarget: "coreWorkflows",
        supportRefs: ["e1", "e1"],
        verificationQuestion: "引用是否唯一？"
      },
      {
        proposal: "帶空白的 ref 不可被修補。",
        productContextTarget: "coreWorkflows",
        supportRefs: [" e1"],
        verificationQuestion: "引用是否保持 raw exact？"
      },
      {
        proposal: "混合非字串 ref。",
        productContextTarget: "coreWorkflows",
        supportRefs: ["e1", 1] as unknown as string[],
        verificationQuestion: "每條引用是否都是 raw string？"
      },
      {
        proposal: "使用非文字支持的 ref。",
        productContextTarget: "coreWorkflows",
        supportRefs: ["e1", "e2"],
        verificationQuestion: "每條引用是否都有文字支持？"
      },
      {
        proposal: "使用沒有 evidence note 的 ref。",
        productContextTarget: "coreWorkflows",
        supportRefs: ["e1", "e3"],
        verificationQuestion: "每條引用是否都有對應 note？"
      }
    ]
  });

  await saveProductSignalAnalysis(storage, analysis);
  const [stored] = await listProductSignalAnalyses(storage, [analysis.signalId]);

  assert.equal(stored?.applicationSuggestions, undefined);
});

test("storage drops malformed application text, target, and support ref cardinality", async () => {
  const storage = makeStorage({
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      malformed: {
        ...makeAnalysis("malformed", {
          verdict: "try",
          evidenceRefs: ["e1", "e2", "e3", "e4"],
          evidenceNotes: ["e1", "e2", "e3", "e4"].map((ref) => ({
            ref,
            quoteSummary: `文字證據 ${ref}`,
            whyItMatters: "支撐驗證。",
            grounding: "text_grounded" as const
          }))
        }),
        applicationSuggestions: [
          {
            proposal: "   ",
            productContextTarget: "coreWorkflows",
            supportRefs: ["e1"],
            verificationQuestion: "提案是否非空？"
          },
          {
            proposal: "未知 target。",
            productContextTarget: "technicalLearning",
            supportRefs: ["e1"],
            verificationQuestion: "target 是否有效？"
          },
          {
            proposal: "缺少引用。",
            productContextTarget: "coreWorkflows",
            supportRefs: [],
            verificationQuestion: "是否有引用？"
          },
          {
            proposal: "引用過多。",
            productContextTarget: "coreWorkflows",
            supportRefs: ["e1", "e2", "e3", "e4"],
            verificationQuestion: "引用是否超過上限？"
          },
          {
            proposal: "問題為空。",
            productContextTarget: "coreWorkflows",
            supportRefs: ["e1"],
            verificationQuestion: "   "
          }
        ]
      }
    }
  });

  const [stored] = await listProductSignalAnalyses(storage, ["malformed"]);

  assert.equal(stored?.applicationSuggestions, undefined);
});

test("storage deduplicates normalized proposal and target then caps valid suggestions at three", async () => {
  const storage = makeStorage({
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      capped: {
        ...makeAnalysis("capped", {
          verdict: "try",
          evidenceRefs: ["e1"],
          evidenceNotes: [{
            ref: "e1",
            quoteSummary: "直接證據。",
            whyItMatters: "支撐驗證。",
            grounding: "text_grounded"
          }]
        }),
        applicationSuggestions: [
          { proposal: "改善   比較流程", productContextTarget: "coreWorkflows", supportRefs: ["e1"], verificationQuestion: "A？" },
          { proposal: "改善 比較流程", productContextTarget: "coreWorkflows", supportRefs: ["e1"], verificationQuestion: "重複項？" },
          { proposal: "改善 比較流程", productContextTarget: "currentCapabilities", supportRefs: ["e1"], verificationQuestion: "B？" },
          { proposal: "增加驗證提示", productContextTarget: "evaluationCriteria", supportRefs: ["e1"], verificationQuestion: "C？" },
          { proposal: "補上未知項", productContextTarget: "unknowns", supportRefs: ["e1"], verificationQuestion: "D？" }
        ]
      }
    }
  });

  const [stored] = await listProductSignalAnalyses(storage, ["capped"]);

  assert.deepEqual(stored?.applicationSuggestions, [
    { proposal: "改善 比較流程", productContextTarget: "coreWorkflows", supportRefs: ["e1"], verificationQuestion: "A？" },
    { proposal: "改善 比較流程", productContextTarget: "currentCapabilities", supportRefs: ["e1"], verificationQuestion: "B？" },
    { proposal: "增加驗證提示", productContextTarget: "evaluationCriteria", supportRefs: ["e1"], verificationQuestion: "C？" }
  ]);
});

test("storage omits application suggestions for noise, non-try, and legacy records without the field", async () => {
  const validSuggestion = {
    proposal: "加入證據提示。",
    productContextTarget: "coreWorkflows" as const,
    supportRefs: ["e1"],
    verificationQuestion: "提示是否減少回查時間？"
  };
  const grounded = {
    evidenceRefs: ["e1"],
    evidenceNotes: [{
      ref: "e1",
      quoteSummary: "直接證據。",
      whyItMatters: "支撐驗證。",
      grounding: "text_grounded" as const
    }]
  };
  const storage = makeStorage({
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      noise: makeAnalysis("noise", {
        ...grounded,
        signalType: "noise",
        verdict: "try",
        applicationSuggestions: [validSuggestion]
      }),
      watch: makeAnalysis("watch", {
        ...grounded,
        verdict: "watch",
        applicationSuggestions: [validSuggestion]
      }),
      legacy: makeAnalysis("legacy", { promptVersion: "v17" })
    }
  });

  const analyses = await listProductSignalAnalyses(storage);
  const legacy = analyses.find((entry) => entry.signalId === "legacy");

  assert.equal(analyses.find((entry) => entry.signalId === "noise")?.applicationSuggestions, undefined);
  assert.equal(analyses.find((entry) => entry.signalId === "watch")?.applicationSuggestions, undefined);
  assert.ok(legacy);
  assert.equal(legacy.promptVersion, "v17");
  assert.equal(legacy.applicationSuggestions, undefined);
});

test("listProductSignalAnalyses normalizes legacy snake case agent task specs", async () => {
  const storage = makeStorage({
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-legacy": {
        ...makeAnalysis("signal-legacy", { verdict: "try" }),
        agentTaskSpec: undefined,
        agent_task_spec: {
          target_agent: "claude",
          task_prompt: "You are helping compare research notes.\n\nTask: summarize the source set.",
          required_context: ["source links", "summary destination"]
        }
      }
    }
  });

  const analyses = await listProductSignalAnalyses(storage, ["signal-legacy"]);

  assert.deepEqual(analyses[0]?.agentTaskSpec, {
    targetAgent: "claude",
    taskPrompt: "You are helping compare research notes.\n\nTask: summarize the source set.",
    requiredContext: ["source links", "summary destination"]
  });
});

test("deleteProductSignalAnalysis removes only the targeted analysis", async () => {
  const storage = makeStorage();
  await saveProductSignalAnalysis(storage, makeAnalysis("signal-1"));
  await saveProductSignalAnalysis(storage, makeAnalysis("signal-2"));

  await deleteProductSignalAnalysis(storage, "signal-1");

  const remaining = await listProductSignalAnalyses(storage);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.signalId, "signal-2");
});

test("deleteProductSignalAnalysis is a no-op for unknown signalId", async () => {
  const storage = makeStorage();
  await saveProductSignalAnalysis(storage, makeAnalysis("signal-1"));

  await deleteProductSignalAnalysis(storage, "does-not-exist");

  const remaining = await listProductSignalAnalyses(storage);
  assert.equal(remaining.length, 1);
});
