import type { TopicAuditStageName } from "./topic-audit.ts";
import type { AuditPromptEnvelope } from "./topic-audit-prompts.ts";

export type TopicAuditEnvelopeFailureKind = "empty" | "truncated" | "schema_mismatch";
export type TopicAuditRunFailureKind = TopicAuditEnvelopeFailureKind | "provider_error" | "timeout" | "interrupted";
export const TOPIC_AUDIT_RUN_LEASE_MS = 15 * 60_000;

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
