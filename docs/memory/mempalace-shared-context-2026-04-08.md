---
name: mempalace_shared_context_2026_04_08
description: Shared Codex and Claude memory for DLens extension product direction, repo boundary, and update protocol
type: project
---

# DLens Extension Shared Context

Last updated: 2026-05-14

This note is the high-signal shared memory for Codex and Claude when working on `dlens-chrome-extension-v0`.

## Product Identity

- This repo is the production MV3 Chrome extension for capturing Threads posts, organizing them locally, queueing them to an optional ingest backend, comparing two ready posts with backend analysis plus extension-side brief summaries, and turning already-found Threads posts into PR evidence CSVs.
- The extension is extension-first, not SaaS-first.
- Local folders and UI state live in `chrome.storage.local`.
- The backend owns crawl jobs and canonical deterministic clustering / analysis.
- The extension owns user API keys, extension-side compare briefs, Product signal judgments, and PR criteria matching.

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
- `Product` mode is an insight-first workflow backed by `ProductContextCompiler` and `ProductSignalAnalyzer`.
- `PR Evidence` mode is a compact campaign evidence workflow for agency / PR operators, backed by `PrCampaign` and `PrEvidenceRow`.

## Layout Preference State As Of 2026-05-14

- Main contains the full layout sprint line:
  - `16ae177 feature: Product signal and synthesis layout variants (#2)`
  - `f52f73b feature: Compare result parallel and chapters layouts (#3)`
  - `2738d2f feature: Persist layout preferences (#4)`
- `ExtensionSettings.layoutPreferences` persists:
  - Product signal card layout: `verdict | marginalia`, default `marginalia`
  - Topic synthesis layout: `stack | console`, default `console`
  - Compare result layout: `reading | parallel | chapters`, default `parallel`
- `SettingsView` exposes all three controls; `InPageCollectorPopup` threads them into `ProductSignalViews`, `TopicDetailView`, and `CompareView`.
- Product signal card variants are Verdict and Marginalia; Marginalia is default, keeps `experimentHint` in the main TRY block, and keeps the right-rail TASK slot to the short `agentTaskSpec.taskTitle`.
- Marginalia visual hierarchy is intentionally simplified: eyebrow has no verdict, FOOTNOTES header is hidden, bottom AI experiment/judgment detail blocks are not rendered, and workflow evidence rows are flat label-stacked sections with dotted dividers.
- Product classification list rows no longer render relevance dots; `最新在前` only appears when the selected type group has at least two signals.
- Product Agent Brief uses reviewable `SignalReading` records; active review cards keep a compact Marginalia signal strip with verdict, reference category, and relevance bars.
- Topic synthesis uses deterministic `v2.work-signal-lens`; Stack is collapsible, Console is dense and always visible.
- Folder synthesis uses the same deterministic work-signal lens and renders as the Library Briefing card. Storage key: `dlens:v1:folder-synthesis`.
- Compare result variants are Reading, Parallel, and Chapters; Parallel is default and uses sticky A/B columns.
- Current verification: `452/452` tests, typecheck, build, and diff check passed from `/Users/tung/Desktop/dlens-product-latest`.
- Verified build artifact was copied to `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`; the source checkout there may still be dirty.

## Version Rule As Of 2026-05-14

- Current extension version: `0.1.11`.
- Keep version synchronized across `package.json`, `package-lock.json`, `wxt.config.ts` `manifest.version`, and `src/ui/version.ts` `BUILD_VERSION`.
- Chrome's extension page shows the built manifest version; the popup masthead shows `BUILD_VERSION`.
- Every user-visible update pushed to `main` should bump the version unless the user explicitly says not to.
- `tests/manifest-config.test.ts` locks package / manifest / UI version consistency.
- Product signal removal uses `signal/delete` and must persist to storage: remove from `dlens:v1:signals`, clear topic membership and affected topic synthesis, delete the matching product analysis, clear session folder synthesis, and refresh product state.
- Product mode `classification` is a valid product signal page. Keep it in `ALLOWED_PAGES.product`, `PRODUCT_SIGNAL_PAGES`, product width handling, and product data-effect routing so it does not fall back to `saved-signals`.
- Marginalia right rail should not duplicate main prose: `對到` shows only a short reference category, TASK shows `agentTaskSpec.taskTitle`, and `contentSummary` / `experimentHint` remain in the main column.

## PR Evidence Mode As Of 2026-05-07

- Folder mode: `pr-evidence`.
- Navigation: `PR Evidence / Collect / Settings`.
- V1 active campaign rule: one active campaign per PR Evidence session.
- Criteria: exactly six fixed ids `c1..c6`; labels can be AI-suggested and user-edited.
- Brief input: PDF/txt/md upload fills the campaign brief, extracts text-based PDFs, and surfaces detected core PR messages before criteria generation.
- Collect: creates `PrEvidenceRow`, never Topic `Signal`, never Product analysis, and never runs AI.
- Match: explicit batch action only; output is `✓ / blank`; parser accepts common AI response shapes and deterministic visible-keyword matching acts as a backstop.
- Export: CSV is primary and uses UTF-8 BOM; preview is read-only, capped to header + first 20 rows, and shows weak placeholder dashes for empty cells.
- Summary: client-ready Markdown PR audit memo with `Executive Read`, `Message Pull-Through`, `Interpretation`, `Evidence Highlights`, and `Data Limits`; AI may rewrite tone but must not invent reach, EAV, all-channel, or unsupported numeric claims.
- Summary export: UI supports `.md` and true `.docx` export through `src/ui/pr-summary-export.ts`.
- Views: extract from DOM metrics where available, infer from visible text such as `132 views`, and otherwise leave unavailable rather than estimating reach.
- Storage keys: `dlens:v1:pr-campaigns`, `dlens:v1:pr-evidence-rows`.
- Non-goals: no social listening, duplicate grouping, true reach, EAV, XLSX, detail inspector, or in-app spreadsheet editing.

## Current UI Direction As Of 2026-04-08

- Editorial popup shell with mode-aware rail; unavailable pages are unmounted, not disabled.
- Active modes are `archive`, `topic`, `product`, and `pr-evidence`.
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

- Split growing popup/background orchestration before adding digest/watch-mode work. `background.ts` is now 2341 lines and `useInPageCollectorAppState.ts` is now 1041 lines.
- Improve hover debounce and clear stale overlay state on SPA route changes.
- Add better honest loading states for crawl / analysis / compare waits.
- Keep compare cluster matching skepticism high because pairing is still rank-driven.
- Keep save/bookmark features lightweight until there is a real downstream destination.
- Chrome QA still needs to walk Product, PR Evidence, and layout preference flows from `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`, including Product Marginalia/Verdict, Topic Console/Stack, Compare Parallel/Chapters, PR PDF upload, criteria generation, matching, CSV export, and summary MD/DOCX export.

## Working Rules For Future Product Updates

- Start from `README.md`, `AGENTS.md`, and `docs/memory/current-state.md`.
- Treat `docs/handoff/2026-05-06-pr-evidence-mode-v1-brief.md` as the PR Evidence product-engineering record, with its 2026-05-07 implementation status as the current resolution.
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
