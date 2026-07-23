# Product Attention Surface Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Product mode attention light from button/title-sized pills to the complete analysis, deep-reading, and actionable-recommendation surfaces while restoring the Product inbox glass-card hierarchy.

**Architecture:** Add one semantic block-level `AttentionSurface` primitive beside the existing `SearchingOrb` and legacy inline `AttentionBeam`. Product mode moves only its three surface-level attention states to the new primitive and renders `SearchingOrb` directly inside busy buttons. Existing verdict, recommendation, model, storage, and export contracts remain unchanged.

**Tech Stack:** React 19, TypeScript 5.8, server-rendered Node tests, shared token and motion registries, WXT MV3 build.

## Global Constraints

- Work from `/Users/tung/developer/dlens-product-latest` on the current local `main`; do not push.
- Preserve all unrelated untracked mockups, archives, Playwright output, and `.playwright-cli/`.
- The beam belongs to a complete panel/card and must never wrap only a title, label, icon, or button text.
- Product verdict, recommendation data, prompt, storage, Product Import, and export behavior do not change.
- Do not bump `0.3.57` in this package; release/version work remains blocked on real Chrome acceptance.
- Use only values from `src/ui/tokens.ts`; do not add a palette, radius, shadow, dependency, or keyframe owner.
- `prefers-reduced-motion: reduce` must leave a static illuminated surface and static Searching Orb.
- One-in-one-out: the new block-level primitive replaces Product's content-level beam wrappers and their ad-hoc padding.
- Commit prefixes are exactly `bug fix`, `feature`, `removal`, or `refactor`; do not push or open a PR.
- Runtime proof requires rebuilt `output/chrome-mv3`, Jason's Chrome `Default` profile, and a real Threads page opened through the extension action or in-page launcher.

## File Structure

- Modify `src/ui/components.tsx`: own the semantic `AttentionSurface` component and keep `SearchingOrb` as the only orb implementation.
- Modify `src/ui/motion.ts`: style full-surface generating/actionable light without adding a new keyframe owner.
- Modify `src/ui/ProductSignalViews.tsx`: migrate Product analysis, deep reading, application card, and brief CTA.
- Modify `tests/components.test.tsx`: lock primitive semantics and marker ownership.
- Modify `tests/motion-registry.test.ts`: lock full-surface CSS and reduced-motion behavior.
- Modify `tests/views.test.tsx`: lock Product DOM ownership, card hierarchy, and neutral-state exclusions.

---

### Task 1: Add a semantic full-surface attention primitive

**Files:**
- Modify: `src/ui/components.tsx:242-270`
- Modify: `src/ui/motion.ts:89-120`
- Test: `tests/components.test.tsx:231-277`
- Test: `tests/motion-registry.test.ts:262-286`

**Interfaces:**
- Consumes: `AttentionBeamState`, `SearchingOrb`, `tokens.motion.keyframes.indeterminate`, and the existing `DLENS_REDUCED_MOTION_CSS`.
- Produces:

```ts
export function AttentionSurface({
  as,
  state,
  children,
  style,
  dataAttrs
}: {
  as?: "div" | "section";
  state: AttentionBeamState;
  children: ReactNode;
  style?: CSSProperties;
  dataAttrs?: Record<`data-${string}`, string | undefined>;
}): ReactElement;
```

- `AttentionSurface` renders `data-attention-surface="true"`,
  `data-attention-beam={state}`, and `data-attention-beam-sweep="true"` only
  for `generating`.
- It never inserts a `SearchingOrb`; the operation button owns the orb.

- [ ] **Step 1: Write failing component tests**

Update the import in `tests/components.test.tsx` and add:

```tsx
test("AttentionSurface owns one semantic full-card beam without inserting button content", () => {
  const generatingHtml = renderToStaticMarkup(
    React.createElement(
      AttentionSurface,
      {
        as: "section",
        state: "generating",
        dataAttrs: { "data-product-operation": "analysis" },
        style: { borderRadius: tokens.radius.cardLg }
      },
      React.createElement("button", { type: "button" }, "分析中")
    )
  );

  assert.match(generatingHtml, /^<section/);
  assert.match(generatingHtml, /data-attention-surface="true"/);
  assert.match(generatingHtml, /data-attention-beam="generating"/);
  assert.match(generatingHtml, /data-attention-beam-sweep="true"/);
  assert.match(generatingHtml, /data-product-operation="analysis"/);
  assert.doesNotMatch(generatingHtml, /data-searching-orb=/);

  const actionableHtml = renderToStaticMarkup(
    React.createElement(
      AttentionSurface,
      { state: "actionable" },
      React.createElement("div", null, "可能用法")
    )
  );
  assert.match(actionableHtml, /^<div/);
  assert.match(actionableHtml, /data-attention-beam="actionable"/);
  assert.doesNotMatch(actionableHtml, /data-attention-beam-sweep=/);
});
```

