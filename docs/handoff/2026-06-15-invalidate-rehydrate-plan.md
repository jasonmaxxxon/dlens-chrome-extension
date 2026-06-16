# INVALIDATE Rehydrate Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `INVALIDATE` from 🟡 to 🟩 by proving the storage-write → `state/updated` broadcast → controller adoption → AppState rehydrate → loading-state-clear chain holds deterministically across every relevant lane.

**Architecture:** Keep the existing one-emitter (`entrypoints/background.ts:1342`) + one-message (`state/updated` in `src/state/messages.ts`) + one-listener (`src/ui/controller.tsx:182`) surface. Extend with characterization tests that lock each link in the chain. Where a hydrate state can get stuck, extract a small pure helper so the terminal condition is testable.

**Tech Stack:** MV3 service worker, React, TypeScript, Node test runner, mocked `chrome.storage.local`, mocked `chrome.tabs.sendMessage`, existing pipeline trace helpers (`popup.product.hydrate.*`).

---

## Current State

`SEAM_GUARD` and `RECONCILE` are 🟩 after PR #38 and PR #42. The remaining 🟡 in this lane is the contract that the rest of the system depends on:

> Whenever the storage seam writes, the popup eventually shows fresh state without entering or staying in an inconsistent loading state.

`INVALIDATE` is 🟡 because:

- the chain is wired (`chrome.storage.local.set` → background broadcasts `state/updated` → controller updates `AppState` → useInPageCollectorAppState rehydrates Product/Topic/PR caches);
- but each link is only covered by ad-hoc tests that don't characterize the full terminal-state guarantee;
- and at least one observable bug surface — "stuck `isHydratingProductSignals` after a hydrate error or out-of-order response" — has no behavior-level regression test.

## Done Condition

`INVALIDATE` can become 🟩 only when all scoped links have RED→GREEN tests for the rehydrate-terminal invariant:

1. **Write → broadcast**: every seam-owned write that mutates a session-visible key broadcasts `state/updated` exactly once for the affected tab.
2. **Broadcast → adoption**: the controller's `state/updated` listener updates `AppState` for every well-formed snapshot and ignores ill-formed messages without crashing the page.
3. **Adoption → rehydrate**: an `AppState` change that crosses the Product/Topic/PR hydrate gate triggers exactly one `popup.product.hydrate.request` (or equivalent for Topic/PR) per change.
4. **Rehydrate → terminal**: every `hydrate.request` is followed by exactly one of `hydrate.response`, `hydrate.error`, or `hydrate.skip` within the lane's lifecycle; `isHydratingX` clears in all three cases.
5. **`reconcile.stale-result.ignore` still emits** for stale results that arrive after rehydrate (RECONCILE invariant carries forward).
6. `npm run storage:seam-guard -- --list` stays at `0 allowlisted bypass(es)`.

## Lane Survey

### Already Covered

- `state/updated` message shape: `src/state/messages.ts:143` — has typed payload `{ tabId, snapshot }`.
- Single broadcast emitter: `entrypoints/background.ts:1342` — `sanitizeSnapshotForContentScript(snapshot)` is the gate; tests for sanitization shape exist in `tests/background-behavior.test.ts`.
- Controller listener: `src/ui/controller.tsx:182` — gated on `typed.type === "state/updated" && typed.snapshot`.
- Product hydrate trace points: `popup.product.hydrate.skip / request / response / error` in `src/ui/useInPageCollectorAppState.ts`.

### Wired But Under-Tested

- **Write → broadcast count per lane**: no test asserts that one logical write produces exactly one `state/updated`. Coalescing or duplicate emission would not be caught.
- **Controller adoption invariants**: no test asserts that an ill-formed `state/updated` (missing `snapshot`, wrong `tabId`, stale `requestId`) is silently ignored rather than crashing rehydrate.
- **AppState change → hydrate gate**: no test asserts that the conditions controlling `setIsHydratingProductSignals(true)` correspond 1:1 with a `hydrate.request` trace.
- **Hydrate terminal condition**: `hydrate.request` → exactly one of `{response, error, skip}` has no aggregate regression test; if a code path forgets to clear `isHydratingProductSignals`, only manual QA finds it.
- **Topic mode hydrate**: `src/ui/useTopicState.ts` has rehydrate logic but no equivalent trace prefix audit yet.
- **PR Evidence hydrate**: similar — verify whether `popup.pr.hydrate.*` events exist; if missing, add them as part of this plan's PR 3.

