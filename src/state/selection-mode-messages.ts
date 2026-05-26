import type { ExtensionMessage } from "./messages";
import type { ExtensionSnapshot, FolderMode } from "./types";

export type SelectionModeExitReason = "manual-cancel" | "selection-complete" | "remote-sync";

export function resolveSelectionModeFromSnapshot(snapshot: ExtensionSnapshot | null | undefined): FolderMode | null {
  if (!snapshot?.tab.selectionMode) {
    return null;
  }
  const activeSession = snapshot.global.sessions.find((session) => session.id === snapshot.global.activeSessionId) ?? null;
  return activeSession?.mode ?? "archive";
}

export function buildSelectionModeMessage(
  enabled: boolean,
  reason: SelectionModeExitReason = "manual-cancel"
): Extract<ExtensionMessage, { type: "selection/mode-changed" }> | null {
  if (!enabled && reason !== "manual-cancel") {
    return null;
  }

  return {
    type: "selection/mode-changed",
    enabled
  };
}
