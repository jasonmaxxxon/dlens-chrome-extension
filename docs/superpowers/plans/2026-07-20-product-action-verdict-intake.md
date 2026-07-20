# Product Action Verdict Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the 0.3.52 four-color verdict navigation around the current single Action stage, reduce Saved Signals to a processing intake, and move action-brief export to Action.

**Architecture:** Keep the existing Product routes and data contracts. Refactor only the Product presentation owner: Saved renders a compact lifecycle ledger and collapsed management rows; Action groups completed analyses by verdict, renders one semantic stage card, owns brief selection, and owns the single export surface.

**Tech Stack:** React 19, TypeScript, inline token-based styles, shared motion registry, Node test runner through `tsx`, WXT MV3 build.

## Global Constraints

- Preserve the current single large Action stage card and real evidence/source-truth contracts.
- Restore only the 0.3.52 verdict selector grammar, never the old multi-card wall.
- Signals remains Product home and owns analysis/retry/delete; Action owns reading/review/export.
- Use token values from `src/ui/tokens.ts`; add no hard-coded UI colors.
- Keep hover visual-only, click state-changing, and reduced-motion safe.
- Preserve unrelated untracked mockups, screenshots, archives, and `.playwright-cli` artifacts.

---

### Task 1: Compact Saved Signals into an analysis intake

**Files:**
- Modify: `src/ui/ProductSignalViews.tsx`
- Test: `tests/views.test.tsx`

**Interfaces:**
- Consumes: `ProductSignalViewModel[]`, `ProcessingErrorAggregate`, `onAnalyze`, and optional `onRemoveSignal`.
- Produces: `SavedSignalsBoard` with `data-product-saved-pipeline`, `data-product-saved-management`, and compact rows; no reading or export surface.

- [ ] **Step 1: Replace Saved reading-wall expectations with failing compact-intake tests**

```ts
assert.match(html, /data-product-saved-pipeline="true"/);
assert.match(html, /已收集[^]*可分析[^]*處理中[^]*已完成/);
assert.match(html, /data-product-saved-management="collapsed"/);
assert.doesNotMatch(html, /data-product-saved-filter-tabs|data-product-saved-inline-reading/);
assert.doesNotMatch(html, /data-saved-signals-batch-export|行動簡報匯出/);
assert.doesNotMatch(html, /type="checkbox"/);
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npx tsx --test --test-name-pattern='SavedSignalsBoard|saved signals|distinct information shape' tests/views.test.tsx`

Expected: FAIL because the old filter tabs, inline reading, selection, and Saved-owned export still render.

- [ ] **Step 3: Implement the compact lifecycle ledger and collapsed management rows**

```tsx
const readyCount = signals.filter((signal) => !signal.analysis && signal.readiness.status === "ready").length;
const processingCount = signals.filter((signal) => signal.analysis?.status === "pending" || signal.analysis?.status === "analyzing" || (!signal.analysis && signal.readiness.status === "crawling")).length;
const completedCount = signals.filter((signal) => signal.analysis?.status === "complete").length;

<section data-product-saved-pipeline="true" aria-label="訊號分析流程">
  {[
    ["已收集", signals.length],
    ["可分析", readyCount],
    ["處理中", processingCount],
    ["已完成", completedCount]
  ].map(([label, value]) => <span key={label}>{label} {value}</span>)}
</section>
<details data-product-saved-management="collapsed">
  <summary>管理收件匣 · {signals.length} 則</summary>
  {signals.map((signal) => (
    <div key={signal.signalId} data-saved-signal-row="management">
      <span>{excerpt(signal.sourcePreview.displayText || signal.title || signal.signalId, 72)}</span>
      <Stamp tone={readinessLabel(signal.readiness).tone}>{signal.analysis?.status === "complete" ? "已完成" : readinessLabel(signal.readiness).label}</Stamp>
      {onRemoveSignal ? <button type="button" aria-label="移除此訊號" onClick={() => onRemoveSignal(signal.signalId)}>×</button> : null}
    </div>
  ))}
</details>
```

Remove `SavedSignalInlineReading`, saved filter state/tabs, Saved checkboxes, and the Saved render of the export component.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `npx tsx --test --test-name-pattern='SavedSignalsBoard|saved signals|distinct information shape' tests/views.test.tsx`

Expected: PASS.

### Task 2: Restore four-color verdict navigation around the single Action stage

**Files:**
- Modify: `src/ui/ProductSignalViews.tsx`
- Modify: `src/ui/motion.ts`
- Test: `tests/views.test.tsx`
- Test: `tests/motion-registry.test.ts`

