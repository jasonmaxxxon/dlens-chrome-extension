import type {
  CaptureSnapshot,
  ThreadReadModelPostSnapshot,
  ThreadReadModelSnapshot
} from "../contracts/ingest.ts";
import type {
  ProductContext,
  ProductContextField,
  ProductAgentTaskSpec,
  ProductSignalAnalysis,
  ProductSignalContentType,
  ProductSignalEvidenceNote,
  ProductSignalType,
  ProductSignalVerdict,
  FolderMode,
  SessionRecord,
  SessionItemStatus,
  Signal,
  SignalSource
} from "../state/types.ts";
import type { ProductSignalPreferenceExample } from "./product-signal-history.ts";

export const PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION = "v8";
export const PRODUCT_SIGNAL_ANALYSIS_CACHE_VERSION = PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION;

export const PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "signal_type",
    "signal_subtype",
    "content_type",
    "content_summary",
    "relevance",
    "relevant_to",
    "why_relevant",
    "verdict",
    "reason",
    "experiment_hint",
    "agent_task_spec",
    "evidence_refs",
    "evidence_notes"
  ],
  properties: {
    signal_type: { type: "string", enum: ["learning", "competitor", "demand", "technical", "noise"] },
    signal_subtype: { type: "string" },
    content_type: { type: "string", enum: ["content", "discussion_starter", "mixed"] },
    content_summary: { type: "string" },
    relevance: { type: "integer", enum: [1, 2, 3, 4, 5] },
    relevant_to: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "productPromise",
          "targetAudience",
          "agentRoles",
          "coreWorkflows",
          "currentCapabilities",
          "explicitConstraints",
          "nonGoals",
          "preferredTechDirection",
          "evaluationCriteria",
          "unknowns"
        ]
      }
    },
    why_relevant: { type: "string" },
    verdict: { type: "string", enum: ["try", "watch", "park", "insufficient_data"] },
    reason: { type: "string" },
    experiment_hint: { type: ["string", "null"] },
    agent_task_spec: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["target_agent", "task_title", "task_prompt", "required_context"],
      properties: {
        target_agent: { type: "string", enum: ["codex", "claude", "generic"] },
        task_title: { type: ["string", "null"] },
        task_prompt: { type: "string" },
        required_context: { type: "array", items: { type: "string" } }
      }
    },
    evidence_refs: { type: "array", items: { type: "string" } },
    evidence_notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "ref",
          "quote_summary",
          "why_it_matters",
          "reusable_pattern",
          "why_it_works",
          "copyable_template",
          "workflow_stack",
          "copy_recipe_markdown",
          "tradeoff"
        ],
        properties: {
          ref: { type: "string" },
          quote_summary: { type: "string" },
          why_it_matters: { type: "string" },
          reusable_pattern: { type: "string" },
          why_it_works: { type: "string" },
          copyable_template: { type: "string" },
          workflow_stack: { type: "array", items: { type: "string" } },
          copy_recipe_markdown: { type: "string" },
          tradeoff: { type: "string" }
        }
      }
    }
  }
} as const;

export interface ProductSignalDiscussionReply {
  id: string;
  author: string;
  text: string;
  likeCount?: number | null;
}

export interface ProductSignalEvidenceEntry extends ProductSignalDiscussionReply {
  ref: string;
}

