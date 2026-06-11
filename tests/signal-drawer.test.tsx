import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { EvidencePacket, SignalReading } from "../src/compare/topic-audit.ts";
import { computeCitationPopoverLayout, SignalDrawer } from "../src/ui/SignalDrawer.tsx";

const packet: EvidencePacket = {
  auditRunId: "audit-1",
  inputHash: "hash-1",
  topicId: "topic-1",
  signalId: "signal-1",
  itemId: "item-1",
  shortCode: "S1",
  sourceUrl: "https://www.threads.net/@alpha/post/1",
  capturedAt: "2026-05-23T00:00:00.000Z",
  status: "succeeded",
  opAuthor: "alpha",
  opText: "OP 原文",
  opLikes: 12,
  commentCount: 9,
  replyFragments: [
    { ref: "S1.OPC1", author: "alpha", text: "OP 補充", likes: 3, role: "op_continuation" },
    { ref: "S1.R1", author: "reader", text: "讀者回覆", likes: 4, role: "audience" }
  ],
  gaps: [],
  notes: []
};

const reading: SignalReading = {
  auditRunId: "audit-1",
  inputHash: "hash-1",
  topicId: "topic-1",
  signalId: "signal-1",
  shortCode: "S1",
  reading: "OP 在發起 [S1.OP] 後又補刀 [S1.OPC1]，讀者僅一條回應 [S1.R1]。",
  evidenceRefs: ["S1.OP", "S1.OPC1", "S1.R1"],
  watchNotes: ["受眾回覆偏少"],
  promptVersion: "v1",
  model: "mock",
  generatedAt: "2026-05-23T00:00:00.000Z"
};

test("SignalDrawer renders the P1 hero with inline citation chips and topic membership", () => {
  const html = renderToStaticMarkup(
    React.createElement(SignalDrawer, {
      packet,
      reading,
      topicName: "航班爭議",
      onClose: () => undefined
    })
  );

  assert.match(html, /data-signal-drawer="topic-audit"/);
  assert.match(html, /data-signal-drawer-block="p1"/);
  assert.match(html, /position:fixed/);
  assert.match(html, /right:24px/);
  assert.match(html, /top:82px/);
  assert.match(html, /width:720px/);
  assert.match(html, /height:min\(86vh,\s*860px\)/);
  assert.match(html, /align-content:start/);
  assert.doesNotMatch(html, /width:440px/);
  assert.doesNotMatch(html, /bottom:40px/);
  assert.match(html, /航班爭議/);
  assert.match(html, /P1 判讀/);
  assert.match(html, /data-citation-chip="S1\.OP"/);
  assert.match(html, /data-citation-chip="S1\.OPC1"/);
  assert.match(html, /data-citation-chip="S1\.R1"/);
  assert.match(html, /受眾回覆偏少/);
  assert.match(html, /data-signal-drawer-block="op-card"/);
  assert.match(html, /data-raw-toggle="true"/);
  assert.match(html, /留言串（2 則）/);
});

test("SignalDrawer surfaces the OP as an always-visible Threads card and keeps replies collapsible", () => {
  const html = renderToStaticMarkup(
    React.createElement(SignalDrawer, {
      packet,
      reading,
      topicName: "航班爭議",
      onClose: () => undefined
    })
  );

  // OP root post is rendered up top, not hidden behind the raw toggle.
  assert.match(html, /data-signal-drawer-block="op-card"/);
  assert.match(html, /OP 原文/);
  // Collapsible now holds the rest of the thread only; OP is pulled out.
  assert.match(html, /留言串（2 則）/);
  assert.doesNotMatch(html, /OP \+ 留言/);
});

test("SignalDrawer hides the reply thread toggle when the OP has no replies", () => {
  const html = renderToStaticMarkup(
    React.createElement(SignalDrawer, {
      packet: { ...packet, replyFragments: [] },
      reading,
      topicName: "航班爭議",
      onClose: () => undefined
    })
  );

  assert.match(html, /data-signal-drawer-block="op-card"/);
  assert.doesNotMatch(html, /data-raw-toggle="true"/);
});

test("SignalDrawer splits multi-ref citation groups into individual chips", () => {
  const multiRefReading: SignalReading = {
    ...reading,
    reading: "讀者反應兩極 [S1.OPC1, S1.R1]，另有人質疑 [S1.OP]。",
    evidenceRefs: ["S1.OPC1", "S1.R1", "S1.OP"]
  };
  const html = renderToStaticMarkup(
    React.createElement(SignalDrawer, {
      packet,
      reading: multiRefReading,
      topicName: "航班爭議",
      onClose: () => undefined
    })
  );

  assert.match(html, /data-citation-chip="S1\.OPC1"/);
  assert.match(html, /data-citation-chip="S1\.R1"/);
  assert.match(html, /data-citation-chip="S1\.OP"/);
  assert.doesNotMatch(html, /\[S1\.OPC1, S1\.R1\]/);
});

test("computeCitationPopoverLayout keeps citation popovers inside the viewport", () => {
  const leftEdgeLayout = computeCitationPopoverLayout(
    { left: -24, right: 36, top: 360, bottom: 382, width: 60 },
    { width: 720, height: 820 },
    { popoverWidth: 320, popoverHeight: 140, margin: 12, gap: 10 }
  );

  assert.equal(leftEdgeLayout.left, 12);
  assert.equal(leftEdgeLayout.placement, "top");
  assert.ok(leftEdgeLayout.arrowLeft >= 12);
  assert.ok(leftEdgeLayout.arrowLeft <= leftEdgeLayout.width - 12);

  const nearTopLayout = computeCitationPopoverLayout(
    { left: 340, right: 400, top: 18, bottom: 40, width: 60 },
    { width: 720, height: 820 },
    { popoverWidth: 320, popoverHeight: 140, margin: 12, gap: 10 }
  );

  assert.equal(nearTopLayout.placement, "bottom");
  assert.equal(nearTopLayout.top, 50);
});

test("SignalDrawer surfaces data-gap note and P1-missing placeholder when reading absent", () => {
  const html = renderToStaticMarkup(
    React.createElement(SignalDrawer, {
      packet: { ...packet, replyFragments: [packet.replyFragments[0]!] },
      topicName: "航班爭議",
      onClose: () => undefined
    })
  );

  assert.match(html, /data-signal-drawer-block="op-card"/);
  assert.match(html, /data-signal-drawer-block="p1-missing"/);
  assert.match(html, /尚未生成 P1 判讀/);
  assert.match(html, /data-gap 不是 absence/);
  assert.match(html, /long-tail commentCount = 9/);
  assert.match(html, /留言串（1 則）/);
});
