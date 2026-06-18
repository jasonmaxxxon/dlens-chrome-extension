# Visual Reset A — UI Milestone Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan PR-by-PR. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materialise the long-parked "視覺重置 A" milestone now that the VM boundary, TRACE, SEAM_GUARD, RECONCILE, INVALIDATE, BOUNDARY, and MIGRATE walls are 🟩 locked. Convert three competing design directions in-repo into one auditable design contract, then reskin in layers without opening a second design system.

**Architecture:** Two-layer design language. **Content language** stays `src/ui/tokens.ts` (warm-paper editorial — Instrument Serif, indigo+sage+rose mode accents, Noto Sans/Serif TC body). **Frame/interaction language** absorbs macOS utility patterns (multi-layer shadow, sliding-thumb segmented control, status rail, keyboard hint, shell motion) directly into existing tokens — not into a parallel system. Mockup gallery becomes reference, not a fork.

**Tech Stack:** `dlens-product-latest` TypeScript / MV3 / React / WXT / Node test runner; existing TRACE, RECONCILE, INVALIDATE, BOUNDARY, SEAM_GUARD, MIGRATE guards.

---

Date: 2026-06-18
Depends on: `docs/architecture/dlens-current-architecture-map.md` (no 🔴 nodes; 6 walls 🟩), archived `design-system/DESIGN.md`, and `docs/mockups/references/2026-06-09-design-gallery-PROGRESS.md`.
Product baseline: `origin/main` at `0.2.1` (889 passed / 5 skipped). Desktop checkout is 5 commits behind — sync before starting.
Status: PR 1 complete in `codex/visual-reset-a-pr1`; PR 2-4 pending.

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
2. Shared primitives extracted from the 4 big mode Views: `Card`, `SectionHeader`, `SegmentedControl`, `StatusRail` / `StatusDot`, `MetricChip`, `QuoteBlock` / `EvidenceRow`. Total Views LOC shrinks by ≥ 30% (target floor — actual ratio depends on duplication density).
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

- [ ] Identify duplicated layout patterns across `ProductSignalViews.tsx` (4073 lines), `CompareView.tsx` (3193 lines), `TopicDetailView.tsx` (2415 lines), `PrEvidenceViews.tsx` (1122 lines), `LibraryView.tsx` (1062 lines).
- [ ] Extract into `src/ui/components.tsx` (or a new `src/ui/primitives/` if it gets crowded): `Card`, `SectionHeader`, `SegmentedControl`, `StatusDot`, `StatusRail`, `MetricChip`, `QuoteBlock`, `EvidenceRow`, `KeyHint`. Each consumes `tokens.ts` + `modeThemes` only — no new styling values.
- [ ] Migrate one mode View at a time. Order: `PrEvidenceViews.tsx` (smallest, lowest risk) → `TopicDetailView.tsx` → `CompareView.tsx` → `ProductSignalViews.tsx`.
- [ ] **DoD:** Total LOC across the 5 big Views drops by ≥ 30%. Boundary guard CI stays green. Snapshot tests (or new DOM tests, see below) confirm rendered structure unchanged.
- [ ] **DoD test:** Each migrated View has a smoke test that renders it with representative VM input and asserts: (a) section headers present, (b) primary actions wired to expected `onCommand` callback, (c) no layout overflow at 320px width.

### PR 3 — Shell + Interaction Reset (feature, first user-visible change)

**Goal:** Make the popup feel like a native macOS utility without changing the editorial content language.

- [ ] Apply multi-layer shell shadow consistently — `tokens.shadow.popup` already exists; audit `SidepanelApp.tsx` and ensure it is the outer container's shadow. Add subtle inset highlight for "lit from above" effect if not already present.
- [ ] Replace mode tab bar with a real segmented control: sliding-thumb under active mode, spring easing from `tokens.motion.easing.spring`, keyboard arrow-key navigation. Reference: design-gallery's `positionThumb()` pattern (now in `references/`).
- [ ] Build a status rail at popup top: backend health dot (already shipped in 0.2.0), processing strip integration, lag indicator if backend retry / expired-running is in play (read from existing `BackendWorkUiState` projection).
- [ ] Add idle-state keyboard shortcut hints (Raycast pattern, e.g. footer `⌘K` / `⌘1-4` / `↵`).
- [ ] Refine `tokens.shadow.shell` and `tokens.shadow.raised` to fit shell+card pairing without visual noise. Document the elevation model in the `tokens.ts` header.
- [ ] **DoD:** `output/chrome-mv3` reload shows: shadowed shell, working segmented control with sliding thumb, status rail visible at top, shortcut hints visible at idle, all four mode switches respect new chrome.
- [ ] **DoD test:** SegmentedControl DOM test asserts thumb position update on mode change, keyboard arrow-key navigation, focus-visible ring. StatusRail test asserts dot color matches `BackendWorkUiState`. SidepanelApp smoke test asserts shell shadow class/style is applied.

### PR 4+ — Mode-specific Surfaces (one PR per mode)

**Goal:** Each mode surface gets the visual rhythm it deserves, in the same content + shell language.

Suggested order (smallest blast radius first):

- [ ] **PR 4a — PR Evidence ledger.** Strengthen italic-serif quote treatment, evidence row density, audit-style numbering. Already smallest View; safest to tune first.
- [ ] **PR 4b — Topic detail.** Section rhythm, topic-accent (sage) usage, audit report entry typography.
- [ ] **PR 4c — Compare hero.** This is the billboard moment per the Visual Reset A contract and the archived `DESIGN.md` reference, and the most-visible UI surface. Tight serif headline, generous breathing room, stance cells with mode-accent left border. Single raised card per view (elevation discipline).
- [ ] **PR 4d — Product action cards / signal drawer.** Steel-blue product accent, action card lift on hover, signal readiness chip alignment.

Each PR 4x ships with:
- [ ] DOM test: critical layout assertions at 320px and 440px width
- [ ] Command-wiring test: `onCommand` dispatch fires expected typed command descriptor
- [ ] Readability sanity: at least one golden assertion on text-overflow / line-height / focus ring
- [ ] Mode accent contract test: switching mode swaps accent CSS vars correctly

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
