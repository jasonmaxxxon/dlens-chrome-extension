# Backend API / JOBS C0 Audit

Date: 2026-06-16
Product baseline: `dlens-product-latest` `main` at `8478de0` after MIGRATE storage schema closure.
Backend baseline: `dlens-ingest-core` `main` after B4 golden fixtures (`6d0cb70`).
Status: C0 audit baseline for the API / JOBS implementation plan.

## Purpose

This audit asks one question:

> Can backend job orchestration look healthy while work is actually stuck,
> retry-scheduled, terminal, or analysis-failed?

The answer is currently yes. The extension and backend have working happy-path
queue / drain / poll behavior, but the API / JOBS boundary compresses multiple
different backend truths into a small set of UI-safe states. That leaves a
product-grade failure mode: the backend is alive, the popup keeps polling, and
the UI still looks like it is processing, but no useful terminal state reaches
the user.

This is why `API` and `JOBS` remain yellow in
`docs/architecture/dlens-current-architecture-map.md`. This is not a DOM
extraction problem and not a Product UI redesign problem. It is a backend work
truth contract problem.

## Current Architecture Truth

The current architecture map says the core product walls are locked:

- `TRACE`
- `SEAM_GUARD`
- `RECONCILE`
- `INVALIDATE`
- `BOUNDARY`
- `MIGRATE`

`MIGRATE` is no longer a blocker. It is locked at this baseline because
storage shape changes are registered in `src/state/storage-schema.ts` and
covered by `npm run storage:migrate-fixtures`.

The remaining relevant yellow nodes are:

- `API`: FastAPI API job bridge / polling.
- `JOBS`: job status cache for capture.ready / analysis.ready.
- `CRAWLER`: still DOM-sensitive and out of this audit.

## Finding 1: `/worker/status` Is Liveness, Not Work Truth

Product source today:

```ts
export interface WorkerStatusResponse {
  status: "idle" | "draining";
}
```

This means the extension can learn whether the backend drain thread appears
alive. It cannot learn whether there are:

- due pending jobs;
- retry-scheduled jobs;
- running jobs whose lease expired;
- dead crawl jobs;
- pending analyses;
- running analyses;
- failed analyses;
- a latest drain error;
- a latest drain completion timestamp.

That makes `/worker/status` a liveness signal, not a work-state signal.

Risk: `status: "idle"` can mean "no work exists", "retry is scheduled for
later", "a running lease expired", "analysis failed", or "drain errored and
stopped". Those cases have different product actions, but the current contract
does not let the extension distinguish them.

## Finding 2: Backend `pending` Is Overloaded

The backend job lifecycle currently exposes `pending`, `running`, `succeeded`,
and `dead` to the extension.

`pending` can mean at least two user-different states:

- fresh queued job, due now or soon;
- retry-scheduled job, with `scheduled_at` in the future after a retryable
  crawl failure.

The first is "waiting to be processed". The second is "a previous attempt
failed and the backend is waiting before retrying". Treating both as active
crawl makes the UI look like work is happening when the truth is retry backoff.

The future implementation must expose both a retry count and timing information
such as `earliest_retry_at` or `next_due_at`. A count alone still forces the
extension to guess whether retry is soon, far away, or already overdue.

## Finding 3: Running Jobs Can Expire Without Becoming Product Truth

Jobs contain lease fields:

- `claimed_at`
- `started_at`
- `lease_expires_at`
- `worker_token`

If a job is still `running` but `lease_expires_at` is in the past, the backend
truth is not "active crawling". It is "stale / reclaimable running work".

The extension currently has a local stale timeout in `src/state/store-helpers.ts`
that can mark in-flight items failed after five minutes without status updates.
That is useful as a defensive UI fallback, but it is not the same as backend
truth. The backend should expose expired running work directly.

## Finding 4: Capture Success Does Not Mean Analysis Terminal Success

For DLens product value, crawl success is not enough. The user needs a usable
analysis result.

Current extension projection already treats a succeeded item with missing or
running analysis as `analyzing`, and a succeeded item with failed analysis as
`failed`. That is a local projection over `latestCapture.analysis.status`.

But the worker summary does not expose analysis backlog / failure state. A
backend that reports `idle` can still have missing, pending, running, or failed
analysis state for captures the extension cares about.

The future contract must distinguish:

- crawl pending/running;
- crawl terminal failure;
- crawl succeeded but analysis missing;
- analysis pending/running;
- analysis failed with reason;
- analysis succeeded.

## Finding 5: Analysis Failure Reason Is Not Canonical Item Error

`reconcileSessionItem()` currently writes:

```ts
lastErrorKind: job?.last_error_kind ?? null,
lastError: job?.last_error ?? null
```

That means job errors become canonical item errors, but analysis errors do not.
Some surfaces can infer failed readiness from `capture.analysis.status`, while
other surfaces that read `item.lastError` have no reason to display.

Risk: one surface says failed, another looks like succeeded or reasonless
pending. The implementation plan must promote analysis failure into the same
canonical item error path, without weakening job-error handling.

## Finding 6: Initial Read After Queue Submission Needs Severity

After queue submission, the first `fetchJob()` / `fetchCapture()` can fail for
multiple reasons:

- read-after-write lag that is tolerable;
- route mismatch;
- backend unavailable;
- extension/backend API version mismatch;
- unexpected response shape.

TRACE can record the event, but the diagnostic value is weak if all failures
are treated the same. The next plan should classify initial read status:

```ts
type InitialReadStatus =
  | "ok"
  | "lag_tolerated"
  | "route_error"
  | "version_mismatch"
  | "backend_unavailable";
```

This classification belongs in the queue / backend diagnostic path, not in
View components.

## Required Negative Cases

The implementation plan must fixture these cases:

1. `retry-scheduled-crawl`
   - Backend job is `pending`.
   - `last_error_kind` indicates a retryable crawl error.
   - `scheduled_at` is in the future.
   - Extension projection is `retry_waiting`, not active crawl.

2. `expired-running-lease`
   - Backend job is `running`.
   - `lease_expires_at` is in the past.
   - Worker status summary reports `expired_running_jobs > 0`.
   - Extension projection is `expired_running`.

3. `missing-analysis-after-crawl-success`
   - Job / capture succeeded.
   - Analysis is missing.
   - Extension projection is `analysis_waiting` or explicit
     `analysis_missing`, not indefinite healthy processing.

4. `failed-analysis-after-crawl-success`
   - Job / capture succeeded.
   - Latest analysis failed.
   - Extension projection is `analysis_failed`.
   - Canonical item error includes the analysis failure reason.

5. `terminal-dead-crawl`
   - Job is `dead` or capture failed.
   - Extension projection is terminal crawl failure with job error kind.

Both backend and product fixtures should assert exact case-name set equality.
Future PRs must not silently remove a negative case.

## Acceptance Bar

This C0 is ready for implementation when the plan preserves these rules:

- backend API additions are additive;
- extension Views do not inspect raw backend counts;
- projection priority is explicit and tested;
- Product / Topic / PR UI changes remain compact recovery copy, not redesign;
- Chrome QA, if needed, uses Jason's real `Default` profile and the real
  `output/chrome-mv3` reload path;
- no status color changes are made until tests prove the new contract.

## Status Decision

Completing backend summary, extension projection, negative fixtures, and compact
recovery copy can move `API` / `JOBS` toward built/green.

Do not mark `API` / `JOBS` locked unless an automated guard catches the full
class of regression. Negative helper fixtures alone are not the same as a live
end-to-end failure gate.