export interface ProductSignalAnalyzerInput {
  signalId: string;
  source: SignalSource;
  assembledContent: string;
  discussionReplies: ProductSignalDiscussionReply[];
  productContext: ProductContext;
  productContextHash: string;
  feedbackExamples?: ProductSignalPreferenceExample[];
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readThreadPostId(post: ThreadReadModelPostSnapshot): string {
  return readTrimmedString(post.postId ?? post.post_id ?? post.commentId ?? post.comment_id);
}

function readThreadPostText(post: ThreadReadModelPostSnapshot): string {
  return readTrimmedString(post.text);
}

function readThreadPostAuthor(post: ThreadReadModelPostSnapshot): string {
  return readTrimmedString(post.author) || "unknown";
}

function readThreadPostLikeCount(post: ThreadReadModelPostSnapshot): number | null {
  return readNumber(post.likeCount ?? post.like_count);
}

function normalizeThreadPost(post: ThreadReadModelPostSnapshot, fallbackId: string): ProductSignalDiscussionReply | null {
  const text = readThreadPostText(post);
  if (!text) {
    return null;
  }
  return {
    id: readThreadPostId(post) || fallbackId,
    author: readThreadPostAuthor(post),
    text,
    likeCount: readThreadPostLikeCount(post)
  };
}

function readThreadReadModel(capture: CaptureSnapshot | null | undefined): ThreadReadModelSnapshot | null {
  const result = capture?.result;
  return result?.threadReadModel ?? result?.thread_read_model ?? null;
}

export function hasProductSignalAssembledContent(capture: CaptureSnapshot | null | undefined): boolean {
  const threadReadModel = readThreadReadModel(capture);
  return Boolean(readTrimmedString(threadReadModel?.assembledContent ?? threadReadModel?.assembled_content));
}

function readLegacyCanonicalContent(capture: CaptureSnapshot | null | undefined): string {
  return readTrimmedString(capture?.result?.canonical_post?.text ?? capture?.text_snippet);
}

function readLegacyDiscussionReplies(capture: CaptureSnapshot | null | undefined): ProductSignalDiscussionReply[] {
  const comments = capture?.result?.comments ?? [];
  return comments
    .map((comment, index) =>
      normalizeThreadPost(comment as ThreadReadModelPostSnapshot, `comment_${index + 1}`)
    )
    .filter((reply): reply is ProductSignalDiscussionReply => reply !== null);
}

export function buildProductSignalAnalyzerInputFromCapture({
  signalId,
  source,
  capture,
  productContext,
  productContextHash,
  feedbackExamples
}: {
  signalId: string;
  source: SignalSource;
  capture: CaptureSnapshot | null | undefined;
  productContext: ProductContext;
  productContextHash: string;
  feedbackExamples?: ProductSignalPreferenceExample[];
}): ProductSignalAnalyzerInput | null {
  const threadReadModel = readThreadReadModel(capture);
  const assembledContent = readTrimmedString(threadReadModel?.assembledContent ?? threadReadModel?.assembled_content)
    || readLegacyCanonicalContent(capture);
  if (!assembledContent) {
    return null;
  }

  const discussionPosts = threadReadModel?.discussionReplies ?? threadReadModel?.discussion_replies;
  const discussionReplies = Array.isArray(discussionPosts)
    ? discussionPosts
      .map((post, index) => normalizeThreadPost(post, `discussion_${index + 1}`))
      .filter((reply): reply is ProductSignalDiscussionReply => reply !== null)
    : readLegacyDiscussionReplies(capture);

  return {
    signalId,
    source,
    assembledContent,
    discussionReplies,
    productContext,
    productContextHash,
    ...(feedbackExamples?.length ? { feedbackExamples: feedbackExamples.slice(0, 3) } : {})
  };
}

export function shouldAutoAnalyzeProductSignal({
  sessionMode,
  itemStatus,
  capture,
  existingAnalysis,
  productContextHash
}: {
  sessionMode: FolderMode;
  itemStatus: SessionItemStatus;
  capture: CaptureSnapshot | null | undefined;
  existingAnalysis: ProductSignalAnalysis | null | undefined;
  productContextHash: string;
}): boolean {
  if (sessionMode !== "product" || itemStatus !== "succeeded") {
    return false;
  }
  if (!hasProductSignalAssembledContent(capture)) {
    return false;
  }
  return !(
    existingAnalysis?.status === "complete"
    && existingAnalysis.productContextHash === productContextHash
    && existingAnalysis.promptVersion === PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION
  );
}

export function collectQueueableProductSignalItemIds(session: SessionRecord, signals: Signal[]): string[] {
  if (session.mode !== "product") {
    return [];
  }
  const itemsById = new Map(session.items.map((item) => [item.id, item]));
  const itemIds = new Set<string>();
  for (const signal of signals) {
    if (!signal.itemId || signal.inboxStatus === "archived" || signal.inboxStatus === "rejected") {
      continue;
    }
    const item = itemsById.get(signal.itemId);
    if (item?.status === "saved") {
      itemIds.add(item.id);
    }
  }
  return [...itemIds];
}

const PRODUCT_CONTEXT_FIELDS: ProductContextField[] = [
  "productPromise",
  "targetAudience",
  "agentRoles",
  "coreWorkflows",
  "currentCapabilities",
  "explicitConstraints",
  "nonGoals",
  "preferredTechDirection",
  "evaluationCriteria",
  "unknowns"
];

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readPromptString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readMarkdownString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(readTrimmedString).filter(Boolean);
}

