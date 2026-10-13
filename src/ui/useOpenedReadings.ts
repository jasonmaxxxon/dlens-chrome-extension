import { useEffect, useState } from "react";
import type { SessionRecord } from "../state/types";
import type { InlineReadingRecord } from "../compare/inline-reading-storage";
import { openedItemId, OPENED_READING_PREFIX, loadOpenedReadings, markReadingOpened, normalizeOpenedReadings, type OpenedReadings } from "../state/opened-readings-storage";
import { buildCollectionPosts, buildCollectionArrivalModel } from "../viewmodel/collection-browser";

/** Storage effects stay in the shell hook; an already-open reader acknowledges later results too. */
export function useOpenedReadings(enabled: boolean, selectedKey: string | null, sessions: SessionRecord[], readings: Record<string, InlineReadingRecord>) {
  const [opened, setOpened] = useState<OpenedReadings>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || typeof chrome === "undefined" || !chrome.storage?.local) return;
    let cancelled = false;
    const changedIds = new Set<string>();
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      const own = Object.fromEntries(Object.entries(changes).filter(([key]) => key.startsWith(OPENED_READING_PREFIX)).map(([key, change]) => [key, change.newValue]));
      if (!Object.keys(own).length) return;
      for (const key of Object.keys(own)) { const id = openedItemId(key); if (id) changedIds.add(id); }
      const next = normalizeOpenedReadings(own);
      setOpened(current => {
        const updated = { ...current };
        for (const key of Object.keys(own)) { const id = openedItemId(key); if (id) delete updated[id]; }
        return { ...updated, ...next };
      });
    };
    chrome.storage.onChanged.addListener(onStorage);
    void loadOpenedReadings(chrome.storage.local).then(value => {
      if (!cancelled) setOpened(current => {
        const merged = { ...value };
        for (const id of changedIds) { if (current[id]) merged[id] = current[id]; else delete merged[id]; }
        return merged;
      });
    }).catch(() => { if (!cancelled) setError("未能載入已讀狀態。"); });
    return () => { cancelled = true; chrome.storage.onChanged.removeListener(onStorage); };
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !selectedKey || typeof chrome === "undefined" || !chrome.storage?.local) return;
    const now = Date.now();
    const arrival = buildCollectionArrivalModel(buildCollectionPosts(sessions), readings, opened, now, false);
    const unread = arrival.finished.filter(r => r.post.key === selectedKey && (!opened[r.itemId] || Date.parse(opened[r.itemId]) < Date.parse(r.at)));
    if (!unread.length) return;
    void Promise.all(unread.map(r => markReadingOpened(chrome.storage.local, r.itemId, new Date(now).toISOString())))
      .then(() => setError(null), () => setError("未能記錄已讀狀態。"));
  }, [enabled, selectedKey, sessions, readings, opened]);
  return { opened, error };
}
