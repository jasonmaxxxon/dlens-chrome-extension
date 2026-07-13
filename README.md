# DLens Chrome Extension

DLens is a mode-aware MV3 Chrome extension for capturing Threads posts and turning them into research, product-signal, and PR evidence workflows.

> Last updated: 2026-07-13
> Current source version: `0.3.37` · `1078 passed / 5 skipped` (1083 tests), typecheck/guards/fixture/build verified locally
> Current engineering branch: `main`
> Positioning (2026-06-18, design contract amended 2026-07-10): local power-tool (self + small technical circle); two separate repos (extension public · ingest-core **private**), not monorepo; design contract is `src/ui/tokens.ts` glass workspace (warm ink + serif voice on the shared `workspaceGlass` white ground — the warm-paper cream surface family is retired)
> Load-unpacked build path: `output/chrome-mv3`
> Stability note: `TRACE`, `SEAM_GUARD`, `RECONCILE`, `INVALIDATE`, `BOUNDARY`, and `MIGRATE` are locked in the live architecture map. Visual Reset A shipped the native-feeling shell plus PR Evidence, Topic, Compare, and Product marquee surfaces without changing storage, backend, ViewModel, command, or signal-packet contracts.
> Runtime note (2026-07-10): Chrome reads `output/chrome-mv3`, not raw `src/`. Topic/Product/PR now share one glass workspace shell AND one glass surface family — as of 0.3.28 every inner card (rail, Collect, Settings, Topics list, Product signals) sits on the same white-green ground as the shell; cream paper no longer appears anywhere. Topic Audit keeps the current Signal Atlas mounted while regeneration runs, replaces the legacy non-ready overview with a compact in-frame state, and no longer presents memo-derived `Pn/6` as live progress.

## What It Does

DLens is extension-first, not SaaS-first. Local folders, UI state, product context, user API keys, saved analyses, Product signal judgments, SignalReading records, and PR evidence rows live in Chrome/local extension storage. The optional ingest backend owns crawl jobs and canonical read models.

Current workspace modes:

| Mode | Main use | Current status |
|---|---|---|
| `archive` | Save and inspect Threads posts locally | Working |
| `topic` | Triage saved posts into topics, compare ready pairs, attach results to case context | Working |
| `product` | Analyze saved signals against ProductContext, review free-text readings, export agent-readable packets | Working |
| `pr-evidence` | Build PR evidence ledgers from already-found Threads posts, match criteria, export CSV/MD/DOCX | Working |

## Recent Month Contract

Recent PRs and local commits changed the shape more than the old README suggested:

- PR #16-#20 moved Product, Topic, Compare, and PR Evidence views behind ViewModel/read boundaries.
- PR #21-#29 locked the typed trace spine through a full live backend/direct-LLM fixture.
- PR #30 and #38 locked storage writes behind seam guards; PR #40-#45 locked reconcile/invalidation terminal behavior.
- PR #46-#51 locked View/ViewModel boundary guards and storage migration fixture coverage.
- PR #53-#57 shipped Signal Packet HTML/source/lineage provenance and 0.2.1.
- PR #58-#67 shipped Visual Reset A and release 0.3.0.
- PR #68-#71 handled post-reset LOC/overflow fixes: Library/Compare split, popup clipping, topic removal, masthead containment.
- Local 0.3.6/0.3.7 commits and worktree changes compact Product saved-signal rows, suppress stale backend errors, restore the extension action side panel, and move Product classification visibility into the Saved Signals surface.

## Current Features

