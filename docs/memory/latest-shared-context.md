---
name: latest_shared_context
description: Shared Codex and Claude memory for DLens extension product direction, repo boundary, and update protocol
type: project
---

# DLens Extension Shared Context

Last updated: 2026-07-09

This file is the current shared context. Keep this filename stable and update
the contents in place whenever an automated or manual handoff refresh makes it
the latest issue.

This note is the high-signal shared memory for Codex and Claude when working on `dlens-product-latest`.

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

## Architecture Map Entry Rule

- Read `docs/architecture/dlens-current-architecture-map.md` before non-trivial work. It is the live architecture/status map for Codex / ChatGPT / Claude handoff.
- Treat 🟢 as built, not locked. Only 🟩 means a failing test or boundary guard catches the regression.
- If a change touches a boundary, data flow, async path, storage seam, backend job path, LLM call path, or ViewModel/View responsibility, update the map colors in the same PR.
- Do not let architecture hardening block analysis credibility work: Track A hardening and Track B backend OP/reply read-model work proceed in parallel.
- C-Backend B1 landed in `dlens-ingest-core` PR #2 (`896373b`), extension B2 landed through PR #32-#34 (`23d36d1`), backend B3 API typing landed in `dlens-ingest-core` PR #3 (`116e18c`), and B4 golden fixtures landed in backend PR #4 (`6d0cb70`) plus extension PR #36 (`282a3ea`) on 2026-06-15. `READMODEL_BACKEND` is now 🟢: backend duplicate-root, OP-continuation-chain, `reply_edges` / `orphan_replies`, and seven thread-structure cases are regression-tested; extension projection trusts that contract and preserves OP-reply/orphan metadata; API `thread_read_model` validates as `ThreadReadModel`.
- `BOUNDARY` is 🟩 because View modules cannot import `sendExtensionMessage` / call `Date.now()` / `Math.random()` / `performance.now()` / `chrome.storage.local.*` / `chrome.runtime.sendMessage`, ViewModels cannot import `chrome.*` / `fetch` / DOM / `File` / `Blob` / `FormData` / React, and `npm run boundary:guard` enforces both walls in CI at zero allowlisted violations.
- `API` / `JOBS` are 🟢 (no longer 🟡) as of 2026-06-16. `/worker/status` returns backlog / retry / expired-running / dead jobs + pending/running/failed analyses + earliest_retry_at / next_due_at / last_drain_error. Extension projects via `projectBackendWorkStatus()` into a single `BackendWorkUiState`; views consume already-localized recovery copy from `resolveBackendWorkCopy()`; `reconcileSessionItem` promotes failed analysis into `lastErrorKind="analysis_failed"`. A five-case shared negative-fixture set (`retry-scheduled-crawl` / `expired-running-lease` / `missing-analysis-after-crawl-success` / `failed-analysis-after-crawl-success` / `terminal-dead-crawl`) replays both layers offline. Not 🟩 until a live-failure guard catches the visible recovery regression class.

## Current Product Shape

