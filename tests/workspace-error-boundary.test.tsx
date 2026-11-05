import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceErrorBoundary, WorkspaceErrorFallback } from "../src/ui/WorkspaceErrorBoundary";

test("workspace fallback names the error and offers a reset only when one can run", () => {
  const html = renderToStaticMarkup(<WorkspaceErrorFallback error={new Error("合成畫面錯誤")} />);
  const doc = new JSDOM(html).window.document;
  assert.match(doc.querySelector('[data-dlens-react-error-boundary]')!.textContent!, /側欄出咗問題.*合成畫面錯誤/s);
  assert.equal(doc.querySelector("button"), null);
});

test("workspace reset retries the same child locally and recovers when its render error is gone", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const prior = { window: globalThis.window, document: globalThis.document };
  const globalAct = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const priorAct = globalAct.IS_REACT_ACT_ENVIRONMENT;
  const priorError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => { errors.push(args); };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  globalAct.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  let broken = true;
  function Source() {
    if (broken) throw new Error("合成可恢復錯誤");
    return <p data-recovered="">收藏已恢復</p>;
  }
  try {
    await act(async () => root.render(<WorkspaceErrorBoundary><Source /></WorkspaceErrorBoundary>));
    assert.ok(document.querySelector('[data-dlens-react-error-boundary]'));
    const reset = document.querySelector<HTMLButtonElement>('[data-workspace-error-reset]')!;
    assert.equal(reset.textContent, "重新載入");
    assert.ok(errors.length > 0, "the render failure remains logged");
    broken = false;
    await act(async () => reset.click());
    assert.equal(document.querySelector('[data-dlens-react-error-boundary]'), null);
    assert.equal(document.querySelector('[data-recovered]')!.textContent, "收藏已恢復");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, prior);
    globalAct.IS_REACT_ACT_ENVIRONMENT = priorAct;
    console.error = priorError;
    dom.window.close();
  }
});