- Hover-to-preview and collect on Threads feeds/post pages. Hover uses a warm in-memory cache (no per-move storage read); saves carry the live hovered post and the popup's visible folder/topic so they always land where intended. Collect metrics use shared icon chips across the overlay and popup preview. Collect saves and refresh-all writes share the snapshot lock so Topic signals cannot be left without a usable backing saved item/descriptor; pre-existing orphan/corrupt signals are hidden from Topic counts/lists and queued for storage cleanup. Content scripts also rehydrate active collect mode after extension reload/page refresh (see AGENTS.md "Recently Fixed 2026-05-22").
- Mode-aware save routing: archive saves to Library; topic/product saves become Inbox signals; PR Evidence saves become campaign rows. Save messages now pass an explicit `sessionId`/`topicId`, so a drifted active folder cannot reroute a save.
- Backend queue/drain/polling against `ingestBaseUrl`, defaulting to `http://127.0.0.1:8000`.
- Popup backend health dot uses the lightweight backend `/health` endpoint for liveness, while `/worker/status` remains the slower work-truth projection for backlog / retry / analysis state. One failed health poll is suppressed, two mark the dot slow, and three mark it unreachable.
- Compare setup and Result surfaces with backend read models plus extension-side compare brief v8, cluster summaries, evidence annotations, and saved analysis snapshots.
- Topic workflow: Casebook, Inbox, Topic Detail, signal triage, per-signal semantic tags/gists, optional-question TopicSignalReading, and attached compare pairs.
- Product workflow: ProductContextCompiler, ProductSignalAnalyzer v17, Marginalia/Verdict card layouts, Reading Review when matching `SignalReading` rows exist, Signal Packet export support, and local feedback history. v17 stops asking the model for legacy action-recipe fields such as `copy_recipe_markdown` / `workflow_stack`; action cards also ignore those legacy fields if present and keep evidence as reusable patterns plus agent briefs, not tutorial recipes.
- Product Saved Signals is the current landing surface. It owns the scan-first saved rows, `全部 / 未分類 / 待處理 / 已分類` filters, the compact pending-signal drawer, and the merged classification summary. `classification` remains an allowed product page for internal/deep-link routing, but it is no longer a rail-visible primary Product page.
- Signal Packet export: Product sessions can export `DLensSignalPacket` records as HTML, Markdown, or JSONL through `signal-packet/export`. The 0.2.1 surface adds compact HTML density, source/capture/item provenance, reading citation refs, filed-reading lineage, source URL provenance, and a Product reading-review provenance mirror. These fields are additive on packet v3; no storage migration is required.
- Visual Reset A (amended 0.3.28): the popup shell, PR Evidence ledger, Topic detail, Compare hero, and Product action surfaces use the `src/ui/tokens.ts` contract with macOS utility shell affordances; since 0.3.28 the surface family is the glass-white ground (warm-paper values retired). VIEW remains 🟢, not 🟩: marquee surfaces are DOM-test-locked, while row-level primitive adoption / LOC reduction remains follow-up work.
- PR Evidence workflow: one active campaign per session, brief upload, six editable criteria, evidence rows, criteria matching, CSV export, Markdown/DOCX audit summary.
- Layout preferences remain persisted for existing records, but the visible Settings layout card is removed; workspace typography, rounded surfaces, and shadow treatment now follow the Topic card grammar across modes. Shared cards default to the 20px Topic-style radius.
- Workspace mode switches reserve the processing-strip slot, reset scroll before paint, and crossfade the content frame so Topic/Product/PR data changes no longer produce a visible vertical jump.
- 0.3.2 UI fix: compact masthead now removes nonessential shortcut/issue chrome, keeps only status + version on the right, and Topic cards/buttons stay inside the content width with a non-overlapping remove action.
- 0.3.1 UI fix: popup masthead status/key hints now shrink inside the 720px shell, Product classification detail text wraps instead of clipping, and Topic cards expose an explicit remove action.
- 0.3.7 local UI fix: Product saved-signal classification is merged into Saved Signals instead of appearing as a separate rail stop; the source contract is guarded by `getModeRailPages("product") === ["saved-signals", "actionable-filter", "collect"]`.
- 0.3.13 local UI fix: Topic Collect's 未分流 queue exposes per-row and bulk delete through `signal/delete`, and Topic/Product/PR modes render no top folder/topic strip. Topic destination choice lives in the floating collect preview card; topic creation lives in the 議題 page.
- 0.3.18 local UI update: Topic Audit renders the Signal Atlas L0 reading spine with shared evidence ref chips, cross-post narrative strength, counts-only source footer, one unified right-side drawer, and shard-backed full-list expansion.
- 0.3.19 local UI fix: Topic Audit ready state drops the duplicate overview header and keeps only the report/regenerate action row; the L0 detail drawer is contained to the extension frame instead of the Threads viewport.
- 0.3.22 local UI update: Topic/Product/PR use one Variant-D-derived glass shell across the popup canvas, masthead, rail, and main frame. Topic regeneration keeps the last Atlas visible inside the same glass frame; first-run/failed/stale states no longer reintroduce the legacy overview or memo-derived stage progress. Atlas counts now distinguish captured/read/usable comments from overlapping pattern assignments.
- 0.3.23 local UI fix: the L0 detail drawer re-anchors to the user's current viewport sightline when it opens (and tracks scroll/resize), instead of sitting at the top of the tall frame-contained shell; the 缺席與可靠性 strip is redesigned as an amber glass card with a serif reading voice, a caveat count, and bulleted limits.
- 0.3.24 local UI fix: clicking a 民情羅盤 bubble no longer draws the browser's default rectangular focus box; the SVG bubble suppresses the mouse-focus outline and shows a circular signal-coloured focus ring only on keyboard `:focus-visible`.
- 0.3.25 local UI update: the 缺席與可靠性 strip is rebuilt as two labeled epistemic zones (`data-reliability-zone` 缺席的聲音 / 可靠性限制) that separate what the discourse omits from the reading's own caveats, each with an icon header; the atlas canvas gains bottom breathing room so the last card no longer sits flush against the frame edge. New token `color.queuedDeep`.
- 0.3.26 local UI fix: the atlas canvas bottom padding is increased to 48px (from 24px) so the last L0 card — the reliability strip — floats clearly above the canvas edge instead of reading as clipped; the shell's own scroll-bottom spacer already handled space below the canvas, but the gap inside the canvas was too tight.
- 0.3.27 local UI fix: the outer popup frame and its border-box scroll mask restore Variant D's 28px radius, so the main-frame divider turns through the visible bottom curve instead of being clipped into the page edge. Narrow viewports clamp the popup inside the window; Atlas drawer scroll positioning and bubble accessibility are hardened in the same pass.
- 0.3.28 local UI update: the editorial warm-paper surface family is retired (user direction, 2026-07-10). `tokens.ts` `color.canvas/surface/elevated` and the shell/rail/context/utility/neutral/idle/disabled surface roles are retuned to whites derived from the `material.workspaceGlass` canvas stops, so the rail, Collect, Settings, Topics list, and Product Saved Signals inherit the 0.3.22 glass grammar without view changes; the `data-paper-grain` texture overlay is removed (one-in-one-out: grain CSS + two attributes out, zero surface added). Warm ink, serif headline voice, mode accents, and natural-dye status colors are unchanged; `tokens-intent.md` is amended in the same change.
- 0.3.37 causal-motion UI slice: Topic cards drop the duplicated status-colour side spine and use the mono status kicker as the single report-state encoding. Popup open now performs one masthead → rail → main cascade; actionable cards and dense rows share lift/press semantics; Product Saved Signals, Reading Review, Classification, Action filters, and the Topic list use reduced-motion-safe list choreography only when filtering, expanding, or reordering changes real state. Static Product/PR rows no longer inherit false hover/lift affordances. Topic Atlas/detail triggers retain active-source identity while the single drawer opens. No per-card scroll reveal or `IntersectionObserver` was added.
- 0.3.36 Motion foundation + Topic Audit continuity hardening (refactor + latent-bug fix, no new surface): every `@keyframes` lives in one owner module `src/ui/motion.ts` (`DLENS_KEYFRAMES_CSS`) — including the Signal Atlas drift/pulse, which moved out of `TopicDetailView` so single-owner is literal (`tests/motion-registry.test.ts` fails on any `@keyframes` defined elsewhere). The registry is injected once per document through an idempotent shared injector (`ensureDlensKeyframes`, one guard id) across three mount contexts (threads overlay, in-page collector, audit-report page); the popup hook previously re-injected a second copy of the registry into the same Threads document — that duplication is gone. A `prefers-reduced-motion` safety net travels with the registry (scoped to `[data-dlens-control="true"]`), so every `animation:` callsite — the audit-report skeleton shimmer, collector/overlay spinners and pulses, Atlas drift — is neutralised under reduced motion without per-callsite media queries. The earlier `dlens-success-pulse` name collision stays fixed as distinct `dlens-success-ring` (Product "recently filed" row flash) and `dlens-success-pop` (collector success dot) via `color.successFlashStrong/Soft`; `DLENS_MOTION_CSS` lives in `motion.ts` (re-exported for the threads content script + tests). Compare technique-view switching now scrolls the DLens workspace viewport (`[data-workspace-popup-scroll="viewport"]`), not the host Threads page, and honours the shared reduced-motion scroll preference (`resolveMotionScrollBehavior`). Backend: Topic Audit narrative continuity falls back to the latest episode's `stateSnapshot` when a single-signal P1 regeneration has deleted the report, so claim ids never restart at `claim-1` for a different proposition; same-fingerprint episode revisions retain retired-claim deltas. `dlens-glow-border` / `dlens-scan` remain but are unreferenced. No View/ViewModel boundary or storage seam change; the semantic primitive API (lift/press/presence) is still deferred to the motion mockup.
- 0.3.35 Topic Audit continuity release: evidence aliases now resolve through stable captured-source anchors; P0.5/P1 reuse is keyed by per-signal content/reference identity plus the exact producer/model contract, so appending one signal only pays that signal's shard/post reads while aggregate P2-P6 lenses rerun. A bounded 4096-character `NarrativeState` carries evidence-reanchored claims, voices, and open questions across runs; the latest 24 first/advance/rebase episodes persist beside the report and drive the in-Atlas `本次 / 自上次` delta strip. Report, memo, evidence, and episode revisions are guarded against mixed reads; report+episode publication is one serialized write. The current compass remains instead of copying a donut: reaction-pattern counts are overlapping assignments, not mutually exclusive distribution slices. P2-P6 inputs still grow with the distilled signal set, and P7 remains unwired.
- 0.3.34 Topic Audit bounded-P1 slice: P0.5 now persists each shard's blank-read prose on `CommentShardReading`; both the full audit and single-signal entry point create missing shard readings before P1. P1 is a post reducer over bounded OP context, OP-authored context, capture gaps, and P0.5 prose + structured hints, with a hard 24,000-character prompt ceiling and no raw audience-reply re-render. The 1,000-comment regression fixture spans the first and last shard, preserves the JSON response contract, and rejects every `RAW_REPLY_` marker. This slice does not add cross-run incremental caching, NarrativeState/episodes, P2-P6 hard ceilings, or a new reaction-distribution UI.
- 0.3.33 local UI update: topic cards adopt Jason's status-led mockup grammar. A mono status kicker opens the card (`READY / BUILDING / QUEUED / FAILED / STALE` + `· N 訊號`, same status voice as the masthead StatusRail; stale keeps the `+n` delta chip; the `TopicAuditStatusPill` stays on Topic detail but leaves the card), the serif title grows to 22px, and a new editorial gist line (`data-topic-card-gist`) renders the first sentence of the audit report's `sections.overall` via a new `TopicAuditSummary.headline` field populated in `useTopicAudit` (falls back to `topic.description`, then 採集批次待整理). The updated date moves into the kicker row; the coverage bar returns as a slim two-tone strip that renders once any source is ready (a partial bar is honest coverage; an empty track is not). Five-state copy assertions in `tests/topics-list-view.test.tsx` updated to the new tokens.
- 0.3.32 local UI removal: the topic card's dashboard strip (four KPI stat tiles + dividers, the `打開 ›` link duplicating the clickable card, the always-on completion bar, and the English `queue clear` chip) is replaced by one flat evidence line above a hairline — `N 訊號 · 已完成 n/N · 更新 MM-DD`, with `處理中 n` / `n 待處理` appearing only when nonzero. The two-tone progress bar now renders only while work is in flight (`data-topic-source-state="working"`); a settled topic shows no bar (tokens-intent refuse-list #1: progress theater). All locked `data-topic-*` attributes stay in the states the tests exercise — zero test edits.
- 0.3.31 local UI update: Product signal pages adopt the glass layout grammar. The `WorkspaceSurface tone="utility"` wrapper around all Product routes is removed (sections sit directly on the glass main frame, marked `data-product-signal-frame`); the readiness strip (真實狀態/分析狀態, `ReadinessPanel`) moves from the muted context-wash card onto the shared `workspaceGlass` hero material via a new `heroPanelStyle` (same material as the Collect capture stage); the Saved Signals board header replaces the Kicker `已存訊號` (which duplicated the page title) with `SectionHeader` 訊號清單 + mono count; filter-tab pills move from the status-dot-reserved `radius.round` to `radius.pill`. Rows, tabs, pending drawer, batch export, and every `data-product-*` test contract are unchanged — no test edits.
- 0.3.30 local UI update: Settings is rebuilt on the glass grammar. The triple surface nesting is flattened — the popup's utility-tone wrapper and the view's own `WorkspaceSurface` are both removed, so the `data-settings-group` cards sit directly on the glass main frame (their locked `cardLg` radius + `topicCard` shadow contract is unchanged). Group headers replace the duplicated Kicker+Stamp pairs (e.g. "Folder"/"Folder", "Connection"/"Live") with one shared `SectionHeader` — Chinese serif title, English mono caption (資料夾類型/Folder, 連線/Connection, API 金鑰/API keys, 產品脈絡/Product); the header `Workspace` stamp and the source-card `Loaded/Ready` stamps (redundant with 已載入/尚未載入) are removed. Folder-type radios get a mode-accent selected state; the storage-usage box becomes a quiet tabular line; product context source cards become one-row grids with a success wash when loaded; inputs move to the shared radius/surface tokens. All `data-settings-*` and product-context test contracts pass without any test edits.
- 0.3.29 local UI update: Collect is rebuilt on the glass grammar. The capture hero becomes a `workspaceGlass` panel (`data-collector-stage="hero"`) with one status dot + destination chip row and a mode toggle that is primary when idle; the duplicated in-card `DLens` wordmark, the header `Idle/Active` stamp, and the second folder-name render are removed (one-in-one-out for the new viewfinder + recent-captures card). The preview area is a two-state viewfinder (`data-collector-viewfinder="empty|preview"`): dashed waiting stage vs. opaque preview card with author/time/snippet — preview metrics stay exclusive to the hover overlay (`data-collector-metric-strip="hover-preview"` contract). The save button renders only when a preview exists; keyboard hints become quiet mono kbd chips shown only while capturing; recent captures move into their own opaque `SectionHeader` card (最近採集) with flat line-separated rows. Untriaged-triage behavior and all `data-collector-*` / `data-topic-triage` / `data-untriaged-*` test contracts are unchanged except the wordmark ban, now asserted in reverse.
- Product Action route restores the 0.1.15 `READING REVIEW` UI only when the current saved signals have matching `SignalReading` rows. Review callbacks alone must not switch the Action route away from the Marginalia action cards. The old page-level batch export remains off the Action route; Saved Signals owns the `行動簡報匯出` selection/copy surface.
- Product Settings includes a Product-only cache reset. It clears derived Product analysis, SignalReading, feedback, and compiled ProductContext storage without deleting saved signals, topics, archive folders, or PR evidence.
- Popup runtime hardening: the React tree is wrapped in a top-level workspace ErrorBoundary, and the content-script runtime fallback remains separate.
- Storage diagnostics: Settings displays local `chrome.storage.local` usage through a background-only `storage/get-usage` message boundary.
- Snapshot write discipline: read-modify-write handlers route through `mutateSnapshot` where possible; documented raw-lock escapes cover extra return metadata, no-write returns, and global-only worker wake writes.
- Behavioral storage contracts cover `session/set-mode` fast/slow writes, `session/refresh-all` no-op writes, non-blocking snapshot broadcasts, and real `mutateSnapshot` serialization.

