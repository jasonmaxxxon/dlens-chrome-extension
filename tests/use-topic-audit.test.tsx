import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import type { ExtensionResponse } from "../src/state/messages.ts";
import type { TopicAuditRunStatus } from "../src/compare/topic-audit-envelope-contract.ts";
import type { SessionRecord, Topic } from "../src/state/types.ts";
import { useTopicAudit, withTopicAuditRunTimeout } from "../src/ui/useTopicAudit.ts";

function makeSession(id: string, mode: SessionRecord["mode"]): SessionRecord {
  return {
    id,
    name: id,
    mode,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    items: []
  };
}

const topic = {
  id: "topic-1",
  sessionId: "topic-session",
  name: "Topic",
  signalIds: [],
  updatedAt: "2026-07-15T00:00:00.000Z"
} as Topic;

function makeRunStatus(overrides: Partial<TopicAuditRunStatus> = {}): TopicAuditRunStatus {
  return {
    sessionId: "topic-session",
    topicId: "topic-1",
    requestId: "persisted-request",
    state: "running",
    stage: "narrative",
    startedAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:01:00.000Z",
    expiresAt: "2026-07-17T00:16:00.000Z",
    ...overrides
  };
}

async function withTopicAuditHarness(
  sendAndSync: (message: { type: string }) => Promise<ExtensionResponse>,
  run: (getLatest: () => ReturnType<typeof useTopicAudit> | null, render: (popupOpen: boolean) => Promise<void>) => Promise<void>
) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement
  });
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

  let latest: ReturnType<typeof useTopicAudit> | null = null;
  function Harness({ popupOpen }: { popupOpen: boolean }) {
    latest = useTopicAudit({
      popupOpen,
      activeFolder: makeSession("topic-session", "topic"),
      topics: [topic],
      sendAndSync
    });
    return null;
  }

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  const render = async (popupOpen: boolean) => {
    await act(async () => {
      root.render(<Harness popupOpen={popupOpen} />);
      await Promise.resolve();
    });
  };
  try {
    await run(() => latest, render);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    else reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
}

test("useTopicAudit rehydrates persisted running status when the popup reopens", async () => {
  const persisted = makeRunStatus({ stage: "final", requestId: "persisted-final" });
  await withTopicAuditHarness(
    async (message) => {
      assert.equal(message.type, "topic/audit/get");
      return { ok: true, auditRunStatus: persisted };
    },
    async (getLatest, render) => {
      await render(false);
      assert.equal(getLatest()?.auditByTopicId[topic.id]?.summary.reportStatus, "none");

      await render(true);
      assert.equal(getLatest()?.auditByTopicId[topic.id]?.summary.reportStatus, "running");
      assert.deepEqual(getLatest()?.auditByTopicId[topic.id]?.auditRunStatus, persisted);
    }
  );
});

test("useTopicAudit renders handler-reconciled expired runs as failed after reopen", async () => {
  const persisted = makeRunStatus({
    state: "failed",
    stage: "narrative",
    failureKind: "interrupted",
    requestId: "reconciled-expired"
  });
  await withTopicAuditHarness(
    async () => ({ ok: true, auditRunStatus: persisted }),
    async (getLatest, render) => {
      await render(false);
      await render(true);
      assert.equal(getLatest()?.auditByTopicId[topic.id]?.summary.reportStatus, "failed");
      assert.deepEqual(getLatest()?.auditByTopicId[topic.id]?.auditRunStatus, persisted);
    }
  );
});

test("useTopicAudit clears an in-flight local run when mode changes and ignores its late response", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement
  });
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

  let resolveRun: ((response: ExtensionResponse) => void) | undefined;
  const pendingRun = new Promise<ExtensionResponse>((resolve) => {
    resolveRun = resolve;
  });
  const sendAndSync = () => pendingRun;
  let latest: ReturnType<typeof useTopicAudit> | null = null;

  function Harness({ activeFolder }: { activeFolder: SessionRecord }) {
    latest = useTopicAudit({
      popupOpen: false,
      activeFolder,
      topics: [topic],
      sendAndSync
    });
    return null;
  }

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  let runPromise: Promise<void> | undefined;
  try {
    await act(async () => root.render(<Harness activeFolder={makeSession("topic-session", "topic")} />));
    await act(async () => {
      runPromise = latest!.runTopicAudit("topic-1");
      await Promise.resolve();
    });
    assert.equal(latest!.auditByTopicId["topic-1"]?.summary.reportStatus, "running");

    await act(async () => root.render(<Harness activeFolder={makeSession("product-session", "product")} />));
    await act(async () => root.render(<Harness activeFolder={makeSession("topic-session", "topic")} />));
    assert.notEqual(latest!.auditByTopicId["topic-1"]?.summary.reportStatus, "running");

    await act(async () => {
      resolveRun?.({ ok: true });
      await runPromise;
    });
    assert.notEqual(latest!.auditByTopicId["topic-1"]?.summary.reportStatus, "running");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    else reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

test("withTopicAuditRunTimeout rejects a run that exceeds the total guard", async () => {
  await assert.rejects(
    () => withTopicAuditRunTimeout(new Promise<ExtensionResponse>(() => undefined), 5),
    /超過總時限/
  );
});
