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
import { assertRemoteIngestOriginGranted } from "./host-permission.ts";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace.ts";

const DEFAULT_INGEST_REQUEST_TIMEOUT_MS = 30_000;
const ADVANCED_METRICS_REQUEST_TIMEOUT_MS = 120_000;

export function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || "").trim().replace(/\/+$/, "") || "http://127.0.0.1:8000";
}

/** Settings token is sent as a bearer credential when the ingest backend requires one. */
export const INGEST_AUTHORIZATION_SCHEME = "Bearer";

export interface IngestRequestTarget {
  baseUrl: string;
  apiToken?: string | null;
}

export function ingestTargetFromSettings(
  settings: { ingestBaseUrl?: string | null; ingestApiToken?: string | null } | null | undefined
): IngestRequestTarget {
  return {
    baseUrl: settings?.ingestBaseUrl || "",
    apiToken: settings?.ingestApiToken || ""
  };
}

function resolveIngestRequest(target: string | IngestRequestTarget): { baseUrl: string; apiToken: string } {
  if (typeof target === "string") {
    return { baseUrl: normalizeBaseUrl(target), apiToken: "" };
  }
  return {
    baseUrl: normalizeBaseUrl(target.baseUrl),
    apiToken: String(target.apiToken || "").trim()
  };
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  return { ...(headers as Record<string, string>) };
}

/** Omits the header when no token is configured, so a local backend without auth still accepts the call. */
export function withIngestAuth(apiToken: string, init?: RequestInit): RequestInit {
  const headers = headerRecord(init?.headers);
  if (apiToken) {
    headers.Authorization = `${INGEST_AUTHORIZATION_SCHEME} ${apiToken}`;
  } else {
    delete headers.Authorization;
    delete headers.authorization;
  }
  return { ...init, headers };
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
  await assertRemoteIngestOriginGranted(input);
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
      throw Object.assign(new Error(`${response.status} ${response.statusText}: ${body || "request failed"}`), { status: response.status });
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

/** Waits before each retry of a capture that the backend never stored: about 40 s in all, enough for a
 * database that drops out briefly after the laptop wakes. */
export const CAPTURE_TARGET_RETRY_DELAYS_MS = [4_000, 12_000, 24_000] as const;

/** Each POST creates a capture and a crawl job, so only retry when nothing was stored: the backend answered
 * 5xx (the transaction failed) or could not be reached at all. A timeout may have stored the capture, so it is not retried. */
function captureTargetNotStored(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "TimeoutError" || error.name === "AbortError") return false;
  const status = (error as Error & { status?: number }).status;
  return typeof status === "number" ? status >= 500 : error.message.startsWith("Optional ingest backend unavailable");
}

export async function submitCaptureTarget(
  target: string | IngestRequestTarget,
  descriptor: TargetDescriptor,
  folderName?: string,
  retryDelaysMs: readonly number[] = CAPTURE_TARGET_RETRY_DELAYS_MS
): Promise<CaptureTargetResponse> {
  const endpoint = resolveIngestRequest(target);
  const requestBody = JSON.stringify(buildCaptureTargetRequest(descriptor, folderName));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchJson<CaptureTargetResponse>(`${endpoint.baseUrl}/capture-target`, withIngestAuth(endpoint.apiToken, {
        method: "POST",
        body: requestBody
      }));
    } catch (error) {
      if (attempt >= retryDelaysMs.length || !captureTargetNotStored(error)) throw error;
      await new Promise((resolve) => globalThis.setTimeout(resolve, retryDelaysMs[attempt]));
    }
  }
}

const cancelUnsupported = new Set<string>();
export async function cancelJob(target: string | IngestRequestTarget, jobId: string): Promise<"cancelled" | "running" | "unsupported"> {
  const endpoint = resolveIngestRequest(target);
  if (cancelUnsupported.has(endpoint.baseUrl)) return "unsupported";
  try {
    await fetchJson(`${endpoint.baseUrl}/jobs/${encodeURIComponent(jobId)}/cancel`, withIngestAuth(endpoint.apiToken, { method: "POST" }));
    return "cancelled";
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || status === 405) { cancelUnsupported.add(endpoint.baseUrl); return "unsupported"; }
    if (status === 409) return "running";
    throw error;
  }
}

export async function fetchJob(target: string | IngestRequestTarget, jobId: string): Promise<JobSnapshot> {
  const endpoint = resolveIngestRequest(target);
  return fetchJson<JobSnapshot>(`${endpoint.baseUrl}/jobs/${jobId}`, withIngestAuth(endpoint.apiToken));
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

export async function fetchCapture(target: string | IngestRequestTarget, captureId: string): Promise<CaptureSnapshot> {
  const endpoint = resolveIngestRequest(target);
  return dropRawPayload(await fetchJson<CaptureSnapshot>(`${endpoint.baseUrl}/captures/${captureId}`, withIngestAuth(endpoint.apiToken)));
}

export async function triggerWorkerDrain(target: string | IngestRequestTarget): Promise<WorkerDrainResponse> {
  const endpoint = resolveIngestRequest(target);
  return fetchJson<WorkerDrainResponse>(`${endpoint.baseUrl}/worker/drain`, withIngestAuth(endpoint.apiToken, {
    method: "POST"
  }));
}

export async function fetchWorkerStatus(target: string | IngestRequestTarget): Promise<WorkerStatusResponse> {
  const endpoint = resolveIngestRequest(target);
  return fetchJson<WorkerStatusResponse>(`${endpoint.baseUrl}/worker/status`, withIngestAuth(endpoint.apiToken));
}

export async function fetchBackendHealth(target: string | IngestRequestTarget, timeoutMs = 3000): Promise<BackendHealthResponse> {
  const endpoint = resolveIngestRequest(target);
  return fetchJson<BackendHealthResponse>(`${endpoint.baseUrl}/health`, withIngestAuth(endpoint.apiToken), timeoutMs);
}

export async function fetchThreadsAdvancedMetrics(target: string | IngestRequestTarget, postUrl: string): Promise<ThreadsAdvancedMetricsResponse> {
  const endpoint = resolveIngestRequest(target);
  return fetchJson<ThreadsAdvancedMetricsResponse>(`${endpoint.baseUrl}/threads/advanced-metrics`, withIngestAuth(endpoint.apiToken, {
    method: "POST",
    body: JSON.stringify({ post_url: postUrl })
  }), ADVANCED_METRICS_REQUEST_TIMEOUT_MS);
}

export function toSidebarJobStatus(job: JobSnapshot): SidebarJobStatus {
  switch (job.status) {
    case "pending":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "cancelled":
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
