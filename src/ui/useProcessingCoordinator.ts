import { useCallback, useEffect, useRef, useState } from "react";

import type { ExtensionMessage, ExtensionResponse, WorkerStatusMessageResponse } from "../state/messages";
import { emitPipelineEvent } from "../state/pipeline-trace";
import { getPollingDelayMs, shouldRefreshProcessingFolder, type WorkerStatus } from "../state/processing-state";
import { sendExtensionMessage } from "./controller";

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
      emitPipelineEvent({
        phase: "crawl.queued",
        step: "popup.worker.status.request",
        target: { sessionId: activeFolderId },
        result: "pending",
        detail: {
          hasInflight,
          failureCount: processingFailureCountRef.current
        }
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
        emitPipelineEvent({
          phase: "crawl.queued",
          step: "popup.worker.status.response",
          target: { sessionId: activeFolderId },
          result: "ok",
          detail: {
            workerStatus: nextWorkerStatus,
            previousWorkerStatus,
            elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10
          }
        });
        if (activeFolderId && shouldRefreshProcessingFolder({
          workerStatus: nextWorkerStatus,
          previousWorkerStatus,
          hasInflight
        })) {
          emitPipelineEvent({
            phase: "capture.ready",
            step: "popup.worker.refresh.request",
            target: { sessionId: activeFolderId },
            result: "pending",
            detail: { workerStatus: nextWorkerStatus }
          });
          await sendAndSync({ type: "session/refresh-all", target: { sessionId: activeFolderId } });
          emitPipelineEvent({
            phase: "capture.ready",
            step: "popup.worker.refresh.response",
            target: { sessionId: activeFolderId },
            result: "ok"
          });
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
          emitPipelineEvent({
            phase: "crawl.queued",
            step: "popup.worker.next-poll",
            target: { sessionId: activeFolderId },
            result: "pending",
            detail: { delayMs: nextDelay, workerStatus: nextWorkerStatus, failureCount: 0 }
          });
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
        emitPipelineEvent({
          phase: "crawl.queued",
          step: "popup.worker.status.error",
          target: { sessionId: activeFolderId },
          result: "error",
          detail: {
            elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
            failureCount: processingFailureCountRef.current,
            error: error instanceof Error ? error.message : String(error)
          }
        });
        const nextDelay = getPollingDelayMs({
          workerStatus: lastKnownWorkerStatus,
          hasInflight,
          failureCount: processingFailureCountRef.current
        });
        if (nextDelay != null) {
          emitPipelineEvent({
            phase: "crawl.queued",
            step: "popup.worker.next-poll",
            target: { sessionId: activeFolderId },
            result: "pending",
            detail: { delayMs: nextDelay, workerStatus: lastKnownWorkerStatus, failureCount: processingFailureCountRef.current }
          });
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
