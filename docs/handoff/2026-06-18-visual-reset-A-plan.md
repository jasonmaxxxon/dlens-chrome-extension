# Visual Reset A — UI Milestone Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan PR-by-PR. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materialise the long-parked "視覺重置 A" milestone now that the VM boundary, TRACE, SEAM_GUARD, RECONCILE, INVALIDATE, BOUNDARY, and MIGRATE walls are 🟩 locked. Convert three competing design directions in-repo into one auditable design contract, then reskin in layers without opening a second design system.

**Architecture:** Two-layer design language. **Content language** stays `src/ui/tokens.ts` (warm-paper editorial — Instrument Serif, indigo+sage+rose mode accents, Noto Sans/Serif TC body). **Frame/interaction language** absorbs macOS utility patterns (multi-layer shadow, sliding-thumb segmented control, status rail, keyboard hint, shell motion) directly into existing tokens — not into a parallel system. Mockup gallery becomes reference, not a fork.

**Tech Stack:** `dlens-product-latest` TypeScript / MV3 / React / WXT / Node test runner; existing TRACE, RECONCILE, INVALIDATE, BOUNDARY, SEAM_GUARD, MIGRATE guards.

---

Date: 2026-06-18
Depends on: `docs/architecture/dlens-current-architecture-map.md` (no 🔴 nodes; 6 walls 🟩), archived `design-system/DESIGN.md`, and `docs/mockups/references/2026-06-09-design-gallery-PROGRESS.md`.
Product baseline: `origin/main` at `0.2.1` (889 passed / 5 skipped). Desktop checkout is 5 commits behind — sync before starting.
Status: PR 1 merged as design-source convergence; PR 2 merged as primitive foundation; PR 3 merged as shell interaction reset; PR 4a implemented as PR Evidence ledger surface; PR 4b implemented as Topic detail audit rhythm; PR 4c pending.

## Current Truth

After ~50 structural PRs the extension has reached product-grade engineering posture:

- 6 product walls locked: TRACE / SEAM_GUARD / RECONCILE / INVALIDATE / BOUNDARY / MIGRATE
- 4 mode ViewModels (Product / Topic / Compare / PR-Evidence) pure, boundary-guarded
- 0.2.1 released with visible signal-packet HTML / provenance / lineage exits

But the UI layer has three uncollapsed design sources:

1. **`src/ui/tokens.ts`** — warm-paper editorial, live in production, 369 lines, full motion/shadow/textStyles scale, 4 mode accents.
2. **`design-system/DESIGN.md`** — archived aspirational cool-paper Apple+Notion+Linear+Raycast pattern. It does not match production and is now reference-only.
3. **`docs/mockups/references/2026-06-09-design-gallery.html`** — reference-only set of 8 macOS-native explorations (macos-light/dark/graphite/glass, raycast-glass, night-desk-pro, linear-noir, vercel-mono). 2026-06-10 progress note flagged "too samey / wants native-Mac-plugin feel" but no winner picked.

The 4 main mode Views are also oversized: `ProductSignalViews.tsx` 4073 lines, `CompareView.tsx` 3193 lines, `TopicDetailView.tsx` 2415 lines, `PrEvidenceViews.tsx` 1122 lines. Most of this is ad-hoc inline styling that should live in shared primitives.

## Repo-level Decision

**DLens 的內容語言維持 `tokens.ts` 的暖紙 editorial；外框與互動語言吸收 macOS utility，但不另開第二套設計系統。**

In English for cross-agent clarity: *Editorial reader inside a native-feeling utility shell.* One token file. macOS utility patterns extend existing token slots (`shadow.popup`, `motion.preset.*`, `effect.*`); they do not create a parallel palette/font/scale.

## Non-Negotiable Invariants

These must hold after every PR:

