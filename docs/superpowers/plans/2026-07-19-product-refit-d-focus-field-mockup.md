# Product Refit D Focus Field Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and browser-verify one self-contained Variant D Product mockup that connects a signal-level relevance field to an in-place observation reading dock and a four-page Product Action stage.

**Architecture:** One HTML file owns an immutable seven-signal fixture plus minimal UI state: committed signal selection, transient hover, Action page index, and page direction. Markup is progressively enhanced so the index and first reading remain visible without JavaScript; JavaScript only synchronizes field/index selection, renders the reading dock and stage, and manages accessible paging.

**Tech Stack:** Semantic HTML, inline CSS, inline vanilla JavaScript, SVG controls, repository design tokens mapped into CSS variables, Playwright browser verification.

## Global Constraints

- Create only `docs/mockups/2026-07-19-product-refit-D-focus-field.html` plus owned verification screenshots.
- Do not modify MV3 production code, storage, manifests, versions, or A/B/C mockups.
- Use Product steel blue; do not use Atlas `color.signal` cyan.
- Six analyzed signals must classify as `technical 2 / learning 2 / noise 2`; r2 remains crawling.
- The Action stage contains four distinct watch records: r1, r3, r5, and r7; the exclusion strip contains only r4 and r6.
- Missing engagement, analysis prose, or evidence remains visibly unavailable; never invent replacement facts.
- Respect `prefers-reduced-motion`, keyboard operation, focus visibility, and touch selection.
- Treat standalone browser proof as mockup verification only, not MV3 or real Threads proof.

---

### Task 1: Build the Focus Field artifact

**Files:**
- Create: `docs/mockups/2026-07-19-product-refit-D-focus-field.html`
- Reference: `docs/superpowers/specs/2026-07-19-product-refit-d-focus-field-design.md`
- Reference: `docs/mockups/2026-07-19-product-refit-A-ledger.html`
- Reference: `docs/mockups/2026-07-19-product-refit-B-stage.html`
- Reference: `docs/mockups/2026-07-19-product-refit-C-field.html`
- Reference: `src/ui/tokens.ts`

**Interfaces:**
- Consumes: the seven signal records r1-r7 and approved design constraints.
- Produces: `window.__productRefitD` with read-only inspection methods `getSelectedSignalId(): string`, `getActionIndex(): number`, and `getState(): { selectedSignalId: string; hoveredSignalId: string | null; actionIndex: number; direction: -1 | 0 | 1 }` for browser QA.

- [ ] **Step 1: Establish the standalone seed and semantic sections**

Copy the web-prototype seed into the target file, then retain its normalized typography/reset principles while replacing the page body with exactly two targetable sections:

```html
<main id="content">
  <section data-od-id="saved-focus-field" data-product-frame="saved"></section>
  <section data-od-id="action-observation-stage" data-product-frame="action"></section>
</main>
```

Map the active colors to six root variables and derive all other values from them:

```css
:root {
  --bg: #eef2ef;
  --surface: #ffffff;
  --ink: #1b1a17;
  --muted: #6c695e;
  --line: rgba(27, 26, 23, 0.12);
  --accent: #234f7a;
}
```

- [ ] **Step 2: Add the canonical immutable fixture**

Define exactly seven records and derive counts instead of hard-coding contradictory summaries:

```js
const SIGNALS = Object.freeze([
  { id: "r1", title: "介面微互動的節制應用原則", type: "learning", relevance: 2, engagement: 410, verdict: "watch", status: "analyzed" },
  { id: "r2", title: "vibe coding 我开发了一个看得见 Wi-Fi 信号强…", type: null, relevance: null, engagement: null, verdict: null, status: "crawling" },
  { id: "r3", title: "AI 驅動的快速原型開發流程", type: "learning", relevance: 2, engagement: 78, verdict: "watch", status: "analyzed" },
  { id: "r4", title: "AI 程式碼除錯的信任門檻", type: "noise", relevance: 1, engagement: 92, verdict: "park", status: "analyzed" },
  { id: "r5", title: "透過嚴格 JSON 協定降低模型依賴", type: "technical", relevance: 3, engagement: 49, verdict: "watch", status: "analyzed" },
  { id: "r6", title: "無直接產品參考價值", type: "noise", relevance: 1, engagement: null, verdict: "park", status: "analyzed" },
  { id: "r7", title: "數據呈現的環境變數過濾", type: "technical", relevance: 2, engagement: null, verdict: "watch", status: "analyzed" }
]);
const analyzed = SIGNALS.filter((signal) => signal.status === "analyzed");
const actionSignals = SIGNALS.filter((signal) => signal.verdict === "watch");
const excludedSignals = SIGNALS.filter((signal) => signal.verdict === "park");
```

Extend only r1, r3, r5, and r7 with fields whose prose is available from existing mockups. Use `null` for unavailable summary/reason/takeaway/quote/evidence fields, and render explicit unavailable copy.

- [ ] **Step 3: Build the Saved Signals composite hero**

Render the compact `6/7`, `6/6`, and `1` ledger; six focusable signal controls; an `互動未讀` shelf for r6/r7; a selected observation dock; and all seven index rows.

Required stable markers:

```html
data-focus-field="true"
data-signal-bubble="r1"
data-reading-dock="true"
data-reading-signal="r1"
data-signal-index-row="r1"
data-signal-status="crawling"
```

Use semantic `<button>` elements inside SVG `foreignObject` or an HTML overlay aligned to the SVG. Do not leave SVG `<g>` elements mouse-only.

- [ ] **Step 4: Implement bidirectional hover and selection**

Use one state object and centralized render functions:

```js
const state = {
  selectedSignalId: "r1",
  hoveredSignalId: null,
  actionIndex: 0,
  direction: 0
};

function selectSignal(id) {
  const signal = SIGNALS.find((item) => item.id === id);
  if (!signal) return;
  state.selectedSignalId = id;
  renderSelection();
  renderReadingDock(signal);
}

function setHoveredSignal(id) {
  state.hoveredSignalId = id;
  renderHoverState();
}
```

Bubble and row hover call `setHoveredSignal(id)` without changing selection. Bubble/row click calls `selectSignal(id)`. Selecting r2 renders the crawling reading dock and clears committed bubble styling without assigning a fake field position.

- [ ] **Step 5: Build the four-record Action stage and pager**

Render only `actionSignals[state.actionIndex]` in the stage. Use one template so every page keeps geometry while unavailable fields remain explicit.

```js
function goToActionPage(nextIndex) {
  const bounded = Math.max(0, Math.min(actionSignals.length - 1, nextIndex));
  state.direction = Math.sign(bounded - state.actionIndex);
  state.actionIndex = bounded;
  renderActionStage(actionSignals[bounded]);
  renderPager();
}
```

Wire previous, next, four dot buttons, `ArrowLeft`, `ArrowRight`, `Home`, and `End`. Expose page title and `N / 4` through an `aria-live="polite"` element. Evidence buttons render only when their referenced quote/evidence line exists.

- [ ] **Step 6: Add responsive, reduced-motion, and focus behavior**

At widths below 720px, stack the field and reading dock, allow index metadata to wrap, and turn the three Action beats into a vertical sequence. Add:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

