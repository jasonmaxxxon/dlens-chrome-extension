import { useEffect, useLayoutEffect, useState } from "react";

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
  popupOpen: boolean
): PopupWorkspaceState {
  return {
    currentMode: popupOpen ? resolveInitialPopupMode(processingSummary) : "library",
    popupOpen,
    modeLocked: popupOpen
  };
}

export function syncPopupWorkspaceStateFromSnapshot(
  currentState: PopupWorkspaceState,
  popupPage: PopupPage | null | undefined,
  popupOpen: boolean
): PopupWorkspaceState {
  if (!popupPage) {
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
    buildInitialPopupWorkspaceState(processingSummary, popupOpen)
  );

  useLayoutEffect(() => {
    setWorkspaceState((currentState) => advancePopupWorkspaceState(processingSummary, currentState, popupOpen));
  }, [popupOpen, processingSummary]);

  useEffect(() => {
    setWorkspaceState((currentState) => syncPopupWorkspaceStateFromSnapshot(currentState, popupPage, popupOpen));
  }, [popupOpen, popupPage]);

  const page = workspaceState.currentMode;
  const primaryMode = page === "settings" || page === "result" ? null : page;

  async function onNavigate(pageValue: PopupPage) {
    setWorkspaceState((currentState) => ({
      ...currentState,
      currentMode: pageValue,
      popupOpen: true,
      modeLocked: true
    }));
    await sendAndSync({ type: "popup/navigate-active-tab", page: pageValue });
  }

  return {
    workspaceState,
    setWorkspaceState,
    page,
    primaryMode,
    onNavigate
  };
}
