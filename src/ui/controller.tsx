import { useEffect, useMemo, useState } from "react";
import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import type { ExtensionSnapshot, SessionItem, SessionRecord } from "../state/types";
import { needsCaptureRefresh } from "../state/store-helpers";

export async function sendExtensionMessage<T extends ExtensionResponse>(message: ExtensionMessage): Promise<T> {
  try {
    return await (chrome.runtime.sendMessage(message) as Promise<T>);
  } catch (error) {
    // Service worker may have died; retry once to wake it
    if (String(error).includes("Could not establish connection")) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return chrome.runtime.sendMessage(message) as Promise<T>;
    }
    throw error;
  }
}

export function getActiveSession(snapshot: ExtensionSnapshot | null): SessionRecord | null {
  if (!snapshot?.global.activeSessionId) {
    return null;
  }
  return snapshot.global.sessions.find((session) => session.id === snapshot.global.activeSessionId) || null;
}

export function getActiveItem(snapshot: ExtensionSnapshot | null): SessionItem | null {
  const session = getActiveSession(snapshot);
  if (!session || !snapshot?.tab.activeItemId) {
    return null;
  }
  return session.items.find((item) => item.id === snapshot.tab.activeItemId) || null;
}

export function useExtensionSnapshot(polling = true) {
  const [snapshot, setSnapshot] = useState<ExtensionSnapshot | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);

  async function refreshState() {
    const response = await sendExtensionMessage<ExtensionResponse>({ type: "state/get-active-tab" });
    if (response.ok && response.snapshot) {
      setSnapshot(response.snapshot);
      setTabId(response.tabId ?? null);
    }
    return response;
  }

  useEffect(() => {
    void refreshState().catch((error: unknown) => {
      console.error("failed to load extension snapshot", error);
    });

    const listener = (message: unknown) => {
      const typed = message as { type?: string; tabId?: number; snapshot?: ExtensionSnapshot };
      if (typed.type === "state/updated" && typed.snapshot) {
        setSnapshot(typed.snapshot);
        setTabId(typed.tabId ?? null);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const runningItemIds = useMemo(() => {
    const session = getActiveSession(snapshot);
    if (!session) {
      return [];
    }
    return session.items
      .filter((item) => needsCaptureRefresh(item))
      .map((item) => item.id);
  }, [snapshot]);

  useEffect(() => {
    if (!polling || !runningItemIds.length) {
      return;
    }
    // Legacy polling remains for the sidepanel; the in-page popup runs its own
    // shared processing coordinator so worker and item refreshes stay in sync.
    void sendExtensionMessage<ExtensionResponse>({ type: "session/refresh-all" }).catch(() => undefined);
    const handle = window.setInterval(() => {
      void sendExtensionMessage<ExtensionResponse>({ type: "session/refresh-all" }).catch((error: unknown) => {
        console.error("failed to refresh session items", error);
      });
    }, 10000);
    return () => window.clearInterval(handle);
  }, [polling, runningItemIds.join(",")]);

  async function sendAndSync<T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage): Promise<T> {
    const response = await sendExtensionMessage<T>(message);
    if (response.ok && response.snapshot) {
      setSnapshot(response.snapshot);
      setTabId(response.tabId ?? null);
    }
    return response;
  }

  return {
    snapshot,
    setSnapshot,
    tabId,
    refreshState,
    sendAndSync
  };
}
