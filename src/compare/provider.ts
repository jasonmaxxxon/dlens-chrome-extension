import { buildCompareOneLinerPrompt, type CompareOneLinerRequest } from "./one-liner.ts";
import {
  buildCompareBriefPrompt,
  parseCompareBriefResponse,
  type CompareBrief,
  type CompareBriefRequest
} from "./brief.ts";
import { buildJudgmentPrompt, parseJudgmentResponse } from "./judgment.ts";
import {
  buildCompareClusterSummaryPrompt,
  buildDeterministicClusterInterpretations,
  parseCompareClusterSummaryResponse,
  type ClusterInterpretation,
  type CompareClusterSummaryRequest
} from "./cluster-interpretation.ts";
import {
  buildEvidenceAnnotationPrompt,
  parseEvidenceAnnotationResponse,
  type EvidenceAnnotation,
  type EvidenceAnnotationRequest
} from "./evidence-annotation.ts";
import {
  buildProductSignalAnalyzerPrompt,
  PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA,
  parseProductSignalAnalysisResponse,
  type ProductSignalAnalyzerInput
} from "./product-signal-analysis.ts";
import {
  buildPrCriteriaMatchPrompt,
  buildDeterministicPrCriteriaMatches,
  buildPrCriteriaSuggestionPrompt,
  buildDeterministicPrCriteria,
  buildPrSummaryPrompt,
  isDefaultPrCriteria,
  mergePrCriteriaMatches,
  parsePrCampaignSetupSuggestion,
  parsePrCriteriaMatchResponse,
  validatePrSummaryDraft,
  type PrCampaignSetupSuggestion,
  type PrSummaryFacts
} from "./pr-evidence.ts";
import {
  buildPrNarrativeRepairPrompt,
  buildPrNarrativeSynthesisPrompt,
  collectPrNarrativePostReadingSoftFlags,
  collectPrNarrativeSynthesisSoftFlags,
  parsePrNarrativePostReadResponse,
  parsePrNarrativeStageWithRepair,
  parsePrNarrativeSynthesisResponse,
  type PrNarrativePostReading,
  type PrNarrativeProseViolation,
  type PrNarrativeRepairOutcome,
  type PrNarrativeSynthesisDraft
} from "./pr-narrative.ts";
import {
  buildSignalTagsPrompt,
  parseSignalTagsResponse,
  SIGNAL_TAGS_SYSTEM_PROMPT,
  type SignalTagsInput
} from "./signal-tags.ts";
import {
  buildTopicSignalReadingPrompt,
  parseTopicSignalReadingResponse,
  TOPIC_SIGNAL_READING_SYSTEM_PROMPT,
  type TopicSignalReadingInput
} from "./topic-signal-reading.ts";
import {
  parseAuditPromptEnvelopeResult,
  type AuditPromptEnvelope
} from "./topic-audit-prompts.ts";
import {
  TOPIC_AUDIT_ENVELOPE_JSON_SCHEMA,
  TOPIC_AUDIT_REPAIR_SUFFIX,
  TopicAuditEnvelopeError,
  type TopicAuditEnvelopeFailureKind
} from "./topic-audit-envelope-contract.ts";
import type { TopicAuditStageName } from "./topic-audit.ts";
import type { PrCampaign, PrCriteriaMatches, PrEvidenceRow } from "../state/pr-evidence-storage.ts";
import type { JudgmentResult, ProductProfile, ProductSignalAnalysis, SignalTagsRecord, TopicSignalReading } from "../state/types.ts";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace.ts";

