import type {
  CaptureSnapshot,
  ThreadReadModelPostSnapshot,
  ThreadReadModelSnapshot
} from "../contracts/ingest.ts";
import type {
  ProductContext,
  ProductAgentTaskSpec,
  ProductSignalAnalysis,
  ProductSignalContentType,
  ProductSignalEvidenceNote,
  ProductSignalEvidenceGrounding,
  ProductSignalReferenceTarget,
  ProductSignalReferenceType,
  ProductSignalType,
  ProductSignalVerdict,
  FolderMode,
  SessionRecord,
  SessionItemStatus,
  Signal,
  SignalSource
} from "../state/types.ts";
import type { ProductSignalPreferenceExample } from "./product-signal-history.ts";

export const PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION = "v17";
export const PRODUCT_SIGNAL_ANALYSIS_CACHE_VERSION = PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION;

const PRODUCT_SIGNAL_REFERENCE_TYPES: ProductSignalReferenceType[] = [
  "product_reference",
  "technical_learning",
  "workflow_pattern",
  "market_language",
  "general_learning",
  "no_direct_fit"
];

const PRODUCT_SIGNAL_REFERENCE_TARGETS: ProductSignalReferenceTarget[] = [
  "productPromise",
  "targetAudience",
  "agentRoles",
  "coreWorkflows",
  "currentCapabilities",
  "explicitConstraints",
  "nonGoals",
  "preferredTechDirection",
  "evaluationCriteria",
  "unknowns",
  "technicalLearning",
  "workflowPattern",
  "marketLanguage",
  "productAnalogy",
  "generalLearning",
  "noDirectFit"
];

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
    "reference_type",
    "reference_label",
    "reference_takeaway",
    "why_relevant",
    "verdict",
    "reason",
    "experiment_hint",
    "agent_task_spec",
    "evidence_refs",
    "evidence_notes"
  ],
  properties: {
    signal_type: { type: "string", enum: ["learning", "competitor", "demand", "technical", "marketing", "noise"] },
    signal_subtype: { type: "string" },
    content_type: { type: "string", enum: ["content", "discussion_starter", "mixed"] },
    content_summary: { type: "string" },
    relevance: { type: "integer", enum: [1, 2, 3, 4, 5] },
    relevant_to: {
      type: "array",
      items: {
        type: "string",
        enum: PRODUCT_SIGNAL_REFERENCE_TARGETS
      }
    },
    reference_type: { type: "string", enum: PRODUCT_SIGNAL_REFERENCE_TYPES },
    reference_label: { type: "string" },
    reference_takeaway: { type: "string" },
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
          "grounding",
          "reusable_pattern",
          "why_it_works"
        ],
        properties: {
          ref: { type: "string" },
          quote_summary: { type: "string" },
          why_it_matters: { type: "string" },
          grounding: { type: "string", enum: ["text_grounded", "model_inferred", "insufficient_detail"] },
          reusable_pattern: { type: "string" },
          why_it_works: { type: "string" }
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

export function hasDrainableProductSignalItems(session: SessionRecord, signals: Signal[]): boolean {
  if (session.mode !== "product") {
    return false;
  }
  const itemsById = new Map(session.items.map((item) => [item.id, item]));
  return signals.some((signal) => {
    if (!signal.itemId || signal.inboxStatus === "archived" || signal.inboxStatus === "rejected") {
      return false;
    }
    const item = itemsById.get(signal.itemId);
    return item?.status === "queued" || item?.status === "running";
  });
}

export function shouldDrainWorkerAfterProductSignalQueue(queuedCount: number, hasDrainableWork: boolean): boolean {
  return queuedCount > 0 || hasDrainableWork;
}

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
  return value === "learning" || value === "competitor" || value === "demand" || value === "technical" || value === "marketing" || value === "noise"
    ? value
    : null;
}

function readContentType(value: unknown): ProductSignalContentType | null {
  return value === "content" || value === "discussion_starter" || value === "mixed" ? value : null;
}

