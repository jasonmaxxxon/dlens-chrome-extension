# Backend API / JOBS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `API` / `JOBS` from "built but ambiguous" toward a tested contract where backend job orchestration cannot silently look healthy while work is stuck, retry-scheduled, expired, terminal, or analysis-failed.

**Architecture:** Extend the backend worker status contract additively, then consume it through one pure extension projection helper. Views must not inspect raw backend counts. Negative fixtures lock the "looks like working but is actually blocked" states before compact recovery copy is added.

**Tech Stack:** `dlens-ingest-core` FastAPI / Python / pytest; `dlens-product-latest` TypeScript / MV3 / React / Node test runner; existing TRACE, RECONCILE, INVALIDATE, BOUNDARY, SEAM_GUARD, and MIGRATE guards.

---

Date: 2026-06-16
Depends on: `docs/audit/2026-06-16-backend-api-jobs-c0-audit.md`
Product baseline: `dlens-product-latest` `main` at `8478de0` after MIGRATE closure.
Backend baseline: `dlens-ingest-core` `main` after B4 golden fixtures (`6d0cb70`).
Status: implementation plan, cross-repo sequence.

## Current Truth

The architecture map currently keeps `API` and `JOBS` yellow. That is correct.

`/worker/status` currently exposes only:

```ts
export interface WorkerStatusResponse {
  status: "idle" | "draining";
}
```

That is liveness, not work truth. It cannot distinguish due work, retry backoff,
expired running leases, analysis backlog, analysis failure, or terminal crawl
failure.

The extension already has local readiness projection, for example:

- `queued` / `running` item -> `crawling`;
- `succeeded` item + `analysis.status === "succeeded"` -> `ready`;
- `succeeded` item + `analysis.status === "failed"` -> `failed`;
- `succeeded` item + missing or pending analysis -> `analyzing`.

But the worker summary does not provide the backend truth needed to make those
states stable across idle worker periods and retry windows.

## Non-Negotiable Invariants

These must hold after every PR:

1. `TRACE`, `SEAM_GUARD`, `RECONCILE`, `INVALIDATE`, `BOUNDARY`, and `MIGRATE` stay locked. Do not weaken their tests, guard scripts, or architecture map wording.
2. `request-reconcile.ts` stays a pure primitive. Do not add job-specific business logic there.
3. `state/updated` shape remains additive only.
4. Backend API additions are additive. Existing extension builds must still work against the new backend response shape.
5. Views do not inspect raw backend counts. Views consume a pure projection.
6. No temporary Chrome profile work. Runtime QA uses Jason's real `Default` Chrome profile and the real `output/chrome-mv3` reload path.
7. No sidepanel-direct testing as proof of extension runtime behavior.
8. Do not split `entrypoints/background.ts` or `src/ui/useInPageCollectorAppState.ts` in this plan. That is a separate background-split lever.
9. Do not touch Threads DOM extraction. That belongs to `CRAWLER`.
10. Do not redesign Product / Topic / PR UI. Only add minimal projection and recovery copy needed to make backend job truth visible.

## Done Condition

The work is done when these RED -> GREEN assertions exist:

1. Backend worker status exposes more than thread liveness:
   - pending due count;
   - retry-scheduled count;
   - running count;
   - expired-running count;
   - dead count;
   - pending / running / failed analysis counts;
   - earliest retry / next due timestamp;
   - latest drain outcome if the backend can persist it without a larger service rewrite.
2. Backend and product fixtures cover:
   - retry scheduled after retryable crawl failure;
   - expired running lease;
   - crawl succeeded with missing analysis;
   - crawl succeeded with analysis failed;
   - terminal dead crawl.
3. Extension projection distinguishes:
   - active crawling;
   - retry waiting;
   - stale / reclaimable running;
   - waiting on analysis;
   - missing analysis / analysis timeout;
   - analysis failed with visible reason;
   - terminal crawl failure.