export const COMPARE_BRIEF_PROMPT_VERSION = "v8";
export const COMPARE_ONE_LINER_PROMPT_VERSION = "v2";
export const COMPARE_CLUSTER_SUMMARY_PROMPT_VERSION = "v3";
export const COMPARE_EVIDENCE_ANNOTATION_PROMPT_VERSION = "v1";
export const OPENAI_COMPARE_MODEL = "gpt-4.1-mini";
export const CLAUDE_COMPARE_MODEL = "claude-sonnet-5"; // 3.5 Sonnet retired 2025-10-28; sonnet-5 is the drop-in. Sonnet 5 rejects temperature and defaults to adaptive thinking, so Claude bodies below send no temperature and thinking:{type:"disabled"}.
export const GOOGLE_COMPARE_MODEL = "gemini-3.1-flash-lite";
const PROVIDER_TIMEOUT_MS = 30_000;
const PROVIDER_MAX_RETRIES = 2;
const PROVIDER_RETRY_DELAYS_MS = [250, 500];
const PROVIDER_RETRY_AFTER_CAP_MS = 10_000;
const PRODUCT_SIGNAL_ANALYSIS_MAX_OUTPUT_TOKENS = 2800;

type CompareProvider = "openai" | "claude" | "google";

function modelForProvider(provider: CompareProvider): string {
  if (provider === "google") return `google:${GOOGLE_COMPARE_MODEL}`;
  if (provider === "openai") return `openai:${OPENAI_COMPARE_MODEL}`;
  return `claude:${CLAUDE_COMPARE_MODEL}`;
}

