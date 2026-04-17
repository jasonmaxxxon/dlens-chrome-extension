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
