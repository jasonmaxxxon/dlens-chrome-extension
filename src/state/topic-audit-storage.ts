import type { EvidencePacket, LensMemo, SignalReading, TopicAuditReport, CrossTopicCalibration } from "../compare/topic-audit.ts";

export const TOPIC_AUDIT_EVIDENCE_STORAGE_KEY = "dlens:v1:topic-audit-evidence";
export const TOPIC_AUDIT_MEMOS_STORAGE_KEY = "dlens:v1:topic-audit-memos";
export const TOPIC_AUDIT_REPORTS_STORAGE_KEY = "dlens:v1:topic-audit-reports";
export const CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY = "dlens:v1:cross-topic-calibrations";

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export interface TopicAuditMemoBundle {
  auditRunId: string;
  inputHash: string;
  signalReadings: SignalReading[];
  lensMemos: LensMemo[];
}

export interface TopicAuditCacheKeyInput {
  topicId: string;
  signalIds: string[];
  itemStates: Array<{
    itemId: string;
    updatedAt: string | null;
    status: string;
  }>;
  promptVersion: string;
  stageName: string;
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
    signalIds: [...input.signalIds].sort(),
    itemStates: [...input.itemStates]
      .map((entry) => ({
        itemId: entry.itemId,
        updatedAt: entry.updatedAt ?? "",
        status: entry.status
      }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId)),
    promptVersion: input.promptVersion,
    stageName: input.stageName
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
