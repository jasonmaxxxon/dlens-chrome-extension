import type { CommentShardReading, EvidencePacket, ReactionPattern } from "../compare/topic-audit.ts";

export interface ReactionPatternFullListComment {
  ref: string;
  author: string;
  text: string;
  likes: number | null;
  mergedRefs: string[];
}

export interface ReactionPatternFullListGroup {
  shortCode: string;
  sourceTitle: string;
  comments: ReactionPatternFullListComment[];
}

export interface ReactionPatternFullList {
  path: "true-full-list" | "fallback";
  traceLabel: string;
  resolvableCount: number;
  headlineTotal: number;
  groups: ReactionPatternFullListGroup[];
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

function shortCodeFromRef(ref: string): string {
  return ref.split(".")[0]?.trim() ?? "";
}

function normalizeNearDuplicate(text: string): string {
  return text
    .replace(/^reply\s+to\s+@\S+\s*/i, "")
    .replace(/^回覆\s+@\S+\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function candidateRefs(candidate: CommentShardReading["patternCandidates"][number]): string[] {
  return orderedUnique([
    ...candidate.supportRefs,
    ...candidate.counterRefs,
    ...candidate.representativeRefs,
    ...candidate.counterRepresentativeRefs
  ]);
}

function matchingShardRefs(pattern: ReactionPattern, shardReadings: ReadonlyArray<CommentShardReading>): string[] {
  const patternSupport = new Set(pattern.supportRefs);
  const refs: string[] = [];
  for (const reading of shardReadings) {
    for (const candidate of reading.patternCandidates) {
      const overlaps = candidate.supportRefs.some((ref) => patternSupport.has(ref));
      if (!overlaps) continue;
      refs.push(...candidateRefs(candidate));
    }
  }
  return orderedUnique(refs);
}

function fallbackRefs(pattern: ReactionPattern): string[] {
  return orderedUnique([
    ...pattern.representativeRefs,
    ...pattern.counterRepresentativeRefs,
    ...pattern.supportRefs,
    ...pattern.counterRefs
  ]);
}

function resolveComment(ref: string, packetsByShortCode: Map<string, EvidencePacket>): ReactionPatternFullListComment | null {
  const shortCode = shortCodeFromRef(ref);
  const packet = packetsByShortCode.get(shortCode);
  if (!packet) return null;
  const fragment = packet.replyFragments.find((entry) => entry.ref === ref);
  const text = fragment?.text.trim() ?? "";
  if (!fragment || !text) return null;
  return {
    ref,
    author: fragment.author || "unknown",
    text,
    likes: fragment.likes,
    mergedRefs: []
  };
}

function groupResolvedComments({
  refs,
  packets
}: {
  refs: ReadonlyArray<string>;
  packets: ReadonlyArray<EvidencePacket>;
}): ReactionPatternFullListGroup[] {
  const packetsByShortCode = new Map(packets.map((packet) => [packet.shortCode, packet]));
  const groups = new Map<string, ReactionPatternFullListGroup>();
  const normalizedToComment = new Map<string, ReactionPatternFullListComment>();
  for (const ref of refs) {
    const comment = resolveComment(ref, packetsByShortCode);
    if (!comment) continue;
    const shortCode = shortCodeFromRef(ref);
    const normalized = `${shortCode}:${normalizeNearDuplicate(comment.text)}`;
    const existing = normalizedToComment.get(normalized);
    if (existing) {
      existing.mergedRefs.push(comment.ref);
      continue;
    }
    normalizedToComment.set(normalized, comment);
    const packet = packetsByShortCode.get(shortCode);
    const group = groups.get(shortCode) ?? {
      shortCode,
      sourceTitle: packet?.opText.replace(/\s+/g, " ").trim() || `${shortCode}.OP`,
      comments: []
    };
    group.comments.push(comment);
    groups.set(shortCode, group);
  }
  return [...groups.values()].filter((group) => group.comments.length > 0);
}

export function buildReactionPatternFullList({
  pattern,
  packets,
  shardReadings
}: {
  pattern: ReactionPattern;
  packets: ReadonlyArray<EvidencePacket>;
  shardReadings: ReadonlyArray<CommentShardReading>;
}): ReactionPatternFullList {
  const shardRefs = matchingShardRefs(pattern, shardReadings);
  const path: ReactionPatternFullList["path"] = shardRefs.length > 0 ? "true-full-list" : "fallback";
  const groups = groupResolvedComments({
    refs: path === "true-full-list" ? shardRefs : fallbackRefs(pattern),
    packets
  });
  const resolvableCount = groups.reduce((sum, group) => sum + group.comments.length, 0);
  return {
    path,
    traceLabel: `可追 ${resolvableCount} / 全量 ${pattern.nComments}`,
    resolvableCount,
    headlineTotal: pattern.nComments,
    groups
  };
}
