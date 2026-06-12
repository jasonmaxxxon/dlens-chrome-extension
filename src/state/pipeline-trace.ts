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

type TraceWindow = Window & {
  __DLENS_QA_TRACE__?: PipelineTraceEntry[];
  __DLENS_QA_TRACE_SEQ__?: number;
};

const PHASE_SET = new Set<string>(PIPELINE_PHASES);
const RESULT_SET = new Set<string>(["ok", "pending", "error"]);

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
    && typeof event.at === "number"
    && Number.isFinite(event.at);
}

export function emitPipelineEvent(event: PipelineEventInput): void {
  if (!isQaTraceEnabled() || typeof window === "undefined") {
    return;
  }

  const traceWindow = window as TraceWindow;
  const nextId = (traceWindow.__DLENS_QA_TRACE_SEQ__ ?? 0) + 1;
  traceWindow.__DLENS_QA_TRACE_SEQ__ = nextId;
  const entry: PipelineTraceEntry = {
    id: nextId,
    ...event,
    target: { ...event.target },
    at: typeof performance !== "undefined" ? performance.now() : Date.now(),
    isoTime: new Date().toISOString(),
    detail: compactDetail(event.detail)
  };
  traceWindow.__DLENS_QA_TRACE__ = appendPipelineTraceEntry(traceWindow.__DLENS_QA_TRACE__ ?? [], entry);
  mirrorTraceToDom(traceWindow.__DLENS_QA_TRACE__);
  console.debug(`[DLens Pipeline] ${entry.phase}:${entry.step}`, entry);
  console.debug(`[DLens Pipeline JSON] ${JSON.stringify(entry)}`);
}

export function readPipelineTrace(): PipelineTraceEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  return [...(((window as TraceWindow).__DLENS_QA_TRACE__) ?? [])];
}
