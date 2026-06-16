import assert from "node:assert/strict";
import test from "node:test";

import { scanRepoForViewBoundary } from "../scripts/check-view-boundary.mjs";

test("View files do not contain unauthorized boundary violations", () => {
  const { findings, allowlisted } = scanRepoForViewBoundary();

  assert.equal(
    findings.length,
    0,
    `unauthorized View boundary violations: ${JSON.stringify(findings, null, 2)}`
  );
  assert.equal(
    allowlisted.length,
    0,
    `allowlisted View boundary bypasses remain: ${JSON.stringify(allowlisted, null, 2)}`
  );
});
