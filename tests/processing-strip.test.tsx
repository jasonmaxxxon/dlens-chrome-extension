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
  assert.match(html, /draining/);
  assert.match(html, /1 \/ 4 ready/);
  assert.match(html, /2 crawling/);
  assert.match(html, /1 analyzing/);
  assert.match(html, /1 pending/);
});
