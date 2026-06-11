import type { FolderMode } from "./types";

export type SaveCurrentPreviewActionTarget = {
  sessionId: string;
  topicId: string | null;
};

function normalizeId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function buildSaveCurrentPreviewTarget({
  activeFolderMode,
  sessionId,
  selectedTopicId,
  collectionTopicId
}: {
  activeFolderMode: FolderMode;
  sessionId?: string | null;
  selectedTopicId?: string | null;
  collectionTopicId?: string | null;
}): SaveCurrentPreviewActionTarget | null {
  const normalizedSessionId = normalizeId(sessionId);
  if (!normalizedSessionId) {
    return null;
  }

  return {
    sessionId: normalizedSessionId,
    topicId:
      activeFolderMode === "topic"
        ? normalizeId(selectedTopicId) ?? normalizeId(collectionTopicId)
        : null
  };
}

export function requireSaveCurrentPreviewTarget(
  target: SaveCurrentPreviewActionTarget | null | undefined
): SaveCurrentPreviewActionTarget {
  const normalizedSessionId = normalizeId(target?.sessionId);
  if (!normalizedSessionId) {
    throw new Error("Explicit save target is required.");
  }
  return {
    sessionId: normalizedSessionId,
    topicId: normalizeId(target?.topicId) ?? null
  };
}
