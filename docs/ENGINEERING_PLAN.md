# Engineering Plan

**Type:** Rolling engineering roadmap. Investment direction only.
**Behavior contracts live in code + tests, not here.** This doc lists what we
believe we will work on next and what we have chosen to defer or skip; it does
not constrain what handlers, hooks, or storage keys are allowed to do.

**Supersedes:** the ad-hoc tech-debt list in [AGENTS.md](../AGENTS.md) §
"Tech Debt" (≈ lines 429–451 as of 2026-05-27). New roadmap items belong here;
AGENTS.md should link to this file.

**Last reviewed:** 2026-05-27, against baseline `320459c` on
`codex/pr-visible-metrics`. At review time, `HEAD` matched `origin/main`;
`origin/codex/pr-visible-metrics` was behind the local branch by 8 commits.

---

## 1. Current Baseline

What's true in the working repo today. Numbers and facts only.

### Storage architecture

- **Whole-snapshot key:** `dlens-global-state-v1` — sessions, signals,
  settings, productProfile, productContext, etc.
- **Active-session segment:** `dlens:v1:active-session-id` — single string,
  written by `saveActiveSessionSnapshot` fast path.
- **Per-tab key:** `dlens-tab-state-{tabId}` — popup page, hover state, etc.
- **In-memory caches:** `globalStateCache`, `tabStateCache`. Assumed
  invariant: all writes pass through `persistSnapshot()` which updates both.

### Diagnostic surfaces

- `[DLens] workspace switch` (content-script console, JSON-stringified):
  `popupDurationMs / serverDurationMs / storageSetMs / setModePath / overheadMs`
- `[DLens] saveSnapshot` (service-worker console, when slow):
  `storageSetMs / sessionCount / itemTotal`
- `window.__DLENS_LAST_SWITCH_PERF__` + ring of 20 on
  `window.__DLENS_SWITCH_PERF_LOG__`

### Measured perf state (2026-05-27 sample, after a5fa33c + 510a0b1)

- Mode-switch fast path: `storageSetMs` 1–16ms typical
- Mode-switch fallback (target mode session does not exist yet): full save
- `setModePath` reaches "fast" ≥ 95% of switches in a working session
- Outlier spikes (`storageSetMs > 300ms` with `setModePath = "fast"`) trace
  to chrome.storage write-queue contention with concurrent saves, not to the
  set-mode handler itself

### Resolved from prior tech-debt list

- ✅ `refreshAllItems` no-op short-circuit + lock test
  (`510a0b1`, `tests/background-locking.test.ts:31`)
- ✅ `session/set-mode` uses `loadSnapshotCached` (4f107e6)
- ✅ `saveSnapshot` broadcast is fire-and-forget (174179e)
- ✅ Active-session segment write (a5fa33c)
- ✅ `useTopicState` extracted from `useInPageCollectorAppState` (pre-session)
- ✅ `sendExtensionMessage` has worker-wake retry (pre-session)

### Still open from prior tech-debt list

- `entrypoints/background.ts` — 3149 lines, monolithic dispatch
- `src/ui/useInPageCollectorAppState.ts` — 1544 lines; further sub-hook
  extraction not done
- Backend `ThreadReadModel` OP-continuation refinement (Product mode P0)
- Signal Packet HTML/JSONL semantic cleanup

---

## 2. Completed Committed Next

Completed on `codex/pr-visible-metrics` on 2026-05-27. Kept here as the
execution record for this roadmap slice; replace this section when new
committed-next work is chosen.

### N1 — React top-level ErrorBoundary — done (`5239ac1`)

Wrap the popup React tree in a top-level `<ErrorBoundary>`. This is **not** a
replacement for the existing global runtime fallback at
[`entrypoints/threads.content.ts:472`](../entrypoints/threads.content.ts); that
catches non-React content-script errors and stays.

**Exit:** throwing in any view component renders a fallback UI inside the
popup shell instead of leaving the popup blank.

**Estimate:** ~2 hours.

### N2 — Storage usage surfacing via background message — done (`bb77a96`)

New background handler `storage/get-usage` calls
`chrome.storage.local.getBytesInUse()` and returns `{ bytesInUse, quota }`.
`SettingsView` consumes the response through `useInPageCollectorAppState`
(or a small dedicated hook). **No direct `chrome.storage` call from a
presentational component.**

**Exit:** Settings shows "Storage: X KB / 10 MB"; handler has a unit test
that mocks `getBytesInUse`; SettingsView test verifies it consumes the value
from props, not from a side effect.

**Estimate:** ~3 hours.

### N3 — Mutation seam for read-modify-write handlers — done (`1ae4cca`)

Introduce `mutateSnapshot(tabId, fn)` in `entrypoints/background.ts` that
wraps `withSnapshotLock`. Migrate every handler that does
`loadSnapshot → mutate → saveSnapshot` to go through it. This is **not** a
ban on `saveSnapshot`; tab-only writes and explicit single-key writes
(`saveActiveSessionSnapshot`) stay as they are.

**Exit:** every message handler that reads then writes the snapshot does so
through `mutateSnapshot`. Regression test: two concurrent mutations of
different sessions, neither is lost. Migrate incrementally — one handler
group (session / topic / signal / product / pr) per commit.

**Estimate:** 1–2 days.

### N4 — Behavioral perf regression tests — done (`7a6d3ca`)

Mocked-`chrome.storage` tests asserting structural properties, **not**
millisecond budgets (those are flaky in Node CI; real p95 stays manual and
moves to Phase 3 telemetry):

