import type { ExtensionMessage } from "./messages";

export type SelectionModeExitReason = "manual-cancel" | "selection-complete";

export function buildSelectionModeMessage(
  enabled: boolean,
  reason: SelectionModeExitReason = "manual-cancel"
): Extract<ExtensionMessage, { type: "selection/mode-changed" }> | null {
  if (!enabled && reason === "selection-complete") {
    return null;
  }

  return {
    type: "selection/mode-changed",
    enabled
  };
}
