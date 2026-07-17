# Final review fix report

## Scope

Closed the final review's three Important findings and one Minor finding without changing bundle limits or files outside the approved list.

## TDD evidence

1. Required `topic/audit/run.requestId`
   - RED: the isolated TypeScript contract compile failed with two `TS2578` unused `@ts-expect-error` diagnostics, proving both public and handler message types still accepted omission.
   - Runtime characterization: a cast malformed message was rejected before any run-ledger write.
   - GREEN: `requestId` is required only on the `topic/audit/run` members of `ExtensionMessagePayload` and `TopicAuditHandlerMessage`; the shared optional request-id intersection remains unchanged. The isolated contract compile and contract/runtime tests passed.

2. Product/legacy single owner
   - RED: stale and failed Product renders both retained `data-topic-audit-block="overview"`; failed output also exposed `provider_error`, a continuation CTA, and a second failure banner.
   - GREEN: the legacy overview mounts only for `sourceSession.kind === "current"`. Focused stale/failed, pending/processing, and current/ready control tests passed.

3. Terminal ledger persistence failure
   - RED: fault injection made the failed-ledger write throw, but the caller received only the original provider error.
   - GREEN: superseded-owner ledger errors alone are ignored and rethrow the original error; every other ledger failure surfaces as `AggregateError([originalError, ledgerError])`. The failed write leaves the run non-successful and publishes no report. Existing superseded-owner semantics passed.

4. First-generation failure copy
   - RED: a partial first run with persisted evidence, `auditReport: null`, and a failed timeout still claimed that an old Atlas remained.
   - GREEN: `TopicSourceSessionCard` receives the view model's persisted-report `hasAuditReport` truth. Partial evidence or memos do not count as a prior Atlas; a failed rerun with a persisted `completedAuditReport` still retains the old-Atlas copy.

## Bundle checkpoints

- Task 7 baseline: `909983 / 255021 / 202997` raw/gzip-9/brotli bytes.
- Initial review-fix build: `910046 / 255070 / 203097`; raw and brotli exceeded the unchanged limits.
- Contract-preserving simplification removed unused legacy overview inputs and consolidated failure copy.
- Final: `909981 / 255039 / 202971`; delta versus Task 7 is `-2 / +18 / -26`; headroom is `19 / 961 / 29`.

## Final verification

- `npx tsx --test tests/topic-audit-message-contract.test.ts tests/topic-audit-handlers.test.ts tests/topic-detail-view.test.tsx`: PASS, 100 tests.
- Isolated TypeScript compile for `tests/topic-audit-message-contract.test.ts`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm run bundle:guard`: PASS at `909981 / 255039 / 202971` against `910000 / 256000 / 203000`.
- `git diff --check`: PASS.

## Truthful-copy follow-up

- RED: the existing partial-first-run integration case failed `doesNotMatch(/舊版 Atlas 仍保留/)` while `auditEvidence` existed and `auditReport` was null. The completed-report rerun assertion already passed.
- GREEN: the card's prior-Atlas input now comes from `viewModel.audit.hasAuditReport`; focused rendering locks both the partial-first-run negative case and completed-report failed-rerun positive case.
- Bundle-preserving simplification stayed inside `TopicSourceSessionCard`: the one-use previous-failure renderer was inlined, stage labels share one table, and the two audit actions with identical wiring share one button branch.

### Fresh verification

- `npx tsx --test tests/topic-detail-view.test.tsx`: PASS, 59 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm run bundle:guard`: PASS at `909846 / 255007 / 202998` against unchanged `910000 / 256000 / 203000` limits.
- Delta versus the final review-fix checkpoint: `-135 / -32 / +27`; final headroom: `154 / 993 / 2` raw/gzip-9/brotli bytes.
- `git diff --check`: PASS.

## Failed-rerun persisted-report follow-up

- RED: the failed-rerun render used an old `completedAuditReport` from `audit-1` plus newly persisted evidence and memos from `audit-2`; the card omitted `舊版 Atlas 仍保留` because publication compatibility correctly rejected the mixed revisions.
- GREEN: exported `audit.hasAuditReport` now uses `Boolean(auditReport)`, so it answers only whether storage contains a prior report. The existing `compatibleReport` remains unchanged and continues to gate report-derived headline, absence, and episode content.
- The `auditReport: null` partial-first-run case remains negative, so evidence or memos alone cannot claim that an old Atlas exists.

### Fresh verification

- `npx tsx --test tests/topic-detail-view.test.tsx`: PASS, 59 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm run bundle:guard`: PASS at `909846 / 255006 / 202909` against unchanged `910000 / 256000 / 203000` limits.
- Delta versus the truthful-copy follow-up checkpoint: `0 / -1 / -89`; final headroom: `154 / 994 / 91` raw/gzip-9/brotli bytes.
- `git diff --check`: PASS.
