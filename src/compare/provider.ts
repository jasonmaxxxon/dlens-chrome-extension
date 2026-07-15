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
  buildPrNarrativeSynthesisPrompt,
  parsePrNarrativePostReadResponse,
  parsePrNarrativeSynthesisResponse,
  type PrNarrativePostReading,
  type PrNarrativeSynthesisDraft
} from "./pr-narrative.ts";
import {
  buildSignalReadingPrompt,
  SIGNAL_READING_SYSTEM_PROMPT,
  type SignalReadingInput
} from "./signal-reading.ts";
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
  parseAuditPromptEnvelopeResponse,
  type AuditPromptEnvelope
} from "./topic-audit-prompts.ts";
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
        maxOutputTokens: 1800,
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
    max_tokens: 1800,
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
    const response = await fetchWithRetry(
      "Google",
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: system }]
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1400, responseMimeType: "application/json" }
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Google ${response.status}: ${await response.text()}`);
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
    const response = await fetchWithRetry(
      "Google",
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: system }]
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200, responseMimeType: "application/json" }
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Google ${response.status}: ${await response.text()}`);
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
    const response = await fetchWithRetry(
      "Google",
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "你是社群分析助手。只回傳一句繁體中文比較句，不要解釋。" }]
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 120 }
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Google ${response.status}: ${await response.text()}`);
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
    const response = await fetchWithRetry(
      "Google",
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200, responseMimeType: "application/json" }
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Google ${response.status}: ${await response.text()}`);
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
    const response = await fetchWithRetry(
      "Google",
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 800, responseMimeType: "application/json" }
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Google ${response.status}: ${await response.text()}`);
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
    const response = await fetchWithRetry(
      "Google",
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProductSignalAnalysisBody("google", system, prompt))
      }
    );
    if (!response.ok) {
      throw new Error(`Google ${response.status}: ${await response.text()}`);
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

export async function generateSignalReading(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  input: SignalReadingInput
): Promise<{ reading: string; model: string }> {
  if (!apiKey) {
    throw new Error("尚未設定 AI key。請先在 Settings 設定 Google / OpenAI / Claude key。");
  }
  const prompt = buildSignalReadingPrompt(input);
  const system = SIGNAL_READING_SYSTEM_PROMPT;
  const maxOutputTokens = 1400;

  if (provider === "google") {
    const response = await fetchWithRetry(
      "Google",
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens }
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Google ${response.status}: ${await response.text()}`);
    }
    return { reading: readGoogleContent(await response.json()), model: `google:${GOOGLE_COMPARE_MODEL}` };
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
        max_tokens: maxOutputTokens,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }
    return { reading: readOpenAiContent(await response.json()), model: `openai:${OPENAI_COMPARE_MODEL}` };
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
      max_tokens: maxOutputTokens,
      thinking: { type: "disabled" },
      system,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) {
    throw new Error(`Claude ${response.status}: ${await response.text()}`);
  }
  return { reading: readClaudeContent(await response.json()), model: `claude:${CLAUDE_COMPARE_MODEL}` };
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
  provider: "openai" | "claude" | "google",
  apiKey: string,
  prompt: string,
  maxOutputTokens = 2200
): Promise<AuditPromptEnvelope> {
  if (!apiKey) {
    throw new Error("尚未設定 AI key。請先在 Settings 設定 Google / OpenAI / Claude key。");
  }
  const raw = await generateJsonText(
    provider,
    apiKey,
    prompt,
    "你是 DLens 的 topic audit pipeline worker。只回傳 JSON envelope；不要改寫或捏造 evidence。",
    maxOutputTokens
  );
  const parsed = parseAuditPromptEnvelopeResponse(raw);
  if (!parsed) {
    throw new Error("Invalid topic audit envelope payload");
  }
  return parsed;
}

async function generateJsonText(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  prompt: string,
  system: string,
  maxOutputTokens: number
): Promise<string> {
  if (provider === "google") {
    const response = await fetchWithRetry(
      "Google",
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens, responseMimeType: "application/json" }
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Google ${response.status}: ${await response.text()}`);
    }
    return readGoogleContent(await response.json());
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
    return readOpenAiContent(await response.json());
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
      max_tokens: maxOutputTokens,
      thinking: { type: "disabled" },
      system,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) {
    throw new Error(`Claude ${response.status}: ${await response.text()}`);
  }
  return readClaudeContent(await response.json());
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

export async function generatePrNarrativePostReadings(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  prompt: string,
  expectedRefs: string[]
): Promise<PrNarrativePostReading[]> {
  const raw = await generateJsonText(
    provider,
    apiKey,
    prompt,
    "Read only supplied PR posts and return JSON only.",
    2600
  );
  return parsePrNarrativePostReadResponse(raw, expectedRefs);
}

export async function generatePrNarrativeSynthesis(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  readings: PrNarrativePostReading[],
  campaign: PrCampaign
): Promise<PrNarrativeSynthesisDraft> {
  const raw = await generateJsonText(
    provider,
    apiKey,
    buildPrNarrativeSynthesisPrompt(campaign, readings),
    "Synthesize only validated PR post readings and return JSON only.",
    2200
  );
  return parsePrNarrativeSynthesisResponse(raw, readings.map((reading) => reading.ref));
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