function readSignalType(value: unknown): ProductSignalType | null {
  return value === "learning" || value === "competitor" || value === "demand" || value === "technical" || value === "noise"
    ? value
    : null;
}

function readContentType(value: unknown): ProductSignalContentType | null {
  return value === "content" || value === "discussion_starter" || value === "mixed" ? value : null;
}

function readVerdict(value: unknown): ProductSignalVerdict | null {
  return value === "try" || value === "watch" || value === "park" || value === "insufficient_data" ? value : null;
}

function readRelevance(value: unknown): ProductSignalAnalysis["relevance"] | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}

function readTargetAgent(value: unknown): ProductAgentTaskSpec["targetAgent"] | null {
  return value === "codex" || value === "claude" || value === "generic" ? value : null;
}

function readAgentTaskSpec(value: unknown): ProductAgentTaskSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const targetAgent = readTargetAgent(raw.targetAgent ?? raw.target_agent);
  const taskPrompt = readPromptString(raw.taskPrompt ?? raw.task_prompt);
  const requiredContext = readStringArray(raw.requiredContext ?? raw.required_context).slice(0, 8);
  const taskTitle = readTrimmedString(raw.taskTitle ?? raw.task_title).slice(0, 24);
  if (!targetAgent || !taskPrompt) {
    return null;
  }
  return {
    targetAgent,
    taskPrompt,
    requiredContext,
    ...(taskTitle ? { taskTitle } : {})
  };
}

function readEvidenceNotes(value: unknown, allowedRefs: Set<string>): ProductSignalEvidenceNote[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const ref = readTrimmedString(raw.ref);
      const quoteSummary = readTrimmedString(raw.quoteSummary ?? raw.quote_summary);
      const whyItMatters = readTrimmedString(raw.whyItMatters ?? raw.why_it_matters);
      const reusablePattern = readTrimmedString(raw.reusablePattern ?? raw.reusable_pattern).slice(0, 80);
      const whyItWorks = readTrimmedString(raw.whyItWorks ?? raw.why_it_works).slice(0, 120);
      const copyableTemplate = readTrimmedString(raw.copyableTemplate ?? raw.copyable_template).slice(0, 140);
      const workflowStack = readStringArray(raw.workflowStack ?? raw.workflow_stack).slice(0, 6);
      const copyRecipeMarkdown = readMarkdownString(raw.copyRecipeMarkdown ?? raw.copy_recipe_markdown).slice(0, 420);
      const tradeoff = readTrimmedString(raw.tradeoff).slice(0, 120);
      if (!ref || !allowedRefs.has(ref) || !quoteSummary || !whyItMatters) {
        return null;
      }
      return {
        ref,
        quoteSummary,
        whyItMatters,
        ...(reusablePattern ? { reusablePattern } : {}),
        ...(whyItWorks ? { whyItWorks } : {}),
        ...(copyableTemplate ? { copyableTemplate } : {}),
        ...(workflowStack.length ? { workflowStack } : {}),
        ...(copyRecipeMarkdown ? { copyRecipeMarkdown } : {}),
        ...(tradeoff ? { tradeoff } : {})
      };
    })
    .filter((note): note is ProductSignalEvidenceNote => note !== null);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildProductContextHash(productContext: ProductContext): string {
  let hash = 2166136261;
  const input = stableJson(productContext);
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ctx_${(hash >>> 0).toString(36)}`;
}

function buildEvidenceCatalog(replies: ProductSignalDiscussionReply[]): string {
  return replies.length
    ? replies
      .slice(0, 20)
      .map((reply, index) =>
        `e${index + 1} author=${readTrimmedString(reply.author) || "unknown"} likes=${reply.likeCount ?? 0} text=${readTrimmedString(reply.text).slice(0, 500)}`
      )
      .join("\n")
    : "none";
}

function compactPromptLine(value: string, maxLength = 260): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}…` : compacted;
}

