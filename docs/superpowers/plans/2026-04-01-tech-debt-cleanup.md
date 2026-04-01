# DLens v0 Tech Debt Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce current v0 maintenance risk by deleting dead state code, routing CompareView through the stable analysis helpers, splitting the popup God component into smaller units, fixing the background snapshot race, and starting a token layer for shared UI primitives.

**Architecture:** Keep the current extension-first architecture intact. Prefer deterministic shaping in `src/analysis/*` over ad hoc view helpers, isolate UI extraction without changing behavior, and treat the background write race as a correctness fix rather than a refactor. Experimental analysis ports remain out of the production UI path.

**Tech Stack:** TypeScript, React 19, WXT MV3, Node test runner via `tsx --test`, Chrome extension background worker + `chrome.storage.local`

---

## Scope Notes

- This plan follows the user-approved phase order: Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4.
- Do not connect `src/analysis/experimental/*` to the UI in this cleanup.
- Do not change hover debounce, add skeleton loading, add cluster similarity matching, or add save/bookmark flows.
- After each phase, update both `README.md` and `AGENTS.md`.
- Full verification after each phase:
  - `npm run typecheck`
  - `npx tsx --test tests/*.test.ts tests/*.test.tsx`
  - `npm run build`

## File Map

**Primary files to modify**
- `src/state/session-model.ts`
- `src/state/types.ts`
- `src/state/store-helpers.ts`
- `src/ui/CompareView.tsx`
- `src/ui/InPageCollectorApp.tsx`
- `entrypoints/background.ts`
- `README.md`
- `AGENTS.md`

**Primary files to create**
- `src/ui/components.tsx`
- `src/ui/ProcessingStrip.tsx`
- `src/ui/CollectView.tsx`
- `src/ui/LibraryView.tsx`
- `src/ui/SettingsView.tsx`
- `src/ui/tokens.ts`

**Primary tests to modify or add**
- `tests/session-model.test.ts`
- `tests/analysis-modules.test.ts`
- `tests/compare-view.test.tsx`
- `tests/*.test.ts` and `tests/*.test.tsx` as needed for extracted UI pieces or race coverage

---

### Task 1: Phase 0.1 - Audit and Remove `session-model.ts`

**Files:**
- Modify: `src/state/session-model.ts`
- Modify: `src/state/types.ts`
- Modify: `src/state/store-helpers.ts` if any shared helper needs consolidation
- Modify: `tests/session-model.test.ts`
- Test: `tests/session-model.test.ts`

- [ ] **Step 1: Audit actual usage before editing**

Run:
```bash
rg -n "session-model" src tests README.md AGENTS.md docs
```

Expected: confirm whether `src/state/session-model.ts` is used only by tests/docs or still imported by production files.

- [ ] **Step 2: Identify exported symbols worth keeping**

Run:
```bash
sed -n '1,260p' src/state/session-model.ts
sed -n '1,260p' src/state/types.ts
sed -n '1,360p' src/state/store-helpers.ts
```

Expected: decide whether any non-dead type/function should move into `types.ts` or `store-helpers.ts`.

- [ ] **Step 3: Decide whether a focused test is needed**

Rules:
- First confirm whether `tests/session-model.test.ts` already exists.
- If no focused test exists and Step 1 shows `session-model.ts` is dead in production, skip adding a new test and proceed directly to deletion plus full-suite verification.
- Only write a focused failing test if one of the file's helpers survives and moves to a new destination.

Choose the right failing test when needed:
- If the file should be fully deleted: update `tests/session-model.test.ts` to import from the new destination and fail until the destination exports exist.
- If one or two pure helpers survive: write a focused test against the new destination, not the old file.

- [ ] **Step 4: Run the focused test to verify it fails, or explicitly skip**

Run:
```bash
npx tsx --test tests/session-model.test.ts
```

Expected: fail because imports or exports have not been moved yet.
Skip condition: if no focused test exists and the file is confirmed dead, do not create one just for deletion.

- [ ] **Step 5: Implement the minimal move/delete**

Rules:
- Delete `src/state/session-model.ts` entirely if no production import needs it.
- If a helper is still useful, move it into `src/state/types.ts` or `src/state/store-helpers.ts`.
- Do not keep duplicate definitions across old and new files.

- [ ] **Step 6: Run the focused test to verify green**

Run:
```bash
npx tsx --test tests/session-model.test.ts
```

- [ ] **Step 7: Run full phase verification**

