import assert from "node:assert/strict";
import test from "node:test";

import {
  appendPipelineTraceEntry,
  appendExternalPipelineTraceEntry,
  emitPipelineEvent,
  isPipelineEvent,
  isQaTraceFlagEnabled,
  PIPELINE_PHASES,
  pipelineTraceTestables,
  readPipelineTrace,
  setPipelineTraceMirrorTab,
  type PipelineTraceEntry
} from "../src/state/pipeline-trace.ts";

function fakeStorage(value: string | null) {
  return {
    getItem(key: string) {
      return key === "__DLENS_QA_TRACE__" ? value : null;
    }
  };
}

test("pipeline phases lock the full live backend and LLM spine", () => {
  assert.deepEqual(PIPELINE_PHASES, [
    "hover.detected",
    "preview.confirmed",
    "signal.saved",
    "backend.request",
    "crawl.queued",
    "capture.ready",
    "llm.call",
    "analysis.ready",
    "ui.ready"
  ]);
});

test("isPipelineEvent validates phase, target object, and result", () => {
  assert.equal(isPipelineEvent({
    phase: "signal.saved",
    step: "popup.button.response",
    target: { sessionId: "session-1" },
    result: "ok",
    requestId: "save-req-1",
    at: 1
  }), true);
  assert.equal(isPipelineEvent({
    phase: "signal.saved",
    step: "popup.button.response",
    target: { sessionId: "session-1" },
    result: "ok",
    requestId: "",
    at: 1
  }), false);
  assert.equal(isPipelineEvent({
    phase: "legacy.string",
    step: "popup.button.response",
    target: { sessionId: "session-1" },
    result: "ok",
    at: 1
  }), false);
  assert.equal(isPipelineEvent({
    phase: "signal.saved",
    step: "popup.button.response",
    result: "ok",
    at: 1
  }), false);
});

test("appendPipelineTraceEntry caps the trace buffer", () => {
  const entries: PipelineTraceEntry[] = [
    { id: 1, phase: "hover.detected", step: "old", target: {}, result: "ok", at: 1, isoTime: "2026-06-12T00:00:00.000Z" },
    { id: 2, phase: "preview.confirmed", step: "middle", target: {}, result: "ok", at: 2, isoTime: "2026-06-12T00:00:01.000Z" }
  ];

  const capped = appendPipelineTraceEntry(entries, {
    id: 3,
    phase: "signal.saved",
    step: "new",
    target: {},
    result: "ok",
    at: 3,
    isoTime: "2026-06-12T00:00:02.000Z"
  }, 2);

  assert.deepEqual(capped.map((entry) => entry.step), ["middle", "new"]);
});

test("appendPipelineTraceEntry keeps a full live run by default", () => {
  const entries: PipelineTraceEntry[] = Array.from({ length: 2499 }, (_, index) => ({
    id: index + 1,
    phase: "backend.request",
    step: `backend.poll.${index + 1}`,
    target: {},
    result: "ok",
    at: index + 1,
    isoTime: "2026-06-12T00:00:00.000Z"
  }));

  const atLimit = appendPipelineTraceEntry(entries, {
    id: 2500,
    phase: "ui.ready",
    step: "popup.vm.response",
    target: {},
    result: "ok",
    at: 2500,
    isoTime: "2026-06-12T00:00:02.500Z"
  });

  const overLimit = appendPipelineTraceEntry(atLimit, {
    id: 2501,
    phase: "llm.call",
    step: "direct-llm.Google.response",
    target: {},
    result: "ok",
    at: 2501,
    isoTime: "2026-06-12T00:00:02.501Z"
  });

  assert.equal(atLimit.length, 2500);
  assert.equal(atLimit[0]?.id, 1);
  assert.equal(overLimit.length, 2500);
  assert.equal(overLimit[0]?.id, 2);
  assert.equal(overLimit.at(-1)?.phase, "llm.call");
});

