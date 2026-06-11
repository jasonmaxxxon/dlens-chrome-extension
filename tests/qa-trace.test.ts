import assert from "node:assert/strict";
import test from "node:test";

import {
  appendQaTraceEntry,
  isQaTraceFlagEnabled,
  markQaTrace,
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
    { id: 1, event: "old", at: 1, isoTime: "2026-06-10T00:00:00.000Z" },
    { id: 2, event: "middle", at: 2, isoTime: "2026-06-10T00:00:01.000Z" }
  ];

  const capped = appendQaTraceEntry(entries, { id: 3, event: "new", at: 3, isoTime: "2026-06-10T00:00:02.000Z" }, 2);

  assert.deepEqual(capped.map((entry) => entry.event), ["middle", "new"]);
});

test("qa trace can be enabled from query or hash URL params", () => {
  assert.equal(qaTraceTestables.readUrlTraceFlag({ search: "?dlensQaTrace=1", hash: "" } as Location), true);
  assert.equal(qaTraceTestables.readUrlTraceFlag({ search: "", hash: "#dlensQaTrace=true" } as Location), true);
  assert.equal(qaTraceTestables.readUrlTraceFlag({ search: "?dlensQaTrace=0", hash: "" } as Location), false);
});

test("markQaTrace writes only when the session flag is enabled", () => {
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
    markQaTrace("disabled.event", { ok: false });
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
    markQaTrace("enabled.event", { ok: true });
    const trace = readQaTrace();

    assert.equal(trace.length, 1);
    assert.equal(trace[0]?.event, "enabled.event");
    assert.deepEqual(trace[0]?.detail, { ok: true });
    assert.equal(debugCalls.length, 2);
    assert.match(String(debugCalls[1]?.[0] ?? ""), /^\[DLens QA JSON\] /);
    assert.equal(domNodes.length, 1);
    assert.equal(domNodes[0]?.id, "__dlens_qa_trace_json__");
    assert.deepEqual(JSON.parse(domNodes[0]?.textContent || "[]").map((entry: QaTraceEntry) => entry.event), ["enabled.event"]);
  } finally {
    console.debug = originalDebug;
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  }
});
