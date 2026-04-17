export interface EvidenceAnnotationQuoteItem {
  commentId: string;
  side: "A" | "B";
  postAuthor: string;
  postText: string;
  clusterLabel: string;
  /** Cluster-level observation from ClusterInterpretation.observation. Used as
   *  grounding context — the model annotates how this quote relates to it. */
  clusterObservation: string;
  quoteText: string;
  likeCount: number | null;
}

export interface EvidenceAnnotationRequest {
  quotes: EvidenceAnnotationQuoteItem[];
}

export interface EvidenceAnnotation {
  commentId: string;
  /** 0–2 inline phrase highlights with a short label each */
  phraseMarks: { phrase: string; label: string }[];
  /** What the text says — no mind-reading, text-level only */
  writerMeaning: string;
  /** What role this comment plays in the discussion */
  discussionFunction: string;
  /** Why this comment resonates — from textual features, not intent */
  whyEffective: string;
  /** How this comment relates to the cluster's core observation */
  relationToCluster: string;
}

/* ── helpers ── */

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

/* ── cache key ── */

export function buildEvidenceAnnotationCacheKey(
  request: EvidenceAnnotationRequest,
  provider: string,
  promptVersion: string
): string {
  const ids = [...request.quotes]
    .sort((a, b) => a.commentId.localeCompare(b.commentId))
    .map((q) => q.commentId)
    .join("|");
  return ["evidence-annotation", promptVersion, provider, ids].join("|");
}

/* ── prompt ── */

export function buildEvidenceAnnotationPrompt(request: EvidenceAnnotationRequest): string {
  const quoteBlocks = request.quotes.map((q, i) => [
    `[QUOTE ${i + 1}]`,
    `comment_id=${q.commentId}`,
    `side=${q.side}`,
    `post_author=${q.postAuthor}`,
    `post_text=${q.postText}`,
    `cluster_label=${q.clusterLabel}`,
    `cluster_observation=${q.clusterObservation}`,
    `quote=${q.quoteText}`,
    `likes=${q.likeCount ?? "n/a"}`
  ].join("\n")).join("\n\n");

  return [
    "你是社群分析助手。針對以下每則留言輸出一份文本分析。",
    "",
    "分析原則：",
    "  - 只分析文本本身說了什麼，不要猜測作者的意圖或內心",
    "  - writer_meaning：這則留言在語言上表達什麼（描述文本，不推測動機）",
    "  - discussion_function：這則留言在討論脈絡裡扮演什麼角色（如：情緒共鳴入口、框架重寫、責任歸因、無力感集結等）",
    "  - why_effective：從文本特徵解釋為什麼讀者會對這則留言有反應",
    "  - relation_to_cluster：它和 cluster_observation 的關係（延伸、對比、具體化）",
    "  - phrase_marks：選 0 到 2 個最有分析價值的短語，給出一個簡短標籤（如「情緒投射」、「框架入口」、「責任歸因」）",
    "",
    quoteBlocks,
    "",
    "只回傳 JSON，格式：{\"annotations\": [...]}",
    "每個元素：",
    JSON.stringify({
      comment_id: "string",
      phrase_marks: [{ phrase: "string", label: "string" }],
      writer_meaning: "string",
      discussion_function: "string",
      why_effective: "string",
      relation_to_cluster: "string"
    }, null, 2)
  ].join("\n");
}

/* ── parse ── */

interface RawAnnotationPayload {
  comment_id?: string;
  phrase_marks?: unknown;
  writer_meaning?: string;
  discussion_function?: string;
  why_effective?: string;
  relation_to_cluster?: string;
}

function parsePhraseMarks(value: unknown): { phrase: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: unknown): { phrase: string; label: string } | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const phrase = String(o.phrase || "").trim();
      const label = String(o.label || "").trim();
      if (!phrase || !label) return null;
      return { phrase, label };
    })
    .filter((m): m is { phrase: string; label: string } => m !== null)
    .slice(0, 2);
}

export function parseEvidenceAnnotationResponse(
  raw: string,
  request: EvidenceAnnotationRequest
): EvidenceAnnotation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return [];
  }

  const payloads: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { annotations?: unknown[] })?.annotations)
      ? (parsed as { annotations: unknown[] }).annotations
      : [];

  const validIds = new Set(request.quotes.map((q) => q.commentId));
  const results: EvidenceAnnotation[] = [];

  for (const candidate of payloads) {
    const p = candidate as RawAnnotationPayload;
    const commentId = String(p.comment_id || "").trim();
    if (!commentId || !validIds.has(commentId)) continue;

    const writerMeaning = String(p.writer_meaning || "").trim();
    const discussionFunction = String(p.discussion_function || "").trim();
    const whyEffective = String(p.why_effective || "").trim();
    const relationToCluster = String(p.relation_to_cluster || "").trim();

    if (!writerMeaning || !discussionFunction || !whyEffective) continue;

    results.push({
      commentId,
      phraseMarks: parsePhraseMarks(p.phrase_marks),
      writerMeaning,
      discussionFunction,
      whyEffective,
      relationToCluster: relationToCluster || ""
    });
  }

  return results;
}

/* ── deterministic fallback ──
 *
 * No per-quote content. When AI annotation is unavailable we return null instead
 * of fabricating identical prose for every quote in the same cluster. UI callers
 * must handle `null` by rendering an explicit empty state — evidence-backed
 * emptiness is preferable to polished cluster-level copy masquerading as a
 * per-quote reading. See docs/product/2026-04-14-compare-prompt-and-trust-layer-plan.md §9.
 */

export function buildDeterministicEvidenceAnnotation(
  _quote: EvidenceAnnotationQuoteItem
): EvidenceAnnotation | null {
  return null;
}