Run:
```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

- [ ] **Step 8: Update docs**

Update:
- `README.md`
- `AGENTS.md`

Document that `session-model.ts` was removed or reduced and note the new source of any surviving helpers.

---

### Task 2: Phase 0.2 - Unify Dominance Thresholds

**Files:**
- Modify: `src/ui/CompareView.tsx`
- Modify: `src/analysis/cluster-summary.ts` only if tests show the shared threshold should move into a named constant
- Test: `tests/analysis-modules.test.ts`
- Test: `tests/compare-view.test.tsx`

- [ ] **Step 1: Write the failing test for shared threshold behavior**

Add a focused assertion so `CompareView` behavior matches `getDominanceLabel()` from `cluster-summary.ts`.

- [ ] **Step 2: Run focused tests to verify failure**

Run:
```bash
npx tsx --test tests/analysis-modules.test.ts tests/compare-view.test.tsx
```

Expected: fail because `CompareView` still uses `0.7 / 0.4`.

- [ ] **Step 3: Remove local `dominanceLabel()` from `CompareView`**

Implementation target:
- Import `getDominanceLabel` from `src/analysis/cluster-summary.ts`
- Route the analysis summary strip to the shared helper
- Keep `analysisMetrics()` local because it is view formatting logic

- [ ] **Step 4: Re-run the focused tests**

Run:
```bash
npx tsx --test tests/analysis-modules.test.ts tests/compare-view.test.tsx
```

- [ ] **Step 5: Run full phase verification**

Run:
```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

- [ ] **Step 6: Update docs**

Update `README.md` and `AGENTS.md` to note the dominance threshold drift fix.

---

### Task 3: Phase 1.1 - Route `CompareView` Through Stable Analysis Helpers

**Files:**
- Modify: `src/ui/CompareView.tsx`
- Modify: `src/analysis/evidence.ts` only if API ergonomics need small adjustments
- Modify: `src/analysis/cluster-summary.ts` only if row-building inputs need tightening
- Modify: `src/analysis/types.ts` if view-facing row types need a small addition
- Test: `tests/compare-view.test.tsx`
- Test: `tests/analysis-modules.test.ts`

- [ ] **Step 1: Write failing tests for deterministic helper usage**

Cover:
- cluster rows ranked by the stable helper
- evidence order matches `pickEvidenceComments()`
- compare rows tolerate asymmetric cluster counts

- [ ] **Step 2: Run focused tests to verify red**

Run:
```bash
npx tsx --test tests/compare-view.test.tsx tests/analysis-modules.test.ts
```

- [ ] **Step 3: Replace inline cluster/evidence helpers**

In `src/ui/CompareView.tsx`:
- Remove local `topClusters()`
- Remove local `evidenceByCluster()`
- Import:
  - `buildEvidenceLookup`
  - `pickEvidenceComments`
  - `buildClusterSummaries`
  - `buildClusterCompareRows`
  - `getDominanceLabel`
  - `type ClusterCompareRow`

Implementation notes:
- Keep `getPost()`, `getComments()`, and `buildOneLinerRequest()` in place for now
- Use analysis helper outputs to drive cluster cards
- Keep view rendering structure stable unless tests require a small prop shape change

- [ ] **Step 4: Re-run focused tests**

Run:
```bash
npx tsx --test tests/compare-view.test.tsx tests/analysis-modules.test.ts
```

- [ ] **Step 5: Run full phase verification**

Run:
```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

- [ ] **Step 6: Update docs**

Update `README.md` and `AGENTS.md` to note that CompareView now consumes the stable analysis layer.

---

### Task 4: Phase 1.2 - Simplify `analysisMetrics()` Without Moving View Logic

**Files:**
- Modify: `src/ui/CompareView.tsx`
- Test: `tests/compare-view.test.tsx`

- [ ] **Step 1: Add a small failing test if needed**

Only add a test if simplifying `analysisMetrics()` changes any rendered strings or labels.

- [ ] **Step 2: Keep extraction local, remove duplicate threshold logic**

Implementation target:
- `analysisMetrics()` stays in `CompareView`
- Any label rendering delegates to `getDominanceLabel()`

- [ ] **Step 3: Run focused compare tests**

Run:
```bash
npx tsx --test tests/compare-view.test.tsx
```

- [ ] **Step 4: Run full phase verification**

Run:
```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

- [ ] **Step 5: Update docs**

Update `README.md` and `AGENTS.md` if the compare analysis summary description changed.

---

### Task 5: Phase 2.1 - Extract Shared UI Atoms Into `components.tsx`

**Files:**
- Create: `src/ui/components.tsx`
- Modify: `src/ui/InPageCollectorApp.tsx`
- Test: relevant existing UI tests under `tests/*.test.tsx`

- [ ] **Step 1: Map the extraction boundary**

Read the source block first:
```bash
nl -ba src/ui/InPageCollectorApp.tsx | sed -n '1,560p'
```