4. `reconcileSessionItem()` or a helper it calls promotes analysis failure into the canonical item error path.
5. Initial read after queue submission records severity, not just a generic trace event.
6. Existing full live happy-path trace fixture still passes.
7. Architecture docs are updated only after tests prove the new contract.

## Status Decision Rule

Do not flip `API` / `JOBS` just because this plan exists.

- Use built/green only if backend summary, extension projection, negative fixtures, compact visible recovery copy, and the existing happy-path trace gate all pass.
- Use locked only if an automated guard catches the full regression class, not merely one pure helper. A local fixture for projection priority is necessary but not sufficient for locked.
- Do not move `CRAWLER`; DOM extraction risk is separate.
- Do not move external LLM nodes; provider/prompt risk is separate from backend job orchestration.

## Cross-Repo File Map

Backend (`dlens-ingest-core`):

- Modify: `src/dlens_ingest_core/api/schemas.py`
- Modify: `src/dlens_ingest_core/api/services/worker_control.py`
- Modify or create: `src/dlens_ingest_core/db/job_store.py` or a focused read/query helper
- Test: `tests/api/test_worker_control.py`
- Test: `tests/api/test_job_status_negative_fixtures.py`
- Fixture: `tests/api/fixtures/job_status_negative_cases.json`

Product (`dlens-product-latest`):

- Modify: `src/contracts/ingest.ts`
- Modify: `src/ingest/client.ts` only if response normalization or initial-read severity lives there
- Modify: `src/state/messages.ts` only if a message response must carry the new projection
- Modify: `src/state/processing-state.ts`
- Modify: `src/state/store-helpers.ts`
- Modify: `src/state/processing-errors.ts`
- Modify: `src/ui/useProcessingCoordinator.ts`
- Modify: `src/ui/ProcessingStrip.tsx`
- Modify: `src/ui/LibraryView.tsx`
- Modify: `src/ui/TopicDetailView.tsx`
- Create: `tests/fixtures/backend-job-status-negative-cases.json`
- Create: `tests/backend-job-status-projection.test.ts`
- Test: `tests/processing-state.test.ts`
- Test: `tests/store-helpers.test.ts`
- Test: `tests/backend-llm-trace.test.ts`
- Test: `tests/processing-strip.test.tsx`
- Test: `tests/library-view.test.tsx`
- Test: `tests/topic-detail-view.test.tsx`
- Docs: `docs/architecture/dlens-current-architecture-map.md`
- Docs: `docs/memory/current-state.md`
- Docs: `docs/memory/latest-shared-context.md`

## PR 1: Backend Worker Status Summary

**Repo:** `dlens-ingest-core`

**Goal:** Make `GET /worker/status` describe backend work state, not just drain-thread liveness.

**Files:**

- Modify: `src/dlens_ingest_core/api/schemas.py`
- Modify: `src/dlens_ingest_core/api/services/worker_control.py`
- Modify or create: `src/dlens_ingest_core/db/job_store.py`
- Test: `tests/api/test_worker_control.py`
- Test: `tests/workers/test_runner.py` or a focused store/query test

### Task 1.1: Extend `WorkerStatusResponse` additively

- [ ] **Step 1: Write failing backend schema / API tests**

Add tests equivalent to:

```py
def test_worker_status_reports_retry_scheduled_and_expired_running_jobs(client, job_store):
    # seed one pending job scheduled in the future after a retryable failure
    # seed one running job with lease_expires_at in the past
    body = client.get("/worker/status").json()

    assert body["status"] == "idle"
    assert body["retry_scheduled_jobs"] == 1
    assert body["expired_running_jobs"] == 1
    assert body["earliest_retry_at"] is not None


def test_worker_status_reports_pending_and_failed_analysis_counts(client, job_store):
    # seed capture analyses in pending/running/failed states
    body = client.get("/worker/status").json()

    assert body["pending_analyses"] == 1
    assert body["running_analyses"] == 1
    assert body["failed_analyses"] == 1
```

- [ ] **Step 2: Run tests and confirm RED**

```bash
cd <ingest-core-repo>
python -m pytest tests/api/test_worker_control.py -q
```

