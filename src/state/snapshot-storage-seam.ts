import type { ExtensionGlobalState } from "./types";

export interface SnapshotStorageArea {
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export async function writeGlobalStateSnapshot(
  storageArea: SnapshotStorageArea,
  storageKey: string,
  globalState: ExtensionGlobalState
): Promise<void> {
  await storageArea.set({ [storageKey]: globalState });
}

export async function writeSnapshotPayload(
  storageArea: SnapshotStorageArea,
  payload: Record<string, unknown>
): Promise<void> {
  await storageArea.set(payload);
}

export async function removeTabSnapshot(
  storageArea: SnapshotStorageArea,
  tabStorageKey: string
): Promise<void> {
  await storageArea.remove(tabStorageKey);
}
