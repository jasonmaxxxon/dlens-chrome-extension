import type {
  ProductApplicationSuggestion,
  ProductAgentTaskSpec,
  ProductReading,
  ProductSignalAnalysis,
  ProductSignalConflictState,
  ProductSignalEvidenceState,
  ProductSignalEvidenceGrounding,
  ProductSignalEvidenceNote,
  ProductSignalJudgmentAxes,
  ProductSignalJudgmentWarning,
  ProductSignalReferenceType,
  ProductSignalTestability,
  ProductSignalUsefulness,
  ProductWatchGuidance
} from "../state/types.ts";
import { PRODUCT_CONTEXT_FIELDS } from "../state/types.ts";

export const PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY = "dlens:v1:product-signal-analyses";
const PRODUCT_SIGNAL_ANALYSIS_STRICT_VERSION = "v21";

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
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

function readTargetAgent(value: unknown): ProductAgentTaskSpec["targetAgent"] | null {
  return value === "codex" || value === "claude" || value === "generic" ? value : null;
}

function readEvidenceGrounding(value: unknown): ProductSignalEvidenceGrounding | null {
  return value === "text_grounded" || value === "model_inferred" || value === "insufficient_detail" ? value : null;
}

function readReferenceType(value: unknown): ProductSignalReferenceType | null {
  return value === "product_reference"
    || value === "technical_learning"
    || value === "workflow_pattern"
    || value === "market_language"
    || value === "general_learning"
    || value === "no_direct_fit"
    ? value
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

function readJudgmentWarning(value: unknown): ProductSignalJudgmentWarning | null {
  return value === "none_with_reversible_test" || value === "missing_try_application" ? value : null;
}

function normalizeAgentTaskSpec(value: unknown): ProductAgentTaskSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Partial<ProductAgentTaskSpec> & {
    target_agent?: unknown;
    task_prompt?: unknown;
    required_context?: unknown;
    task_title?: unknown;
  };
  const targetAgent = readTargetAgent(raw.targetAgent ?? raw.target_agent);
  const taskPrompt = readPromptString(raw.taskPrompt ?? raw.task_prompt);
  if (!targetAgent || !taskPrompt) {
    return null;
  }
  const taskTitle = readTrimmedString(raw.taskTitle ?? raw.task_title).slice(0, 12);
  return {
    targetAgent,
    taskPrompt,
    requiredContext: readStringArray(raw.requiredContext ?? raw.required_context).slice(0, 8),
    ...(taskTitle ? { taskTitle } : {})
  };
}

