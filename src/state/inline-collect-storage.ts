import { SIGNALS_STORAGE_KEY, TOPICS_STORAGE_KEY, type StorageAreaLike } from "./topic-storage";
import { FOLDER_SYNTHESIS_STORAGE_KEY } from "../compare/folder-synthesis-storage";
import { PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY } from "../compare/product-agent-task-feedback";

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Invert only fields written by this removal; concurrent unrelated records win. */
function inverse(current: unknown, removed: unknown, original: unknown): unknown {
  if (equal(current, removed)) return structuredClone(original);
  if (Array.isArray(original) && Array.isArray(removed) && Array.isArray(current)) {
    const identified = original.every(value => object(value) && typeof value.id === "string")
      && removed.every(value => object(value) && typeof value.id === "string")
      && current.every(value => object(value) && typeof value.id === "string");
    if (identified) {
      const before = new Map(original.map(value => [value.id, value]));
      const after = new Map(removed.map(value => [value.id, value]));
      const result = current.map(value => before.has(value.id)
        ? inverse(value, after.get(value.id), before.get(value.id)) : value);
      for (const value of original) {
        if (!after.has(value.id) && !current.some(entry => entry.id === value.id)) result.push(structuredClone(value));
      }
      return result;
    }
    // Topic signalIds are the only primitive arrays changed by the removal seam.
    if ([...original, ...removed, ...current].every(value => typeof value === "string")) {
      return [...current, ...original.filter(value => !removed.includes(value) && !current.includes(value))];
    }
  }
  if (object(original) && object(removed) && object(current)) {
    const result = { ...current };
    for (const key of new Set([...Object.keys(original), ...Object.keys(removed)])) {
      if (equal(original[key], removed[key])) continue;
      const restored = inverse(current[key], removed[key], original[key]);
      if (restored === undefined) delete result[key];
      else result[key] = restored;
    }
    return result;
  }
  return current;
}

const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(object) : [];
const ids = (value: unknown) => Array.isArray(value) ? [...value].sort() : [];

/** Feedback is an append-only event list, not an id-keyed record list. */
function restoreFeedback(current: unknown, removed: unknown, original: unknown): unknown {
  const identity = (entry: Record<string, unknown>) => JSON.stringify([
    entry.signalId, entry.taskPromptHash, entry.createdAt, entry.feedback, entry.note ?? ""
  ]);
  const retained = new Map<string, number>();
  for (const entry of records(removed)) retained.set(identity(entry), (retained.get(identity(entry)) ?? 0) + 1);
  const deleted = records(original).filter(entry => {
    const key = identity(entry);
    const count = retained.get(key) ?? 0;
    if (!count) return true;
    retained.set(key, count - 1);
    return false;
  });
  return [...structuredClone(deleted), ...records(current)];
}

function restoreTopics(
  current: unknown, removed: unknown, original: unknown, corpusUnchanged: (sessionId: unknown) => boolean
): unknown {
  const result = records(inverse(current, removed, original));
  return result.map(topic => {
    const before = records(original).find(entry => entry.id === topic.id);
    const after = records(removed).find(entry => entry.id === topic.id);
    const live = records(current).find(entry => entry.id === topic.id);
    if (!before || !after || !live || equal(before.signalIds, after.signalIds)) return topic;
    const canRestore = corpusUnchanged(topic.sessionId)
      && equal(ids(topic.signalIds), ids(before.signalIds)) && equal(live.synthesis, after.synthesis);
    return { ...topic, synthesis: canRestore ? before.synthesis : null };
  });
}

function restoreFolderSyntheses(
  current: unknown, removed: unknown, original: unknown,
  restoredSessions: Set<unknown>, corpusUnchanged: (sessionId: unknown) => boolean
): unknown {
  const affected = new Set(restoredSessions);
  for (const entry of records(original)) {
    if (!records(removed).some(after => after.sessionId === entry.sessionId)) affected.add(entry.sessionId);
  }
  // Restoring a source invalidates any reading generated while that source was absent.
  const result = records(current).filter(entry => !affected.has(entry.sessionId));
  for (const entry of records(original)) {
    if (affected.has(entry.sessionId) && corpusUnchanged(entry.sessionId)
      && !records(current).some(live => live.sessionId === entry.sessionId)) result.push(structuredClone(entry));
  }
  return result;
}

/** Existing deletion helpers use this adapter, so undo includes every derived record they touch. */
export function recordInlineCollectRemoval(storage: StorageAreaLike): {
  storage: StorageAreaLike;
  restore: () => Promise<void>;
} {
  const writes = new Map<string, { before: unknown; after: unknown }>();
  return {
    storage: {
      get: key => storage.get(key),
      set: async values => {
        for (const [key, value] of Object.entries(values)) {
          const previous = writes.get(key);
          const before = previous ? previous.before : (await storage.get(key))[key];
          writes.set(key, { before: structuredClone(before), after: structuredClone(value) });
        }
        await storage.set(values);
      }
    },
    restore: async () => {
      const values: Record<string, unknown> = {};
      const currentStores = await storage.get([...writes.keys()]);
      const signalWrite = writes.get(SIGNALS_STORAGE_KEY);
      const restoredSessions = new Set(records(signalWrite?.before)
        .filter(signal => !records(signalWrite?.after).some(after => after.id === signal.id))
        .map(signal => signal.sessionId));
      const corpusUnchanged = (sessionId: unknown) => {
        if (!signalWrite) return false;
        const corpus = (value: unknown) => records(value).filter(signal => signal.sessionId === sessionId)
          .sort((left, right) => String(left.id).localeCompare(String(right.id)));
        return equal(corpus(currentStores[SIGNALS_STORAGE_KEY]), corpus(signalWrite.after));
      };
      for (const [key, write] of writes) {
        const current = currentStores[key];
        const restored = key === PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY
          ? restoreFeedback(current, write.after, write.before)
          : key === TOPICS_STORAGE_KEY
            ? restoreTopics(current, write.after, write.before, corpusUnchanged)
            : key === FOLDER_SYNTHESIS_STORAGE_KEY
              ? restoreFolderSyntheses(current, write.after, write.before, restoredSessions, corpusUnchanged)
              : inverse(current, write.after, write.before);
        // An absent store is semantically its empty deletion result; chrome rejects undefined.
        if (restored !== undefined && !equal(restored, current)) values[key] = restored;
      }
      if (Object.keys(values).length) await storage.set(values);
    }
  };
}