- [ ] **Step 2: Write failing motion-registry assertions**

Extend `AI attention primitives become explicitly static under reduced motion`
in `tests/motion-registry.test.ts`:

```ts
assert.match(DLENS_ATTENTION_CSS, /\[data-attention-surface="true"\]\{[^}]*display:grid/);
assert.match(DLENS_ATTENTION_CSS, /\[data-attention-surface="true"\]\{[^}]*overflow:hidden/);
assert.match(DLENS_ATTENTION_CSS, /\[data-attention-surface="true"\]\[data-attention-beam="actionable"\]::after/);
assert.doesNotMatch(DLENS_ATTENTION_CSS, /\[data-attention-surface="true"\][^}]*border-radius:[^}]*button/);
```

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```bash
npx tsx --test tests/components.test.tsx tests/motion-registry.test.ts
```

Expected: FAIL because `AttentionSurface` is not exported and the full-surface
selectors do not exist.

- [ ] **Step 4: Implement `AttentionSurface`**

In `src/ui/components.tsx`, keep the legacy `AttentionBeam` unchanged for
non-Product consumers and add:

```tsx
export function AttentionSurface({
  as = "div",
  state,
  children,
  style,
  dataAttrs
}: {
  as?: "div" | "section";
  state: AttentionBeamState;
  children: ReactNode;
  style?: CSSProperties;
  dataAttrs?: Record<`data-${string}`, string | undefined>;
}) {
  const Element = as;
  return (
    <Element
      {...dataAttrs}
      data-attention-surface="true"
      data-attention-beam={state}
      data-attention-beam-sweep={state === "generating" ? "true" : undefined}
      style={style}
    >
      {children}
    </Element>
  );
}
```

Do not put `SearchingOrb` inside this component. Do not change the root element
of the legacy inline `AttentionBeam`.

- [ ] **Step 5: Add full-surface CSS using the existing motion owner**

Extend `DLENS_ATTENTION_CSS` in `src/ui/motion.ts` with compact selectors
equivalent to:

```css
[data-attention-surface="true"] {
  position: relative;
  display: grid;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  isolation: isolate;
  border-radius: ${tokens.radius.cardLg}px;
  align-items: stretch;
  justify-content: stretch;
  gap: inherit;
  padding: 0;
}
[data-attention-surface="true"] > * {
  position: relative;
  z-index: 1;
}
[data-attention-surface="true"][data-attention-beam-sweep="true"]::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0 auto 0 -34%;
  width: 34%;
  background: linear-gradient(90deg, transparent, ${tokens.color.signalGlow}, transparent);
  opacity: .82;
  animation: ${tokens.motion.keyframes.indeterminate};
  pointer-events: none;
}
[data-attention-surface="true"][data-attention-beam="actionable"]::after {
  content: "";
  position: absolute;
  z-index: 2;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px var(--dlens-mode-accent);
  opacity: .58;
  pointer-events: none;
}
[data-attention-surface="true"][data-attention-beam="actionable"] {
  padding: 0;
  box-shadow: none;
}
```

Use the actual template interpolations already available in `motion.ts`:
`tokens.radius.cardLg`, `tokens.color.signalGlow`,
`tokens.motion.keyframes.indeterminate`, and `var(--dlens-mode-accent)`.
Place the full-surface sweep selector after the legacy sweep selector so its
`z-index:0` overrides the legacy `z-index:-1`. Place the actionable surface
override after the legacy actionable rule so the old `inset 2px 0` title accent
cannot leak onto the complete card.

Reduced motion continues to match
`[data-attention-beam-sweep="true"]::before`; it hides the moving layer while
the surface's static border/background remains.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

```bash
npx tsx --test tests/components.test.tsx tests/motion-registry.test.ts
npm run typecheck
```

