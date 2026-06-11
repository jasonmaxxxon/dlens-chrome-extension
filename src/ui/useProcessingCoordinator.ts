import { useCallback, useEffect, useRef, useState } from "react";

import type { ExtensionMessage, ExtensionResponse, WorkerStatusMessageResponse } from "../state/messages";
import { getPollingDelayMs, shouldRefreshProcessingFolder, type WorkerStatus } from "../state/processing-state";
import { sendExtensionMessage } from "./controller";
import { markQaTrace } from "./qa-trace";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;

export function useProcessingCoordinator({
  popupOpen,
  activeFolderId,
  hasInflight,
  sendAndSync
}: {
  popupOpen: boolean;
  activeFolderId: string | undefined;
  hasInflight: boolean;
  sendAndSync: SendAndSync;
}) {
  const processingFailureCountRef = useRef(0);
  const lastKnownWorkerStatusRef = useRef<WorkerStatus>("idle");
  const [workerStatus, setWorkerStatusState] = useState<WorkerStatus | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const setWorkerStatus = useCallback((status: WorkerStatus) => {
    lastKnownWorkerStatusRef.current = status;
    setWorkerStatusState(status);
  }, []);

  useEffect(() => {
    if (!popupOpen) {
      lastKnownWorkerStatusRef.current = "idle";
      setWorkerStatusState(null);
      setWorkerError(null);
      processingFailureCountRef.current = 0;
      return;
    }

    let cancelled = false;
    let timeoutHandle: number | null = null;
    let lastKnownWorkerStatus: WorkerStatus = lastKnownWorkerStatusRef.current;

    async function runCoordinator() {
      const startedAt = performance.now();
      markQaTrace("popup.worker.status.request", {
        activeFolderId: activeFolderId ?? null,
        hasInflight,
        failureCount: processingFailureCountRef.current
      });
      try {
        const workerResponse = await sendExtensionMessage<WorkerStatusMessageResponse>({ type: "worker/get-status" });
        if (!workerResponse.ok) {
          throw new Error(workerResponse.error);
        }
        if (cancelled) {
          return;
        }
        const nextWorkerStatus = workerResponse.workerStatus;
        const previousWorkerStatus = lastKnownWorkerStatus;
        lastKnownWorkerStatus = nextWorkerStatus;
        lastKnownWorkerStatusRef.current = nextWorkerStatus;
        setWorkerStatusState(nextWorkerStatus);
        setWorkerError(null);
        markQaTrace("popup.worker.status.response", {
          workerStatus: nextWorkerStatus,
          previousWorkerStatus,
          elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10
        });
        if (activeFolderId && shouldRefreshProcessingFolder({
          workerStatus: nextWorkerStatus,
          previousWorkerStatus,
          hasInflight
        })) {
          markQaTrace("popup.worker.refresh.request", { activeFolderId, workerStatus: nextWorkerStatus });
          await sendAndSync({ type: "session/refresh-all", target: { sessionId: activeFolderId } });
          markQaTrace("popup.worker.refresh.response", { activeFolderId });
        }
        if (cancelled) {
          return;
        }
        processingFailureCountRef.current = 0;
        const nextDelay = getPollingDelayMs({
          workerStatus: nextWorkerStatus,
          hasInflight,
          failureCount: 0
        });
        if (nextDelay != null) {
          markQaTrace("popup.worker.next-poll", { delayMs: nextDelay, workerStatus: nextWorkerStatus, failureCount: 0 });
          timeoutHandle = window.setTimeout(() => {
            void runCoordinator();
          }, nextDelay);
        }
      } catch (error) {
        console.error("failed to coordinate processing state", error);
        if (cancelled) {
          return;
        }
        setWorkerStatusState((current) => current);
        setWorkerError(error instanceof Error ? error.message : String(error));
        processingFailureCountRef.current += 1;
        markQaTrace("popup.worker.status.error", {
          elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
          failureCount: processingFailureCountRef.current,
          error: error instanceof Error ? error.message : String(error)
        });
        const nextDelay = getPollingDelayMs({
          workerStatus: lastKnownWorkerStatus,
          hasInflight,
          failureCount: processingFailureCountRef.current
        });
        if (nextDelay != null) {
          markQaTrace("popup.worker.next-poll", { delayMs: nextDelay, workerStatus: lastKnownWorkerStatus, failureCount: processingFailureCountRef.current });
          timeoutHandle = window.setTimeout(() => {
            void runCoordinator();
          }, nextDelay);
        }
      }
    }

    void runCoordinator();
    return () => {
      cancelled = true;
      if (timeoutHandle != null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [popupOpen, activeFolderId, hasInflight, sendAndSync]);

  return {
    workerStatus,
    workerError,
    setWorkerStatus
  };
}