- `Compare` is the fast evidence-first decision surface.
- `Technique / Evidence` is the slower deeper-reading page inside Compare.
- `Library` is evolving toward a casebook, not a folder-first tray.
- `Collect` is a low-friction capture surface, not an analysis page.
- `Settings` should behave like a narrow runtime utility drawer even while still page-backed.
- `Product` mode is an insight-first workflow backed by `ProductContextCompiler` and `ProductSignalAnalyzer`.
- Product Saved Signals is the current Product landing surface. Classification visibility is merged into Saved Signals through filter tabs and a compact classification summary; `classification` remains an allowed internal/deep-link product page, but is not rail-visible.
- `PR Evidence` mode is a compact campaign evidence workflow for agency / PR operators, backed by `PrCampaign` and `PrEvidenceRow`.
- 0.3.0 is the Visual Reset A user-visible release: popup shell, PR Evidence ledger, Topic detail, Compare hero, and Product action marquee surfaces now follow the `src/ui/tokens.ts` warm-paper editorial contract plus native-feeling utility shell affordances. This did not change storage, backend, ViewModel, command target, classifier, content-script, or Signal Packet contracts.
- 0.3.13 is a Collect / Topic chrome cleanup release: Topic Collect's 未分流 queue now has per-row and bulk delete controls wired to `signal/delete`, and the redundant Topic top selector strip is removed. Topic destination selection lives in the floating collect preview card, and topic creation stays in the 議題 page, so Topic/Product/PR top chrome is consistent.
- 0.3.14 is a Topic / Product runtime repair release: the 議題 page create action now opens the real create-topic flow after the Topic top strip removal, WorkspaceShell hides stale mode bodies while mode switches are pending, and Settings save applies an immediate effective settings snapshot so Product analysis gating sees the just-saved provider, API-key presence, and ProductContext before the background snapshot catches up.
- 0.3.16 is a Topic Audit producer release: `CommentShardReading` folds into the existing memo bundle, P0.5 shard reading runs through the existing LLM seam before P1, P2/P4/P5 consume shard distillate + cited quotes instead of full raw packets, and P4 now produces structured `reactionCoverage` / `reactionPatterns` for the already-shipped 群眾反應 UI.
- 0.3.18 is a Topic Audit reader release: Signal Atlas L0 replaces the expanded audit dump with a glass hero, denominator-backed KPI ledger, reaction atlas, cross-post narrative strength, counts-only source footer, one unified right-side drawer, and L3 full-list expansion backed by persisted shard readings when possible.
- 0.3.19 is a Signal Atlas L0 UI fix: ready-state Topic Audit now removes the duplicate overview header while keeping only `開啟審查報告 ↗ 新分頁` and `重新生成`; the audit detail drawer is frame-contained in the in-page extension shell instead of sizing against the Threads viewport.
- `VIEW` remains 🟢, not 🟩. The four marquee surfaces are DOM-test-locked; row-level primitive adoption / large-view LOC reduction remains a follow-up `refactor(ui)` track.

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
- Product Action route restores the 0.1.15 `SignalReadingReviewWorkspace` / `READING REVIEW` UI only when the current saved signals have matching `SignalReading` rows; review callbacks alone must not switch the route away from the Marginalia action cards. It must still not render the removed Agent export / 原文優先 panel.
- Product-only cache reset is available from Settings through `product/clear-cache`; it clears derived Product analyses, agent-task feedback, SignalReading rows, and compiled ProductContext while preserving saved signals, sessions, topics, archive data, and PR evidence.
- ProductSignalAnalyzer prompt/cache version is `v17`; strict provider output no longer asks for legacy recipe fields (`copy_recipe_markdown`, `workflow_stack`, `copyable_template`). Product Action should show reusable evidence patterns plus agent-brief context, not a long how-to/tutorial recipe; the UI ignores legacy recipe fields if old records or provider responses still contain them.
- Collect preview metrics use shared icon chips in both the popup preview and hover overlay. Product pending saved-signal cards follow Topic-style matte card grammar with compact meta and clamped preview text.
- Product signal card variants are Verdict and Marginalia; Marginalia is default, keeps `experimentHint` in the main TRY block, and keeps the right-rail TASK slot to the short `agentTaskSpec.taskTitle`.
- Workspace mode switches reserve the ProcessingStrip slot, reset scroll with `useLayoutEffect`, and crossfade only the mode frame. This keeps Topic/Product/PR data-loaded transitions from jumping while avoiding extra animation on same-mode tabs.
- Marginalia visual hierarchy is intentionally simplified: eyebrow has no verdict, FOOTNOTES header is hidden, bottom AI experiment/judgment detail blocks are not rendered, and workflow evidence rows are flat label-stacked sections with dotted dividers.
- Product classification list rows no longer render relevance dots; `最新在前` only appears when the selected type group has at least two signals.
- Product rail pages should be `saved-signals`, `actionable-filter`, and `collect`. If live Chrome still shows a separate `分類` rail item, check for stale `output/chrome-mv3` bundled JS or an unreloaded unpacked extension before changing source.
- Product Agent Brief uses reviewable `SignalReading` records; active review cards keep a compact Marginalia signal strip with verdict, reference category, and relevance bars.
- Topic synthesis uses deterministic `v3.generic-keyword-lens`; Stack is collapsible, Console is dense and always visible.
- Folder synthesis uses deterministic `v3.generic-keyword-lens` and renders as the Library Briefing card. Storage key: `dlens:v1:folder-synthesis`.
- Compare result variants are Reading, Parallel, and Chapters; Parallel is default and uses sticky A/B columns.
- Runtime tab targeting now treats the content-script sender tab as authoritative for `state/get-active-tab` and collect start/cancel; do not route those calls through another focused Chrome tab.
- Latest 0.3.0 release verification: `909 passed / 5 skipped`, typecheck, storage seam guard, migration fixture guard, boundary guard, `qa:harness:fixture`, build, and diff check passed locally.
- TRACE full-live verification is locked by `docs/qa/assets/2026-06-13/full-live-backend-llm/live-trace-full-hover-save-queue-analysis.json`; `npm run qa:harness:fixture` requires hover.detected → ui.ready, including backend.request and llm.call phases.
- Verified build artifact was copied to `output/chrome-mv3`; the source checkout there may still be dirty.