test("pipeline trace can be enabled from query or hash URL params", () => {
  assert.equal(pipelineTraceTestables.readUrlTraceFlag({ search: "?dlensQaTrace=1", hash: "" } as Location), true);
  assert.equal(pipelineTraceTestables.readUrlTraceFlag({ search: "", hash: "#dlensQaTrace=true" } as Location), true);
  assert.equal(pipelineTraceTestables.readUrlTraceFlag({ search: "?dlensQaTrace=0", hash: "" } as Location), false);
  assert.equal(isQaTraceFlagEnabled("yes"), true);
});

test("emitPipelineEvent writes structured events only when the trace flag is enabled", () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalDebug = console.debug;
  const debugCalls: unknown[] = [];
  const domNodes: any[] = [];
  console.debug = (...args: unknown[]) => {
    debugCalls.push(args);
  };

  try {
    (globalThis as any).window = {
      location: { search: "", hash: "" },
      sessionStorage: fakeStorage(null),
      localStorage: fakeStorage(null)
    };
    emitPipelineEvent({
      phase: "signal.saved",
      step: "disabled",
      target: { sessionId: "session-1" },
      result: "ok",
      detail: { ok: false }
    });
    assert.deepEqual(readPipelineTrace(), []);

    (globalThis as any).window = {
      location: { search: "", hash: "" },
      sessionStorage: fakeStorage("1"),
      localStorage: fakeStorage(null)
    };
    (globalThis as any).document = {
      getElementById(id: string) {
        return domNodes.find((node) => node.id === id) ?? null;
      },
      createElement(tagName: string) {
        return {
          tagName: tagName.toUpperCase(),
          id: "",
          type: "",
          textContent: "",
          attributes: {} as Record<string, string>,
          setAttribute(name: string, value: string) {
            this.attributes[name] = value;
          }
        };
      },
      documentElement: {
        appendChild(node: any) {
          domNodes.push(node);
          return node;
        }
      }
    };
    emitPipelineEvent({
      phase: "signal.saved",
      step: "popup.button.response",
      target: { sessionId: "session-1", itemId: "item-1" },
      result: "ok",
      requestId: "save-req-2",
      detail: { ok: true }
    });
    const trace = readPipelineTrace();

    assert.equal(trace.length, 1);
    assert.equal(trace[0]?.phase, "signal.saved");
    assert.equal(trace[0]?.step, "popup.button.response");
    assert.equal(trace[0]?.requestId, "save-req-2");
    assert.deepEqual(trace[0]?.target, { sessionId: "session-1", itemId: "item-1" });
    assert.deepEqual(trace[0]?.detail, { ok: true });
    assert.equal("event" in (trace[0] as any), false);
    assert.equal(debugCalls.length, 2);
    assert.match(String(debugCalls[1]?.[0] ?? ""), /^\[DLens Pipeline JSON\] /);
    assert.equal(domNodes.length, 1);
    assert.equal(domNodes[0]?.id, "__dlens_qa_trace_json__");
    assert.deepEqual(JSON.parse(domNodes[0]?.textContent || "[]").map((entry: PipelineTraceEntry) => entry.phase), ["signal.saved"]);
  } finally {
    console.debug = originalDebug;
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  }
});

test("emitPipelineEvent supports a process trace sink for background events", () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalDebug = console.debug;
  const debugCalls: unknown[] = [];
  console.debug = (...args: unknown[]) => {
    debugCalls.push(args);
  };

  try {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    (globalThis as any).__DLENS_QA_TRACE_ENABLED__ = true;
    (globalThis as any).__DLENS_QA_TRACE__ = [];
    (globalThis as any).__DLENS_QA_TRACE_SEQ__ = 0;

    emitPipelineEvent({
      phase: "capture.ready",
      step: "background.session.refresh-all.response",
      target: { sessionId: "session-1", tabId: 3 },
      result: "ok",
      requestId: "refresh-req-1",
      detail: { itemCount: 2 }
    });

    const trace = readPipelineTrace();
    assert.equal(trace.length, 1);
    assert.equal(trace[0]?.phase, "capture.ready");
    assert.equal(trace[0]?.requestId, "refresh-req-1");
    assert.deepEqual(trace[0]?.target, { sessionId: "session-1", tabId: 3 });
    assert.equal(debugCalls.length, 2);
  } finally {
    console.debug = originalDebug;
    delete (globalThis as any).__DLENS_QA_TRACE_ENABLED__;
    delete (globalThis as any).__DLENS_QA_TRACE__;
    delete (globalThis as any).__DLENS_QA_TRACE_SEQ__;
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  }
});

