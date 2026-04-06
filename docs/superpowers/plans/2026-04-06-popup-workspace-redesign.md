# DLens Popup Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the popup into a Compare-first workspace shell with smart initial entry, stable user mode control, a calmer shared visual language, and page surfaces that align to `Compare = reading`, `Library = preparation`, `Collect = capture`, and `Settings = drawer-like utility`.

**Architecture:** Keep the current MV3 data flow and background ownership intact, but move popup presentation onto a stricter UI grammar. The work should start at state and shell boundaries, then flow through shared tokens/components, then through Compare, Library, Collect, Settings, and Technique surfaces in that order so later tasks do not re-break earlier layout assumptions.

**Tech Stack:** React, TypeScript, WXT/MV3 extension runtime, `node:test`, `tsx`, shared popup styling via `src/ui/tokens.ts` and inline style helpers in `src/ui/components.tsx`.

---

## File Structure Map

### Core files to modify

- `src/state/processing-state.ts`
  Owns readiness classification and should gain the popup smart-entry helper plus any compare-availability helper needed by shell-level mode selection.
- `src/ui/InPageCollectorApp.tsx`
  Owns popup shell orchestration, current local page state, and mode transitions. This is where smart entry must become initial-only and where the new shell hierarchy will be assembled.
- `src/ui/tokens.ts`
  Source of truth for popup tokens. Rewrite semantics, not theme count.
- `src/ui/components.tsx`
  Shared surface primitives, mode-switch controls, utility-edge atoms, chip styling, and any shell-level reusable rows.
- `src/ui/ProcessingStrip.tsx`
  Must become a small context strip that stays separate from the primary mode rail.
- `src/ui/CompareView.tsx`
  Must implement the approved hero/dock split, Compare unavailable bridge, and section-rail gating without changing compare semantics.
- `src/ui/LibraryView.tsx`
  Must shift from folder-first/list-first presentation toward preparation-desk logic with clear compare affordance.
- `src/ui/CollectView.tsx`
  Must become a simpler single-card capture surface with low-friction exit.
- `src/ui/SettingsView.tsx`
  Must adopt drawer-like visual grammar while remaining page-backed in this pass.
- `src/ui/TechniqueView.tsx`
  Must align to the slower-reading notebook strip role and stop competing with the main compare reading center.

### Tests to modify or add

- `tests/processing-state.test.ts`
  Add smart-entry and compare-availability coverage.
- `tests/components.test.tsx`
  Add shared shell/control primitive assertions.
- `tests/processing-strip.test.tsx`
  Update strip expectations so it stays compact and context-only.
- `tests/compare-view.test.tsx`
  Cover hero/dock split, unavailable bridge visibility, and rail suspension when compare is unavailable.
- `tests/library-view.test.tsx`
  Cover preparation grouping, compare affordance, and casebook separation.
- `tests/views.test.tsx`
  Keep cross-view structural assertions for Collect, Library, and Settings.
- `tests/technique-view.test.tsx`
  Add slower-reading/notebook-strip structural assertions.

### Docs to update before closing the implementation

- `README.md`
- `AGENTS.md`

## Task 1: Lock Smart Entry And User Mode Control

**Files:**
- Modify: `src/state/processing-state.ts`
- Modify: `src/ui/InPageCollectorApp.tsx`
- Test: `tests/processing-state.test.ts`
- Test: `tests/controller.test.ts` or `tests/views.test.tsx` if shell behavior is easier to cover there

- [ ] **Step 1: Write failing tests for smart entry priority**

```ts
test("resolveInitialPopupMode prefers compare when two items are ready", () => {
  assert.equal(resolveInitialPopupMode(summary, "collect"), "compare");
});

test("resolveInitialPopupMode prefers library when items are analyzing", () => {
  assert.equal(resolveInitialPopupMode(summary, "collect"), "library");
});

test("resolveInitialPopupMode falls back to collect when nothing is ready or in progress", () => {
  assert.equal(resolveInitialPopupMode(summary, "library"), "collect");
});
```

- [ ] **Step 2: Run tests to verify the new helper is missing or failing**

Run: `npx tsx --test tests/processing-state.test.ts`

Expected: FAIL with missing helper or mismatched mode assertions.

- [ ] **Step 3: Add minimal state helpers in `src/state/processing-state.ts`**

```ts
export type WorkspaceMode = "compare" | "library" | "collect" | "settings";

export function hasNearReadyItems(summary: SessionProcessingSummary): boolean {
  return summary.analyzing > 0;
}

export function resolveInitialPopupMode(summary: SessionProcessingSummary): WorkspaceMode {
  if (summary.ready >= 2) return "compare";
  if (summary.analyzing > 0 || summary.crawling > 0 || summary.pending > 0) return "library";
  return "collect";
}
```

