import { useEffect, useState } from "react";
import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import { INLINE_READINGS_STORAGE_KEY, normalizeInlineReadingRecords, type InlineReadingRecord } from "../compare/inline-reading-storage";
import { sendExtensionMessage } from "./controller";

/**
 * Live inputs for the 觀眾反應 discourse view in the side panel: the Threads post in view (reported by the content
 * script) and the per-post AI readings, which flag spam/off-topic clusters so they never name a 講法.
 * The post in view belongs to this window's active tab: reports from other tabs are ignored, and switching or
 * navigating the tab clears it until that tab reports again.
 */
export function useDiscourseFeeds(enabled: boolean): { inViewPostKey: string | null; readings: Record<string, InlineReadingRecord> } {
  const [inViewPostKey, setInViewPostKey] = useState<string | null>(null);
  const [readings, setReadings] = useState<Record<string, InlineReadingRecord>>({});
  useEffect(() => {
    if (!enabled || typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    let cancelled = false;
    let windowId: number | null = null;
    let activeTabId: number | null = null;
    const ask = (tabId?: number) => void sendExtensionMessage<ExtensionResponse>({ type: "inline/in-view-get", ...(tabId ? { tabId } : {}) })
      .then((response) => { if (!cancelled && response.ok && (!tabId || tabId === activeTabId)) setInViewPostKey(response.inViewPostKey ?? null); })
      .catch(() => undefined);
    const onMessage = (message: ExtensionMessage, sender?: chrome.runtime.MessageSender) => {
      if (message?.type === "inline/in-view" && (activeTabId === null || sender?.tab?.id === activeTabId)) setInViewPostKey(message.postKey);
      return false;
    };
    const onActivated = (info: { tabId: number; windowId: number }) => {
      if (windowId !== null && info.windowId !== windowId) return;
      activeTabId = info.tabId;
      setInViewPostKey(null);
      ask(info.tabId);
    };
    const onUpdated = (tabId: number, change: { url?: string }) => {
      if (tabId === activeTabId && change.url) setInViewPostKey(null);
    };
    void Promise.resolve(chrome.windows?.getCurrent?.())
      .then(async (current) => {
        if (cancelled || !current?.id) return;
        windowId = current.id;
        const [tab] = await chrome.tabs.query({ active: true, windowId: current.id });
        if (!cancelled && tab?.id) { activeTabId = tab.id; ask(tab.id); }
      })
      .catch(() => undefined);
    chrome.tabs?.onActivated?.addListener(onActivated);
    chrome.tabs?.onUpdated?.addListener(onUpdated);
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && INLINE_READINGS_STORAGE_KEY in changes) setReadings(normalizeInlineReadingRecords(changes[INLINE_READINGS_STORAGE_KEY].newValue));
    };
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.storage?.onChanged?.addListener(onStorage);
    ask();
    void Promise.resolve(chrome.storage?.local?.get?.(INLINE_READINGS_STORAGE_KEY))
      .then((stored) => { if (!cancelled && stored) setReadings(normalizeInlineReadingRecords(stored[INLINE_READINGS_STORAGE_KEY])); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs?.onActivated?.removeListener(onActivated);
      chrome.tabs?.onUpdated?.removeListener(onUpdated);
      chrome.storage?.onChanged?.removeListener(onStorage);
    };
  }, [enabled]);
  return { inViewPostKey, readings };
}
