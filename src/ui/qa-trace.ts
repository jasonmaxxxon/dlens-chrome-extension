export interface QaTraceEntry {
  id: number;
  event: string;
  at: number;
  isoTime: string;
  detail?: unknown;
}

const TRACE_KEY = "__DLENS_QA_TRACE__";
const TRACE_URL_KEY = "dlensQaTrace";
const TRACE_DOM_ID = "__dlens_qa_trace_json__";
const TRACE_MAX_ENTRIES = 500;

type TraceWindow = Window & {
  __DLENS_QA_TRACE__?: QaTraceEntry[];
  __DLENS_QA_TRACE_SEQ__?: number;
};

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

export const qaTraceTestables = {
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

export function appendQaTraceEntry(entries: QaTraceEntry[], entry: QaTraceEntry, maxEntries = TRACE_MAX_ENTRIES): QaTraceEntry[] {
  return [...entries, entry].slice(-maxEntries);
}

function mirrorTraceToDom(entries: QaTraceEntry[]): void {
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

export function markQaTrace(event: string, detail?: unknown): void {
  if (!isQaTraceEnabled() || typeof window === "undefined") {
    return;
  }

  const traceWindow = window as TraceWindow;
  const nextId = (traceWindow.__DLENS_QA_TRACE_SEQ__ ?? 0) + 1;
  traceWindow.__DLENS_QA_TRACE_SEQ__ = nextId;
  const entry: QaTraceEntry = {
    id: nextId,
    event,
    at: typeof performance !== "undefined" ? performance.now() : Date.now(),
    isoTime: new Date().toISOString(),
    detail: compactDetail(detail)
  };
  traceWindow.__DLENS_QA_TRACE__ = appendQaTraceEntry(traceWindow.__DLENS_QA_TRACE__ ?? [], entry);
  mirrorTraceToDom(traceWindow.__DLENS_QA_TRACE__);
  console.debug(`[DLens QA] ${event}`, entry);
  console.debug(`[DLens QA JSON] ${JSON.stringify(entry)}`);
}

export function readQaTrace(): QaTraceEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  return [...(((window as TraceWindow).__DLENS_QA_TRACE__) ?? [])];
}
