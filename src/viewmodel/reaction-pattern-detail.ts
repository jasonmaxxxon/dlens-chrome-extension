import type { EvidencePacket, ReactionPattern } from "../compare/topic-audit.ts";

export interface ReactionPatternComment {
  ref: string;
  shortCode: string;
  author: string;
  text: string;
  likes: number | null;
  kind: "representative" | "counter";
}

export interface ReactionPatternDetail {
  patternId: string;
  representativeComments: ReactionPatternComment[];
  counterComments: ReactionPatternComment[];
  missingRefs: string[];
}

function packetByShortCode(packets: ReadonlyArray<EvidencePacket>): Map<string, EvidencePacket> {
  return new Map(packets.map((packet) => [packet.shortCode, packet]));
}

function resolveEvidenceRef(
  ref: string,
  packetsByShortCode: Map<string, EvidencePacket>,
  kind: ReactionPatternComment["kind"]
): ReactionPatternComment | null {
  const [shortCode, fragmentCode] = ref.split(".");
  if (!shortCode || !fragmentCode) return null;
  const packet = packetsByShortCode.get(shortCode);
  if (!packet) return null;
  if (fragmentCode === "OP") {
    const text = packet.opText.trim();
    if (!text) return null;
    return {
      ref,
      shortCode,
      author: packet.opAuthor || "unknown",
      text,
      likes: packet.opLikes,
      kind
    };
  }
  const fragment = packet.replyFragments.find((entry) => entry.ref === ref);
  const text = fragment?.text.trim() ?? "";
  if (!fragment || !text) return null;
  return {
    ref,
    shortCode,
    author: fragment.author || "unknown",
    text,
    likes: fragment.likes,
    kind
  };
}

function orderedUnique(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function resolveRefs({
  refs,
  packetsByShortCode,
  kind,
  limit
}: {
  refs: ReadonlyArray<string>;
  packetsByShortCode: Map<string, EvidencePacket>;
  kind: ReactionPatternComment["kind"];
  limit: number;
}): { comments: ReactionPatternComment[]; missingRefs: string[] } {
  const comments: ReactionPatternComment[] = [];
  const missingRefs: string[] = [];
  for (const ref of orderedUnique(refs)) {
    const resolved = resolveEvidenceRef(ref, packetsByShortCode, kind);
    if (resolved) {
      comments.push(resolved);
    } else {
      missingRefs.push(ref);
    }
    if (comments.length >= limit) break;
  }
  return { comments, missingRefs };
}

export function buildReactionPatternDetail({
  pattern,
  packets,
  representativeLimit = 3,
  counterLimit = 2
}: {
  pattern: ReactionPattern;
  packets: ReadonlyArray<EvidencePacket>;
  representativeLimit?: number;
  counterLimit?: number;
}): ReactionPatternDetail {
  const packetsByShortCode = packetByShortCode(packets);
  const representativeRefs = pattern.representativeRefs.length
    ? pattern.representativeRefs
    : pattern.supportRefs;
  const counterRefs = pattern.counterRepresentativeRefs.length
    ? pattern.counterRepresentativeRefs
    : pattern.counterRefs;
  const representatives = resolveRefs({
    refs: representativeRefs,
    packetsByShortCode,
    kind: "representative",
    limit: representativeLimit
  });
  const counters = resolveRefs({
    refs: counterRefs,
    packetsByShortCode,
    kind: "counter",
    limit: counterLimit
  });
  return {
    patternId: pattern.id,
    representativeComments: representatives.comments,
    counterComments: counters.comments,
    missingRefs: [...representatives.missingRefs, ...counters.missingRefs]
  };
}