function buildFeedbackExamplesSection(examples: ProductSignalPreferenceExample[] | undefined): string[] {
  const usable = Array.isArray(examples) ? examples.slice(0, 3) : [];
  if (!usable.length) {
    return [];
  }
  return [
    "",
    "[USER_FEEDBACK_EXAMPLES]",
    "這些是本機歷史 feedback，只作為偏好 few-shot；不要照抄內容，也不要提到有個人記憶。",
    "feedback=adopted 代表使用者接受這類 agent_task_spec；feedback=needs_rewrite 代表方向可用但 task_prompt 要依 note 改善。",
    ...usable.map((example, index) => [
      `example_${index + 1}: feedback=${example.feedback} signal_subtype=${example.signalSubtype}`,
      `content_summary=${compactPromptLine(example.contentSummary, 180)}`,
      `task_title=${compactPromptLine(example.taskTitle || "", 80)}`,
      `task_prompt=${compactPromptLine(example.taskPrompt, 420)}`,
      example.note ? `note=${compactPromptLine(example.note, 180)}` : ""
    ].filter(Boolean).join("\n"))
  ];
}

export function buildProductSignalEvidenceCatalogFromCapture(
  capture: CaptureSnapshot | null | undefined
): ProductSignalEvidenceEntry[] {
  const threadReadModel = readThreadReadModel(capture);
  const discussionPosts = threadReadModel?.discussionReplies ?? threadReadModel?.discussion_replies;
  const replies = Array.isArray(discussionPosts)
    ? discussionPosts
      .map((post, index) => normalizeThreadPost(post, `discussion_${index + 1}`))
      .filter((reply): reply is ProductSignalDiscussionReply => reply !== null)
    : readLegacyDiscussionReplies(capture);

  return replies.slice(0, 20).map((reply, index) => ({
    ...reply,
    ref: `e${index + 1}`
  }));
}