Expected: both test files pass and TypeScript reports no errors.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/ui/components.tsx src/ui/motion.ts tests/components.test.tsx tests/motion-registry.test.ts
git commit -m "bug fix: add full-surface attention owner"
```

---

### Task 2: Move Product generation light from buttons to operation panels

**Files:**
- Modify: `src/ui/ProductSignalViews.tsx:1232-1360`
- Modify: `src/ui/ProductSignalViews.tsx:2732-2860`
- Test: `tests/views.test.tsx:4470-4525`
- Test: `tests/views.test.tsx:6070-6115`

**Interfaces:**
- Consumes: `AttentionSurface`, `SearchingOrb`, `heroPanelStyle`, and
  `ProductActionReadingOperations`' existing local `generating` state.
- Produces:
  - analysis status root marker `data-product-analysis-surface="true"`;
  - deep-reading root marker `data-product-deep-reading-surface="true"`;
  - exactly one generating attention surface per active Product operation;
  - no Product busy button containing `data-attention-beam`.

- [ ] **Step 1: Add failing analysis-surface assertions**

In the existing Product readiness/analyzing tests in `tests/views.test.tsx`,
assert:

```ts
const analysisSurface = findTagWithAttribute(analyzingHtml, 'data-product-analysis-surface="true"');
assert.match(analysisSurface, /data-attention-surface="true"/);
assert.match(analysisSurface, /data-attention-beam="generating"/);
const analysisButton = findTagWithAttribute(analyzingHtml, 'aria-busy="true"');
assert.doesNotMatch(analysisButton, /data-attention-beam=/);
assert.match(analyzingHtml, /data-searching-orb="true"[^]*分析中/);
```

For the corresponding idle/result fixture:

```ts
assert.match(findTagWithAttribute(idleHtml, 'data-product-analysis-surface="true"'), /data-attention-beam="none"/);
```

- [ ] **Step 2: Add failing deep-reading surface assertions**

In the interactive Product deep-reading test, after clicking
`[data-product-action-generate-reading]`, assert:

```ts
const readingSurface = rootElement.querySelector<HTMLElement>('[data-product-deep-reading-surface="true"]');
assert.equal(readingSurface?.dataset.attentionBeam, "generating");
assert.equal(
  rootElement.querySelector('[data-product-action-generate-reading] [data-attention-beam]'),
  null
);
assert.ok(
  rootElement.querySelector('[data-product-action-generate-reading] [data-searching-orb="true"]')
);
```

Resolve the synthesis promise using the test's existing deferred callback, then
assert the reading surface returns to `data-attention-beam="none"`.

- [ ] **Step 3: Run the focused Product tests and confirm RED**

Run:

```bash
npx tsx --test --test-name-pattern="Product.*(analysis|reading|deep)" tests/views.test.tsx
```

Expected: FAIL because the operation markers are absent and the beam is still
inside each busy button.

- [ ] **Step 4: Migrate `ReadinessPanel`**

Import `AttentionSurface` and `SearchingOrb` from `components.tsx`. Replace the
main `ReadinessPanel` root `<div>` with:

```tsx
<AttentionSurface
  state={viewModel.isAnalyzing ? "generating" : "none"}
  dataAttrs={{ "data-product-analysis-surface": "true" }}
  style={heroPanelStyle({ gap: hasResults ? 8 : 10 })}
>
```

Keep every current child and error/success branch. Replace the inner
`AttentionBeam` in the primary button with:

```tsx
{viewModel.isAnalyzing ? (
  <>
    <SearchingOrb />
    <span>分析中</span>
  </>
) : (
  hasResults ? "重新分析" : "分析收件匣"
)}
```

The existing `disabled`, `ariaBusy`, and pointer-down behavior stay intact.

- [ ] **Step 5: Migrate `ProductActionReadingOperations`**

Replace its root `<section>` with:

```tsx
<AttentionSurface
  as="section"
  state={generating ? "generating" : "none"}
  dataAttrs={{
    "data-product-action-reading": reading ? "existing" : "missing",
    "data-product-deep-reading-surface": "true"
  }}
  style={{
    display: "grid",
    gap: 10,
    paddingTop: 12,
    borderTop: `1px solid ${tokens.color.line}`,
    minWidth: 0
  }}
>
```

Remove both button-level `AttentionBeam` wrappers. In the active generate or
regenerate button render:

```tsx
{generating ? (
  <>
    <SearchingOrb />
    <span>生成中…</span>
  </>
) : (
  "生成深度判讀" // or "重新生成判讀" for the regeneration button
)}
```

Keep existing operation markers, disabled states, `ariaBusy`, review actions,
notice/error handling, and semantic section root.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

```bash
npx tsx --test --test-name-pattern="Product.*(analysis|reading|deep)" tests/views.test.tsx
npm run typecheck
```

Expected: the selected Product tests and typecheck pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/ui/ProductSignalViews.tsx tests/views.test.tsx
git commit -m "bug fix: light complete product generation panels"
```

---

### Task 3: Restore full-card application hierarchy and remove CTA label beams

