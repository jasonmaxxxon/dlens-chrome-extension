import { useCallback, useEffect, useRef, useState } from "react";

import type { ExtensionMessage, ExtensionResponse, WorkerStatusMessageResponse } from "../state/messages";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace";
import {
  getPollingDelayMs,
  projectBackendReachability,
  sameBackendWorkUiState,
  shouldRefreshProcessingFolder,
  type BackendReachability,
  type BackendWorkUiState,
  type WorkerStatus
} from "../state/processing-state";
import { sendExtensionMessage } from "./controller";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;
const BACKEND_HEALTH_HEARTBEAT_MS = 12000;

export function useProcessingCoordinator({
  popupOpen,
  activeFolderId,
  hasInflight,
  ingestBaseUrl,
  sendAndSync
}: {
  popupOpen: boolean;
  activeFolderId: string | undefined;
  hasInflight: boolean;
  ingestBaseUrl?: string;
  sendAndSync: SendAndSync;
}) {
  const processingFailureCountRef = useRef(0);
  const backendHealthFailureCountRef = useRef(0);
  const lastKnownWorkerStatusRef = useRef<WorkerStatus>("idle");
  const workerStatusStateRef = useRef<WorkerStatus | null>(null);
  const workerErrorRef = useRef<string | null>(null);
  const backendWorkUiStateRef = useRef<BackendWorkUiState | null>(null);
  const backendReachabilityRef = useRef<BackendReachability>("reachable");
  const [workerStatus, setWorkerStatusState] = useState<WorkerStatus | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [backendWorkUiState, setBackendWorkUiState] = useState<BackendWorkUiState | null>(null);
  const [backendReachability, setBackendReachability] = useState<BackendReachability>("reachable");
  const setWorkerStatus = useCallback((status: WorkerStatus) => {
    lastKnownWorkerStatusRef.current = status;
    if (workerStatusStateRef.current !== status) {
      workerStatusStateRef.current = status;
      setWorkerStatusState(status);
    }
  }, []);

  useEffect(() => {
    if (!popupOpen) {
      backendHealthFailureCountRef.current = 0;
      if (backendReachabilityRef.current !== "reachable") {
        backendReachabilityRef.current = "reachable";
        setBackendReachability("reachable");
      }
      return;
    }

    let cancelled = false;
    let timeoutHandle: number | null = null;
    const baseUrl = ingestBaseUrl || "http://127.0.0.1:8000";

    async function runHealthCheck() {
      try {
        const response = await sendExtensionMessage<ExtensionResponse>({
          type: "backend/get-health",
          baseUrl
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || response.backendHealth?.reachable !== true) {
          throw new Error(response.ok ? response.backendHealth?.error || "Backend health check failed" : response.error);
        }
        backendHealthFailureCountRef.current = 0;
        if (backendReachabilityRef.current !== "reachable") {
          backendReachabilityRef.current = "reachable";
          setBackendReachability("reachable");
        }
      } catch {
        if (cancelled) {
          return;
        }
        backendHealthFailureCountRef.current += 1;
        const nextReachability = projectBackendReachability(backendHealthFailureCountRef.current);
        if (backendReachabilityRef.current !== nextReachability) {
          backendReachabilityRef.current = nextReachability;
          setBackendReachability(nextReachability);
        }
      }

      if (!cancelled) {
        timeoutHandle = window.setTimeout(() => {
          void runHealthCheck();
        }, BACKEND_HEALTH_HEARTBEAT_MS);
      }
    }

    void runHealthCheck();
    return () => {
      cancelled = true;
      if (timeoutHandle != null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [popupOpen, ingestBaseUrl]);

  useEffect(() => {
    if (!popupOpen) {
      lastKnownWorkerStatusRef.current = "idle";
      if (workerStatusStateRef.current !== null) {
        workerStatusStateRef.current = null;
        setWorkerStatusState(null);
      }
      if (workerErrorRef.current !== null) {
        workerErrorRef.current = null;
        setWorkerError(null);
      }
      if (backendWorkUiStateRef.current !== null) {
        backendWorkUiStateRef.current = null;
        setBackendWorkUiState(null);
      }
      processingFailureCountRef.current = 0;
      return;
    }

    let cancelled = false;
    let timeoutHandle: number | null = null;
    let lastKnownWorkerStatus: WorkerStatus = lastKnownWorkerStatusRef.current;

    async function runCoordinator() {
      const startedAt = performance.now();
      const statusRequestId = createPipelineRequestId("popup-worker-status");
      emitPipelineEvent({
        phase: "crawl.queued",
        step: "popup.worker.status.request",
        target: { sessionId: activeFolderId },
        result: "pending",
        requestId: statusRequestId,
        detail: {
          hasInflight,
          failureCount: processingFailureCountRef.current
        }
      });
      try {
        const workerResponse = await sendExtensionMessage<WorkerStatusMessageResponse>({
          type: "worker/get-status",
          requestId: statusRequestId
        });
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
        if (workerStatusStateRef.current !== nextWorkerStatus) {
          workerStatusStateRef.current = nextWorkerStatus;
          setWorkerStatusState(nextWorkerStatus);
        }
        const nextBackendWorkUiState = workerResponse.backendWorkUiState ?? { kind: nextWorkerStatus };
        if (!sameBackendWorkUiState(backendWorkUiStateRef.current, nextBackendWorkUiState)) {
          backendWorkUiStateRef.current = nextBackendWorkUiState;
          setBackendWorkUiState(nextBackendWorkUiState);
        }
        if (workerErrorRef.current !== null) {
          workerErrorRef.current = null;
          setWorkerError(null);
        }
        emitPipelineEvent({
          phase: "crawl.queued",
          step: "popup.worker.status.response",
          target: { sessionId: activeFolderId },
          result: "ok",
          requestId: statusRequestId,
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
          const refreshRequestId = createPipelineRequestId("popup-worker-refresh");
          emitPipelineEvent({
            phase: "capture.ready",
            step: "popup.worker.refresh.request",
            target: { sessionId: activeFolderId },
            result: "pending",
            requestId: refreshRequestId,
            detail: { workerStatus: nextWorkerStatus }
          });
          await sendAndSync({
            type: "session/refresh-all",
            requestId: refreshRequestId,
            target: { sessionId: activeFolderId }
          });
          emitPipelineEvent({
            phase: "capture.ready",
            step: "popup.worker.refresh.response",
            target: { sessionId: activeFolderId },
            result: "ok",
            requestId: refreshRequestId
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
        const nextWorkerError = error instanceof Error ? error.message : String(error);
        if (workerErrorRef.current !== nextWorkerError) {
          workerErrorRef.current = nextWorkerError;
          setWorkerError(nextWorkerError);
        }
        processingFailureCountRef.current += 1;
        emitPipelineEvent({
          phase: "crawl.queued",
          step: "popup.worker.status.error",
          target: { sessionId: activeFolderId },
          result: "error",
          requestId: statusRequestId,
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
    backendWorkUiState,
    backendReachability,
    setWorkerStatus
  };
}