function normalizeEvidenceNotes(value: unknown, allowedRefs: Set<string>): ProductSignalEvidenceNote[] {
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

function normalizeProductReading(
  value: unknown,
  {
    eligible,
    evidenceRefs,
    evidenceNotes
  }: {
    eligible: boolean;
    evidenceRefs: Set<string>;
    evidenceNotes: ProductSignalEvidenceNote[];
  }
): ProductReading | null {
  if (!eligible || !value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const headline = readTrimmedString(raw.headline).slice(0, 60);
  const body = readTrimmedString(raw.body);
  const rawSupportRefs = raw.supportRefs ?? raw.support_refs;
  if (
    !headline
    || !body
    || [...body].length > 1200
    || !Array.isArray(rawSupportRefs)
    || rawSupportRefs.length < 1
    || rawSupportRefs.length > 5
    || rawSupportRefs.some((ref) => typeof ref !== "string" || !ref || ref !== ref.trim())
  ) {
    return null;
  }
  const supportRefs = rawSupportRefs as string[];
  if (new Set(supportRefs).size !== supportRefs.length) {
    return null;
  }
  const groundedRefs = new Set(
    evidenceNotes
      .filter((note) => note.grounding === "text_grounded")
      .map((note) => note.ref)
  );
  if (supportRefs.some((ref) => !evidenceRefs.has(ref) || !groundedRefs.has(ref))) {
    return null;
  }
  return {
    headline,
    body,
    supportRefs
  };
}

function readProductContextTarget(value: unknown): ProductApplicationSuggestion["productContextTarget"] | null {
  return PRODUCT_CONTEXT_FIELDS.includes(value as ProductApplicationSuggestion["productContextTarget"])
    ? value as ProductApplicationSuggestion["productContextTarget"]
    : null;
}

function normalizeApplicationSuggestions(
  value: unknown,
  {
    eligible,
    evidenceRefs,
    evidenceNotes
  }: {
    eligible: boolean;
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
      || rawSupportRefs.some((ref) => typeof ref !== "string" || !ref || ref !== ref.trim())
    ) {
      continue;
    }

    const supportRefs = rawSupportRefs as string[];
    if (
      new Set(supportRefs).size !== supportRefs.length
      || supportRefs.some((ref) => !evidenceRefs.has(ref) || !textGroundedRefs.has(ref))
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

function normalizeJudgmentAxes(value: unknown): ProductSignalJudgmentAxes | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const usefulness = readUsefulness(raw.usefulness);
  const testability = readTestability(raw.testability);
  const evidenceState = readEvidenceState(raw.evidenceState ?? raw.evidence_state);
  const conflictState = readConflictState(raw.conflictState ?? raw.conflict_state);
  if (!usefulness || !testability || !evidenceState || !conflictState) {
    return null;
  }
  return {
    usefulness,
    testability,
    evidenceState,
    conflictState
  };
}

function normalizeWarnings(value: unknown): ProductSignalJudgmentWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const warnings: ProductSignalJudgmentWarning[] = [];
  for (const entry of value) {
    const warning = readJudgmentWarning(entry);
    if (warning && !warnings.includes(warning)) {
      warnings.push(warning);
    }
  }
  return warnings;
}

function normalizeWatchGuidance(
  value: unknown,
  {
    eligible,
    evidenceRefs,
    evidenceNotes
  }: {
    eligible: boolean;
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
    || supportRefs.some((ref) => !evidenceRefs.has(ref) || !textGroundedRefs.has(ref))
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

function normalizeProductSignalAnalysis(value: unknown): ProductSignalAnalysis | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Partial<ProductSignalAnalysis> & {
    agent_task_spec?: unknown;
  };
  const signalId = readTrimmedString(raw.signalId);
  const signalSubtype = readTrimmedString(raw.signalSubtype);
  const contentSummary = readTrimmedString(raw.contentSummary);
  const whyRelevant = readTrimmedString(raw.whyRelevant);
  const reason = readTrimmedString(raw.reason);
  const productContextHash = readTrimmedString(raw.productContextHash);
  const promptVersion = readTrimmedString(raw.promptVersion);
  const model = readTrimmedString(raw.model);
  const analyzedAt = readTrimmedString(raw.analyzedAt);
  if (!signalId || !signalSubtype || !contentSummary || !whyRelevant || !reason || !productContextHash || !promptVersion || !analyzedAt) {
    return null;
  }
  if (raw.signalType !== "learning" && raw.signalType !== "competitor" && raw.signalType !== "demand" && raw.signalType !== "technical" && raw.signalType !== "marketing" && raw.signalType !== "noise") {
    return null;
  }
  if (raw.contentType !== "content" && raw.contentType !== "discussion_starter" && raw.contentType !== "mixed") {
    return null;
  }
  if (raw.relevance !== 1 && raw.relevance !== 2 && raw.relevance !== 3 && raw.relevance !== 4 && raw.relevance !== 5) {
    return null;
  }
  if (raw.verdict !== "try" && raw.verdict !== "watch" && raw.verdict !== "park" && raw.verdict !== "insufficient_data") {
    return null;
  }
  if (raw.status !== "pending" && raw.status !== "analyzing" && raw.status !== "complete" && raw.status !== "error") {
    return null;
  }

  const rawWithExtras = raw as typeof raw & {
    why_now?: unknown;
    validation_metric?: unknown;
    evidence_notes?: unknown;
    evidence_refs?: unknown;
    agent_task_spec?: unknown;
    reference_type?: unknown;
    reference_label?: unknown;
    reference_takeaway?: unknown;
    audience_gap?: unknown;
    application_suggestions?: unknown;
    judgment_axes?: unknown;
    product_reading?: unknown;
    warnings?: unknown;
    watch_guidance?: unknown;
  };
  const experimentHint = readTrimmedString(raw.experimentHint);
  const referenceType = readReferenceType(raw.referenceType ?? rawWithExtras.reference_type);
  const referenceLabel = readTrimmedString(raw.referenceLabel ?? rawWithExtras.reference_label).slice(0, 90);
  const referenceTakeaway = readTrimmedString(raw.referenceTakeaway ?? rawWithExtras.reference_takeaway).slice(0, 180);
  const audienceGap = readTrimmedString(raw.audienceGap ?? rawWithExtras.audience_gap).slice(0, 80);
  const whyNowRaw = readTrimmedString(raw.whyNow ?? rawWithExtras.why_now);
  const whyNow = (raw.verdict === "try" || raw.verdict === "watch") && whyNowRaw ? whyNowRaw : "";
  const validationMetricRaw = readTrimmedString(raw.validationMetric ?? rawWithExtras.validation_metric);
  const validationMetric = raw.verdict === "try" && validationMetricRaw ? validationMetricRaw : "";
  const blockers = readStringArray(raw.blockers).slice(0, 3);
  const evidenceRefsCamel = readStringArray(raw.evidenceRefs);
  const evidenceRefsSnake = readStringArray(rawWithExtras.evidence_refs);
  const evidenceRefs = evidenceRefsCamel.length > 0 ? evidenceRefsCamel : evidenceRefsSnake;
  const evidenceNotes = normalizeEvidenceNotes(raw.evidenceNotes ?? rawWithExtras.evidence_notes, new Set(evidenceRefs));
  const evidenceRefSet = new Set(evidenceRefs);
  const isCurrentVersion = promptVersion === PRODUCT_SIGNAL_ANALYSIS_STRICT_VERSION;
  const productReadingEligible = isCurrentVersion
    && raw.status === "complete"
    && raw.signalType !== "noise"
    && (raw.verdict === "try" || raw.verdict === "watch");
  const productReading = normalizeProductReading(
    raw.productReading ?? rawWithExtras.product_reading,
    {
      eligible: productReadingEligible,
      evidenceRefs: evidenceRefSet,
      evidenceNotes
    }
  );
  const applicationSuggestions = isCurrentVersion
    ? []
    : normalizeApplicationSuggestions(
        raw.applicationSuggestions ?? rawWithExtras.application_suggestions,
        {
          eligible: raw.verdict === "try" && raw.signalType !== "noise",
          evidenceRefs: evidenceRefSet,
          evidenceNotes
        }
      );
  const judgmentAxes = normalizeJudgmentAxes(raw.judgmentAxes ?? rawWithExtras.judgment_axes);
  const warnings = normalizeWarnings(raw.warnings ?? rawWithExtras.warnings);
  const watchGuidance = isCurrentVersion
    ? null
    : normalizeWatchGuidance(raw.watchGuidance ?? rawWithExtras.watch_guidance, {
        eligible: raw.verdict === "watch" && raw.signalType !== "noise",
        evidenceRefs: evidenceRefSet,
        evidenceNotes
      });
  const agentTaskSpec = raw.verdict === "try" ? normalizeAgentTaskSpec(raw.agentTaskSpec ?? rawWithExtras.agent_task_spec) : null;
  if (isCurrentVersion && raw.status === "complete") {
    if (!judgmentAxes) {
      return null;
    }
    if (productReadingEligible && !productReading) {
      return null;
    }
  }

  return {
    signalId,
    signalType: raw.signalType,
    signalSubtype,
    contentType: raw.contentType,
    contentSummary,
    relevance: raw.relevance,
    relevantTo: readStringArray(raw.relevantTo) as ProductSignalAnalysis["relevantTo"],
    ...(referenceType ? { referenceType } : {}),
    ...(referenceLabel ? { referenceLabel } : {}),
    ...(referenceTakeaway ? { referenceTakeaway } : {}),
    whyRelevant,
    verdict: raw.verdict,
    reason,
    ...(audienceGap ? { audienceGap } : {}),
    ...(experimentHint ? { experimentHint } : {}),
    ...(whyNow ? { whyNow } : {}),
    ...(validationMetric ? { validationMetric } : {}),
    ...(blockers.length ? { blockers } : {}),
    ...(agentTaskSpec ? { agentTaskSpec } : {}),
    evidenceRefs,
    ...(evidenceNotes.length ? { evidenceNotes } : {}),
    ...(productReading ? { productReading } : {}),
    ...(applicationSuggestions.length ? { applicationSuggestions } : {}),
    ...(watchGuidance ? { watchGuidance } : {}),
    ...(judgmentAxes ? { judgmentAxes } : {}),
    ...(judgmentAxes ? { warnings } : {}),
    productContextHash,
    promptVersion,
    ...(model ? { model } : {}),
    analyzedAt,
    status: raw.status,
    ...(readTrimmedString(raw.error) ? { error: readTrimmedString(raw.error) } : {})
  };
}

async function readAnalysisMap(storageArea: StorageAreaLike): Promise<Record<string, ProductSignalAnalysis>> {
  const raw = await storageArea.get(PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY);
  const entries = raw[PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY];
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(entries as Record<string, unknown>)
      .map(([signalId, value]) => [signalId, normalizeProductSignalAnalysis(value)] as const)
      .filter((entry): entry is readonly [string, ProductSignalAnalysis] => entry[1] !== null)
  );
}

export async function getProductSignalAnalysis(
  storageArea: StorageAreaLike,
  signalId: string
): Promise<ProductSignalAnalysis | null> {
  const map = await readAnalysisMap(storageArea);
  return map[signalId] ?? null;
}

export async function listProductSignalAnalyses(
  storageArea: StorageAreaLike,
  signalIds?: string[]
): Promise<ProductSignalAnalysis[]> {
  const map = await readAnalysisMap(storageArea);
  const values = signalIds?.length
    ? signalIds.map((signalId) => map[signalId]).filter((entry): entry is ProductSignalAnalysis => Boolean(entry))
    : Object.values(map);
  return values.sort((left, right) => right.analyzedAt.localeCompare(left.analyzedAt));
}

export async function saveProductSignalAnalysis(
  storageArea: StorageAreaLike,
  analysis: ProductSignalAnalysis
): Promise<Record<string, ProductSignalAnalysis>> {
  const normalized = normalizeProductSignalAnalysis(analysis);
  if (!normalized) {
    throw new Error("Invalid product signal analysis");
  }
  const map = await readAnalysisMap(storageArea);
  const next = {
    ...map,
    [normalized.signalId]: normalized
  };
  await storageArea.set({ [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: next });
  return next;
}

export async function deleteProductSignalAnalysis(
  storageArea: StorageAreaLike,
  signalId: string
): Promise<Record<string, ProductSignalAnalysis>> {
  const map = await readAnalysisMap(storageArea);
  const next = { ...map };
  delete next[signalId];
  await storageArea.set({ [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: next });
  return next;
}

export const productSignalStorageTestables = {
  normalizeProductSignalAnalysis
};

export const normalizeProductSignalAnalysisRecord = normalizeProductSignalAnalysis;
export const loadProductSignalAnalysisMap = readAnalysisMap;
