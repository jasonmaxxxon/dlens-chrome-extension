import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { CollectionSignalPacketExport } from "../src/ui/CollectionSignalPacketExport.tsx";
import { requestCollectionSignalPacketExport } from "../src/ui/useCollectionSignalPacketExport.ts";
import { session } from "./collection-browser.fixtures.ts";
import type { ExtensionMessage } from "../src/state/messages.ts";
import type { SignalPacketExportResult } from "../src/compare/signal-packet-export.ts";

const result: SignalPacketExportResult = { format: "jsonl", content: '{}\n', filename: "packet.jsonl", mimeType: "application/x-ndjson", packetCount: 1, generatedAt: "2026-10-14T00:00:00Z" };

test("export row chooses existing formats, dispatches existing export message and reports its result", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const prior = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const oldAct = environment.IS_REACT_ACT_ENVIRONMENT;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  const downloads: string[] = [], revoked: string[] = [], messages: ExtensionMessage[] = [];
  URL.createObjectURL = () => "blob:packet";
  URL.revokeObjectURL = url => { revoked.push(url); };
  dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  const root = createRoot(dom.window.document.getElementById('root')!);
  let release: (() => void) | undefined;
  const onExport = (options: { sessionId: string; format: "html" | "jsonl" }) => requestCollectionSignalPacketExport(async message => {
    messages.push(message);
    await new Promise<void>(resolve => { release = resolve; });
    return { ok: true, signalPacketExport: result };
  }, options);
  try {
    await act(async () => root.render(<CollectionSignalPacketExport sessions={[session('first', [], 'product'), session('chosen', [], 'product')]} defaultSessionId="chosen" onExport={onExport} />));
    const format = dom.window.document.querySelector<HTMLSelectElement>('[aria-label="Signal Packet 格式"]')!;
    assert.deepEqual(Array.from(format.options, option => option.value), ['html', 'jsonl']);
    await act(async () => { format.value = 'jsonl'; format.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    const button = dom.window.document.querySelector<HTMLButtonElement>('button')!;
    await act(async () => { button.click(); });
    assert.deepEqual(messages, [{ type: 'signal-packet/export', format: 'jsonl', filter: { sessionId: 'chosen' } }]);
    assert.equal(button.disabled, true);
    assert.equal(dom.window.document.querySelector('[role="status"]')?.textContent, '匯出中…');
    await act(async () => { release!(); });
    assert.equal(dom.window.document.querySelector('[data-signal-packet-export-status]')?.getAttribute('data-signal-packet-export-status'), 'exported');
    assert.match(dom.window.document.querySelector('[role="status"]')?.textContent ?? '', /1 packets · packet.jsonl/);
    assert.deepEqual(downloads, ['packet.jsonl']);
    assert.deepEqual(revoked, ['blob:packet']);
  } finally {
    await act(async () => root.unmount());
    URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
    Object.assign(globalThis, prior); environment.IS_REACT_ACT_ENVIRONMENT = oldAct;
    dom.window.close();
  }
});

test("export controller surfaces provider failure and missing payload without fabricating success", async () => {
  assert.deepEqual(await requestCollectionSignalPacketExport(async () => ({ ok: false, error: 'failed' }), { sessionId: 'product', format: 'html' }), { ok: false, error: 'failed' });
  assert.equal((await requestCollectionSignalPacketExport(async () => ({ ok: true }), { sessionId: 'product', format: 'html' })).ok, false);
});