Expected: fails because response fields do not exist.

- [ ] **Step 3: Implement additive response fields**

Suggested fields:

```py
pending_due_jobs: int = 0
retry_scheduled_jobs: int = 0
running_jobs: int = 0
expired_running_jobs: int = 0
dead_jobs: int = 0
pending_analyses: int = 0
running_analyses: int = 0
failed_analyses: int = 0
earliest_retry_at: datetime | None = None
next_due_at: datetime | None = None
last_drain_error: str | None = None
last_drain_finished_at: datetime | None = None
```

Keep existing `status: "idle" | "draining"` unchanged.

- [ ] **Step 4: Add query helper**

Create or extend a read-only helper that computes counts from crawl jobs and
analysis rows. The helper must not mutate job state.

Rules:

- `pending_due_jobs`: pending jobs whose `scheduled_at <= now`.
- `retry_scheduled_jobs`: pending jobs whose `scheduled_at > now`, especially after prior failure / retry metadata.
- `running_jobs`: running jobs whose lease has not expired.
- `expired_running_jobs`: running jobs whose `lease_expires_at < now`.
- `dead_jobs`: terminal dead jobs.
- `earliest_retry_at`: minimum future `scheduled_at` among retry-scheduled jobs.
- `next_due_at`: minimum due or future pending `scheduled_at`, if useful for UI.

If `last_drain_error` / `last_drain_finished_at` is not persistable without a
larger service rewrite, leave it `null` and document it as follow-up. Do not
fake it.

- [ ] **Step 5: Run backend verification**

```bash
python -m pytest tests/api/test_worker_control.py tests/workers/test_runner.py -q
python -m pytest -q
```

Expected: backend suite passes.

- [ ] **Step 6: Commit**

```bash
git add src/dlens_ingest_core/api/schemas.py src/dlens_ingest_core/api/services/worker_control.py src/dlens_ingest_core/db/job_store.py tests/api/test_worker_control.py tests/workers/test_runner.py
git commit -m "fix(jobs): expose worker backlog and terminal summary"
```

## PR 2: Extension Job Projection Contract

**Repo:** `dlens-product-latest`

**Goal:** Consume richer backend worker / job / capture / analysis state through one pure extension projection, without scattering UI logic across surfaces.

**Files:**

- Modify: `src/contracts/ingest.ts`
- Modify: `src/state/processing-state.ts`
- Modify: `src/state/store-helpers.ts`
- Modify: `src/state/processing-errors.ts`
- Modify: `src/ui/useProcessingCoordinator.ts`
- Test: `tests/processing-state.test.ts`
- Test: `tests/store-helpers.test.ts`
- Test: `tests/backend-llm-trace.test.ts`

### Task 2.1: Add TypeScript contract fields

- [ ] **Step 1: Write failing ingest contract / trace tests**

Add or extend tests so a worker status payload with the new fields is accepted
and traced without dropping details.

- [ ] **Step 2: Extend `WorkerStatusResponse`**

Add optional fields first if backend rollout order requires backward
compatibility:

```ts
export interface WorkerStatusResponse {
  status: "idle" | "draining";
  pending_due_jobs?: number;
  retry_scheduled_jobs?: number;
  running_jobs?: number;
  expired_running_jobs?: number;
  dead_jobs?: number;
  pending_analyses?: number;
  running_analyses?: number;
  failed_analyses?: number;
  earliest_retry_at?: string | null;
  next_due_at?: string | null;
  last_drain_error?: string | null;
  last_drain_finished_at?: string | null;
}
```

Keep `WorkerStatus = "idle" | "draining"` for existing callers unless a
broader rename becomes necessary.

### Task 2.2: Add pure backend work projection

- [ ] **Step 1: Write failing projection-priority tests**

Add tests to `tests/processing-state.test.ts` or a new focused test:

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
    failed_analyses: 0,
    earliest_retry_at: "2026-06-16T10:30:00.000Z"
  });

  assert.equal(state.kind, "retry_waiting");
  assert.equal(state.count, 1);
});