**Files:**
- Modify: `src/ui/ProductSignalViews.tsx:3290-3460`
- Test: `tests/views.test.tsx:5090-5140`
- Test: `tests/views.test.tsx:5650-5680`

**Interfaces:**
- Consumes: `AttentionSurface`, `glassCardStyle`, `tokens.color.atlasPaper`,
  `tokens.shadow.atlasCard`, current `ProductApplicationSuggestion`, and the
  existing recommendation-tier decision.
- Produces:
  - application recommendation root
    `data-product-action-recommendations="true"` plus
    `data-attention-surface="true"` and
    `data-attention-beam="actionable"`;
  - structured row markers and one distinct Agent footer;
  - a normal brief CTA with no nested attention marker.

- [ ] **Step 1: Replace permissive beam tests with ownership tests**

In the existing application suggestion test, replace:

```ts
assert.match(html, /data-product-action-recommendations="true"[^]*data-attention-beam="actionable"/);
assert.match(html, /data-product-action-brief-toggle="true"[^]*data-attention-beam="actionable"/);
```

with:

```ts
const applicationCard = findTagWithAttribute(html, 'data-product-action-recommendations="true"');
assert.match(applicationCard, /data-attention-surface="true"/);
assert.match(applicationCard, /data-attention-beam="actionable"/);
assert.match(applicationCard, /border-radius:20px/);
assert.match(applicationCard, /box-shadow:/);

const applicationHeader = findTagWithAttribute(html, 'data-product-action-recommendation-header="true"');
assert.doesNotMatch(applicationHeader, /data-attention-beam=/);

const briefToggle = findTagWithAttribute(html, 'data-product-action-brief-toggle="true"');
assert.doesNotMatch(briefToggle, /data-attention-beam=/);
assert.match(briefToggle, /border-radius:/);

assert.match(html, /data-product-action-application-content="true"/);
```

Add neutral-tier assertions:

```ts
assert.doesNotMatch(watchHtml, /data-product-action-recommendations="true"[^>]*data-attention-beam="actionable"/);
assert.doesNotMatch(parkHtml, /data-attention-beam="actionable"/);
assert.doesNotMatch(noiseHtml, /data-attention-beam="actionable"/);
assert.doesNotMatch(insufficientHtml, /data-attention-beam="actionable"/);
```

In the existing Agent brief fixture test, add:

```ts
const agentFooter = findTagWithAttribute(html, 'data-product-action-agent-brief="true"');
assert.match(agentFooter, /data-product-action-application-footer="true"/);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npx tsx --test --test-name-pattern="Product Action.*(application|brief|watch|park|noise|insufficient)" tests/views.test.tsx
```

Expected: FAIL because the header and brief CTA still own inline beams, and the
full recommendation card lacks the new hierarchy markers/material.

- [ ] **Step 3: Remove the brief CTA beam**

Keep the existing `<button data-product-action-brief-toggle="true">`, selected
state, click behavior, and two label/icon spans. Remove its `AttentionBeam`
wrapper entirely.

Update only existing token-backed styles:

```tsx
borderRadius: tokens.radius.cardLg,
background: activeBriefSelected
  ? tokens.color.productSoft
  : tokens.color.atlasPaper,
boxShadow: activeBriefSelected
  ? tokens.shadow.topicCard
  : tokens.shadow.atlasCard
```

Do not add another glow or motion to this CTA.

- [ ] **Step 4: Make the complete application card the attention owner**

For `recommendationTier === "application"`, render the recommendation
container through:

```tsx
<AttentionSurface
  as="section"
  state="actionable"
  dataAttrs={{
    "data-product-action-recommendations": "true",
    "data-product-recommendation-tier": activePresentation.recommendationTier
  }}
  style={glassCardStyle({
    gap: 12,
    padding: "14px 15px",
    minWidth: 0,
    background: tokens.color.atlasPaper,
    boxShadow: tokens.shadow.atlasCard
  })}
>
```

Keep inspiration/none tiers as the current neutral native `<section>` and do
not give them an actionable marker.

Replace the heading-level `AttentionBeam` with:

```tsx
<div
  data-product-action-recommendation-header="true"
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    paddingBottom: 9,
    borderBottom: `1px solid ${tokens.color.line}`
  }}
>
  <span style={{ ...textStyles.fieldLabel, color: tokens.color.product }}>
    可能用法 · 待驗證
  </span>
  <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>
    小步測試
  </span>
</div>
```

Do not introduce new user-facing recommendation claims.

- [ ] **Step 5: Restore row hierarchy with existing content**

