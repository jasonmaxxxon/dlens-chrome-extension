import { buildTopicEvidenceAnchors, extractTopicEvidenceRefs } from "./topic-audit-evidence.ts";
import type {
  EvidencePacket,
  LensMemo,
  NarrativeAnchorRef,
  NarrativeClaim,
  NarrativeContinuityReview,
  NarrativeOpenQuestion,
  NarrativeVoice,
  TopicAuditFingerprints,
  TopicAuditEpisode,
  TopicNarrativeState
} from "./topic-audit.ts";
import type { Topic } from "../state/types.ts";

export const TOPIC_NARRATIVE_STATE_VERSION = "topic-narrative-state.v1" as const;
export const TOPIC_NARRATIVE_STATE_MAX_CHARS = 4_096;
export const TOPIC_NARRATIVE_CLAIM_LIMIT = 6;
export const TOPIC_NARRATIVE_VOICE_LIMIT = 4;
export const TOPIC_NARRATIVE_QUESTION_LIMIT = 4;
export const TOPIC_AUDIT_EPISODE_LIMIT = 24;

const STATEMENT_MAX_CHARS = 160;
const RATIONALE_MAX_CHARS = 120;
const LABEL_MAX_CHARS = 80;
const POSITION_MAX_CHARS = 160;
const QUESTION_MAX_CHARS = 160;
const EVIDENCE_LIMIT = 3;

export interface MaterializeNarrativeStateInput {
  topicId: string;
  auditRunId: string;
  packets: readonly EvidencePacket[];
  fingerprints: TopicAuditFingerprints;
  generatedAt: string;
  previousState?: TopicNarrativeState | null;
  review?: NarrativeContinuityReview | null;
}

export interface EvolveTopicAuditEpisodesInput {
  topicId: string;
  auditRunId: string;
  inputHash: string;
  generatedAt: string;
  state: TopicNarrativeState;
  packets: readonly EvidencePacket[];
  audienceMemo?: LensMemo | null;
}

