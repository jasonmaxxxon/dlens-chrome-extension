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
   - RED: first-run timeout, provider, and interrupted states claimed that an old Atlas remained even when no Atlas data existed.
   - GREEN: the existing `hasAtlasData` calculation is shared before the Topic/Product branch and passed to `TopicSourceSessionCard`. First-run failures omit the old-Atlas claim; evidence/memo-backed prior Atlas failures retain it.

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
