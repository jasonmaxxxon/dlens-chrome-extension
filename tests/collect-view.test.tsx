import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Signal, SignalTagsRecord } from "../src/state/types.ts";
import { CollectView, collectViewTestables } from "../src/ui/CollectView.tsx";

const signals: Signal[] = [
  { id: "signal-1", sessionId: "session-1", itemId: "item-1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-23T00:00:00.000Z" },
  { id: "signal-2", sessionId: "session-1", itemId: "item-2", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-23T00:00:00.000Z" },
  { id: "signal-3", sessionId: "session-1", itemId: "item-3", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-23T00:00:00.000Z" }
];

const tagsByItemId: Record<string, SignalTagsRecord> = {
  "item-1": { itemId: "item-1", status: "complete", signalTags: ["航班", "客服"], signalGist: "航班改動後的客服抱怨", promptVersion: "v1", model: "mock", generatedAt: "2026-05-23T00:00:00.000Z" },
  "item-2": { itemId: "item-2", status: "complete", signalTags: ["退款"], signalGist: "退款流程卡住", promptVersion: "v1", model: "mock", generatedAt: "2026-05-23T00:00:00.000Z" }
};

test("CollectView shows topic triage rows for unprocessed signals", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: null,
      folderName: "Topics",
      mode: "topic",
      isSaved: false,
      selectionMode: false,
      untriagedSignals: signals,
      signalPreviewById: {
        "signal-1": "航班改動後等不到客服",
        "signal-2": "退款流程卡住",
        "signal-3": "沒有標籤的訊號"
      },
      signalTagsByItemId: tagsByItemId,
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined,
      onCreateTopicFromSignals: () => undefined
    })
  );

  assert.match(html, /data-topic-triage="untriaged"/);
  assert.match(html, /未分流/);
  assert.match(html, /航班改動後等不到客服/);
  assert.match(html, /航班/);
  assert.match(html, /建立議題需要 ≥ 3/);
});

test("collect triage helper requires at least three selected signals", () => {
  assert.equal(collectViewTestables.canCreateTopicFromSelection(["signal-1", "signal-2"]), false);
  assert.equal(collectViewTestables.canCreateTopicFromSelection(["signal-1", "signal-2", "signal-3"]), true);
  assert.deepEqual(collectViewTestables.suggestTagsForSignal(signals[0]!, tagsByItemId), ["航班", "客服"]);
});
