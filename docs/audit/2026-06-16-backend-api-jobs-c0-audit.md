# Backend API / JOBS C0 Audit

Date: 2026-06-16

Product baseline: `dlens-product-latest` `main` after MIGRATE closure (`8478de0`)

Backend baseline: `dlens-ingest-core` `main` after backend B4 golden fixtures (`6d0cb70`)

## Goal

This C0 audit answers one narrow question:

> Where can backend job orchestration fail in a way that still looks like DLens is working?

The high-risk class is not an obvious crash. It is a partial state where the
extension still polls, the backend still returns some status, and the UI can
continue showing "processing" while no useful terminal state reaches the user.

## Scope

In scope:

- Product / Library queue and refresh paths in the extension:
  `session/queue-*`, `session/refresh-*`, `worker/start-processing`,
  `worker/get-status`.
- Backend job, capture, analysis, and worker-control status contracts.
- Existing pipeline trace coverage for `backend.request`, `crawl.queued`,
  `capture.ready`, and `analysis.ready`.
- Drift cases where backend and extension disagree about terminal, retry, or
  stale state.

Out of scope:

- Threads DOM extraction accuracy. That belongs to `CRAWLER`.
- Backend OP/reply read-model correctness. That is `READMODEL_BACKEND`, now
  built and fixture-covered through B4.
- Direct LLM prompt quality. This audit only cares whether job/capture/analysis
  state reaches the UI.
- Chrome manual smoke execution. That remains a Jason-profile QA task, not a
  docs or unit-test substitute.
- Background decomposition. `entrypoints/background.ts` is large, but this C0
  does not split it.

## Source Map

Extension sources:

- `src/ingest/client.ts:72-176` wraps backend HTTP calls and emits
  `backend.request` trace events for request / response / error.
- `src/ingest/client.ts:185-198` maps backend job status into sidebar status.
- `entrypoints/background.ts:1877-1924` queues one saved item through
  `/capture-target`, then best-effort reads `/jobs/{id}` and `/captures/{id}`.
- `entrypoints/background.ts:1974-2022` queues selected items and calls
  `/worker/drain`.
- `entrypoints/background.ts:2024-2116` refreshes job/capture state through
  `/jobs/{id}` and `/captures/{id}`.
- `entrypoints/background.ts:2173-2224` does one worker-wake global refresh for
  persisted in-flight items.
- `entrypoints/background.ts:3510-3679` owns queue, refresh, worker-start, and
  worker-status message handlers.
- `entrypoints/background.ts:355-372` runs local stale-expiry whenever global
  state loads.
- `src/state/processing-state.ts:68-179` projects stored item state into UI
  readiness.
- `src/state/processing-state.ts:252-269` decides polling delay and refresh
  conditions.
- `src/state/store-helpers.ts:333-488` decides whether an item needs refresh,
  local stale timeout, and job/capture reconciliation.
- `src/ui/useProcessingCoordinator.ts:43-170` polls backend worker status and,
  when needed, sends `session/refresh-all`.
- `src/state/processing-errors.ts:1-45` maps backend errors into user-facing
  processing copy.

Backend sources:

- `src/dlens_ingest_core/api/schemas.py:59-65` exposes worker status as only
  `idle | draining`.
- `src/dlens_ingest_core/api/schemas.py:103-161` exposes analysis, job, and
  capture snapshots.
- `src/dlens_ingest_core/api/services/worker_control.py:37-53` starts a daemon
  drain thread and reports status based only on whether that thread is alive.
- `src/dlens_ingest_core/api/services/worker_control.py:55-81` logs drain
  summary or failure, then clears the thread reference. It does not persist or
  return last drain error.
- `src/dlens_ingest_core/workers/lifecycle.py:36-59` classifies retryable vs
  terminal failures and schedules retry windows.
- `src/dlens_ingest_core/workers/runner.py:293-398` claims a crawl job, marks
  crawl success/failure, and attempts to enqueue/run analysis.
- `src/dlens_ingest_core/workers/runner.py:401-425` marks analysis success or
  failure.
- `src/dlens_ingest_core/workers/runner.py:428-479` drains jobs and analyses
  until idle.
