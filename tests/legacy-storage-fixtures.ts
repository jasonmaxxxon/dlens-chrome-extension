import type { FolderSynthesis, TopicSignalReading } from "../src/state/types.ts";
import type { StorageAreaLike } from "../src/state/topic-storage.ts";
export { FOLDER_SYNTHESIS_STORAGE_KEY } from "../src/compare/folder-synthesis-storage.ts";
import { FOLDER_SYNTHESIS_STORAGE_KEY } from "../src/compare/folder-synthesis-storage.ts";
import { TOPIC_SIGNAL_READINGS_STORAGE_KEY } from "../src/compare/topic-signal-reading-storage.ts";
export const FOLDER_SYNTHESIS_VERSION = "v3.generic-keyword-lens";
export const SAVED_ANALYSES_STORAGE_KEY = "dlens:v1:saved-analyses";
export const TOPIC_AUDIT_EPISODES_STORAGE_KEY = "dlens:v1:topic-audit-episodes";
export const TOPIC_AUDIT_EVIDENCE_STORAGE_KEY = "dlens:v1:topic-audit-evidence";
export const TOPIC_AUDIT_MEMOS_STORAGE_KEY = "dlens:v1:topic-audit-memos";
export const TOPIC_AUDIT_REPORTS_STORAGE_KEY = "dlens:v1:topic-audit-reports";
// Test fixtures access retired records directly to prove explicit deletion/undo preserves data.
export async function saveFolderSynthesis(storage: StorageAreaLike, record: FolderSynthesis) { const raw = await storage.get(FOLDER_SYNTHESIS_STORAGE_KEY); const old = (raw[FOLDER_SYNTHESIS_STORAGE_KEY] ?? []) as FolderSynthesis[]; await storage.set({ [FOLDER_SYNTHESIS_STORAGE_KEY]: [record, ...old.filter(x => x.sessionId !== record.sessionId)] }); }
export async function loadFolderSynthesis(storage: StorageAreaLike, sessionId: string) { const raw = await storage.get(FOLDER_SYNTHESIS_STORAGE_KEY); return ((raw[FOLDER_SYNTHESIS_STORAGE_KEY] ?? []) as FolderSynthesis[]).find(x => x.sessionId === sessionId) ?? null; }
export async function saveTopicSignalReading(storage: StorageAreaLike, record: TopicSignalReading) { const raw = await storage.get(TOPIC_SIGNAL_READINGS_STORAGE_KEY); await storage.set({ [TOPIC_SIGNAL_READINGS_STORAGE_KEY]: { ...(raw[TOPIC_SIGNAL_READINGS_STORAGE_KEY] as object ?? {}), [record.topicId + "::" + record.signalId]: record } }); }
export async function listTopicSignalReadings(storage: StorageAreaLike) { const raw = await storage.get(TOPIC_SIGNAL_READINGS_STORAGE_KEY); return Object.values((raw[TOPIC_SIGNAL_READINGS_STORAGE_KEY] ?? {}) as Record<string, TopicSignalReading>); }
