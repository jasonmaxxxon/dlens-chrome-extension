import { buildTopicReadingPrompt, parseTopicReadingResponse, TOPIC_READING_SYSTEM_PROMPT, type TopicReadingInput } from "./topic-reading.ts";
import { buildDeepReadingPrompt, parseDeepReadingResponse, DEEP_READING_SYSTEM_PROMPT, DEEP_OUTPUT_TOKENS, deepModel, type DeepReadingInput } from "./deep-reading.ts";
import {
  buildProductSignalAnalyzerPrompt,
  PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA,
  parseProductSignalAnalysisResult,
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
  buildInlineReadingPrompt,
  INLINE_READING_SYSTEM_PROMPT,
  parseInlineReadingResponse,
  type InlineReading,
  type InlineReadingInput
} from "./inline-reading.ts";
import type { PrCampaign, PrCriteriaMatches, PrEvidenceRow } from "../state/pr-evidence-storage.ts";
import type { ProductSignalAnalysis } from "../state/types.ts";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace.ts";
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

function googleGenerateContentRequest(apiKey: string, body: unknown, model = GOOGLE_COMPARE_MODEL): { input: string; init: RequestInit } {
  return {
    input: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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

export async function generateProductSignalAnalysis(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  request: ProductSignalAnalyzerInput
): Promise<ProductSignalAnalysis> {
  const system = "你是產品訊號分析助手。只回傳 JSON，不要加任何解釋。";
  const model = provider === "google"
    ? `google:${GOOGLE_COMPARE_MODEL}`
    : provider === "openai"
      ? `openai:${OPENAI_COMPARE_MODEL}`
      : `claude:${CLAUDE_COMPARE_MODEL}`;

  async function callProvider(prompt: string): Promise<string> {
    if (provider === "google") {
      const googleRequest = googleGenerateContentRequest(apiKey, buildProductSignalAnalysisBody("google", system, prompt));
      const response = await fetchWithRetry("Google", googleRequest.input, googleRequest.init);
      if (!response.ok) {
        throwGoogleResponseError(response);
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
        body: JSON.stringify(buildProductSignalAnalysisBody("openai", system, prompt))
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
      body: JSON.stringify(buildProductSignalAnalysisBody("claude", system, prompt))
    });
    if (!response.ok) {
      throw new Error(`Claude ${response.status}: ${await response.text()}`);
    }
    return readClaudeToolInput(await response.json(), "record_product_signal_analysis");
  }

  const prompt = buildProductSignalAnalyzerPrompt(request);
  const first = parseProductSignalAnalysisResult(await callProvider(prompt), request);
  if (first.ok) {
    return { ...first.analysis, model };
  }

  /* Exactly one repair call, mirroring the audit-envelope repair: the model gets
   * told which field it broke rather than the whole prompt again. */
  const repairedRaw = await callProvider(
    `${prompt}\n\n上一次輸出被拒絕，原因：${first.rejection}。請修正該欄位後重新輸出完整 JSON。`
  );
  const repaired = parseProductSignalAnalysisResult(
    repairedRaw,
    request
  );
  if (repaired.ok) {
    return { ...repaired.analysis, model };
  }
  const fallback = parseProductSignalAnalysisResult(
    repairedRaw,
    request,
    new Date().toISOString(),
    true
  );
  if (fallback.ok && fallback.analysis.warnings?.includes("reading_evidence_ungrounded")) {
    return { ...fallback.analysis, model };
  }
  throw new Error(`Invalid product signal analysis payload: ${repaired.rejection}`);
}

/** Settings' 儲存並測試: list one model with the key. Nothing is generated, so nothing is billed. */
export async function testProviderKey(provider: "openai" | "claude" | "google", apiKey: string): Promise<{ ok: boolean; message: string }> {
  const name = provider === "google" ? "Google" : provider === "openai" ? "OpenAI" : "Claude";
  const [url, headers]: [string, Record<string, string>] = provider === "google"
    ? ["https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { "x-goog-api-key": apiKey }]
    : provider === "openai"
      ? ["https://api.openai.com/v1/models", { Authorization: `Bearer ${apiKey}` }]
      : ["https://api.anthropic.com/v1/models?limit=1", { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }];
  try {
    const response = await fetch(url, { headers });
    if (response.ok) return { ok: true, message: `${name} key 可用` };
    return { ok: false, message: [400, 401, 403].includes(response.status) ? `${name} 拒絕了這個 key（${response.status}）` : `${name} 暫時未能確認 key（${response.status}）` };
  } catch {
    return { ok: false, message: `未能連上 ${name}，請檢查網絡` };
  }
}

export async function generateInlineReading(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  input: InlineReadingInput
): Promise<InlineReading> {
  const model = provider === "google"
    ? `google:${GOOGLE_COMPARE_MODEL}`
    : provider === "openai"
      ? `openai:${OPENAI_COMPARE_MODEL}`
      : `claude:${CLAUDE_COMPARE_MODEL}`;
  const raw = await generateJsonText(provider, apiKey, buildInlineReadingPrompt(input), INLINE_READING_SYSTEM_PROMPT, 1400, "inline-reading");
  const parsed = parseInlineReadingResponse(raw, input, model, new Date().toISOString());
  if (!parsed) {
    throw new Error("AI 回覆格式不對，未能整理。");
  }
  return parsed;
}

interface JsonTextResponse {
  text: string;
  finishReason?: string;
}

function finishReason(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function requestJsonResponse(
  provider: CompareProvider,
  apiKey: string,
  prompt: string,
  system: string,
  maxOutputTokens: number,
  traceLabel?: string,
  modelOverride?: string
): Promise<JsonTextResponse> {
  const label = (base: string) => (traceLabel ? `${base}.${traceLabel}` : base);
  if (provider === "google") {
    const request = googleGenerateContentRequest(apiKey, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens,
        responseMimeType: "application/json"
      }
    }, modelOverride);
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
        model: modelOverride || OPENAI_COMPARE_MODEL,
        temperature: 0.2,
        max_tokens: maxOutputTokens,
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
      model: modelOverride || CLAUDE_COMPARE_MODEL,
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
  traceLabel?: string,
  modelOverride?: string
): Promise<string> {
  return (await requestJsonResponse(provider, apiKey, prompt, system, maxOutputTokens, traceLabel, modelOverride)).text;
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

/** Exactly one semantic/JSON repair; transport retries remain the shared provider policy. */
export async function generateDeepReading(provider: CompareProvider, apiKey: string, input: DeepReadingInput, modelOverride?: string) {
  const model = modelOverride?.trim() || deepModel(provider);
  const prompt = buildDeepReadingPrompt(input);
  const call = (body: string, label: string) => generateJsonText(provider, apiKey, body, DEEP_READING_SYSTEM_PROMPT, DEEP_OUTPUT_TOKENS, label, model);
  const raw = await call(prompt, "deep-reading");
  const parsed = parseDeepReadingResponse(raw, input);
  if (parsed) return parsed;
  const repaired = await call(`${prompt}\n[修復：上次回應無效；依原資料及 JSON 結構重寫，不加入新事實]\n${raw.slice(0, 24000)}`, "deep-reading.repair");
  const result = parseDeepReadingResponse(repaired, input);
  if (!result) throw new Error("深入解讀回應格式無效");
  return result;
}

/** One repair only; the shared transport policy remains unchanged. */
export async function generateTopicReading(provider: CompareProvider, apiKey: string, input: TopicReadingInput, modelOverride?: string) {
  const model=modelOverride?.trim() || deepModel(provider);
  const prompt=buildTopicReadingPrompt(input);
  const call=(body:string,label:string)=>generateJsonText(provider,apiKey,body,TOPIC_READING_SYSTEM_PROMPT,DEEP_OUTPUT_TOKENS,label,model);
  const raw=await call(prompt,"topic-reading");
  const parsed=parseTopicReadingResponse(raw,input);if(parsed)return parsed;
  const repaired=await call(`${prompt}\n[修復：上次 JSON 無效；依原資料重寫，不加入新事實]\n${raw.slice(0,24000)}`,"topic-reading.repair");
  const result=parseTopicReadingResponse(repaired,input);if(!result)throw new Error("話題解讀回應格式無效");return result;
}