test("process trace events can mirror to the active trace tab", () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalChrome = (globalThis as any).chrome;
  const originalDebug = console.debug;
  const sentMessages: any[] = [];
  console.debug = () => undefined;

  try {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    (globalThis as any).chrome = {
      tabs: {
        sendMessage(tabId: number, message: unknown) {
          sentMessages.push({ tabId, message });
          return Promise.resolve();
        }
      }
    };
    (globalThis as any).__DLENS_QA_TRACE_ENABLED__ = true;
    (globalThis as any).__DLENS_QA_TRACE__ = [];
    (globalThis as any).__DLENS_QA_TRACE_SEQ__ = 0;
    setPipelineTraceMirrorTab(42);

    emitPipelineEvent({
      phase: "backend.request",
      step: "backend.worker-status.response",
      target: {},
      result: "ok",
      requestId: "backend-1",
      detail: { status: 200 }
    });

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0]?.tabId, 42);
    assert.equal(sentMessages[0]?.message?.type, "pipeline-trace/background-event");
    assert.equal(sentMessages[0]?.message?.event?.phase, "backend.request");
    assert.equal(sentMessages[0]?.message?.event?.detail?.status, 200);
  } finally {
    setPipelineTraceMirrorTab(null);
    console.debug = originalDebug;
    delete (globalThis as any).__DLENS_QA_TRACE_ENABLED__;
    delete (globalThis as any).__DLENS_QA_TRACE__;
    delete (globalThis as any).__DLENS_QA_TRACE_SEQ__;
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).chrome = originalChrome;
  }
});

test("external background entries append to the page trace with original timing", () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalDebug = console.debug;
  const domNodes: any[] = [];
  console.debug = () => undefined;

  try {
    (globalThis as any).window = {
      location: { search: "", hash: "" },
      sessionStorage: fakeStorage("1"),
      localStorage: fakeStorage(null)
    };
    (globalThis as any).document = {
      getElementById(id: string) {
        return domNodes.find((node) => node.id === id) ?? null;
      },
      createElement(tagName: string) {
        return {
          tagName: tagName.toUpperCase(),
          id: "",
          type: "",
          textContent: "",
          attributes: {} as Record<string, string>,
          setAttribute(name: string, value: string) {
            this.attributes[name] = value;
          }
        };
      },
      documentElement: {
        appendChild(node: any) {
          domNodes.push(node);
          return node;
        }
      }
    };

    appendExternalPipelineTraceEntry({
      id: 9,
      phase: "llm.call",
      step: "direct-llm.Google.response",
      target: {},
      result: "ok",
      requestId: "llm-1",
      detail: { provider: "Google" },
      at: 12.5,
      isoTime: "2026-06-12T00:00:02.500Z"
    });

    const trace = readPipelineTrace();
    assert.equal(trace.length, 1);
    assert.equal(trace[0]?.phase, "llm.call");
    assert.equal(trace[0]?.at, 12.5);
    assert.equal(trace[0]?.isoTime, "2026-06-12T00:00:02.500Z");
    assert.deepEqual(JSON.parse(domNodes[0]?.textContent || "[]").map((entry: PipelineTraceEntry) => entry.phase), ["llm.call"]);
  } finally {
    console.debug = originalDebug;
    delete (globalThis as any).__DLENS_QA_TRACE__;
    delete (globalThis as any).__DLENS_QA_TRACE_SEQ__;
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  }
});