test("backend work projection priority is stable when multiple states are present", () => {
  assert.equal(projectBackendWorkStatus({ status: "draining", expired_running_jobs: 1, failed_analyses: 1 }).kind, "expired_running");
});
```

- [ ] **Step 2: Implement projection helper**

Add to `src/state/processing-state.ts` unless the file becomes crowded enough
to justify `src/state/backend-work-ui-state.ts`.

```ts
export type BackendWorkUiState =
  | { kind: "idle" }
  | { kind: "draining" }
  | { kind: "retry_waiting"; count: number; earliestRetryAt?: string | null; nextDueAt?: string | null }
  | { kind: "expired_running"; count: number }
  | { kind: "analysis_waiting"; count: number }
  | { kind: "analysis_failed"; count: number }
  | { kind: "backend_error"; message: string };
```

Priority must be explicit and tested:

```txt
backend_error
> expired_running
> analysis_failed
> retry_waiting
> analysis_waiting
> draining
> idle
```

Rationale: if multiple backend truths exist, show the state that most blocks
user progress first.

- [ ] **Step 3: Keep Views out of raw counts**

`ProcessingStrip`, `LibraryView`, and `TopicDetailView` may receive
`BackendWorkUiState` or already-localized copy. They must not branch on raw
`retry_scheduled_jobs` / `expired_running_jobs` counts.

### Task 2.3: Promote analysis failure into canonical item error

- [ ] **Step 1: Write failing store-helper test**

Add to `tests/store-helpers.test.ts`:

```ts
test("reconcileSessionItem promotes failed analysis into canonical item error", () => {
  const item = buildQueuedItem();
  const job = buildJob({ status: "succeeded", last_error: null, last_error_kind: null });
  const capture = buildCapture({
    ingestion_status: "succeeded",
    analysis: {
      status: "failed",
      last_error: "analysis parser rejected empty evidence",
      error_kind: "analysis_failed"
    }
  });

  const next = reconcileSessionItem(item, job, capture);

  assert.equal(next.status, "succeeded");
  assert.equal(getItemReadinessStatus(next), "failed");
  assert.equal(next.lastErrorKind, "analysis_failed");
  assert.match(next.lastError ?? "", /analysis parser/i);
});
```

- [ ] **Step 2: Implement minimal helper**

Add a small helper near `reconcileSessionItem()`:

```ts
function readCanonicalProcessingError(job: JobSnapshot | null, capture: CaptureSnapshot | null): {
  lastErrorKind: string | null;
  lastError: string | null;
} {
  if (capture?.analysis?.status === "failed") {
    return {
      lastErrorKind: capture.analysis.error_kind ?? "analysis_failed",
      lastError: capture.analysis.last_error ?? "Analysis failed."
    };
  }
  return {
    lastErrorKind: job?.last_error_kind ?? null,
    lastError: job?.last_error ?? null
  };
}
```

Adjust field names to the real `AnalysisSnapshot` shape before coding. The
principle is the contract: analysis failure must enter canonical item error
state.

### Task 2.4: Add initial read severity

- [ ] **Step 1: Write failing tests for queue initial read classification**

Target the smallest helper seam around queue submission / first `fetchJob()` /
`fetchCapture()`.

Expected type:

```ts
export type InitialReadStatus =
  | "ok"
  | "lag_tolerated"
  | "route_error"
  | "version_mismatch"
  | "backend_unavailable";