- `src/dlens_ingest_core/db/queries/crawl_jobs.py:1-23` reclaims pending due
  jobs and running jobs with expired leases, but only when a drain actually
  claims work.
- `src/dlens_ingest_core/db/job_store.py:331-378` maps retryable failures back
  to job `pending` and capture `queued`; terminal failures become job `dead`
  and capture `failed`.
- `src/dlens_ingest_core/db/read_store.py:45-117` joins capture + latest job +
  latest result + latest analysis for `/captures/{id}`.

## Current Backend State Machine

### Worker

Backend worker control has two public states:

| Backend worker API | Meaning | What it omits |
|---|---|---|
| `idle` | No drain thread is currently alive | Pending jobs, retry windows, expired running leases, last drain summary, last drain error |
| `draining` | Drain thread is alive | How many jobs remain, whether analysis is stuck, whether a specific capture is terminal |

This is intentionally small, but it makes `/worker/status` a liveness signal,
not a job-state signal.

### Job

Backend job snapshot states:

| Job state | Backend meaning | Terminal? |
|---|---|---|
| `pending` | Waiting to be claimed. May be immediately due or retry-scheduled for later. | No |
| `running` | Claimed by a worker token. Lease may still be valid or already expired. | No |
| `succeeded` | Crawl result was stored and capture was marked succeeded. | Crawl terminal yes, analysis may still be pending/missing/running/failed |
| `dead` | Terminal crawl failure after non-retryable error or max attempts. | Yes |

Important detail: `pending` is overloaded. A fresh queued job and a retryable
failure scheduled for five or thirty minutes both appear as `pending`.

### Capture

Capture snapshot states:

| Capture state | Backend meaning |
|---|---|
| `queued` | Capture exists and is waiting/retryable. |
| `running` | Crawl is active. |
| `succeeded` | Crawl result exists. |
| `failed` | Terminal crawl failure. |

Capture can be `succeeded` while analysis is missing, pending, running, or
failed. The read API returns the latest analysis, but the capture status itself
does not encode analysis terminal state.

### Analysis

Analysis snapshot states:

| Analysis state | Backend meaning | Terminal? |
|---|---|---|
| missing | No analysis row exists for the capture. | No explicit terminal state |
| `pending` | Analysis row exists but has not been claimed. | No |
| `running` | Analysis is claimed. | No |
| `succeeded` | Analysis payload exists. | Yes |
| `failed` | Analysis failed with `last_error`. | Yes |

The backend already tests that analysis enqueue failure does not roll back a
successful crawl (`tests/workers/test_runner.py:328-367`). That behavior is
reasonable, but the API does not currently promote the enqueue failure into a
capture/job state that the extension can show as a clear terminal error.

## Current Extension State Machine

### Stored item status

Extension `SessionItem.status` is:

| Extension item status | Main source |
|---|---|
| `saved` | Local item, not queued |
| `queued` | Backend job pending or no initial job read yet |
| `running` | Backend job/capture running |
| `succeeded` | Backend job/capture succeeded |
| `failed` | Backend job dead/capture failed, or local stale timeout |

`reconcileSessionItem()` stores the backend job/capture snapshots, maps the
item status, and copies job `last_error_kind` / `last_error`. It does not copy
analysis `last_error` into item error fields.

### UI readiness

`getItemReadinessStatus()` projects item status into UI readiness:

| Extension item state | UI readiness |
|---|---|
| `saved` | `saved` |
| `queued` | `crawling` |
| `running` | `crawling` |
| `succeeded` + analysis `succeeded` | `ready` |
| `succeeded` + analysis `failed` | `failed` |
| `succeeded` + missing/pending/running analysis | `analyzing` |
| `failed` | `failed` |

This projection is useful, but it means an item can be stored as `succeeded`
while Product/Library readiness says `failed` because analysis failed. That
split is not inherently wrong, but it must be tested and surfaced deliberately.

### Polling and local stale timeout

The popup coordinator polls `/worker/status`, then calls `session/refresh-all`
when the current folder has in-flight work or the worker is/was draining.

Local stale timeout is triggered during `loadGlobalState()` via
`expireStaleInFlightItems()`. It fails stale `running` and `succeeded +
analysisNeedsRefresh` items after five minutes, but intentionally leaves
`queued` items recoverable.

