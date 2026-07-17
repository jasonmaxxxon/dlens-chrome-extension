import type { CommentShardReading, EvidencePacket, LensMemo, SignalReading, TopicAuditEpisode, TopicAuditReport, CrossTopicCalibration } from "../compare/topic-audit.ts";
import type { TopicAuditStageName } from "../compare/topic-audit.ts";
import {
  nextTopicAuditRunExpiry,
  type TopicAuditRunFailureKind,
  type TopicAuditRunOwner,
  type TopicAuditRunStatus
} from "../compare/topic-audit-envelope-contract.ts";
import { TOPIC_AUDIT_EPISODE_LIMIT } from "../compare/topic-audit-continuity.ts";

export const TOPIC_AUDIT_EVIDENCE_STORAGE_KEY = "dlens:v1:topic-audit-evidence";
export const TOPIC_AUDIT_MEMOS_STORAGE_KEY = "dlens:v1:topic-audit-memos";
export const TOPIC_AUDIT_REPORTS_STORAGE_KEY = "dlens:v1:topic-audit-reports";
export const TOPIC_AUDIT_EPISODES_STORAGE_KEY = "dlens:v1:topic-audit-episodes";
export const TOPIC_AUDIT_RUNS_STORAGE_KEY = "dlens:v1:topic-audit-runs";
export const CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY = "dlens:v1:cross-topic-calibrations";

let topicAuditMutationQueue: Promise<void> = Promise.resolve();

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export interface TopicAuditMemoBundle {
  auditRunId: string;
  inputHash: string;
  shardReadings?: CommentShardReading[];
  signalReadings: SignalReading[];
  lensMemos: LensMemo[];
}

interface TopicAuditRunCacheV1 {
  schemaVersion: 1;
  runs: Record<string, TopicAuditRunStatus>;
}

export interface TopicAuditCacheKeyInput {
  topicId: string;
  topicName?: string;
  signalIds: string[];
  itemStates: Array<{
    itemId: string;
    updatedAt: string | null;
    status: string;
  }>;
  promptVersion: string;
  stageName: string;
  modelKey?: string;
  shardPolicyVersion?: string;
}

export function isTopicAuditPublicationCompatible(
  report: TopicAuditReport | null | undefined,
  memos: TopicAuditMemoBundle | null | undefined,
  packets: readonly EvidencePacket[]
): boolean {
  return Boolean(
    report
    && memos
    && report.inputHash === memos.inputHash
    && report.auditRunId === memos.auditRunId
    && (packets.length === 0 || packets.every((packet) => (
      packet.inputHash === report.inputHash && packet.auditRunId === report.auditRunId
    )))
  );
}

function readObjectMap(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const TOPIC_AUDIT_STAGE_NAMES = new Set<TopicAuditStageName>([
  "comment-shard-reading",
  "p1-signal-reading",
  "lexicon",
  "narrative",
  "audience",
  "absence",
  "final"
]);
const TOPIC_AUDIT_RUN_FAILURE_KINDS = new Set<TopicAuditRunFailureKind>([
  "empty",
  "truncated",
  "schema_mismatch",
  "provider_error",
  "timeout",
  "interrupted"
]);
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function parseIsoTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function assertIsoTimestamp(value: unknown, field: string): number {
  const timestamp = parseIsoTimestamp(value);
  if (timestamp === null) {
    throw new Error(`Topic audit ${field} must be a valid ISO timestamp`);
  }
  return timestamp;
}

function isIsoDate(value: unknown): value is string {
  return parseIsoTimestamp(value) !== null;
}

function isTopicAuditRunStatus(value: unknown, topicId: string): value is TopicAuditRunStatus {
  const status = readObjectMap(value);
  return status.topicId === topicId
    && typeof status.sessionId === "string" && status.sessionId.length > 0
    && typeof status.requestId === "string" && status.requestId.length > 0
    && (status.state === "running" || status.state === "failed")
    && typeof status.stage === "string" && TOPIC_AUDIT_STAGE_NAMES.has(status.stage as TopicAuditStageName)
    && (status.failureKind === undefined || (
      typeof status.failureKind === "string"
      && TOPIC_AUDIT_RUN_FAILURE_KINDS.has(status.failureKind as TopicAuditRunFailureKind)
    ))
    && isIsoDate(status.startedAt)
    && isIsoDate(status.updatedAt)
    && isIsoDate(status.expiresAt);
}

async function readTopicAuditRunCache(storageArea: StorageAreaLike): Promise<Record<string, TopicAuditRunStatus>> {
  const raw = await storageArea.get(TOPIC_AUDIT_RUNS_STORAGE_KEY);
  const envelope = raw[TOPIC_AUDIT_RUNS_STORAGE_KEY];
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return {};
  }
  const { schemaVersion, runs } = envelope as Record<string, unknown>;
  if (schemaVersion !== 1 || !runs || typeof runs !== "object" || Array.isArray(runs)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(runs).filter(([topicId, status]) => isTopicAuditRunStatus(status, topicId))
  ) as Record<string, TopicAuditRunStatus>;
}