function readReferenceType(value: unknown): ProductSignalReferenceType | null {
  return PRODUCT_SIGNAL_REFERENCE_TYPES.includes(value as ProductSignalReferenceType)
    ? value as ProductSignalReferenceType
    : null;
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

function readEvidenceGrounding(value: unknown): ProductSignalEvidenceGrounding | null {
  return value === "text_grounded" || value === "model_inferred" || value === "insufficient_detail" ? value : null;
}

function readAgentTaskSpec(value: unknown): ProductAgentTaskSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const targetAgent = readTargetAgent(raw.targetAgent ?? raw.target_agent);
  const taskPrompt = readPromptString(raw.taskPrompt ?? raw.task_prompt);
  const requiredContext = readStringArray(raw.requiredContext ?? raw.required_context).slice(0, 8);
  const taskTitle = readTrimmedString(raw.taskTitle ?? raw.task_title).slice(0, 12);
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
      const grounding = readEvidenceGrounding(raw.grounding);
      const reusablePattern = readTrimmedString(raw.reusablePattern ?? raw.reusable_pattern).slice(0, 80);
      const whyItWorks = readTrimmedString(raw.whyItWorks ?? raw.why_it_works).slice(0, 150);
      const copyableTemplate = readTrimmedString(raw.copyableTemplate ?? raw.copyable_template).slice(0, 140);
      const workflowStack = readStringArray(raw.workflowStack ?? raw.workflow_stack).slice(0, 6);
      const copyRecipeMarkdown = readMarkdownString(raw.copyRecipeMarkdown ?? raw.copy_recipe_markdown).slice(0, 700);
      const tradeoff = readTrimmedString(raw.tradeoff).slice(0, 120);
      if (!ref || !allowedRefs.has(ref) || !quoteSummary || !whyItMatters) {
        return null;
      }
      return {
        ref,
        quoteSummary,
        whyItMatters,
        ...(grounding ? { grounding } : {}),
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
    "- 所有面向用戶的文字欄位必須用繁體中文書寫：content_summary、reference_label、reference_takeaway、why_relevant、reason、experiment_hint、evidence_notes 的 quote_summary、why_it_matters、reusable_pattern、why_it_works、agent_task_spec.task_title。",
    "- 原文若是英文，要用中文「翻譯 + 摘要」，不要直接引用整段英文。",
    "- 機器欄位保留英文 enum：signal_type、signal_subtype（snake_case 標籤）、content_type、verdict、relevant_to、reference_type、target_agent、evidence_refs、ref。",
    "- agent_task_spec.task_prompt 是貼給 Codex/Claude 的指令，可以英文或中文；其他欄位都要繁中。",
    "",
    "長度規則（重要）：優先寫清楚底層機制；短句，但允許必要的短段落。",
    "- content_summary：單句摘要，<= 50 字；必須點出具體 workflow / use case，不要寫「PM 熱烈討論」「市場熱度高」這類空話",
    "- why_relevant：單句，<= 60 字；說明這條 signal 的判斷理由。不必強行對應 ProductContext；若只是值得學習新知識，請明確說「先作為技術學習」而不是硬說產品已有需求。",
    "- reference_label：<= 28 字；用「對產品可參考」或「可學習」的語言命名，不要只寫分類名。",
    "- reference_takeaway：<= 90 字；指出用戶應該拿走什麼：可改造進產品、可借用命名、可學技術機制，或暫無直接產品用途。",
    "- reason：單句，<= 60 字",
    "- experiment_hint：單句，<= 50 字；寫成可執行的小實驗，不要寫抽象研究任務",
    "- evidence_notes[*].quote_summary：單句中文摘錄，<= 40 字（不是貼原文）",
    "- evidence_notes[*].why_it_matters：單句，<= 50 字，說明這條為什麼是該判斷的證據",
    "- evidence_notes[*].grounding：text_grounded | model_inferred | insufficient_detail。text_grounded = 原文明確提供觀察與脈絡；model_inferred = 技術概念可合理解釋但仍需交叉驗證；insufficient_detail = 原文不足以支撐具體產品判斷",
    "- evidence_notes[*].reusable_pattern：單句，<= 28 字，抽出可借用的產品/工作流模式；不是分類名，也不是操作教學標題",
    "- evidence_notes[*].why_it_works：1-2 句，<= 150 字；必須先指出這條 evidence 原文的具體觀察（作者說了什麼、看到了什麼），再用一句話推導底層機制（「這說明...」）；禁止直接寫通用 AI 理論、教程步驟或課本解釋；讀完後應該讓人覺得「是這條留言讓我懂了這件事」，不是「這段可以從任何教材複製」",
    "- agent_task_spec.task_title：<= 12 字，用於 UI 卡片 header；不是 task_prompt 的第一行",
    "",
    "判斷規則：",
    "- signal_type: learning | competitor | demand | technical | marketing | noise",
    "- signal_subtype 要精確到具體技術、行為或產品模式；避免 agent_workflow 這類泛稱。好例子：mcp_integration、browser_automation、recurring_data_crawl、pm_document_generation、competitor_release_monitoring",
    "- content_type: content = 主要是完整內容分享；discussion_starter = 主要引出他人回應；mixed = 內容與回應都重要",
    "- relevance: 1-5，只能用整數；不要產生百分比、指數或假分數",
    "- relevant_to 可使用 ProductContext 欄位，也可使用 technicalLearning、workflowPattern、marketLanguage、productAnalogy、generalLearning、noDirectFit；不要為了填欄位而硬塞產品關聯。",
    "- reference_type: product_reference = 可直接改造進產品；technical_learning = 值得學技術但未必改產品；workflow_pattern = 可借用流程；market_language = 可借用命名/市場語言；general_learning = 一般知識；no_direct_fit = 暫無直接用途。",
    "- verdict: try = 值得小實驗；watch = 先觀察；park = 不適合目前產品；insufficient_data = 資料不足",
    "- 所有 schema keys 都必須出現；不適用時用 null、空字串或空陣列，不要省略 key。",
    "- experiment_hint 必須是 string；只有 verdict=try 時填具體實驗，其餘情況用空字串",
    "- agent_task_spec: 只有 verdict=try 時填 object；其餘回 null。target_agent 按性質選 codex/claude/generic；task_title <=12 字。",
    "- agent_task_spec.task_prompt 必須是可直接貼入 Codex / Claude 的 brief：說清楚要檢查的產品假設、可用 evidence refs、要輸出的格式與停止條件；不要寫成操作教學，也不要發明原文沒有的工具或步驟。",
    "- evidence_refs 只能引用下方 evidence catalog 的 e1/e2/...；沒有證據就回空陣列",
    "- evidence_notes：對 evidence_refs 列出的每個 ref 都要補一條對應 note；ref 必須來自 evidence_refs；沒有 evidence_refs 就回空陣列",
    "- evidence_notes 不只是引用理由；要把高技術含量留言拆成可學習的模式，讓用戶知道可以保留、測試或交給 agent 追問哪個假設。",
    "- evidence_notes 必須是 evidence-specific，不要把 thread-level content_summary 複製到每條 evidence。",
    "- quote 太短時，不要硬擠操作方法；grounding 用 insufficient_detail，why_it_works 寫「原文不足以推導具體機制」並說明缺哪一段。",
    "- 工具或組合方式不確定時，不要假裝知道作者的實作。why_it_works 只可寫 evidence 能支撐的一般機制並標 grounding=model_inferred。",
    "- 反面案例規則：如果主文在分享 app、產品、campaign 或定位語氣，但 replies 明顯出現嘲諷、反感、不買帳、信任下降或使用門檻抗拒，不要硬判成 try。content_type 用 mixed 或 discussion_starter；verdict 優先 watch 或 park；relevance 視 ProductContext 相關性給 2-3；reason 必須寫成「可作為反面語氣/定位案例」並引用負面 audience evidence。不要只因主文有粗口就判負面，必須看 replies 的反應。",
    "- 輸出面向產品洞察，不要提 cluster、分群演算法或後端分析細節。",
    "- 產品功能比對：仔細讀 [PRODUCT_CONTEXT].currentCapabilities 和 coreWorkflows。如果 evidence 建議的做法已經是產品現有功能，why_relevant 要明確寫「產品已有此功能」，experiment_hint 要改成「強化既有 X 功能」而非「新增 Y」，verdict 傾向 watch 而非 try。不要推薦產品已有的功能當作新實驗。",
    "- 如果 signal 有學習價值但不適合產品化，保留它：reference_type 用 technical_learning/general_learning，verdict 用 watch 或 park，agent_task_spec 回 null。",
    "",
    "技術理解示範（只學風格，不要照抄）：",
    "- why_it_works 不好的例子：AI 模型透過注意力機制處理輸入，當指令包含明確邊界條件與結構化指引時，能有效減少幻覺並聚焦於用戶設定的邏輯框架內。（這是通用課本解釋，跟 evidence 完全斷開）",
    "- why_it_works 好的例子（evidence-grounded）：queenfian 說「仔細描述同埋指引 outcome 正常同達標機率好多」— 這說明 prompt 精確度直接決定模型搜尋空間的寬度：描述越具體，模型能排除的錯誤路徑越多，命中率自然提高。",
    "- why_it_works 好的例子（MCP 類）：作者說 host 啟動時會自動 discovery server 能力 — 這說明 MCP 透過動態 schema 讀取取代硬編碼 API，新工具加入時不需要改 host 端邏輯。",
    "- agent_task_spec 好的例子：請檢查 DLens 是否已有可接 MCP tool schema 的讀取層；輸入 evidence e1/e2 與目前 ProductContext；輸出一頁 brief，分成現有能力、缺口、可測假設、停止條件。",
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
      signal_type: "learning|competitor|demand|technical|marketing|noise",
      signal_subtype: "string (snake_case 英文)",
      content_type: "content|discussion_starter|mixed",
      content_summary: "繁中單句 <=50 字，具體 workflow/use case",
      relevance: "1|2|3|4|5",
      relevant_to: PRODUCT_SIGNAL_REFERENCE_TARGETS,
      reference_type: "product_reference|technical_learning|workflow_pattern|market_language|general_learning|no_direct_fit",
      reference_label: "繁中 <=28 字，對產品可參考/可學習的命名",
      reference_takeaway: "繁中 <=90 字，說明可改造、可借用、可學習或暫無直接用途",
      why_relevant: "繁中單句 <=60 字，判斷理由；不必強行對應 ProductContext",
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
        grounding: "text_grounded|model_inferred|insufficient_detail",
        reusable_pattern: "可借用 workflow <=28 字",
        why_it_works: "底層機制，<=150 字",
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
  reference_type?: unknown;
  referenceType?: unknown;
  reference_label?: unknown;
  referenceLabel?: unknown;
  reference_takeaway?: unknown;
  referenceTakeaway?: unknown;
  why_relevant?: unknown;
  whyRelevant?: unknown;
  verdict?: unknown;
  reason?: unknown;
  audience_gap?: unknown;
  audienceGap?: unknown;
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
    .filter((field): field is ProductSignalReferenceTarget => PRODUCT_SIGNAL_REFERENCE_TARGETS.includes(field as ProductSignalReferenceTarget));
  const referenceType = readReferenceType(parsed.referenceType ?? parsed.reference_type);
  const referenceLabel = readTrimmedString(parsed.referenceLabel ?? parsed.reference_label).slice(0, 90);
  const referenceTakeaway = readTrimmedString(parsed.referenceTakeaway ?? parsed.reference_takeaway).slice(0, 180);
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
  const audienceGap = readTrimmedString(parsed.audienceGap ?? parsed.audience_gap).slice(0, 80);
  const evidenceNotes = readEvidenceNotes(parsed.evidenceNotes ?? parsed.evidence_notes, evidenceRefSet);

  return {
    signalId: input.signalId,
    signalType,
    signalSubtype,
    contentType,
    contentSummary,
    relevance,
    relevantTo,
    ...(referenceType ? { referenceType } : {}),
    ...(referenceLabel ? { referenceLabel } : {}),
    ...(referenceTakeaway ? { referenceTakeaway } : {}),
    whyRelevant,
    verdict,
    reason,
    ...(audienceGap ? { audienceGap } : {}),
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
