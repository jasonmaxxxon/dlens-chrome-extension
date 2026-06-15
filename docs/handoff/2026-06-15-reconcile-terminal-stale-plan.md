# RECONCILE Terminal-Stale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `RECONCILE` from 🟡 to 🟩 by proving every scoped late/stale async result cannot write storage, cannot broadcast `state/updated`, and cannot update UI state after its target is no longer current.

**Architecture:** Keep `src/state/request-reconcile.ts` as the single lane + target + `requestId` primitive. Extend coverage at the existing seams: UI response adoption in `src/ui/*`, snapshot response adoption in `src/ui/controller.tsx`, and background storage/broadcast writes in `entrypoints/background.ts`. Do not split background in this track; only add narrow helper seams where a stale result needs a testable gate.

**Tech Stack:** MV3 service worker, React, TypeScript, Node test runner, mocked `chrome.storage.local`, mocked `chrome.tabs.sendMessage`, existing `createRequestReconciler` and pipeline trace helpers.

---

## Current State

`SEAM_GUARD` is already 🟩 after PR #38: production `chrome.storage.local.{set,remove,clear}` writes route through seam-owned helpers and `npm run storage:seam-guard -- --list` reports 0 allowlisted bypasses.

`RECONCILE` is still 🟡 because the repo has targeted stale guards but not a terminal guarantee across the remaining async lanes. The remaining question is no longer "can code bypass the storage seam?" The remaining question is:

> When an older async response resolves after a newer request or after the user has moved to another target, can that old response still mutate storage, broadcast `state/updated`, or update the UI?

## Done Condition

`RECONCILE` can become 🟩 only when all scoped lanes have RED->GREEN tests for the terminal-stale invariant:

1. stale background result writes no storage keys;
2. stale background result sends no `state/updated` broadcast;
3. stale UI result does not update local resource state, notices, summaries, readings, fetched compare data, or loading state for a newer in-flight same-lane request;
4. ignored stale result emits `reconcile.stale-result.ignore`;
5. accepted current result behavior remains unchanged;
6. `npm run storage:seam-guard -- --list` stays at 0 allowlisted bypasses.

## Lane Survey

### Already Guarded And Behavior-Tested

These have meaningful behavior tests today:

- `background.session.refresh-all`: `tests/background-behavior.test.ts` asserts stale refresh writes once for the current session, broadcasts once, leaves old session queued, and emits `reconcile.stale-result.ignore`.
- `pr/fetch-advanced-metrics`: `tests/background-behavior.test.ts` asserts stale direct-key write is ignored and the newer metrics win.
- `pr/match-criteria`: `tests/background-behavior.test.ts` asserts stale direct-key write is ignored and the newer criteria matches win.
- Compare result workspace `fetchBrief` / `fetchClusterSummaries` / `fetchEvidenceAnnotations`: `src/ui/InPageCollectorResultWorkspace.tsx` uses `createRequestReconciler`; current coverage is mostly wiring-level in `tests/request-reconcile.test.ts`, not full UI terminal-state tests.

### Guarded But Under-Tested

These have reconciler wiring but need terminal-state tests:

- `product/analyze-signals`
- `product/synthesize-signal-reading`
- `product/review-signal-reading`
- `folder/synthesis/generate`
- `folder/synthesis/clear`
- `pr/generate-criteria`
- `pr/generate-summary`
- `pr/save-generated-criteria` nested inside criteria generation
- `session/queue-items-and-start-processing`

### Snapshot Lanes Missing From `buildSnapshotReconcileDescriptor`

These return snapshots through `sendAndSync`, touch backend or storage, and should be explicitly classified:

- `session/queue-item`
- `session/queue-selected`
- `session/queue-all-pending`
- `session/queue-items`
- `session/refresh-item`
- `session/refresh-selected`

They currently rely on ordinary snapshot updates and/or background saves. If a stale terminal response resolves late, UI snapshot adoption and background storage/broadcast behavior must be proved.

### Not In A3 Scope For This Plan

These are synchronous/local user intent paths or broader product workflows. Do not pull them into the first RECONCILE closure unless a test proves they can produce late terminal drift:

