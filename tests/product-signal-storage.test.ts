import assert from "node:assert/strict";
import test from "node:test";

import {
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
        copyableTemplate: "Metabase/SQL -> Claude -> 分析摘要",
        workflowStack: ["Metabase", "SQL", "Claude"],
        copyRecipeMarkdown: "- 查詢 Metabase/SQL\n- 交給 Claude 解讀\n- 輸出產品分析摘要",
        tradeoff: "需要避免暴露敏感營運資料。"
      }
    ],
    agentTaskSpec: {
      targetAgent: "codex",
      taskTitle: "競品 Release 監控",
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
      copyableTemplate: "Threads replies -> Claude -> weekly digest",
      workflowStack: ["Threads", "Claude"],
      copyRecipeMarkdown: "- 收集 Threads replies\n- 交給 Claude 摘要\n- 產出 weekly digest",
      tradeoff: "需要人工確認引用。"
    }
  ]);
  assert.equal(analyses[0]?.agentTaskSpec?.taskTitle, "週報自動化");
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
