import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { EvidencePacket } from "../src/compare/topic-audit.ts";
import { SourceRow } from "../src/ui/topic-audit-components.tsx";

const basePacket: EvidencePacket = {
  auditRunId: "audit-1",
  inputHash: "hash-1",
  topicId: "topic-1",
  signalId: "signal-1",
  itemId: "item-1",
  shortCode: "S2",
  sourceUrl: "https://www.threads.net/@hfsn/post/1",
  capturedAt: "2026-05-22T00:00:00.000Z",
  status: "succeeded",
  opAuthor: "hfsn_____rmnmn",
  opText: "溝仔 15/04/2026 作為一個溝仔無數嘅靚女姐姐 我想講一個極度具爭議性嘅觀點…",
  opLikes: 1800,
  commentCount: 64,
  replyFragments: [],
  gaps: [],
  notes: []
};

test("SourceRow renders ledger row with dot, metrics, and DD/MM/YYYY date", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceRow, {
      packet: basePacket,
      readingStatus: "ready"
    })
  );

  assert.match(html, /data-source-row="S2"/);
  assert.match(html, /data-reading-status="ready"/);
  assert.match(html, /data-source-row-dot="ready"/);
  assert.match(html, /S2\.OP/);
  assert.match(html, /@hfsn_____rmnmn/);
  assert.match(html, /22\/05\/2026/);
  assert.match(html, /data-source-row-metric="likes"/);
  assert.match(html, /data-source-row-metric="comments"/);
  assert.match(html, /1\.8k/);
  assert.match(html, />64</);
});

test("SourceRow shows hollow pending dot and dimmed preview with no run hook", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceRow, {
      packet: basePacket,
      readingStatus: "pending"
    })
  );

  assert.match(html, /data-source-row-dot="pending"/);
  assert.doesNotMatch(html, /data-source-row-run-p1/);
});

test("SourceRow exposes 分析此篇 only when pending|failed and onRunP1 is wired", () => {
  const pendingHtml = renderToStaticMarkup(
    React.createElement(SourceRow, {
      packet: basePacket,
      readingStatus: "pending",
      onRunP1: () => undefined
    })
  );
  assert.match(pendingHtml, /data-source-row-run-p1="S2"/);
  assert.match(pendingHtml, /分析此篇/);

  const readyHtml = renderToStaticMarkup(
    React.createElement(SourceRow, {
      packet: basePacket,
      readingStatus: "ready",
      onRunP1: () => undefined
    })
  );
  assert.doesNotMatch(readyHtml, /data-source-row-run-p1/);
});

test("SourceRow marks not-ready sources as 未抓取 and does not expose P1 generation", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceRow, {
      packet: { ...basePacket, status: "queued", commentCount: null, replyFragments: [] },
      readingStatus: "not_ready",
      onRunP1: () => undefined
    })
  );

  assert.match(html, /data-reading-status="not_ready"/);
  assert.match(html, /data-source-row-not-ready-label="true"/);
  assert.match(html, /未抓取/);
  assert.doesNotMatch(html, /data-source-row-run-p1/);
  assert.doesNotMatch(html, /分析此篇/);
});

test("SourceRow shows running label + pulse dot for running status", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceRow, {
      packet: basePacket,
      readingStatus: "running"
    })
  );

  assert.match(html, /data-source-row-dot="running"/);
  assert.match(html, /data-source-row-running-label="true"/);
  assert.match(html, /處理中/);
});

test("SourceRow caps tag chips at 2 and shows +N overflow when collapsed", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceRow, {
      packet: basePacket,
      readingStatus: "ready",
      tags: ["擇偶策略", "場域優勢論", "驚艷模式", "市場化"]
    })
  );

  assert.match(html, /data-source-row-tag="擇偶策略"/);
  assert.match(html, /data-source-row-tag="場域優勢論"/);
  assert.doesNotMatch(html, /data-source-row-tag="驚艷模式"/);
  assert.match(html, /data-source-row-tag-more="true"/);
  assert.match(html, /\+2/);
});

test("SourceRow expands all tags + draws active marker when active", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceRow, {
      packet: basePacket,
      readingStatus: "ready",
      active: true,
      tags: ["擇偶策略", "場域優勢論", "驚艷模式", "市場化"]
    })
  );

  assert.match(html, /data-active="true"/);
  assert.match(html, /data-source-row-active-marker="true"/);
  assert.match(html, /data-source-row-tag="擇偶策略"/);
  assert.match(html, /data-source-row-tag="場域優勢論"/);
  assert.match(html, /data-source-row-tag="驚艷模式"/);
  assert.match(html, /data-source-row-tag="市場化"/);
  assert.doesNotMatch(html, /data-source-row-tag-more/);
});

test("SourceRow formats missing metrics as em dash without crashing", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceRow, {
      packet: { ...basePacket, opLikes: null, commentCount: null, capturedAt: "" },
      readingStatus: "ready"
    })
  );

  assert.match(html, /data-source-row-metric="likes"/);
  assert.match(html, /data-source-row-metric="comments"/);
  assert.match(html, /—/);
});
