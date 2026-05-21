import type {
  CaptureSnapshot,
  ThreadReadModelSnapshot
} from "../contracts/ingest.ts";
import type { SignalTagsRecord } from "../state/types.ts";
import {
  buildProductSignalEvidenceCatalogFromCapture,
  type ProductSignalEvidenceEntry
} from "./product-signal-analysis.ts";

export const SIGNAL_TAGS_PROMPT_VERSION = "v1";
export const SIGNAL_TAGS_EVIDENCE_CAP = 10;

export const SIGNAL_TAGS_SYSTEM_PROMPT =
  "你是內容標記助理，只做輕量內容標記。你要讀一則 Threads 帖子和少量高互動留言，輸出這篇在講什麼的語意標籤與一句話 gist。不要做研究總結，不要統計詞頻。";

export const SIGNAL_TAGS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["signal_tags", "signal_gist"],
  properties: {
    signal_tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    signal_gist: { type: "string" }
  }
} as const;

export interface SignalTagsInput {
  itemId: string;
  assembledContent: string;
  postUrl: string;
  evidenceCatalog: ProductSignalEvidenceEntry[];
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readThreadReadModel(capture: CaptureSnapshot | null | undefined): ThreadReadModelSnapshot | null {
  const result = capture?.result;
  return result?.threadReadModel ?? result?.thread_read_model ?? null;
}

function readLegacyCanonicalContent(capture: CaptureSnapshot | null | undefined): string {
  return readTrimmedString(capture?.result?.canonical_post?.text ?? capture?.text_snippet);
}

function readAssembledContent(capture: CaptureSnapshot | null | undefined): string {
  const threadReadModel = readThreadReadModel(capture);
  return readTrimmedString(threadReadModel?.assembledContent ?? threadReadModel?.assembled_content)
    || readLegacyCanonicalContent(capture);
}

function readPostUrl(capture: CaptureSnapshot | null | undefined): string {
  return readTrimmedString(capture?.source_post_url ?? capture?.canonical_target_url ?? capture?.source_page_url);
}

export function buildSignalTagsInputFromCapture({
  itemId,
  capture
}: {
  itemId: string;
  capture: CaptureSnapshot | null | undefined;
}): SignalTagsInput | null {
  const assembledContent = readAssembledContent(capture);
  if (!itemId || !assembledContent) {
    return null;
  }

  return {
    itemId,
    assembledContent,
    postUrl: readPostUrl(capture),
    evidenceCatalog: buildProductSignalEvidenceCatalogFromCapture(capture).slice(0, SIGNAL_TAGS_EVIDENCE_CAP)
  };
}

function renderEvidenceCatalog(evidenceCatalog: ProductSignalEvidenceEntry[]): string {
  if (!evidenceCatalog.length) {
    return "（無留言資料）";
  }
  return evidenceCatalog
    .map((entry) =>
      `${entry.ref} [♥${entry.likeCount ?? 0}] @${entry.author || "unknown"}: ${entry.text}`
    )
    .join("\n");
}

export function buildSignalTagsPrompt(input: SignalTagsInput): string {
  return [
    "只回傳 JSON，不要加 markdown 或解釋。所有文字欄位用繁體中文。",
    "任務：替單篇 signal 產生 3 到 5 個語意標籤，以及一句話 signal_gist。",
    "語意標籤是這篇在講什麼，不是文中詞頻；標籤不需要逐字出現在原文。",
    "例子：如果內容在談本地求職者和外勞招聘的衝突，可以輸出「求職」「外勞」「本地勞工」「職位壓價」。",
    "",
    "[帖子原文]",
    input.assembledContent,
    "",
    "[帖子連結]",
    input.postUrl || "（無連結）",
    "",
    "[高互動留言]",
    renderEvidenceCatalog(input.evidenceCatalog),
    "",
    "輸出規則：",
    "- signal_tags: 3 到 5 個短標籤；每個 2 到 8 個中文字或簡短英文短語；去除重複和空泛詞。",
    "- signal_gist: 一句話說清楚這篇在講什麼；不要寫成研究總結或行動建議。",
    "- 不要輸出詞頻、百分比、cluster、meme、technique。",
    "",
    "JSON schema:",
    JSON.stringify(SIGNAL_TAGS_JSON_SCHEMA, null, 2)
  ].join("\n");
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const values: string[] = [];
  for (const entry of value) {
    const text = readTrimmedString(entry);
    const normalized = text.toLowerCase();
    if (!text || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    values.push(text);
    if (values.length >= 5) {
      break;
    }
  }
  return values;
}

export function parseSignalTagsResponse(
  raw: string,
  input: SignalTagsInput,
  model: string,
  generatedAt = new Date().toISOString()
): SignalTagsRecord | null {
  let parsed: Record<string, unknown>;
  try {
    const payload = JSON.parse(stripCodeFence(raw)) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    parsed = payload as Record<string, unknown>;
  } catch {
    return null;
  }

  const signalTags = readStringArray(parsed.signalTags ?? parsed.signal_tags);
  const signalGist = readTrimmedString(parsed.signalGist ?? parsed.signal_gist);
  if (signalTags.length === 0 || !signalGist) {
    return null;
  }

  return {
    itemId: input.itemId,
    status: "complete",
    signalTags,
    signalGist,
    promptVersion: SIGNAL_TAGS_PROMPT_VERSION,
    model,
    generatedAt
  };
}

export const signalTagsTestables = {
  readAssembledContent
};
