---
name: mempalace_shared_context_2026_04_08
description: Shared Codex and Claude memory for DLens extension product direction, repo boundary, and update protocol
type: project
---

# DLens Extension Shared Context

Last updated: 2026-04-08

This note is the high-signal shared memory for Codex and Claude when working on `dlens-chrome-extension-v0`.

## Product Identity

- This repo is the production MV3 Chrome extension for capturing Threads posts, organizing them locally, queueing them to an optional ingest backend, and comparing two ready posts with backend analysis plus extension-side brief summaries.
- The extension is extension-first, not SaaS-first.
- Local folders and UI state live in `chrome.storage.local`.
- The backend owns crawl jobs and canonical deterministic clustering / analysis.
- The extension owns user API keys and extension-side compare briefs.

## Hard Boundary

- Do not turn the extension into a second backend analysis runtime.
- `src/analysis/*` and `src/compare/*` are read-model / display adapters around backend snapshots.
- Canonical clustering, evidence generation, normalization, and merge quality belong in `dlens-ingest-core`.
- Background is the only network owner.
- Hover state stays in memory, not storage.

## Current Product Shape

- `Compare` is the fast evidence-first decision surface.
- `Technique / Evidence` is the slower deeper-reading page inside Compare.
- `Library` is evolving toward a casebook, not a folder-first tray.
- `Collect` is a low-friction capture surface, not an analysis page.
- `Settings` should behave like a narrow runtime utility drawer even while still page-backed.

## Current UI Direction As Of 2026-04-08

- Compare-first popup shell with mode rail: `Compare / Library / Collect`, plus separate Settings utility action.
- Library preparation-desk pass is active: prioritize `ready`, `near-ready`, and `in-progress` preparation zones above pending inventory.
- Collect capture-card pass is active: preview, keyboard hints, and collect entry/exit live in one surface.
- Settings drawer grammar is active: runtime-focused connection + key groups, lighter than a full app page.
- Compare remains evidence-first: hero -> navigator -> selected cluster dock -> engagement/comments as support sections.
- Compare keeps sticky section rail and deeper-reading jump.
- Technique cards are Chinese-first, with English alias secondary.
- Shared audience evidence metrics use a compact four-icon row.

## Trust And Interpretation Rules

- User-facing claims must stay sparse and grounded.
- Do not overstate soft inference labels such as alignment, momentum, or rhetorical technique.
- Near-duplicate cluster splits are primarily a backend merge/pairing quality problem.
- Evidence quality, reply-tree use, cluster merge, and semantic cluster pairing are backend-dependent improvements.
- The extension may improve presentation and trust, but should not fake new semantics.

## Current Known Priorities

- Reduce popup-shell orchestration still concentrated in `src/ui/InPageCollectorApp.tsx`.
- Improve hover debounce and clear stale overlay state on SPA route changes.
- Add better honest loading states for crawl / analysis / compare waits.
- Keep compare cluster matching skepticism high because pairing is still rank-driven.
- Keep save/bookmark features lightweight until there is a real downstream destination.

## Working Rules For Future Product Updates

- Start from `README.md`, `AGENTS.md`, and `docs/memory/current-state.md`.
- Treat `docs/product/2026-04-03-compare-working-plan.md` as the execution split between extension-only work and backend-dependent work.
- Treat `docs/product/2026-04-03-compare-frontend-brief.md` as presentation-only guidance.
- Treat `docs/product/2026-04-04-two-page-product-plan.md` as the restored product-shape source of truth.
- If a change touches code, update `README.md` and `AGENTS.md`.
- Before claiming success, run:
  - `npm run typecheck`
  - `npx tsx --test tests/*.test.ts tests/*.test.tsx`
  - `npm run build`

## Shared Memory Intent

- Codex and Claude should use this note as the concise starting memory, then search the wing for deeper docs when needed.
- New product-direction decisions should be added as fresh dated memory notes instead of overwriting history.
- Prefer adding high-signal notes about decisions, boundaries, and accepted tradeoffs over dumping long implementation transcripts.
