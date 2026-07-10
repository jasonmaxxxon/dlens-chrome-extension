# Shared Glass Shell design

Date: 2026-07-10

Status: approved in conversation

Scope: shared DLens popup shell for Topic, Product, and PR; Topic Audit state continuity

## Problem

Signal Atlas uses the approved Variant D glass language inside Topic detail, but the popup background, masthead, left rail, and workspace wrapper still use the older opaque editorial shell. The split is most visible during Topic Audit regeneration:

- `ready` renders compact audit actions beside the breadcrumb;
- `running`, `stale`, `failed`, and first-run states render the legacy `TopicAuditOverview` card;
- old Atlas evidence remains mounted while regeneration runs, so the legacy overview appears above the new Atlas instead of replacing it;
- the displayed `Pn/6` during a forced rerun is derived from the previous memo state, not live stage progress.

This is a render-contract problem, not a stale bundle or route fallback.

## Goals

1. Give Topic, Product, and PR one coherent shared glass shell without rewriting every inner view.
2. Preserve each workspace mode's existing accent colour and information hierarchy.
3. Keep Topic Atlas visually continuous through `ready`, `running`, `stale`, and `failed` states.
4. Remove the legacy Topic Audit overview from Atlas-backed Topic detail.
5. Never display stage precision that the runtime does not actually report.
6. Roll out in small, test-locked slices that can be checked in the real Chrome extension.

## Non-goals for the shared-shell release

- Redesign every Product and PR content card.
- Change storage, message, backend, or audit memo schemas.
- Add real-time P2-P6 stage events.
- Fix every Signal Atlas data-visualisation issue in the same change.
- Change Archive/Library content grammar beyond inheriting the surrounding shell when reached from a supported workspace.

## Material architecture

### One glass stage

`InPageCollectorPopup` owns one near-white workspace glass canvas and one set of decorative aura washes. Aura elements sit behind the shell and are marked decorative. They are not repeated inside every card.

The shared material is applied to:

- popup background;
- masthead;
- left navigation rail;
- primary workspace frame;
- the outer wrapper around marquee content.

Dense lists, tables, evidence rows, form controls, and long reading cards remain opaque warm paper. This avoids glass-on-glass layering and protects contrast.

### Token ownership

The existing Atlas values become the source for a semantic `workspaceGlass` material family in `tokens.ts`. Existing `atlas*` names remain compatibility aliases during the transition rather than creating a second palette.

The material family must expose semantic roles for:

- canvas;
- panel and strong panel;
- edge;
- teal, amber, and violet aura washes;
- panel and hero elevation;
- blur.

`tokens-intent.md` will be revised in place: glass is permitted for the shared shell and marquee heroes, while reading rows and dense data surfaces remain paper.

### Component boundary

`WorkspaceShell` receives an explicit material contract rather than inferring styling from arbitrary page names. `InPageCollectorPopup` selects the glass material for Topic, Product, and PR workspaces. Settings inherits the active workspace material.

`WorkspaceSurface` gains a glass/transparent outer-wrapper option for marquee pages. Topic detail no longer nests the Atlas inside the old utility surface. Product and PR retain their existing inner layouts in the first slice.

Stable `data-*` markers will expose the material at popup, masthead, rail, and main-frame boundaries so tests verify the visible contract instead of CSS implementation details.

## Topic Audit state model

The Atlas frame is the stable container. Report state changes its status treatment, not its geometry.

### Ready

- Show the current Atlas and compact report/regenerate actions.
- Do not render `TopicAuditOverview`.

### Regenerating with existing Atlas data

- Keep the complete previous Atlas visible.
- Show a compact amber status ribbon inside the Atlas hero.
- Disable duplicate regeneration actions while the run is active.
- Use truthful indeterminate copy such as `重新生成中`; do not show `Pn/6` until the runtime emits real stage events.
- Do not render the legacy overview card.

### First run with no Atlas data

- Render the same glass Atlas frame with a restrained skeleton/empty hero.
- Show the generate action or indeterminate running state in that frame.
- Do not fall back to the legacy overview geometry.

### Stale

- Keep the last Atlas visible.
- Show a stale ribbon with `重新生成` and `先看舊版` actions.

### Failed

- Preserve the last usable Atlas when one exists.
- Show an error ribbon with the failed reason and resume action.
- With no prior Atlas, show the same glass empty frame with failure treatment.

## Other workspace modes

Product and PR receive the shared glass canvas, masthead, rail, and outer workspace surface within this release, after the shared primitives and Topic continuity slices are green. Their business cards, filters, tables, drawers, and commands do not change behaviour.

Later slices may promote one high-weight Product or PR hero at a time to the glass material. Each promotion remains one-in-one-out and requires its own visual check.

## Progressive data-truth follow-ups

These are separate, ordered slices after the shell/state work:

1. Replace misleading `已歸類` and post reaction-composition wording with values supported by unique comment membership, or label them as evidence/pattern assignments.
2. Reconcile captured/read/usable comment denominators so ratios such as `175/126` cannot appear without explanation.
3. Bound compass collision displacement so bubbles cannot cross semantic axes; fall back to a field layout when the compass is too crowded.
4. Treat counterexamples as relational satellites until counter evidence has independently read coordinates.

## Accessibility and performance

- Decorative auras use `aria-hidden` and never receive pointer events.
- All blur surfaces retain an opaque fallback colour.
- Ambient aura movement and shell transitions respect `prefers-reduced-motion`.
- Existing keyboard navigation, focus-visible treatment, and mode-switch semantics remain unchanged.
- Blur is applied at shell/panel boundaries, not repeated on every row.

## Test-first implementation contract

Before production changes, add failing tests for these behaviours:

1. Topic Audit with existing Atlas data and `running` status retains `data-signal-atlas-canvas` and does not render `data-topic-audit-block="overview"`.
2. First-run `running` status renders the glass Atlas empty frame, not the legacy overview.
3. Regeneration UI does not display `Pn/6` without a real stage-progress contract.
4. `WorkspaceShell` exposes the shared glass material markers for Topic, Product, and PR while preserving each mode accent.
5. Topic detail does not add the old nested utility workspace surface.
6. Reduced-motion output keeps decorative motion disabled.

After each red-green cycle, run the targeted test file before widening verification.

## Verification and release closeout

The final implementation is complete only after:

- targeted component and Topic-detail tests pass;
- full typecheck and repository test suite pass;
- boundary and storage seam guards pass;
- production build succeeds;
- `output/chrome-mv3/manifest.json` contains the new version;
- the five version-lock sites are synchronized;
- `README.md` and `docs/memory/latest-shared-context.md` describe the live contract;
- Computer Use verifies the real Chrome lifecycle: ready -> regenerate -> running -> ready, with no legacy overview appearing and no shell material discontinuity.

## Rollout slices

1. Shared material tokens and Glass Shell primitives.
2. Topic Audit continuous state frame and removal of legacy overview.
3. Product/PR outer-shell adoption and real-Chrome QA.
4. Separate data-truth fixes in the priority order above.

Each slice must stay independently green and preserve unrelated user-owned mockups and workspace changes.
