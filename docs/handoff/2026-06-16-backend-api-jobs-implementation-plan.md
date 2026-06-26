# Backend API / JOBS Implementation Plan

Date: 2026-06-16

Depends on:

- `docs/audit/2026-06-16-backend-api-jobs-c0-audit.md`
- Product `main` after MIGRATE closure (`8478de0`)
- Backend `dlens-ingest-core` `main` after B4 golden fixtures (`6d0cb70`)

## Objective

Move `API` / `JOBS` from "built but ambiguous" toward a tested state where
backend job orchestration cannot silently look healthy while work is actually
stuck, retry-scheduled, terminal, or analysis-failed.

This plan does not promise a color flip yet. A flip is earned only after the
negative cases below are regression-locked across backend contracts and
extension projection.

## Non-Negotiable Invariants

1. `TRACE`, `SEAM_GUARD`, `RECONCILE`, `INVALIDATE`, `BOUNDARY`, and `MIGRATE`
   must stay green/locked. Do not weaken their tests, guard scripts, or docs.
2. `request-reconcile.ts` stays a pure primitive. Do not put job-specific
   business logic there.
3. `state/updated` shape remains additive only.
4. Backend API additions must be additive. Existing extension builds must keep
   working against the new backend response shape.
5. No temporary Chrome profile work. Chrome QA uses the real Jason profile and
   the real `output/chrome-mv3` reload path.
6. No sidepanel-direct testing as proof of extension runtime behavior.
7. Do not split `entrypoints/background.ts` or
   `src/ui/useInPageCollectorAppState.ts` in this plan. That is a separate
   background-split lever.
8. Do not touch Threads DOM extraction. That belongs to `CRAWLER`.
9. Do not redesign Product/Topic/PR UI. Only add the minimal projection/copy
   needed to make backend job truth visible.

## Done Condition

The work is done when these RED -> GREEN assertions exist:

1. Backend worker status exposes more than thread liveness: pending due count,
   retry-scheduled count, running count, expired-running count, dead count, and
   latest drain outcome or equivalent summary.
2. Backend read fixtures cover:
   - retry scheduled after retryable crawl failure;
   - expired running lease;
   - crawl succeeded with missing analysis;
   - crawl succeeded with analysis failed;
   - terminal dead job.
3. Extension projection distinguishes:
   - active crawling;
   - retry waiting;
   - stale/reclaimable running;
   - waiting on analysis;
   - missing analysis / analysis timeout;
   - analysis failed with visible reason;
   - terminal crawl failure.
4. Existing full live happy-path trace fixture still passes.
5. A new negative fixture or test proves at least one "looks like working"
   failure per category would fail before the implementation.
6. Architecture docs are updated only after the tests prove the new contract.

## PR 1 - Backend Worker Status Summary

Repo: `dlens-ingest-core`

Goal:

Make `/worker/status` describe backend work state, not just drain-thread
liveness.

Expected files:

- `src/dlens_ingest_core/api/schemas.py`
- `src/dlens_ingest_core/api/services/worker_control.py`
- `src/dlens_ingest_core/db/job_store.py` or a new read/query helper
- `tests/api/test_worker_control.py`
- `tests/workers/test_runner.py` or a focused store/query test

Implementation shape:

1. Extend `WorkerStatusResponse` additively. Suggested fields:
   - `pending_due_jobs: int`
   - `retry_scheduled_jobs: int`
   - `running_jobs: int`
   - `expired_running_jobs: int`
   - `dead_jobs: int`
   - `pending_analyses: int`
   - `running_analyses: int`
   - `failed_analyses: int`
   - `last_drain_error: str | None` if practical inside the service
   - `last_drain_finished_at: datetime | None` if practical
2. Keep `status: "idle" | "draining"` unchanged.
3. Add a backend query helper that computes counts from crawl jobs and analyses.
4. If last drain error is not persistable without a bigger service change, mark
   that as a follow-up explicitly. Do not fake it.

RED -> GREEN tests:

```python
def test_worker_status_reports_retry_scheduled_and_expired_running_jobs():
    ...
    assert body["status"] == "idle"
    assert body["retry_scheduled_jobs"] == 1
    assert body["expired_running_jobs"] == 1
```

```python
def test_worker_status_reports_pending_and_failed_analysis_counts():
    ...
    assert body["pending_analyses"] == 1
    assert body["failed_analyses"] == 1
```

Verification:

```bash
cd /Users/tung/Desktop/dlens-ingest-core
python -m pytest tests/api/test_worker_control.py tests/workers/test_runner.py
python -m pytest
```

Commit message:

```text
fix(jobs): expose worker backlog and terminal summary
```

## PR 2 - Extension Job Projection Contract

Repo: `dlens-product-latest`

Goal:

Consume the richer backend worker/job/capture/analysis states and make them
available through a single extension projection, without scattering UI-specific
logic across surfaces.

Expected files:

- `src/ingest/client.ts`
- `src/state/messages.ts`
- `src/state/processing-state.ts`
- `src/state/store-helpers.ts`
- `src/state/processing-errors.ts`
- `src/ui/useProcessingCoordinator.ts`
- `tests/processing-state.test.ts`
- `tests/store-helpers.test.ts`
- `tests/backend-llm-trace.test.ts`
- `tests/use-processing-coordinator` equivalent if one exists, otherwise
  focused pure-helper tests

Implementation shape:

1. Add TypeScript fields matching the additive backend `WorkerStatusResponse`.
2. Create a pure projection helper, for example:

```ts
export type BackendWorkUiState =
  | { kind: "idle" }
  | { kind: "draining" }
  | { kind: "retry_waiting"; count: number; nextScheduledAt?: string }
  | { kind: "expired_running"; count: number }
  | { kind: "analysis_waiting"; count: number }
  | { kind: "analysis_failed"; count: number }
  | { kind: "backend_error"; message: string };
```

3. Keep `WorkerStatus = "idle" | "draining"` for existing callers unless a
   broader rename is required.
4. Do not teach views to inspect raw backend counts. Views consume the pure
   projection.
5. Add copy in `processing-errors.ts` only for concrete backend truth:
   retry waiting, expired running, analysis failed, backend unavailable.

RED -> GREEN tests:

```ts
test("worker status projection distinguishes retry waiting from active crawling", () => {
  const state = projectBackendWorkStatus({
    status: "idle",
    retry_scheduled_jobs: 1,
    pending_due_jobs: 0,
    running_jobs: 0,
    expired_running_jobs: 0,
    pending_analyses: 0,
    running_analyses: 0,
    failed_analyses: 0
  });
  assert.equal(state.kind, "retry_waiting");
});
```

```ts
test("analysis failed capture exposes visible failure reason", () => {
  const item = reconcileSessionItem(existing, succeededJob, captureWithFailedAnalysis);
  const readiness = getItemReadinessStatus(item);
  assert.equal(readiness, "failed");
  assert.match(readProcessingFailureReason(item), /analysis/i);
});
```

Verification:

```bash
cd /Users/tung/Desktop/dlens-product-latest
npm run typecheck
npx tsx --test tests/processing-state.test.ts tests/store-helpers.test.ts tests/backend-llm-trace.test.ts
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run storage:seam-guard
npm run boundary:guard
npm run storage:migrate-fixtures
npm run qa:harness:fixture
npm run build
```

Commit message:

```text
fix(jobs): project backend retry and analysis terminal states
```

## PR 3 - Negative Golden Fixtures

Repo: likely both `dlens-ingest-core` and `dlens-product-latest`

Goal:

Make the "looks like working" cases replayable without live Chrome.

Backend expected files:

- `tests/api/fixtures/job_status_negative_cases.json`
- `tests/api/test_job_status_negative_fixtures.py`

Product expected files:

- `tests/fixtures/backend-job-status-negative-cases.json`
- `tests/backend-job-status-projection.test.ts`

Fixture cases:

1. `retry-scheduled-crawl`
   - backend job `pending`
   - `last_error_kind = retryable_runtime_error`
   - `scheduled_at` in the future
   - extension projection `retry_waiting`
2. `expired-running-lease`
   - backend job `running`
   - `lease_expires_at` in the past
   - worker status summary `expired_running_jobs = 1`
   - extension projection `expired_running`
3. `missing-analysis-after-crawl-success`
   - job/capture succeeded
   - analysis missing
   - extension projection `analysis_waiting` or explicit `analysis_missing`
4. `failed-analysis-after-crawl-success`
   - job/capture succeeded
   - latest analysis failed
   - extension projection `analysis_failed` with reason
5. `terminal-dead-crawl`
   - job dead
   - capture failed
   - extension projection `failed` with job error kind

Completeness assertion:

Both repos should assert exact case-name set equality so a future PR cannot
silently remove one negative case.

Verification:

Backend:

