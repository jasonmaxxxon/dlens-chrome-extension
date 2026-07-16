---
name: latest_shared_context
description: Shared Codex and Claude memory for DLens extension product direction, repo boundary, and update protocol
type: project
---

# DLens Extension Shared Context

Last updated: 2026-07-13

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
- `PR Evidence` mode is a dual-lens campaign workflow for agency / PR operators: a current-only narrative read plus the existing evidence matching/export surface, backed by `PrCampaign`, `PrEvidenceRow`, and `PrNarrativeRead`.
- 0.3.0 is the Visual Reset A user-visible release: popup shell, PR Evidence ledger, Topic detail, Compare hero, and Product action marquee surfaces now follow the `src/ui/tokens.ts` warm-paper editorial contract plus native-feeling utility shell affordances. This did not change storage, backend, ViewModel, command target, classifier, content-script, or Signal Packet contracts.
- 0.3.13 is a Collect / Topic chrome cleanup release: Topic Collect's 未分流 queue now has per-row and bulk delete controls wired to `signal/delete`, and the redundant Topic top selector strip is removed. Topic destination selection lives in the floating collect preview card, and topic creation stays in the 議題 page, so Topic/Product/PR top chrome is consistent.
- 0.3.14 is a Topic / Product runtime repair release: the 議題 page create action now opens the real create-topic flow after the Topic top strip removal, WorkspaceShell hides stale mode bodies while mode switches are pending, and Settings save applies an immediate effective settings snapshot so Product analysis gating sees the just-saved provider, API-key presence, and ProductContext before the background snapshot catches up.
- 0.3.16 is a Topic Audit producer release: `CommentShardReading` folds into the existing memo bundle, P0.5 shard reading runs through the existing LLM seam before P1, P2/P4/P5 consume shard distillate + cited quotes instead of full raw packets, and P4 now produces structured `reactionCoverage` / `reactionPatterns` for the already-shipped 群眾反應 UI.
- 0.3.18 is a Topic Audit reader release: Signal Atlas L0 replaces the expanded audit dump with a glass hero, denominator-backed KPI ledger, reaction atlas, cross-post narrative strength, counts-only source footer, one unified right-side drawer, and L3 full-list expansion backed by persisted shard readings when possible.
- 0.3.19 is a Signal Atlas L0 UI fix: ready-state Topic Audit now removes the duplicate overview header while keeping only `開啟審查報告 ↗ 新分頁` and `重新生成`; the audit detail drawer is frame-contained in the in-page extension shell instead of sizing against the Threads viewport.
- 0.3.22 makes the Variant-D-derived glass material the shared Topic/Product/PR workspace shell across popup canvas, masthead, rail, and main frame. Topic Audit now keeps the last Atlas mounted through running/stale/failed transitions, uses the same glass frame for the first run, removes memo-derived `Pn/6` progress from detail and list surfaces, and names captured/read/usable counts separately from overlapping pattern assignments.
- 0.3.27 restores the outer popup and border-box scroll mask to Variant D's 28px frame radius. Keep the dedicated bottom spacer, responsive viewport bounds, and matching frame/viewport radius together so the last Atlas card has breathing room and the main-frame divider visibly turns through the bottom glass curve.
- 0.3.34 makes Topic Audit P1 a bounded post reducer. P0.5 persists optional shard prose; full and single-signal paths checkpoint missing shard reads before P1; P1 sees capped OP/author/gap context plus shard prose and structured hints, never the raw audience pool, and hard-fails above 24,000 characters. This is not cross-run incremental caching or NarrativeState, and the hard ceiling does not yet cover P0.5/P2-P6.
- 0.3.35 adds the longitudinal Topic layer: stable evidence anchors; per-signal content/reference cache identity; append-only P0.5/P1 reuse; a bounded 4096-character `NarrativeState`; and a 24-episode first/advance/rebase ledger rendered as the in-Atlas `本次 / 自上次` delta strip. Report/memo/evidence/episode revision guards and serialized report+episode publication prevent mixed reads and lost updates. P2-P6 still rerun over the distilled signal set; P7 is still not wired. Do not render the reaction counts as a donut until one comment has one explicit mutually exclusive group assignment.
- 0.3.36 is motion-foundation + Topic Audit continuity hardening — no new surface, no default-user visual change. Motion: one keyframe owner (`src/ui/motion.ts`, Atlas drift/pulse folded in), an idempotent single-guard-id injector (`ensureDlensKeyframes`) that ends the popup's duplicate registry copy, and a `prefers-reduced-motion` safety net that travels with the registry (scoped to `[data-dlens-control]`) so every `animation:` callsite is neutralised without per-callsite media queries. Compare technique-view switching scrolls the DLens workspace viewport, not the host Threads page, and honours the shared reduced-motion scroll preference. Backend continuity: the P0 claim-lineage fix — full audit falls back to the latest episode's `stateSnapshot` when a single-signal P1 has deleted the report, so claim ids never restart at `claim-1` for a different proposition — plus retained retired-claim deltas on same-fingerprint episode revisions. Gate at commit: 1077 tests / 1072 pass / 0 fail / 5 skipped; typecheck / boundary / storage / build green. Runtime QA in real Chrome (逐頁動畫手感 + audit continuity) still pending; Episode Explorer / semantic motion primitives (lift/press/presence) not started.
- 0.3.37 is the first visible causal-motion slice. Popup presence is one masthead → rail → main cascade; card/row motion is reserved for actionable targets; Product and Topic lists animate only real filter, expansion, or reorder changes through `useCausalListMotion`, with initial paint still and an explicit JS reduced-motion check. Topic cards remove the redundant status-colour spine; the existing mono status kicker remains the single state encoding. Static scan rows no longer receive hover colour, and Atlas/detail triggers retain active-source identity while the one drawer opens. No per-card scroll reveal, viewport observer, storage change, backend change, or new surface. Gate: 1083 tests / 1078 pass / 0 fail / 5 skipped; typecheck / boundary / storage / migrations / fixture / build green; mirrored `output/chrome-mv3` manifest is 0.3.37.
- 0.3.38 implements the user-approved Motion Lab values. `useWorkspaceScrollMotion` observes only explicit `data-dlens-presence="card|row"` targets across Topic, Product, PR, Collect, Compare, Library/Casebook, and Settings; cards use `0.84 → 1 / 4px / 240ms`, rows `0.92 → 1 / 4px / 220ms`, with a `35ms` stagger capped after six steps. A dedicated inner scroll track—not the viewport—provides the bottom-only `3px / 280ms` trackpad rebound with hysteresis, cooldown, short-page guard, route cleanup, and reduced-motion fallback. Hover preset A adds `scale(1.015)` to the existing card lift and raises actionable rows to the same selected shadow. Presence uses individual `translate`; causal list motion cancels unfinished presence before it takes ownership. No backend/storage/ViewModel/report change. Gate: 1086 tests / 1081 pass / 0 fail / 5 skipped; typecheck / boundary / storage / migrations / fixture / build green; both built manifests report 0.3.38. Real-Chrome hand-feel QA still requires extension reload.
- 0.3.39 corrects Topic's scroll hierarchy without changing native scrolling. A Topic-only soft-pop profile (`0.68 → 1`, `10px → -1.5px → 0`, `0.985 → 1.003 → 1`, `420ms`, `80ms` same-edge stagger) is attached only to real rounded surfaces: Topic list cards, Atlas hero, compass, source card, reliability card, and the empty-Atlas/source path. Reaction and single-lane legend rows drop the heavy lift/shadow for a quiet rounded background response; Product/PR legacy pair rows do not inherit Topic motion. One-in-one-out: nested row motion leaves as the card hierarchy enters. No backend/storage/ViewModel/report change. Gate: 1087 tests / 1082 pass / 0 fail / 5 skipped; typecheck / boundary / storage / migrations / fixture / build green; both built manifests report 0.3.39. Real-Chrome hand-feel QA still requires extension reload.
- 0.3.40 gives presence motion two distinct jobs without taking over native scrolling. The Topic list/Atlas lead keeps the approved soft pop; later explicitly marked cards use a delayed two-frame fade-up (`0.28 → 1`, `10px → 0`, `480ms`, `70ms` base delay plus capped `60ms` stagger) with no scale or overshoot. Dense rows retain the quieter `0.92 → 1` / `4px` profile, and reduced-motion settles every target immediately. All modes retain one fixed-size frame while its shared token contracts from `min(86vh, 860px)` to `min(78vh, 780px)`, avoiding mode-switch jumps while removing excess empty canvas. The in-frame Topic source drawer now uses `top: 82px; bottom: 0` and an auto height, so its body scrolls within the actual remaining frame instead of carrying the retired viewport height. Bottom spacing has one owner: the popup track provides a `12px` layout gap plus a real `28px` spacer; Product review/classification, PR, and Result no longer stack route padding underneath it. No backend/storage/ViewModel/report change. Gate: 1087 tests / 1082 pass / 0 fail / 5 skipped; typecheck / boundary / storage / migrations / fixture / build / bundle markers / diff check green; both built manifests report 0.3.40. Real-Chrome hand-feel QA requires extension reload.
- 0.3.43 adds a manual, current-only Narrative lens beside PR's existing Evidence lens. `PrCampaign` settings add core narrative, target audience, and desired action; setup generation returns those fields and the six criteria in one envelope. Stage A reads only each campaign's manually collected Threads main-post text; Stage B synthesizes 2–4 claims with one priority implication and source-linked support plus optional counterexamples. `dlens:v1:pr-narrative-reads` stores the latest read per campaign; source hashes mark reads stale without erasing the last successful result. Publication revalidates the live source hash inside the shared map write lock, and prose guards reject unsupported counts, fractions, percentages, distributions, and temporal deltas. No automatic discovery, monitoring, temporal delta, comment reading, or distribution claim exists. The visible Settings folder-mode radio is removed; persisted mode/storage compatibility remains. Gate: 1149 tests / 1144 pass / 0 fail / 5 skipped; typecheck / boundary / storage / migrations / fixture / build / bundle markers / diff check green; both built manifests report 0.3.43. The active real-Chrome profile still exposed 0.3.42, so 0.3.43 runtime QA awaits a manual extension reload.
- 0.3.42 corrects Product Saved Signals to use the product-wide card-arrival profile per visible signal rather than the nearly invisible dense-row profile. The containing list frame is structural; every saved signal now fades `0.28 → 1`, rises `10px → 0` over `480ms`, and participates in the approved card stagger. `scanRowStyle` no longer owns an inline background-only transition that cancelled the shared card transform/shadow interpolation, so hover follows the existing tactile spring instead of snapping. No backend/storage/ViewModel/report change. Gate: 1088 tests / 1083 pass / 0 fail / 5 skipped; typecheck / boundary / storage / migrations / fixture / build / bundle markers green; both built manifests report 0.3.42. Real-Chrome hand-feel QA requires extension reload.
- 0.3.41 makes the card-arrival hierarchy product-wide rather than Topic-only. Every workspace route family exposes its real standalone top-level rounded cards to the same contract: one light lead soft-pop, then `70ms`-delayed `0.28 → 1` / `10px → 0` / `480ms` fade-ups staggered by `60ms`, with no scale or overshoot on follow-up cards. `SurfaceCard` opts in by default; nested cards inherit the parent entrance, structural wrappers stay unmarked, and dense rows keep their quieter profile. Native scroll is neither replaced nor prevented. Route generations, split-callback internal replacements, reduced-motion hydration/toggles, and stale observer callbacks are regression-locked so cards remain one-shot and no second lead appears. No backend/storage/ViewModel/report change. Gate: 1088 tests / 1083 pass / 0 fail / 5 skipped; typecheck / boundary / storage / migrations / fixture / build / bundle markers green; both built manifests report 0.3.41. Real-Chrome hand-feel QA requires extension reload.
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
- `SettingsView` no longer exposes Layout or folder-mode controls; the visible drawer is limited to connection, storage usage, API keys, and ProductProfile.
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