1. `TRACE`, `SEAM_GUARD`, `RECONCILE`, `INVALIDATE`, `BOUNDARY`, `MIGRATE` stay locked. Do not weaken tests, guard scripts, or architecture map wording.
2. ViewModels (`src/viewmodel/*`) are not touched. Pure functions stay pure.
3. `tokens.ts` is the single active design source. No new token file is introduced.
4. No raw `chrome.storage.*` writes. No `sendExtensionMessage` from `src/ui/*View*.tsx`. Boundary guard CI stays at zero violations.
5. Mode accent contract (archive / topic / product / pr-evidence) remains unchanged in semantic meaning. Visual treatment may evolve.
6. No Threads DOM extraction work in this plan. That belongs to `CRAWLER`.
7. Backend / API / read-model untouched.
8. Every UI PR ships with minimal DOM-behavior tests covering interaction, command wiring, layout, readability — VM boundary protects data, not UI.
9. Runtime QA uses Jason's real Chrome `Default` profile and the real `output/chrome-mv3` reload path. No sidepanel-direct testing as proof of extension runtime behavior.
10. Local `main` is synced to `origin/main` before PR 1 work begins. Dirty working tree from prior audits is staged or stashed first.

## Done Condition

Visual Reset A is done when:

1. Repo has exactly one active design contract: `src/ui/tokens.ts`. `DESIGN.md` is archived (moved or front-matter labelled). Mockup gallery is demoted to reference status, not a competing source-of-truth.
2. Shared primitives extracted from the 4 big mode Views: `SurfaceCard`, `SectionHeader`, `SegmentedControl` / `SegmentedTabs`, `StatusRail` / `StatusDot`, `MetricChip`, `QuoteBlock` / `EvidenceRow`, `KeyHint`. The large-view LOC reduction is tracked across PR 2-4+ rather than forced into one oversized refactor PR.
3. Popup shell reads as native-feeling utility: multi-layer shell shadow visible, mode switch is a real segmented control with sliding thumb, status rail surfaces backend health + processing state, keyboard shortcut hints visible at idle.
4. Compare hero, Product action cards, Topic detail header, PR Evidence ledger each have a defined billboard / reading / data / archive rhythm aligned with the two-layer language.
5. Each PR ships with DOM-behavior sanity tests. No PR lands on visual feel alone.
6. Architecture map updated: no new 🔴 / 🟡 introduced; if a UI surface is regression-locked by a new test, it is marked accordingly.

## PR Sequence

### PR 1 — Design Source Convergence (removal / refactor, zero visual delta)

**Goal:** Eliminate reviewer split. After this PR, every future UI question has exactly one source to consult.

- [x] Start from clean `origin/main` 0.2.1 in a new worktree (`codex/visual-reset-a-pr1`). The dirty desktop checkout is left untouched; the untracked visual-reset plan and 06-09 gallery are copied into the branch at their final tracked paths.
- [x] Add a `> Status: ARCHIVED — superseded by src/ui/tokens.ts on 2026-06-18` front-matter block to `design-system/DESIGN.md`, or move it to `docs/archive/design-system-cool-paper-DESIGN.md`. Either way: no agent should consult it as active spec.
- [x] Move `docs/mockups/2026-06-09-design-gallery.html` + PROGRESS.md to a clearly labelled `references/` subdir (e.g. `docs/mockups/references/`), and add a one-line note: "Reference — chosen direction is `tokens.ts` warm editorial + macOS utility shell. See `2026-06-18-visual-reset-A-plan.md`."
- [x] Append a short "Active design contract" section to `tokens.ts` header comment (or to a co-located `tokens.README.md`) declaring it the single source plus a pointer to the macOS-utility extension intent.
- [x] Update `docs/architecture/dlens-current-architecture-map.md` legend / preamble to reference the new contract location.
- [x] **DoD:** repo-wide grep for `design-system/DESIGN.md` returns only archived references; mockup gallery is in `references/`; `tokens.ts` is the only file describing live design decisions. Zero visual delta on `output/chrome-mv3` reload.

