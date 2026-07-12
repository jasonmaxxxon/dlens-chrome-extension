import type { EvidencePacket, ReplyFragment } from "./topic-audit.ts";

const TOPIC_EVIDENCE_REF_PATTERN = /(?<![\p{L}\p{N}_])S\d+\.(?:OPC\d+|OPR\d+|R\d+|P\d+|OP)(?![\p{L}\p{N}_])/gu;

export interface TopicEvidenceAnchor {
  stableKey: string;
  displayRef: string;
  topicId: string;
  signalId: string;
  role: ReplyFragment["role"] | "op";
  stability: "stable" | "synthetic";
  commentId?: string;
  sourceId?: string;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fragmentAnchorBase(fragment: ReplyFragment): { key: string; stability: TopicEvidenceAnchor["stability"] } {
  const sourceId = fragment.sourceId?.trim();
  if (sourceId) {
    return { key: `source:${sourceId}`, stability: "stable" };
  }
  const commentId = fragment.commentId?.trim();
  if (commentId && fragment.commentIdSource !== "fallback") {
    return { key: `comment:${commentId}`, stability: "stable" };
  }
  return {
    key: `synthetic:${stableHash(JSON.stringify({
      role: fragment.role,
      author: fragment.author,
      text: fragment.text,
      parentId: fragment.parentId ?? "",
      timeToken: fragment.timeToken ?? ""
    }))}`,
    stability: "synthetic"
  };
}

export function extractTopicEvidenceRefs(text: string): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const match of text.matchAll(TOPIC_EVIDENCE_REF_PATTERN)) {
    const ref = match[0];
    if (seen.has(ref)) {
      continue;
    }
    seen.add(ref);
    refs.push(ref);
  }
  return refs;
}

export function buildTopicEvidenceAnchors(packets: readonly EvidencePacket[]): TopicEvidenceAnchor[] {
  const anchors: TopicEvidenceAnchor[] = [];
  for (const packet of packets) {
    anchors.push({
      stableKey: `signal:${packet.signalId}:op`,
      displayRef: `${packet.shortCode}.OP`,
      topicId: packet.topicId,
      signalId: packet.signalId,
      role: "op",
      stability: "stable"
    });
    const occurrenceByBase = new Map<string, number>();
    for (const fragment of packet.replyFragments) {
      const base = fragmentAnchorBase(fragment);
      const occurrence = occurrenceByBase.get(base.key) ?? 0;
      occurrenceByBase.set(base.key, occurrence + 1);
      const disambiguatedKey = occurrence === 0 ? base.key : `${base.key}:${occurrence + 1}`;
      anchors.push({
        stableKey: `signal:${packet.signalId}:${disambiguatedKey}`,
        displayRef: fragment.ref,
        topicId: packet.topicId,
        signalId: packet.signalId,
        role: fragment.role,
        stability: base.stability,
        ...(fragment.commentId?.trim() && fragment.commentIdSource !== "fallback" ? { commentId: fragment.commentId.trim() } : {}),
        ...(fragment.sourceId?.trim() ? { sourceId: fragment.sourceId.trim() } : {})
      });
    }
  }
  return anchors;
}