- direct settings edits, session rename/delete/set-mode, popup navigation, topic create/update/delete/triage, signal delete;
- Chrome QA manual flow;
- background file split;
- storage schema migration;
- Crawler DOM correctness;
- new UX or visual changes.

## Cross-PR Invariants

- Do not introduce new raw `chrome.storage.local.{set,remove,clear}` sites.
- Do not move business logic into `request-reconcile.ts`; it stays a pure primitive.
- Do not make stale results throw user-facing errors. Stale results are ignored and traced.
- Do not clear loading state for a stale older request if a newer same-lane request is still in flight.
- Do not hide accepted current errors; current-target failures still surface.
- Do not change request target identities silently. If a lane needs a narrower target, update tests and docs in the same PR.

---

## PR 1: Session Queue / Refresh Terminal-Stale Guard

**Intent:** Close the biggest remaining backend-backed snapshot hole: queue and refresh lanes that can write persisted session state after the user has moved to a newer request/target.

**Files:**
- Modify: `src/ui/controller.tsx`
- Modify: `entrypoints/background.ts`
- Modify: `tests/controller.test.ts`
- Modify: `tests/background-behavior.test.ts`
- Modify: `tests/request-reconcile.test.ts`

### Task 1.1: Expand Snapshot Reconcile Descriptors

- [ ] **Step 1: Write the failing descriptor test**

Add assertions to `tests/controller.test.ts`:

```ts
assert.deepEqual(
  buildSnapshotReconcileDescriptor({
    type: "session/queue-item",
    sessionId: "session-1",
    itemId: "item-1"
  }),
  {
    lane: "snapshot.session/queue-item",
    target: { sessionId: "session-1", itemId: "item-1" }
  }
);

assert.deepEqual(
  buildSnapshotReconcileDescriptor({
    type: "session/refresh-selected",
    target: { sessionId: "session-2", itemId: "item-2" }
  }),
  {
    lane: "snapshot.session/refresh-selected",
    target: { sessionId: "session-2", itemId: "item-2" }
  }
);
```

Also cover `session/queue-all-pending`, `session/queue-items`, and `session/refresh-item`.

- [ ] **Step 2: Run the failing test**

Run:

```bash
npx tsx --test tests/controller.test.ts
```

Expected: FAIL because the new message types are not in `SNAPSHOT_RECONCILE_MESSAGE_TYPES` and target extraction does not consistently include nested item targets.

- [ ] **Step 3: Implement minimal descriptor support**

In `src/ui/controller.tsx`:

- add the six session queue/refresh message types to `SNAPSHOT_RECONCILE_MESSAGE_TYPES`;
- keep target extraction in `readMessageTarget`;
- include `itemId` in the returned descriptor when present;
- keep `sessionId` required.

- [ ] **Step 4: Run descriptor test**

Run:

```bash
npx tsx --test tests/controller.test.ts
```

Expected: PASS.

### Task 1.2: Add Background Terminal-Stale Tests For Item Queue / Refresh

- [ ] **Step 1: Write the failing queue-item stale test**

In `tests/background-behavior.test.ts`, add a test that starts an old `session/queue-item` request for `old-session/item-old`, blocks the first `POST /capture-target`, then starts a newer `session/queue-item` for `new-session/item-new`.

Expected assertions:

```ts
assert.equal(oldResponse.ok, true);
assert.equal(newResponse.ok, true);
assert.equal(harness.writes.length, 1);
assert.equal(harness.tabMessages.filter((message) => message.type === "state/updated").length, 1);
assert.equal(storedOldItem.status, "saved");
assert.equal(storedNewItem.status, "queued");
assert.equal(traceHasIgnored("queue-old"), true);
```

- [ ] **Step 2: Write the failing refresh-item stale test**

Add the same shape for `session/refresh-item`: old item fetch blocks on `GET /jobs/job-old`; newer item refresh completes first.

Expected assertions:

```ts
assert.equal(harness.writes.length, 1);
assert.equal(harness.tabMessages.filter((message) => message.type === "state/updated").length, 1);
assert.equal(storedOldItem.status, "queued");
assert.equal(storedNewItem.status, "succeeded");
assert.equal(traceHasIgnored("refresh-old"), true);
```

