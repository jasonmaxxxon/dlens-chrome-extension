import type { ProductContext, ProductProfile } from "../state/types.ts";
import {
  CLAUDE_COMPARE_MODEL,
  fetchWithRetry,
  GOOGLE_COMPARE_MODEL,
  OPENAI_COMPARE_MODEL
} from "./provider.ts";

export const PRODUCT_CONTEXT_STORAGE_KEY = "dlens:v1:product-context";
export const LEGACY_PRODUCT_CONTEXT_STORAGE_KEY = "dlens_product_context";
export const PRODUCT_CONTEXT_PROMPT_VERSION = "v1";

export const PRODUCT_CONTEXT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "product_promise",
    "target_audience",
    "agent_roles",
    "core_workflows",
    "current_capabilities",
    "explicit_constraints",
    "non_goals",
    "preferred_tech_direction",
    "evaluation_criteria",
    "unknowns"
  ],
  properties: {
    product_promise: { type: "string" },
    target_audience: { type: "string" },
    agent_roles: { type: "array", items: { type: "string" } },
    core_workflows: { type: "array", items: { type: "string" } },
    current_capabilities: { type: "array", items: { type: "string" } },
    explicit_constraints: { type: "array", items: { type: "string" } },
    non_goals: { type: "array", items: { type: "string" } },
    preferred_tech_direction: { type: "string" },
    evaluation_criteria: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } }
  }
} as const;

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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(readTrimmedString)
    .filter(Boolean)
    .slice(0, 12);
}

export function isProductContextSourceReady(productProfile: ProductProfile | null | undefined): boolean {
  return Boolean(productProfile?.contextText?.trim() && (productProfile.contextFiles?.length ?? 0) > 0);
}

function readOpenAiContent(json: any): string {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join(" ").trim();
  }
  return "";
}

function readClaudeContent(json: any): string {
  const content = json?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join(" ").trim();
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
  if (!Array.isArray(candidates) || !candidates.length) {
    return "";
  }
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join(" ").trim();
}

export function buildProductContextProviderBody(
  provider: "openai" | "claude" | "google",
  system: string,
  prompt: string
): any {
  if (provider === "google") {
    return {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
        responseJsonSchema: PRODUCT_CONTEXT_JSON_SCHEMA
      }
    };
  }
  if (provider === "openai") {
    return {
      model: OPENAI_COMPARE_MODEL,
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "product_context",
          strict: true,
          schema: PRODUCT_CONTEXT_JSON_SCHEMA
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
    max_tokens: 1200,
    temperature: 0.1,
    system,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "record_product_context",
        description: "Record the structured reusable ProductContext compiled from user-provided product documents.",
        input_schema: PRODUCT_CONTEXT_JSON_SCHEMA
      }
    ],
    tool_choice: { type: "tool", name: "record_product_context" }
  };
}

export function buildProductContextCompilerPrompt(productProfile: ProductProfile): string {
  const files = (productProfile.contextFiles ?? [])
    .map((file) => `- ${file.name} (${file.kind}, ${file.charCount} chars, id=${file.id})`)
    .join("\n");

  return [
    "你是產品脈絡編譯器。請把使用者匯入的產品文件壓縮成後續產品判斷可重用的 ProductContext。",
    "只回傳 JSON，不要加入 markdown 或解釋。",
    "目標是保留產品 promise、現有能力、限制、non-goals、評估標準和未知問題；不要提出新功能建議。",
    "",
    "[PRODUCT_PROFILE]",
    `name=${readTrimmedString(productProfile.name)}`,
    `category=${readTrimmedString(productProfile.category)}`,
    `audience=${readTrimmedString(productProfile.audience)}`,
    "",
    "[SOURCE_FILES]",
    files || "none",
    "",
    "[PRODUCT_DOCS]",
    (productProfile.contextText ?? "").slice(0, 60000),
    "",
    "JSON schema:",
    JSON.stringify({
      product_promise: "string",
      target_audience: "string",
      agent_roles: ["string"],
      core_workflows: ["string"],
      current_capabilities: ["string"],
      explicit_constraints: ["string"],
      non_goals: ["string"],
      preferred_tech_direction: "string",
      evaluation_criteria: ["string"],
      unknowns: ["string"]
    }, null, 2)
  ].join("\n");
}

export function parseProductContextCompilerResponse(
  raw: string,
  productProfile: ProductProfile,
  compiledAt = new Date().toISOString()
): ProductContext | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripCodeFence(raw)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const productPromise = readTrimmedString(parsed.productPromise ?? parsed.product_promise);
  const targetAudience = readTrimmedString(parsed.targetAudience ?? parsed.target_audience);
  if (!productPromise || !targetAudience) {
    return null;
  }

  return {
    productPromise,
    targetAudience,
    agentRoles: readStringArray(parsed.agentRoles ?? parsed.agent_roles),
    coreWorkflows: readStringArray(parsed.coreWorkflows ?? parsed.core_workflows),
    currentCapabilities: readStringArray(parsed.currentCapabilities ?? parsed.current_capabilities),
    explicitConstraints: readStringArray(parsed.explicitConstraints ?? parsed.explicit_constraints),
    nonGoals: readStringArray(parsed.nonGoals ?? parsed.non_goals),
    preferredTechDirection: readTrimmedString(parsed.preferredTechDirection ?? parsed.preferred_tech_direction),
    evaluationCriteria: readStringArray(parsed.evaluationCriteria ?? parsed.evaluation_criteria),
    unknowns: readStringArray(parsed.unknowns),
    compiledAt,
    sourceFileIds: (productProfile.contextFiles ?? []).map((file) => file.id),
    promptVersion: PRODUCT_CONTEXT_PROMPT_VERSION
  };
}

export async function generateProductContext(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  productProfile: ProductProfile
): Promise<ProductContext> {
  const prompt = buildProductContextCompilerPrompt(productProfile);
  const system = "你是產品脈絡編譯器。只回傳 JSON。";
  let raw = "";

  if (provider === "google") {
    const response = await fetchWithRetry(
      "Google",
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProductContextProviderBody("google", system, prompt))
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
      body: JSON.stringify(buildProductContextProviderBody("openai", system, prompt))
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
      body: JSON.stringify(buildProductContextProviderBody("claude", system, prompt))
    });
    if (!response.ok) {
      throw new Error(`Claude ${response.status}: ${await response.text()}`);
    }
    raw = readClaudeToolInput(await response.json(), "record_product_context");
  }

  const parsed = parseProductContextCompilerResponse(raw, productProfile);
  if (!parsed) {
    throw new Error("Invalid product context payload");
  }
  return parsed;
}
