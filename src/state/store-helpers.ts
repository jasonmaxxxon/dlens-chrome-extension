import type { CaptureTargetResponse } from "../contracts/ingest.ts";
import type { TargetDescriptor } from "../contracts/target-descriptor.ts";
import type { CaptureSnapshot, JobSnapshot } from "../contracts/ingest.ts";
import { extractCommentsPreview } from "./comment-preview.ts";
import type {
  ExtensionGlobalState,
  FolderMode,
  SessionItem,
  SessionItemStatus,
  SessionRecord,
  TabUiState
} from "./types.ts";

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function normalizePostUrl(postUrl: string): string {
  const trimmed = String(postUrl || "").trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.search = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/+$/, "");
  }
}

export function getActiveSession(globalState: ExtensionGlobalState): SessionRecord | null {
  if (!globalState.activeSessionId) {
    return null;
  }
  return globalState.sessions.find((session) => session.id === globalState.activeSessionId) || null;
}

export function getSessionById(globalState: ExtensionGlobalState, sessionId: string): SessionRecord | null {
  return globalState.sessions.find((session) => session.id === sessionId) || null;
}

export function getActiveItem(globalState: ExtensionGlobalState, tabState: TabUiState): SessionItem | null {
  const session = getActiveSession(globalState);
  if (!session || !tabState.activeItemId) {
    return null;
  }
  return session.items.find((item) => item.id === tabState.activeItemId) || null;
}

export function createSessionRecord(name: string, now = new Date().toISOString()): SessionRecord {
  return {
    id: generateId("session"),
    name: name.trim(),
    mode: "topic",
    createdAt: now,
    updatedAt: now,
    items: []
  };
}

export function normalizeSessionRecord(raw: SessionRecord): SessionRecord {
  return {
    ...raw,
    mode: (raw.mode as FolderMode) ?? "topic"
  };
}

export function createSessionItem(descriptor: TargetDescriptor, now = new Date().toISOString()): SessionItem {
  return {
    id: generateId("item"),
    descriptor,
    status: "saved",
    selectedAt: descriptor.captured_at || now,
    savedAt: now,
    queuedAt: null,
    completedAt: null,
    captureId: null,
    jobId: null,
    canonicalTargetUrl: null,
    latestJob: null,
    latestCapture: null,
    commentsPreview: [],
    lastStatusAt: now,
    lastErrorKind: null,
    lastError: null
  };
}

export function setActiveSession(globalState: ExtensionGlobalState, sessionId: string): ExtensionGlobalState {
  const now = new Date().toISOString();
  return {
    ...globalState,
    activeSessionId: sessionId,
    updatedAt: now
  };
}

export function upsertSession(globalState: ExtensionGlobalState, session: SessionRecord): ExtensionGlobalState {
  const sessions = globalState.sessions.some((current) => current.id === session.id)
    ? globalState.sessions.map((current) => (current.id === session.id ? session : current))
    : [...globalState.sessions, session];

  return {
    ...globalState,
    sessions,
    updatedAt: new Date().toISOString()
  };
}

export function renameSession(globalState: ExtensionGlobalState, sessionId: string, name: string): ExtensionGlobalState {
  const now = new Date().toISOString();
  return {
    ...globalState,
    sessions: globalState.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            name: name.trim(),
            updatedAt: now
          }
        : session
    ),
    updatedAt: now
  };
}

export function deleteSession(globalState: ExtensionGlobalState, sessionId: string): ExtensionGlobalState {
  const now = new Date().toISOString();
  const sessions = globalState.sessions.filter((session) => session.id !== sessionId);
  const activeSessionId =
    globalState.activeSessionId === sessionId ? sessions[0]?.id || null : globalState.activeSessionId;

  return {
    ...globalState,
    sessions,
    activeSessionId,
    updatedAt: now
  };
}

export function saveDescriptorToSession(
  globalState: ExtensionGlobalState,
  sessionId: string,
  descriptor: TargetDescriptor
): { globalState: ExtensionGlobalState; item: SessionItem } {
  const now = new Date().toISOString();
  let savedItem: SessionItem | null = null;
  const normalizedUrl = normalizePostUrl(descriptor.post_url);

  const sessions = globalState.sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    const existing = session.items.find((item) => normalizePostUrl(item.descriptor.post_url) === normalizedUrl);
    if (existing) {
      savedItem = {
        ...existing,
        descriptor,
        selectedAt: descriptor.captured_at || existing.selectedAt,
        lastStatusAt: now
      };
      return {
        ...session,
        updatedAt: now,
        items: session.items.map((item) => (item.id === existing.id ? savedItem! : item))
      };
    }

    savedItem = createSessionItem(descriptor, now);
    return {
      ...session,
      updatedAt: now,
      items: [...session.items, savedItem]
    };
  });

  if (!savedItem) {
    throw new Error("Session not found.");
  }

  return {
    globalState: {
      ...globalState,
      sessions,
      updatedAt: now
    },
    item: savedItem
  };
}

function mapLifecycleStatus(job: JobSnapshot | null, capture: CaptureSnapshot | null, fallback: SessionItemStatus): SessionItemStatus {
  if (job) {
    switch (toLocalJobStatus(job)) {
      case "queued":
        return "queued";
      case "running":
        return "running";
      case "succeeded":
        return "succeeded";
      case "dead":
        return "failed";
      default:
        return fallback;
    }
  }

  switch (capture?.ingestion_status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    default:
      return fallback;
  }
}

export function needsCaptureRefresh(item: SessionItem): boolean {
  if (!item.jobId || !item.captureId) {
    return false;
  }
  if (item.status === "queued" || item.status === "running") {
    return true;
  }
  if (item.status !== "succeeded") {
    return false;
  }
  const analysisStatus = item.latestCapture?.analysis?.status;
  return analysisStatus == null || analysisStatus === "pending" || analysisStatus === "running";
}

