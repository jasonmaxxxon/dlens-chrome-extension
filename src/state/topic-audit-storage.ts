import type { CommentShardReading, EvidencePacket, LensMemo, SignalReading, TopicAuditEpisode, TopicAuditReport, CrossTopicCalibration } from "../compare/topic-audit.ts";
import { TOPIC_AUDIT_EPISODE_LIMIT } from "../compare/topic-audit-continuity.ts";

export const TOPIC_AUDIT_EVIDENCE_STORAGE_KEY = "dlens:v1:topic-audit-evidence";
export const TOPIC_AUDIT_MEMOS_STORAGE_KEY = "dlens:v1:topic-audit-memos";
export const TOPIC_AUDIT_REPORTS_STORAGE_KEY = "dlens:v1:topic-audit-reports";
export const TOPIC_AUDIT_EPISODES_STORAGE_KEY = "dlens:v1:topic-audit-episodes";
export const CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY = "dlens:v1:cross-topic-calibrations";

let topicAuditPublicationQueue: Promise<void> = Promise.resolve();

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

async function readStorageMap(storageArea: StorageAreaLike, key: string): Promise<Record<string, unknown>> {
  const raw = await storageArea.get(key);
  return readObjectMap(raw[key]);
}

async function writeStorageMap(storageArea: StorageAreaLike, key: string, map: Record<string, unknown>): Promise<void> {
  await storageArea.set({ [key]: map });
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
  const map = await readStorageMap(storageArea, TOPIC_AUDIT_EVIDENCE_STORAGE_KEY);
  const next = { ...map, [topicId]: packets } as Record<string, EvidencePacket[]>;
  await writeStorageMap(storageArea, TOPIC_AUDIT_EVIDENCE_STORAGE_KEY, next);
  return next;
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
  const map = await readStorageMap(storageArea, TOPIC_AUDIT_MEMOS_STORAGE_KEY);
  const next = { ...map, [topicId]: bundle } as Record<string, TopicAuditMemoBundle>;
  await writeStorageMap(storageArea, TOPIC_AUDIT_MEMOS_STORAGE_KEY, next);
  return next;
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
  const map = await readStorageMap(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY);
  const next = { ...map, [report.topicId]: report } as Record<string, TopicAuditReport>;
  await writeStorageMap(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY, next);
  return next;
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
  const map = await readStorageMap(storageArea, TOPIC_AUDIT_EPISODES_STORAGE_KEY);
  const next = {
    ...map,
    [topicId]: [...episodes].slice(-TOPIC_AUDIT_EPISODE_LIMIT)
  } as Record<string, TopicAuditEpisode[]>;
  await writeStorageMap(storageArea, TOPIC_AUDIT_EPISODES_STORAGE_KEY, next);
  return next;
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
  episodes: readonly TopicAuditEpisode[]
): Promise<void> {
  const publication = topicAuditPublicationQueue.then(async () => {
    const [reportMap, episodeMap] = await Promise.all([
      readStorageMap(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY),
      readStorageMap(storageArea, TOPIC_AUDIT_EPISODES_STORAGE_KEY)
    ]);
    await storageArea.set({
      [TOPIC_AUDIT_REPORTS_STORAGE_KEY]: { ...reportMap, [report.topicId]: report },
      [TOPIC_AUDIT_EPISODES_STORAGE_KEY]: {
        ...episodeMap,
        [report.topicId]: [...episodes].slice(-TOPIC_AUDIT_EPISODE_LIMIT)
      }
    });
  });
  topicAuditPublicationQueue = publication.catch(() => undefined);
  await publication;
}

export async function saveCrossTopicCalibration(
  storageArea: StorageAreaLike,
  calibration: CrossTopicCalibration
): Promise<Record<string, CrossTopicCalibration>> {
  const map = await readStorageMap(storageArea, CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY);
  const next = { ...map, [calibration.id]: calibration } as Record<string, CrossTopicCalibration>;
  await writeStorageMap(storageArea, CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY, next);
  return next;
}

export async function loadCrossTopicCalibration(
  storageArea: StorageAreaLike,
  id: string
): Promise<CrossTopicCalibration | null> {
  const map = await readStorageMap(storageArea, CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY);
  const calibration = map[id];
  return calibration && typeof calibration === "object" && !Array.isArray(calibration) ? calibration as CrossTopicCalibration : null;
}