```bash
cd /Users/tung/Desktop/dlens-ingest-core
python -m pytest tests/api/test_job_status_negative_fixtures.py
python -m pytest
```

Product:

```bash
cd /Users/tung/Desktop/dlens-product-latest
npm run typecheck
npx tsx --test tests/backend-job-status-projection.test.ts
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run qa:harness:fixture
npm run build
```

Commit message:

```text
test(jobs): add negative backend status projection fixtures
```

## PR 4 - Recovery UX And Manual Chrome QA

Repo: `dlens-product-latest`

Goal:

Make the new backend truth visible where users actually get stuck.

Expected files:

- `src/ui/ProcessingStrip.tsx`
- `src/ui/LibraryView.tsx`
- `src/ui/TopicDetailView.tsx`
- Product mode surface only if needed
- `tests/processing-strip.test.tsx`
- `tests/library-view.test.tsx`
- `tests/topic-detail-view.test.tsx`
- `docs/handoff/<chrome-qa-notes>.md` if a QA artifact is recorded

Implementation shape:

1. Show retry-waiting copy as waiting/retry, not active crawl.
2. Show expired-running/reclaimable copy with a clear "restart processing" path.
3. Show analysis failure cause where the user is blocked.
4. Keep copy compact. Do not add a dashboard.
5. Run manual Chrome QA in Jason profile only:
   - reload `output/chrome-mv3`;
   - Product Settings -> Collect -> queue/crawl -> Product insights;
   - PR Evidence collect -> criteria -> match/export;
   - record the first broken step if any.

RED -> GREEN tests:

```tsx
test("ProcessingStrip labels retry scheduled work as waiting instead of active processing", () => {
  ...
});
```

```tsx
test("TopicDetailView exposes restart processing when backend has expired running work", () => {
  ...
});
```

Verification:

```bash
cd /Users/tung/Desktop/dlens-product-latest
npm run typecheck
npx tsx --test tests/processing-strip.test.tsx tests/library-view.test.tsx tests/topic-detail-view.test.tsx
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run storage:seam-guard
npm run boundary:guard
npm run storage:migrate-fixtures
npm run qa:harness:fixture
npm run build
```

Chrome QA is required before merge if this PR changes visible runtime copy.

Commit message:

```text
fix(jobs): surface backend retry and analysis blockage states
```

## PR 5 - Documentation And Status Decision

Repo: `dlens-product-latest`

Goal:

Update the architecture map only after PR 1-4 prove the gate.

Expected files:

- `docs/architecture/dlens-current-architecture-map.md`
- `docs/memory/current-state.md`
- `docs/memory/latest-shared-context.md`
- `README.md`
- `AGENTS.md` if the operating rule changes

Decision rule:

- `API` / `JOBS` can move from partial only if:
  - backend exposes backlog/retry/expired/analysis summary;
  - extension consumes and projects it;
  - negative fixtures replay the five drift cases;
  - visible surfaces show retry/expired/analysis failure states;
  - the full live happy-path trace fixture still passes.
- Do not move `CRAWLER` based on this work. DOM extraction remains separate.
- Do not move external LLM nodes based on this work. Prompt/provider risk is
  separate from backend job orchestration.

Suggested status language if the above is satisfied:

```text
`API` / `JOBS` are now <status> because backend worker status exposes backlog,
retry, expired-running, and analysis terminal summaries; extension projection
distinguishes active crawl from retry-waiting, reclaimable running, missing
analysis, analysis failure, and terminal crawl failure; and negative fixtures
lock those states across backend and extension.
```

Pick `<status>` conservatively:

- Use built/green only if the negative fixtures exist but there is no live
  end-to-end failure gate.
- Use locked only if a failing automated guard catches the full class of
  regression, not just one helper.

## Out Of Scope

- No Threads extractor refactor.
- No backend read-model changes.
- No ProductSignalAnalyzer prompt redesign.
- No direct LLM provider retry redesign.
- No Chrome automation in temporary profiles.
- No sidepanel direct proof.
- No background split.
- No storage-domain cascade audit. That is the separate `SEAM_PARTIAL` lever.

## Recommended Order

1. Backend PR 1 first. The extension cannot project truth the backend does not
   expose.
2. Product PR 2 second. Keep it projection-first and UI-light.
3. Backend + product PR 3 third. Fixture the negative states after both sides
   understand the contract.
4. Product PR 4 fourth. Add visible copy/recovery affordance after projections
   are test-backed.
5. Docs PR 5 last. Status moves only after behavior is locked.
