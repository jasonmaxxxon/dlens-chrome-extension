import type { EvidencePacket } from "../compare/topic-audit.ts";

// Derives the "what's actually inside this narrative" view from the evidence
// packets that belong to a narrative lane. Everything here is computed from real
// captured text (OP posts + their reply fragments) — no AI generation, no
// invented content. The goal is to surface recurring wording, representative
// comments, and the loudest voices so clicking a lane reveals substance instead
// of a decorative label.

export interface LaneKeyword {
  term: string;
  /** Distinct posts (threads) the term appears in — the "recurring" signal. */
  postCount: number;
  /** Total occurrences across every text in the lane. */
  total: number;
}

export interface LaneVoice {
  handle: string;
  /** OP posts this handle authored within the lane. */
  posts: number;
  /** Reply fragments this handle authored within the lane. */
  comments: number;
}

export interface LaneComment {
  /** shortCode of the packet this quote belongs to — used to open the drawer. */
  shortCode: string;
  author: string;
  text: string;
  likes: number | null;
  kind: "op" | "reply";
}

export interface NarrativeLaneDetail {
  laneId: string;
  postCount: number;
  commentCount: number;
  /** True when keywords fell back to raw frequency (no term recurred ≥2 posts). */
  keywordsAreSparse: boolean;
  keywords: LaneKeyword[];
  voices: LaneVoice[];
  comments: LaneComment[];
}

export interface NarrativeLaneRef {
  id: string;
  signalRefs: readonly string[];
}

// Function words / particles that recur in almost any discussion and carry no
// topical meaning. Kept deliberately small so genuine sentiment words
// (失業, 焦慮, 裁員…) are never filtered.
const STOPWORDS = new Set<string>([
  // Traditional/Simplified Chinese function bigrams + common fillers
  "這個", "那個", "我們", "你們", "他們", "她們", "自己", "因為", "所以",
  "但是", "可是", "如果", "就是", "還是", "或者", "而且", "然後", "沒有",
  "不是", "一個", "一些", "這樣", "那樣", "怎麼", "什麼", "真的", "覺得",
  "知道", "可以", "應該", "已經", "現在", "時候", "一直", "其實", "可能",
  "這些", "那些", "不會", "不要", "這種", "那種", "的話", "之後", "之前",
  "今天", "問題", "大家", "感覺",
  // Latin stopwords
  "the", "and", "for", "with", "that", "this", "you", "are", "was", "have",
  "has", "but", "not", "can", "will", "all", "just", "from", "about", "your",
  "our", "they", "their", "what", "who", "how", "why", "when", "それ"
]);

const CJK_RUN_RE = /[一-鿿]+/g;
const LATIN_RUN_RE = /[a-zA-Z][a-zA-Z0-9'']{1,}/g;

/** Splits one text into candidate terms: CJK bigrams + lowercased Latin words. */
function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(LATIN_RUN_RE)) {
    const word = match[0].toLowerCase();
    if (word.length >= 2 && !STOPWORDS.has(word)) {
      out.push(word);
    }
  }
  for (const match of text.matchAll(CJK_RUN_RE)) {
    const run = match[0];
    // Single ideographs are too noisy to count on their own.
    for (let i = 0; i + 2 <= run.length; i++) {
      const bigram = run.slice(i, i + 2);
      if (!STOPWORDS.has(bigram)) {
        out.push(bigram);
      }
    }
  }
  return out;
}

/**
 * Ranks recurring wording across a set of per-post text bundles. Document
 * frequency (how many posts a term appears in) is the primary signal — that is
 * literally "recurring across the collected posts". Falls back to raw frequency
 * only when nothing recurs, so the panel is never empty on thin data.
 */
