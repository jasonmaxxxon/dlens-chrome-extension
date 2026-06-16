# BOUNDARY Wall Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `BOUNDARY` from 🟡 to 🟩 by codifying the View / ViewModel walls into CI guard scripts that fail on any unauthorized boundary crossing, just like `SEAM_GUARD` enforces the storage seam.

**Architecture:** Add a single `npm run boundary:guard` entry that composes two scanner scripts mirroring `scripts/check-no-raw-storage.mjs`:

- `scripts/check-view-boundary.mjs` — bans View modules from importing `sendExtensionMessage`, calling `Date.now()` / `Math.random()`, mutating storage, or directly calling browser APIs that belong in the controller / VM layer.
- `scripts/check-viewmodel-boundary.mjs` — bans ViewModel modules from importing `chrome.*`, calling `fetch`, touching `document` / `window` / `File`, or importing React.

Both scripts accept the same `TODO(boundary-bypass): <reason>` allowlist convention as `TODO(seam-bypass)`. The exit criterion for 🟩 is the same: **zero allowlisted bypasses**.

**Tech Stack:** Node `readdirSync` + regex scanner (no AST tooling — mirror seam-guard's lightweight design), wired into CI via existing `npm run` + `verify` workflow.

---

## Current State

`SEAM_GUARD`, `RECONCILE`, and `INVALIDATE` are 🟩 after PR #38, #42, #45. The walls these layers depend on — View ⊅ side-effects, ViewModel ⊅ browser APIs — are described in the architecture map's **A1** narrative but have no CI enforcement today.

`BOUNDARY` is 🟡 because:

- five feature-targeted boundary tests exist (`tests/boundary-docs.test.ts`, `pipeline-spine-slice-2-boundary.test.ts`, `pipeline-spine-slice-3-boundary.test.ts`, `pipeline-trace-boundary.test.ts`, `pr-evidence-readmodel-boundary.test.ts`);
- but no scanner enforces the **View / VM walls** at file level;
- and at least two known violations exist:
  - `src/ui/SettingsView.tsx:89` uses `Date.now()` for ID generation;
  - `src/ui/CompareView.tsx:1472` uses `performance.now() ?? Date.now()` for timing.

The 0.2 ViewModel boundary work (PR #16-#20, 2026-06-11) made `src/viewmodel/*` pure (4 files). That investment is currently un-locked: nothing prevents a future PR from importing `chrome.storage.local.get` into `src/viewmodel/product-signal.ts`.

## Done Condition

`BOUNDARY` can become 🟩 only when:

1. **View wall guard script** rejects unauthorized:
   - `sendExtensionMessage` import / call;
   - `Date.now()`, `Math.random()`, `performance.now()` calls;
   - `chrome.storage.local.{set,remove,clear,get}` calls (read AND write — View should never read storage directly, that's the controller's job);
   - `chrome.runtime.sendMessage` direct calls.
2. **ViewModel wall guard script** rejects unauthorized:
   - `chrome.*` references (any namespace);
   - `fetch(` calls;
   - `document.*` / `window.*` references;
   - `File` / `Blob` / `FormData` references;
   - React imports (`react`, `react-dom`).
3. **CI integration**: `npm run boundary:guard` is part of the `verify` step alongside `npm run storage:seam-guard`.
4. **Allowlist mechanism**: both scripts accept inline `TODO(boundary-bypass): <reason>` and a paired entry in this plan's "Permanent exceptions" table (default: empty).
5. **Zero allowlisted bypasses** after the cleanup PRs.
6. `npm run storage:seam-guard -- --list` stays at 0 allowlisted bypasses.

## Lane Survey

### View files (27 `.tsx` in `src/ui/`)

To be scanned. Known violations from initial survey:

| File | Line | Violation | Resolution path |
|---|---|---|---|
| `src/ui/SettingsView.tsx` | 89 | `Date.now().toString(36)` for context ID | Pass `now: () => number` (or pre-generated `contextId`) from VM / controller |
| `src/ui/CompareView.tsx` | 1472 | `performance.now() ?? Date.now()` for timing | Pass `now: () => number` from VM / controller (timing belongs in measurement helper, not View) |

PR 1 must complete the full View scan and fix every violation before the guard script ships at zero allowlisted.

### ViewModel files (4 `.ts` in `src/viewmodel/`)

- `src/viewmodel/compare.ts`
- `src/viewmodel/pr-evidence.ts`
- `src/viewmodel/product-signal.ts`
- `src/viewmodel/topic-detail.ts`

These were extracted as pure VMs in PR #16-#20. PR 2 must verify zero violations and ship the guard. If any violation is found, the fix is at the VM (not the View) — VMs receive pre-computed inputs from the controller.

### Hooks / app-state files

`src/ui/useInPageCollectorAppState.ts`, `src/ui/useTopicState.ts`, `src/ui/controller.tsx`, and similar **are not** Views. They are controller-layer hooks; they legitimately call `sendExtensionMessage`, read storage, and use `Date.now()`. The View wall guard must **scope its scan to `.tsx` View files only**, not `.ts` hook files.

Tentative rule: a file is a View if (a) it lives in `src/ui/`, (b) ends in `.tsx`, AND (c) primarily exports a React component (default export is a function returning JSX). Hook files (`use*.ts`) and controller files (`controller.tsx`, even though `.tsx`, is a controller) are excluded by explicit list at the top of the guard script.

### Not In This Plan's Scope

- background module split (`entrypoints/background.ts` 3839 lines);
- `useInPageCollectorAppState.ts` decomposition (2542 lines);
- storage schema migration (MIGRATE 🔴);
- backend crawler / read-model behavior;
- Chrome QA manual flow;
- visual UI redesign;
- new product features.

## Cross-PR Invariants

1. **`SEAM_GUARD` stays 🟩** — `npm run storage:seam-guard -- --list` reports `0 allowlisted bypass(es)` after every slice.
2. **`RECONCILE` stays 🟩** — verbatim wording in `docs/architecture/dlens-current-architecture-map.md` and `docs/memory/latest-shared-context.md` is not weakened.
3. **`INVALIDATE` stays 🟩** — verbatim wording is not weakened.
4. **`request-reconcile.ts` stays pure** — no business logic added.
5. **Existing 5 boundary tests stay green** — `boundary-docs.test.ts`, the three `pipeline-spine-slice-*-boundary.test.ts`, `pipeline-trace-boundary.test.ts`, `pr-evidence-readmodel-boundary.test.ts`. Wall guards complement these, do not replace them.
6. **No new infinite loading state** — fixing `Date.now()` violations in View must not introduce a code path that holds loading flags.

---

## PR 1: View Wall Guard + Fix Known Violations

**Intent:** Ship `scripts/check-view-boundary.mjs`, fix all View wall violations exposed by the script, wire it into `npm run boundary:guard` and CI.

**Files:**
- New: `scripts/check-view-boundary.mjs`
- Modify: `package.json` (add `boundary:guard:view` script)
- Modify: `.github/workflows/verify.yml` or equivalent CI config (add `npm run boundary:guard:view`)
- Modify: `src/ui/SettingsView.tsx` (fix `Date.now()` violation)
- Modify: `src/ui/CompareView.tsx` (fix `performance.now() ?? Date.now()` violation)
- Possibly modify: `src/ui/useInPageCollectorAppState.ts` or relevant hooks (provide `now` / `contextId` to Views)
- Possibly modify: `src/viewmodel/*.ts` (if a violation's clean fix is in VM rather than hook)
- New / Modify: `tests/check-view-boundary.test.ts` (smoke test that runs the scanner against the live source tree)

### Task 1.1: Write the failing scanner script

- [ ] **Step 1: Copy `scripts/check-no-raw-storage.mjs` as the template**

Adapt:
- Rename to `scripts/check-view-boundary.mjs`.
- Replace `STORAGE_WRITE_RE` with an array of forbidden patterns:

```js
const VIEW_FORBIDDEN_PATTERNS = [
  { name: "sendExtensionMessage", re: /\bsendExtensionMessage\s*\(/, op: "import-or-call" },
  { name: "Date.now()", re: /\bDate\.now\s*\(/, op: "time-source" },
  { name: "Math.random()", re: /\bMath\.random\s*\(/, op: "random-source" },
  { name: "performance.now()", re: /\bperformance\.now\s*\(/, op: "time-source" },
  { name: "chrome.storage.local.set", re: /chrome\.storage\.local\.set\s*\(/, op: "storage-write" },
  { name: "chrome.storage.local.remove", re: /chrome\.storage\.local\.remove\s*\(/, op: "storage-write" },
  { name: "chrome.storage.local.clear", re: /chrome\.storage\.local\.clear\s*\(/, op: "storage-write" },
  { name: "chrome.storage.local.get", re: /chrome\.storage\.local\.get\s*\(/, op: "storage-read" },
  { name: "chrome.runtime.sendMessage", re: /chrome\.runtime\.sendMessage\s*\(/, op: "runtime-message" }
];
```

- Allowlist marker: `TODO(boundary-bypass): <reason>`.
- Scan only View files: `.tsx` files under `src/ui/` that are not in the explicit hook/controller exclusion list:

```js
const VIEW_FILE_EXCLUDE = new Set([
  "src/ui/controller.tsx",
  "src/ui/useInPageCollectorAppState.ts", // .ts not .tsx but defensively listed
  // add other hook files if they end up .tsx for any reason
]);
```

- Rule: scan `src/ui/**/*.tsx` minus the exclusion set, minus any file whose name matches `/^use[A-Z]/`.

- [ ] **Step 2: Run against unmodified main**

Expected: FAIL with at least 2 findings (the known violations).

```bash
node scripts/check-view-boundary.mjs
```

- [ ] **Step 3: Write a smoke test that wraps the scanner**

Add `tests/check-view-boundary.test.ts`:

```ts
import { findViewBoundaryViolations } from "../scripts/check-view-boundary.mjs";

test("View files do not contain unauthorized boundary violations", () => {
  const { findings, allowlisted } = scanRepoForViewBoundary(); // exported helper
  assert.equal(findings.length, 0, `unauthorized: ${JSON.stringify(findings)}`);
  assert.equal(allowlisted.length, 0, `allowlisted bypasses remain: ${JSON.stringify(allowlisted)}`);
});
```

The test exits non-zero if violations exist, mirroring the seam-guard test pattern.

### Task 1.2: Fix the two known violations at the right layer

- [ ] **Step 1: SettingsView.tsx Date.now() fix**

The current code generates a context ID inline:

```tsx
return `ctx_${kind}_${name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${Date.now().toString(36)}`;
```

Fix shape: the context ID is part of a state mutation that crosses to the controller. Pass `generateContextId` (or pre-generated `contextId`) as a prop / from the parent hook. The View should not own ID generation.

Suggested helper location: a new pure helper `generateProductContextId` in `src/state/product-context.ts` (next to the related storage key), called from the hook layer.

- [ ] **Step 2: CompareView.tsx performance.now() fix**

The current code times a UI operation:

```tsx
const now = typeof performance !== "undefined" ? performance.now() : Date.now();
```

Fix shape: timing crossings (e.g., "user clicked compare at time T") belong in the controller / VM, not the View. Either:
- Pass a `now: () => number` prop from the hook (cleanest; testable).
- Or pre-compute the timestamp where the click handler is initialized.

Do not delete the timing — it's used for measurement. Just move ownership.

- [ ] **Step 3: Run the scanner again — expect 0 findings**

```bash
node scripts/check-view-boundary.mjs
```

### Task 1.3: Wire CI

- [ ] **Step 1: package.json**

Add:

```json
"boundary:guard:view": "node scripts/check-view-boundary.mjs"
```

- [ ] **Step 2: CI config**

Add `npm run boundary:guard:view` to the verify step alongside `npm run storage:seam-guard`.

### Task 1.4: Verify and commit PR 1

- [ ] Run:

```bash
npm run typecheck
npm run storage:seam-guard -- --list
npm run boundary:guard:view
npx tsx --test 'tests/**/*.test.ts' 'tests/**/*.test.tsx'
npm run build
git diff --check
```

Expected:
- typecheck passes;
- both guards report 0 allowlisted bypasses / 0 unauthorized findings;
- full suite passes;
- build mirrors to **worktree** `output/chrome-mv3` (not Desktop);
- diff check passes.

- [ ] Commit:

```bash
git commit -m "refactor: lock view boundary at zero violations"
```

---

## PR 2: ViewModel Wall Guard

**Intent:** Ship `scripts/check-viewmodel-boundary.mjs`, verify zero violations against the existing pure VMs, wire it into `npm run boundary:guard`.

**Files:**
- New: `scripts/check-viewmodel-boundary.mjs`
- Modify: `package.json` (add `boundary:guard:vm` and `boundary:guard` aggregate script)
- Modify: CI config (add `npm run boundary:guard:vm` or the aggregate)
- New: `tests/check-viewmodel-boundary.test.ts`
- (Likely no source changes; if a violation is found, fix at the VM — accept pre-computed input from the controller.)

### Task 2.1: Write the scanner

- [ ] **Step 1: Adapt PR 1's scanner**

```js
const VM_FORBIDDEN_PATTERNS = [
  { name: "chrome.* namespace", re: /\bchrome\./, op: "browser-api" },
  { name: "fetch()", re: /\bfetch\s*\(/, op: "network" },
  { name: "document.*", re: /\bdocument\./, op: "dom" },
  { name: "window.*", re: /\bwindow\./, op: "dom" },
  { name: "File constructor", re: /\bnew\s+File\s*\(/, op: "browser-api" },
  { name: "Blob constructor", re: /\bnew\s+Blob\s*\(/, op: "browser-api" },
  { name: "FormData constructor", re: /\bnew\s+FormData\s*\(/, op: "browser-api" },
  { name: "React import", re: /from\s+["']react(?:-dom)?["']/, op: "react" }
];
```

Scan `src/viewmodel/**/*.ts` — VMs are `.ts`, not `.tsx`; if any `.tsx` shows up in `src/viewmodel/`, that's already a violation (VMs ⊅ JSX).

- [ ] **Step 2: Run** — confirm 0 findings on current main (expected, given 0.2 VM boundary work).

If the scan does find violations, the fix is to move the call to the controller / hook and pass the result into the VM as input.

### Task 2.2: Aggregate `npm run boundary:guard` + test

- [ ] **Step 1: package.json**

```json
"boundary:guard:vm": "node scripts/check-viewmodel-boundary.mjs",
"boundary:guard": "npm run boundary:guard:view && npm run boundary:guard:vm"
```

- [ ] **Step 2: CI config**

Replace the standalone `boundary:guard:view` step with `npm run boundary:guard` so both walls are checked atomically.

- [ ] **Step 3: VM smoke test**

Add `tests/check-viewmodel-boundary.test.ts`, same shape as PR 1.

### Task 2.3: Verify and commit PR 2

- [ ] Run the full verification matrix (same as PR 1) plus `npm run boundary:guard`.

- [ ] Commit:

```bash
git commit -m "refactor: lock viewmodel boundary at zero violations"
```

---

## PR 3: Flip `BOUNDARY` to 🟩 Only After Both Guards Are Locked

**Intent:** Update arch map + memory docs to reflect 🟩 status with the verbatim wording. No source changes; pure docs flip.

**Files:**
- Modify: `docs/architecture/dlens-current-architecture-map.md`
- Modify: `docs/memory/current-state.md`
- Modify: `docs/memory/latest-shared-context.md`
- Possibly: `AGENTS.md`, `README.md` (status mentions)

### Task 3.1: Architecture map flip

- [ ] **Step 1: Update node 53 (BOUNDARY)**

Change label from:

```
BOUNDARY["🟡 Boundary tests<br/>some exists, not complete"]
```

to:

```
BOUNDARY["🟩 View / VM wall guards<br/>CI guard + zero violations"]
```

- [ ] **Step 2: Update edges 95-96**

```
BOUNDARY -.->|"protect View / VM walls<br/>🟡 partial"| VIEW
BOUNDARY -.->|"protect pure ViewModels<br/>🟡 partial"| VM
```

becomes:

```
BOUNDARY -.->|"View wall guard<br/>🟩 zero violations"| VIEW
BOUNDARY -.->|"VM wall guard<br/>🟩 zero violations"| VM
```

- [ ] **Step 3: Mermaid class move**

Move `BOUNDARY` from `partial` class to `locked` class (line 108).

- [ ] **Step 4: Update A1 paragraph**

Append:

> PR #46 adds `scripts/check-view-boundary.mjs`; PR #47 adds `scripts/check-viewmodel-boundary.mjs` and the aggregate `npm run boundary:guard`; CI runs both at zero allowlisted bypasses. `BOUNDARY` is 🟩.

- [ ] **Step 5: Update summary line (top of arch map)**

Add to the status sentence:

> `BOUNDARY` is 🟩 because View modules cannot import `sendExtensionMessage` / call `Date.now()` / `Math.random()` / `performance.now()` / `chrome.storage.local.*` / `chrome.runtime.sendMessage`, ViewModels cannot import `chrome.*` / `fetch` / DOM / `File` / `Blob` / `FormData` / React, and `npm run boundary:guard` enforces both walls in CI at zero allowlisted violations.

### Task 3.2: Memory docs (verbatim wording)

Add the same verbatim wording to `docs/memory/current-state.md` and `docs/memory/latest-shared-context.md`:

> `BOUNDARY` is 🟩 because View modules cannot import `sendExtensionMessage` / call `Date.now()` / `Math.random()` / `performance.now()` / `chrome.storage.local.*` / `chrome.runtime.sendMessage`, ViewModels cannot import `chrome.*` / `fetch` / DOM / `File` / `Blob` / `FormData` / React, and `npm run boundary:guard` enforces both walls in CI at zero allowlisted violations.

### Task 3.3: Final verification matrix

```bash
npm run typecheck
npm run storage:seam-guard -- --list
npm run boundary:guard
npx tsx --test 'tests/**/*.test.ts' 'tests/**/*.test.tsx'
npm run build
git diff --check
```

Expected:
- all guards 0 / pass;
- full suite passes;
- build mirrors to worktree;
- diff check passes.

### Task 3.4: Commit PR 3

```bash
git commit -m "refactor: lock view and viewmodel boundary contracts"
```

---

## Verification Matrix Before Merging Any Slice

Every slice must run:

```bash
npm run typecheck
npm run storage:seam-guard -- --list
npm run boundary:guard           # available from PR 2 onward; PR 1 uses boundary:guard:view
npx tsx --test <slice-focused-tests>
npx tsx --test 'tests/**/*.test.ts' 'tests/**/*.test.tsx'
npm run build
git diff --check
```

For PR 3, additionally confirm `docs/architecture/dlens-current-architecture-map.md` does not claim 🟩 until both wall guards are wired into CI and reporting 0 findings / 0 allowlisted bypasses.

## Out Of Scope

- No background module split.
- No `useInPageCollectorAppState.ts` decomposition.
- No new Product / Topic / PR features.
- No visual UI redesign.
- No storage schema migration.
- No Chrome QA automation or temporary profiles.
- No direct `chrome-extension://.../sidepanel.html` QA.
- No backend crawler / read-model changes.
- No weakening of `SEAM_GUARD` / `RECONCILE` / `INVALIDATE` (all must stay 🟩 with verbatim wording intact).
- No removal of the 5 existing boundary tests; wall guards complement, not replace.
- No `TODO(boundary-bypass)` allowlisting at PR 3 merge — the 🟩 flip requires zero allowlisted.

## Permanent exceptions (empty by default)

If any violation cannot be cleanly moved out of the View / VM during PR 1 / PR 2, document it here with file + line + reason + planned removal:

| File | Line | Op | Reason | Planned removal |
|---|---|---|---|---|

(Empty at plan-write time. If this table grows, the 🟩 flip in PR 3 is blocked until each entry is resolved or formally accepted as a permanent exception via separate review.)

---

## After This Plan

With `BOUNDARY` 🟩, the remaining engineering levers from the arch map are:

- **`MIGRATE` 🔴**: storage `schemaVersion` + migration registry + legacy fixture tests. The only 🔴 left.
- **`SEAM_PARTIAL` 🟡**: domain seams (session / signal / PR) need full ownership, not just raw-write protection.
- **`CS` / `API` / `CRAWLER` / `JOBS` 🟡**: live runtime / backend / DOM-sensitive edges. These require Chrome QA + backend job orchestration tests, not pure unit-test work.

Codex's recommended order after `BOUNDARY`: **MIGRATE next** (only 🔴), then **SEAM_PARTIAL** (structural debt now smaller), then split work (`background.ts`, `useInPageCollectorAppState.ts`) once the contract walls are all locked.
