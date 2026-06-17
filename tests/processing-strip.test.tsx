import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProcessingStrip } from "../src/ui/ProcessingStrip.tsx";

test("ProcessingStrip renders worker headline and counts", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProcessingStrip, {
      workerStatus: "draining",
      ready: 1,
      total: 4,
      crawling: 2,
      analyzing: 1,
      pending: 1
    })
  );

  assert.match(html, /Processing in progress/);
  assert.match(html, /data-processing-strip="context"/);
  assert.match(html, /data-processing-ring="visible"/);
  assert.match(html, /data-processing-skeleton="visible"/);
  assert.match(html, /1\/4 ready/);
  assert.match(html, /Mapping comments into clusters|Capturing comments|Preparing Compare/);
  assert.doesNotMatch(html, /crawling|analyzing|pending/);
});

test("ProcessingStrip stays compare-forward when a ready pair exists alongside inflight work", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProcessingStrip, {
      workerStatus: "draining",
      ready: 2,
      total: 4,
      crawling: 1,
      analyzing: 1,
      pending: 0
    })
  );

  assert.match(html, /Ready to compare/);
  assert.match(html, /2\/4 ready/);
  assert.match(html, /data-processing-ring="visible"/);
  assert.doesNotMatch(html, /Processing in progress/);
});

test("ProcessingStrip labels retry-waiting backlog instead of active processing", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProcessingStrip, {
      workerStatus: "idle",
      backendWorkUiState: {
        kind: "retry_waiting",
        count: 1,
        earliestRetryAt: "2026-06-16T10:30:00.000Z",
        nextDueAt: null
      },
      ready: 0,
      total: 1,
      crawling: 0,
      analyzing: 0,
      pending: 1
    })
  );

  assert.match(html, /Retry waiting/i);
  assert.doesNotMatch(html, /Processing in progress/);
});

test("ProcessingStrip surfaces analysis_failed as a blocked state", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProcessingStrip, {
      workerStatus: "idle",
      backendWorkUiState: { kind: "analysis_failed", count: 1 },
      ready: 0,
      total: 1,
      crawling: 0,
      analyzing: 0,
      pending: 0
    })
  );

  assert.match(html, /Analysis failed/i);
  assert.match(html, /Open the capture/i);
});

test("ProcessingStrip surfaces expired_running as reclaimable", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProcessingStrip, {
      workerStatus: "idle",
      backendWorkUiState: { kind: "expired_running", count: 1 },
      ready: 0,
      total: 1,
      crawling: 0,
      analyzing: 0,
      pending: 0
    })
  );

  assert.match(html, /Reclaim expired work/i);
  assert.match(html, /Restart processing/i);
});

test("ProcessingStrip falls back to default copy when backendWorkUiState is idle or null", () => {
  const idleHtml = renderToStaticMarkup(
    React.createElement(ProcessingStrip, {
      workerStatus: "draining",
      backendWorkUiState: { kind: "draining" },
      ready: 1,
      total: 4,
      crawling: 2,
      analyzing: 1,
      pending: 1
    })
  );

  assert.match(idleHtml, /Processing in progress/);
});

test("ProcessingStrip renders backend reachability dot at the leading edge", () => {
  const slowHtml = renderToStaticMarkup(
    React.createElement(ProcessingStrip, {
      workerStatus: "idle",
      backendReachability: "slow",
      ready: 0,
      total: 1,
      crawling: 0,
      analyzing: 0,
      pending: 1
    })
  );

  assert.match(slowHtml, /data-backend-health-dot="slow"/);
  assert.match(slowHtml, /Backend slow/);

  const unreachableHtml = renderToStaticMarkup(
    React.createElement(ProcessingStrip, {
      workerStatus: "idle",
      backendReachability: "unreachable",
      ready: 0,
      total: 1,
      crawling: 0,
      analyzing: 0,
      pending: 1
    })
  );

  assert.match(unreachableHtml, /data-backend-health-dot="unreachable"/);
  assert.match(unreachableHtml, /Backend unreachable/);
});
