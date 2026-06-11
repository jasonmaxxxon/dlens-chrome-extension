import type { FolderMode } from "./types";

export type SaveCurrentPreviewActionTarget = {
  sessionId: string;
  topicId: string | null;
};

export type SessionActionTarget = {
  sessionId: string;
};

export type SessionItemActionTarget = {
  sessionId: string;
  itemId: string;
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

export function buildSessionActionTarget(sessionId: string | null | undefined): SessionActionTarget | null {
  const normalizedSessionId = normalizeId(sessionId);
  return normalizedSessionId ? { sessionId: normalizedSessionId } : null;
}

export function requireSessionActionTarget(
  target: SessionActionTarget | null | undefined
): SessionActionTarget {
  const normalized = buildSessionActionTarget(target?.sessionId);
  if (!normalized) {
    throw new Error("Explicit session target is required.");
  }
  return normalized;
}

export function buildSessionItemActionTarget({
  sessionId,
  itemId
}: {
  sessionId?: string | null;
  itemId?: string | null;
}): SessionItemActionTarget | null {
  const normalizedSessionId = normalizeId(sessionId);
  const normalizedItemId = normalizeId(itemId);
  if (!normalizedSessionId || !normalizedItemId) {
    return null;
  }
  return {
    sessionId: normalizedSessionId,
    itemId: normalizedItemId
  };
}

export function requireSessionItemActionTarget(
  target: SessionItemActionTarget | null | undefined
): SessionItemActionTarget {
  const normalized = buildSessionItemActionTarget({
    sessionId: target?.sessionId,
    itemId: target?.itemId
  });
  if (!normalized) {
    throw new Error("Explicit item target is required.");
  }
  return normalized;
}