### Not In This Plan's Scope

These are downstream concerns or separate frontiers. Do not pull them in unless a test exposes a real terminal-state hole that requires them:

- background module split;
- `useInPageCollectorAppState.ts` decomposition (still 2542+ lines);
- storage `schemaVersion` migration;
- backend crawler / read-model behavior;
- Chrome QA manual flow;
- visual UI redesign;
- new product features.

## Cross-PR Invariants

These must hold at every slice boundary. Codex checks them per slice; Claude re-runs them pre-merge.

1. **`SEAM_GUARD` stays 🟩** — `npm run storage:seam-guard -- --list` reports `0 allowlisted bypass(es)` after every slice. No raw `chrome.storage.local.{set,remove,clear}` slips in.
2. **`RECONCILE` stays 🟩** — the verbatim wording in `docs/architecture/dlens-current-architecture-map.md` and `docs/memory/latest-shared-context.md` is not weakened. Stale results still ignored, not adopted.
3. **`request-reconcile.ts` stays pure** — no business logic added to the primitive.
4. **`state/updated` shape is additive only** — fields may be added; `tabId`, `snapshot`, `type` may not be renamed or removed. Content scripts on tabs older than the broadcast must not crash.
5. **Hydrate trace event names are stable** — `popup.product.hydrate.skip / request / response / error` are observable from QA fixtures (see `docs/qa/assets/2026-06-13/`). Renaming any of them silently is a regression. Adding new prefixes for Topic/PR is allowed.
6. **No new infinite loading states** — every code path that sets `isHydratingX(true)` must have a paired test that proves it eventually returns to `false`.

---

## PR 1: Write → Broadcast Per-Lane Count Lock

**Intent:** Prove that each seam-owned write that changes session-visible state broadcasts `state/updated` exactly once for the affected tab. Rules out silent coalescing and duplicate emission.

**Files:**
- Modify: `tests/background-behavior.test.ts`
- (Likely no source changes; if a seam helper is missing the broadcast, add the call inside the helper, not at every call site.)

### Task 1.1: Catalog seam writes and pair each with a broadcast assertion

- [ ] **Step 1: List the seam-owned write helpers**

These were extracted in PR #38:

- `writeGlobalStateSnapshot` (`src/state/snapshot-storage-seam.ts`)
- `writeSnapshotPayload` (`src/state/snapshot-storage-seam.ts`)
- `removeTabSnapshot` (`src/state/snapshot-storage-seam.ts`)
- `saveCompareCacheMap` (`src/compare/compare-cache-storage.ts`)
- `clearProductDerivedCache` (`src/compare/product-cache-storage.ts`)
- `writeProductContextStorage` (`src/compare/product-context-storage.ts`)
- `migrateLegacyProductContextStorage` (`src/compare/product-context-storage.ts`)

For each, determine: does it logically end with a single `state/updated` broadcast for its session? If yes, write the assertion; if no, document why (e.g., the helper is called inside a larger transaction that broadcasts once at the end).

- [ ] **Step 2: Write the failing per-lane broadcast count test**

Add to `tests/background-behavior.test.ts`:

```ts
test("session/refresh-all writes broadcast state/updated exactly once per tab", async () => {
  // run the flow, assert harness.tabMessages.filter(m => m.type === "state/updated" && m.tabId === activeTabId).length === 1
});
```

Repeat the same shape for each in-scope lane already covered by PR #40 / #41 (queue-item, refresh-item, product/analyze-signals, folder/synthesis/generate, folder/synthesis/clear, pr/match-criteria, pr/fetch-advanced-metrics).

- [ ] **Step 3: Run the failing tests**

```bash
npx tsx --test tests/background-behavior.test.ts
```

Expected: PASS for lanes that already broadcast once; FAIL for any lane that double-broadcasts or coalesces silently.

- [ ] **Step 4: If a failure surfaces, fix at the seam helper**

If a test fails because a write helper broadcasts more than once, fix the helper (not the call site) so the broadcast is single-shot per logical write. Do not touch `entrypoints/background.ts:1342` itself — that's the canonical emitter; the helpers must converge on it without duplicating it.

- [ ] **Step 5: Re-run + seam-guard**

```bash
npx tsx --test tests/background-behavior.test.ts
npm run storage:seam-guard -- --list
```

