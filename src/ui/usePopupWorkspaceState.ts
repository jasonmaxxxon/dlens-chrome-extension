import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import {
  advancePopupWorkspaceState,
  resolveInitialPopupMode,
  type PopupWorkspaceState,
  type SessionProcessingSummary
} from "../state/processing-state";
import type { PopupPage } from "../state/types";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;

export function buildInitialPopupWorkspaceState(
  processingSummary: SessionProcessingSummary,
  popupOpen: boolean,
  popupPage?: PopupPage | null
): PopupWorkspaceState {
  return {
    currentMode: popupOpen ? popupPage ?? resolveInitialPopupMode(processingSummary) : "library",
    popupOpen,
    modeLocked: popupOpen
  };
}

export function syncPopupWorkspaceStateFromSnapshot(
  currentState: PopupWorkspaceState,
  popupPage: PopupPage | null | undefined,
  popupOpen: boolean,
  pendingNavigation: PopupPage | null = null
): PopupWorkspaceState {
  if (!popupPage) {
    return currentState;
  }
  if (pendingNavigation !== null && popupPage !== pendingNavigation) {
    return currentState;
  }
  if (currentState.currentMode === popupPage && currentState.popupOpen === popupOpen) {
    return currentState;
  }
  return {
    currentMode: popupPage,
    popupOpen,
    modeLocked: popupOpen
  };
}

export function resolvePendingNavigationAfterSnapshot(
  pendingNavigation: PopupPage | null,
  popupPage: PopupPage | null | undefined
): PopupPage | null {
  if (pendingNavigation !== null && popupPage === pendingNavigation) {
    return null;
  }
  return pendingNavigation;
}

export function usePopupWorkspaceState({
  popupOpen,
  popupPage,
  processingSummary,
  sendAndSync
}: {
  popupOpen: boolean;
  popupPage: PopupPage | null | undefined;
  processingSummary: SessionProcessingSummary;
  sendAndSync: SendAndSync;
}) {
  const [workspaceState, setWorkspaceState] = useState<PopupWorkspaceState>(() =>
    buildInitialPopupWorkspaceState(processingSummary, popupOpen, popupPage)
  );
  const pendingNavigationRef = useRef<PopupPage | null>(null);

  useLayoutEffect(() => {
    setWorkspaceState((currentState) => advancePopupWorkspaceState(processingSummary, currentState, popupOpen));
  }, [popupOpen, processingSummary]);

  useLayoutEffect(() => {
    pendingNavigationRef.current = resolvePendingNavigationAfterSnapshot(pendingNavigationRef.current, popupPage);
    setWorkspaceState((currentState) =>
      syncPopupWorkspaceStateFromSnapshot(currentState, popupPage, popupOpen, pendingNavigationRef.current)
    );
  }, [popupOpen, popupPage]);

  const page = workspaceState.currentMode;
  const primaryMode = page === "settings" || page === "result" ? null : page;

  function beginPendingNavigation(pageValue: PopupPage) {
    pendingNavigationRef.current = pageValue;
    setWorkspaceState((currentState) => ({
      ...currentState,
      currentMode: pageValue,
      popupOpen: true,
      modeLocked: true
    }));
  }

  function clearPendingNavigation() {
    pendingNavigationRef.current = null;
  }

  async function onNavigate(pageValue: PopupPage) {
    beginPendingNavigation(pageValue);
    try {
      await sendAndSync({ type: "popup/navigate-active-tab", page: pageValue });
    } catch (error) {
      clearPendingNavigation();
      throw error;
    }
  }

  return {
    workspaceState,
    setWorkspaceState,
    page,
    primaryMode,
    beginPendingNavigation,
    clearPendingNavigation,
    onNavigate
  };
}
