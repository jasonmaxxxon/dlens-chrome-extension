# UI LOC Follow-up — Phase 2 Plan (CompareView body + ProductSignalViews rows)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Follow the worktree-based PR flow used throughout PR #58–#68; do not work directly in the desktop checkout.

**Goal:** Extend the `<View>.parts.tsx` row-level split pattern piloted in PR #68 (LibraryView) to the remaining two large View files. Each slice is its own PR. **This is structural splitting, not LOC reduction** — be honest about that in every PR description.

**Pattern reference (canonical, read first):**
- `src/ui/LibraryView.tsx` after PR #68 — main View that delegates row parts
- `src/ui/LibraryView.parts.tsx` after PR #68 — local row parts module (file-private helpers, only `PostCard` / `formatSavedAt` exported)
- PR #68 description on GitHub — honest LOC accounting + 3 acknowledged notes

**Tech stack:** `dlens-product-latest` TypeScript / MV3 / React / WXT / Node test runner.

---

Date: 2026-06-22
Depends on: PR #68 merged into `origin/main`. If draft, ask Jason to land before starting.
Baseline: extension `0.3.0` (Visual Reset A complete; marquee surfaces DOM-test-locked; row-level adoption explicitly NOT locked per architecture map VIEW node annotation).
Status: planned

## Non-Negotiable Invariants (inherit from Visual Reset A)

Same as `docs/handoff/2026-06-18-visual-reset-A-plan.md` §Non-Negotiable Invariants. Hard-summary:

1. 6 walls stay 🟩 (`TRACE` / `SEAM_GUARD` / `RECONCILE` / `INVALIDATE` / `BOUNDARY` / `MIGRATE`).
2. ViewModels (`src/viewmodel/*`) untouched.
3. `tokens.ts` is the single design source — no new tokens, fonts, palettes, shadows.
4. No raw `chrome.storage.*` or `sendExtensionMessage` from `*View*.tsx`. Boundary guard CI stays at zero violations.
5. Mode accent contract (archive / topic / product / pr-evidence) semantically unchanged.
6. No Threads DOM extraction. No backend / API. No async path edits. No command-target edits.
7. Every PR ships with minimal DOM-behavior tests (row count, action wiring, section state, width safety, elevation discipline).
8. **Honest LOC accounting in PR description**: show `<View>.tsx` delta, sibling `<View>.parts.tsx` delta, **and net sum**. Do NOT claim PR2's 30% LOC target met. The win is structural isolation, not line count.
9. Worktree-based flow: `~/.config/superpowers/worktrees/dlens-product-latest/<branch>`. Do not work in the desktop checkout.
10. Local main synced to `origin/main` before each slice starts.

## Slice 1 — CompareView body parts split

**Branch:** `codex/compareview-body-parts`
**Commit title:** `refactor: split CompareView body parts`
**PR title:** same

**Scope IN:**
- Extract repeated row-level structures from `CompareView.tsx` body into `src/ui/CompareView.parts.tsx`.
- Target the **evidence / support rows** first. If multiple distinct row groupings exist (e.g. evidence rows, support rows, comment rows), include them all only if the diff stays under ~400 LOC.