```

- [ ] **Step 2: Implement classification**

Use it in trace detail / response detail. Do not put this logic in Views.

### Task 2.5: Run product verification and commit

```bash
cd <product-repo>
npm run typecheck
npx tsx --test tests/processing-state.test.ts tests/store-helpers.test.ts tests/backend-llm-trace.test.ts
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run storage:seam-guard
npm run boundary:guard
npm run storage:migrate-fixtures
npm run qa:harness:fixture
npm run build
git diff --check
```

Expected: all pass.

```bash
git add src/contracts/ingest.ts src/state/processing-state.ts src/state/store-helpers.ts src/state/processing-errors.ts src/ui/useProcessingCoordinator.ts tests/processing-state.test.ts tests/store-helpers.test.ts tests/backend-llm-trace.test.ts
git commit -m "fix(jobs): project backend retry and analysis terminal states"
```

## PR 3: Negative Golden Fixtures

**Repo:** both `dlens-ingest-core` and `dlens-product-latest`

**Goal:** Make "looks like working" failures replayable without live Chrome.

**Backend Files:**

- Create: `tests/api/fixtures/job_status_negative_cases.json`
- Create: `tests/api/test_job_status_negative_fixtures.py`

**Product Files:**

- Create: `tests/fixtures/backend-job-status-negative-cases.json`
- Create: `tests/backend-job-status-projection.test.ts`

### Task 3.1: Define shared case names

- [ ] **Step 1: Create fixtures with exactly these case names**

```txt
retry-scheduled-crawl
expired-running-lease
missing-analysis-after-crawl-success
failed-analysis-after-crawl-success
terminal-dead-crawl
```

- [ ] **Step 2: Assert exact set equality in both repos**

Backend pytest and product Node tests both fail if a future PR removes or
renames a case.

### Task 3.2: Backend fixture behavior

- [ ] **Step 1: Write backend fixture tests**

Each case should seed backend jobs / captures / analyses and assert
`/worker/status` summary counts.

- [ ] **Step 2: Run backend fixture tests**

```bash
cd <ingest-core-repo>
python -m pytest tests/api/test_job_status_negative_fixtures.py -q
python -m pytest -q
```

### Task 3.3: Product fixture behavior

- [ ] **Step 1: Write product projection tests**

Expected projections:

- `retry-scheduled-crawl` -> `retry_waiting`
- `expired-running-lease` -> `expired_running`
- `missing-analysis-after-crawl-success` -> `analysis_waiting`
- `failed-analysis-after-crawl-success` -> `analysis_failed`
- `terminal-dead-crawl` -> terminal failed item with job error kind

- [ ] **Step 2: Run product fixture tests**

```bash
cd <product-repo>
npm run typecheck
npx tsx --test tests/backend-job-status-projection.test.ts
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run qa:harness:fixture
npm run build
git diff --check
```

- [ ] **Step 3: Commit**

Backend:

```bash
git add tests/api/fixtures/job_status_negative_cases.json tests/api/test_job_status_negative_fixtures.py
git commit -m "test(jobs): add negative worker status fixtures"
```

Product:

```bash
git add tests/fixtures/backend-job-status-negative-cases.json tests/backend-job-status-projection.test.ts
git commit -m "test(jobs): add negative backend status projection fixtures"
```

## PR 4: Recovery UX And Manual Chrome QA

**Repo:** `dlens-product-latest`

**Goal:** Make the new backend truth visible where users actually get stuck, without redesigning any major surface.

**Files:**

- Modify: `src/ui/ProcessingStrip.tsx`
- Modify: `src/ui/LibraryView.tsx`
- Modify: `src/ui/TopicDetailView.tsx`
- Modify: Product mode surface only if needed
- Test: `tests/processing-strip.test.tsx`
- Test: `tests/library-view.test.tsx`
- Test: `tests/topic-detail-view.test.tsx`
- Optional docs: a QA note under `docs/handoff/` or `docs/qa/`

### Task 4.1: Add compact recovery copy

- [ ] **Step 1: Write failing view tests**

```ts
test("ProcessingStrip labels retry scheduled work as waiting instead of active processing", () => {
  // render with BackendWorkUiState retry_waiting
  // assert waiting/retry copy, not active crawling copy
});

