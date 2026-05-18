import type { ProductSignalAnalysis, ProductSignalVerdict } from "../state/types.ts";
import { signalReadingStaleness, type SignalReading } from "./signal-reading-storage.ts";

const VERDICT_BRIEF_LABELS: Record<ProductSignalVerdict, string> = {
  try: "值得嘗試",
  watch: "保留觀察",
  park: "前提不符",
  insufficient_data: "資料不足"
};

/** The single filed-only quality gate — the only place this filter is defined (contract §5). */
export function selectFiledReadings(readings: SignalReading[]): SignalReading[] {
  return readings.filter((reading) => reading.reviewState === "filed");
}

/**
 * Compose an Agent Brief from filed readings. Pure — shared by §2 preview and any handler so
 * the filed-only gate and the markdown format live in exactly one place (contract §5).
 */
export function composeReadingBrief(
  readings: SignalReading[],
  analysesBySignalId: Map<string, ProductSignalAnalysis>,
  currentPromptVersion: string
): string {
  const filed = selectFiledReadings(readings);
  if (!filed.length) {
    return "# Product Action Brief — 判讀優先\n\n（沒有已收錄的判讀。先在 Reading Review 收錄至少一則。）";
  }
  const sections = filed.map((reading, index) => {
    const analysis = analysesBySignalId.get(reading.signalId);
    const title = analysis?.contentSummary || `Signal ${index + 1}`;
    const verdictText = analysis ? VERDICT_BRIEF_LABELS[analysis.verdict] : "尚未分析";
    const relevanceText = analysis ? ` · relevance ${analysis.relevance}/5` : "";
    const classText = analysis?.referenceLabel ? ` · ${analysis.referenceLabel}` : "";
    const staleness = signalReadingStaleness(reading, currentPromptVersion);
    const staleLine = staleness.stale
      ? [`> ⚠ 判讀版本過期 / 缺來源（${staleness.reasons.join(", ")}）— 建議重新生成後再用`]
      : [];
    const sourceLines = [
      reading.sourcePacket.postUrl ? `- 原文: ${reading.sourcePacket.postUrl}` : "",
      reading.sourceRefs.length ? `- 留言 refs: ${reading.sourceRefs.join(" · ")}` : ""
    ].filter(Boolean);
    return [
      `## ${index + 1}. ${title}`,
      `- 判斷: ${verdictText}${relevanceText}${classText}`,
      ...staleLine,
      "",
      "### 模型判讀",
      reading.reading,
      ...(sourceLines.length ? ["", "### 來源", ...sourceLines] : [])
    ].join("\n");
  });
  return ["# Product Action Brief — 判讀優先", ...sections].join("\n\n");
}