:focus-visible {
  outline: 3px solid rgba(35, 79, 122, 0.34);
  outline-offset: 3px;
}
```

- [ ] **Step 7: Run structural checks**

Run:

```bash
git diff --check -- docs/mockups/2026-07-19-product-refit-D-focus-field.html
rg -n 'data-focus-field|data-reading-dock|data-action-stage|data-action-page|aria-live|prefers-reduced-motion|window.__productRefitD' docs/mockups/2026-07-19-product-refit-D-focus-field.html
```

Expected: no whitespace errors; every marker appears in the artifact.

- [ ] **Step 8: Commit the artifact**

```bash
git add docs/mockups/2026-07-19-product-refit-D-focus-field.html
git commit -m "feature: add product focus field mockup"
```

### Task 2: Browser interaction and visual QA

**Files:**
- Verify: `docs/mockups/2026-07-19-product-refit-D-focus-field.html`
- Create: `output/playwright/product-refit-D-saved-default.png`
- Create: `output/playwright/product-refit-D-saved-hover.png`
- Create: `output/playwright/product-refit-D-saved-r5.png`
- Create: `output/playwright/product-refit-D-action-page1.png`
- Create: `output/playwright/product-refit-D-action-page4.png`
- Create: `output/playwright/product-refit-D-exclusion-open.png`
- Create: `output/playwright/product-refit-D-narrow.png`

**Interfaces:**
- Consumes: the mockup and `window.__productRefitD` inspection API.
- Produces: screenshot evidence and browser assertions for the approved interaction contract.

- [ ] **Step 1: Open the local mockup in Playwright**

Open the absolute `file:///Users/tung/developer/dlens-product-latest/docs/mockups/2026-07-19-product-refit-D-focus-field.html` URL at a 760px-wide desktop viewport. Capture console errors and fail the QA if any uncaught error appears.

- [ ] **Step 2: Verify Saved Signals default and hover behavior**

Assert `getSelectedSignalId()` returns `r1`. Hover r5's bubble and verify r5's bubble and index row have hover markers while the reading dock remains `data-reading-signal="r1"`. Capture default and hover screenshots.

- [ ] **Step 3: Verify reciprocal selection and crawling state**

Click r5's index row and assert the API returns `r5`, the dock marker becomes `r5`, and the r5 bubble is selected. Click r2's row and assert the dock exposes crawling copy without selecting an analyzed bubble. Return to r5 and capture the selected screenshot.

- [ ] **Step 4: Verify all Action paging inputs**

Use next, previous, each dot, `ArrowLeft`, `ArrowRight`, `Home`, and `End`. Assert action indices `0–3`, distinct stage signal IDs `r1/r3/r5/r7`, correct boundary disabled states, and position text `1 / 4` through `4 / 4`. Capture page 1 and page 4 screenshots.

- [ ] **Step 5: Verify evidence and exclusion interactions**

On r1, click an existing evidence ref and assert the matching evidence line receives the highlight marker. Open the exclusion strip and assert it contains r4/r6 and does not contain r2 or any third invented row. Capture the open strip screenshot.

- [ ] **Step 6: Verify keyboard, narrow layout, and reduced motion**

Tab through bubble controls and use arrow/enter selection. Resize to 390px, assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, and capture the narrow screenshot. Emulate reduced motion and verify the page remains operable without relying on animation completion.

- [ ] **Step 7: Inspect screenshots and repair visible regressions**

Inspect every owned screenshot for clipping, duplicated headlines, tooltip overflow, unstable stage height, weak selection affordance, or card-wall recurrence. Apply only mockup-file fixes, then repeat the affected browser checks and screenshots.

- [ ] **Step 8: Verify and commit QA artifacts**

Run:

```bash
git diff --check -- docs/mockups/2026-07-19-product-refit-D-focus-field.html
git status --short -- docs/mockups/2026-07-19-product-refit-D-focus-field.html output/playwright/product-refit-D-*.png
```

Expected: the mockup and seven owned screenshots are the only task-scoped paths. Commit only these paths:

```bash
git add docs/mockups/2026-07-19-product-refit-D-focus-field.html output/playwright/product-refit-D-saved-default.png output/playwright/product-refit-D-saved-hover.png output/playwright/product-refit-D-saved-r5.png output/playwright/product-refit-D-action-page1.png output/playwright/product-refit-D-action-page4.png output/playwright/product-refit-D-exclusion-open.png output/playwright/product-refit-D-narrow.png
git commit -m "test: verify product focus field mockup"
```
