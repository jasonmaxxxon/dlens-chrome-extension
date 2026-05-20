import type { ProductContext, ProductSignalAnalysis } from "../state/types.ts";
import type { ProductSignalDiscussionReply } from "./product-signal-analysis.ts";

export const SIGNAL_READING_PROMPT_VERSION = "v9";
export const SIGNAL_READING_EVIDENCE_CAP = 15;

export const SIGNAL_READING_SYSTEM_PROMPT =
  "你是一個產品訊號的深度閱讀者。你的工作不是填表格，也不是替產品團隊下指令，而是把一則社群訊號讀懂，老實告訴一個產品開發者：這裡面有沒有真正值得注意的東西。";

export interface SignalReadingComment {
  ref: string;
  author: string;
  text: string;
  likeCount?: number | null;
}

export interface SignalReadingInput {
  signalId: string;
  assembledContent: string;
  postUrl: string;
  representativeComments: SignalReadingComment[];
  productContext: ProductContext;
  productContextHash: string;
  analysisPromptVersion: string;
  existingAnalysisSummary: string;
}

/** Trimmed copy of the source material a reading was built from — stored for tracing. */
export interface SignalReadingSourcePacket {
  assembledContent: string;
  postUrl: string;
  representativeComments: SignalReadingComment[];
  analysisPromptVersion: string;
}

const STORED_SOURCE_PACKET_ASSEMBLED_CAP = 8000;
const STORED_SOURCE_PACKET_COMMENT_CAP = 500;

/**
 * Build the trimmed source packet persisted with a reading record. Conservative caps
 * keep chrome.storage.local within quota (no unlimitedStorage permission); the full
 * content identity is preserved by sourcePacketHash, not by this stored copy.
 */
export function buildStoredSourcePacket(input: SignalReadingInput): SignalReadingSourcePacket {
  return {
    assembledContent: input.assembledContent.slice(0, STORED_SOURCE_PACKET_ASSEMBLED_CAP),
    postUrl: input.postUrl,
    representativeComments: input.representativeComments.map((comment) => ({
      ref: comment.ref,
      author: comment.author,
      text: comment.text.slice(0, STORED_SOURCE_PACKET_COMMENT_CAP),
      likeCount: typeof comment.likeCount === "number" && Number.isFinite(comment.likeCount) ? comment.likeCount : null
    })),
    analysisPromptVersion: input.analysisPromptVersion
  };
}

function renderProductContext(productContext: ProductContext): string {
  const lines = Object.entries(productContext as unknown as Record<string, unknown>)
    .map(([key, value]) => {
      if (typeof value === "string" && value.trim()) {
        return `${key}：${value.trim()}`;
      }
      if (Array.isArray(value)) {
        const joined = value.filter((entry) => typeof entry === "string" && entry.trim()).join("、");
        return joined ? `${key}：${joined}` : "";
      }
      return "";
    })
    .filter(Boolean);
  return lines.length ? lines.join("\n") : "（無產品脈絡）";
}

function renderComments(comments: SignalReadingComment[]): string {
  if (!comments.length) {
    return "（沒有觀眾留言）";
  }
  return [...comments]
    .sort((left, right) => {
      const leftLikes = typeof left.likeCount === "number" && Number.isFinite(left.likeCount) ? left.likeCount : -1;
      const rightLikes = typeof right.likeCount === "number" && Number.isFinite(right.likeCount) ? right.likeCount : -1;
      return rightLikes - leftLikes;
    })
    .map((comment) => {
      const likes = typeof comment.likeCount === "number" && Number.isFinite(comment.likeCount)
        ? ` · ${comment.likeCount} 讚`
        : "";
      return `${comment.ref}（${comment.author || "unknown"}${likes}）：${comment.text}`;
    })
    .join("\n");
}

export function selectSignalReadingRepresentativeRefs(
  replies: ProductSignalDiscussionReply[],
  analyzerRefs: string[] = [],
  cap = SIGNAL_READING_EVIDENCE_CAP
): string[] {
  const limit = Math.max(0, Math.floor(cap));
  if (limit === 0 || replies.length === 0) {
    return [];
  }

  const validRefs = new Set(replies.map((_, index) => `e${index + 1}`));
  const topByLikes = replies
    .map((reply, index) => ({
      ref: `e${index + 1}`,
      index,
      likeCount: typeof reply.likeCount === "number" && Number.isFinite(reply.likeCount) ? reply.likeCount : 0
    }))
    .sort((left, right) => right.likeCount - left.likeCount || left.index - right.index)
    .map((entry) => entry.ref);

  const selected: string[] = [];
  const seen = new Set<string>();
  for (const ref of [...analyzerRefs, ...topByLikes]) {
    if (!validRefs.has(ref) || seen.has(ref)) {
      continue;
    }
    seen.add(ref);
    selected.push(ref);
    if (selected.length >= limit) {
      break;
    }
  }
  return selected;
}

export function buildSignalReadingPrompt(input: SignalReadingInput): string {
  return [
    "[任務]",
    "讀下面這則訊號，包括原文、原文連結、代表性觀眾留言、產品脈絡，以及既有結構化分析。",
    "請寫一段自由判讀，給一個會再審視你判讀的產品開發者或 agent 看。",
    "",
    "不要套固定結構。不要強行找 audience gap、workflow recipe、技術機制、定位風險或市場情緒。訊號是什麼形狀，就用什麼形狀寫；如果沒有值得行動或保留的東西，直接說。",
    "",
    "[思考規則]",
    "1. 讓讀者看得出哪些是證據、哪些是推論、哪些是不確定。",
    "2. 證據只能來自原文或觀眾留言；不能把既有結構化分析當證據。",
    "3. 既有結構化分析只供參考。你可以同意、修正或反駁它，但不要被它的欄位形狀帶著走。",
    "4. 寫給「會審視」的人，不是寫給「會直接照做」的人。請指出他應該自行驗證什麼。",
    "5. 產品脈絡必須參考，但不要硬把訊號塞進產品。如果只是一般學習或沒有關聯，要明講。",
    "",
    "[原文]",
    input.assembledContent || "（無原文）",
    "",
    "[原文連結]",
    input.postUrl || "（無連結）",
    "",
    "[代表性觀眾留言]",
    renderComments(input.representativeComments),
    "",
    "[產品脈絡]",
    renderProductContext(input.productContext),
    "",
    "[既有結構化分析（供參考，可同意或反駁）]",
    input.existingAnalysisSummary || "（無既有分析）",
    "",
    "[輸出]",
    "繁體中文自由文字。長度由內容決定，三句講得完就三句。不要 markdown 表格，不要 JSON。"
  ].join("\n");
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function buildExistingAnalysisSummary(analysis: ProductSignalAnalysis): string {
  const lines = [
    `判斷：${analysis.verdict} / ${analysis.signalType}`,
    `摘要：${analysis.contentSummary}`,
    `相關理由：${analysis.whyRelevant}`,
    `理由：${analysis.reason}`
  ];
  if (analysis.audienceGap) {
    lines.push(`預期落差：${analysis.audienceGap}`);
  }
  if (analysis.evidenceNotes?.length) {
    lines.push(`證據筆記：${analysis.evidenceNotes.length} 則`);
  }
  return lines.join("\n");
}

export function buildSourcePacketHash(input: SignalReadingInput): string {
  const parts = [
    input.postUrl,
    input.assembledContent,
    ...input.representativeComments.map((comment) => `${comment.ref}:${comment.likeCount ?? ""}:${comment.text}`),
    input.analysisPromptVersion
  ];
  return hashString(parts.join(""));
}
