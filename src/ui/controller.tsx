import { useEffect, useMemo, useRef, useState } from "react";
import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import type { ExtensionSnapshot, SessionItem, SessionRecord } from "../state/types";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace";
import {
  buildReconcileIgnoredEvent,
  createRequestReconciler,
  type RequestReconcileTarget
} from "../state/request-reconcile";
import { needsCaptureRefresh } from "../state/store-helpers";

type RuntimeMessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

function getRuntimeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return String(error || "Extension runtime unavailable");
}

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  return getRuntimeErrorMessage(error).includes("Extension context invalidated");
}

function buildRuntimeUnavailableResponse(error: unknown): ExtensionResponse {
  return {
    ok: false,
    error: getRuntimeErrorMessage(error)
  };
}

export async function sendExtensionMessage<T extends ExtensionResponse>(message: ExtensionMessage): Promise<T> {
  const wakeRetryDelays = [0, 200, 600];

  for (const [attempt, delayMs] of wakeRetryDelays.entries()) {
    try {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        return buildRuntimeUnavailableResponse("Extension context invalidated.") as T;
      }
      return await (chrome.runtime.sendMessage(message) as Promise<T>);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        return buildRuntimeUnavailableResponse(error) as T;
      }
      const isWorkerWakeError = String(error).includes("Could not establish connection");
      if (!isWorkerWakeError || attempt === wakeRetryDelays.length - 1) {
        throw error;
      }
    }
  }
  throw new Error("unreachable sendExtensionMessage state");
}

export function addRuntimeMessageListener(listener: RuntimeMessageListener): () => void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return () => undefined;
  }

  try {
    chrome.runtime.onMessage.addListener(listener);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return () => undefined;
    }
    throw error;
  }

  return () => {
    try {
      chrome.runtime.onMessage.removeListener(listener);
    } catch (error) {
      if (!isExtensionContextInvalidatedError(error)) {
        throw error;
      }
    }
  };
}

const SNAPSHOT_RECONCILE_MESSAGE_TYPES = new Set<string>([
  "session/refresh-all",
  "session/queue-items-and-start-processing",
  "product/analyze-signals",
  "product/synthesize-signal-reading",
  "product/review-signal-reading",
  "folder/synthesis/generate",
  "folder/synthesis/clear",
  "pr/match-criteria",
  "pr/fetch-advanced-metrics",
  "pr/generate-summary"
]);

function readStringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readMessageTarget(message: ExtensionMessage): RequestReconcileTarget {
  const raw = message as Record<string, unknown>;
  const nestedTarget = raw.target && typeof raw.target === "object" && !Array.isArray(raw.target)
    ? raw.target as Record<string, unknown>
    : {};
  return {
    sessionId: readStringField(raw, "sessionId") ?? readStringField(nestedTarget, "sessionId"),
    itemId: readStringField(raw, "itemId") ?? readStringField(nestedTarget, "itemId"),
    signalId: readStringField(raw, "signalId") ?? readStringField(nestedTarget, "signalId"),
    campaignId: readStringField(raw, "campaignId") ?? readStringField(nestedTarget, "campaignId")
  };
}

export function buildSnapshotReconcileDescriptor(message: ExtensionMessage): { lane: string; target: RequestReconcileTarget } | null {
  if (!SNAPSHOT_RECONCILE_MESSAGE_TYPES.has(message.type)) {
    return null;
  }
  const target = readMessageTarget(message);
  if (!target.sessionId) {
    return null;
  }
  return {
    lane: `snapshot.${message.type}`,
    target: { sessionId: target.sessionId }
  };
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
  const snapshotRef = useRef<ExtensionSnapshot | null>(null);
  const snapshotReconcilerRef = useRef(createRequestReconciler());

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  async function refreshState() {
    const response = await sendExtensionMessage<ExtensionResponse>({ type: "state/get-active-tab" });
    if (response.ok && response.snapshot) {
      snapshotRef.current = response.snapshot;
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
        snapshotRef.current = typed.snapshot;
        setSnapshot(typed.snapshot);
        setTabId(typed.tabId ?? null);
      }
    };
    return addRuntimeMessageListener(listener);
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
    const session = getActiveSession(snapshot);
    if (!polling || !runningItemIds.length || !session) {
      return;
    }
    // Legacy polling remains for the sidepanel; the in-page popup runs its own
    // shared processing coordinator so worker and item refreshes stay in sync.
    void sendExtensionMessage<ExtensionResponse>({
      type: "session/refresh-all",
      target: { sessionId: session.id }
    }).catch(() => undefined);
    const handle = window.setInterval(() => {
      void sendExtensionMessage<ExtensionResponse>({
        type: "session/refresh-all",
        target: { sessionId: session.id }
      }).catch((error: unknown) => {
        console.error("failed to refresh session items", error);
      });
    }, 10000);
    return () => window.clearInterval(handle);
  }, [polling, runningItemIds.join(","), snapshot?.global.activeSessionId]);

  async function sendAndSync<T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage): Promise<T> {
    const outgoing = {
      ...message,
      requestId: message.requestId ?? createPipelineRequestId(`ui-${message.type}`)
    } as ExtensionMessage;
    const descriptor = buildSnapshotReconcileDescriptor(outgoing);
    const token = descriptor
      ? snapshotReconcilerRef.current.begin({
        ...descriptor,
        requestId: outgoing.requestId!
      })
      : null;
    const response = await sendExtensionMessage<T>(outgoing);
    if (response.ok && response.snapshot) {
      if (token) {
        const decision = snapshotReconcilerRef.current.complete(token, {
          currentTarget: { sessionId: snapshotRef.current?.global.activeSessionId ?? "" }
        });
        if (!decision.accepted) {
          emitPipelineEvent(buildReconcileIgnoredEvent(token, decision));
          return response;
        }
      }
      snapshotRef.current = response.snapshot;
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
