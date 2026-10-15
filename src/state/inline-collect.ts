import type { TargetDescriptor } from "../contracts/target-descriptor";
import { getPostIdentity } from "./store-helpers";
import type { ExtensionGlobalState, FolderMode, SessionRecord } from "./types";

export const INLINE_COLLECT_MODES = ["topic", "product", "pr-evidence", "archive"] as const;
export const INLINE_COLLECT_MODE_NAMES: Record<FolderMode, string> = {
  topic: "觀眾反應", product: "個人應用", "pr-evidence": "活動追蹤", archive: "收藏整理"
};
export type InlineCollectMessage = { type: "session/inline-collect" } & (
  | { action: "snapshot" }
  | { action: "save"; descriptor: TargetDescriptor; mode?: FolderMode }
  | { action: "remove"; descriptor: TargetDescriptor; sessionId: string; itemId: string }
  | { action: "undo"; token: string }
);
export interface InlineCollectDestination {
  mode: FolderMode;
  sessionId: string | null;
  sessionName: string;
}
export interface InlineCollectSavedPost {
  postKey: string;
  mode: FolderMode;
  sessionId: string;
  sessionName: string;
  itemId: string;
}
export interface InlineCollectState {
  lastMode: FolderMode;
  destinations: InlineCollectDestination[];
  saved: InlineCollectSavedPost[];
  changed: boolean;
  undoToken?: string;
}
export function isInlineCollectMode(value: unknown): value is FolderMode {
  return INLINE_COLLECT_MODES.some(mode => mode === value);
}
export function inlineCollectPostKey(descriptor: Pick<TargetDescriptor, "post_url">): string {
  return getPostIdentity(descriptor.post_url);
}
export function getInlineCollectDestination(global: ExtensionGlobalState, mode: FolderMode): SessionRecord | null {
  return global.sessions.filter(session => session.mode === mode)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)
      || Number(right.id === global.activeSessionId) - Number(left.id === global.activeSessionId))[0] ?? null;
}
export function getInlineCollectLastMode(global: ExtensionGlobalState): FolderMode {
  return isInlineCollectMode(global.lastCollectMode) ? global.lastCollectMode
    : global.sessions.find(session => session.id === global.activeSessionId)?.mode ?? "topic";
}
export function projectInlineCollectState(global: ExtensionGlobalState): InlineCollectState {
  const sessions = [...global.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    lastMode: getInlineCollectLastMode(global),
    destinations: INLINE_COLLECT_MODES.map(mode => {
      const session = getInlineCollectDestination(global, mode);
      return { mode, sessionId: session?.id ?? null, sessionName: session?.name ?? INLINE_COLLECT_MODE_NAMES[mode] };
    }),
    saved: sessions.flatMap(session => session.items.map(item => ({
      postKey: inlineCollectPostKey(item.descriptor), mode: session.mode,
      sessionId: session.id, sessionName: session.name, itemId: item.id
    }))),
    changed: false
  };
}