Extract only:
- `IconButton`
- `MetricIcon`
- `MetricChip`
- `PrimaryButton`
- `SecondaryButton`
- `PageButton`
- `PreviewCard`
- `surfaceCardStyle()`
- `statusTheme()`
- `formatElapsed()`
- `processingTone()`

Note:
- `previewMetrics()` and `avatarFromAuthor()` move together with `PreviewCard` as internal helpers.
- Do not export them separately unless another file actually needs them.

- [ ] **Step 2: Write or extend a failing test around one extracted component path**

Pick one stable behavior already covered by rendered output so the extraction is forced to preserve behavior.

- [ ] **Step 3: Run focused UI tests to verify red**

Run:
```bash
npx tsx --test tests/*.test.tsx
```

- [ ] **Step 4: Create `src/ui/components.tsx` and move the atoms**

Rules:
- Keep inline styles unchanged in this step
- Export only the pieces `InPageCollectorApp.tsx` actually uses
- Avoid pulling compare-specific code into the shared file

- [ ] **Step 5: Rewire `InPageCollectorApp.tsx` imports**

Goal: reduce `InPageCollectorApp.tsx` size without behavior changes.

- [ ] **Step 6: Re-run focused UI tests**

Run:
```bash
npx tsx --test tests/*.test.tsx
```

- [ ] **Step 7: Run full phase verification**