export function extractKeywords(
  postTexts: ReadonlyArray<ReadonlyArray<string>>,
  limit = 12
): { keywords: LaneKeyword[]; sparse: boolean } {
  const totals = new Map<string, number>();
  const docCounts = new Map<string, number>();
  for (const texts of postTexts) {
    const seenInPost = new Set<string>();
    for (const text of texts) {
      for (const term of tokenize(text)) {
        totals.set(term, (totals.get(term) ?? 0) + 1);
        seenInPost.add(term);
      }
    }
    for (const term of seenInPost) {
      docCounts.set(term, (docCounts.get(term) ?? 0) + 1);
    }
  }

  const all: LaneKeyword[] = [...totals.entries()].map(([term, total]) => ({
    term,
    total,
    postCount: docCounts.get(term) ?? 0
  }));
  const byRank = (a: LaneKeyword, b: LaneKeyword): number =>
    b.postCount - a.postCount || b.total - a.total || a.term.localeCompare(b.term);

  const recurring = all.filter((entry) => entry.postCount >= 2).sort(byRank);
  if (recurring.length >= 3) {
    return { keywords: recurring.slice(0, limit), sparse: false };
  }
  // Thin data: surface the highest-frequency real terms instead of nothing.
  const fallback = all
    .filter((entry) => entry.total >= 2 || entry.term.length >= 2)
    .sort(byRank)
    .slice(0, limit);
  return { keywords: fallback, sparse: true };
}

function laneShortCodes(lane: NarrativeLaneRef): Set<string> {
  return new Set(lane.signalRefs.map((ref) => ref.split(".")[0]).filter(Boolean));
}

function likesValue(likes: number | null): number {
  return typeof likes === "number" ? likes : -1;
}

/**
 * Builds the lane drill-down detail from the packets whose shortCode is
 * referenced by the lane. Pure and deterministic: same input → same output.
 */
export function buildNarrativeLaneDetail({
  lane,
  packets,
  keywordLimit = 12,
  commentLimit = 4,
  voiceLimit = 6
}: {
  lane: NarrativeLaneRef;
  packets: ReadonlyArray<EvidencePacket>;
  keywordLimit?: number;
  commentLimit?: number;
  voiceLimit?: number;
}): NarrativeLaneDetail {
  const codes = laneShortCodes(lane);
  const lanePackets = packets.filter((packet) => codes.has(packet.shortCode));

  const postTexts: string[][] = [];
  const voiceMap = new Map<string, LaneVoice>();
  const replies: LaneComment[] = [];
  const ops: LaneComment[] = [];
  let commentCount = 0;

  const bumpVoice = (handle: string, kind: "op" | "reply") => {
    const key = handle || "unknown";
    const voice = voiceMap.get(key) ?? { handle: key, posts: 0, comments: 0 };
    if (kind === "op") voice.posts += 1;
    else voice.comments += 1;
    voiceMap.set(key, voice);
  };

  for (const packet of lanePackets) {
    const texts: string[] = [];
    const opText = (packet.opText || "").trim();
    if (opText) {
      texts.push(opText);
      ops.push({ shortCode: packet.shortCode, author: packet.opAuthor || "unknown", text: opText, likes: packet.opLikes, kind: "op" });
    }
    bumpVoice(packet.opAuthor, "op");
    for (const fragment of packet.replyFragments) {
      const text = (fragment.text || "").trim();
      if (text) {
        texts.push(text);
        replies.push({ shortCode: packet.shortCode, author: fragment.author || "unknown", text, likes: fragment.likes, kind: "reply" });
        commentCount += 1;
      }
      bumpVoice(fragment.author, "reply");
    }
    postTexts.push(texts);
  }

  const { keywords, sparse } = extractKeywords(postTexts, keywordLimit);

  // Representative quotes: real replies lead (sorted by likes), padded with OP
  // text so the panel always has something concrete to show.
  const sortedReplies = [...replies].sort(
    (a, b) => likesValue(b.likes) - likesValue(a.likes) || a.text.localeCompare(b.text)
  );
  const sortedOps = [...ops].sort(
    (a, b) => likesValue(b.likes) - likesValue(a.likes) || a.text.localeCompare(b.text)
  );
  const comments = [...sortedReplies, ...sortedOps].slice(0, commentLimit);

  const voices = [...voiceMap.values()]
    .sort((a, b) => (b.posts + b.comments) - (a.posts + a.comments) || a.handle.localeCompare(b.handle))
    .slice(0, voiceLimit);

  return {
    laneId: lane.id,
    postCount: lanePackets.length,
    commentCount,
    keywordsAreSparse: sparse,
    keywords,
    voices,
    comments
  };
}
