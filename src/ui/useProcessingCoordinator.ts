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

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage, shouldApplyResponse?: () => boolean) => Promise<T>;
const BACKEND_HEALTH_HEARTBEAT_MS = 12000;
const PROCESSING_REQUEST_TIMEOUT_MS = 30000;

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
  const workerGenerationRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const backendHealthFailureCountRef = useRef(0);
  const verifiedHealthBaseUrlRef = useRef<string | null>(null);
  const lastVerifiedWorkerSnapshotRef = useRef<{
    workerStatus: WorkerStatus;
    workState: BackendWorkUiState;
    verifiedAt: string;
  } | null>(null);
  const dataRefreshErrorRef = useRef<string | null>(null);
  const [dataRefreshError, setDataRefreshError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryProcessingStatus = useCallback(() => setRetryAttempt((attempt) => attempt + 1), []);
  const lastKnownWorkerStatusRef = useRef<WorkerStatus>("idle");
  const workerStatusStateRef = useRef<WorkerStatus | null>(null);
  const workerErrorRef = useRef<string | null>(null);
  const backendWorkUiStateRef = useRef<BackendWorkUiState>({ kind: "unknown" });
  const backendReachabilityRef = useRef<BackendReachability>("unknown");
  const [workerStatus, setWorkerStatusState] = useState<WorkerStatus | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [backendWorkUiState, setBackendWorkUiState] = useState<BackendWorkUiState>({ kind: "unknown" });
  const [backendReachability, setBackendReachability] = useState<BackendReachability>("unknown");
  const setWorkerStatus = useCallback((status: WorkerStatus) => {
    workerGenerationRef.current += 1;
    processingFailureCountRef.current = 0;
    // Callers use this only after a start/queue acknowledgement. Publish that
    // activity immediately without treating it as a verified status snapshot.
    const workState: BackendWorkUiState = { kind: status };
    if (!sameBackendWorkUiState(backendWorkUiStateRef.current, workState)) {
      backendWorkUiStateRef.current = workState;
      setBackendWorkUiState(workState);
    }
    if (workerErrorRef.current !== null) {
      workerErrorRef.current = null;
      setWorkerError(null);
    }
    lastKnownWorkerStatusRef.current = status;
    if (workerStatusStateRef.current !== status) {
      workerStatusStateRef.current = status;
      setWorkerStatusState(status);
    }
  }, []);

  useEffect(() => {
    if (!popupOpen) {
      backendHealthFailureCountRef.current = 0;
      verifiedHealthBaseUrlRef.current = null;
      if (backendReachabilityRef.current !== "unknown") {
        backendReachabilityRef.current = "unknown";
        setBackendReachability("unknown");
      }
      return;
    }

    let cancelled = false;
    let timeoutHandle: number | null = null;
    const baseUrl = ingestBaseUrl || "http://127.0.0.1:8000";
    if (verifiedHealthBaseUrlRef.current !== baseUrl && backendReachabilityRef.current !== "unknown") {
      backendHealthFailureCountRef.current = 0;
      backendReachabilityRef.current = "unknown";
      setBackendReachability("unknown");
    }

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
        verifiedHealthBaseUrlRef.current = baseUrl;
        if (backendReachabilityRef.current !== "reachable") {
          backendReachabilityRef.current = "reachable";
          setBackendReachability("reachable");
        }
      } catch {
        if (cancelled) {
          return;
        }
        backendHealthFailureCountRef.current += 1;
        const nextReachability = projectBackendReachability(backendHealthFailureCountRef.current, verifiedHealthBaseUrlRef.current === baseUrl);
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
  }, [popupOpen, ingestBaseUrl, retryAttempt]);

  useEffect(() => {
    if (!popupOpen) {
      lastKnownWorkerStatusRef.current = "idle";
      lastVerifiedWorkerSnapshotRef.current = null;
      if (workerStatusStateRef.current !== null) {
        workerStatusStateRef.current = null;
        setWorkerStatusState(null);
      }
      if (workerErrorRef.current !== null) {
        workerErrorRef.current = null;
        setWorkerError(null);
      }
      if (backendWorkUiStateRef.current.kind !== "unknown") {
        backendWorkUiStateRef.current = { kind: "unknown" };
        setBackendWorkUiState(backendWorkUiStateRef.current);
      }
      if (dataRefreshErrorRef.current !== null) {
        dataRefreshErrorRef.current = null;
        setDataRefreshError(null);
      }
      processingFailureCountRef.current = 0;
      return;
    }

    let cancelled = false;
    let timeoutHandle: number | null = null;
    let statusTimeoutHandle: number | null = null;
    const clearStatusTimeout = () => {
      if (statusTimeoutHandle !== null) window.clearTimeout(statusTimeoutHandle);
      statusTimeoutHandle = null;
    };

    async function awaitResponse<T>(request: Promise<T>, onTimeout?: () => void): Promise<T> {
      try {
        return await Promise.race([
          request,
          new Promise<never>((_, reject) => {
            statusTimeoutHandle = window.setTimeout(() => {
              onTimeout?.();
              reject(new Error("Processing request timed out"));
            }, PROCESSING_REQUEST_TIMEOUT_MS);
          })
        ]);
      } finally {
        clearStatusTimeout();
      }
    }

    async function runCoordinator() {
      const generation = workerGenerationRef.current;
      const isCurrent = () => !cancelled && generation === workerGenerationRef.current;
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
        const workerResponse = await awaitResponse(sendExtensionMessage<WorkerStatusMessageResponse>({
          type: "worker/get-status",
          requestId: statusRequestId
        }));
        if (!workerResponse.ok) {
          throw new Error(workerResponse.error);
        }
        if (!isCurrent()) return;
        const nextWorkerStatus = workerResponse.workerStatus;
        const previousWorkerStatus = lastKnownWorkerStatusRef.current;
        lastKnownWorkerStatusRef.current = nextWorkerStatus;
        if (workerStatusStateRef.current !== nextWorkerStatus) {
          workerStatusStateRef.current = nextWorkerStatus;
          setWorkerStatusState(nextWorkerStatus);
        }
        const nextBackendWorkUiState = workerResponse.backendWorkUiState ?? { kind: nextWorkerStatus };
        // The clock belongs to the hook. Keep verification times in a ref so
        // identical healthy polls retain React identity and do not repaint.
        lastVerifiedWorkerSnapshotRef.current = {
          workerStatus: nextWorkerStatus,
          workState: nextBackendWorkUiState,
          verifiedAt: new Date().toISOString()
        };
        processingFailureCountRef.current = 0;
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
        if (!refreshInFlightRef.current && activeFolderId && (dataRefreshErrorRef.current !== null || shouldRefreshProcessingFolder({
          workerStatus: nextWorkerStatus,
          previousWorkerStatus,
          hasInflight
        }))) {
          const refreshRequestId = createPipelineRequestId("popup-worker-refresh");
          emitPipelineEvent({
            phase: "capture.ready",
            step: "popup.worker.refresh.request",
            target: { sessionId: activeFolderId },
            result: "pending",
            requestId: refreshRequestId,
            detail: { workerStatus: nextWorkerStatus }
          });
          let expired = false;
          refreshInFlightRef.current = true;
          try {
            const refreshResponse = await awaitResponse(sendAndSync({
              type: "session/refresh-all",
              requestId: refreshRequestId,
              target: { sessionId: activeFolderId }
            }, () => isCurrent() && !expired).finally(() => { refreshInFlightRef.current = false; }), () => { expired = true; });
            if (!isCurrent()) return;
            if (!refreshResponse.ok) throw new Error(refreshResponse.error);
            if (dataRefreshErrorRef.current !== null) {
              dataRefreshErrorRef.current = null;
              setDataRefreshError(null);
            }
            emitPipelineEvent({
              phase: "capture.ready",
              step: "popup.worker.refresh.response",
              target: { sessionId: activeFolderId },
              result: "ok",
              requestId: refreshRequestId
            });
          } catch (error) {
            if (!isCurrent()) return;
            const message = error instanceof Error ? error.message : String(error);
            if (dataRefreshErrorRef.current !== message) {
              dataRefreshErrorRef.current = message;
              setDataRefreshError(message);
            }
            emitPipelineEvent({
              phase: "capture.ready",
              step: "popup.worker.refresh.error",
              target: { sessionId: activeFolderId },
              result: "error",
              requestId: refreshRequestId,
              detail: { error: message }
            });
          }
        }
      } catch (error) {
        if (!isCurrent()) return;
        if (workerStatusStateRef.current !== null) {
          workerStatusStateRef.current = null;
          setWorkerStatusState(null);
        }
        const unavailable: BackendWorkUiState = {
          kind: "unavailable",
          lastVerifiedAt: lastVerifiedWorkerSnapshotRef.current?.verifiedAt ?? null
        };
        if (!sameBackendWorkUiState(backendWorkUiStateRef.current, unavailable)) {
          backendWorkUiStateRef.current = unavailable;
          setBackendWorkUiState(unavailable);
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
      } finally {
        if (!cancelled) {
          const workerStatus = lastKnownWorkerStatusRef.current;
          const failureCount = processingFailureCountRef.current;
          const delayMs = getPollingDelayMs({ workerStatus, hasInflight, failureCount });
          if (delayMs != null) {
            emitPipelineEvent({
              phase: "crawl.queued",
              step: "popup.worker.next-poll",
              target: { sessionId: activeFolderId },
              result: "pending",
              detail: { delayMs, workerStatus, failureCount }
            });
            timeoutHandle = window.setTimeout(() => { void runCoordinator(); }, delayMs);
          }
        }
      }
    }

    void runCoordinator();
    return () => {
      cancelled = true;
      clearStatusTimeout();
      if (timeoutHandle != null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [popupOpen, activeFolderId, hasInflight, sendAndSync, retryAttempt]);

  return {
    workerStatus,
    workerError,
    dataRefreshError,
    lastVerifiedWorkerSnapshot: lastVerifiedWorkerSnapshotRef.current,
    retryProcessingStatus,
    backendWorkUiState,
    backendReachability,
    setWorkerStatus
  };
}