### PR 2 — Shared UI Primitives (refactor, near-zero visual delta)

**Goal:** Make subsequent visual changes cheap and local. Stop ad-hoc inline styling.

- [x] Identify duplicated layout patterns across `ProductSignalViews.tsx`, `CompareView.tsx`, `TopicDetailView.tsx`, `PrEvidenceViews.tsx`, and `LibraryView.tsx`.
- [x] Extract the foundation primitives into `src/ui/components.tsx`: `SurfaceCard`, `SectionHeader`, `StatusDot`, `StatusRail`, `QuoteBlock`, `EvidenceRow`, `KeyHint`. Existing `SegmentedTabs`, `MetricChip`, and `EvidenceMetricRow` remain the active segmented / metric primitives for this slice.
- [x] Migrate the smallest mode View first: `PrEvidenceViews.tsx` now uses `EvidenceRow`, `SectionHeader`, and `SurfaceCard` for ledger/header/summary surfaces.
- [ ] Continue large-view migration in PR 4+ as mode surfaces are reshaped. The original ≥ 30% LOC reduction is still a milestone-level target, not a PR 2 merge gate.
- [x] **DoD:** Boundary guard CI stays green. DOM tests confirm rendered primitive structure and PR Evidence ledger/source-link structure.
- [x] **DoD test:** Components tests cover primitive DOM hooks; PR Evidence view tests render representative VM input and assert section/header/actions/export surfaces remain present.

Post-merge LOC note (2026-06-18): PR 2 successfully added the primitive foundation, but it did not reduce the five large View files yet. Current counts after PR 4a:

- `ProductSignalViews.tsx`: 4100
- `CompareView.tsx`: 3193
- `TopicDetailView.tsx`: 2415
- `PrEvidenceViews.tsx`: 1144
- `LibraryView.tsx`: 1062

Treat primitive adoption / large-view LOC reduction as an explicit PR 4+ or later `refactor(ui)` item; do not treat the original ≥ 30% reduction target as satisfied.

### PR 3 — Shell + Interaction Reset (feature, first user-visible change)

**Goal:** Make the popup feel like a native macOS utility without changing the editorial content language.

- [x] Apply multi-layer shell shadow consistently — `tokens.shadow.popup` remains the popup outer container shadow with an inset highlight.
- [x] Replace mode tab bar with a real segmented control: sliding thumb under active mode, spring easing from `tokens.motion.easing.springSoft`, keyboard arrow-key navigation. Reference: design-gallery's `positionThumb()` pattern (now in `references/`).
- [x] Build a status rail at popup top: backend reachability + `BackendWorkUiState` projection + ready/total count are mounted in the masthead.
- [x] Add idle-state keyboard shortcut hints (Raycast pattern): masthead shows `Mode ⌘ 1-3` and `Command ⌘ K`.
- [ ] Refine `tokens.shadow.shell` and `tokens.shadow.raised` further only if PR 4 screenshots show visual noise; PR 3 uses existing elevation slots without creating new token values.
- [x] **DoD:** `output/chrome-mv3` build contains: shadowed shell, segmented control with sliding thumb, masthead status rail, and idle shortcut hints. Full Jason-profile Chrome walk remains a release / final milestone QA item.
- [x] **DoD test:** WorkspaceSwitcher DOM/JSDOM tests assert thumb index and ArrowRight navigation. StatusRail test asserts backend reachability/work hooks. WorkspaceShell smoke test asserts masthead status rail and idle key hints.

### PR 4+ — Mode-specific Surfaces (one PR per mode)

**Goal:** Each mode surface gets the visual rhythm it deserves, in the same content + shell language.

Suggested order (smallest blast radius first):