- [ ] **Step 4: Write a failing shell test that mode auto-selection runs only on popup-open initialization**

```ts
test("local mode stays user-controlled after manual switch", () => {
  const initial = resolveInitialPopupMode(summaryWithReadyPair);
  assert.equal(initial, "compare");
  const manuallySwitched = "collect";
  assert.equal(preserveUserMode(manuallySwitched, summaryWithoutPair), "collect");
});
```

- [ ] **Step 5: Run the targeted shell test and confirm it fails before wiring**

Run: `npx tsx --test tests/views.test.tsx`

Expected: FAIL with missing preserve-user-control behavior or old page-sync assertions.

- [ ] **Step 6: Update `src/ui/InPageCollectorApp.tsx` to use initial-only smart entry**

```tsx
const initialModeAppliedRef = useRef(false);

useEffect(() => {
  if (!snapshot?.tab.popupOpen || initialModeAppliedRef.current) return;
  setLocalPage(resolveInitialPopupMode(processingSummary));
  initialModeAppliedRef.current = true;
}, [snapshot?.tab.popupOpen, processingSummary]);
```

- [ ] **Step 7: Ensure snapshot-driven page sync no longer steals control after manual switching**

```tsx
useEffect(() => {
  if (!snapshot?.tab.popupOpen) {
    initialModeAppliedRef.current = false;
  }
}, [snapshot?.tab.popupOpen]);
```

- [ ] **Step 8: Re-run the targeted state and shell tests**

Run: `npx tsx --test tests/processing-state.test.ts tests/views.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/state/processing-state.ts src/ui/InPageCollectorApp.tsx tests/processing-state.test.ts tests/views.test.tsx
git commit -m "feat: lock popup smart entry and mode control"
```

## Task 2: Rebuild The Shared Shell Language

**Files:**
- Modify: `src/ui/tokens.ts`
- Modify: `src/ui/components.tsx`
- Modify: `src/ui/InPageCollectorApp.tsx`
- Test: `tests/components.test.tsx`
- Test: `tests/views.test.tsx`

- [ ] **Step 1: Write failing tests for shell primitives and mode rail separation**

```ts
test("mode rail renders only compare library and collect", () => {
  assert.match(html, /data-mode-rail="primary"/);
  assert.doesNotMatch(html, /Settings<\/button>/);
});

test("processing strip is rendered outside the primary mode rail", () => {
  assert.match(html, /data-shell-context-strip="processing"/);
});
```

- [ ] **Step 2: Run the view/component tests and confirm current shell markup fails**

Run: `npx tsx --test tests/components.test.tsx tests/views.test.tsx`

Expected: FAIL because current shell still behaves like a traditional page/tab layout.

- [ ] **Step 3: Rewrite token semantics in `src/ui/tokens.ts` without introducing a second theme**

```ts
export const tokens = {
  color: {
    canvas: "#ffffff",
    surface: "#fcfcfd",
    elevated: "#ffffff",
    line: "rgba(15,23,42,0.10)",
    // keep compare accents but keep them local
  },
  shadow: {
    shell: "0 12px 36px rgba(15,23,42,0.10)",
    focus: "0 10px 24px rgba(15,23,42,0.08)",
  },
};
```

- [ ] **Step 4: Add shared shell primitives in `src/ui/components.tsx`**

```tsx
export function ModeRail(...) { ... }
export function ModeRailButton(...) { ... }
export function UtilityEdge(...) { ... }
export function WorkspaceSurface(...) { ... }
```

- [ ] **Step 5: Rebuild the top-level popup shell in `src/ui/InPageCollectorApp.tsx`**

```tsx
<div data-workspace-shell="compare-first">
  <header data-shell-header="workspace">
    <ModeRail ... />
    <UtilityEdge ... />
  </header>
  <ProcessingStrip ... />
  <main data-workspace-mode={page}>...</main>
</div>
```

- [ ] **Step 6: Re-run component and shell structure tests**

Run: `npx tsx --test tests/components.test.tsx tests/views.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/tokens.ts src/ui/components.tsx src/ui/InPageCollectorApp.tsx tests/components.test.tsx tests/views.test.tsx
git commit -m "feat: rebuild popup shell language"
```

## Task 3: Shrink The Processing Strip Into Pure Context

**Files:**
- Modify: `src/ui/ProcessingStrip.tsx`
- Modify: `src/state/processing-state.ts`
- Test: `tests/processing-strip.test.tsx`
- Test: `tests/processing-state.test.ts`

- [ ] **Step 1: Write failing tests for summary grain and non-dashboard behavior**

