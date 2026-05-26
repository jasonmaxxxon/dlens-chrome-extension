import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TopicAuditValidationFlag } from "../src/compare/topic-audit-validator.ts";
import { ValidatorChip, countValidationFlags } from "../src/ui/topic-audit-components.tsx";

const flags: TopicAuditValidationFlag[] = [
  { severity: "WEAK", kind: "thin-evidence", section: "§2", claim: "claim", reason: "weak", evidenceRefs: ["S1.OP"] },
  { severity: "FAIL", kind: "unknown-ref", section: "§4", claim: "claim", reason: "fail", evidenceRefs: ["S9.OP"] },
  { severity: "SCOPE", kind: "ungrounded-generalization", section: "§5", claim: "claim", reason: "scope", evidenceRefs: [] }
];

test("ValidatorChip counts validation flags by severity", () => {
  assert.deepEqual(countValidationFlags(flags), { fail: 1, weak: 1, scope: 1 });

  const html = renderToStaticMarkup(
    React.createElement(ValidatorChip, {
      topicId: "topic-1",
      flags,
      onOpenReport: () => undefined
    })
  );

  assert.match(html, /data-validator-chip="topic-audit"/);
  assert.match(html, /1 FAIL/);
  assert.match(html, /1 WEAK/);
  assert.match(html, /1 SCOPE/);
});

test("ValidatorChip exposes stale visual state without changing counts", () => {
  const html = renderToStaticMarkup(
    React.createElement(ValidatorChip, {
      topicId: "topic-1",
      flags,
      stale: true,
      onOpenReport: () => undefined
    })
  );

  assert.match(html, /data-stale="true"/);
  assert.match(html, /opacity:0\.7/);
});

test("ValidatorChip renders a pending state before validation exists", () => {
  const html = renderToStaticMarkup(
    React.createElement(ValidatorChip, {
      topicId: "topic-1",
      state: "pending",
      flags: [],
      onOpenReport: () => undefined
    })
  );

  assert.match(html, /data-validator-chip-state="pending"/);
  assert.match(html, /pending/);
  assert.doesNotMatch(html, /0 FAIL/);
  assert.doesNotMatch(html, /0 WEAK/);
  assert.doesNotMatch(html, /0 SCOPE/);
});