export const STALE_IN_FLIGHT_TIMEOUT_MS = 5 * 60 * 1000;

function staleInFlightError(item: SessionItem): string {
  const label = item.status === "succeeded" ? "analysis" : "backend";
  return `No backend status update for over 5 minutes while waiting on ${label}. Retry from Library.`;
}

function isStaleInFlightItem(item: SessionItem, nowMs: number, timeoutMs: number): boolean {
  if (!needsCaptureRefresh(item)) {
    return false;
  }
  const lastStatusMs = item.lastStatusAt ? Date.parse(item.lastStatusAt) : NaN;
  if (!Number.isFinite(lastStatusMs)) {
    return false;
  }
  return nowMs - lastStatusMs >= timeoutMs;
}

export function expireStaleInFlightItems(
  globalState: ExtensionGlobalState,
  now = new Date().toISOString(),
  timeoutMs = STALE_IN_FLIGHT_TIMEOUT_MS
): ExtensionGlobalState {
  const nowMs = Date.parse(now);
  let changed = false;
  const sessions = globalState.sessions.map((session) => {
    let sessionChanged = false;
    const items = session.items.map((item) => {
      if (!isStaleInFlightItem(item, nowMs, timeoutMs)) {
        return item;
      }
      sessionChanged = true;
      changed = true;
      return {
        ...item,
        status: "failed" as const,
        completedAt: now,
        lastStatusAt: now,
        lastErrorKind: "stale_timeout",
        lastError: staleInFlightError(item)
      };
    });
    if (!sessionChanged) {
      return session;
    }
    return {
      ...session,
      updatedAt: now,
      items
    };
  });

  if (!changed) {
    return globalState;
  }
  return {
    ...globalState,
    sessions,
    updatedAt: now
  };
}

export function markSessionItemQueued(
  item: SessionItem,
  submit: CaptureTargetResponse,
  job: JobSnapshot | null
): SessionItem {
  const now = new Date().toISOString();
  return {
    ...item,
    status: mapLifecycleStatus(job, null, "queued"),
    queuedAt: item.queuedAt || now,
    captureId: submit.capture_id,
    jobId: submit.job_id,
    canonicalTargetUrl: submit.canonical_target_url,
    latestJob: job,
    latestCapture: item.latestCapture,
    commentsPreview: item.commentsPreview,
    lastStatusAt: now,
    lastErrorKind: job?.last_error_kind ?? null,
    lastError: job?.last_error ?? null
  };
}

export function reconcileSessionItem(item: SessionItem, job: JobSnapshot | null, capture: CaptureSnapshot | null): SessionItem {
  const status = mapLifecycleStatus(job, capture, item.status);
  const now = new Date().toISOString();
  return {
    ...item,
    status,
    captureId: capture?.id || item.captureId,
    jobId: job?.id || item.jobId,
    canonicalTargetUrl: capture?.canonical_target_url || item.canonicalTargetUrl,
    latestJob: job || item.latestJob,
    latestCapture: capture || item.latestCapture,
    commentsPreview: status === "succeeded" ? extractCommentsPreview(capture) : [],
    completedAt: status === "succeeded" || status === "failed" ? now : item.completedAt,
    lastStatusAt: now,
    lastErrorKind: job?.last_error_kind ?? null,
    lastError: job?.last_error ?? null
  };
}

export function mergeRefreshResults(
  item: SessionItem,
  jobResult: PromiseSettledResult<JobSnapshot>,
  captureResult: PromiseSettledResult<CaptureSnapshot>
): { job: JobSnapshot | null; capture: CaptureSnapshot | null } {
  const job = jobResult.status === "fulfilled" ? jobResult.value : item.latestJob;
  const capture = captureResult.status === "fulfilled" ? captureResult.value : item.latestCapture;

  if (jobResult.status === "rejected" && captureResult.status === "rejected") {
    throw jobResult.reason instanceof Error ? jobResult.reason : new Error(String(jobResult.reason));
  }

  return {
    job,
    capture
  };
}

export interface ItemRefreshResult {
  sessionId: string;
  itemId: string;
  job: JobSnapshot | null;
  capture: CaptureSnapshot | null;
}

export function mergeItemRefreshResultsIntoGlobal(
  globalState: ExtensionGlobalState,
  refreshResults: ItemRefreshResult[]
): ExtensionGlobalState {
  return refreshResults.reduce(
    (nextGlobal, result) =>
      updateSessionItem(nextGlobal, result.sessionId, result.itemId, (existing) =>
        reconcileSessionItem(existing, result.job, result.capture)
      ),
    globalState
  );
}

export function updateSessionItem(
  globalState: ExtensionGlobalState,
  sessionId: string,
  itemId: string,
  updater: (item: SessionItem) => SessionItem
): ExtensionGlobalState {
  const now = new Date().toISOString();
  return {
    ...globalState,
    sessions: globalState.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            updatedAt: now,
            items: session.items.map((item) => (item.id === itemId ? updater(item) : item))
          }
        : session
    ),
    updatedAt: now
  };
}

export function getAdjacentItemId(session: SessionRecord | null, currentItemId: string | null, direction: -1 | 1): string | null {
  if (!session?.items.length) {
    return null;
  }
  if (!currentItemId) {
    return session.items[0]?.id || null;
  }
  const index = session.items.findIndex((item) => item.id === currentItemId);
  if (index === -1) {
    return session.items[0]?.id || null;
  }
  const next = session.items[index + direction];
  return next?.id || currentItemId;
}
function toLocalJobStatus(job: JobSnapshot): "queued" | "running" | "succeeded" | "dead" {
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