```ts
test("ProcessingStrip shows one phase label and compact ready count", () => {
  assert.match(html, /Ready to compare|Processing in progress|Waiting for analysis/);
  assert.match(html, /2\/5 ready/);
  assert.doesNotMatch(html, /crawling.*analyzing.*pending/s);
});
```

- [ ] **Step 2: Run strip tests to confirm current markup is too detailed or mismatched**

Run: `npx tsx --test tests/processing-strip.test.tsx`

Expected: FAIL if current strip still exposes too much breakdown or wrong shell placement assumptions.

- [ ] **Step 3: Tighten `getProcessingStripUiState` copy so it answers only “can the user move forward?”**

```ts
return {
  phaseLabel: "Waiting for analysis",
  progressMode: "analyzing",
  progressHint: "Library has the next best action while compare-ready analysis finishes.",
};
```

- [ ] **Step 4: Restyle `src/ui/ProcessingStrip.tsx` as a compact context row**

```tsx
<div data-shell-context-strip="processing">
  <span data-processing-dot />
  <span data-processing-phase>{uiState.phaseLabel}</span>
  <span data-processing-ready>{ready}/{total} ready</span>
</div>
```

- [ ] **Step 5: Re-run strip tests**

Run: `npx tsx --test tests/processing-strip.test.tsx tests/processing-state.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ProcessingStrip.tsx src/state/processing-state.ts tests/processing-strip.test.tsx tests/processing-state.test.ts
git commit -m "feat: simplify processing strip context"
```

## Task 4: Redesign Compare Around Hero, Bridge, And Dock

**Files:**
- Modify: `src/ui/CompareView.tsx`
- Modify: `src/ui/components.tsx` if Compare-specific shared primitives are needed
- Test: `tests/compare-view.test.tsx`

- [ ] **Step 1: Write failing Compare tests for the new first-screen contract**

```ts
test("CompareView keeps top evidence out of the hero and inside the selected dock", () => {
  assert.match(html, /data-compare-hero="summary"/);
  assert.match(html, /data-cluster-dock="selected"/);
});

test("CompareView suspends the section rail when fewer than two ready items exist", () => {
  assert.doesNotMatch(html, /data-compare-section-rail="sticky"/);
  assert.match(html, /Go to Library/);
});
```

- [ ] **Step 2: Run the Compare test file and confirm current markup fails**

Run: `npx tsx --test tests/compare-view.test.tsx`

Expected: FAIL with old rail or hero structure assertions.

- [ ] **Step 3: Refactor `src/ui/CompareView.tsx` to expose the approved hero/bridge states**

```tsx
if (readyItems.length < 2) {
  return <CompareUnavailableBridge actionLabel="Go to Library" />;
}

return (
  <>
    <CompareHero ... />
    <SectionRail ... />
    <SelectedClusterDock ... />
  </>
);
```

- [ ] **Step 4: Move “top evidence” rendering into the selected dock structure**

```tsx
<div data-cluster-dock="selected">
  <TopEvidenceBlock evidence={detail.evidence[0]} />
  <EvidenceList evidence={detail.evidence.slice(1)} />
</div>
```

- [ ] **Step 5: Keep the bridge in Compare mode only**

```tsx
<button type="button" onClick={onGoToLibrary}>Go to Library</button>
```

- [ ] **Step 6: Re-run Compare tests**

Run: `npx tsx --test tests/compare-view.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/CompareView.tsx tests/compare-view.test.tsx
git commit -m "feat: redesign compare hero and selected dock"
```

## Task 5: Turn Library Into A Preparation Desk

**Files:**
- Modify: `src/ui/LibraryView.tsx`
- Modify: `src/state/processing-state.ts` if card grouping helpers are warranted
- Test: `tests/library-view.test.tsx`
- Test: `tests/views.test.tsx`

- [ ] **Step 1: Write failing tests for preparation-first grouping**

```ts
test("LibraryView prioritizes compare-ready and analyzing items above pending inventory", () => {
  assert.match(html, /Ready to compare/);
  assert.match(html, /Analyzing now/);
  assert.doesNotMatch(html, /Saved posts \(.*\).*Ready to compare/s);
});

test("LibraryView exposes compare affordance in preparation cards", () => {
  assert.match(html, /Open in Compare|Use in Compare/);
});
```

- [ ] **Step 2: Run Library tests to verify current list-first output fails**

Run: `npx tsx --test tests/library-view.test.tsx tests/views.test.tsx`

Expected: FAIL because current surface is still post-list-first.

- [ ] **Step 3: Restructure `src/ui/LibraryView.tsx` around preparation zones**

```tsx
<section data-library-zone="ready">...</section>
<section data-library-zone="near-ready">...</section>
<section data-library-zone="in-progress">...</section>
<section data-library-zone="inventory">...</section>
```