Run:
```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

- [ ] **Step 8: Update docs**

Update `README.md` and `AGENTS.md` with the new shared UI file.

---

### Task 6: Phase 2.2 - Extract `ProcessingStrip`

**Files:**
- Create: `src/ui/ProcessingStrip.tsx`
- Modify: `src/ui/InPageCollectorApp.tsx`
- Possibly Modify: `src/ui/components.tsx`
- Test: relevant UI tests

- [ ] **Step 1: Write a failing test if the strip has no current coverage**

Focus on one rendered behavior:
- idle/draining text
- badge counts
- strip presence

- [ ] **Step 2: Run focused UI tests to verify failure**

Run:
```bash
npx tsx --test tests/*.test.tsx
```

- [ ] **Step 3: Move `ProcessingStrip` into its own file**

Rules:
- Import `ProcessingSummary` from `src/state/processing-state.ts`
- Import `processingTone()` from `src/ui/components.tsx` if it lives there after Task 5

- [ ] **Step 4: Rewire `InPageCollectorApp.tsx`**

Goal: `InPageCollectorApp.tsx` becomes thinner with no behavior change.

- [ ] **Step 5: Re-run focused UI tests**

Run:
```bash
npx tsx --test tests/*.test.tsx
```

- [ ] **Step 6: Run full phase verification**

Run:
```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

- [ ] **Step 7: Update docs**

Update `README.md` and `AGENTS.md`.

---

### Task 7: Phase 2.3 - Split `InPageCollectorApp` Into Page Views

**Files:**
- Create: `src/ui/CollectView.tsx`
- Create: `src/ui/LibraryView.tsx`
- Create: `src/ui/SettingsView.tsx`
- Modify: `src/ui/InPageCollectorApp.tsx`
- Test: existing UI tests and any new focused tests needed for extracted page routing

- [ ] **Step 1: Define props for each page view**

Before moving JSX, map the prop boundaries:
- snapshot-derived read state
- handler callbacks
- transient UI state such as drafts or selected item state

- [ ] **Step 2: Write failing tests for one routed page boundary**

Examples:
- library view still shows Process All without item selection
- settings view still reflects provider fields
- collect view still renders preview card and folder switcher

- [ ] **Step 3: Run focused UI tests to verify red**

Run:
```bash
npx tsx --test tests/*.test.tsx
```

- [ ] **Step 4: Extract `CollectView.tsx`**

Move only the collect page JSX and props; do not redesign styles.

- [ ] **Step 5: Extract `LibraryView.tsx`**

Preserve:
- item list
- inspector
- raw comments panel
- Process All visibility behavior

- [ ] **Step 6: Extract `SettingsView.tsx`**

Preserve:
- ingest base URL
- provider dropdown
- Google/OpenAI/Claude key inputs

- [ ] **Step 7: Reduce `InPageCollectorApp.tsx` to hooks + handlers + router**

Target outcome: under ~400 lines if the resulting structure stays readable.

- [ ] **Step 8: Re-run focused UI tests**

Run:
```bash
npx tsx --test tests/*.test.tsx
```

- [ ] **Step 9: Run full phase verification**

Run:
```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

- [ ] **Step 10: Manually verify the extension UI**

Run:
```bash
npm run build
```

Then reload the unpacked extension and confirm:
- Collect tab works
- Library tab works
- Compare tab still mounts
- Settings tab saves and reloads correctly

- [ ] **Step 11: Update docs**

Update `README.md` and `AGENTS.md` with the new view/component split.

---

### Task 8: Phase 3 - Fix the Background Snapshot Race

**Files:**
- Modify: `entrypoints/background.ts`
- Add or Modify tests under `tests/*.test.ts` if feasible for queue/refresh sequencing
- Test: full test suite plus manual Process All verification

- [ ] **Step 1: Read the current queue/refresh paths carefully**

Read:
```bash
nl -ba entrypoints/background.ts | sed -n '360,620p'
nl -ba entrypoints/background.ts | sed -n '620,980p'
```

Focus on:
- `queueSessionItem()`
- `queueAllPending()`
- refresh-item body
- `refreshAllItems()`
- `loadSnapshot() -> saveSnapshot()` interleavings

- [ ] **Step 2: Write the failing test you can support cheaply**

If practical, add a small unit-level regression around serialized writes or helper sequencing.
If a realistic automated race test is too brittle in this repo, document that and rely on manual concurrency verification after the code change.

- [ ] **Step 3: Run the focused test to verify red**

Run the specific added test, or explicitly document why no stable automated red case is possible before changing code.

- [ ] **Step 4: Add a module-level snapshot write lock**

Implementation target:
```ts
let writeChain: Promise<void> = Promise.resolve();
```

And a wrapper equivalent to:
```ts
async function withSnapshotLock<T>(fn: () => Promise<T>): Promise<T>
```

Rules:
- Serialize write-side snapshot mutations
- Do not hold the lock around unrelated network waits longer than necessary if the code can be restructured safely
- Prefer sequential queue/refresh mutation application over parallel `loadSnapshot() -> saveSnapshot()` overlap

- [ ] **Step 5: Route queue and refresh writes through the lock**

Minimum required coverage:
- `queueSessionItem()`
- refresh item reconciliation path
- `queueAllPending()` inner body
- `refreshAllItems()` inner body

- [ ] **Step 6: Decide batch strategy**

Preferred default:
- make `queueAllPending()` sequential
- keep behavior simple and correctness-first

Only preserve batches if correctness remains obvious under the lock.

- [ ] **Step 7: Re-run the focused test**

Run the new regression if one exists.

- [ ] **Step 8: Run full phase verification**

Run:
```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

- [ ] **Step 9: Manually verify the high-risk path**

Manual check:
- create or use a folder with 5+ items
- click Process All
- confirm every item transitions to queued/running/succeeded without sibling updates disappearing

- [ ] **Step 10: Update docs**

Update `README.md` and `AGENTS.md` to note the background persistence race fix and any remaining residual risk.

---

### Task 9: Phase 4 - Introduce Design Tokens for Shared UI Pieces

**Files:**
- Create: `src/ui/tokens.ts`
- Modify: `src/ui/components.tsx`
- Possibly Modify: `src/ui/ProcessingStrip.tsx`
- Test: relevant UI tests plus full suite

- [ ] **Step 1: Define the initial token surface**

Create:
- `tokens.color`
- `tokens.radius`
- `tokens.shadow`
- `tokens.spacing`

Only include values already in use by shared components.

- [ ] **Step 2: Write a failing test only if token extraction changes rendered behavior**

If extraction is behavior-neutral, skip a new test and rely on existing UI coverage.

- [ ] **Step 3: Move shared component styles to `tokens.ts`**

Limit scope:
- start with `components.tsx`
- then `ProcessingStrip.tsx` only if trivial
- do not sweep the entire popup in this phase

- [ ] **Step 4: Re-run focused UI tests**

Run:
```bash
npx tsx --test tests/*.test.tsx
```

- [ ] **Step 5: Run full phase verification**

Run:
```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

- [ ] **Step 6: Update docs**

Update `README.md` and `AGENTS.md` to describe the token layer and that larger visual redesign remains intentionally deferred.

---

## Exit Criteria

The cleanup is complete only when all of the following are true:

- `src/state/session-model.ts` is removed or reduced to a justified non-duplicate core
- `CompareView` uses the stable analysis helpers instead of inline ranking/evidence logic
- `InPageCollectorApp.tsx` is reduced to state orchestration plus page routing
- background snapshot writes are serialized enough to eliminate the known read-modify-write overwrite class
- shared UI atoms use a first-pass token file
- `README.md` and `AGENTS.md` are updated after every completed phase
- fresh verification commands succeed:
  - `npm run typecheck`
  - `npx tsx --test tests/*.test.ts tests/*.test.tsx`
  - `npm run build`

## Recommended Commit Boundaries

- Commit 1: remove `session-model.ts` dead code + dominance threshold unification
- Commit 2: CompareView stable analysis-layer adoption
- Commit 3: UI atoms + `ProcessingStrip` extraction
- Commit 4: page view split for `InPageCollectorApp`
- Commit 5: background snapshot race fix
- Commit 6: token layer introduction