## Version Rule As Of 2026-07-07

- Current source version in the active worktree: `0.3.19`.
- Latest local verification on 2026-07-09: `npm run typecheck`, `npm run boundary:guard`, `npm run storage:seam-guard`, `npx tsx --test tests/*.test.ts tests/*.test.tsx` (`994 passed / 5 skipped`, 999 tests), `npm run build`, and `git diff --check` passed.
- Built `output/chrome-mv3/manifest.json` reports `version: "0.3.19"` after the 2026-07-09 build.
- Current engineering branch: `codex/atlas-l0-polish`.
- `docs/ENGINEERING_PLAN.md` §2 N1-N5 is complete: React ErrorBoundary, Settings storage usage, `mutateSnapshot` seam, behavioral storage contracts, and code-review checklist.
- §3 remains a deferred trigger pool, not a backlog drain queue.
- Motion Layer v2 is pure CSS/token-based and shared across modes; content-script CSS is scoped under `data-dlens-control="true"` and respects `prefers-reduced-motion`.
- Motion Layer v2 adds Apple Music-style verdict filter sliding plates, stronger primary CTA/card deltas, loading shimmer, copy feedback, and filed-reading compose highlights without adding a motion dependency.
- Signal Reading review text now uses a lighter lead-title + summary rhythm, and Product rail / candidate-action navigation can trigger on pointerdown to avoid live Chrome/Threads click swallowing.
- SignalReading prompt version is now `v9`; representative comments cap at 15 and include analyzer refs plus top-liked replies.
- Compare brief prompt version is now `v8`; `whyItMatters` should be one short consequence sentence, not a mini-essay.
- Keep version synchronized across `package.json`, `package-lock.json`, `wxt.config.ts` `manifest.version`, `src/ui/version.ts` `BUILD_VERSION`, and `tests/manifest-config.test.ts` expected version string.
- Chrome's extension page shows the built manifest version; the popup masthead shows `BUILD_VERSION`.
- Every user-visible update pushed to `main` should bump the version unless the user explicitly says not to.
- `tests/manifest-config.test.ts` locks package / manifest / UI version consistency.
- Product signal removal uses `signal/delete` and must persist to storage: remove from `dlens:v1:signals`, clear topic membership and affected topic synthesis, delete the matching product analysis, clear session folder synthesis, and refresh product state.
- Topic Collect 未分流 deletion also uses `signal/delete`; row and bulk controls live in `CollectView` and should be visible only when `onSignalDeleted` is wired from the app shell.
- Product mode `classification` is a valid product signal page for routing/data effects. Keep it in `ALLOWED_PAGES.product`, `PRODUCT_SIGNAL_PAGES`, product width handling, and product data-effect routing so deep links do not fall back to `saved-signals`; keep it out of the Product rail because classification is summarized inside Saved Signals.
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