- [ ] **Step 4: Keep folders as organizing aids, not the first IA**

```tsx
<div data-library-folder-context="secondary">{activeFolder.name}</div>
```

- [ ] **Step 5: Preserve Casebook as a second reading layer with notebook-strip tone**

```tsx
<div data-library-subpage="casebook">
  <CasebookReadingStrip readings={techniqueReadings} />
</div>
```

- [ ] **Step 6: Re-run Library tests**

Run: `npx tsx --test tests/library-view.test.tsx tests/views.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/LibraryView.tsx src/state/processing-state.ts tests/library-view.test.tsx tests/views.test.tsx
git commit -m "feat: turn library into a preparation desk"
```

## Task 6: Simplify Collect, Drawer-ize Settings, And Calm Technique

**Files:**
- Modify: `src/ui/CollectView.tsx`
- Modify: `src/ui/SettingsView.tsx`
- Modify: `src/ui/TechniqueView.tsx`
- Test: `tests/views.test.tsx`
- Test: `tests/technique-view.test.tsx`

- [ ] **Step 1: Write failing tests for the remaining surfaces**

```ts
test("CollectView stays a single-card capture surface", () => {
  assert.match(html, /data-collect-surface="capture-card"/);
});

test("SettingsView uses drawer-like structure without a page hero", () => {
  assert.match(html, /data-settings-surface="drawer"/);
  assert.doesNotMatch(html, /Welcome|Get started/);
});

test("TechniqueView reads as a slower notebook strip", () => {
  assert.match(html, /data-technique-surface="reading-strip"/);
});
```

- [ ] **Step 2: Run the relevant view tests and confirm failures**

Run: `npx tsx --test tests/views.test.tsx tests/technique-view.test.tsx`

Expected: FAIL with missing new structural data attributes.

- [ ] **Step 3: Simplify `src/ui/CollectView.tsx`**

```tsx
<section data-collect-surface="capture-card">
  <PreviewCard ... />
  <PrimaryButton ... />
</section>
```

- [ ] **Step 4: Restyle `src/ui/SettingsView.tsx` to drawer logic without changing container mechanics**

```tsx
<div data-settings-surface="drawer">
  <section data-settings-group="connection">...</section>
  <section data-settings-group="keys">...</section>
</div>
```

- [ ] **Step 5: Rework `src/ui/TechniqueView.tsx` into a calmer notebook strip**

```tsx
<div data-technique-surface="reading-strip">
  <div data-technique-carousel="notebook-strip">...</div>
</div>
```

- [ ] **Step 6: Re-run the remaining view tests**

Run: `npx tsx --test tests/views.test.tsx tests/technique-view.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/CollectView.tsx src/ui/SettingsView.tsx src/ui/TechniqueView.tsx tests/views.test.tsx tests/technique-view.test.tsx
git commit -m "feat: align collect settings and technique surfaces"
```

## Task 7: Update Docs And Run Full Verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-04-06-popup-workspace-redesign-design.md` only if implementation reality requires an explicit clarification

- [ ] **Step 1: Update `README.md` with the new popup workspace model**

```md
- popup is now a Compare-first workspace shell
- smart entry selects the initial mode only
- Library acts as the one-jump fallback from Compare
```

- [ ] **Step 2: Update `AGENTS.md` to reflect the shipped shell/navigation rules and surface roles**

```md
- primary mode rail is Compare / Library / Collect only
- processing strip is independent from mode switching
- Settings remains page-backed but drawer-like in this pass
```

- [ ] **Step 3: Run targeted tests for all touched surfaces**

Run: `npx tsx --test tests/processing-state.test.ts tests/components.test.tsx tests/processing-strip.test.tsx tests/compare-view.test.tsx tests/library-view.test.tsx tests/views.test.tsx tests/technique-view.test.tsx`

Expected: PASS.

- [ ] **Step 4: Run repo verification required by `AGENTS.md`**

Run: `npm run typecheck`
Expected: PASS.

Run: `npx tsx --test tests/*.test.ts tests/*.test.tsx`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md docs/superpowers/specs/2026-04-06-popup-workspace-redesign-design.md
git add src/ui src/state tests
git commit -m "feat: ship popup workspace redesign"
```

## Notes For Execution

- Do not invent new compare semantics, merge logic, pair scoring, or backend-derived states.
- Keep `near-ready` mapped only to `analyzing` unless the spec is explicitly revised first.
- Keep the Compare unavailable bridge as a Compare-mode state, not as the default shell landing.
- Keep `Settings` page-backed in this pass; only its visual and structural grammar should become drawer-like.
- Keep frequent commits. Do not batch all UI changes into one final commit.