Expected:
- background tests pass;
- seam guard reports `0 allowlisted bypass(es)`.

- [ ] **Step 6: Commit PR 1**

```bash
git add tests/background-behavior.test.ts
git commit -m "refactor: lock per-lane state/updated broadcast count"
```

---

## PR 2: Controller Adoption + AppState Hydrate-Gate Lock

**Intent:** Prove the controller's `state/updated` listener correctly adopts well-formed snapshots, rejects ill-formed ones without crashing, and that AppState changes that should trigger rehydrate do so exactly once.

**Files:**
- Modify: `src/ui/controller.tsx` (only if a hydrate-gate hole is exposed by tests)
- Modify: `src/ui/useInPageCollectorAppState.ts` (only if rehydrate trigger needs a pure helper)
- Modify: `tests/controller.test.ts`
- Modify: `tests/use-in-page-collector-app-state.test.ts`

### Task 2.1: Controller ignores ill-formed `state/updated`

- [ ] **Step 1: Write the failing test**

Add to `tests/controller.test.ts`:

```ts
test("controller ignores state/updated without snapshot", () => {
  // simulate runtime.onMessage with { type: "state/updated", tabId: 1 } — no snapshot
  // assert: no AppState change, no error, no rehydrate triggered
});

test("controller ignores state/updated for a different tabId", () => {
  // simulate runtime.onMessage with { type: "state/updated", tabId: 999, snapshot: {...} }
  // assert: AppState unchanged for the current tab
});
```

- [ ] **Step 2: Run** — confirm RED if either gate is missing.

```bash
npx tsx --test tests/controller.test.ts
```

- [ ] **Step 3: Implement minimal gate fix** if controller currently crashes or partially adopts.

### Task 2.2: AppState change → hydrate.request 1:1

- [ ] **Step 1: Write the failing test**

Add to `tests/use-in-page-collector-app-state.test.ts`:

```ts
test("AppState change that crosses Product hydrate gate emits exactly one hydrate.request", () => {
  // simulate AppState transition that should trigger rehydrate
  // assert: exactly one popup.product.hydrate.request event
  // assert: setIsHydratingProductSignals(true) called exactly once
});

test("repeated AppState changes within hydrate window coalesce to one hydrate.request", () => {
  // simulate two AppState changes during in-flight hydrate
  // assert: only one hydrate.request fired
  // assert: when response arrives, isHydrating clears
});
```

- [ ] **Step 2: Run** — confirm RED on coalescing behavior if it's missing.

- [ ] **Step 3: Implement minimal coalesce gate** if needed.

### Task 2.3: Commit PR 2

```bash
git add src/ui/controller.tsx src/ui/useInPageCollectorAppState.ts tests/controller.test.ts tests/use-in-page-collector-app-state.test.ts
git commit -m "refactor: lock controller adoption and hydrate gate behavior"
```

---

## PR 3: Hydrate-Terminal Invariant + Topic/PR Trace Parity + Flip to 🟩

**Intent:** Lock the terminal hydrate condition (no stuck loading), extend the trace audit to Topic and PR Evidence, and flip `INVALIDATE` to 🟩.

**Files:**
- Modify: `src/ui/useInPageCollectorAppState.ts` (Topic/PR hydrate trace if missing)
- Modify: `src/ui/useTopicState.ts` (hydrate.request → terminal pair, if applicable)
- Modify: `tests/use-in-page-collector-app-state.test.ts`
- Modify: `docs/architecture/dlens-current-architecture-map.md`
- Modify: `docs/memory/current-state.md`
- Modify: `docs/memory/latest-shared-context.md`

### Task 3.1: Hydrate terminal pair lock (Product)

- [ ] **Step 1: Failing test**

```ts
test("popup.product.hydrate.request is always followed by exactly one terminal hydrate event", async () => {
  // for each: response, error, skip path, run the relevant code path
  // assert: trace contains exactly one request and exactly one terminal event
  // assert: isHydratingProductSignals returns to false after the terminal event
});
```

- [ ] **Step 2: Implement guard** — wherever `setIsHydratingProductSignals(true)` is called, ensure the matching `false` is reachable on every branch (success, error, skip). Use a `finally` or a single helper such as `withHydrateTrace(label, fn)` if it removes duplication; do not introduce a new state machine.

### Task 3.2: Topic / PR hydrate trace parity