- [ ] **Step 3: Run the failing background tests**

Run:

```bash
npx tsx --test tests/background-behavior.test.ts
```

Expected: FAIL because those background handlers do not begin per-request background reconcile tokens yet.

- [ ] **Step 4: Implement background reconcile tokens for queue / refresh lanes**

In `entrypoints/background.ts`:

- for `session/queue-item` and `session/queue-selected`, begin lane `background.session.queue-item` with target `{ sessionId, itemId, tabId }` and pass `{ reconcileToken }` into `queueSessionItem`;
- for `session/queue-all-pending`, begin lane `background.session.queue-all-pending` with `{ sessionId, tabId }`; update `queueAllPending` to accept options and pass the token into each `queueSessionItem`;
- for `session/queue-items`, begin lane `background.session.queue-items` with `{ sessionId, tabId }` and pass token into `queueSessionItems`;
- for `session/refresh-item` and `session/refresh-selected`, begin lane `background.session.refresh-item` with `{ sessionId, itemId, tabId }` and pass token into `refreshItem`;
- keep `session/queue-items-and-start-processing` and `session/refresh-all` behavior unchanged except for shared helper reuse if it reduces duplication.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx tsx --test tests/background-behavior.test.ts tests/controller.test.ts tests/request-reconcile.test.ts
npm run storage:seam-guard -- --list
```

Expected:

- background/controller/request reconcile tests pass;
- seam guard reports `0 allowlisted bypass(es)`.

- [ ] **Step 6: Commit PR 1**

```bash
git add src/ui/controller.tsx entrypoints/background.ts tests/controller.test.ts tests/background-behavior.test.ts tests/request-reconcile.test.ts
git commit -m "refactor: guard session queue refresh stale results"
```

## PR 2: Direct-Key Product / Folder / PR Terminal Tests

**Intent:** Convert existing direct-key wiring into behavior guarantees. This is mostly test work, with implementation only where the tests expose a real stale write/adoption hole.

**Files:**
- Modify: `tests/background-behavior.test.ts`
- Modify: `tests/request-reconcile.test.ts`
- Modify if tests fail: `entrypoints/background.ts`
- Modify if tests fail: `src/ui/useInPageCollectorAppState.ts`

### Task 2.1: Product Analyze Terminal-Stale Test

- [ ] **Step 1: Write a stale `product/analyze-signals` test**

Use the background harness with two product sessions. Block the old provider/backend path, start a newer analyze request, release old response last.

Expected assertions:

```ts
assert.equal(harness.writesFor(PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY).length, 1);
assert.equal(harness.tabMessages.filter((message) => message.type === "state/updated").length, expectedCurrentBroadcastCount);
assert.deepEqual(storedAnalyses.map((entry) => entry.signalId), ["new-signal"]);
assert.equal(traceHasIgnored("product-old"), true);
```

- [ ] **Step 2: Run focused test**

Run:

```bash
npx tsx --test tests/background-behavior.test.ts
```

Expected: FAIL only if current wiring misses a storage/broadcast edge.

- [ ] **Step 3: Fix only the exposed edge**

Likely fixes, depending on failure:

- pass `reconcileToken` into any ProductContext compile/cache write that still writes after the stale token is rejected;
- ensure stale queue side effects do not trigger Product auto-analysis;
- keep UI response ignored via `settleReconciledResponse`.

### Task 2.2: Folder Synthesis Generate / Clear Terminal Tests

- [ ] **Step 1: Add stale folder synthesis generate test**

Assert stale old synthesis does not overwrite current synthesis and emits `reconcile.stale-result.ignore`.

- [ ] **Step 2: Add stale folder synthesis clear test**

Assert stale clear does not remove a newer/current synthesis.

- [ ] **Step 3: Run**

```bash
npx tsx --test tests/background-behavior.test.ts
```

- [ ] **Step 4: Fix only if tests fail**

Expected likely implementation is already close because `withDirectStorageReconcile` wraps storage for both lanes.

### Task 2.3: PR Generate Summary / Generated Criteria

- [ ] **Step 1: Add UI terminal-adoption tests for `pr/generate-summary`**

Use the smallest existing UI test harness available for `useInPageCollectorAppState` / PR evidence command handling. If no clean harness exists, add a pure helper around the PR command reducer before adding runtime-level tests.

Expected assertion:

```ts
// old summary resolves after target campaign changed
assert.equal(resource.summary, "new summary");
assert.equal(resource.notice, "");
assert.equal(uiState.isGeneratingSummary, false);
assert.equal(traceHasIgnored("summary-old"), true);
```

- [ ] **Step 2: Add generated-criteria save chain test**

The nested `pr.saveGeneratedCriteria` request must not save/apply old generated labels after another campaign becomes active.

- [ ] **Step 3: Run**

```bash
npx tsx --test tests/*.test.ts tests/*.test.tsx
```

Expected: initially fail if the current UI logic lacks a stable command-level test seam.

- [ ] **Step 4: Implement minimal seam**

If UI code is too hard to test directly, extract a small pure helper from `onPrEvidenceCommand` to resolve stale decisions into a resource/UI patch. Do not move the full PR Evidence view model or background logic.

- [ ] **Step 5: Commit PR 2**

```bash
git add tests/background-behavior.test.ts tests/request-reconcile.test.ts src/ui/useInPageCollectorAppState.ts entrypoints/background.ts
git commit -m "refactor: lock direct-key stale result behavior"
```

## PR 3: Topic Audit / Judgment / Compare UI Adoption Survey Closure

**Intent:** Finish the non-storage UI adoption lanes or explicitly document them out of A3 if they are not terminal-stale risks.

**Files:**
- Modify: `src/ui/useTopicAudit.ts`
- Modify: `src/ui/useResultSurfaceState.ts`
- Modify: `src/ui/InPageCollectorResultWorkspace.tsx`
- Modify: relevant tests under `tests/*topic-audit*`, `tests/*result*`, `tests/*compare*`
- Modify: `docs/architecture/dlens-current-architecture-map.md`
- Modify: `docs/memory/current-state.md`
- Modify: `docs/memory/latest-shared-context.md`

### Task 3.1: Topic Audit Run / P1 Signal Adoption Guard

- [ ] **Step 1: Write failing topic audit stale tests**

Target `runTopicAudit` and `runP1ForSignal`:

- old `topic/audit/run` for topic A resolves after active folder/topic context changes;
- old `topic/audit/p1-signal` resolves after same topic/signal lane gets a newer request.

Expected assertions:

```ts
assert.equal(loadedByTopicId[oldTopicId], previousValue);
assert.equal(localRunByTopicId[oldTopicId]?.status, "running"); // if newer request still pending
assert.equal(traceHasIgnored("audit-old"), true);
```

- [ ] **Step 2: Add request reconciler in `useTopicAudit.ts`**

Use lane names:

- `topic.audit.run:${topicId}`
- `topic.audit.p1:${topicId}:${signalId}`

Target:

```ts
{ sessionId: activeFolder.id, topicId, signalId? }
```

- [ ] **Step 3: Run focused topic audit tests**

```bash
npx tsx --test tests/topic-audit*.test.ts tests/topic-detail-view.test.tsx
```

### Task 3.2: Judgment Start Terminal-Stale Guard

- [ ] **Step 1: Write failing judgment test**

`useResultSurfaceState.onStartJudgment` currently calls `judgment/start`, then adopts `savedAnalyses`. Add a stale test where old result judgment resolves after the active saved result changed.

Expected assertions:

```ts
assert.equal(savedAnalyses.find((entry) => entry.resultId === oldResultId)?.judgmentResult, null);
assert.equal(savedAnalyses.find((entry) => entry.resultId === newResultId)?.judgmentResult?.recommendedState, "act");
assert.equal(isGeneratingJudgment, expectedForCurrentRequest);
assert.equal(traceHasIgnored("judgment-old"), true);
```

`expectedForCurrentRequest` is intentionally scenario-dependent: if the newer judgment request has already settled, loading should be false; if the newer same-lane request is still pending, the stale older completion must not clear loading.

- [ ] **Step 2: Add reconciler to `useResultSurfaceState.ts`**

Use lane `judgment.start` and target `{ resultId }`. Keep manual `judgment/result` out of scope unless a test proves it races.

- [ ] **Step 3: Add background guard if test shows stale storage write**

If `judgment/start` persists old judgment before UI can ignore it, add a background reconcile token around:

- `getOrGenerateJudgment` cache write;
- `saveSavedAnalysisJudgment`;
- `mutateSnapshot`;
- `broadcastToAllTabs`.

Expected background assertion:

```ts
assert.equal(harness.writesFor(SAVED_ANALYSES_STORAGE_KEY).length, 1);
assert.equal(harness.tabMessages.filter((message) => message.type === "state/updated").length, 1);
assert.equal(broadcastJudgmentForOldResult, false);
```

### Task 3.3: Compare Result Workspace UI Terminal Tests

- [ ] **Step 1: Add tests around the three existing Compare lanes**

The code already uses `shouldApplyResponse(token)`. Add behavior tests so future changes cannot regress it:

- `compare.fetchBrief`
- `compare.fetchClusterSummaries`
- `compare.fetchEvidenceAnnotations`

Expected assertions:

```ts
assert.equal(fetched.brief?.headline, "new headline");
assert.equal(fetched.clusterSummaryState, "ready");
assert.deepEqual(fetched.evidenceAnnotations.map((entry) => entry.ref), ["new-ref"]);
assert.equal(traceHasIgnored("compare-old"), true);
```

- [ ] **Step 2: Extract only if needed**

If rendering the whole result workspace is too expensive, extract a tiny testable helper for applying compare async responses. Do not redesign Compare UI.

### Task 3.4: Flip RECONCILE To 🟩 Only After Tests Prove The Gate

- [ ] **Step 1: Update architecture map**

In `docs/architecture/dlens-current-architecture-map.md`:

- change node label to `🟩 Request reconcile<br/>terminal stale storage/broadcast/UI locked`;
- move `RECONCILE` from `partial` class to `locked`;
- update edges from API / LLM / providers to `🟩 stale result ignored`;
- update A3 roadmap text with the PR numbers.

- [ ] **Step 2: Update memory docs**

Update:

- `docs/memory/current-state.md`
- `docs/memory/latest-shared-context.md`

Required wording:

> `RECONCILE` is 🟩 because scoped late backend/LLM/UI async responses are regression-locked against stale storage writes, stale `state/updated` broadcasts, and stale UI adoption.

- [ ] **Step 3: Run final verification**

```bash
npm run typecheck
npm run storage:seam-guard -- --list
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
git diff --check
```

Expected:

- typecheck passes;
- seam guard reports 0 allowlisted bypasses;
- full suite passes;
- build mirrors to the worktree `output/chrome-mv3`;
- diff check passes.

- [ ] **Step 4: Commit PR 3**

```bash
git add src/ui/useTopicAudit.ts src/ui/useResultSurfaceState.ts src/ui/InPageCollectorResultWorkspace.tsx tests docs/architecture/dlens-current-architecture-map.md docs/memory/current-state.md docs/memory/latest-shared-context.md
git commit -m "refactor: lock terminal stale reconcile behavior"
```

## Verification Matrix Before Merging Any Slice

Every slice must run:

```bash
npm run typecheck
npm run storage:seam-guard -- --list
npx tsx --test <slice-focused-tests>
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
git diff --check
```

For PR 3, also confirm `docs/architecture/dlens-current-architecture-map.md` does not claim 🟩 until the full suite includes at least one terminal-stale RED->GREEN behavior test for each scoped category:

- session queue/refresh background snapshot lanes;
- Product/Folder/PR direct-key lanes;
- Topic audit / judgment / compare UI adoption lanes.

## Out Of Scope

- No background module split.
- No new Product/Topic/PR features.
- No visual UI redesign.
- No storage schema migration.
- No Chrome QA automation or temporary Chrome profiles.
- No direct `chrome-extension://.../sidepanel.html` QA.
- No changes to backend crawler/read-model behavior.
- No weakening of `SEAM_GUARD`; it must stay at 0 bypasses throughout.