## Version Lock

For every user-visible `main` update, keep these in sync:

- `package.json`
- `package-lock.json`
- `wxt.config.ts` `manifest.version`
- `src/ui/version.ts` `BUILD_VERSION`
- `tests/manifest-config.test.ts` expected version string

`tests/manifest-config.test.ts` verifies this. Chrome's extension page reads the built manifest version; the popup masthead reads `BUILD_VERSION`.

## Build And Verify

```bash
cd dlens-product-latest
npm run typecheck
npm run storage:seam-guard
npm run boundary:guard
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

Expected verification before handing off `main`:

- Source routing contract: `npx --yes tsx@4.22.5 --test tests/product-routing.test.ts tests/page-registry.test.ts tests/inpage-collector-state-split.test.ts` should pass with product rail pages `saved-signals / actionable-filter / collect`
- Full suite: `npx tsx --test tests/*.test.ts tests/*.test.tsx`
- `npm run typecheck` passes
- `npm run storage:seam-guard` reports zero allowlisted bypasses
- `npm run boundary:guard` reports zero View / ViewModel wall violations and zero allowlisted bypasses
- `npm run build` mirrors the unpacked MV3 build to `output/chrome-mv3`
- `output/chrome-mv3/manifest.json` reports the same version as `package.json` and `name: "DLens v3"`
- Bundle sanity check for 0.3.13: `output/chrome-mv3` should contain `data-untriaged-delete` and `data-untriaged-delete-selected`, and Product should still contain `data-product-saved-filter-tabs` / `data-product-merged-classification` without rendering `classification` in the Product rail. Manifest version alone is not enough.

## Second Mac Install

For a 30-minute assisted install on another Mac, use [`docs/setup/second-mac-30-minute-install.md`](./docs/setup/second-mac-30-minute-install.md). It is written for someone using Terminal with help from a simple AI chatbot.

## Active Paths

| Purpose | Path |
|---|---|
| Active extension worktree | `dlens-product-latest` |
| Load unpacked extension | `output/chrome-mv3` |
| Chrome QA profile | Jason `Default` profile (`jason@brandonproject.co`); this is the only local Chrome profile with DLens installed from `output/chrome-mv3` |
| Backend (resolved at) | sibling `../dlens-ingest-core` or `DLENS_INGEST_CORE_DIR` |
| Backend repo | `github.com/jasonmaxxxon/dlens-ingest-core` (private) — clone as a sibling; see its `SETUP.md` |
| Backups | `~/dlens-archive-<date>/` (extension + backend bundles + RESTORE.md) |

## Architecture Boundary

- The extension does not connect directly to Supabase.
- Runtime only depends on `settings.ingestBaseUrl`; a local backend checkout is optional for extension-only development.
- Backend analysis snapshots are the source of truth for crawl output and deterministic clustering.
- Extension-side AI calls use the user's local Google/OpenAI/Claude key and must degrade cleanly when no key is configured.
- Product mode must stay insight/evidence/task-first; backend clusters are support data, not the user-facing abstraction.
- View modules must not own extension messaging, raw storage access, or nondeterministic time/random sources; ViewModels must not own browser APIs, network calls, DOM globals, file constructors, or React imports. `npm run boundary:guard` enforces both walls.

## Where To Continue

Read these before non-trivial work:

- [`docs/architecture/dlens-current-architecture-map.md`](./docs/architecture/dlens-current-architecture-map.md) for the live architecture/status map. Treat 🟢 as built, not locked; update the map if a node/edge status changes.
- [`AGENTS.md`](./AGENTS.md) for process rules, current contracts, and agent handoff notes.
- [`docs/handoff/2026-06-18-visual-reset-A-plan.md`](./docs/handoff/2026-06-18-visual-reset-A-plan.md) for the Visual Reset A PR sequence and single design-source contract.
- [`docs/ENGINEERING_PLAN.md`](./docs/ENGINEERING_PLAN.md) for the completed N1-N5 engineering-plan slice and deferred-trigger pool.
- [`docs/CODE_REVIEW.md`](./docs/CODE_REVIEW.md) for the current PR self-check contract.
- [`docs/memory/current-state.md`](./docs/memory/current-state.md) for the fuller repo state.
- [`docs/memory/latest-shared-context.md`](./docs/memory/latest-shared-context.md) for Codex/Claude shared memory context.

Current state and open risks:

- `entrypoints/background.ts` is 3488 lines; do not split handlers unless the trigger in `docs/ENGINEERING_PLAN.md` promotes that work into the committed-next slice.
- `src/ui/useInPageCollectorAppState.ts` is 2148 lines; continue extraction before adding more product/PR/export routes.
- C-Backend read-model hardening is now 🟢: B1-B4 landed across backend and extension projection; future read-model changes must update the shared seven-case golden fixtures.
- BOUNDARY is now 🟩: View / ViewModel wall guards are wired into CI through `npm run boundary:guard`.
- VIEW remains 🟢, not 🟩: Visual Reset A marquee surfaces are locked, but row-level primitive adoption / large-view LOC reduction is still follow-up work.
- Chrome QA must verify the rebuilt `output/chrome-mv3` in Jason's `Default` profile. A source fix plus a bumped manifest can still show stale UI if the bundle was not rebuilt or the unpacked extension was not reloaded.
