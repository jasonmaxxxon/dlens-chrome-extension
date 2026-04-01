import type { TargetDescriptor } from "../contracts/target-descriptor.ts";
import type { HoverCandidateStrength, InlineToast, InlineToastKind, SessionRecord, TabUiState } from "./types.ts";
import { normalizePostUrl } from "./store-helpers.ts";

export function setCollectModeState(tabState: TabUiState, enabled: boolean): TabUiState {
  return {
    ...tabState,
    selectionMode: enabled,
    collectModeBannerVisible: enabled,
    hoveredTarget: enabled ? tabState.hoveredTarget : null,
    hoveredTargetStrength: enabled ? tabState.hoveredTargetStrength : null,
    flashPreview: enabled ? tabState.flashPreview : null
  };
}

export function applyHoveredPreview(
  tabState: TabUiState,
  descriptor: TargetDescriptor | null,
  strength: HoverCandidateStrength | null = "hard"
): TabUiState {
  if (!descriptor) {
    return {
      ...tabState,
      hoveredTarget: null,
      hoveredTargetStrength: null,
      flashPreview: null
    };
  }

  return {
    ...tabState,
    currentPreview: descriptor,
    hoveredTarget: descriptor,
    hoveredTargetStrength: strength,
    flashPreview: descriptor
  };
}

export function createInlineToast(kind: InlineToastKind, folderName: string, now = new Date().toISOString()): InlineToast {
  return {
    id: `${kind}-${now}`,
    kind,
    message: kind === "queued" ? `Queued from ${folderName}` : `Saved to ${folderName}`,
    createdAt: now
  };
}

export function isDescriptorSavedInFolder(folder: SessionRecord | null | undefined, descriptor: TargetDescriptor | null): boolean {
  if (!folder || !descriptor?.post_url) {
    return false;
  }
  const normalized = normalizePostUrl(descriptor.post_url);
  return folder.items.some((item) => normalizePostUrl(item.descriptor.post_url) === normalized);
}
