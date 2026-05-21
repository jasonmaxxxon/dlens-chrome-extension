import type {
  CaptureSnapshot,
  ThreadReadModelPostSnapshot,
  ThreadReadModelSnapshot
} from "../contracts/ingest.ts";
import type { TopicSignalReading, TopicSignalStance } from "../state/types.ts";
import {
  buildProductSignalEvidenceCatalogFromCapture,
  type ProductSignalEvidenceEntry
} from "./product-signal-analysis.ts";

export const TOPIC_SIGNAL_READING_PROMPT_VERSION = "v1";
export const TOPIC_SIGNAL_READING_EVIDENCE_CAP = 15;

export const TOPIC_SIGNAL_READING_SYSTEM_PROMPT =
  "你是輿情研究員。你的工作是讀一則 Threads 帖子和它的觀眾留言，老實告訴研究者：這則討論對研究問題說明了什麼，以及觀眾的反應揭示了什麼立場或張力。你不是在幫產品團隊找任務，而是在做社群討論的理解工作。";

export const TOPIC_SIGNAL_READING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["stance", "reading", "audience_signal", "evidence_refs", "uncertainties"],
  properties: {
    stance: { type: "string", enum: ["central", "adjacent", "off-topic"] },
    reading: { type: "string" },
    audience_signal: { type: "string" },
    evidence_refs: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } }
  }
} as const;

export interface TopicSignalReadingInput {
  signalId: string;
  topicId: string;
  researchQuestion: string;
  assembledContent: string;
  postUrl: string;
  evidenceCatalog: ProductSignalEvidenceEntry[];
  clusterKeywords: string[];
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

function readClusterKeywords(capture: CaptureSnapshot | null | undefined): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const cluster of capture?.analysis?.clusters ?? []) {
    for (const keyword of cluster.keywords ?? []) {
      const trimmed = readTrimmedString(keyword);
      const normalized = trimmed.toLowerCase();
      if (!trimmed || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      keywords.push(trimmed);
      if (keywords.length >= 12) {
        return keywords;
      }
    }
  }
  return keywords;
}

function readPostUrl(capture: CaptureSnapshot | null | undefined): string {
  return readTrimmedString(capture?.source_post_url ?? capture?.canonical_target_url ?? capture?.source_page_url);
}

export function buildTopicSignalReadingInputFromCapture({
  signalId,
  topicId,
  researchQuestion,
  capture
}: {
  signalId: string;
  topicId: string;
  researchQuestion: string;
  capture: CaptureSnapshot | null | undefined;
}): TopicSignalReadingInput | null {
  const assembledContent = readAssembledContent(capture);
  if (!assembledContent) {
    return null;
  }

  return {
    signalId,
    topicId,
    researchQuestion,
    assembledContent,
    postUrl: readPostUrl(capture),
    evidenceCatalog: buildProductSignalEvidenceCatalogFromCapture(capture).slice(0, TOPIC_SIGNAL_READING_EVIDENCE_CAP),
    clusterKeywords: readClusterKeywords(capture)
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

export function buildTopicSignalReadingPrompt(input: TopicSignalReadingInput): string {
  const researchQuestion = readTrimmedString(input.researchQuestion);
  const modeBlock = researchQuestion
    ? [
        "[研究問題]",
        researchQuestion,
        "",
        "判斷規則：",
        "- stance: central = 直接回應研究問題；adjacent = 相關但非核心；off-topic = 與研究問題無關"
      ]
    : [
        "[探索模式]",
        "這個 topic 尚未設定研究問題。請先回答：這篇在說什麼？觀眾反應揭示了什麼張力？跟產品開發或工作流可能有什麼關係？",
        "",
        "判斷規則：",
        "- stance: central = 這篇本身就是 topic 的核心材料；adjacent = 只是相鄰材料；off-topic = 明顯不屬於這個 topic"
      ];
  return [
    "你是輿情研究員。只回傳 JSON，不要加 markdown 或解釋。",
    "所有文字欄位用繁體中文。evidence_refs 和 stance 保留英文 enum。",
    "",
    ...modeBlock,
    "",
    "[帖子原文]",
    input.assembledContent,
    "",
    "[帖子連結]",
    input.postUrl || "（無連結）",
    "",
    "[觀眾留言（按讚數排序）]",
    "以下每條用 ref 標記（e1, e2…）。reading 和 audience_signal 引用 ref 時請用括號，例如（e2）。",
    renderEvidenceCatalog(input.evidenceCatalog),
    "",
    input.clusterKeywords.length > 0
      ? `[關鍵詞線索（server 分析，僅供參考，不要直接引用為分析結論）]\n${input.clusterKeywords.join("、")}`
      : "",
    "",
    "- reading：必須引用至少一個 e ref；禁止空話（不要說「這則帖子非常有趣」）",
    "- audience_signal：若留言稀少或雜亂，如實說「留言不足以判斷觀眾立場」，不要猜測",
    "- uncertainties：只寫讀者需要實際查證的具體疑點，不要寫通用警語",
    "",
    "JSON schema:",
    JSON.stringify(TOPIC_SIGNAL_READING_JSON_SCHEMA, null, 2)
  ].filter(Boolean).join("\n");
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
  return value.map(readTrimmedString).filter(Boolean);
}

function readTopicSignalStance(value: unknown): TopicSignalStance | null {
  return value === "central" || value === "adjacent" || value === "off-topic" ? value : null;
}

export function parseTopicSignalReadingResponse(
  raw: string,
  input: TopicSignalReadingInput,
  model: string,
  generatedAt = new Date().toISOString()
): TopicSignalReading | null {
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

  const stance = readTopicSignalStance(parsed.stance);
  const reading = readTrimmedString(parsed.reading);
  const audienceSignal = readTrimmedString(parsed.audienceSignal ?? parsed.audience_signal);
  if (!stance || !reading || !audienceSignal) {
    return null;
  }

  const allowedRefs = new Set(input.evidenceCatalog.map((entry) => entry.ref));
  const evidenceRefs = readStringArray(parsed.evidenceRefs ?? parsed.evidence_refs)
    .filter((ref) => allowedRefs.has(ref))
    .slice(0, 5);

  return {
    signalId: input.signalId,
    topicId: input.topicId,
    status: "complete",
    stance,
    reading,
    audienceSignal,
    evidenceRefs,
    uncertainties: readStringArray(parsed.uncertainties).slice(0, 3),
    promptVersion: TOPIC_SIGNAL_READING_PROMPT_VERSION,
    model,
    generatedAt
  };
}

export const topicSignalReadingTestables = {
  readAssembledContent,
  readClusterKeywords
};