- [ ] **Step 1: Audit** — grep for `setIsHydrating` and similar loading flags in `useTopicState.ts` and `useInPageCollectorAppState.ts` for Topic / PR Evidence. If trace events are missing, add `popup.topic.hydrate.*` and `popup.pr.hydrate.*` with the same {skip, request, response, error} shape.

- [ ] **Step 2: Failing test** — same as 3.1 but for Topic and PR lanes that exist.

- [ ] **Step 3: Implement minimal trace + terminal-pair coverage**.

### Task 3.3: Flip `INVALIDATE` to 🟩 only after tests prove the chain

- [ ] **Step 1: Update architecture map**

In `docs/architecture/dlens-current-architecture-map.md`:

- change node 48 label to `🟩 Invalidation / rehydrate<br/>broadcast + adoption + hydrate terminal locked`;
- update edges 83 (SEAM_PARTIAL → INVALIDATE) and 84 (INVALIDATE → APP) labels to `🟩 ...`;
- move `INVALIDATE` from `partial` class to `locked` (line 108);
- update A4 with the PR numbers and the verbatim flip wording (Step 2).

- [ ] **Step 2: Update memory docs (verbatim wording)**

Update `docs/memory/current-state.md` and `docs/memory/latest-shared-context.md` to include:

> `INVALIDATE` is 🟩 because storage-seam writes broadcast `state/updated` exactly once per lane, the controller adopts well-formed snapshots and ignores ill-formed ones, and every `popup.{product,topic,pr}.hydrate.request` is paired with exactly one terminal event, so loading flags cannot stick.

- [ ] **Step 3: Final verification matrix**

```bash
npm run typecheck
npm run storage:seam-guard -- --list
npx tsx --test 'tests/**/*.test.ts' 'tests/**/*.test.tsx'
npm run build
git diff --check
```

Expected:
- typecheck passes;
- seam guard reports `0 allowlisted bypass(es)`;
- full suite passes;
- build mirrors to the worktree `output/chrome-mv3` (not Desktop);
- diff check passes.

- [ ] **Step 4: Commit PR 3**

```bash
git add src/ui/useInPageCollectorAppState.ts src/ui/useTopicState.ts tests docs/architecture/dlens-current-architecture-map.md docs/memory/current-state.md docs/memory/latest-shared-context.md
git commit -m "refactor: lock invalidate rehydrate terminal contract"
```

---

## Verification Matrix Before Merging Any Slice

Every slice must run:

```bash
npm run typecheck
npm run storage:seam-guard -- --list
npx tsx --test <slice-focused-tests>
npx tsx --test 'tests/**/*.test.ts' 'tests/**/*.test.tsx'
npm run build
git diff --check
```

For PR 3, additionally confirm `docs/architecture/dlens-current-architecture-map.md` does not claim 🟩 until the full suite includes at least one terminal-pair RED→GREEN behavior test for each scoped category:

- Write → broadcast count per lane (PR 1);
- Controller adoption gate (PR 2);
- AppState → hydrate-request 1:1 (PR 2);
- hydrate.request → terminal pair for Product, Topic, PR (PR 3).

## Out Of Scope

- No background module split.
- No `useInPageCollectorAppState.ts` decomposition.
- No new Product/Topic/PR features.
- No visual UI redesign.
- No storage schema migration.
- No Chrome QA automation or temporary Chrome profiles.
- No direct `chrome-extension://.../sidepanel.html` QA.
- No changes to backend crawler/read-model behavior.
- No weakening of `SEAM_GUARD` (must stay 0 bypasses).
- No weakening of `RECONCILE` verbatim wording.
- No renaming of `state/updated` payload fields or existing hydrate trace event names.

---

## After This Plan

With `INVALIDATE` 🟩 landed, the remaining 🟡 nodes are infrastructure-edges and a partial implementation:

- `CS` (content script) — DOM-sensitive, blocked on hover/SPA-route concerns
- `API` / `CRAWLER` / `JOBS` — backend boundary; movement here requires backend repo changes
- `SEAM_PARTIAL` — legacy direct-key surface; partial coverage already in PR #27
- `BOUNDARY` — boundary tests; smaller, structural

A natural next lever is `BOUNDARY` 🟡→🟩 (boundary tests for View / VM walls), since `INVALIDATE` + `BOUNDARY` together give the popup a deterministic contract.
