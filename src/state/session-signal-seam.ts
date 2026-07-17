import { deleteProductAgentTaskFeedbackBySignalId } from "../compare/product-agent-task-feedback";
import { clearFolderSynthesis } from "../compare/folder-synthesis-storage";
import { deleteSignalReadingsBySignalId } from "../compare/signal-reading-storage";
import { deleteTopicSignalReadingsBySignalId } from "../compare/topic-signal-reading-storage";
import { removeSessionItem } from "./store-helpers";
import { deleteSignal, type StorageAreaLike } from "./topic-storage";
import type { ExtensionGlobalState, Signal, Topic } from "./types";

export type SignalStorageDeletion = {
  deleted: Signal;
  signals: Signal[];
  topics?: Topic[];
};

export async function deleteSignalStorageRecords(
  storageArea: StorageAreaLike,
  signalId: string
): Promise<Required<SignalStorageDeletion>> {
  const result = await deleteSignal(storageArea, signalId);
  await Promise.all([
    clearFolderSynthesis(storageArea, result.deleted.sessionId),
    deleteSignalReadingsBySignalId(storageArea, signalId),
    deleteProductAgentTaskFeedbackBySignalId(storageArea, signalId),
    deleteTopicSignalReadingsBySignalId(storageArea, signalId)
  ]);
  return result;
}

export function applySignalDeletionToGlobalState(
  globalState: ExtensionGlobalState,
  deletion: SignalStorageDeletion
): { globalState: ExtensionGlobalState; removedItemId: string | null } {
  const itemId = deletion.deleted.itemId ?? null;
  if (!itemId) {
    return { globalState, removedItemId: null };
  }

  const stillReferenced = deletion.signals.some((signal) => signal.itemId === itemId);
  if (stillReferenced) {
    return { globalState, removedItemId: null };
  }

  return {
    globalState: removeSessionItem(globalState, deletion.deleted.sessionId, itemId),
    removedItemId: itemId
  };
}
