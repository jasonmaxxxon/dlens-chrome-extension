import type { EvidencePacket } from "../compare/topic-audit.ts";

// Derives the "what's actually inside this narrative" view from the evidence
// packets that belong to a narrative lane. Everything here is computed from real
// captured text (OP posts + their reply fragments) — no AI generation, no
// invented content. The goal is to surface representative comments and loudest
// voices so clicking a lane reveals substance instead of a decorative label.

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
  voices: LaneVoice[];
  comments: LaneComment[];
}

export interface NarrativeLaneRef {
  id: string;
  signalRefs: readonly string[];
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
  commentLimit = 4,
  voiceLimit = 6
}: {
  lane: NarrativeLaneRef;
  packets: ReadonlyArray<EvidencePacket>;
  commentLimit?: number;
  voiceLimit?: number;
}): NarrativeLaneDetail {
  const codes = laneShortCodes(lane);
  const lanePackets = packets.filter((packet) => codes.has(packet.shortCode));

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
    const opText = (packet.opText || "").trim();
    if (opText) {
      ops.push({ shortCode: packet.shortCode, author: packet.opAuthor || "unknown", text: opText, likes: packet.opLikes, kind: "op" });
    }
    bumpVoice(packet.opAuthor, "op");
    for (const fragment of packet.replyFragments) {
      const text = (fragment.text || "").trim();
      if (text) {
        replies.push({ shortCode: packet.shortCode, author: fragment.author || "unknown", text, likes: fragment.likes, kind: "reply" });
        commentCount += 1;
      }
      bumpVoice(fragment.author, "reply");
    }
  }

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
    voices,
    comments
  };
}