- C-Backend read-model lever is complete at 🟢: B1 backend builder fixes, B2 extension projection alignment, B3 backend API typing, and B4 shared golden fixtures are merged. Future OP/reply changes must update the seven-case backend builder fixture and extension projection/evidence fixture together.
- Split growing popup/background orchestration before adding digest/watch-mode work. `entrypoints/background.ts` is now 3839 lines and `src/ui/useInPageCollectorAppState.ts` is now 2542 lines.
- Pipeline spine status: PR #21 merged the typed trace event stream, PR #22 merged requestId trace correlation, PR #23 merged terminal VM `ui.ready`, PR #24 merged the typed trace summarizer + live harness gate, PR #25 started `RECONCILE` UI stale-result ignore, PR #28 added the first committed `ui.ready` fixture CI gate, PR #26 guards background snapshot writes for `session/refresh-all` plus `session/queue-items-and-start-processing`, PR #27 guards known stale-sensitive direct storage-key lanes for Folder synthesis, Product signal/reading writes, and PR criteria/advanced-metrics writes, PR #29 locks full backend/direct LLM trace phases with a Jason-profile fixture gate, and PR #30 added the first seam guard. The SEAM_GUARD zero-bypass closure moves the legacy raw writes behind seam-owned helpers; CI now runs `npm run storage:seam-guard`, which reports 0 allowlisted bypasses and blocks new production `chrome.storage.local.{set,remove,clear}` writes. PR #40 locks session queue/refresh terminal-stale snapshot lanes, PR #41 locks Product/Folder/PR direct-key terminal behavior, and PR #42 closes Topic Audit, Judgment, and Compare UI adoption lanes. PR #43 locks per-lane storage-seam write → `state/updated` broadcast count, PR #44 locks controller adoption plus Product hydrate gate coalescing, PR #45 locks Product / Topic / PR hydrate terminal trace parity, PR #46 locks View wall violations, and PR #47 locks ViewModel wall violations behind aggregate `npm run boundary:guard`. PR #49 adds the storage migration registry primitive, PR #50 registers the first `dlens:v0:global-state` and `dlens:v1:product-context` v0→v1 migrations + wires `runMigrationsFor` into the live load paths, and PR #51 adds `npm run storage:migrate-fixtures` to enforce fixture coverage in CI. `TRACE` is 🟩, `SEAM_GUARD` is 🟩, `RECONCILE` is 🟩 because scoped late backend/LLM/UI async responses are regression-locked against stale storage writes, stale `state/updated` broadcasts, and stale UI adoption, `INVALIDATE` is 🟩 because storage-seam writes broadcast `state/updated` exactly once per lane, the controller adopts well-formed snapshots and ignores ill-formed ones, and every `popup.{product,topic,pr}.hydrate.request` is paired with exactly one terminal event, so loading flags cannot stick, `BOUNDARY` is 🟩 because `npm run boundary:guard` enforces View / ViewModel wall scanners in CI at zero allowlisted violations, and `MIGRATE` is 🟩 because every storage shape change is recorded in `src/state/storage-schema.ts`, every migration entry has a legacy fixture that replays through the registry into the current shape, and `npm run storage:migrate-fixtures` enforces fixture coverage in CI at zero unregistered migrations.
- Improve hover debounce and clear stale overlay state on SPA route changes.
- Add better honest loading states for crawl / analysis / compare waits.
- Keep compare cluster matching skepticism high because pairing is still rank-driven.
- Keep save/bookmark features lightweight until there is a real downstream destination.
- Chrome QA still needs to walk Product and PR Evidence flows from `output/chrome-mv3` in Jason's `Default` Chrome profile (`jason@brandonproject.co`), which is the local profile with DLens installed. Include Product recovered-analysis/action views, Topic Console/Stack, Compare Parallel/Chapters, PR PDF upload, criteria generation, matching, CSV export, and summary MD/DOCX export. Open DLens through the real extension action or the content-script in-page launcher on a real Threads page; do not count a direct `chrome-extension://.../sidepanel.html` tab or a temporary Chrome profile as user-visible QA.

## Working Rules For Future Product Updates

- Start from `docs/architecture/dlens-current-architecture-map.md`, `README.md`, `AGENTS.md`, and `docs/memory/current-state.md`.
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
