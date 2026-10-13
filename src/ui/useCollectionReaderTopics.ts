import { awaitingAnalysis } from "../viewmodel/inline-card";
import { useEffect, useRef, useState } from "react";
import type { Signal, Topic } from "../state/types";
import type { ExtensionResponse } from "../state/messages";
import { TOPICS_STORAGE_KEY, SIGNALS_STORAGE_KEY } from "../state/topic-storage";
import { sendExtensionMessage } from "./controller";

/** Reader hydration is scoped to the saved membership, independent of the active workspace. */
export function useCollectionReaderTopics(sessionId: string | null) {
  const [inventory, setInventory] = useState<{ sessionId: string | null; topics: Topic[]; signals: Signal[] }>({ sessionId: null, topics: [], signals: [] });
  const assigning = useRef(false);
  const currentSession = useRef(sessionId);
  currentSession.current = sessionId;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let generation = 0;
    const refresh = async () => {
      const request = ++generation;
      try {
        const [topics, signals] = await Promise.all([
          sendExtensionMessage<ExtensionResponse>({ type: "topic/list", sessionId }),
          sendExtensionMessage<ExtensionResponse>({ type: "signal/list", sessionId })
        ]);
        if (cancelled || request !== generation) return;
        if (!topics.ok || !signals.ok) throw new Error(!topics.ok ? topics.error : !signals.ok ? signals.error : "讀取話題失敗");
        setInventory({ sessionId, topics: topics.topics ?? [], signals: signals.signals ?? [] }); setError(null);
      } catch (e) { if (!cancelled && request === generation) setError(e instanceof Error ? e.message : "讀取話題失敗"); }
    };
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && (TOPICS_STORAGE_KEY in changes || SIGNALS_STORAGE_KEY in changes)) void refresh();
    };
    void refresh();
    if (typeof chrome !== "undefined") chrome.storage?.onChanged?.addListener(onChanged);
    return () => { cancelled = true; if (typeof chrome !== "undefined") chrome.storage?.onChanged?.removeListener(onChanged); };
  }, [sessionId]);
  async function onAssign(signalId: string, topicId: string | null) {
    if (assigning.current || !sessionId) return;
    assigning.current = true; setPending(true);
    try {
      const response = await sendExtensionMessage<ExtensionResponse>({ type: "signal/triage", signalId, action: { kind: "assign", topicId } });
      if (!response.ok) throw new Error(response.error);
      if (currentSession.current === sessionId) { setInventory({ sessionId, topics: response.topics ?? [], signals: response.signals ?? [] }); setError(null); }
    } catch (e) { if (currentSession.current === sessionId) setError(e instanceof Error ? e.message : "分流失敗"); }
    finally { assigning.current = false; setPending(false); }
  }
  return { onAssign, pending, topics: inventory.sessionId === sessionId ? inventory.topics : [], signals: inventory.sessionId === sessionId ? inventory.signals : [], error };
}

/** Refresh the selected saved source even while another workspace owns the panel context. */
export function useCollectionReaderLive(source: ReturnType<typeof import("../viewmodel/collection-reader").collectionAudienceSource>) {
  const item = source?.item;
  const sessionId = source?.session.id;
  const analysisStatus = item?.latestCapture?.analysis?.status;
  useEffect(() => {
    if (!item || !sessionId || !(item.status === "queued" || item.status === "running" || (item.status === "succeeded" && analysisStatus !== "succeeded" && analysisStatus !== "failed"))) return;
    let cancelled = false;
    let busy = false;
    const refresh = async () => {
      if (cancelled || busy) return;
      // A missing analysis must stop polling once the same inline-card wait budget expires.
      if (item.status === "succeeded" && !awaitingAnalysis(item, Date.now())) return;
      busy = true;
      try { await sendExtensionMessage<ExtensionResponse>({ type: "session/refresh-item", sessionId, itemId: item.id }); }
      catch { /* Existing snapshot remains visible; the next scheduled refresh may recover. */ }
      finally { busy = false; }
    };
    const timer = setInterval(() => void refresh(), 4000);
    void refresh();
    return () => { cancelled = true; clearInterval(timer); };
  }, [sessionId, item?.id, item?.status, item?.latestCapture?.id, analysisStatus]);
}
