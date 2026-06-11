import { clearFolderSynthesis } from "../compare/folder-synthesis-storage";
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
  await clearFolderSynthesis(storageArea, result.deleted.sessionId);
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
