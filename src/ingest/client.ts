import type {
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

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || "GET").toUpperCase();
  const path = backendTracePath(input);
  const step = `backend.${backendTraceStep(input)}`;
  const requestId = createPipelineRequestId(step);
  emitPipelineEvent({
    phase: "backend.request",
    step: `${step}.request`,
    target: {},
    result: "pending",
    requestId,
    detail: { method, path }
  });

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {})
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
        error: message
      }
    });
    throw new Error(
      `Optional ingest backend unavailable at ${input}. Check ingestBaseUrl or start the backend. Original error: ${message}`
    );
  }
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
    throw new Error(`${response.status} ${response.statusText}: ${body || "request failed"}`);
  }
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
  return response.json() as Promise<T>;
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

export async function fetchCapture(baseUrl: string, captureId: string): Promise<CaptureSnapshot> {
  return fetchJson<CaptureSnapshot>(`${normalizeBaseUrl(baseUrl)}/captures/${captureId}`);
}

export async function triggerWorkerDrain(baseUrl: string): Promise<WorkerDrainResponse> {
  return fetchJson<WorkerDrainResponse>(`${normalizeBaseUrl(baseUrl)}/worker/drain`, {
    method: "POST"
  });
}

export async function fetchWorkerStatus(baseUrl: string): Promise<WorkerStatusResponse> {
  return fetchJson<WorkerStatusResponse>(`${normalizeBaseUrl(baseUrl)}/worker/status`);
}

export async function fetchThreadsAdvancedMetrics(baseUrl: string, postUrl: string): Promise<ThreadsAdvancedMetricsResponse> {
  return fetchJson<ThreadsAdvancedMetricsResponse>(`${normalizeBaseUrl(baseUrl)}/threads/advanced-metrics`, {
    method: "POST",
    body: JSON.stringify({ post_url: postUrl })
  });
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
