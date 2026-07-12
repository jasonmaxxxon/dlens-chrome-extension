import type { EvidencePacket, ReplyFragment } from "./topic-audit.ts";
import { extractTopicEvidenceRefs } from "./topic-audit-evidence.ts";

export type TopicAuditValidationSeverity = "FAIL" | "WEAK" | "SCOPE";
export type TopicAuditValidationKind =
  | "missing-ref"
  | "unknown-ref"
  | "likes-mismatch"
  | "queued-as-zero"
  | "thin-evidence"
  | "ungrounded-generalization"
  | "overstrong-platform-claim";

export interface TopicAuditValidationFlag {
  severity: TopicAuditValidationSeverity;
  kind: TopicAuditValidationKind;
  section: string;
  claim: string;
  reason: string;
  evidenceRefs: string[];
}

export interface TopicAuditDraftValidationInput {
  packets: EvidencePacket[];
  reportMarkdown: string;
}

export interface CrossTopicCalibrationValidationInput {
  topicCount: number;
  calibrationMarkdown: string;
}

function lineSection(line: string): string {
  const match = line.match(/^(§\d+)/);
  return match?.[1] ?? "unknown";
}

function collectRefs(line: string): string[] {
  return extractTopicEvidenceRefs(line);
}

function buildRefIndex(packets: EvidencePacket[]): Map<string, { likes: number | null; text: string }> {
  const index = new Map<string, { likes: number | null; text: string }>();
  for (const packet of packets) {
    index.set(`${packet.shortCode}.OP`, { likes: packet.opLikes, text: packet.opText });
    for (const fragment of packet.replyFragments) {
      index.set(fragment.ref, { likes: fragment.likes, text: fragment.text });
    }
  }
  return index;
}

function firstKnownRef(refs: string[], refIndex: Map<string, { likes: number | null; text: string }>): string | null {
  return refs.find((ref) => refIndex.has(ref)) ?? null;
}

function makeFlag(
  severity: TopicAuditValidationSeverity,
  kind: TopicAuditValidationKind,
  claim: string,
  reason: string,
  evidenceRefs: string[] = []
): TopicAuditValidationFlag {
  return {
    severity,
    kind,
    section: lineSection(claim),
    claim,
    reason,
    evidenceRefs
  };
}

function looksLikeGeneralization(line: string): boolean {
  return /(完全沒有|零出現|所有|整個 discourse|整個議題|platform affordance|文化通則|沒有希望)/i.test(line);
}

function looksLikeQueuedAsZero(line: string): boolean {
  return /queued\s*當\s*0|unknown\s*當\s*0|當\s*0/.test(line);
}

function looksLikeThinPattern(line: string): boolean {
  return /(穩定 pattern|穩定模式|systematic|系統性).*(n\s*=\s*1|只有\s*1|單一)/i.test(line)
    || /(n\s*=\s*1|只有\s*1|單一).*(穩定 pattern|穩定模式|systematic|系統性)/i.test(line);
}

function findLikesClaim(line: string): number | null {
  const match = line.match(/(\d[\d,]*)\s*(?:likes|like|讚)/i);
  if (!match) {
    return null;
  }
  const value = Number(match[1]?.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function validateLine(
  line: string,
  refIndex: Map<string, { likes: number | null; text: string }>
): TopicAuditValidationFlag[] {
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }
  const refs = collectRefs(trimmed);
  const flags: TopicAuditValidationFlag[] = [];

  for (const ref of refs) {
    if (!refIndex.has(ref)) {
      flags.push(makeFlag("FAIL", "unknown-ref", trimmed, `引用 ${ref} 不存在於 P0 evidence。`, [ref]));
    }
  }

  const knownRef = firstKnownRef(refs, refIndex);
  const likesClaim = findLikesClaim(trimmed);
  if (knownRef && likesClaim !== null) {
    const actual = refIndex.get(knownRef)?.likes ?? null;
    if (actual !== null && actual !== likesClaim) {
      flags.push(makeFlag(
        "FAIL",
        "likes-mismatch",
        trimmed,
        `引用 ${knownRef} 的 likes 是 ${actual}，不是 ${likesClaim}。`,
        [knownRef]
      ));
    }
  }

  if (looksLikeQueuedAsZero(trimmed)) {
    flags.push(makeFlag(
      "FAIL",
      "queued-as-zero",
      trimmed,
      "queued/unknown 不可當 0；必須排除母數或標明不可得。",
      refs
    ));
  }

  if (looksLikeThinPattern(trimmed)) {
    flags.push(makeFlag(
      "WEAK",
      "thin-evidence",
      trimmed,
      "n=1 或單一 evidence 不足以支撐穩定 pattern，須降調。",
      refs
    ));
  }

  if (refs.length === 0 && looksLikeGeneralization(trimmed)) {
    flags.push(makeFlag(
      "SCOPE",
      "ungrounded-generalization",
      trimmed,
      "這類 generalization 沒有掛 signal id；若只是 captured evidence 內觀察，必須限定 scope。",
      refs
    ));
  }

  return flags;
}

export function validateTopicAuditDraft(input: TopicAuditDraftValidationInput): TopicAuditValidationFlag[] {
  const refIndex = buildRefIndex(input.packets);
  return input.reportMarkdown
    .split(/\n+/)
    .flatMap((line) => validateLine(line, refIndex));
}

export function validateCrossTopicCalibrationDraft(input: CrossTopicCalibrationValidationInput): TopicAuditValidationFlag[] {
  const text = input.calibrationMarkdown.trim();
  if (!text) {
    return [];
  }
  if (input.topicCount <= 2 && /(證實|已經證實|proved|確定).{0,24}(platform affordance|平台)/i.test(text)) {
    return [
      makeFlag(
        "WEAK",
        "overstrong-platform-claim",
        text,
        "2 個 topic 只能說 strongly consistent with platform affordance，不能說證實。",
        []
      )
    ];
  }
  return [];
}

export const topicAuditValidatorTestables = {
  buildRefIndex,
  collectRefs
};