- [x] **PR 4a — PR Evidence ledger.** Strengthen italic-serif quote treatment, evidence row density, audit-style numbering. Already smallest View; safest to tune first. This slice keeps the existing source-link command surface and changes only the ledger render structure.
- [x] **PR 4b — Topic detail.** Section rhythm, topic-accent (sage) usage, audit report entry typography. This slice moves the visible Topic audit overview / themes / lanes / source-list rhythm onto `SurfaceCard` + `SectionHeader`, keeps source-row command wiring intact, and adds topic-accent CSS-var hooks for the sage rail.
- [ ] **PR 4c — Compare hero.** This is the billboard moment per the Visual Reset A contract and the archived `DESIGN.md` reference, and the most-visible UI surface. Tight serif headline, generous breathing room, stance cells with mode-accent left border. Single raised card per view (elevation discipline).
- [ ] **PR 4d — Product action cards / signal drawer.** Steel-blue product accent, action card lift on hover, signal readiness chip alignment.

Each PR 4x ships with:
- [ ] DOM test: critical layout assertions at 320px and 440px width
- [ ] Command-wiring test: `onCommand` dispatch fires expected typed command descriptor
- [ ] Readability sanity: at least one golden assertion on text-overflow / line-height / focus ring
- [ ] Mode accent contract test: switching mode swaps accent CSS vars correctly

PR 4a shipped with a DOM/readability test for the PR Evidence ledger audit rows: `data-pr-evidence-ledger-style="audit"`, audit numbers, shared quote block usage, italic quote typography, two-column row grid, and no wide inspection-table fallback. Command wiring is intentionally unchanged for this slice; the source-link surface remains covered by the existing PR Evidence source-link test.

PR 4b shipped with Topic Detail DOM/readability tests for `data-topic-detail-surface`, shared `SurfaceCard` / `SectionHeader` usage, topic accent CSS-var rails, audit source-list style, and no wide inspection-table fallback. It also adds a JSDOM command-wiring smoke test for the audit-report CTA. `TopicDetailView.tsx` is 2450 lines after this slice; deeper row-level inline style migration remains a PR 4+ adoption item, not a completed LOC-reduction claim.

## Out of Scope

- Pipeline Spine `ui.ready` live harness — already locked under 🟩 TRACE, not blocking.
- Threads DOM extraction (`CS`) and Playwright crawler (`CRAWLER`) — separate plans under `docs/handoff/2026-06-16-threads-extraction-crawler-*.md`.
- Domain seam cascade (`SEAM_PARTIAL`) — orthogonal storage work.
- Backend API / JOBS / read-model changes — own plan under `docs/handoff/2026-06-16-backend-api-jobs-implementations-plan.md`.
- Dark mode. Not in scope for Visual Reset A.
- Switching font stack away from Noto Sans/Serif TC + Instrument Serif. Possible later round; not this one.

## Open Questions

1. Should `tokens.ts` move to a `src/design/` directory once primitives are extracted, or stay where it is? Defer to PR 2 reviewer judgment.
2. Should the `effect.glassBlur: "none"` decision be revisited for the shell only (Raycast-style vibrancy)? Acceptable as a PR 3 stretch goal if measured perf cost is < 16ms per popup mount; otherwise defer.
3. Mockup gallery's macOS sliding-thumb code is JS-driven (`positionThumb()`). For PR 3, prefer a pure-CSS implementation if reachable; fall back to a small effect hook if not.

## Cross-Repo Impact

None. This plan touches only `dlens-product-latest`. Backend and shared docs are untouched.

## References

- `docs/architecture/dlens-current-architecture-map.md` — current 🟩 / 🟢 / 🟡 status
- `src/ui/tokens.ts` — active design contract (post-PR 1, the only one)
- `design-system/DESIGN.md` — archived reference, not active spec
- `docs/mockups/references/2026-06-09-design-gallery.html` — macOS utility shell reference, not active spec
- `docs/handoff/2026-06-12-pipeline-spine-plan.md` — sibling structural milestone (not blocking)
- `docs/memory/current-state.md` — current repo state and active design-source reminder