**Interfaces:**
- Produces: `ActionVerdictFilter`, `verdictFilterKeyForAnalysis`, `VerdictFilterTiles`, per-bucket selection state, and text paging.
- Preserves: `ProductSourceTruthStrip`, exact citations, and `ProductActionReadingOperations` for actionable buckets.

- [ ] **Step 1: Write failing selector, semantic-card, paging, and motion tests**

```ts
assert.match(html, /data-verdict-filter-tiles="true"/);
assert.match(html, /data-action-verdict-filter="try"[^]*值得嘗試/);
assert.match(html, /data-action-verdict-filter="watch"[^]*保留觀察/);
assert.match(html, /data-product-action-previous="true"[^]*上一則/);
assert.match(html, /data-product-action-next="true"[^]*下一則/);
assert.doesNotMatch(html, /data-product-action-dot|data-product-action-exclusions|data-product-action-insufficient/);
assert.match(DLENS_MOTION_CSS, /data-verdict-filter-plate/);
assert.match(DLENS_MOTION_CSS, /data-verdict-tile-count/);
```

Add a DOM interaction test that clicks `watch`, advances within that bucket, switches to `try`, then returns to `watch` and observes the remembered signal.

- [ ] **Step 2: Run focused Action and motion tests and confirm RED**

Run: `npx tsx --test --test-name-pattern='Product Action|verdict|motion registry' tests/views.test.tsx tests/motion-registry.test.ts`

Expected: FAIL because current Action has arrow/dot candidate paging and explicitly bans verdict tiles.

- [ ] **Step 3: Implement grouping and the restored tile selector**

```ts
type ActionVerdictFilter = "try" | "park" | "insufficient" | "watch";

function verdictFilterKeyForAnalysis(analysis: ProductSignalAnalysis): ActionVerdictFilter {
  if (analysis.signalType === "noise" || analysis.verdict === "park") return "park";
  if (analysis.verdict === "insufficient_data") return "insufficient";
  return analysis.verdict;
}
```

Render four token-colored tab buttons and one shared active plate. Default to `try`, then `watch`, then `park`, then `insufficient`. Disable empty buckets and support Left/Right/Home/End across enabled buckets.

- [ ] **Step 4: Replace dot paging with per-bucket text paging and semantic content**

```tsx
<nav data-product-action-pager="text" aria-label={`${activeMeta.label}分頁`}>
  <SecondaryButton dataAttrs={{ "data-product-action-previous": "true" }} disabled={safeIndex === 0}>← 上一則</SecondaryButton>
  <span role="status" aria-live="polite">{safeIndex + 1} / {activeItems.length}</span>
  <SecondaryButton dataAttrs={{ "data-product-action-next": "true" }} disabled={safeIndex === activeItems.length - 1}>下一則 →</SecondaryButton>
</nav>
```

Render the three-beat sequence and reading operations only for `try/watch`. Render the verdict reason and evidence for `park/insufficient`. Remove duplicate exclusion disclosures and the Action delete control.

- [ ] **Step 5: Restore token-owned tile motion and responsive 2×2 layout**

Add plate transform/background transitions, count hover/active scale, and reduced-motion overrides to `DLENS_MOTION_CSS`. Add a Product-local responsive style that changes `.dlens-verdict-tiles` from four columns to two below `tokens.layout.atlasNarrowBreakpointPx`.

- [ ] **Step 6: Run focused Action and motion tests and confirm GREEN**

Run: `npx tsx --test --test-name-pattern='Product Action|verdict|motion registry' tests/views.test.tsx tests/motion-registry.test.ts`

Expected: PASS.

### Task 3: Move action-brief and packet export ownership to Action

**Files:**
- Modify: `src/ui/ProductSignalViews.tsx`
- Modify: `src/viewmodel/product-signal.ts`
- Test: `tests/views.test.tsx`
- Test: `tests/product-signal-viewmodel.test.ts`

**Interfaces:**
- Produces: `ProductActionBriefExport`, Action-local `selectedSignalIds`, and page-aware `buildWorkspaceActions(kind, sessionId, hasActionable)`.
- Preserves: `buildAgentBrief` and `SignalPacketHtmlExportSection` data/background contracts.

- [ ] **Step 1: Write failing ownership and eligibility tests**

```ts
assert.doesNotMatch(savedHtml, /data-product-action-brief-export|data-signal-packet-html-export/);
assert.match(actionHtml, /data-product-action-brief-export="true"/);
assert.equal(countOccurrences(actionHtml, 'data-signal-packet-html-export="true"'), 1);
assert.doesNotMatch(actionHtml, /data-batch-export-selection-list|data-signal-reading-disclosure/);
```

Assert that `exportSignalPackets` workspace actions exist for `actionable-filter` but not `saved-signals`, and that park/insufficient analyses cannot produce brief-selection toggles.