That is the correct recovery policy for normal queued work, but it is a blind
spot for retry-scheduled jobs because backend retry state also appears as
`pending` / capture `queued`.

## Alignment Table

| Backend truth | API surface today | Extension projection today | Risk |
|---|---|---|---|
| New queued job | job `pending`, capture `queued`, worker may be `idle` or `draining` | item `queued`, readiness `crawling` | OK if a drain is started; ambiguous if no drain is running |
| Retryable crawl failure | job `pending` with `last_error_kind`, future `scheduled_at`; capture `queued` | item `queued`, readiness `crawling`, queued never stale-expires | Looks like active crawl, but it may just be waiting 5 or 30 minutes |
| Active crawl | job `running`, capture `running`, lease valid | item `running`, readiness `crawling`; stale timeout can fail after no progress | Mostly guarded |
| Worker died during crawl | job may remain `running` until lease expires; `/worker/status` becomes `idle` | item can stay `running` until refresh/stale timeout | Backend can reclaim on next drain, but status does not say a reclaimable expired lease exists |
| Expired running lease | job `running`, `lease_expires_at <= now`, claimable by next drain | still appears `running` through `/jobs/{id}` until another worker claims it | Extension polling cannot distinguish "still running" from "expired but not reclaimed" |
| Crawl succeeded, analysis row pending/running | job/capture `succeeded`, capture.analysis `pending|running` | stored item `succeeded`, readiness `analyzing`; stale timeout can fail after 5 min | Guarded only by local timeout |
| Crawl succeeded, analysis enqueue failed | job/capture `succeeded`, no analysis row; backend only logs enqueue failure | stored item `succeeded`, readiness `analyzing`; eventually stale timeout | Looks like analysis is in progress although no backend analysis exists |
| Crawl succeeded, analysis failed | job/capture `succeeded`, analysis `failed` + `last_error` | stored item remains `succeeded`, readiness `failed`; item error fields stay job-null | UI can say failed, but root cause is not attached to the item error contract |
| Crawl terminal failure | job `dead`, capture `failed`, job `last_error_kind` / `last_error` | item `failed`, readiness `failed`, job error copied | Best-aligned terminal state |
| Backend unreachable / 500 | `fetchJson()` throws and emits `backend.request` error | start-processing writes tab error; worker-status coordinator stores Product-mode worker error | Partly surfaced, but not every mode/error path has the same visible affordance |

## Existing Trace And Test Coverage

Strong coverage already present:

- `tests/backend-llm-trace.test.ts:20-57` verifies backend fetches emit typed
  `backend.request` pending/ok events.
- `tests/pipeline-trace.test.ts:25-36` locks the phase list:
  `hover.detected`, `preview.confirmed`, `signal.saved`, `backend.request`,
  `crawl.queued`, `capture.ready`, `llm.call`, `analysis.ready`, `ui.ready`.
- `tests/qa-trace-summary-cli.test.ts:26-90` verifies a complete happy-path
  trace can satisfy all required phases and terminal `ui.ready`.
- `docs/qa/assets/2026-06-13/full-live-backend-llm/live-trace-full-hover-save-queue-analysis.json`
  is a real Jason-profile full live fixture with all required phases.
- Backend worker tests cover success, retryable requeue, terminal dead-letter,
  analysis enqueue failure, analysis failure, inline analysis processing, and
  expired lease reclaim.
- Extension tests cover local stale timeout for running/analyzing items and
  deliberately leave queued work recoverable.

What the existing fixture does not prove:

- It does not prove `/worker/status` can distinguish idle-with-no-work from
  idle-with-retry-scheduled-work, idle-with-expired-lease, or idle-after-drain
  failure.
- It does not prove Product/Library/Topic surfaces show backend retry schedule
  or analysis failure cause.
- It does not prove old backend job results cannot appear as "fresh enough"
  after a user requeues the same saved item and gets a new job/capture pair.
- It does not prove network/500/version mismatch errors become visible in every
  relevant workspace. It proves the trace event exists and some Product-mode
  copy exists.

## Drift Cases To Lock Next

### D1. Retry-scheduled job looks like active crawling

