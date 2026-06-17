# Popup health dot — design note

Date: 2026-06-17
Status: design note for a future small UI slice. No code change here.
Depends on: backend `/health` endpoint shipped in `dlens-ingest-core`
`main` after the API/JOBS work-truth closure.

## Why this note exists

Manual Chrome QA on 2026-06-17 confirmed PR 1–5 land cleanly: real
Threads tab, popup loads, no console error/warn, no "Backend 離線"
copy. While verifying, two latency observations surfaced that change
how a popup health dot should be wired:

- `/worker/status` averages ~2.2 s and occasionally exceeds 3 s. The
  process is alive — `lsof` shows the Python uvicorn worker in
  `SYN_SENT` to Supabase port 5432 during the spike. The latency is
  the remote DB connect, not the FastAPI handler.
- A naive 3 s timeout on a "Backend up?" poll would therefore mark the
  backend dead while it's actually fine — exactly the failure mode the
  health dot is supposed to prevent.

Backend now ships a separate `/health` endpoint that does no DB call;
this note lays out how the popup should consume both endpoints.

## Endpoint contract (already shipped on backend `main`)

| Endpoint | Answers | Latency class | Touches DB? |
| --- | --- | --- | --- |
| `GET /health` | "Is the uvicorn process responding?" | ~50 ms inside the process; ~500 ms cold round-trip | No |
| `GET /worker/status` | "What work exists right now?" — backlog / retry / expired-running / dead / analyses + drain summary | 1–6 s on Supabase WAN | Yes (2 aggregate queries) |

`/health` response shape (Pydantic in
`src/dlens_ingest_core/api/routes/health.py`):

```json
{ "status": "ok", "uptime_seconds": 24.198, "process_id": 94574 }
```

`/worker/status` shape unchanged from PR 1.

## Three rules the popup health dot must follow

These come from the live measurement above. Any future PR that wires
the dot should bake them in or document why it deviates.

### Rule 1 — `/health` poll timeout 3 s, `/worker/status` poll timeout ≥ 8 s

- `/health` is genuinely a process liveness check. 3 s is generous and
  still safe because handler latency is sub-100 ms.
- `/worker/status` already polls on the existing
  `getPollingDelayMs()` cadence (4 s draining / 8 s idle inflight /
  12 s idle). Its timeout must be at least 8 s so a single slow DB
  connect doesn't flap the dot.

### Rule 2 — A single timeout never turns the dot red

The DB-connect spike pattern is transient: one slow `SYN_SENT` does
not mean the backend is down. The dot reacts only after a *streak*:

| Consecutive timeouts | Dot |
| --- | --- |
| 0 | green |
| 1 | green (suppress; record telemetry only) |
| 2 | yellow ("backend slow") |
| 3+ | red ("backend unreachable") |

Recovery is symmetric: one successful poll returns to green.

### Rule 3 — Use `/health` for the dot itself; use `/worker/status` only when the user clicks open

The dot's visual state is driven by `/health`. The detail panel that
opens on click can show the most recent `/worker/status` payload
(backlog counts, last drain error, earliest retry) — but it must not
fetch `/worker/status` on every poll just to render the dot. That
would re-introduce the latency the split was designed to eliminate.

## Existing extension hooks the wiring should reuse

Do not invent new state lanes. The pieces already exist:

- `backend/get-health` message handler at
  `entrypoints/background.ts:2277`. Currently wraps
  `fetchWorkerStatus(baseUrl)`. Reuse this name but switch the
  underlying fetch to `/health` for the dot path; add a separate
  message (or reuse `worker/get-status`) for the detail panel.
- `WorkerStatusMessageResponse` in `src/state/messages.ts` already
  carries `backendWorkUiState`. The dot can read `kind` directly:
  - `idle | draining` → green
  - `analysis_waiting | retry_waiting` → blue (info)
  - `expired_running | analysis_failed | backend_error` → amber (blocked)
  - health unreachable streak → red (overrides projection)
- `useProcessingCoordinator` already exposes `workerStatus`,
  `workerError`, `backendWorkUiState`. Add a `backendReachability`
  field for the dot signal so views don't re-derive from `workerError`
  string matching.
- `BackendWorkUiState` union in `src/state/processing-state.ts:75`
  covers the seven projection kinds already; the dot doesn't add new
  kinds, only adds the reachability layer.

## Out of scope for this note

- Native Messaging in-extension Start Backend button. That stays
  deferred until the product is distributed beyond a single
  developer.
- Replacing the existing launchd autostart path (shipped in backend
  `scripts/launchd/`). LaunchAgent + KeepAlive remains the
  recommended way for the backend to come back after a crash.
- Adding new architecture map colors. `API` and `JOBS` already moved
  to 🟢 in `docs/architecture/dlens-current-architecture-map.md`; the
  dot is a polish slice within that scope, not a status promotion.

## Next slice (when disk budget allows)

When the next UI slice opens, the smallest useful PR is:

1. `entrypoints/background.ts`: split `backend/get-health` into two
   internal paths — one calling `/health` for the dot, one
   reusing `fetchWorkerStatus(baseUrl)` for the detail panel.
2. `src/ui/useProcessingCoordinator.ts`: track
   `backendReachability: "reachable" | "slow" | "unreachable"` from a
   consecutive-timeout counter (Rule 2).
3. `src/ui/InPageCollectorPopup.tsx`: render the dot at the
   ProcessingStrip's leading edge; on click, open a small popover
   that shows the cached `BackendWorkUiState` projection details.
4. Pure tests for the streak logic (3 timeouts to red, 1 success back
   to green) so the rule cannot regress silently.

No backend change is needed for this slice; backend `/health` and
`/worker/status` are already in place.