**Scope OUT (hard limits):**
- Compare hero (`ResultHeroCard`, `data-compare-hero="billboard"`, raised surface — locked by PR #64).
- Cluster dock visual rebuild (deferred — separate slice if/when needed).
- Casebook visual rebuild (deferred).
- Processing strip (deferred).
- Compare ViewModel (`src/viewmodel/compare.ts`), async-fetched divergence path, command targets, brief state derivation.
- Token additions.

**If scope creeps:** stop, report which sub-row group exceeded budget, ship the smallest viable slice, leave the rest as a follow-up plan.

**DoD tests (add to `tests/compare-view.test.tsx`):**
- Row marker count: e.g. `assert.equal(countOccurrences(html, 'data-compare-evidence-row="scan"'), N)` for the representative fixture.
- Row click / action callback wiring smoke — typed command descriptor unchanged.
- Section state markers if present (loading / ready / empty).
- Width safety: no hardcoded 320 / 440 px; no `min-width: > 200px`.
- **Elevation discipline (critical):** `assert.equal(countOccurrences(html, \`box-shadow:${tokens.shadow.raised}\`), 1)` — hero stays the ONLY raised surface in CompareView.
- Shared framing markers (`data-shared-surface-card`, `data-section-header="shared"`) on any new SurfaceCard / SectionHeader usage.

**PR description must include three honest notes:**
1. LOC accounting (verbatim, three lines):
   - `CompareView.tsx: <before> -> <after> (<delta>)`
   - `CompareView.parts.tsx: +<lines> (new)`
   - `Net Compare-code total: <before> -> <after> (<delta>)`
2. Hero remains the only raised surface in CompareView (assertion locked in test).
3. Cluster dock / casebook / processing strip are explicit follow-ups, not in this PR.

## Slice 2 — ProductSignalViews row parts split

**Branch:** `codex/productsignalviews-row-parts`
**Commit title:** `refactor: split ProductSignalViews row parts`
**PR title:** same

**Scope IN:**
- Extract repeated row-level structures from `ProductSignalViews.tsx` into `src/ui/ProductSignalViews.parts.tsx`.
- Likely candidates: signal reading rows, reading review marginalia, repeated chip/strip layouts in Product signal review surfaces.
- This is the largest file (~4163 lines). **Be aggressive about containment.** If the diff approaches ~500 LOC, stop and sub-slice.

**Scope OUT (hard limits):**
- Product action cards (`data-product-action-card`, `ProductReadinessChip`, drawer accent rail — locked by PR #65).
- `ProductSignalClassifier`, Product VM (`src/viewmodel/product-signal.ts`), command targets, signal storage seam.
- Backend / API.
- Token additions.

**Sub-slicing rule:** if `ProductSignalViews.tsx` has multiple distinct row groupings (signal reading rows vs reading review marginalia vs action surfaces metadata), ship them as separate PRs with names like `codex/productsignalviews-row-parts-{reading|marginalia|...}`. One PR per row family.

**DoD tests (add to `tests/views.test.tsx` or new `tests/product-signal-views.test.tsx`):**
Same pattern as Slice 1. Critical assertions:
- Row marker count.
- Action wiring smoke.
- Width safety.
- **Elevation discipline:** `countOccurrences(html, \`box-shadow:${tokens.shadow.raised}\`)` matches the PR #65 baseline (do not introduce new raised surfaces; the action-card raised count assertion must still hold per its conditional-path test pattern).
- Shared framing markers.

**PR description must include three honest notes** (same shape as Slice 1, substituting Product file names).

## Verification (every PR — copy verbatim into PR body's "Verification snapshot" section)

```
- npm run typecheck
- npm run boundary:guard
- npm run storage:seam-guard
- npm run storage:migrate-fixtures
- npm run qa:harness:fixture
- npx tsx --test tests/<the new or modified test file>
- npx tsx --test tests/*.test.ts tests/*.test.tsx  (full suite — record passed / skipped counts)
- npm run build
- git diff --check
```

All must pass before requesting merge. GitHub CI's two `verify` checks must also pass.

## Self-check before opening each PR

1. Did I touch anything in `src/viewmodel/*`? If yes → stop, revert.
2. Did I add `chrome.storage.*` / `sendExtensionMessage` / `fetch` in a `*View*.tsx` file? If yes → stop, revert.
3. Did I add new tokens, fonts, palettes, or shadows? If yes → revert; reuse existing `tokens.ts` values.
4. Did I write the three honest LOC accounting lines in the PR description?
5. Did I assert the existing raised-surface count is preserved (1 for Compare, baseline-N for Product)?
6. Did all verification commands pass locally?
7. Is the new `.parts.tsx` file a **View-local module** (file-private helpers, only the row/section components exported)? It is NOT a new general-primitive library; do not let it grow that role.

## Out of Scope for this plan

- LibraryView (done in PR #68).
- TopicDetailView row-level adoption. TopicDetailView is 2415 lines; if Slice 1 + 2 land cleanly and there is appetite, open a separate plan. Do not include it here.
- LibraryView surface visual evolution.
- Backend D Phase (`API` / `JOBS` live-failure guard). Independent track; will be planned separately after this UI follow-up completes.
- Any new design direction. `tokens.ts` stays the single source.
- Removing duplicate `StatusDot` shared / local instances flagged in PR #68 review. Leave both in place until a future consolidation slice explicitly takes that on.

## Done Condition for this plan

- Slice 1 merged with honest LOC accounting and hero-raised-count assertion green.
- Slice 2 (and any sub-slices) merged with honest LOC accounting and Product-raised-count assertion green.
- Architecture map `VIEW` node annotation may be revisited after Slice 2 lands; if at least 4 of the 5 large Views (Library / Compare / Product / Topic / PrEvidence) now have `.parts.tsx` row split, propose a follow-up doc PR updating the annotation to reflect the new state honestly (still 🟢 unless a hard CI guard locks row-level adoption — which this plan does NOT add).

## Pointer index

- Pattern reference: `src/ui/LibraryView.tsx`, `src/ui/LibraryView.parts.tsx`
- PR #68 (LibraryView pilot): https://github.com/jasonmaxxxon/dlens-chrome-extension/pull/68
- Visual Reset A plan (origin of invariants + Done Conditions): `docs/handoff/2026-06-18-visual-reset-A-plan.md`
- Architecture map (read VIEW node annotation): `docs/architecture/dlens-current-architecture-map.md`
- 0.3.0 release note (current baseline): `docs/handoff/2026-06-18-0.3.0-release-note.md`
- Active design contract: `src/ui/tokens.ts`
- Shared primitives: `src/ui/components.tsx` (SurfaceCard, SectionHeader, StatusDot, StatusRail, KeyHint, QuoteBlock, EvidenceRow, etc.)
