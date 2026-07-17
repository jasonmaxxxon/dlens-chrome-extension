import type { TopicAuditStageName } from "./topic-audit.ts";
import type { AuditPromptEnvelope } from "./topic-audit-prompts.ts";

export type TopicAuditEnvelopeFailureKind = "empty" | "truncated" | "schema_mismatch";
export type TopicAuditRunFailureKind = TopicAuditEnvelopeFailureKind | "provider_error" | "timeout" | "interrupted";
export const TOPIC_AUDIT_RUN_LEASE_MS = 15 * 60_000;

export const TOPIC_AUDIT_ENVELOPE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    prose: { type: "string" },
    evidenceRefs: { type: "array", items: { type: "string" } },
    caveats: { type: "array", items: { type: "string" } },
    coverage: { type: ["string", "null"] },
    commentRefsInShard: { type: "array", items: { type: "string" } },
    patternCandidates: { type: "array", items: { type: "object" } },
    lexiconCandidates: { type: "array", items: { type: "string" } },
    displayHints: { type: ["object", "null"] },
    continuityReview: { type: ["object", "null"] }
  },
  required: ["prose", "evidenceRefs", "caveats"]
} as const;

export const TOPIC_AUDIT_REPAIR_SUFFIX = "上一個回應不符合 JSON envelope contract。請用相同 evidence 重新回答，只輸出一個完整 JSON object；prose、evidenceRefs、caveats 必須存在。不要加入解釋。";

export class TopicAuditEnvelopeError extends Error {
  constructor(
    readonly stage: TopicAuditStageName,
    readonly kind: TopicAuditEnvelopeFailureKind,
    readonly attempt: 1 | 2,
    readonly finishReason: string | undefined,
    readonly outputChars: number
  ) {
    super(`Topic audit ${stage} envelope ${kind} after attempt ${attempt}`);
    this.name = "TopicAuditEnvelopeError";
  }
}

export function topicAuditFailureCopy(kind: TopicAuditEnvelopeFailureKind): string {
  switch (kind) {
    case "empty":
      return "模型沒有回傳可用內容，已重試一次。";
    case "truncated":
      return "生成內容過長而未完整結束，已重試一次。";
    case "schema_mismatch":
      return "模型回傳格式不完整，已重試一次。";
  }
}

export interface TopicAuditEnvelopeResponseMeta {
  finishReason?: string;
}

export type TopicAuditEnvelopeParseResult =
  | { ok: true; envelope: AuditPromptEnvelope }
  | { ok: false; kind: TopicAuditEnvelopeFailureKind; finishReason?: string; outputChars: number };

export interface TopicAuditRunStatus {
  sessionId: string;
  topicId: string;
  requestId: string;
  state: "running" | "failed";
  stage: TopicAuditStageName;
  failureKind?: TopicAuditRunFailureKind;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface TopicAuditRunOwner {
  topicId: string;
  requestId: string;
  now: string;
}

export function nextTopicAuditRunExpiry(now: string): string {
  return new Date(Date.parse(now) + TOPIC_AUDIT_RUN_LEASE_MS).toISOString();
}
