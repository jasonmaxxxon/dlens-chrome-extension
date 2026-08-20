import type {
  BackendHealthResponse,
  CaptureSnapshot,
  CaptureTargetRequest,
  CaptureTargetResponse,
  JobSnapshot,
  QueuedCapture,
  SidebarJobStatus,
  ThreadsAdvancedMetricsResponse,
  WorkerDrainResponse,
  WorkerStatusResponse
} from "../contracts/ingest.ts";
import { inferRouteType, inferSurfaceFromUrl, type TargetDescriptor } from "../contracts/target-descriptor";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace.ts";

const DEFAULT_INGEST_REQUEST_TIMEOUT_MS = 30_000;
const ADVANCED_METRICS_REQUEST_TIMEOUT_MS = 120_000;

export function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || "").trim().replace(/\/+$/, "") || "http://127.0.0.1:8000";
}

export function buildCaptureTargetRequest(descriptor: TargetDescriptor, folderName?: string): CaptureTargetRequest {
  const surface = inferSurfaceFromUrl(descriptor.page_url);
  const pageUrl = descriptor.page_url;
  const postUrl = descriptor.post_url || pageUrl;

  if (surface === "feed" && !/\/post\/[^/?#]+/i.test(postUrl)) {
    throw new Error("Feed capture requires a resolvable post_url. Open post detail to capture.");
  }

  return {
    source_type: "threads",
    capture_type: "post",
    page_url: pageUrl,
    post_url: postUrl,
    author_hint: descriptor.author_hint || undefined,
    text_snippet: descriptor.text_snippet || undefined,
    time_token_hint: descriptor.time_token_hint || undefined,
    dom_anchor: descriptor.dom_anchor || undefined,
    engagement: descriptor.engagement,
    captured_at: descriptor.captured_at,
    client_context: {
      route_type: inferRouteType(pageUrl),
      selection_source: "chrome_extension_v0",
      target_type: descriptor.target_type,
      surface,
      folder_name: folderName?.trim() || undefined
    }
  };
}

function backendTraceStep(input: string): string {
  try {
    const { pathname } = new URL(input);
    if (pathname === "/health") return "health";
    if (pathname === "/capture-target") return "capture-target";
    if (pathname === "/worker/status") return "worker-status";
    if (pathname === "/worker/drain") return "worker-drain";
    if (pathname.startsWith("/jobs/")) return "job";
    if (pathname.startsWith("/captures/")) return "capture";
    if (pathname === "/threads/advanced-metrics") return "threads-advanced-metrics";
    return pathname.replace(/^\/+/, "").replace(/[^a-zA-Z0-9._-]+/g, "-") || "request";
  } catch {
    return "request";
  }
}

function backendTracePath(input: string): string {
  try {
    return new URL(input).pathname || "/";
  } catch {
    return input;
  }
}

function createBoundedRequestSignal(
  callerSignal: AbortSignal | null | undefined,
  timeoutMs: number,
  timeoutError: Error
): {
  signal: AbortSignal;
  cleanup: () => void;
  didCallerAbort: () => boolean;
  didTimeout: () => boolean;
} {
  const controller = new AbortController();
  let abortKind: "caller" | "timeout" | null = null;
  const abortFromCaller = () => {
    if (abortKind) return;
    abortKind = "caller";
    controller.abort(callerSignal?.reason ?? new DOMException("Ingest backend request aborted by caller.", "AbortError"));
  };
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeoutId = globalThis.setTimeout(() => {
    if (abortKind) return;
    abortKind = "timeout";
    controller.abort(timeoutError);
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timeoutId);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    },
    didCallerAbort: () => abortKind === "caller",
    didTimeout: () => abortKind === "timeout"
  };
}