## Version Rule As Of 2026-07-15

- Current source version in the active worktree: `0.3.47` (S6 narrative semantic repair + S7 single-poller; bumped 2026-07-15 across all five lock sites). `0.3.46` below is the historical release record.
- Latest local verification for 0.3.46: 1156 tests / 1151 pass / 0 fail / 5 skipped; typecheck, both boundary guards, storage seam guard, build, and diff check passed.
- Built `.output/chrome-mv3/manifest.json` and mirrored `output/chrome-mv3/manifest.json` both report `version: "0.3.46"`. Real-Chrome QA in Jason's Default profile reloaded the same extension ID from `output/chrome-mv3`; a real Threads page reported `v.0.3.46`, retained the stale 6/7 Atlas, and exposed `開始爬取 1 篇`. A live backend run then crawled that source successfully with 84 comments and completed analysis, but the extension failed to reconcile the terminal capture: backend status returned idle while Topic remained 6/7, showed one source as processing/unfetched, and its drawer still reported 0 comments. The extension emitted 4 `/worker/status` requests in a 10-second sample. Treat 0.3.46 as static-green but runtime-blocked on S7 polling/reconciliation; no replacement Topic audit was generated.
- 0.3.47 shipped S6+S7 and passed live acceptance on 2026-07-16: the Default-profile extension was reloaded (service worker 0.3.46 → 0.3.47, real Threads page reported `v. 0.3.47`), a formal 60-second window measured exactly 5 `/worker/status` + 5 `/health` requests (stable-idle cap held), stopping the backend walked the visible status through reachable → slow → unreachable with a real `Failed to fetch`, restarting it auto-recovered to `Backend reachable` in 13 seconds without a reload, and bundle hashes before/after the full gate were identical. The 8 historical dead-letter jobs (4 April `BaseException` handler bugs, 1 missing Playwright browser, 2 dead-session `empty_crawl_result`, 1 smoke cleanup) were verified to have zero downstream crawl_results and zero successful sibling jobs, then deleted the same day; `/worker/status` reports `dead_jobs: 0`. The real 8-post PR narrative campaign trace remains the acceptance gate for future PR-surface work, not a 0.3.47 blocker.
- Current engineering branch: `main`. `release-0-3-46` (S2–S5) and the S7 polling/reconciliation work were merged to local main by 2026-07-15 (`e17945d`); S6 narrative semantic repair landed on main directly (`a796629`). The 0.3.47 closeout on 2026-07-16 pushed local main to `origin/main` (clean fast-forward), pushed the backend worker-status hardening commit (`fcbf09c`), and tagged `v0.3.47`.
- Topic truth contract: inventory denominator, current crawled evidence, P1-read count, and report snapshot count are distinct. Pending or removed evidence cannot inflate completeness.
- Topic recrawl contract: an existing Atlas still exposes `開始爬取 N 篇` when current inventory contains uncrawled sources; after crawl + full regeneration, the compatible publication returns to ready and the stale state clears.
- Single-post P1 contract: preserve the last complete report, episodes, unrelated signal readings, and old lens display hints. A P1 memo/publication mismatch is intentionally rendered as stale; only a complete audit publishes the replacement report + episodes.
- Topic audit transient-state contract: mode/session changes reset reconciler ownership and local running flags immediately; late responses are ignored. Whole UI audit requests have a 15-minute total guard.
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

