import assert from "node:assert/strict";
import test from "node:test";

import { scanRepoForViewModelBoundary } from "../scripts/check-viewmodel-boundary.mjs";

test("ViewModel files do not contain unauthorized browser or React boundary violations", () => {
  const { findings, allowlisted } = scanRepoForViewModelBoundary();

  assert.equal(
    findings.length,
    0,
    `unauthorized ViewModel boundary violations: ${JSON.stringify(findings, null, 2)}`
  );
  assert.equal(
    allowlisted.length,
    0,
    `allowlisted ViewModel boundary bypasses remain: ${JSON.stringify(allowlisted, null, 2)}`
  );
});
