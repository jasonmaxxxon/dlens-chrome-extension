import assert from "node:assert/strict";
import test from "node:test";

import {
  appendQaTraceEntry,
  emitPipelineEvent,
  isQaTraceFlagEnabled,
  qaTraceTestables,
  readQaTrace,
  type QaTraceEntry
} from "../src/ui/qa-trace.ts";

function fakeStorage(value: string | null) {
  return {
    getItem(key: string) {
      return key === "__DLENS_QA_TRACE__" ? value : null;
    }
  };
}

test("isQaTraceFlagEnabled accepts explicit truthy trace flags only", () => {
  assert.equal(isQaTraceFlagEnabled("1"), true);
  assert.equal(isQaTraceFlagEnabled("true"), true);
  assert.equal(isQaTraceFlagEnabled("yes"), true);
  assert.equal(isQaTraceFlagEnabled("0"), false);
  assert.equal(isQaTraceFlagEnabled(null), false);
});

test("appendQaTraceEntry caps the trace buffer", () => {
  const entries: QaTraceEntry[] = [
    { id: 1, phase: "hover.detected", step: "old", target: {}, result: "ok", at: 1, isoTime: "2026-06-10T00:00:00.000Z" },
    { id: 2, phase: "preview.confirmed", step: "middle", target: {}, result: "ok", at: 2, isoTime: "2026-06-10T00:00:01.000Z" }
  ];

  const capped = appendQaTraceEntry(entries, {
    id: 3,
    phase: "signal.saved",
    step: "new",
    target: {},
    result: "ok",
    at: 3,
    isoTime: "2026-06-10T00:00:02.000Z"
  }, 2);

  assert.deepEqual(capped.map((entry) => entry.step), ["middle", "new"]);
});

test("qa trace can be enabled from query or hash URL params", () => {
  assert.equal(qaTraceTestables.readUrlTraceFlag({ search: "?dlensQaTrace=1", hash: "" } as Location), true);
  assert.equal(qaTraceTestables.readUrlTraceFlag({ search: "", hash: "#dlensQaTrace=true" } as Location), true);
  assert.equal(qaTraceTestables.readUrlTraceFlag({ search: "?dlensQaTrace=0", hash: "" } as Location), false);
});

test("qa trace typed adapter writes only when the session flag is enabled", () => {
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
    assert.deepEqual(readQaTrace(), []);

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
      step: "enabled",
      target: { sessionId: "session-1" },
      result: "ok",
      detail: { ok: true }
    });
    const trace = readQaTrace();

    assert.equal(trace.length, 1);
    assert.equal(trace[0]?.phase, "signal.saved");
    assert.equal(trace[0]?.step, "enabled");
    assert.deepEqual(trace[0]?.detail, { ok: true });
    assert.equal(debugCalls.length, 2);
    assert.match(String(debugCalls[1]?.[0] ?? ""), /^\[DLens Pipeline JSON\] /);
    assert.equal(domNodes.length, 1);
    assert.equal(domNodes[0]?.id, "__dlens_qa_trace_json__");
    assert.deepEqual(JSON.parse(domNodes[0]?.textContent || "[]").map((entry: QaTraceEntry) => entry.phase), ["signal.saved"]);
  } finally {
    console.debug = originalDebug;
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  }
});
