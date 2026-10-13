

import type { TargetDescriptor } from "../contracts/target-descriptor";

export const HOVER_RECT_EVENT = "dlens:hover-rect";
export const OPEN_WORKSPACE_EVENT = "dlens:open-workspace";
const PENDING_WORKSPACE_KEY = "__dlensPendingWorkspaceOpen__";
export function requestWorkspaceOpen(sessionId: string, targetWindow: Window = window, reader?: {itemId:string; lens?:string}): void {
  (targetWindow as unknown as Record<string, unknown>)[PENDING_WORKSPACE_KEY] = reader ? {sessionId,...reader} : sessionId;
  const event = targetWindow.document.createEvent("CustomEvent");
  event.initCustomEvent(OPEN_WORKSPACE_EVENT, false, false, { sessionId,...reader });
  targetWindow.dispatchEvent(event);
}
export function consumeWorkspaceOpen(availableSessionIds: readonly string[], targetWindow: Window = window): string | null {
  const store = targetWindow as unknown as Record<string, unknown>;
  const sessionId = store[PENDING_WORKSPACE_KEY];
  if (typeof sessionId !== "string" || !availableSessionIds.includes(sessionId)) return null;
  delete store[PENDING_WORKSPACE_KEY];
  return sessionId;
}
export function consumeReaderOpen(availableItemIds:readonly string[],targetWindow:Window=window):{sessionId:string;itemId:string;lens?:string}|null {
 const store=targetWindow as unknown as Record<string,unknown>;
 const pending=store[PENDING_WORKSPACE_KEY] as {sessionId:string;itemId:string;lens?:string}|undefined;
 if (!pending || typeof pending!=='object' || !availableItemIds.includes(pending.itemId)) return null;
 delete store[PENDING_WORKSPACE_KEY]; return pending;
}
export const PAGE_LOCATION_EVENT = "dlens:page-location";
export const OPTIMISTIC_SAVE_EVENT = "dlens:optimistic-save";
export const OPTIMISTIC_SAVE_CONFIRMED_EVENT = "dlens:optimistic-save-confirmed";
export const OPTIMISTIC_SAVE_FAILED_EVENT = "dlens:optimistic-save-failed";

export function dispatchPageLocationChange(
  href: string,
  targetWindow: Window | null = typeof window === "undefined" ? null : window
): void {
  if (!targetWindow) {
    return;
  }
  const event = targetWindow.document.createEvent("CustomEvent");
  event.initCustomEvent(PAGE_LOCATION_EVENT, false, false, { href });
  targetWindow.dispatchEvent(event);
}

// Synchronous in-page channels shared between the content script and the in-page
// popup (same window). They sidestep the async snapshot round-trip so that a save
// always uses the post under the cursor right now and the folder/topic the popup
// is showing right now — never a stale value from a lagging snapshot.
const LIVE_DESCRIPTOR_KEY = "__dlensLiveHoverDescriptor__";
const LIVE_TARGET_KEY = "__dlensLiveCollectionTarget__";

export type LiveCollectionTarget = { sessionId: string | null; topicId: string | null };

function liveStore(): Record<string, unknown> | null {
  return typeof window === "undefined" ? null : (window as unknown as Record<string, unknown>);
}

export function setLiveHoverDescriptor(descriptor: TargetDescriptor | null): void {
  const store = liveStore();
  if (store) {
    store[LIVE_DESCRIPTOR_KEY] = descriptor;
  }
}

export function getLiveHoverDescriptor(): TargetDescriptor | null {
  return (liveStore()?.[LIVE_DESCRIPTOR_KEY] as TargetDescriptor | null | undefined) ?? null;
}

export function setLiveCollectionTarget(target: LiveCollectionTarget): void {
  const store = liveStore();
  if (store) {
    store[LIVE_TARGET_KEY] = target;
  }
}

export function getLiveCollectionTarget(): LiveCollectionTarget {
  return (
    (liveStore()?.[LIVE_TARGET_KEY] as LiveCollectionTarget | undefined) ?? {
      sessionId: null,
      topicId: null
    }
  );
}
