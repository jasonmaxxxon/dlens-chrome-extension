import { useEffect, useRef, useState } from "react";

import type { ExtensionMessage, ExtensionResponse, WorkerStatusMessageResponse } from "../state/messages";
import { getPollingDelayMs, type WorkerStatus } from "../state/processing-state";
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
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);

  useEffect(() => {
    if (!popupOpen) {
      setWorkerStatus(null);
      processingFailureCountRef.current = 0;
      return;
    }

    let cancelled = false;
    let timeoutHandle: number | null = null;
    let lastKnownWorkerStatus: WorkerStatus = workerStatus ?? "idle";

    async function runCoordinator() {
      try {
        const workerResponse = await sendExtensionMessage<WorkerStatusMessageResponse>({ type: "worker/get-status" });
        if (!workerResponse.ok) {
          throw new Error(workerResponse.error);
        }
        if (cancelled) {
          return;
        }
        const nextWorkerStatus = workerResponse.workerStatus;
        lastKnownWorkerStatus = nextWorkerStatus;
        setWorkerStatus(nextWorkerStatus);
        if (hasInflight) {
          await sendAndSync({ type: "session/refresh-all", sessionId: activeFolderId });
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
          timeoutHandle = window.setTimeout(() => {
            void runCoordinator();
          }, nextDelay);
        }
      } catch (error) {
        console.error("failed to coordinate processing state", error);
        if (cancelled) {
          return;
        }
        setWorkerStatus((current) => current);
        processingFailureCountRef.current += 1;
        const nextDelay = getPollingDelayMs({
          workerStatus: lastKnownWorkerStatus,
          hasInflight,
          failureCount: processingFailureCountRef.current
        });
        if (nextDelay != null) {
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
  }, [popupOpen, activeFolderId, hasInflight, sendAndSync, workerStatus]);

  return {
    workerStatus,
    setWorkerStatus
  };
}