For each application recommendation:

```tsx
<div
  data-product-action-recommendation="application"
  data-product-action-application-content="true"
  ...
  style={{
    display: "grid",
    gap: 10,
    minWidth: 0,
    padding: "11px 12px",
    borderRadius: tokens.radius.card,
    border: `1px solid ${tokens.color.cardEdge}`,
    background: tokens.color.contextSurface
  }}
>
```

Keep the source, fit, and test markers/labels, but give every part after source
`paddingTop: 8` and `borderTop: 1px solid tokens.color.line`. Keep
verification/evidence quieter using `tokens.color.inkWash`.

Move the existing Agent handoff row into:

```tsx
<div
  data-product-action-application-footer="true"
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    paddingTop: 10,
    borderTop: `1px solid ${tokens.color.line}`
  }}
>
```

Preserve its existing copy behavior and markers. Do not duplicate any field.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

```bash
npx tsx --test --test-name-pattern="Product Action.*(application|brief|watch|park|noise|insufficient)" tests/views.test.tsx
npm run typecheck
```

Expected: selected tests and typecheck pass; only application cards own a
static full-surface beam.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/ui/ProductSignalViews.tsx tests/views.test.tsx
git commit -m "bug fix: restore product suggestion card depth"
```

---

### Task 4: Integrated review, complete gates, and real Chrome acceptance

**Files:**
- Review only: `src/ui/components.tsx`
- Review only: `src/ui/motion.ts`
- Review only: `src/ui/ProductSignalViews.tsx`
- Review only: `tests/components.test.tsx`
- Review only: `tests/motion-registry.test.ts`
- Review only: `tests/views.test.tsx`
- Build output: `output/chrome-mv3/`

**Interfaces:**
- Consumes: the three task commits.
- Produces: verified static evidence, bundle-size evidence, and a clearly
  separated real-Chrome result.

- [ ] **Step 1: Run ownership and scope scans**

Run:

```bash
rg -n "AttentionBeam|AttentionSurface|SearchingOrb|data-attention-beam" src/ui/ProductSignalViews.tsx src/ui/components.tsx src/ui/motion.ts
git diff e141b56..HEAD --stat
git diff e141b56..HEAD --check
```

Expected:

- Product busy buttons and recommendation headings contain no
  `AttentionBeam`;
- exactly the full analysis, deep-reading, and application surfaces use
  `AttentionSurface`;
- no prompt, storage, verdict, import, version, manifest, or dependency file
  changed;
- diff check is clean.

- [ ] **Step 2: Run the complete repository gate**

Run each command separately:

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
npm run bundle:guard
git diff --check
```

Expected: every command exits 0. Record the exact test totals and raw/gzip/
brotli bundle measurements; do not reuse an earlier run's numbers.

- [ ] **Step 3: Inspect the rebuilt bundle before Chrome**

Run:

```bash
node -e 'const m=require("./output/chrome-mv3/manifest.json"); console.log(m.version)'
rg -n "data-product-analysis-surface|data-product-deep-reading-surface|data-attention-surface" output/chrome-mv3
```

Expected: built manifest reports `0.3.57` and the built bundle contains all
three new markers.

- [ ] **Step 4: Run real Chrome visual acceptance**

Using Jason's Chrome `Default` profile:

1. Reload the unpacked extension from `output/chrome-mv3`.
2. Return to the existing real Threads tab and reload that tab so the old
   content script is replaced.
3. Open DLens through the extension action or in-page launcher.
4. In Product Inbox, trigger analysis and confirm the moving light fills the
   complete analysis-status card while the dark button shows only the bright
   orb and `分析中`.
5. Open Product Action, trigger deep reading, and confirm the complete
   deep-reading section lights while its button shows no small rectangle.
6. Inspect an application suggestion and confirm the whole
   `可能用法 · 待驗證` card has rounded glass gradient, shadow, and restrained
   static edge; its title and `加入行動簡報` have no curved stripe.
7. Page to watch, park, noise, and insufficient cards and confirm none has
   actionable light.
8. Verify narrow popup, hover, keyboard focus, success, error, pager, and
   reduced-motion states.

Capture screenshots for the analysis generating state and the complete
application card. A direct extension URL or temporary Chrome profile is not
accepted.

- [ ] **Step 5: Report honestly**

If static gates pass but Chrome cannot be reached, report:

```text
Static gates: passed
Real Chrome acceptance: pending — report the exact observed browser/tool error verbatim
Release/version bump: not performed
Push: not performed
```

Do not describe the visual fix as fully verified until Step 4 passes.