## PR Evidence Mode As Of 2026-07-14

- Folder mode: `pr-evidence`.
- Navigation: `PR Evidence / Collect / Settings`.
- V1 active campaign rule: one active campaign per PR Evidence session.
- Lenses: `敘事判讀` is the production default; `證據匹配` preserves the criteria/metrics/CSV/summary workflow over the same collected rows.
- Narrative settings: editable core narrative, target audience, and desired action are saved with the campaign and generated with criteria from one setup call.
- Narrative scope: only manually collected rows for the active campaign; canonical captured main-post text is preferred and the row caption is an explicit fallback. Comments, replies, outside posts, and automatic discovery are excluded.
- Narrative calls: one bounded Stage A pass per fixed chunk reads posts independently; exactly one Stage B synthesis returns `insufficient_evidence` or 2–4 claims with a priority claim id, support refs, and optional counter refs.
- Narrative truth contract: current-only, one public denominator, no temporal delta, no recent-period framing, no monitoring language, no mutually exclusive distribution claim. A changed campaign/source hash marks the last read stale but keeps it visible.
- Narrative UI: implication-first priority surface, one support ratio per claim, optional compass disclosure, and one keyboard-operable evidence drawer linking support/counterexamples back to original Threads posts.
- Criteria: exactly six fixed ids `c1..c6`; labels can be AI-suggested and user-edited.
- Brief input: PDF/txt/md upload fills the campaign brief, extracts text-based PDFs, and surfaces detected core PR messages before criteria generation.
- Collect: creates `PrEvidenceRow`, never Topic `Signal`, never Product analysis, and never runs AI.
- Match: explicit batch action only; output is `✓ / blank`; parser accepts common AI response shapes and deterministic visible-keyword matching acts as a backstop.
- Export: CSV is primary and uses UTF-8 BOM; preview is read-only, capped to header + first 20 rows, and shows weak placeholder dashes for empty cells.
- Summary: client-ready Markdown PR audit memo with `Executive Read`, `Message Pull-Through`, `Interpretation`, `Evidence Highlights`, and `Data Limits`; AI may rewrite tone but must not invent reach, EAV, all-channel, or unsupported numeric claims.
- Summary export: UI supports `.md` and true `.docx` export through `src/ui/pr-summary-export.ts`.
- Views: extract from DOM metrics where available, infer from visible text such as `132 views`, and otherwise leave unavailable rather than estimating reach.
- Storage keys: `dlens:v1:pr-campaigns`, `dlens:v1:pr-evidence-rows`, `dlens:v1:pr-narrative-reads`.
- Non-goals: no social listening, automatic post discovery, continuous monitoring, temporal trend/delta, duplicate grouping, true reach, EAV, XLSX, or in-app spreadsheet editing.

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