Backend behavior:

- Retryable crawler errors become job `pending`, capture `queued`, and a future
  `scheduled_at`.

Extension behavior:

- Job `pending` maps to item `queued`.
- Readiness becomes `crawling`.
- Queued items intentionally do not stale-expire.

Risk:

The user sees an item that looks like it is still being processed, but backend
truth may be "retry scheduled for later".

Expected future assertion:

- Given a backend job `pending` with `last_error_kind` and `scheduled_at` in the
  future, extension projection must expose a retry-waiting state or user-visible
  retry copy, not generic active crawling.

### D2. Expired running lease needs a drain, not passive polling

Backend behavior:

- Expired running jobs are reclaimable by `claim_next_job()` when a drain runs.
- `/worker/status` still only says `idle` if no drain thread is alive.

Extension behavior:

- Passive polling refreshes item snapshots but does not auto-start a new drain.
- The item can stay running until local stale timeout.

Risk:

The backend has enough state to recover, but extension polling does not know
that a recoverable expired lease exists.

Expected future assertion:

- Worker status summary must expose reclaimable/expired running work, or the
  extension must have a tested rule for prompting/starting recovery without
  hiding the stale condition.

### D3. Crawl succeeded but analysis never exists

Backend behavior:

- `analysis_enqueue_failed` is logged.
- Crawl remains succeeded.
- Capture read returns `analysis: null`.

Extension behavior:

- Stored item becomes `succeeded`.
- Readiness becomes `analyzing`.
- Local stale timeout eventually fails it as waiting on analysis.

Risk:

The first several minutes look like normal analysis latency. The actual backend
condition is "analysis was never enqueued".

Expected future assertion:

- A missing analysis after crawl success must become a distinct tested state:
  either backend exposes an analysis enqueue error, or extension has a tested
  timeout/copy path that names analysis enqueue/missing-analysis instead of
  generic processing.

### D4. Analysis failure is not copied into item error fields

Backend behavior:

- Analysis failure is stored in `capture_analyses.last_error`.
- Job/capture remain crawl-successful.

Extension behavior:

- Readiness becomes `failed`.
- Stored item status remains `succeeded`.
- `lastError` and `lastErrorKind` are copied from job only, so analysis error is
  not attached to the item error fields.

Risk:

Surfaces that look at readiness can show failure, but surfaces that read item
error fields can miss the reason.

Expected future assertion:

- Analysis failure cause must be available through one canonical projection path
  used by Library/Product/Topic readiness surfaces.

### D5. Worker drain failure collapses to idle

Backend behavior:

- `DatabaseWorkerControlService._run()` catches and logs drain exceptions, then
  clears `_thread`.
- `/worker/status` returns `idle`.

Extension behavior:

- Next worker-status poll sees `idle`, not `last_error`.
- Per-item polling may later reveal failures, but worker-level failure is lost.

Risk:

The worker can fail as a process-level operation while the UI sees "idle".

Expected future assertion:

- Backend worker status should expose last drain outcome, or extension should
  have a tested fallback that correlates a recent `/worker/drain` start with no
  item progress and shows a clear recovery message.

### D6. Queue submission succeeds but initial job/capture fetch is swallowed

Extension behavior:

- `queueSessionItem()` swallows initial `fetchJob()` and `fetchCapture()`
  failures with `.catch(() => null)`.
- The item is still queued using the submit response.

Risk:

This is user-friendly for transient read-after-write lag, but it can hide
version mismatch or read-route failure until later polling.

Expected future assertion:

- Initial read failure after submit should be traced with enough detail to
  distinguish read-after-write lag from route/version mismatch.

## C0 Conclusion

`API` / `JOBS` is the highest remaining risk because it compresses multiple
backend truths into states that still look operational:

- worker `idle` does not mean no backend work exists;
- job `pending` does not mean "fresh queue" rather than "retry scheduled";
- capture `succeeded` does not mean analysis is terminal;
- item `succeeded` does not always mean UI-ready;
- `backend.request` trace coverage proves calls happened, not that negative job
  states are user-visible.

The next work should not start with a large refactor. It should add small
contracts and fixtures that make these ambiguous states impossible to ignore.