async function fetchJson<T>(
  input: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_INGEST_REQUEST_TIMEOUT_MS
): Promise<T> {
  const method = String(init?.method || "GET").toUpperCase();
  const path = backendTracePath(input);
  const step = `backend.${backendTraceStep(input)}`;
  const requestId = createPipelineRequestId(step);
  const timeoutError = new Error(`Ingest backend request timed out after ${timeoutMs} ms at ${path}.`);
  timeoutError.name = "TimeoutError";
  const boundedRequest = createBoundedRequestSignal(init?.signal, timeoutMs, timeoutError);
  emitPipelineEvent({
    phase: "backend.request",
    step: `${step}.request`,
    target: {},
    result: "pending",
    requestId,
    detail: { method, path }
  });

  let terminalEventEmitted = false;
  try {
    const response = await fetch(input, {
      ...init,
      signal: boundedRequest.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {})
      }
    });
    if (!response.ok) {
      const body = await response.text();
      emitPipelineEvent({
        phase: "backend.request",
        step: `${step}.response`,
        target: {},
        result: "error",
        requestId,
        detail: {
          method,
          path,
          status: response.status,
          ok: false,
          body: body.slice(0, 240)
        }
      });
      terminalEventEmitted = true;
      throw new Error(`${response.status} ${response.statusText}: ${body || "request failed"}`);
    }
    const body = await response.json() as T;
    emitPipelineEvent({
      phase: "backend.request",
      step: `${step}.response`,
      target: {},
      result: "ok",
      requestId,
      detail: {
        method,
        path,
        status: response.status,
        ok: true
      }
    });
    terminalEventEmitted = true;
    return body;
  } catch (error) {
    if (terminalEventEmitted) {
      throw error;
    }
    const message = boundedRequest.didTimeout()
      ? timeoutError.message
      : error instanceof Error
        ? error.message
        : String(error);
    emitPipelineEvent({
      phase: "backend.request",
      step: `${step}.response`,
      target: {},
      result: "error",
      requestId,
      detail: {
        method,
        path,
        ok: false,
        error: message,
        ...(boundedRequest.didTimeout() ? { timeoutMs, timedOut: true } : {}),
        ...(boundedRequest.didCallerAbort() ? { aborted: true } : {})
      }
    });
    if (boundedRequest.didTimeout()) {
      throw timeoutError;
    }
    if (boundedRequest.didCallerAbort()) {
      throw boundedRequest.signal.reason;
    }
    throw new Error(
      `Optional ingest backend unavailable at ${input}. Check ingestBaseUrl or start the backend. Original error: ${message}`
    );
  } finally {
    boundedRequest.cleanup();
  }
}

export async function submitCaptureTarget(
  baseUrl: string,
  descriptor: TargetDescriptor,
  folderName?: string
): Promise<CaptureTargetResponse> {
  const requestBody = buildCaptureTargetRequest(descriptor, folderName);
  return fetchJson<CaptureTargetResponse>(`${normalizeBaseUrl(baseUrl)}/capture-target`, {
    method: "POST",
    body: JSON.stringify(requestBody)
  });
}

export async function fetchJob(baseUrl: string, jobId: string): Promise<JobSnapshot> {
  return fetchJson<JobSnapshot>(`${normalizeBaseUrl(baseUrl)}/jobs/${jobId}`);
}

// `raw_payload` is crawl provenance that only the backend reads; Postgres already holds it.
// Dropping it at the transport keeps the capture mirrored into chrome.storage.local from
// carrying a second copy of the largest field on the row.
function dropRawPayload(capture: CaptureSnapshot): CaptureSnapshot {
  const next: CaptureSnapshot = { ...capture };
  delete next.raw_payload;
  if (next.result) {
    const result = { ...next.result };
    delete result.raw_payload;
    next.result = result;
  }
  return next;
}

export async function fetchCapture(baseUrl: string, captureId: string): Promise<CaptureSnapshot> {
  return dropRawPayload(await fetchJson<CaptureSnapshot>(`${normalizeBaseUrl(baseUrl)}/captures/${captureId}`));
}

export async function triggerWorkerDrain(baseUrl: string): Promise<WorkerDrainResponse> {
  return fetchJson<WorkerDrainResponse>(`${normalizeBaseUrl(baseUrl)}/worker/drain`, {
    method: "POST"
  });
}

export async function fetchWorkerStatus(baseUrl: string): Promise<WorkerStatusResponse> {
  return fetchJson<WorkerStatusResponse>(`${normalizeBaseUrl(baseUrl)}/worker/status`);
}

export async function fetchBackendHealth(baseUrl: string, timeoutMs = 3000): Promise<BackendHealthResponse> {
  return fetchJson<BackendHealthResponse>(`${normalizeBaseUrl(baseUrl)}/health`, undefined, timeoutMs);
}

export async function fetchThreadsAdvancedMetrics(baseUrl: string, postUrl: string): Promise<ThreadsAdvancedMetricsResponse> {
  return fetchJson<ThreadsAdvancedMetricsResponse>(`${normalizeBaseUrl(baseUrl)}/threads/advanced-metrics`, {
    method: "POST",
    body: JSON.stringify({ post_url: postUrl })
  }, ADVANCED_METRICS_REQUEST_TIMEOUT_MS);
}

export function toSidebarJobStatus(job: JobSnapshot): SidebarJobStatus {
  switch (job.status) {
    case "pending":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "dead":
      return "dead";
    default:
      return "queued";
  }
}

export function toQueuedCapture(response: CaptureTargetResponse, job: JobSnapshot | null = null): QueuedCapture {
  return {
    capture_id: response.capture_id,
    job_id: response.job_id,
    canonical_target_url: response.canonical_target_url,
    status: job ? toSidebarJobStatus(job) : "queued",
    last_status_at: new Date().toISOString(),
    last_error_kind: job?.last_error_kind ?? null,
    last_error: job?.last_error ?? null
  };
}

export const ingestClientTestables = {
  fetchJson
};