- [ ] **Step 2: Run focused export/VM tests and confirm RED**

Run: `npx tsx --test --test-name-pattern='export|brief|workspace actions' tests/views.test.tsx tests/product-signal-viewmodel.test.ts`

Expected: FAIL because Saved owns the batch export and workspace export commands are page-agnostic.

- [ ] **Step 3: Implement Action-local selection and the collapsed export shelf**

```tsx
const eligibleBriefIds = scopedAnalyses
  .filter((analysis) => analysis.status === "complete" && analysis.signalType !== "noise" && (analysis.verdict === "try" || analysis.verdict === "watch"))
  .map((analysis) => analysis.signalId);

<details data-product-action-brief-export="true">
  <summary>行動簡報匯出 · {selectedSignalIds.length} 已選</summary>
  <ProductActionBriefExport selectedIds={selectedSignalIds} />
</details>
```

Prune selection in an effect keyed by session and eligible IDs. Remove selection rows and reading disclosure from export. Keep one explicitly labelled whole-folder packet section.

- [ ] **Step 4: Make export command ownership page-aware**

```ts
function buildWorkspaceActions(kind: ProductSignalWorkspaceViewModel["kind"], sessionId: string | null, hasActionable: boolean): ProductSignalCommand[] {
  if (!sessionId) return [];
  const actions: ProductSignalCommand[] = [{ kind: "analyzeInbox", target: { sessionId } }];
  if (kind === "actionable-filter") {
    actions.push(
      { kind: "exportSignalPackets", target: { sessionId }, format: "html" },
      { kind: "exportSignalPackets", target: { sessionId }, format: "jsonl" }
    );
  }
  if (hasActionable) actions.push({ kind: "openActionable", target: { sessionId } });
  return actions;
}
```

- [ ] **Step 5: Run focused export/VM tests and confirm GREEN**

Run: `npx tsx --test --test-name-pattern='export|brief|workspace actions' tests/views.test.tsx tests/product-signal-viewmodel.test.ts`

Expected: PASS.

### Task 4: Align static audits, version, and MV3 artifact

**Files:**
- Modify: `scripts/qa-code-path-audit.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/ui/version.ts`
- Modify: `wxt.config.ts`
- Modify: `README.md`
- Modify: `docs/memory/latest-shared-context.md`
- Test: `tests/manifest-config.test.ts`

**Interfaces:**
- Produces: B-07 verdict-stage audit, B-08 Action-only export audit, version `0.3.54`, and refreshed `output/chrome-mv3`.

- [ ] **Step 1: Write/adjust failing audit and release expectations**

Update B-07 to require verdict tiles, a single stage, semantic non-actionable content, and no card wall/dots. Update B-08 to require reading/review plus exactly one Action-owned brief/packet export and no Saved export. Change manifest test expectations to `0.3.54`.

- [ ] **Step 2: Run audit and manifest tests and confirm RED**

Run: `node scripts/qa-code-path-audit.mjs && npx tsx --test tests/manifest-config.test.ts`

Expected: FAIL until audit implementation and version values are aligned.

- [ ] **Step 3: Update audit rules, release metadata, and current-state copy**

Set package, lockfile root/package, UI version, and WXT manifest version to `0.3.54`. Update README and latest shared context to describe the compact intake, four-color stage selector, Action-owned export, and honest live-QA boundary.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npm run typecheck
npx tsx --test tests/views.test.tsx tests/product-signal-viewmodel.test.ts tests/product-routing.test.ts tests/page-registry.test.ts tests/use-in-page-collector-app-state.test.ts tests/inpage-collector-state-split.test.ts tests/motion-registry.test.ts tests/manifest-config.test.ts
node scripts/qa-code-path-audit.mjs
npm run boundary:guard
npm run storage:seam-guard
npm run storage:migrate-fixtures
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Run full tests and build the MV3 artifact**

Run:

```bash
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
npm run bundle:guard
```

Expected: zero test failures; `output/chrome-mv3/manifest.json` reports `0.3.54`; bundle guard passes.

- [ ] **Step 6: Commit verified implementation**

```bash
git add docs/superpowers/specs/2026-07-20-product-action-verdict-intake-design.md docs/superpowers/plans/2026-07-20-product-action-verdict-intake.md src/ui/ProductSignalViews.tsx src/ui/motion.ts src/viewmodel/product-signal.ts tests/views.test.tsx tests/motion-registry.test.ts tests/product-signal-viewmodel.test.ts scripts/qa-code-path-audit.mjs package.json package-lock.json src/ui/version.ts wxt.config.ts README.md docs/memory/latest-shared-context.md tests/manifest-config.test.ts
git commit -m "feature: refine product intake and action stage"
```
