import { useEffect, useState } from "react";
import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import { INLINE_READINGS_STORAGE_KEY, normalizeInlineReadingRecords, type InlineReadingRecord } from "../compare/inline-reading-storage";
import { sendExtensionMessage } from "./controller";

/**
 * Live inputs for the 觀眾反應 discourse view in the side panel: the Threads post in view (reported by the content
 * script) and the per-post AI readings, which flag spam/off-topic clusters so they never name a 講法.
 */
export function useDiscourseFeeds(enabled: boolean): { inViewPostKey: string | null; readings: Record<string, InlineReadingRecord> } {
  const [inViewPostKey, setInViewPostKey] = useState<string | null>(null);
  const [readings, setReadings] = useState<Record<string, InlineReadingRecord>>({});
  useEffect(() => {
    if (!enabled || typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    let cancelled = false;
    const onMessage = (message: ExtensionMessage) => {
      if (message?.type === "inline/in-view") setInViewPostKey(message.postKey);
      return false;
    };
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && INLINE_READINGS_STORAGE_KEY in changes) setReadings(normalizeInlineReadingRecords(changes[INLINE_READINGS_STORAGE_KEY].newValue));
    };
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.storage?.onChanged?.addListener(onStorage);
    void sendExtensionMessage<ExtensionResponse>({ type: "inline/in-view-get" })
      .then((response) => { if (!cancelled && response.ok) setInViewPostKey(response.inViewPostKey ?? null); })
      .catch(() => undefined);
    void Promise.resolve(chrome.storage?.local?.get?.(INLINE_READINGS_STORAGE_KEY))
      .then((stored) => { if (!cancelled && stored) setReadings(normalizeInlineReadingRecords(stored[INLINE_READINGS_STORAGE_KEY])); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage?.onChanged?.removeListener(onStorage);
    };
  }, [enabled]);
  return { inViewPostKey, readings };
}