function normalizeText(value: string, field: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  if (normalized.length > maxChars) {
    throw new Error(`${field} exceeds ${maxChars} chars`);
  }
  if (extractTopicEvidenceRefs(normalized).length > 0) {
    throw new Error(`${field} must not persist display evidence aliases`);
  }
  return normalized;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

export function buildNarrativeAnchorId(stableKey: string): string {
  return `a_${fnv1a64(stableKey)}`;
}

export function buildTopicAuditRunId(
  fingerprints: TopicAuditFingerprints,
  executionNonce = ""
): string {
  return `audit_${fnv1a64(JSON.stringify({ fingerprints, executionNonce }))}`;
}

function resolveEvidenceRefs(
  refs: readonly string[],
  anchorByDisplayRef: ReadonlyMap<string, ReturnType<typeof buildTopicEvidenceAnchors>[number]>,
  field: string,
  options: { allowEmpty?: boolean } = {}
): NarrativeAnchorRef[] {
  const uniqueRefs = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
  if (uniqueRefs.length > EVIDENCE_LIMIT) {
    throw new Error(`${field} exceeds ${EVIDENCE_LIMIT} evidence refs`);
  }
  if (!options.allowEmpty && uniqueRefs.length === 0) {
    throw new Error(`${field} requires current evidence`);
  }
  return uniqueRefs.map((ref) => {
    const anchor = anchorByDisplayRef.get(ref);
    if (!anchor) {
      throw new Error(`${field} contains unknown evidence ref: ${ref}`);
    }
    return {
      anchorId: buildNarrativeAnchorId(anchor.stableKey),
      displayRef: anchor.displayRef,
      stability: anchor.stability
    };
  });
}

function assertPriorClaimsAccounted(
  previousState: TopicNarrativeState | null,
  review: NarrativeContinuityReview
): Map<string, NarrativeClaim> {
  const activePrior = new Map(
    (previousState?.claims ?? [])
      .filter((claim) => claim.trajectory !== "retired")
      .map((claim) => [claim.id, claim])
  );
  const seen = new Set<string>();
  for (const carried of review.carriedClaims) {
    if (seen.has(carried.claimId)) {
      throw new Error(`duplicate carried claim id: ${carried.claimId}`);
    }
    seen.add(carried.claimId);
    if (!activePrior.has(carried.claimId)) {
      throw new Error(`unknown carried claim id: ${carried.claimId}`);
    }
  }
  if (seen.size !== activePrior.size || [...activePrior.keys()].some((id) => !seen.has(id))) {
    throw new Error("continuity review must account for every active prior claim exactly once");
  }
  return activePrior;
}

function emptyReview(): NarrativeContinuityReview {
  return { carriedClaims: [], newClaims: [], voices: [], openQuestions: [] };
}

export function materializeNarrativeState(input: MaterializeNarrativeStateInput): TopicNarrativeState {
  const previousState = input.previousState ?? null;
  const review = input.review ?? emptyReview();
  const activePrior = assertPriorClaimsAccounted(previousState, review);
  const anchors = buildTopicEvidenceAnchors(input.packets);
  const anchorByDisplayRef = new Map(anchors.map((anchor) => [anchor.displayRef, anchor]));
  const nextIds = previousState
    ? { ...previousState.nextIds }
    : { claim: 1, voice: 1, question: 1 };

  const claims: NarrativeClaim[] = review.carriedClaims.map((carried) => {
    const prior = activePrior.get(carried.claimId)!;
    const allowEmpty = carried.outcome === "retired" && carried.notReobserved === true;
    const evidence = resolveEvidenceRefs(
      carried.evidenceRefs,
      anchorByDisplayRef,
      `claim ${carried.claimId}`,
      { allowEmpty }
    );
    const statement = normalizeText(carried.statement || prior.statement, "claim statement", STATEMENT_MAX_CHARS);
    const rationale = normalizeText(carried.rationale, "claim rationale", RATIONALE_MAX_CHARS);
    if (carried.outcome === "stable" && statement !== prior.statement) {
      throw new Error(`stable claim ${carried.claimId} must keep its statement`);
    }
    if (carried.outcome === "strengthened") {
      const priorAnchorIds = new Set(prior.evidence.map((anchor) => anchor.anchorId));
      if (!evidence.some((anchor) => !priorAnchorIds.has(anchor.anchorId))) {
        throw new Error(`strengthened claim ${carried.claimId} requires a new evidence anchor`);
      }
    }
    return {
      id: prior.id,
      statement,
      rationale,
      trajectory: carried.outcome,
      evidence
    };
  });

  for (const candidate of review.newClaims) {
    claims.push({
      id: `claim-${nextIds.claim++}`,
      statement: normalizeText(candidate.statement, "claim statement", STATEMENT_MAX_CHARS),
      rationale: normalizeText(candidate.rationale, "claim rationale", RATIONALE_MAX_CHARS),
      trajectory: "new",
      evidence: resolveEvidenceRefs(candidate.evidenceRefs, anchorByDisplayRef, "new claim")
    });
  }
  if (claims.length > TOPIC_NARRATIVE_CLAIM_LIMIT) {
    throw new Error(`narrative state exceeds ${TOPIC_NARRATIVE_CLAIM_LIMIT} claims`);
  }

  const voices: NarrativeVoice[] = review.voices.map((voice) => ({
    id: `voice-${nextIds.voice++}`,
    label: normalizeText(voice.label, "voice label", LABEL_MAX_CHARS),
    position: normalizeText(voice.position, "voice position", POSITION_MAX_CHARS),
    evidence: resolveEvidenceRefs(voice.evidenceRefs, anchorByDisplayRef, "voice")
  }));
  if (voices.length > TOPIC_NARRATIVE_VOICE_LIMIT) {
    throw new Error(`narrative state exceeds ${TOPIC_NARRATIVE_VOICE_LIMIT} voices`);
  }

  const openQuestions: NarrativeOpenQuestion[] = review.openQuestions.map((question) => ({
    id: `question-${nextIds.question++}`,
    question: normalizeText(question, "open question", QUESTION_MAX_CHARS)
  }));
  if (openQuestions.length > TOPIC_NARRATIVE_QUESTION_LIMIT) {
    throw new Error(`narrative state exceeds ${TOPIC_NARRATIVE_QUESTION_LIMIT} open questions`);
  }

  const state: TopicNarrativeState = {
    version: TOPIC_NARRATIVE_STATE_VERSION,
    topicId: input.topicId,
    auditRunId: input.auditRunId,
    ...(previousState ? { previousAuditRunId: previousState.auditRunId } : {}),
    fingerprints: input.fingerprints,
    nextIds,
    claims,
    voices,
    openQuestions,
    updatedAt: input.generatedAt
  };
  const serializedLength = JSON.stringify(state).length;
  if (serializedLength > TOPIC_NARRATIVE_STATE_MAX_CHARS) {
    throw new Error(`narrative state exceeds ${TOPIC_NARRATIVE_STATE_MAX_CHARS} chars`);
  }
  return state;
}

function sameFingerprints(left: TopicAuditFingerprints, right: TopicAuditFingerprints): boolean {
  return left.evidence === right.evidence
    && left.definition === right.definition
    && left.pipeline === right.pipeline;
}

function capturedRange(packets: readonly EvidencePacket[]): TopicAuditEpisode["capturedRange"] {
  const values = packets.map((packet) => packet.capturedAt).filter(Boolean).sort();
  return values.length > 0 ? { from: values[0]!, to: values[values.length - 1]! } : undefined;
}

function reactionSnapshot(audienceMemo: LensMemo | null | undefined): TopicAuditEpisode["reactionSnapshot"] {
  return {
    ...(audienceMemo?.displayHints?.reactionCoverage
      ? { coverage: audienceMemo.displayHints.reactionCoverage }
      : {}),
    patterns: (audienceMemo?.displayHints?.reactionPatterns ?? []).map((pattern) => ({
      id: pattern.id,
      label: pattern.label,
      nComments: pattern.nComments,
      nAuthors: pattern.nAuthors,
      coverageDenominator: pattern.coverageDenominator
    }))
  };
}

function episodeDelta(
  state: TopicNarrativeState,
  transition: TopicAuditEpisode["transition"]
): TopicAuditEpisode["delta"] {
  if (transition === "rebase") {
    return [];
  }
  return state.claims.flatMap((claim) => claim.trajectory === "stable"
    ? []
    : [{
        claimId: claim.id,
        trajectory: claim.trajectory,
        statement: claim.statement,
        rationale: claim.rationale,
        evidence: claim.evidence
      }]);
}

function reviseEpisodeDelta(
  previous: readonly TopicAuditEpisode["delta"][number][],
  state: TopicNarrativeState
): TopicAuditEpisode["delta"] {
  const deltaByClaimId = new Map<string, TopicAuditEpisode["delta"][number]>(
    previous.map((entry) => [entry.claimId, entry])
  );

  for (const claim of state.claims) {
    const trajectory = claim.trajectory === "stable"
      ? deltaByClaimId.get(claim.id)?.trajectory
      : claim.trajectory;
    if (!trajectory) {
      continue;
    }
    deltaByClaimId.set(claim.id, {
      claimId: claim.id,
      trajectory,
      statement: claim.statement,
      rationale: claim.rationale,
      evidence: claim.evidence
    });
  }

  return [...deltaByClaimId.values()];
}

export function evolveTopicAuditEpisodes(
  existing: readonly TopicAuditEpisode[],
  input: EvolveTopicAuditEpisodesInput
): TopicAuditEpisode[] {
  const latest = existing[existing.length - 1];
  const range = capturedRange(input.packets);
  const reactions = reactionSnapshot(input.audienceMemo);
  if (latest && sameFingerprints(latest.fingerprints, input.state.fingerprints)) {
    const replacement: TopicAuditEpisode = {
      ...latest,
      auditRunId: input.auditRunId,
      inputHash: input.inputHash,
      generatedAt: input.generatedAt,
      sourceCount: input.packets.length,
      ...(range ? { capturedRange: range } : {}),
      stateSnapshot: input.state,
      delta: reviseEpisodeDelta(latest.delta, input.state),
      reactionSnapshot: reactions
    };
    return [...existing.slice(0, -1), replacement].slice(-TOPIC_AUDIT_EPISODE_LIMIT);
  }

  const transition: TopicAuditEpisode["transition"] = !latest
    ? "first"
    : latest.fingerprints.definition !== input.state.fingerprints.definition
      || latest.fingerprints.pipeline !== input.state.fingerprints.pipeline
      ? "rebase"
      : "advance";
  const episode: TopicAuditEpisode = {
    version: "topic-audit-episode.v1",
    id: `episode_${fnv1a64(JSON.stringify({
      topicId: input.topicId,
      auditRunId: input.auditRunId,
      generatedAt: input.generatedAt,
      fingerprints: input.state.fingerprints
    }))}`,
    topicId: input.topicId,
    auditRunId: input.auditRunId,
    inputHash: input.inputHash,
    generatedAt: input.generatedAt,
    transition,
    ...(latest ? { previousEpisodeId: latest.id } : {}),
    fingerprints: input.state.fingerprints,
    sourceCount: input.packets.length,
    ...(range ? { capturedRange: range } : {}),
    stateSnapshot: input.state,
    delta: episodeDelta(input.state, transition),
    reactionSnapshot: reactions
  };
  return [...existing, episode].slice(-TOPIC_AUDIT_EPISODE_LIMIT);
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest), (entry) => entry.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export async function buildTopicAuditFingerprints(input: {
  topic: Topic;
  packets: readonly EvidencePacket[];
  pipelineInputHash: string;
  modelKey: string;
  promptVersions: Record<string, string>;
  shardPolicyVersion: string;
}): Promise<TopicAuditFingerprints> {
  const evidencePayload = input.packets
    .map((packet) => ({
      signalId: packet.signalId,
      contentHash: packet.signalIdentity?.contentHash ?? "missing"
    }))
    .sort((left, right) => left.signalId.localeCompare(right.signalId));
  const definitionPayload = {
    topicId: input.topic.id,
    name: input.topic.name,
    description: input.topic.description ?? "",
    context: input.topic.context ?? null
  };
  const pipelinePayload = {
    modelKey: input.modelKey,
    promptVersions: input.promptVersions,
    shardPolicyVersion: input.shardPolicyVersion,
    continuityVersion: TOPIC_NARRATIVE_STATE_VERSION
  };
  const [evidence, definition, pipeline] = await Promise.all([
    sha256(JSON.stringify(evidencePayload)),
    sha256(JSON.stringify(definitionPayload)),
    sha256(JSON.stringify(pipelinePayload))
  ]);
  return { evidence, definition, pipeline };
}