async function writeTopicAuditRunCache(
  storageArea: StorageAreaLike,
  runs: Record<string, TopicAuditRunStatus>
): Promise<void> {
  const cache: TopicAuditRunCacheV1 = { schemaVersion: 1, runs };
  await storageArea.set({ [TOPIC_AUDIT_RUNS_STORAGE_KEY]: cache });
}

function assertRunOwner(status: TopicAuditRunStatus | null, owner: TopicAuditRunOwner): TopicAuditRunStatus {
  const ownerNow = assertIsoTimestamp(owner.now, "owner.now");
  if (!status || status.requestId !== owner.requestId || status.state !== "running" || assertIsoTimestamp(status.expiresAt, "run.expiresAt") <= ownerNow) {
    throw new Error(`Topic audit request ${owner.requestId} no longer owns ${owner.topicId}`);
  }
  return status;
}

async function readStorageMap(storageArea: StorageAreaLike, key: string): Promise<Record<string, unknown>> {
  const raw = await storageArea.get(key);
  return readObjectMap(raw[key]);
}

async function writeStorageMap(storageArea: StorageAreaLike, key: string, map: Record<string, unknown>): Promise<void> {
  await storageArea.set({ [key]: map });
}

function enqueueTopicAuditMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = topicAuditMutationQueue.then(mutation);
  topicAuditMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function saveStorageMapEntry<T>(
  storageArea: StorageAreaLike,
  storageKey: string,
  entryKey: string,
  value: T
): Promise<Record<string, T>> {
  const map = await readStorageMap(storageArea, storageKey);
  const next = { ...map, [entryKey]: value } as Record<string, T>;
  await writeStorageMap(storageArea, storageKey, next);
  return next;
}