test("TopicDetailView exposes restart processing when backend has expired running work", () => {
  // render with BackendWorkUiState expired_running
  // assert restart processing affordance is visible
});
```

- [ ] **Step 2: Implement minimal copy**

Copy rules:

- `retry_waiting`: waiting / retry, not active crawl.
- `expired_running`: reclaimable / restart processing.
- `analysis_waiting`: waiting on analysis.
- `analysis_failed`: blocked reason visible.
- `backend_error`: backend unavailable or route/version error.

Do not add dashboard cards. Do not add new navigation.

### Task 4.2: Run runtime verification

```bash
cd <product-repo>
npm run typecheck
npx tsx --test tests/processing-strip.test.tsx tests/library-view.test.tsx tests/topic-detail-view.test.tsx
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run storage:seam-guard
npm run boundary:guard
npm run storage:migrate-fixtures
npm run qa:harness:fixture
npm run build
git diff --check
```

Manual Chrome QA is required before merge if visible runtime copy changes:

- reload `output/chrome-mv3` in Jason's real `Default` profile;
- Product Settings -> Collect -> queue/crawl -> Product insights;
- PR Evidence collect -> criteria -> match/export;
- record the first broken step if any.

No temporary profile. No sidepanel-direct proof.

- [ ] **Step 3: Commit**

```bash
git add src/ui/ProcessingStrip.tsx src/ui/LibraryView.tsx src/ui/TopicDetailView.tsx tests/processing-strip.test.tsx tests/library-view.test.tsx tests/topic-detail-view.test.tsx
git commit -m "fix(jobs): surface backend retry and analysis blockage states"
```

## PR 5: Documentation And Status Decision

**Repo:** `dlens-product-latest`

**Goal:** Update the architecture map only after PR 1-4 prove the gate.

**Files:**

- Modify: `docs/architecture/dlens-current-architecture-map.md`
- Modify: `docs/memory/current-state.md`
- Modify: `docs/memory/latest-shared-context.md`
- Modify: `README.md`
- Modify: `AGENTS.md` only if the operating rule changes

### Task 5.1: Decide status honestly

- [ ] **Step 1: Check decision criteria**

`API` / `JOBS` can move from partial only if:

- backend exposes backlog / retry / expired / analysis summary;
- extension consumes and projects it;
- negative fixtures replay the five drift cases;
- visible surfaces show retry / expired / analysis failure states;
- full live happy-path trace fixture still passes.

- [ ] **Step 2: Pick status conservatively**

Suggested wording if the above is satisfied:

```md
`API` / `JOBS` are now <status> because backend worker status exposes backlog,
retry, expired-running, and analysis terminal summaries; extension projection
distinguishes active crawl from retry-waiting, reclaimable running, missing
analysis, analysis failure, and terminal crawl failure; and negative fixtures
lock those states across backend and extension.
```

Use built/green if negative fixtures exist but no automated live failure gate
exists. Use locked only if a failing automated guard catches the full class of
regression.

- [ ] **Step 3: Run final verification**

```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run storage:seam-guard
npm run boundary:guard
npm run storage:migrate-fixtures
npm run qa:harness:fixture
npm run build
git diff --check
```

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/dlens-current-architecture-map.md docs/memory/current-state.md docs/memory/latest-shared-context.md README.md AGENTS.md
git commit -m "docs: update API and JOBS status contract"
```

## Out Of Scope

- Threads extractor refactor.
- Backend read-model changes.
- ProductSignalAnalyzer prompt redesign.
- Direct LLM provider retry redesign.
- Chrome automation in temporary profiles.
- Sidepanel-direct proof.
- Background split.
- Storage-domain cascade audit. That is the separate `SEAM_PARTIAL` lever.
- Any change that weakens `TRACE`, `SEAM_GUARD`, `RECONCILE`, `INVALIDATE`, `BOUNDARY`, or `MIGRATE`.

## Recommended Order

1. Backend PR 1 first. The extension cannot project truth the backend does not expose.
2. Product PR 2 second. Keep it projection-first and UI-light.
3. Backend + product PR 3 third. Fixture the negative states after both sides understand the contract.
4. Product PR 4 fourth. Add visible copy / recovery affordance after projections are test-backed.
5. Docs PR 5 last. Status moves only after behavior is locked.

