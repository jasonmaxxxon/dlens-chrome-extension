import type { ProductAgentTaskSpec, ProductSignalAnalysis, ProductSignalEvidenceNote } from "../state/types.ts";

export const PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY = "dlens:v1:product-signal-analyses";

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
  const taskTitle = readTrimmedString(raw.taskTitle ?? raw.task_title).slice(0, 24);
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
  const analyzedAt = readTrimmedString(raw.analyzedAt);
  if (!signalId || !signalSubtype || !contentSummary || !whyRelevant || !reason || !productContextHash || !promptVersion || !analyzedAt) {
    return null;
  }
  if (raw.signalType !== "learning" && raw.signalType !== "competitor" && raw.signalType !== "demand" && raw.signalType !== "technical" && raw.signalType !== "noise") {
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
  };
  const agentTaskSpec = raw.verdict === "try" ? normalizeAgentTaskSpec(raw.agentTaskSpec ?? rawWithExtras.agent_task_spec) : null;
  const experimentHint = readTrimmedString(raw.experimentHint);
  const whyNowRaw = readTrimmedString(raw.whyNow ?? rawWithExtras.why_now);
  const whyNow = (raw.verdict === "try" || raw.verdict === "watch") && whyNowRaw ? whyNowRaw : "";
  const validationMetricRaw = readTrimmedString(raw.validationMetric ?? rawWithExtras.validation_metric);
  const validationMetric = raw.verdict === "try" && validationMetricRaw ? validationMetricRaw : "";
  const blockers = readStringArray(raw.blockers).slice(0, 3);
  const evidenceRefsCamel = readStringArray(raw.evidenceRefs);
  const evidenceRefsSnake = readStringArray(rawWithExtras.evidence_refs);
  const evidenceRefs = evidenceRefsCamel.length > 0 ? evidenceRefsCamel : evidenceRefsSnake;
  const evidenceNotes = normalizeEvidenceNotes(raw.evidenceNotes ?? rawWithExtras.evidence_notes, new Set(evidenceRefs));

  return {
    signalId,
    signalType: raw.signalType,
    signalSubtype,
    contentType: raw.contentType,
    contentSummary,
    relevance: raw.relevance,
    relevantTo: readStringArray(raw.relevantTo) as ProductSignalAnalysis["relevantTo"],
    whyRelevant,
    verdict: raw.verdict,
    reason,
    ...(experimentHint ? { experimentHint } : {}),
    ...(whyNow ? { whyNow } : {}),
    ...(validationMetric ? { validationMetric } : {}),
    ...(blockers.length ? { blockers } : {}),
    ...(agentTaskSpec ? { agentTaskSpec } : {}),
    evidenceRefs,
    ...(evidenceNotes.length ? { evidenceNotes } : {}),
    productContextHash,
    promptVersion,
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

export const productSignalStorageTestables = {
  normalizeProductSignalAnalysis
};
