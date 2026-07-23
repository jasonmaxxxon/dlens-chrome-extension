import type { CaptureSnapshot } from "../contracts/ingest.ts";
import {
  hasCapturedPostAnalyzableText,
  projectCapturedPostFromCapture,
  readCapturedPostAnalyzableTextFromCapture,
  type CapturedPostFragment,
  type CapturedPostReplyRole
} from "../state/captured-post.ts";
import type {
  ProductContext,
  ProductApplicationSuggestion,
  ProductAgentTaskSpec,
  ProductSignalAnalysis,
  ProductSignalContentType,
  ProductSignalConflictState,
  ProductSignalEvidenceState,
  ProductSignalEvidenceNote,
  ProductSignalEvidenceGrounding,
  ProductSignalJudgmentAxes,
  ProductSignalJudgmentWarning,
  ProductSignalReferenceTarget,
  ProductSignalReferenceType,
  ProductSignalType,
  ProductSignalUsefulness,
  ProductSignalTestability,
  ProductWatchGuidance,
  FolderMode,
  SessionRecord,
  SessionItemStatus,
  Signal,
  SignalSource
} from "../state/types.ts";
import { PRODUCT_CONTEXT_FIELDS } from "../state/types.ts";
import type { ProductSignalPreferenceExample } from "./product-signal-history.ts";

export const PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION = "v20";
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
    "usefulness",
    "testability",
    "evidence_state",
    "conflict_state",
    "reason",
    "experiment_hint",
    "agent_task_spec",
    "evidence_refs",
    "evidence_notes",
    "application_suggestions",
    "watch_guidance"
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
    usefulness: { type: "string", enum: ["useful", "uncertain", "none"] },
    testability: { type: "string", enum: ["reversible_test", "not_yet_testable", "not_applicable"] },
    evidence_state: { type: "string", enum: ["text_sufficient", "external_unverified", "insufficient"] },
    conflict_state: { type: "string", enum: ["none", "explicit_constraint", "explicit_non_goal"] },
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
    },
    application_suggestions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "source_pattern",
          "fit_reason",
          "small_test",
          "product_context_target",
          "support_refs",
          "verification_question"
        ],
        properties: {
          source_pattern: { type: "string" },
          fit_reason: { type: "string" },
          small_test: { type: "string" },
          product_context_target: { type: "string", enum: PRODUCT_CONTEXT_FIELDS },
          support_refs: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "string" }
          },
          verification_question: { type: "string" }
        }
      }
    },
    watch_guidance: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["source_pattern", "fit_reason", "next_evidence", "support_refs"],
      properties: {
        source_pattern: { type: "string" },
        fit_reason: { type: "string" },
        next_evidence: { type: "string" },
        support_refs: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: { type: "string" }
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
  role: CapturedPostReplyRole;
  isOrphan: boolean;
  parentId: string | null;
  resolvedParentId: string | null;
}

export interface ProductSignalEvidenceEntry extends ProductSignalDiscussionReply {
  ref: string;
}

/** Stable evidence ref for the captured root post (OP text + OP continuations).
 *  A suggestion may ground on `root`, but only for what the captured text states —
 *  never for uninspected video, repository, or linked-resource contents. */
export const PRODUCT_SIGNAL_ROOT_REF = "root";

export interface ProductSignalAnalyzerInput {
  signalId: string;
  source: SignalSource;
  rootText: string;
  assembledContent: string;
  discussionReplies: ProductSignalDiscussionReply[];
  productContext: ProductContext;
  productContextHash: string;
  feedbackExamples?: ProductSignalPreferenceExample[];
}

function toProductSignalDiscussionReply(fragment: CapturedPostFragment, fallbackId: string): ProductSignalDiscussionReply | null {
  const text = readTrimmedString(fragment.text);
  if (!text) {
    return null;
  }
  return {
    id: readTrimmedString(fragment.id) || fallbackId,
    author: readTrimmedString(fragment.author) || "unknown",
    text,
    likeCount: fragment.likes,
    role: fragment.role,
    isOrphan: fragment.isOrphan,
    parentId: fragment.parentId,
    resolvedParentId: fragment.resolvedParentId
  };
}