function googleGenerateContentRequest(apiKey: string, body: unknown): { input: string; init: RequestInit } {
  return {
    input: `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body)
    }
  };
}

function throwGoogleResponseError(response: Response): never {
  throw new Error(`Google ${response.status}: request failed`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Providers signal 429 backoff via a Retry-After header in delta-seconds; honour it
// (capped) instead of the fixed 250/500ms ladder so we don't hammer a rate limit.
function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }
  const seconds = Number(headerValue);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return Math.min(seconds * 1000, PROVIDER_RETRY_AFTER_CAP_MS);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function readRequestMethod(init: RequestInit): string {
  return String(init.method || "GET").toUpperCase();
}

function readRequestHost(input: string): string {
  try {
    return new URL(input).host;
  } catch {
    return "unknown";
  }
}

export async function fetchWithRetry(label: string, input: string, init: RequestInit): Promise<Response> {
  let lastError: Error | null = null;
  const method = readRequestMethod(init);
  const host = readRequestHost(input);
  const requestId = createPipelineRequestId(`direct-llm.${label}`);

  for (let attempt = 0; attempt <= PROVIDER_MAX_RETRIES; attempt += 1) {
    const attemptNumber = attempt + 1;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    let retryAfterMs: number | null = null;
    emitPipelineEvent({
      phase: "llm.call",
      step: `direct-llm.${label}.request`,
      target: {},
      result: "pending",
      requestId,
      detail: {
        provider: label,
        method,
        host,
        attempt: attemptNumber,
        maxRetries: PROVIDER_MAX_RETRIES,
        timeoutMs: PROVIDER_TIMEOUT_MS
      }
    });
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal
      });
      clearTimeout(timeoutHandle);
      if (response.ok || !isRetryableStatus(response.status) || attempt === PROVIDER_MAX_RETRIES) {
        emitPipelineEvent({
          phase: "llm.call",
          step: `direct-llm.${label}.response`,
          target: {},
          result: response.ok ? "ok" : "error",
          requestId,
          detail: {
            provider: label,
            method,
            host,
            status: response.status,
            ok: response.ok,
            attempt: attemptNumber,
            maxRetries: PROVIDER_MAX_RETRIES,
            timeoutMs: PROVIDER_TIMEOUT_MS
          }
        });
        return response;
      }
      lastError = new Error(`${label} ${response.status}: transient upstream failure`);
      retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      emitPipelineEvent({
        phase: "llm.call",
        step: `direct-llm.${label}.response`,
        target: {},
        result: "pending",
        requestId,
        detail: {
          provider: label,
          method,
          host,
          status: response.status,
          ok: false,
          retrying: true,
          attempt: attemptNumber,
          maxRetries: PROVIDER_MAX_RETRIES,
          timeoutMs: PROVIDER_TIMEOUT_MS
        }
      });
    } catch (error) {
      clearTimeout(timeoutHandle);
      if ((error as Error)?.name === "AbortError") {
        lastError = new Error(`${label} request timed out after ${PROVIDER_TIMEOUT_MS}ms`);
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      emitPipelineEvent({
        phase: "llm.call",
        step: `direct-llm.${label}.response`,
        target: {},
        result: attempt < PROVIDER_MAX_RETRIES ? "pending" : "error",
        requestId,
        detail: {
          provider: label,
          method,
          host,
          ok: false,
          retrying: attempt < PROVIDER_MAX_RETRIES,
          error: lastError.message,
          attempt: attemptNumber,
          maxRetries: PROVIDER_MAX_RETRIES,
          timeoutMs: PROVIDER_TIMEOUT_MS
        }
      });
    }

    if (attempt < PROVIDER_MAX_RETRIES) {
      const fixedDelay = PROVIDER_RETRY_DELAYS_MS[attempt] || PROVIDER_RETRY_DELAYS_MS[PROVIDER_RETRY_DELAYS_MS.length - 1] || 500;
      await sleep(retryAfterMs ?? fixedDelay);
    }
  }

  throw lastError || new Error(`${label} request failed`);
}

function readOpenAiContent(json: any): string {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ")
      .trim();
    return text;
  }
  return "";
}

function readClaudeContent(json: any): string {
  const content = json?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();
}

function readClaudeToolInput(json: any, toolName: string): string {
  const content = json?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  const toolUse = content.find((part) => part?.type === "tool_use" && part?.name === toolName);
  return toolUse?.input && typeof toolUse.input === "object" ? JSON.stringify(toolUse.input) : "";
}

function readGoogleContent(json: any): string {
  const candidates = json?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();
}

function buildProductSignalAnalysisBody(
  provider: "openai" | "claude" | "google",
  system: string,
  prompt: string
): any {
  if (provider === "google") {
    return {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: PRODUCT_SIGNAL_ANALYSIS_MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
        responseJsonSchema: PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA
      }
    };
  }
  if (provider === "openai") {
    return {
      model: OPENAI_COMPARE_MODEL,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "product_signal_analysis",
          strict: true,
          schema: PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA
        }
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    };
  }
  return {
    model: CLAUDE_COMPARE_MODEL,
    max_tokens: PRODUCT_SIGNAL_ANALYSIS_MAX_OUTPUT_TOKENS,
    thinking: { type: "disabled" },
    system,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "record_product_signal_analysis",
        description: "Record the structured ProductSignalAnalyzer result for one saved Threads signal.",
        input_schema: PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA
      }
    ],
    tool_choice: { type: "tool", name: "record_product_signal_analysis" }
  };
}

export async function generateCompareBrief(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  request: CompareBriefRequest
): Promise<CompareBrief> {
  const prompt = buildCompareBriefPrompt(request);
  const system = "你是社群分析助手。只回傳 JSON，不要加任何解釋。";

  let raw = "";

  if (provider === "google") {
    const request = googleGenerateContentRequest(apiKey, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1400, responseMimeType: "application/json" }
    });
    const response = await fetchWithRetry("Google", request.input, request.init);
    if (!response.ok) {
      throwGoogleResponseError(response);
    }
    raw = readGoogleContent(await response.json());
  } else if (provider === "openai") {
    const response = await fetchWithRetry("OpenAI", "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_COMPARE_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }
    raw = readOpenAiContent(await response.json());
  } else {
    const response = await fetchWithRetry("Claude", "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_COMPARE_MODEL,
        max_tokens: 1400,
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) {
      throw new Error(`Claude ${response.status}: ${await response.text()}`);
    }
    raw = readClaudeContent(await response.json());
  }

  const parsed = parseCompareBriefResponse(raw, request);
  if (!parsed) {
    throw new Error("Invalid compare brief payload");
  }
  return parsed;
}

export async function generateCompareClusterSummaries(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  request: CompareClusterSummaryRequest
): Promise<ClusterInterpretation[]> {
  const prompt = buildCompareClusterSummaryPrompt(request);
  const system = "你是社群分析助手。只回傳 JSON，不要加任何解釋。";

  let raw = "";

  if (provider === "google") {
    const request = googleGenerateContentRequest(apiKey, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200, responseMimeType: "application/json" }
    });
    const response = await fetchWithRetry("Google", request.input, request.init);
    if (!response.ok) {
      throwGoogleResponseError(response);
    }
    raw = readGoogleContent(await response.json());
  } else if (provider === "openai") {
    const response = await fetchWithRetry("OpenAI", "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_COMPARE_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }
    raw = readOpenAiContent(await response.json());
  } else {
    const response = await fetchWithRetry("Claude", "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_COMPARE_MODEL,
        max_tokens: 1200,
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) {
      throw new Error(`Claude ${response.status}: ${await response.text()}`);
    }
    raw = readClaudeContent(await response.json());
  }

  const parsed = parseCompareClusterSummaryResponse(raw, request);
  if (!request.clusters.length) {
    return parsed;
  }
  if (parsed.length === request.clusters.length) {
    return parsed;
  }

  const parsedByKey = new Map<string, ClusterInterpretation>(
    parsed.map((item) => [`${item.captureId}:${item.clusterKey}`, item])
  );
  const fallback = buildDeterministicClusterInterpretations(request);
  const merged = request.clusters.map((cluster) => {
    const key = `${cluster.captureId}:${cluster.clusterKey}`;
    return parsedByKey.get(key) || fallback.find((item) => item.captureId === cluster.captureId && item.clusterKey === cluster.clusterKey)!;
  });
  return merged;
}

export async function generateCompareOneLiner(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  request: CompareOneLinerRequest
): Promise<string> {
  const prompt = buildCompareOneLinerPrompt(request);

  if (provider === "google") {
    const request = googleGenerateContentRequest(apiKey, {
      systemInstruction: { parts: [{ text: "你是社群分析助手。只回傳一句繁體中文比較句，不要解釋。" }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 120 }
    });
    const response = await fetchWithRetry("Google", request.input, request.init);
    if (!response.ok) {
      throwGoogleResponseError(response);
    }
    const json = await response.json();
    return readGoogleContent(json);
  }

  if (provider === "openai") {
    const response = await fetchWithRetry("OpenAI", "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_COMPARE_MODEL,
        max_tokens: 120,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "你是社群分析助手。只回傳一句繁體中文比較句，不要解釋。"
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }
    const json = await response.json();
    return readOpenAiContent(json);
  }

  const response = await fetchWithRetry("Claude", "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLAUDE_COMPARE_MODEL,
      max_tokens: 120,
      thinking: { type: "disabled" },
      system: "你是社群分析助手。只回傳一句繁體中文比較句，不要解釋。",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`Claude ${response.status}: ${await response.text()}`);
  }
  const json = await response.json();
  return readClaudeContent(json);
}

export async function generateEvidenceAnnotations(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  request: EvidenceAnnotationRequest
): Promise<EvidenceAnnotation[]> {
  const prompt = buildEvidenceAnnotationPrompt(request);
  const system = "你是社群分析助手。只回傳 JSON，不要加任何解釋。";

  let raw = "";

  if (provider === "google") {
    const request = googleGenerateContentRequest(apiKey, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200, responseMimeType: "application/json" }
    });
    const response = await fetchWithRetry("Google", request.input, request.init);
    if (!response.ok) {
      throwGoogleResponseError(response);
    }
    raw = readGoogleContent(await response.json());
  } else if (provider === "openai") {
    const response = await fetchWithRetry("OpenAI", "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_COMPARE_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }
    raw = readOpenAiContent(await response.json());
  } else {
    const response = await fetchWithRetry("Claude", "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_COMPARE_MODEL,
        max_tokens: 1200,
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) {
      throw new Error(`Claude ${response.status}: ${await response.text()}`);
    }
    raw = readClaudeContent(await response.json());
  }

  const parsed = parseEvidenceAnnotationResponse(raw, request);
  if (!parsed.length && request.quotes.length) {
    throw new Error("Invalid evidence annotation payload");
  }
  return parsed;
}

export async function generateJudgment(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  brief: CompareBrief,
  productProfile: ProductProfile
): Promise<JudgmentResult> {
  const prompt = buildJudgmentPrompt(brief, productProfile);
  const system = "你是產品判斷助手。只回傳 JSON，不要加任何解釋。";

  let raw = "";

  if (provider === "google") {
    const request = googleGenerateContentRequest(apiKey, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 800, responseMimeType: "application/json" }
    });
    const response = await fetchWithRetry("Google", request.input, request.init);
    if (!response.ok) {
      throwGoogleResponseError(response);
    }
    raw = readGoogleContent(await response.json());
  } else if (provider === "openai") {
    const response = await fetchWithRetry("OpenAI", "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_COMPARE_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }
    raw = readOpenAiContent(await response.json());
  } else {
    const response = await fetchWithRetry("Claude", "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_COMPARE_MODEL,
        max_tokens: 800,
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) {
      throw new Error(`Claude ${response.status}: ${await response.text()}`);
    }
    raw = readClaudeContent(await response.json());
  }

  const parsed = parseJudgmentResponse(raw);
  if (!parsed) {
    throw new Error("Invalid judgment payload");
  }
  return parsed;
}

export async function generateProductSignalAnalysis(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  request: ProductSignalAnalyzerInput
): Promise<ProductSignalAnalysis> {
  const prompt = buildProductSignalAnalyzerPrompt(request);
  const system = "你是產品訊號分析助手。只回傳 JSON，不要加任何解釋。";
  let raw = "";
  let model = "";

  if (provider === "google") {
    model = `google:${GOOGLE_COMPARE_MODEL}`;
    const request = googleGenerateContentRequest(apiKey, buildProductSignalAnalysisBody("google", system, prompt));
    const response = await fetchWithRetry("Google", request.input, request.init);
    if (!response.ok) {
      throwGoogleResponseError(response);
    }
    raw = readGoogleContent(await response.json());
  } else if (provider === "openai") {
    model = `openai:${OPENAI_COMPARE_MODEL}`;
    const response = await fetchWithRetry("OpenAI", "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(buildProductSignalAnalysisBody("openai", system, prompt))
    });
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }
    raw = readOpenAiContent(await response.json());
  } else {
    model = `claude:${CLAUDE_COMPARE_MODEL}`;
    const response = await fetchWithRetry("Claude", "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(buildProductSignalAnalysisBody("claude", system, prompt))
    });
    if (!response.ok) {
      throw new Error(`Claude ${response.status}: ${await response.text()}`);
    }
    raw = readClaudeToolInput(await response.json(), "record_product_signal_analysis");
  }

  const parsed = parseProductSignalAnalysisResponse(raw, request);
  if (!parsed) {
    throw new Error("Invalid product signal analysis payload");
  }
  return { ...parsed, model };
}

export async function generateTopicSignalReading(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  input: TopicSignalReadingInput
): Promise<TopicSignalReading> {
  if (!apiKey) {
    throw new Error("尚未設定 AI key。請先在 Settings 設定 Google / OpenAI / Claude key。");
  }
  const model = provider === "google"
    ? `google:${GOOGLE_COMPARE_MODEL}`
    : provider === "openai"
      ? `openai:${OPENAI_COMPARE_MODEL}`
      : `claude:${CLAUDE_COMPARE_MODEL}`;
  const raw = await generateJsonText(
    provider,
    apiKey,
    buildTopicSignalReadingPrompt(input),
    TOPIC_SIGNAL_READING_SYSTEM_PROMPT,
    1200
  );
  const parsed = parseTopicSignalReadingResponse(raw, input, model);
  if (!parsed) {
    throw new Error("Invalid topic signal reading payload");
  }
  return parsed;
}

export async function generateSignalTags(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  input: SignalTagsInput
): Promise<SignalTagsRecord> {
  if (!apiKey) {
    throw new Error("尚未設定 AI key。請先在 Settings 設定 Google / OpenAI / Claude key。");
  }
  const model = provider === "google"
    ? `google:${GOOGLE_COMPARE_MODEL}`
    : provider === "openai"
      ? `openai:${OPENAI_COMPARE_MODEL}`
      : `claude:${CLAUDE_COMPARE_MODEL}`;
  const raw = await generateJsonText(
    provider,
    apiKey,
    buildSignalTagsPrompt(input),
    SIGNAL_TAGS_SYSTEM_PROMPT,
    450
  );
  const parsed = parseSignalTagsResponse(raw, input, model);
  if (!parsed) {
    throw new Error("Invalid signal tags payload");
  }
  return parsed;
}

export async function generateTopicAuditEnvelope(
  provider: CompareProvider,
  apiKey: string,
  stageName: TopicAuditStageName,
  prompt: string,
  maxOutputTokens = 2200,
  options: { onAttempt?: (attempt: 1 | 2) => Promise<void> | void } = {}
): Promise<AuditPromptEnvelope> {
  if (!apiKey) {
    throw new Error("尚未設定 AI key。請先在 Settings 設定 Google / OpenAI / Claude key。");
  }

  let previousKind: TopicAuditEnvelopeFailureKind | null = null;
  for (const attempt of [1, 2] as const) {
    await options.onAttempt?.(attempt);
    const outputTokenCeiling = attempt === 2 && previousKind === "truncated"
      ? Math.round(maxOutputTokens * 1.5)
      : maxOutputTokens;
    const attemptPrompt = attempt === 1
      ? prompt
      : `${prompt}\n\n${TOPIC_AUDIT_REPAIR_SUFFIX}${previousKind === "truncated" ? " 請縮短 prose，確保 JSON 完整閉合。" : ""}`;
    const response = await requestTopicAuditJson(provider, apiKey, attemptPrompt, outputTokenCeiling);
    const parsed = parseAuditPromptEnvelopeResult(response.text, undefined, { finishReason: response.finishReason });
    emitTopicAuditEnvelopeAttempt({
      provider,
      model: modelForProvider(provider),
      stageName,
      attempt,
      outputTokenCeiling,
      finishReason: response.finishReason,
      outputChars: parsed.ok ? response.text.trim().length : parsed.outputChars,
      result: parsed.ok ? "success" : attempt === 1 ? "retrying" : "terminal",
      ...(!parsed.ok ? { failureKind: parsed.kind } : {})
    });
    if (parsed.ok) {
      return parsed.envelope;
    }
    previousKind = parsed.kind;
    if (attempt === 2) {
      throw new TopicAuditEnvelopeError(stageName, parsed.kind, attempt, parsed.finishReason, parsed.outputChars);
    }
  }

  throw new Error("unreachable topic audit retry state");
}

interface TopicAuditJsonResponse {
  text: string;
  finishReason?: string;
}

function finishReason(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function emitTopicAuditEnvelopeAttempt(detail: {
  provider: CompareProvider;
  model: string;
  stageName: TopicAuditStageName;
  attempt: 1 | 2;
  outputTokenCeiling: number;
  finishReason?: string;
  outputChars: number;
  result: "success" | "retrying" | "terminal";
  failureKind?: TopicAuditEnvelopeFailureKind;
}): void {
  emitPipelineEvent({
    phase: "llm.call",
    step: "topic-audit.envelope.attempt",
    target: {},
    result: detail.result === "success" ? "ok" : detail.result === "retrying" ? "pending" : "error",
    detail
  });
}

async function requestTopicAuditJson(
  provider: CompareProvider,
  apiKey: string,
  prompt: string,
  maxOutputTokens: number
): Promise<TopicAuditJsonResponse> {
  return requestJsonResponse(
    provider,
    apiKey,
    prompt,
    "你是 DLens 的 topic audit pipeline worker。只回傳 JSON envelope；不要改寫或捏造 evidence。",
    maxOutputTokens,
    undefined,
    true
  );
}

async function requestJsonResponse(
  provider: CompareProvider,
  apiKey: string,
  prompt: string,
  system: string,
  maxOutputTokens: number,
  traceLabel?: string,
  useTopicAuditSchema = false
): Promise<TopicAuditJsonResponse> {
  const label = (base: string) => (traceLabel ? `${base}.${traceLabel}` : base);
  if (provider === "google") {
    // Deliberately no responseJsonSchema here: schema-constrained decoding on
    // gemini-3.1-flash-lite runs away on the loose audit envelope (replayed
    // 2026-07-18: 31k chars at a 16k ceiling, MAX_TOKENS every time; the same
    // prompt without the schema stops at STOP inside the prose budget).
    // Envelope shape is enforced by parseAuditPromptEnvelopeResult + one repair
    // retry instead.
    const request = googleGenerateContentRequest(apiKey, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens,
        responseMimeType: "application/json"
      }
    });
    const response = await fetchWithRetry(label("Google"), request.input, request.init);
    if (!response.ok) {
      throwGoogleResponseError(response);
    }
    const json = await response.json();
    return { text: readGoogleContent(json), finishReason: finishReason(json?.candidates?.[0]?.finishReason) };
  }

  if (provider === "openai") {
    const response = await fetchWithRetry(label("OpenAI"), "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_COMPARE_MODEL,
        temperature: 0.2,
        response_format: useTopicAuditSchema
          ? {
              type: "json_schema",
              json_schema: {
                name: "topic_audit_envelope",
                strict: false,
                schema: TOPIC_AUDIT_ENVELOPE_JSON_SCHEMA
              }
            }
          : { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }
    const json = await response.json();
    return { text: readOpenAiContent(json), finishReason: finishReason(json?.choices?.[0]?.finish_reason) };
  }

  const response = await fetchWithRetry(label("Claude"), "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLAUDE_COMPARE_MODEL,
      max_tokens: maxOutputTokens,
      thinking: { type: "disabled" },
      system,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) {
    throw new Error(`Claude ${response.status}: ${await response.text()}`);
  }
  const json = await response.json();
  return { text: readClaudeContent(json), finishReason: finishReason(json?.stop_reason) };
}

async function generateJsonText(
  provider: CompareProvider,
  apiKey: string,
  prompt: string,
  system: string,
  maxOutputTokens: number,
  traceLabel?: string
): Promise<string> {
  return (await requestJsonResponse(provider, apiKey, prompt, system, maxOutputTokens, traceLabel)).text;
}

export async function generatePrCampaignSetupSuggestion(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  campaignName: string,
  briefText: string
): Promise<PrCampaignSetupSuggestion> {
  const raw = await generateJsonText(
    provider,
    apiKey,
    buildPrCriteriaSuggestionPrompt(campaignName, briefText),
    "You are a PR reporting assistant. Return one JSON envelope containing criteria and narrativeSettings only.",
    1000
  );
  const suggestion = parsePrCampaignSetupSuggestion(raw);
  return {
    criteria: isDefaultPrCriteria(suggestion.criteria)
      ? buildDeterministicPrCriteria(campaignName, briefText)
      : suggestion.criteria,
    narrativeSettings: suggestion.narrativeSettings
  };
}

export async function generatePrCriteriaSuggestions(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  campaignName: string,
  briefText: string
): Promise<PrCampaign["criteria"]> {
  return (await generatePrCampaignSetupSuggestion(provider, apiKey, campaignName, briefText)).criteria;
}

function compactProseViolations(violations: readonly PrNarrativeProseViolation[]): unknown[] {
  return violations.map(({ context, kind, severity, sentence, matched }) => ({ context, kind, severity, sentence, matched }));
}

function emitPrNarrativeRepairOutcome(traceLabel: string, outcome: PrNarrativeRepairOutcome<unknown>): void {
  if (!outcome.repaired) {
    return;
  }
  emitPipelineEvent({
    phase: "llm.call",
    step: `${traceLabel}.repair.result`,
    target: {},
    result: "ok",
    detail: {
      violationsBeforeRepair: compactProseViolations(outcome.violationsBeforeRepair),
      keptSoftFlags: compactProseViolations(outcome.keptSoftFlags)
    }
  });
}

export async function generatePrNarrativePostReadings(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  prompt: string,
  expectedRefs: string[],
  traceLabel = "pr-narrative.stageA"
): Promise<PrNarrativePostReading[]> {
  const system = "Read only supplied PR posts and return JSON only.";
  const raw = await generateJsonText(provider, apiKey, prompt, system, 2600, traceLabel);
  const outcome = await parsePrNarrativeStageWithRepair({
    raw,
    parse: (value) => parsePrNarrativePostReadResponse(value, expectedRefs),
    collectSoftFlags: collectPrNarrativePostReadingSoftFlags,
    repair: async ({ originalRaw, violations }) => {
      emitPipelineEvent({
        phase: "llm.call",
        step: `${traceLabel}.repair.request`,
        target: {},
        result: "pending",
        detail: { violations: compactProseViolations(violations) }
      });
      return generateJsonText(
        provider,
        apiKey,
        buildPrNarrativeRepairPrompt({ stage: "postRead", originalRaw, violations }),
        system,
        2600,
        `${traceLabel}.repair`
      );
    }
  });
  emitPrNarrativeRepairOutcome(traceLabel, outcome);
  return outcome.value;
}

export async function generatePrNarrativeSynthesis(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  readings: PrNarrativePostReading[],
  campaign: PrCampaign,
  traceLabel = "pr-narrative.stageB"
): Promise<PrNarrativeSynthesisDraft> {
  const system = "Synthesize only validated PR post readings and return JSON only.";
  const allowedRefs = readings.map((reading) => reading.ref);
  const raw = await generateJsonText(
    provider,
    apiKey,
    buildPrNarrativeSynthesisPrompt(campaign, readings),
    system,
    2200,
    traceLabel
  );
  const outcome = await parsePrNarrativeStageWithRepair({
    raw,
    parse: (value) => parsePrNarrativeSynthesisResponse(value, allowedRefs),
    collectSoftFlags: collectPrNarrativeSynthesisSoftFlags,
    repair: async ({ originalRaw, violations }) => {
      emitPipelineEvent({
        phase: "llm.call",
        step: `${traceLabel}.repair.request`,
        target: {},
        result: "pending",
        detail: { violations: compactProseViolations(violations) }
      });
      return generateJsonText(
        provider,
        apiKey,
        buildPrNarrativeRepairPrompt({ stage: "synthesis", originalRaw, violations }),
        system,
        2200,
        `${traceLabel}.repair`
      );
    }
  });
  emitPrNarrativeRepairOutcome(traceLabel, outcome);
  return outcome.value;
}

export async function generatePrCriteriaMatches(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  campaign: PrCampaign,
  rows: PrEvidenceRow[]
): Promise<Record<string, PrCriteriaMatches>> {
  const raw = await generateJsonText(
    provider,
    apiKey,
    buildPrCriteriaMatchPrompt(campaign, rows),
    "You are a PR evidence matching assistant. Return JSON only.",
    1600
  );
  const rowIds = rows.map((row) => row.id);
  return mergePrCriteriaMatches(
    parsePrCriteriaMatchResponse(raw, rowIds),
    buildDeterministicPrCriteriaMatches(campaign, rows),
    rowIds
  );
}

export async function generatePrSummaryDraft(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  facts: PrSummaryFacts
): Promise<string> {
  const raw = await generateJsonText(
    provider,
    apiKey,
    `${buildPrSummaryPrompt(facts)}\n\nReturn JSON: {"summary":"..."}`,
    "You are a PR audit report writer. Return JSON only.",
    1800
  );
  let summary = "";
  try {
    const parsed = JSON.parse(raw);
    summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";
  } catch {
    summary = raw.trim();
  }
  if (!summary || !validatePrSummaryDraft(summary, facts)) {
    throw new Error("Invalid PR summary payload");
  }
  return summary;
}

export const providerTestables = {
  fetchWithRetry,
  buildProductSignalAnalysisBody
};
