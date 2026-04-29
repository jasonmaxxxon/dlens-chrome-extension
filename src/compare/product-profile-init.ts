import type { ProductProfile } from "../state/types.ts";
import {
  CLAUDE_COMPARE_MODEL,
  GOOGLE_COMPARE_MODEL,
  OPENAI_COMPARE_MODEL
} from "./provider.ts";

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

function buildProductProfileInitPrompt(description: string): string {
  return [
    "你是產品分析助手。",
    "請從以下產品自述抽取結構化產品資料。",
    "只回傳 JSON，不要加解釋。",
    "",
    "[INPUT]",
    description.trim(),
    "",
    JSON.stringify({
      name: "string",
      category: "string",
      audience: "string"
    }, null, 2)
  ].join("\n");
}

function parseProductProfileInitResponse(raw: string): ProductProfile | null {
  try {
    const parsed = JSON.parse(stripCodeFence(raw)) as Record<string, unknown>;
    const name = readTrimmedString(parsed.name);
    const category = readTrimmedString(parsed.category);
    const audience = readTrimmedString(parsed.audience);
    if (!name && !category && !audience) {
      return null;
    }
    return {
      name,
      category,
      audience,
      contextText: "",
      contextFiles: []
    };
  } catch {
    return null;
  }
}

function readOpenAiContent(json: any): string {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ")
      .trim();
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

function readGoogleContent(json: any): string {
  const candidates = json?.candidates;
  if (!Array.isArray(candidates) || !candidates.length) {
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

export async function generateProductProfileSuggestion(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  description: string
): Promise<ProductProfile> {
  const prompt = buildProductProfileInitPrompt(description);
  const system = "你是產品分析助手。只回傳 JSON。";

  let raw = "";

  if (provider === "google") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: system }]
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 400, responseMimeType: "application/json" }
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Google ${response.status}: ${await response.text()}`);
    }
    raw = readGoogleContent(await response.json());
  } else if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_COMPARE_MODEL,
        temperature: 0.1,
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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_COMPARE_MODEL,
        max_tokens: 400,
        temperature: 0.1,
        system,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) {
      throw new Error(`Claude ${response.status}: ${await response.text()}`);
    }
    raw = readClaudeContent(await response.json());
  }

  const parsed = parseProductProfileInitResponse(raw);
  if (!parsed) {
    throw new Error("Invalid product profile suggestion payload");
  }
  return parsed;
}
