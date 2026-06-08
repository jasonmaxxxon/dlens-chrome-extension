---
name: latest_shared_context
description: Shared Codex and Claude memory for DLens extension product direction, repo boundary, and update protocol
type: project
---

# DLens Extension Shared Context

Last updated: 2026-05-28

This file is the current shared context. Keep this filename stable and update
the contents in place whenever an automated or manual handoff refresh makes it
the latest issue.

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
- `InPageCollectorPopup` still threads persisted layout values into `ProductSignalViews`, `TopicDetailView`, and `CompareView`.
- `SettingsView` no longer exposes the Layout preference card; the visible Settings drawer is limited to folder mode, connection, storage usage, API keys, and ProductProfile.
- Workspace headers, Settings groups, Product recovered-analysis rows, and the PR/Product surfaces now follow the Topic-style serif title weight, 20px card radius, matte shadow, and compact duplicate-free row grammar.
- Product Action route restores the 0.1.15 `SignalReadingReviewWorkspace` / `READING REVIEW` UI when saved signals have readings or review callbacks; it must still not render the removed Agent export / 原文優先 panel.
- Product-only cache reset is available from Settings through `product/clear-cache`; it clears derived Product analyses, agent-task feedback, SignalReading rows, and compiled ProductContext while preserving saved signals, sessions, topics, archive data, and PR evidence.
- ProductSignalAnalyzer prompt/cache version is `v17`; strict provider output no longer asks for legacy recipe fields (`copy_recipe_markdown`, `workflow_stack`, `copyable_template`). Product Action should show reusable evidence patterns plus agent-brief context, not a long how-to/tutorial recipe; the UI ignores legacy recipe fields if old records or provider responses still contain them.
- Collect preview metrics use shared icon chips in both the popup preview and hover overlay. Product pending saved-signal cards follow Topic-style matte card grammar with compact meta and clamped preview text.
- Product signal card variants are Verdict and Marginalia; Marginalia is default, keeps `experimentHint` in the main TRY block, and keeps the right-rail TASK slot to the short `agentTaskSpec.taskTitle`.
- Workspace mode switches reserve the ProcessingStrip slot, reset scroll with `useLayoutEffect`, and crossfade only the mode frame. This keeps Topic/Product/PR data-loaded transitions from jumping while avoiding extra animation on same-mode tabs.
- Marginalia visual hierarchy is intentionally simplified: eyebrow has no verdict, FOOTNOTES header is hidden, bottom AI experiment/judgment detail blocks are not rendered, and workflow evidence rows are flat label-stacked sections with dotted dividers.
- Product classification list rows no longer render relevance dots; `最新在前` only appears when the selected type group has at least two signals.
- Product Agent Brief uses reviewable `SignalReading` records; active review cards keep a compact Marginalia signal strip with verdict, reference category, and relevance bars.
- Topic synthesis uses deterministic `v3.generic-keyword-lens`; Stack is collapsible, Console is dense and always visible.
- Folder synthesis uses the same deterministic work-signal lens and renders as the Library Briefing card. Storage key: `dlens:v1:folder-synthesis`.
- Compare result variants are Reading, Parallel, and Chapters; Parallel is default and uses sticky A/B columns.
- Current verification: `615/615` tests, typecheck, build, and diff check passed from `dlens-product-latest`.
- Verified build artifact was copied to `dlens-product-latest/output/chrome-mv3`; the source checkout there may still be dirty.

## Version Rule As Of 2026-05-28

- Current extension version: `0.1.27`.
- Current verification: `615/615` tests, typecheck, build, and diff check passed from `dlens-product-latest`.
- Current engineering branch: `codex/pr-visible-metrics`.
- `docs/ENGINEERING_PLAN.md` §2 N1-N5 is complete: React ErrorBoundary, Settings storage usage, `mutateSnapshot` seam, behavioral storage contracts, and code-review checklist.
- §3 remains a deferred trigger pool, not a backlog drain queue.
- Motion Layer v2 is pure CSS/token-based and shared across modes; content-script CSS is scoped under `data-dlens-control="true"` and respects `prefers-reduced-motion`.
- Motion Layer v2 adds Apple Music-style verdict filter sliding plates, stronger primary CTA/card deltas, loading shimmer, copy feedback, and filed-reading compose highlights without adding a motion dependency.
- Signal Reading review text now uses a lighter lead-title + summary rhythm, and Product rail / candidate-action navigation can trigger on pointerdown to avoid live Chrome/Threads click swallowing.
- SignalReading prompt version is now `v9`; representative comments cap at 15 and include analyzer refs plus top-liked replies.
- Compare brief prompt version is now `v8`; `whyItMatters` should be one short consequence sentence, not a mini-essay.
- Keep version synchronized across `package.json`, `package-lock.json`, `wxt.config.ts` `manifest.version`, and `src/ui/version.ts` `BUILD_VERSION`.
- Chrome's extension page shows the built manifest version; the popup masthead shows `BUILD_VERSION`.
- Every user-visible update pushed to `main` should bump the version unless the user explicitly says not to.
- `tests/manifest-config.test.ts` locks package / manifest / UI version consistency.
- Product signal removal uses `signal/delete` and must persist to storage: remove from `dlens:v1:signals`, clear topic membership and affected topic synthesis, delete the matching product analysis, clear session folder synthesis, and refresh product state.
- Product mode `classification` is a valid product signal page. Keep it in `ALLOWED_PAGES.product`, `PRODUCT_SIGNAL_PAGES`, product width handling, and product data-effect routing so it does not fall back to `saved-signals`.
- Marginalia right rail should not duplicate main prose: `對到` shows only a short reference category, TASK shows `agentTaskSpec.taskTitle`, and `contentSummary` / `experimentHint` remain in the main column.

## Signal Packet Export As Of 2026-05-20

- `src/compare/signal-packet.ts` builds `DLensSignalPacket` records from storage and read models.
- `src/compare/signal-packet-export.ts` renders HTML, Markdown, and JSONL.
- Background message seams: `signal-packet/get`, `signal-packet/index`, `signal-packet/export`.
- Packet version is `v3`; prefer additive JSONL semantic clarifications over `packetVersion` bumps unless existing reader semantics break.
- HTML is for human reading; JSONL is for agent handoff. Do not dump raw `decisionTrace` into HTML.
- Known next fixes: rename/limit HTML cited evidence, add provenance strip, add `citedInReadingRefs`, clarify latest vs superseded readings, and investigate root `source.pageUrl` fallback before changing capture code.

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

- Split growing popup/background orchestration before adding digest/watch-mode work. `background.ts` is now 2668 lines and `useInPageCollectorAppState.ts` is now 1380 lines.
- Improve hover debounce and clear stale overlay state on SPA route changes.
- Add better honest loading states for crawl / analysis / compare waits.
- Keep compare cluster matching skepticism high because pairing is still rank-driven.
- Keep save/bookmark features lightweight until there is a real downstream destination.
- Chrome QA still needs to walk Product and PR Evidence flows from `dlens-product-latest/output/chrome-mv3`, including Product recovered-analysis/action views, Topic Console/Stack, Compare Parallel/Chapters, PR PDF upload, criteria generation, matching, CSV export, and summary MD/DOCX export.

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
