import type { ProductAgentTaskFeedback, ProductAgentTaskFeedbackValue } from "../state/types.ts";
import type { StorageAreaLike } from "./product-signal-storage.ts";

export const PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY = "dlens:v1:product-agent-task-feedback";

const FEEDBACK_VALUES: ProductAgentTaskFeedbackValue[] = ["adopted", "needs_rewrite", "irrelevant", "ignored"];

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readPromptString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readFeedbackValue(value: unknown): ProductAgentTaskFeedbackValue | null {
  return FEEDBACK_VALUES.includes(value as ProductAgentTaskFeedbackValue)
    ? value as ProductAgentTaskFeedbackValue
    : null;
}

function normalizeProductAgentTaskFeedback(value: unknown): ProductAgentTaskFeedback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Partial<ProductAgentTaskFeedback>;
  const signalId = readTrimmedString(raw.signalId);
  const taskPromptHash = readTrimmedString(raw.taskPromptHash);
  const feedback = readFeedbackValue(raw.feedback);
  const createdAt = readTrimmedString(raw.createdAt);
  if (!signalId || !taskPromptHash || !feedback || !createdAt) {
    return null;
  }
  const note = feedback === "needs_rewrite" || feedback === "irrelevant"
    ? readTrimmedString(raw.note).slice(0, 500)
    : "";
  return {
    signalId,
    taskPromptHash,
    feedback,
    ...(note ? { note } : {}),
    createdAt
  };
}

export function buildProductAgentTaskPromptHash(taskPrompt: string): string {
  let hash = 2166136261;
  const input = readPromptString(taskPrompt);
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `task_${(hash >>> 0).toString(36)}`;
}

export async function listProductAgentTaskFeedback(storageArea: StorageAreaLike): Promise<ProductAgentTaskFeedback[]> {
  const raw = await storageArea.get(PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY);
  const entries = raw[PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY];
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map(normalizeProductAgentTaskFeedback)
    .filter((entry): entry is ProductAgentTaskFeedback => entry !== null);
}

export async function saveProductAgentTaskFeedback(
  storageArea: StorageAreaLike,
  feedback: ProductAgentTaskFeedback
): Promise<ProductAgentTaskFeedback | null> {
  const normalized = normalizeProductAgentTaskFeedback(feedback);
  if (!normalized) {
    return null;
  }
  const existing = await listProductAgentTaskFeedback(storageArea);
  await storageArea.set({
    [PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY]: [...existing, normalized].slice(-250)
  });
  return normalized;
}
