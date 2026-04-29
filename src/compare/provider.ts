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
import type { JudgmentResult, ProductProfile, ProductSignalAnalysis } from "../state/types.ts";

export const COMPARE_BRIEF_PROMPT_VERSION = "v7";
export const COMPARE_ONE_LINER_PROMPT_VERSION = "v2";
export const COMPARE_CLUSTER_SUMMARY_PROMPT_VERSION = "v3";
export const COMPARE_EVIDENCE_ANNOTATION_PROMPT_VERSION = "v1";
export const OPENAI_COMPARE_MODEL = "gpt-4.1-mini";
export const CLAUDE_COMPARE_MODEL = "claude-3-5-sonnet-latest"; // haiku → sonnet: better reasoning for reaction-type analysis
export const GOOGLE_COMPARE_MODEL = "gemini-3.1-flash-lite-preview";
const PROVIDER_TIMEOUT_MS = 30_000;
const PROVIDER_MAX_RETRIES = 2;
const PROVIDER_RETRY_DELAYS_MS = [250, 500];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function fetchWithRetry(label: string, input: string, init: RequestInit): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= PROVIDER_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal
      });
      clearTimeout(timeoutHandle);
      if (response.ok || !isRetryableStatus(response.status) || attempt === PROVIDER_MAX_RETRIES) {
        return response;
      }
      lastError = new Error(`${label} ${response.status}: transient upstream failure`);
    } catch (error) {
      clearTimeout(timeoutHandle);
      if ((error as Error)?.name === "AbortError") {
        lastError = new Error(`${label} request timed out after ${PROVIDER_TIMEOUT_MS}ms`);
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (attempt < PROVIDER_MAX_RETRIES) {
      await sleep(PROVIDER_RETRY_DELAYS_MS[attempt] || PROVIDER_RETRY_DELAYS_MS[PROVIDER_RETRY_DELAYS_MS.length - 1] || 500);
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
    temperature: 0.2,
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
        temperature: 0.2,
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
        temperature: 0.2,
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
  if (!parsed.length && request.clusters.length) {
    throw new Error("Invalid cluster summary payload");
  }
  return parsed;
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
      temperature: 0.3,
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
        temperature: 0.2,
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
        temperature: 0.2,
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

  if (provider === "google") {
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
  return parsed;
}

export const providerTestables = {
  fetchWithRetry,
  buildProductSignalAnalysisBody
};