export function buildProductSignalAnalyzerPrompt(input: ProductSignalAnalyzerInput): string {
  return [
    "你是 ProductSignalAnalyzer。你會讀一則 Threads signal，判斷它對指定產品是否有用。",
    "只回傳 JSON，不要加入 markdown 或解釋。不要使用 rule-based hint；content_type 必須由 assembled_content 和 discussion replies 判斷。",
    "",
    "語言規則（重要）：",
    "- 所有面向用戶的文字欄位必須用繁體中文書寫：content_summary、why_relevant、reason、experiment_hint、evidence_notes 的 quote_summary、why_it_matters、reusable_pattern、why_it_works、copyable_template、workflow_stack、copy_recipe_markdown、tradeoff、agent_task_spec.task_title。",
    "- 原文若是英文，要用中文「翻譯 + 摘要」，不要直接引用整段英文。",
    "- 機器欄位保留英文 enum：signal_type、signal_subtype（snake_case 標籤）、content_type、verdict、relevant_to、target_agent、evidence_refs、ref。",
    "- agent_task_spec.task_prompt 是貼給 Codex/Claude 的指令，可以英文或中文；其他欄位都要繁中。",
    "",
    "長度規則（重要）：寫短句、不寫段落。",
    "- content_summary：單句摘要，<= 50 字；必須點出具體 workflow / use case，不要寫「PM 熱烈討論」「市場熱度高」這類空話",
    "- why_relevant：單句，<= 60 字；指出哪個具體做法對應 ProductContext，不要只說「驗證核心價值」",
    "- reason：單句，<= 60 字",
    "- experiment_hint：單句，<= 50 字；寫成可執行的小實驗，不要寫抽象研究任務",
    "- evidence_notes[*].quote_summary：單句中文摘錄，<= 40 字（不是貼原文）",
    "- evidence_notes[*].why_it_matters：單句，<= 50 字，說明這條為什麼是該判斷的證據",
    "- evidence_notes[*].reusable_pattern：單句，<= 28 字，抽出可借用 workflow；不是分類名",
    "- evidence_notes[*].why_it_works：單句，<= 45 字，說明為什麼這個做法可以成立",
    "- evidence_notes[*].copyable_template：<= 70 字，寫成「輸入來源 -> Agent 處理 -> 交付物」的如何照抄模板",
    "- evidence_notes[*].workflow_stack：0-6 個明確出現在該 evidence 原文的工具、資料來源或輸出位置；不要補不存在的工具",
    "- evidence_notes[*].copy_recipe_markdown：<= 260 字的 markdown recipe；必須包含輸入、處理、輸出；quote 太短或缺任一環節就用空字串",
    "- evidence_notes[*].tradeoff：單句，<= 50 字；寫明權限、資料品質、整合成本或不應過度推導的限制",
    "- agent_task_spec.task_title：<= 12 字，用於 UI 卡片 header；不是 task_prompt 的第一行",
    "",
    "判斷規則：",
    "- signal_type: learning | competitor | demand | technical | noise",
    "- signal_subtype 要精確到具體技術、行為或產品模式；避免 agent_workflow 這類泛稱。好例子：mcp_integration、browser_automation、recurring_data_crawl、pm_document_generation、competitor_release_monitoring",
    "- content_type: content = 主要是完整內容分享；discussion_starter = 主要引出他人回應；mixed = 內容與回應都重要",
    "- relevance: 1-5，只能用整數；不要產生百分比、指數或假分數",
    "- verdict: try = 值得小實驗；watch = 先觀察；park = 不適合目前產品；insufficient_data = 資料不足",
    "- 所有 schema keys 都必須出現；不適用時用 null、空字串或空陣列，不要省略 key。",
    "- experiment_hint 必須是 string；只有 verdict=try 時填具體實驗，其餘情況用空字串",
    "- agent_task_spec: 只有 verdict=try 時填 object；其餘回 null。target_agent 按性質選 codex/claude/generic；task_title <=12 字；task_prompt 必須可直接貼入 Codex / Claude，不是描述。",
    "- evidence_refs 只能引用下方 evidence catalog 的 e1/e2/...；沒有證據就回空陣列",
    "- evidence_notes：對 evidence_refs 列出的每個 ref 都要補一條對應 note；ref 必須來自 evidence_refs；沒有 evidence_refs 就回空陣列",
    "- evidence_notes 不只是引用理由；要把高技術含量留言拆成可學習的 workflow pattern，讓用戶知道可以 copy/改造哪個做法。",
    "- evidence_notes 必須是 evidence-specific，不要把 thread-level content_summary 複製到每條 evidence。",
    "- quote 太短時，不要硬擠 how-to；workflow_stack 用空陣列、copy_recipe_markdown 用空字串，tradeoff 寫「原文不足以推導完整做法」。",
    "- 輸出面向產品洞察，不要提 cluster、分群演算法或後端分析細節。",
    "",
    "[PRODUCT_CONTEXT]",
    JSON.stringify(input.productContext, null, 2),
    ...buildFeedbackExamplesSection(input.feedbackExamples),
    "",
    "[SIGNAL]",
    `signal_id=${input.signalId}`,
    `source=${input.source}`,
    `product_context_hash=${input.productContextHash}`,
    "",
    "[ASSEMBLED_CONTENT]",
    input.assembledContent.slice(0, 8000),
    "",
    "[DISCUSSION_EVIDENCE]",
    buildEvidenceCatalog(input.discussionReplies),
    "",
    "JSON schema:",
    JSON.stringify({
      signal_type: "learning|competitor|demand|technical|noise",
      signal_subtype: "string (snake_case 英文)",
      content_type: "content|discussion_starter|mixed",
      content_summary: "繁中單句 <=50 字，具體 workflow/use case",
      relevance: "1|2|3|4|5",
      relevant_to: PRODUCT_CONTEXT_FIELDS,
      why_relevant: "繁中單句 <=60 字，具體對應 ProductContext",
      verdict: "try|watch|park|insufficient_data",
      reason: "繁中單句 <=60 字",
      experiment_hint: "繁中單句 <=50 字 (verdict=try 才填)",
      agent_task_spec: {
        target_agent: "codex|claude|generic",
        task_title: "繁中 <=12 字",
        task_prompt: "直接貼給 agent 的指令 (verdict=try 才填)",
        required_context: ["string"]
      },
      evidence_refs: ["e1"],
      evidence_notes: [{
        ref: "e1",
        quote_summary: "繁中單句 <=40 字",
        why_it_matters: "繁中單句 <=50 字",
        reusable_pattern: "可借用 workflow <=28 字",
        why_it_works: "為什麼可以這樣做 <=45 字",
        copyable_template: "輸入來源 -> Agent 處理 -> 可交付輸出",
        workflow_stack: ["明確工具或資料來源"],
        copy_recipe_markdown: "- Input: ...\n- Process: ...\n- Output: ...",
        tradeoff: "權限、整合或資料限制"
      }]
    }, null, 2)
  ].join("\n");
}