export function hasProductSignalAssembledContent(capture: CaptureSnapshot | null | undefined): boolean {
  return projectCapturedPostFromCapture(capture).hasAssembledContent;
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
  const capturedPost = projectCapturedPostFromCapture(capture, { includeLegacyComments: true });
  const assembledContent = capturedPost.assembledContent || readCapturedPostAnalyzableTextFromCapture(capture);
  if (!assembledContent) {
    return null;
  }

  const discussionReplies = capturedPost.discussionReplies
    .map((fragment, index) => toProductSignalDiscussionReply(fragment, `discussion_${index + 1}`))
    .filter((reply): reply is ProductSignalDiscussionReply => reply !== null);

  // Root text is only captured OP material. It must not include audience replies,
  // so we build it from the root post and its OP continuations, not assembledContent.
  const rootText = [
    capturedPost.text,
    ...capturedPost.opContinuations.map((fragment) => fragment.text)
  ].map(readTrimmedString).filter(Boolean).join("\n");

  return {
    signalId,
    source,
    rootText,
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
  if (!hasCapturedPostAnalyzableText(capture)) {
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

function readUsefulness(value: unknown): ProductSignalUsefulness | null {
  return value === "useful" || value === "uncertain" || value === "none" ? value : null;
}

function readTestability(value: unknown): ProductSignalTestability | null {
  return value === "reversible_test" || value === "not_yet_testable" || value === "not_applicable" ? value : null;
}

function readEvidenceState(value: unknown): ProductSignalEvidenceState | null {
  return value === "text_sufficient" || value === "external_unverified" || value === "insufficient" ? value : null;
}

function readConflictState(value: unknown): ProductSignalConflictState | null {
  return value === "none" || value === "explicit_constraint" || value === "explicit_non_goal" ? value : null;
}

function readRelevance(value: unknown): ProductSignalAnalysis["relevance"] | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export function deriveProductSignalVerdict({
  signalType,
  judgmentAxes
}: {
  signalType: ProductSignalType;
  judgmentAxes: ProductSignalJudgmentAxes;
}): {
  verdict: ProductSignalAnalysis["verdict"];
  warnings: ProductSignalJudgmentWarning[];
} {
  if (signalType === "noise") {
    return { verdict: "park", warnings: [] };
  }
  switch (judgmentAxes.evidenceState) {
    case "insufficient":
      return { verdict: "insufficient_data", warnings: [] };
    case "text_sufficient":
    case "external_unverified":
      switch (judgmentAxes.conflictState) {
        case "explicit_constraint":
        case "explicit_non_goal":
          return { verdict: "park", warnings: [] };
        case "none":
          switch (judgmentAxes.usefulness) {
            case "useful":
              switch (judgmentAxes.testability) {
                case "reversible_test":
                  return judgmentAxes.evidenceState === "text_sufficient"
                    ? { verdict: "try", warnings: [] }
                    : { verdict: "watch", warnings: [] };
                case "not_yet_testable":
                case "not_applicable":
                  return { verdict: "watch", warnings: [] };
                default:
                  return assertNever(judgmentAxes.testability);
              }
            case "uncertain":
              switch (judgmentAxes.testability) {
                case "reversible_test":
                case "not_yet_testable":
                case "not_applicable":
                  return { verdict: "watch", warnings: [] };
                default:
                  return assertNever(judgmentAxes.testability);
              }
            case "none":
              switch (judgmentAxes.testability) {
                case "reversible_test":
                  return { verdict: "park", warnings: ["none_with_reversible_test"] };
                case "not_yet_testable":
                case "not_applicable":
                  return { verdict: "park", warnings: [] };
                default:
                  return assertNever(judgmentAxes.testability);
              }
            default:
              return assertNever(judgmentAxes.usefulness);
          }
        default:
          return assertNever(judgmentAxes.conflictState);
      }
    default:
      return assertNever(judgmentAxes.evidenceState);
  }
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

function readProductContextTarget(value: unknown): ProductApplicationSuggestion["productContextTarget"] | null {
  return PRODUCT_CONTEXT_FIELDS.includes(value as ProductApplicationSuggestion["productContextTarget"])
    ? value as ProductApplicationSuggestion["productContextTarget"]
    : null;
}

function readApplicationSuggestions(
  value: unknown,
  {
    eligible,
    allowedRefs,
    evidenceRefs,
    evidenceNotes
  }: {
    eligible: boolean;
    allowedRefs: Set<string>;
    evidenceRefs: Set<string>;
    evidenceNotes: ProductSignalEvidenceNote[];
  }
): ProductApplicationSuggestion[] {
  if (!eligible || !Array.isArray(value)) {
    return [];
  }

  const textGroundedRefs = new Set(
    evidenceNotes
      .filter((note) => note.grounding === "text_grounded")
      .map((note) => note.ref)
  );
  const seen = new Set<string>();
  const suggestions: ProductApplicationSuggestion[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const sourcePattern = readTrimmedString(raw.sourcePattern ?? raw.source_pattern).slice(0, 80);
    const fitReason = readTrimmedString(raw.fitReason ?? raw.fit_reason).slice(0, 100);
    const smallTest = readTrimmedString(raw.smallTest ?? raw.small_test).slice(0, 100);
    const productContextTarget = readProductContextTarget(
      raw.productContextTarget ?? raw.product_context_target
    );
    const verificationQuestion = readTrimmedString(
      raw.verificationQuestion ?? raw.verification_question
    );
    const rawSupportRefs = raw.supportRefs ?? raw.support_refs;
    if (
      !sourcePattern
      || !fitReason
      || !smallTest
      || !productContextTarget
      || !verificationQuestion
      || !Array.isArray(rawSupportRefs)
      || rawSupportRefs.length < 1
      || rawSupportRefs.length > 3
    ) {
      continue;
    }

    if (
      rawSupportRefs.some((ref) => typeof ref !== "string" || !ref || ref !== ref.trim())
    ) {
      continue;
    }
    const supportRefs = rawSupportRefs as string[];
    if (
      new Set(supportRefs).size !== supportRefs.length
      || supportRefs.some((ref) => !allowedRefs.has(ref))
      || supportRefs.some((ref) => !evidenceRefs.has(ref))
      || supportRefs.some((ref) => !textGroundedRefs.has(ref))
    ) {
      continue;
    }

    const dedupeKey = [
      sourcePattern.toLocaleLowerCase(),
      productContextTarget,
      smallTest.toLocaleLowerCase()
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    suggestions.push({
      sourcePattern,
      fitReason,
      smallTest,
      productContextTarget,
      supportRefs,
      verificationQuestion: verificationQuestion.slice(0, 100)
    });
    if (suggestions.length === 3) {
      break;
    }
  }

  return suggestions;
}

function readWatchGuidance(
  value: unknown,
  {
    eligible,
    allowedRefs,
    evidenceRefs,
    evidenceNotes
  }: {
    eligible: boolean;
    allowedRefs: Set<string>;
    evidenceRefs: Set<string>;
    evidenceNotes: ProductSignalEvidenceNote[];
  }
): ProductWatchGuidance | null {
  if (!eligible || !value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const sourcePattern = readTrimmedString(raw.sourcePattern ?? raw.source_pattern).slice(0, 80);
  const fitReason = readTrimmedString(raw.fitReason ?? raw.fit_reason).slice(0, 100);
  const nextEvidence = readTrimmedString(raw.nextEvidence ?? raw.next_evidence).slice(0, 100);
  const rawSupportRefs = raw.supportRefs ?? raw.support_refs;
  if (
    !sourcePattern
    || !fitReason
    || !nextEvidence
    || !Array.isArray(rawSupportRefs)
    || rawSupportRefs.length < 1
    || rawSupportRefs.length > 3
    || rawSupportRefs.some((ref) => typeof ref !== "string" || !ref || ref !== ref.trim())
  ) {
    return null;
  }

  const textGroundedRefs = new Set(
    evidenceNotes
      .filter((note) => note.grounding === "text_grounded")
      .map((note) => note.ref)
  );
  const supportRefs = rawSupportRefs as string[];
  if (
    new Set(supportRefs).size !== supportRefs.length
    || supportRefs.some((ref) => !allowedRefs.has(ref))
    || supportRefs.some((ref) => !evidenceRefs.has(ref))
    || supportRefs.some((ref) => !textGroundedRefs.has(ref))
  ) {
    return null;
  }

  return {
    sourcePattern,
    fitReason,
    nextEvidence,
    supportRefs
  };
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

function buildEvidenceCatalog(rootText: string, replies: ProductSignalDiscussionReply[]): string {
  const rootLine = readTrimmedString(rootText)
    ? `${PRODUCT_SIGNAL_ROOT_REF} role=source text=${readTrimmedString(rootText).slice(0, 500)}`
    : "";
  const replyLines = replies
    .slice(0, 20)
    .map((reply, index) =>
      `e${index + 1} ${formatProductSignalEvidenceMetadata(reply)} author=${readTrimmedString(reply.author) || "unknown"} likes=${reply.likeCount ?? 0} text=${readTrimmedString(reply.text).slice(0, 500)}`
    );
  const lines = [rootLine, ...replyLines].filter(Boolean);
  return lines.length ? lines.join("\n") : "none";
}

export function formatProductSignalEvidenceMetadata(entry: ProductSignalDiscussionReply): string {
  const parent = readTrimmedString(entry.resolvedParentId ?? entry.parentId) || "none";
  return `role=${entry.role} orphan=${entry.isOrphan ? "true" : "false"} parent=${parent}`;
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
  const replies = projectCapturedPostFromCapture(capture, { includeLegacyComments: true }).discussionReplies
    .map((fragment, index) => toProductSignalDiscussionReply(fragment, `discussion_${index + 1}`))
    .filter((reply): reply is ProductSignalDiscussionReply => reply !== null);

  return replies.slice(0, 20).map((reply, index) => ({
    ...reply,
    ref: `e${index + 1}`
  }));
}

export function buildProductSignalAnalyzerPrompt(input: ProductSignalAnalyzerInput): string {
  return [
    "你是 ProductSignalAnalyzer。你會讀一則 Threads signal，判斷它對指定產品是否有用。",
    "只回傳 JSON，不要加入 markdown 或解釋。不要輸出 verdict；verdict 會由下游 policy 依四軸衍生。",
    "",
    "判斷規則（v20）：",
    "- 低優先順序不等於 park；只要仍有用，就應落在 useful 或 uncertain。",
    "- useful + reversible_test + text_sufficient = 候選 try。",
    "- useful 但 not_yet_testable 或 external_unverified = watch / 保留觀察。",
    "- park 只應來自 usefulness=none，或 explicit_constraint / explicit_non_goal。",
    "- external media/repo/link contents remain unverified，除非 captured evidence 已明確支持。",
    "- noise 保留給空洞、垃圾、不可儲存內容；不要把有啟發但低優先的訊號誤判為 noise。",
    "",
    "輸出規則：",
    "- 所有面向用戶的文字欄位用繁體中文；機器 enum 與 keys 保留英文。",
    "- 必須輸出四軸：usefulness、testability、evidence_state、conflict_state。",
    "- 所有 schema keys 都必須出現；不適用時用 null、空字串或空陣列，不要省略 key。",
    "- try 需要 application_suggestions；watch 需要 watch_guidance；park / insufficient_data / noise 時兩者都應為空或 null。",
    "- 若 claim reversible_test 但找不到可信 small_test，請改成 watch 並寫完整 watch_guidance。",
    `- application_suggestions[*].product_context_target 只能是：${PRODUCT_CONTEXT_FIELDS.join("、")}。`,
    "- application_suggestions 與 watch_guidance 的 support_refs 都必須來自 evidence_refs，且對應 text_grounded evidence_notes。",
    "",
    "結構化欄位：",
    "- signal_type: learning | competitor | demand | technical | marketing | noise",
    "- content_type: content | discussion_starter | mixed",
    "- usefulness: useful | uncertain | none",
    "- testability: reversible_test | not_yet_testable | not_applicable",
    "- evidence_state: text_sufficient | external_unverified | insufficient",
    "- conflict_state: none | explicit_constraint | explicit_non_goal",
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
    "[EVIDENCE_CATALOG]",
    buildEvidenceCatalog(input.rootText, input.discussionReplies),
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
      usefulness: "useful|uncertain|none",
      testability: "reversible_test|not_yet_testable|not_applicable",
      evidence_state: "text_sufficient|external_unverified|insufficient",
      conflict_state: "none|explicit_constraint|explicit_non_goal",
      reason: "繁中單句 <=60 字",
      experiment_hint: "繁中單句 <=50 字 (只有可逆 try 候選才填)",
      agent_task_spec: {
        target_agent: "codex|claude|generic",
        task_title: "繁中 <=12 字",
        task_prompt: "直接貼給 agent 的指令 (只有可逆 try 候選才填)",
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
      }],
      application_suggestions: [{
        source_pattern: "繁中 <=80 字；來源明確展示的做法或機制",
        fit_reason: "繁中 <=100 字；用「可能」連到一個 ProductContext 欄位",
        small_test: "繁中 <=100 字；有限、可逆、可停止的小測試",
        product_context_target: "一個存在於 [PRODUCT_CONTEXT] 的 ProductContextField",
        support_refs: ["evidence_refs 內且有 text_grounded note 的 ref"],
        verification_question: "繁中可否證問題 <=100 字；以產品 context、repo 或有限實驗回答"
      }],
      watch_guidance: {
        source_pattern: "繁中 <=80 字；來源做法",
        fit_reason: "繁中 <=100 字；為何保留",
        next_evidence: "繁中 <=100 字；下一步要知道",
        support_refs: ["evidence_refs 內且有 text_grounded note 的 ref"]
      }
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
  usefulness?: unknown;
  testability?: unknown;
  evidence_state?: unknown;
  conflict_state?: unknown;
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
  application_suggestions?: unknown;
  applicationSuggestions?: unknown;
  watch_guidance?: unknown;
  watchGuidance?: unknown;
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
  const usefulness = readUsefulness(parsed.usefulness);
  const testability = readTestability(parsed.testability);
  const evidenceState = readEvidenceState(parsed.evidence_state);
  const conflictState = readConflictState(parsed.conflict_state);
  const reason = readTrimmedString(parsed.reason);
  if (
    !signalType
    || !signalSubtype
    || !contentType
    || !contentSummary
    || relevance == null
    || !whyRelevant
    || !usefulness
    || !testability
    || !evidenceState
    || !conflictState
    || !reason
  ) {
    return null;
  }

  const judgmentAxes: ProductSignalJudgmentAxes = {
    usefulness,
    testability,
    evidenceState,
    conflictState
  };
  const derived = deriveProductSignalVerdict({
    signalType,
    judgmentAxes
  });
  const allowedRefs = new Set([
    ...(input.rootText.trim() ? [PRODUCT_SIGNAL_ROOT_REF] : []),
    ...input.discussionReplies.map((_, index) => `e${index + 1}`)
  ]);
  const relevantTo = readStringArray(parsed.relevantTo ?? parsed.relevant_to)
    .filter((field): field is ProductSignalReferenceTarget => PRODUCT_SIGNAL_REFERENCE_TARGETS.includes(field as ProductSignalReferenceTarget));
  const referenceType = readReferenceType(parsed.referenceType ?? parsed.reference_type);
  const referenceLabel = readTrimmedString(parsed.referenceLabel ?? parsed.reference_label).slice(0, 90);
  const referenceTakeaway = readTrimmedString(parsed.referenceTakeaway ?? parsed.reference_takeaway).slice(0, 180);
  const evidenceRefs = readStringArray(parsed.evidenceRefs ?? parsed.evidence_refs)
    .filter((ref) => allowedRefs.has(ref));
  const evidenceRefSet = new Set(evidenceRefs);
  const evidenceNotes = readEvidenceNotes(parsed.evidenceNotes ?? parsed.evidence_notes, evidenceRefSet);
  const applicationSuggestionsRaw = parsed.applicationSuggestions ?? parsed.application_suggestions;
  const applicationSuggestions = readApplicationSuggestions(applicationSuggestionsRaw, {
    eligible: derived.verdict === "try" && signalType !== "noise",
    allowedRefs,
    evidenceRefs: evidenceRefSet,
    evidenceNotes
  });
  const watchGuidance = readWatchGuidance(parsed.watchGuidance ?? parsed.watch_guidance, {
    eligible: signalType !== "noise",
    allowedRefs,
    evidenceRefs: evidenceRefSet,
    evidenceNotes
  });

  let verdict = derived.verdict;
  const warnings = [...derived.warnings];
  if (verdict === "try" && applicationSuggestions.length === 0) {
    verdict = "watch";
    warnings.push("missing_try_application");
  }
  if (verdict === "watch" && !watchGuidance) {
    return null;
  }

  const experimentHint = verdict === "try"
    ? readTrimmedString(parsed.experimentHint ?? parsed.experiment_hint)
    : "";
  const whyNowRaw = readTrimmedString(parsed.whyNow ?? parsed.why_now);
  const whyNow = (verdict === "try" || verdict === "watch") && whyNowRaw ? whyNowRaw : "";
  const validationMetricRaw = readTrimmedString(parsed.validationMetric ?? parsed.validation_metric);
  const validationMetric = verdict === "try" && validationMetricRaw ? validationMetricRaw : "";
  const blockers = readStringArray(parsed.blockers).slice(0, 3);
  const audienceGap = readTrimmedString(parsed.audienceGap ?? parsed.audience_gap).slice(0, 80);
  const agentTaskSpec = verdict === "try"
    ? readAgentTaskSpec(parsed.agentTaskSpec ?? parsed.agent_task_spec)
    : null;

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
    ...(verdict === "try" && applicationSuggestions.length ? { applicationSuggestions } : {}),
    ...(verdict === "watch" && watchGuidance ? { watchGuidance } : {}),
    judgmentAxes,
    warnings,
    productContextHash: input.productContextHash,
    promptVersion: PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
    analyzedAt,
    status: "complete"
  };
}