async function deleteStorageMapEntry(
  storageArea: StorageAreaLike,
  storageKey: string,
  entryKey: string
): Promise<Record<string, unknown>> {
  const map = { ...await readStorageMap(storageArea, storageKey) };
  delete map[entryKey];
  return map;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildTopicAuditCacheKey(input: TopicAuditCacheKeyInput): string {
  const payload = {
    topicId: input.topicId,
    topicName: input.topicName ?? "",
    signalIds: [...input.signalIds],
    itemStates: [...input.itemStates]
      .map((entry) => ({
        itemId: entry.itemId,
        updatedAt: entry.updatedAt ?? "",
        status: entry.status
      }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId)),
    promptVersion: input.promptVersion,
    stageName: input.stageName,
    modelKey: input.modelKey ?? "unknown",
    shardPolicyVersion: input.shardPolicyVersion ?? "unknown"
  };
  return `topic-audit:${stableHash(JSON.stringify(payload))}`;
}

export async function saveTopicAuditEvidence(
  storageArea: StorageAreaLike,
  topicId: string,
  packets: EvidencePacket[]
): Promise<Record<string, EvidencePacket[]>> {
  return enqueueTopicAuditMutation(() => saveStorageMapEntry(storageArea, TOPIC_AUDIT_EVIDENCE_STORAGE_KEY, topicId, packets));
}

export async function loadTopicAuditEvidence(
  storageArea: StorageAreaLike,
  topicId: string
): Promise<EvidencePacket[]> {
  const map = await readStorageMap(storageArea, TOPIC_AUDIT_EVIDENCE_STORAGE_KEY);
  const packets = map[topicId];
  return Array.isArray(packets) ? packets as EvidencePacket[] : [];
}

export async function saveTopicAuditMemos(
  storageArea: StorageAreaLike,
  topicId: string,
  bundle: TopicAuditMemoBundle
): Promise<Record<string, TopicAuditMemoBundle>> {
  return enqueueTopicAuditMutation(() => saveStorageMapEntry(storageArea, TOPIC_AUDIT_MEMOS_STORAGE_KEY, topicId, bundle));
}

export async function beginTopicAuditRun(
  storageArea: StorageAreaLike,
  status: TopicAuditRunStatus
): Promise<void> {
  await enqueueTopicAuditMutation(async () => {
    const runs = await readTopicAuditRunCache(storageArea);
    await writeTopicAuditRunCache(storageArea, { ...runs, [status.topicId]: status });
  });
}

export async function advanceTopicAuditRun(
  storageArea: StorageAreaLike,
  owner: TopicAuditRunOwner,
  stage: TopicAuditStageName
): Promise<TopicAuditRunStatus> {
  return enqueueTopicAuditMutation(async () => {
    const runs = await readTopicAuditRunCache(storageArea);
    const current = assertRunOwner(runs[owner.topicId] ?? null, owner);
    const next = {
      ...current,
      stage,
      updatedAt: owner.now,
      expiresAt: nextTopicAuditRunExpiry(owner.now)
    };
    await writeTopicAuditRunCache(storageArea, { ...runs, [owner.topicId]: next });
    return next;
  });
}

export async function failTopicAuditRun(
  storageArea: StorageAreaLike,
  owner: TopicAuditRunOwner,
  failureKind: TopicAuditRunFailureKind
): Promise<TopicAuditRunStatus> {
  return enqueueTopicAuditMutation(async () => {
    const runs = await readTopicAuditRunCache(storageArea);
    const current = assertRunOwner(runs[owner.topicId] ?? null, owner);
    const next = { ...current, state: "failed" as const, failureKind, updatedAt: owner.now };
    await writeTopicAuditRunCache(storageArea, { ...runs, [owner.topicId]: next });
    return next;
  });
}

export async function loadTopicAuditRun(
  storageArea: StorageAreaLike,
  topicId: string,
  now: string
): Promise<TopicAuditRunStatus | null> {
  const currentTime = assertIsoTimestamp(now, "now");
  return enqueueTopicAuditMutation(async () => {
    const runs = await readTopicAuditRunCache(storageArea);
    const current = runs[topicId] ?? null;
    if (!current || current.state !== "running" || assertIsoTimestamp(current.expiresAt, "run.expiresAt") > currentTime) {
      return current;
    }
    const expired = {
      ...current,
      state: "failed" as const,
      failureKind: "interrupted" as const,
      updatedAt: now
    };
    await writeTopicAuditRunCache(storageArea, { ...runs, [topicId]: expired });
    return expired;
  });
}

export async function saveTopicAuditMemosForRun(
  storageArea: StorageAreaLike,
  owner: TopicAuditRunOwner,
  bundle: TopicAuditMemoBundle
): Promise<Record<string, TopicAuditMemoBundle>> {
  return enqueueTopicAuditMutation(async () => {
    const runs = await readTopicAuditRunCache(storageArea);
    assertRunOwner(runs[owner.topicId] ?? null, owner);
    return saveStorageMapEntry(storageArea, TOPIC_AUDIT_MEMOS_STORAGE_KEY, owner.topicId, bundle);
  });
}

export async function loadTopicAuditMemos(
  storageArea: StorageAreaLike,
  topicId: string
): Promise<TopicAuditMemoBundle | null> {
  const map = await readStorageMap(storageArea, TOPIC_AUDIT_MEMOS_STORAGE_KEY);
  const bundle = map[topicId];
  return bundle && typeof bundle === "object" && !Array.isArray(bundle) ? bundle as TopicAuditMemoBundle : null;
}

export async function saveTopicAuditReport(
  storageArea: StorageAreaLike,
  report: TopicAuditReport
): Promise<Record<string, TopicAuditReport>> {
  return enqueueTopicAuditMutation(() => saveStorageMapEntry(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY, report.topicId, report));
}

export async function loadTopicAuditReport(
  storageArea: StorageAreaLike,
  topicId: string
): Promise<TopicAuditReport | null> {
  const map = await readStorageMap(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY);
  const report = map[topicId];
  return report && typeof report === "object" && !Array.isArray(report) ? report as TopicAuditReport : null;
}

export async function saveTopicAuditEpisodes(
  storageArea: StorageAreaLike,
  topicId: string,
  episodes: readonly TopicAuditEpisode[]
): Promise<Record<string, TopicAuditEpisode[]>> {
  return enqueueTopicAuditMutation(() => saveStorageMapEntry(
    storageArea,
    TOPIC_AUDIT_EPISODES_STORAGE_KEY,
    topicId,
    [...episodes].slice(-TOPIC_AUDIT_EPISODE_LIMIT)
  ));
}

export async function loadTopicAuditEpisodes(
  storageArea: StorageAreaLike,
  topicId: string
): Promise<TopicAuditEpisode[]> {
  const map = await readStorageMap(storageArea, TOPIC_AUDIT_EPISODES_STORAGE_KEY);
  const episodes = map[topicId];
  return Array.isArray(episodes) ? (episodes as TopicAuditEpisode[]).slice(-TOPIC_AUDIT_EPISODE_LIMIT) : [];
}

export async function publishTopicAuditReportAndEpisodes(
  storageArea: StorageAreaLike,
  report: TopicAuditReport,
  episodes: readonly TopicAuditEpisode[],
  owner?: TopicAuditRunOwner
): Promise<void> {
  await enqueueTopicAuditMutation(async () => {
    const reads: [Promise<Record<string, unknown>>, Promise<Record<string, unknown>>, Promise<Record<string, TopicAuditRunStatus>>?] = [
      readStorageMap(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY),
      readStorageMap(storageArea, TOPIC_AUDIT_EPISODES_STORAGE_KEY)
    ];
    if (owner) {
      reads.push(readTopicAuditRunCache(storageArea));
    }
    const [reportMap, episodeMap, runs] = await Promise.all(reads);
    const values: Record<string, unknown> = {
      [TOPIC_AUDIT_REPORTS_STORAGE_KEY]: { ...reportMap, [report.topicId]: report },
      [TOPIC_AUDIT_EPISODES_STORAGE_KEY]: {
        ...episodeMap,
        [report.topicId]: [...episodes].slice(-TOPIC_AUDIT_EPISODE_LIMIT)
      }
    };
    if (owner) {
      assertRunOwner(runs?.[owner.topicId] ?? null, owner);
      const nextRuns = { ...runs };
      delete nextRuns[owner.topicId];
      values[TOPIC_AUDIT_RUNS_STORAGE_KEY] = { schemaVersion: 1, runs: nextRuns } satisfies TopicAuditRunCacheV1;
    }
    await storageArea.set(values);
  });
}

export async function saveCrossTopicCalibration(
  storageArea: StorageAreaLike,
  calibration: CrossTopicCalibration
): Promise<Record<string, CrossTopicCalibration>> {
  return enqueueTopicAuditMutation(() => saveStorageMapEntry(
    storageArea,
    CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY,
    calibration.id,
    calibration
  ));
}

export async function loadCrossTopicCalibration(
  storageArea: StorageAreaLike,
  id: string
): Promise<CrossTopicCalibration | null> {
  const map = await readStorageMap(storageArea, CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY);
  const calibration = map[id];
  return calibration && typeof calibration === "object" && !Array.isArray(calibration) ? calibration as CrossTopicCalibration : null;
}

export async function clearTopicAuditStorageTopic(
  storageArea: StorageAreaLike,
  topicId: string
): Promise<void> {
  await enqueueTopicAuditMutation(async () => {
    const [evidenceMap, memoMap, reportMap, episodeMap, runs] = await Promise.all([
      deleteStorageMapEntry(storageArea, TOPIC_AUDIT_EVIDENCE_STORAGE_KEY, topicId),
      deleteStorageMapEntry(storageArea, TOPIC_AUDIT_MEMOS_STORAGE_KEY, topicId),
      deleteStorageMapEntry(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY, topicId),
      deleteStorageMapEntry(storageArea, TOPIC_AUDIT_EPISODES_STORAGE_KEY, topicId),
      readTopicAuditRunCache(storageArea)
    ]);
    const nextRuns = { ...runs };
    delete nextRuns[topicId];
    await storageArea.set({
      [TOPIC_AUDIT_EVIDENCE_STORAGE_KEY]: evidenceMap,
      [TOPIC_AUDIT_MEMOS_STORAGE_KEY]: memoMap,
      [TOPIC_AUDIT_REPORTS_STORAGE_KEY]: reportMap,
      [TOPIC_AUDIT_EPISODES_STORAGE_KEY]: episodeMap,
      [TOPIC_AUDIT_RUNS_STORAGE_KEY]: { schemaVersion: 1, runs: nextRuns } satisfies TopicAuditRunCacheV1
    });
  });
}
