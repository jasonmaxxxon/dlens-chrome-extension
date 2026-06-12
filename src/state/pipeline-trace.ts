export const PIPELINE_PHASES = [
  "hover.detected",
  "preview.confirmed",
  "signal.saved",
  "crawl.queued",
  "capture.ready",
  "analysis.ready",
  "ui.ready"
] as const;

export type PipelinePhase = typeof PIPELINE_PHASES[number];
export type PipelineResult = "ok" | "pending" | "error";

export interface PipelineTarget {
  sessionId?: string;
  signalId?: string;
  itemId?: string;
  tabId?: number;
}

export interface PipelineEvent {
  phase: PipelinePhase;
  step: string;
  target: PipelineTarget;
  result: PipelineResult;
  requestId?: string;
  detail?: unknown;
  at: number;
}

export interface PipelineTraceEntry extends PipelineEvent {
  id: number;
  isoTime: string;
}

export type PipelineEventInput = Omit<PipelineEvent, "at">;

const TRACE_KEY = "__DLENS_QA_TRACE__";
const TRACE_URL_KEY = "dlensQaTrace";
const TRACE_DOM_ID = "__dlens_qa_trace_json__";
const TRACE_MAX_ENTRIES = 500;

type TraceHost = typeof globalThis & {
  __DLENS_QA_TRACE__?: PipelineTraceEntry[];
  __DLENS_QA_TRACE_SEQ__?: number;
  __DLENS_QA_TRACE_ENABLED__?: boolean;
};

const PHASE_SET = new Set<string>(PIPELINE_PHASES);
const RESULT_SET = new Set<string>(["ok", "pending", "error"]);
let pipelineRequestSequence = 0;

function traceHost(): TraceHost {
  return globalThis as TraceHost;
}

export function isQaTraceFlagEnabled(value: string | null | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function readUrlTraceFlag(locationLike: Pick<Location, "search" | "hash"> | null | undefined): boolean {
  if (!locationLike) {
    return false;
  }
  const values = [locationLike.search, locationLike.hash.replace(/^#/, "?")];
  for (const value of values) {
    if (!value) {
      continue;
    }
    try {
      const params = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
      if (isQaTraceFlagEnabled(params.get(TRACE_URL_KEY))) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function readTraceFlag(): boolean {
  if (traceHost().__DLENS_QA_TRACE_ENABLED__ === true) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    if (readUrlTraceFlag(window.location)) {
      return true;
    }
    return isQaTraceFlagEnabled(window.sessionStorage?.getItem(TRACE_KEY))
      || isQaTraceFlagEnabled(window.localStorage?.getItem(TRACE_KEY));
  } catch {
    return readUrlTraceFlag(window.location);
  }
}

export function isQaTraceEnabled(): boolean {
  return readTraceFlag();
}

export const pipelineTraceTestables = {
  readUrlTraceFlag
};

export function createPipelineRequestId(prefix = "pipeline"): string {
  const normalizedPrefix = prefix.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "pipeline";
  pipelineRequestSequence = (pipelineRequestSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${normalizedPrefix}-${Date.now().toString(36)}-${pipelineRequestSequence.toString(36)}`;
}

function compactDetail(detail: unknown): unknown {
  if (detail == null) {
    return detail;
  }
  try {
    return JSON.parse(JSON.stringify(detail));
  } catch {
    return String(detail);
  }
}

export function appendPipelineTraceEntry(
  entries: PipelineTraceEntry[],
  entry: PipelineTraceEntry,
  maxEntries = TRACE_MAX_ENTRIES
): PipelineTraceEntry[] {
  return [...entries, entry].slice(-maxEntries);
}

function mirrorTraceToDom(entries: PipelineTraceEntry[]): void {
  if (typeof document === "undefined") {
    return;
  }
  try {
    let node = document.getElementById(TRACE_DOM_ID) as HTMLScriptElement | null;
    if (!node) {
      node = document.createElement("script");
      node.id = TRACE_DOM_ID;
      node.type = "application/json";
      node.setAttribute("data-dlens-qa-trace", "true");
      document.documentElement.appendChild(node);
    }
    node.textContent = JSON.stringify(entries);
    node.setAttribute("data-count", String(entries.length));
  } catch {
    // Trace export must never affect the extension UI.
  }
}

export function isPipelineEvent(value: unknown): value is PipelineEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = value as Record<string, unknown>;
  return PHASE_SET.has(String(event.phase))
    && typeof event.step === "string"
    && event.step.trim().length > 0
    && Boolean(event.target)
    && typeof event.target === "object"
    && !Array.isArray(event.target)
    && RESULT_SET.has(String(event.result))
    && (
      event.requestId == null
      || (typeof event.requestId === "string" && event.requestId.trim().length > 0)
    )
    && typeof event.at === "number"
    && Number.isFinite(event.at);
}

export function emitPipelineEvent(event: PipelineEventInput): void {
  if (!isQaTraceEnabled()) {
    return;
  }

  const host = traceHost();
  const nextId = (host.__DLENS_QA_TRACE_SEQ__ ?? 0) + 1;
  host.__DLENS_QA_TRACE_SEQ__ = nextId;
  const entry: PipelineTraceEntry = {
    id: nextId,
    ...event,
    target: { ...event.target },
    at: typeof performance !== "undefined" ? performance.now() : Date.now(),
    isoTime: new Date().toISOString(),
    detail: compactDetail(event.detail)
  };
  host.__DLENS_QA_TRACE__ = appendPipelineTraceEntry(host.__DLENS_QA_TRACE__ ?? [], entry);
  mirrorTraceToDom(host.__DLENS_QA_TRACE__);
  console.debug(`[DLens Pipeline] ${entry.phase}:${entry.step}`, entry);
  console.debug(`[DLens Pipeline JSON] ${JSON.stringify(entry)}`);
}

export function readPipelineTrace(): PipelineTraceEntry[] {
  return [...(traceHost().__DLENS_QA_TRACE__ ?? [])];
}