interface ProductSignalAnalysisPayload {
  signal_type?: unknown;
  signalType?: unknown;
  signal_subtype?: unknown;
  signalSubtype?: unknown;
  content_type?: unknown;
  contentType?: unknown;
  content_summary?: unknown;
  contentSummary?: unknown;
  relevance?: unknown;
  relevant_to?: unknown;
  relevantTo?: unknown;
  why_relevant?: unknown;
  whyRelevant?: unknown;
  verdict?: unknown;
  reason?: unknown;
  experiment_hint?: unknown;
  experimentHint?: unknown;
  why_now?: unknown;
  whyNow?: unknown;
  validation_metric?: unknown;
  validationMetric?: unknown;
  blockers?: unknown;
  agent_task_spec?: unknown;
  agentTaskSpec?: unknown;
  evidence_refs?: unknown;
  evidenceRefs?: unknown;
  evidence_notes?: unknown;
  evidenceNotes?: unknown;
}

export function parseProductSignalAnalysisResponse(
  raw: string,
  input: ProductSignalAnalyzerInput,
  analyzedAt = new Date().toISOString()
): ProductSignalAnalysis | null {
  let parsed: ProductSignalAnalysisPayload;
  try {
    parsed = JSON.parse(stripCodeFence(raw)) as ProductSignalAnalysisPayload;
  } catch {
    return null;
  }

  const signalType = readSignalType(parsed.signalType ?? parsed.signal_type);
  const signalSubtype = readTrimmedString(parsed.signalSubtype ?? parsed.signal_subtype);
  const contentType = readContentType(parsed.contentType ?? parsed.content_type);
  const contentSummary = readTrimmedString(parsed.contentSummary ?? parsed.content_summary);
  const relevance = readRelevance(parsed.relevance);
  const whyRelevant = readTrimmedString(parsed.whyRelevant ?? parsed.why_relevant);
  const verdict = readVerdict(parsed.verdict);
  const reason = readTrimmedString(parsed.reason);
  if (!signalType || !signalSubtype || !contentType || !contentSummary || relevance == null || !whyRelevant || !verdict || !reason) {
    return null;
  }

  const allowedRefs = new Set(input.discussionReplies.map((_, index) => `e${index + 1}`));
  const relevantTo = readStringArray(parsed.relevantTo ?? parsed.relevant_to)
    .filter((field): field is ProductContextField => PRODUCT_CONTEXT_FIELDS.includes(field as ProductContextField));
  const evidenceRefs = readStringArray(parsed.evidenceRefs ?? parsed.evidence_refs)
    .filter((ref) => allowedRefs.has(ref));
  const evidenceRefSet = new Set(evidenceRefs);
  const experimentHint = readTrimmedString(parsed.experimentHint ?? parsed.experiment_hint);
  const agentTaskSpec = verdict === "try"
    ? readAgentTaskSpec(parsed.agentTaskSpec ?? parsed.agent_task_spec)
    : null;
  const whyNowRaw = readTrimmedString(parsed.whyNow ?? parsed.why_now);
  const whyNow = (verdict === "try" || verdict === "watch") && whyNowRaw ? whyNowRaw : "";
  const validationMetricRaw = readTrimmedString(parsed.validationMetric ?? parsed.validation_metric);
  const validationMetric = verdict === "try" && validationMetricRaw ? validationMetricRaw : "";
  const blockers = readStringArray(parsed.blockers).slice(0, 3);
  const evidenceNotes = readEvidenceNotes(parsed.evidenceNotes ?? parsed.evidence_notes, evidenceRefSet);

  return {
    signalId: input.signalId,
    signalType,
    signalSubtype,
    contentType,
    contentSummary,
    relevance,
    relevantTo,
    whyRelevant,
    verdict,
    reason,
    ...(experimentHint ? { experimentHint } : {}),
    ...(whyNow ? { whyNow } : {}),
    ...(validationMetric ? { validationMetric } : {}),
    ...(blockers.length ? { blockers } : {}),
    ...(agentTaskSpec ? { agentTaskSpec } : {}),
    evidenceRefs,
    ...(evidenceNotes.length ? { evidenceNotes } : {}),
    productContextHash: input.productContextHash,
    promptVersion: PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
    analyzedAt,
    status: "complete"
  };
}
