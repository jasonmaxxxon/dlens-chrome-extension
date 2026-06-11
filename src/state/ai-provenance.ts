export type AiOutputProvenance = "ai" | "fallback" | "missing";
export type AiOutputProvenanceTone = "success" | "warning" | "neutral";

export interface AiOutputProvenanceDescription {
  label: string;
  detail: string;
  tone: AiOutputProvenanceTone;
}

export function normalizeAiOutputProvenance(value: unknown): AiOutputProvenance {
  if (value === "ai" || value === "fallback" || value === "missing") {
    return value;
  }
  return "missing";
}

export function aiOutputProvenanceFromModel(model: unknown): AiOutputProvenance {
  if (typeof model !== "string") {
    return "missing";
  }
  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    return "missing";
  }
  if (normalized === "fallback" || normalized.startsWith("fallback:")) {
    return "fallback";
  }
  return "ai";
}

export function describeAiOutputProvenance(provenance: AiOutputProvenance): AiOutputProvenanceDescription {
  switch (provenance) {
    case "ai":
      return {
        label: "AI 生成",
        detail: "由已設定的模型產生",
        tone: "success"
      };
    case "fallback":
      return {
        label: "本機 fallback",
        detail: "由 deterministic fallback 產生，不是模型判讀",
        tone: "warning"
      };
    case "missing":
    default:
      return {
        label: "來源未標示",
        detail: "這筆輸出缺少 AI / fallback provenance",
        tone: "neutral"
      };
  }
}