- `session/set-mode` on existing target-mode session writes only the
  active-session key and the tab key (no global key)
- `session/set-mode` on new target-mode session writes the global key
- `session/refresh-all` with no refreshable items and an unchanged error
  field issues zero `chrome.storage.local.set` calls
- `saveSnapshot` broadcast does not block the response

**Exit:** CI fails when any of the above invariants regress.

**Estimate:** ~1 day.

### N5 — Code review checklist — done (`da77e4d`)

`docs/CODE_REVIEW.md` — short self-check list, linked from the PR template.
Items at minimum: snapshot write path, lock seam usage, new storage key
requires migration plan, new LLM call requires fallback + usage accounting,
React prop stability when adding new view props, mount-time fetches do not
re-trigger snapshot writes, response shape additions are optional fields,
new message handler is RMW or not.

**Exit:** file exists, PR template links it, one PR has used it.

**Estimate:** ~1 hour.

---

## 3. Deferred Structural Work

Known work that we are intentionally not starting yet. Each item has a
trigger condition that should cause it to be promoted into §2.

### `sendAndSync` timeout + unified error model

`sendExtensionMessage` already has worker-wake retry. Missing: explicit
timeout (today the call can hang indefinitely under pathological worker
states) and a single error-shape UI surface in the popup.

**Trigger:** first user report of "popup unresponsive" or service-worker
hang that we can reproduce.

### Migration framework (multi-key, scoped)

State spans `dlens-global-state-v1`, `dlens:v1:active-session-id`,
`dlens-tab-state-*`, signal storage, topic storage, product analyses, PR
evidence. A real migration framework must address per-key scope, not
operate on a single combined snapshot. Sketch shape:
`{ from, to, scope: keyName, run(value): value }`, idempotent, run at
worker boot.

**Trigger:** first time we need to break the shape of an existing key.

### Snapshot backup (throttled or migration-time only)

A "write a backup on every save" design **must not** ship; it doubles the
storage write rate and directly conflicts with the contention work we just
did. Acceptable shapes:

1. Migration-time backup (`dlens-backup-pre-vN` before applying migrations)
2. Manual export (user-triggered, Phase-5 territory)
3. Throttled snapshot (e.g., once per hour of active editing)

**Trigger:** first corrupt-state incident or before the first risky
migration.

### Local crash log + export

After N1 lands, ErrorBoundary writes the last error and a sanitized snapshot
summary to `dlens-last-error`; Settings has an "Export crash log" button.
Stay local — see §4 for why we are not sending crash logs to an endpoint.

**Trigger:** N1 done + first unexplained user-reported issue.

### LLM provider abstraction

Today Google / OpenAI / Claude are handled via switch cases. Pull them
behind a small `LLMProvider` interface.

**Trigger:** adding a fourth provider, OR needing per-provider rate-limit
logic.

### `ModeDefinition` collection

Group `ALLOWED_PAGES`, mode theme, mode rail items, mode header copy per
mode. Three modes are still small enough to live inline.

**Trigger:** adding a fourth `FolderMode`.

### `background.ts` handler split

Pure maintainability. No user impact.

**Trigger:** either (a) next handler addition would push the file past
~3500 lines, or (b) two PRs collide on the dispatcher inside one sprint.

### `useInPageCollectorAppState` further extraction

`useTopicState` is already out. Other sub-hooks (product, PR, navigation)
remain inline.

**Trigger:** next sub-hook extraction becomes necessary to add a feature
without growing the master hook.

### Snapshot segment write v2 (sessions / signals / settings split)

Current active-session segment + N4 perf tests cover the dominant pain we
measured. A full segment split is a much larger surface area and requires
the migration framework above.

**Trigger:** `storageSetMs > 400ms p95` returns (would mean state-size
growth, new hot path, or fresh write contention).

### Storage quota actions (cleanup, GC suggestions)

Wait until N2 surfaces real usage numbers from real users.

**Trigger:** N2 shows real users above ~70% of the 10 MB quota.

### Backend ThreadReadModel OP-continuation refinement, Signal Packet
HTML/JSONL cleanup

Carried forward from the prior tech-debt list. These are Product-mode
backend quality items; they have their own threads of work and are not
part of the popup/perf line. Owners and triggers TBD.

---

## 4. Explicit Non-Goals

Investments we are choosing not to make.

- **Telemetry endpoint.** Needs privacy policy, consent copy, sanitization
  rules, and serving infra. Local diagnostics + crash log export answer the
  same questions for now without those prerequisites.
- **Rewriting the React layer** to Vue / Svelte / RSC.
- **IndexedDB migration** unless the 10 MB quota is genuinely hit.
- **Multi-tab coordination via BroadcastChannel** until a cross-tab user
  complaint surfaces.
- **Plugin API for analyzers.** No external contributor demand today.
- **Side panel parity.** `sidepanel.html` exists as a stub; fill it out
  only when requested.
- **i18n framework.** Single-language user base.
- **Dark mode.** No user request.
- **GraphQL or a schema layer over `ExtensionMessage`.** The union of
  message types is sufficient.
- **Speculative redesign to v2 mockup.** Until the v2 migration plan is
  re-scoped, the current UI converges piecemeal.

---

## Maintenance

- **One-in-one-out.** When adding a §2 item, retire a finished one (move
  to §1 "Resolved" or delete).
- **Review cadence.** Every 4–6 weeks, or after any perf / correctness
  incident.
- **Reviewer + date** at the top of this file on each pass.
