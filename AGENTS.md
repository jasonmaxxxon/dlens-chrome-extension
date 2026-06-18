# AGENTS.md — DLens Chrome Extension v0.2

> **Last updated:** 2026-06-18 (release 0.2.1 — Signal Packet export adds compact HTML density, citation refs, filed-reading lineage, source URL provenance, and Product reading-review provenance mirror as additive packet v3/read-model fields. Latest local verification: 889 passed / 5 skipped tests, typecheck, storage seam guard, boundary guard, `qa:harness:fixture`, build, and `git diff --check`. `BOUNDARY` is enforced by `npm run boundary:guard`, which runs View and ViewModel wall scanners in CI at zero allowlisted violations.)
> **For:** any agent continuing work in this repo
> **READ FIRST:** [`docs/architecture/dlens-current-architecture-map.md`](docs/architecture/dlens-current-architecture-map.md) — the status-colored handoff map (🟩 locked / 🟢 built / 🟡 partial / 🔴 not built). Don't treat 🟢 as 🟩; don't bypass ViewModel / typed command target / storage seam / pipeline trace; any async-path PR must handle requestId + invalidation + rehydrate; update the map's colors in your PR if status changes.

## Recently Fixed (2026-06-18) — Signal Packet export provenance and lineage

Signal Packet export remains `DLENS_SIGNAL_PACKET_VERSION = "v3"`; the 0.2.1 changes are additive and require no storage migration.

- HTML export is more compact and marks `data-signal-packet-density="compact"`.
- HTML provenance strips now include source/capture/item metadata when present.
- `DLensSignalEvidence.citedInReadingRefs` maps evidence refs back to the readings that cited them; the HTML evidence section shows the cited-by-reading affordance.
- `DLensSignalReadingBundle` exposes `latestFiled` and `supersededFiled`; the HTML reading panel shows filed lineage without rendering superseded bodies.
- `DLensSignalPacket.source` exposes `urlSource`, `pageUrlSource`, `pageUrlFallbackSource`, and `canonicalTargetUrlSource`, so renderer output can explain descriptor / capture / canonical / reading fallback choices.
- Product Reading Review mirrors packet-style provenance in the popup row (`來源`, `capture`, `item`) from the ViewModel; Views still do not read storage or call browser APIs directly.

## Recently Fixed (2026-06-16) — Boundary wall guards

`BOUNDARY` is 🟩 because View modules cannot import `sendExtensionMessage` / call `Date.now()` / `Math.random()` / `performance.now()` / `chrome.storage.local.*` / `chrome.runtime.sendMessage`, ViewModels cannot import `chrome.*` / `fetch` / DOM / `File` / `Blob` / `FormData` / React, and `npm run boundary:guard` enforces both walls in CI at zero allowlisted violations.

Do not add `TODO(boundary-bypass)` unless a separate review explicitly accepts the exception. A PR that needs a View side effect should move it into the controller / hook / app shell. A PR that needs a ViewModel browser dependency should pass precomputed input from the controller instead.

## Recently Fixed (2026-06-17) — Popup backend health dot

The popup processing strip now has a backend health dot driven by `backend/get-health`, which calls the lightweight backend `/health` endpoint. Do not drive this dot from `/worker/status`: worker status can take seconds during Supabase DB connection spikes and is reserved for backlog / retry / analysis projection. Reachability intentionally suppresses one failed health poll, turns yellow after two consecutive failures, turns red after three, and returns green on one successful health poll.

## Recently Fixed (2026-05-28) — Product action board and card geometry

1. **Product Action route regression.** `ProductSignalView` must open the
   0.1.15 `SignalReadingReviewWorkspace` / `READING REVIEW` UI when the Action
   route has saved signals plus matching `SignalReading` rows. A review callback
   alone must not switch the route away from the Marginalia action cards. This
   restores the carefully designed review card, verdict tiles, marginalia panel,
   provenance row, and deep-reading controls. Do not confuse this with the
   Saved Signals batch-copy surface: tests still reject `行動簡報匯出`,
   `原文優先`, `精簡決策`, and `複製行動簡報` on the Action route.
2. **Shared card radius.** `surfaceCardStyle()` now defaults to
   `tokens.radius.cardLg` (`20px`) so Product/PR/shared surfaces match Topic's
   softer paper-card geometry. The Saved Signals action CTA also uses the same
   radius and Topic-style matte shadow.
3. **Product-only cache reset.** Settings exposes `清除 Product cache`, wired to
   `product/clear-cache`. It removes only derived Product keys:
   `dlens:v1:product-signal-analyses`,
   `dlens:v1:product-agent-task-feedback`, `dlens:v1:signal-readings`, and
   `dlens:v1:product-context`. It must not delete saved signals, sessions,
   topics, archive folders, or PR evidence.
4. **Collect metric icons.** Collect preview metrics use the shared
   `MetricChip` / `MetricIcon` grammar, including likes, comments, reposts,
   forwards, and views. Do not reintroduce text-only `Like 123` /
   `Reply 45` chips in Product Collect.
5. **ProductSignalAnalyzer v17 stays.** New Product analyses no longer request
   legacy recipe output fields (`copy_recipe_markdown`, `workflow_stack`,
   `copyable_template`) from the strict provider schema. Action cards should
   present reusable evidence patterns plus an agent brief, not a long
   tutorial/how-to recipe; the UI also ignores legacy recipe fields if an old
   record or provider response still contains them.
6. **Product pending card grammar.** Pending saved-signal cards use the
   Topic-style 20px card radius, matte shadow, compact meta text, and clamped
   preview copy.

## Recently Fixed (2026-05-27) — Engineering plan N1-N5

The `codex/pr-visible-metrics` branch completed the committed-next slice in
`docs/ENGINEERING_PLAN.md` §2. Keep this as execution trace; do not drain §3
unless a trigger promotes an item into a new committed-next slice.

1. **React popup fallback.** `src/ui/WorkspaceErrorBoundary.tsx` wraps the
   popup tree in `InPageCollectorApp.tsx`. This is separate from the existing
   `threads.content.ts` runtime fallback.
2. **Storage usage surface.** `storage/get-usage` is a background-only message
   using `chrome.storage.local.getBytesInUse()`. `SettingsView` consumes a
   prop and must not call `chrome.storage` directly.
3. **Snapshot write seam.** `mutateSnapshot(tabId, fn)` is now the default
   read-modify-write seam for snapshot handlers. Raw `withSnapshotLock` is an
   explicit escape only for extra return metadata, no-write returns, or
   global-only worker-wake writes.
4. **Behavioral storage contracts.** `tests/background-behavior.test.ts`
   dispatches real background handlers with mocked `chrome.storage` and asserts
   storage keys for mode-switch fast/slow paths, refresh-all no-op writes,
   non-blocking broadcasts, and real `mutateSnapshot` serialization.
5. **Review checklist.** `docs/CODE_REVIEW.md` and
   `.github/pull_request_template.md` are the current self-check contract.
6. **PR visual grammar.** PR Evidence fractional font drift was folded into
   shared typography tokens; `textStyles.metric` is the compact mono numeric
   token.

## Recently Fixed (2026-05-22) — Collect→save reliability

Symptoms reported: hover preview arrived slowly, and saves landed in the wrong folder / showed up as a generic ungrouped item (e.g. "threads 22/5") instead of under the intended topic. Root causes and fixes:

1. **Slow hover preview — storage read on every hover.** The `selection/hovered` handler in `background.ts` called `loadSnapshot()` (= `loadGlobalState()` + `loadTabState()`, two `chrome.storage` reads + full normalize) on every pointer move just to overlay hover fields. Fix: added an in-memory `tabStateCache` (mirrors `globalStateCache`) and a `loadSnapshotCached()` that serves the warm caches, only touching storage on a cold worker. Hover writes never persist tab state, and every global/tab write already refreshes the caches, so the cached view stays consistent. Caches are evicted in the same `onRemoved` / keepalive-disconnect cleanup as `tabHoverCache`.

2. **Save against a stale post — popup read the lagging snapshot.** The popup's Save button and keyboard `S` saved `snapshot.tab.currentPreview`, which trails a fast cursor by a render frame (the left-click collect path was always correct because it reads the clicked DOM node directly). Fix: added a synchronous **live channel** on `window` (`setLiveHoverDescriptor` / `getLiveHoverDescriptor` in `inpage-helpers.tsx`), published by the content script in `publishHoveredDescriptor`. `buildPreviewSaveMessage` now prefers the live descriptor over the snapshot preview. The accessors are `window`-guarded so node tests don't break.

3. **Wrong folder — save routed by `getActiveSession`, topic by stale `collectionTopicId`.** `saveCurrentPreviewToSession` saved into whatever `activeSessionId` happened to be, and the topic came from `collectionTopicId`, which is set by a fire-and-forget effect (race). Fix: the popup publishes its visible folder/topic via a second live channel (`setLiveCollectionTarget` / `getLiveCollectionTarget`). The content-script click path and the popup save paths now pass an explicit `sessionId` (+ `topicId`) on `session/save-current-preview`. `saveCurrentPreviewToSession` honors `sessionId`, realigning `activeSessionId` so a drifted active folder cannot reroute the save.

4. **`createSession` ignored passed descriptor.** "Create folder and save current" always used the hover cache. `session/create` now carries an optional `descriptor`; `createSession` seeds `currentPreview`/hover cache from it, and the popup passes the live descriptor.

5. **Collect UI active but content click handler idle after extension reload.** The persisted tab state could still say `selectionMode: true`, so the banner stayed visible after reload, while the content script's in-memory `selectionMode` reset to false. Clicks then opened Threads posts instead of saving. Fix: content script now rehydrates from `state/get-active-tab` on startup via `resolveSelectionModeFromSnapshot`, and remote start/cancel messages no longer echo `selection/mode-changed`.

6. **Topic count increased but rows showed `資料不完整的 Threads 訊號`.** `signals` and `global.sessions[].items` are stored under separate keys. `session/save-current-preview` was not serialized through the shared snapshot lock, and `session/refresh-all` had a final tab-only `saveSnapshot` that could write an old `global` back after collect. That left signals whose `itemId` no longer had a usable backing item/descriptor. Fix: collect save now runs inside `withSnapshotLock`, refresh-all reloads the latest snapshot inside the lock before its final tab update, and Topic state now hides item-backed orphan/corrupt signals while attempting to delete them from signal storage.

Files changed: `entrypoints/background.ts`, `entrypoints/threads.content.ts`, `src/ui/inpage-helpers.tsx`, `src/ui/useInPageCollectorAppState.ts`, `src/ui/useTopicState.ts`, `src/state/messages.ts`, `src/state/selection-mode-messages.ts`. Regression coverage includes `buildPreviewSaveMessage` descriptor routing, selection-mode rehydrate, collect save locking, refresh-all stale-global protection, and Topic orphan filtering; full suite is now 514/514. `getLiveHoverDescriptor` guard keeps `buildPreviewSaveMessage` working under node.

Watch items: the three preview fields (`hoveredTarget` / `flashPreview` / `currentPreview`) still overlap in meaning and remain the next drift risk — worth collapsing to a single source of truth. The 120ms `HOVER_INTENT_DELAY_MS` (soft hover) is unchanged; reduce it only if preview still feels laggy after the storage-read fix.

## Process Rules (locked 2026-04-17)

These rules exist because 70+ small "pass" changes between 2026-03-28 and 2026-04-14 produced measurable harm:
- `brief.whyItMatters` renders twice on the Result page (ResultHeroCard + ResultWhyCard)
- `compareTeaser.deck` renders on Compare setup AND again on Result `分析就緒` card
- three design specs coexist (`tokens.ts`, `DESIGN.md`, 0413 mockup spec) with no single source of truth
- `InPageCollectorApp.tsx` had reached 1442 lines before the 2026-04-17 shell split
- all quotes in the same cluster receive identical `剖析` copy because the fallback has no per-quote variance
- `docs/product/` contains 10+ overlapping plans; the Recently Changed log is a feature diary rather than a state description

The rules:

1. **One-in-one-out** — every PR that adds content, UI surface, copy, or dependency must remove something of comparable weight. Note both sides in the commit message. Additive-only PRs are rejected.
2. **No "pass" / "refinement round" / "honesty pass" / "cleanup pass" changes** — every change is exactly one of: bug fix, feature, removal, refactor. These four words are the only allowed commit prefixes (or their short forms). Words like "pass" / "polish" / "round" / "tune" are banned from commit messages and doc headings.
3. **`tokens.ts` is the sole design spec** — do not write design specs in markdown. `DESIGN.md`, `docs/product/*-design-system.md`, and any mockup repo spec are reference material only. If a new visual direction is chosen, update `tokens.ts` first and delete/archive prior markdown specs in the same PR.
4. **`InPageCollectorApp.tsx` hard cap: 400 lines** — locked because the shell had ballooned to 1442 lines on 2026-04-17 before T9. It is now a thin wrapper again; any PR touching this file must keep it at or below 400 lines unless explicitly labeled `refactor:shell-migration`. Growth requires deleting a matching number of lines elsewhere in `src/ui/`.
5. **One UI slot per contract field** — no `CompareBrief` / `CompareHeroSummary` / `EvidenceAnnotation` field may render twice in the same user-visible page. When adding a new surface, first grep the field name across `src/ui/` and either remove the prior render or do not add the new one.

Violations block merge. When in conflict with an older doc, these rules win.

## What This Repo Is

Production MV3 Chrome extension for capturing Threads posts, organizing them into local folders, queueing them to an optional ingest backend over HTTP, comparing two crawled posts by rendering backend read models plus extension-side brief summaries, and turning already-found Threads posts into PR evidence CSVs.

The extension is now **extension-first**, not SaaS-first:

- local folders and UI state live in `chrome.storage.local`
- backend owns crawl jobs and the canonical clustering / deterministic analysis read model
- extension owns user API keys, compare one-liners, Product signal judgments, and PR criteria matching
- runtime does not depend on any hard-coded local backend checkout path
- `src/analysis/*` is the stable display/read-model layer: evidence lookup, cluster ranking, visible suppression, compare-row shaping, and experimental ports stay detached from the canonical backend output
- `src/compare/*` is the extension-side brief layer: prompt building, parsing, deterministic fallback, and cache-key helpers around backend analysis snapshots

## Quick Start

1. Read `docs/architecture/dlens-current-architecture-map.md` first; it is the live architecture/status map.
2. Read `README.md` when working in the active product/PR worktree.
3. Read `docs/memory/current-state.md`.
4. If you are in another checkout, confirm whether the task belongs there or in `dlens-product-latest` before editing.
5. For Chrome/runtime QA, use Jason's `Default` Chrome profile (`jason@brandonproject.co`). It is the local profile that has DLens installed from `output/chrome-mv3`; do not substitute a temporary Chrome profile for user-visible QA.
6. Run:

```bash
cd dlens-product-latest
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
```

## Current Working Features

- hover-to-preview on Threads feed and post-detail pages, with stale overlay reset on SPA route changes
- engagement extraction for likes, comments, reposts, forwards, views
- repost-aware author extraction
- folder CRUD and save accumulation
- popup workspace shell now uses an editorial masthead + left rail with primary mode navigation for `Library / Compare / Collect`, plus a separate Settings utility action
- `pr-evidence` workspace mode is live with `PR Evidence / Collect / Settings` navigation, one active campaign per PR session, PDF/txt/md brief upload, six editable criteria, compact evidence ledger, explicit batch matching with deterministic backstop, CSV preview/export, and Markdown/DOCX PR audit summary export
- Layout preferences remain persisted under `ExtensionSettings.layoutPreferences`, but Settings no longer exposes the visible Layout preference card. Product signal card (`verdict` / `marginalia`, default `marginalia`), Topic synthesis (`stack` / `console`, default `console`), and Compare result (`reading` / `parallel` / `chapters`, default `parallel`) stay supported through persisted state and call sites.
- Product signal cards support both Verdict and Marginalia layouts in `ActionableItemCard`; keep `reusable_pattern` as the card headline, cited evidence visible, and `experimentHint` / `agentTaskSpec` in the task slot
- Product Agent Brief uses `SignalReading` records as a local corpus: generate free-text readings on demand, review them, file useful readings, and compose filed-only Markdown for coding agents
- Signal Packet export is live for Product sessions: background can build per-signal packets and export HTML/JSONL through `src/compare/signal-packet.ts` and `src/compare/signal-packet-export.ts`; packets include source, evidence, judgment, ProductContext, readings, feedback timeline, agent handoff, topic context, and `decisionTrace`.
- Signal Reading review cards keep a compact Marginalia signal strip (`verdict`, `referenceType`, `relevance`) inside the active card so the reading workflow does not lose product-signal density
- Marginalia is the simplified default Product signal card: no verdict in the eyebrow, no FOOTNOTES header, no repeated bottom AI experiment/judgment detail panels, and flat label-stacked workflow evidence rows. Verdict keeps the boxed evidence/detail treatment.
- Product classification list rows stay scan-first: no relevance dots, and `最新在前` only appears when the selected type group has at least two signals.
- Topic Detail no longer renders the old deterministic keyword-frequency card. It lazy-loads client-side LLM `SignalTagsRecord` entries from `dlens:v1:signal-tags`, shows a semantic tag cloud, and displays each signal's `signalGist` plus 3-5 tag chips.
- Topic Detail can generate per-signal `TopicSignalReading` records with or without a topic research question. With a question it runs anchored mode; without one it runs exploratory mode over the real post/reply evidence. Rows show stance, reading, audience signal, and uncertainties.
- Topic synthesis still exists as deterministic `v3.generic-keyword-lens` storage/logic for legacy records and future L2 work, but it is not the primary Topic Detail display surface.
- Folder synthesis uses deterministic `v3.generic-keyword-lens` output for cross-topic keyword aggregation and stores records at `dlens:v1:folder-synthesis`
- Compare Result supports Parallel and Chapters layouts alongside the older Reading path; Parallel is the current default and uses sticky A/B columns
- Result remains a contextual reading route rather than a primary rail destination
- queue single post or all pending posts to ingest-core, forwarding the active folder name in `client_context.folder_name`
- **Process All** button (combined queue + drain) always visible in Library, no item selection required
- **Processing error surfacing**: worker-drain failures no longer collapse to a generic `Processing failed` toast; popup now surfaces the backend/drain message and mirrors it into `tab.error`
- **Processing strip** now sits outside the mode rail as a compact context strip: action-forward state, ready/total counts, and no dashboard-style breakdown
- **Processing strip refinement (2026-04-08)**: the strip now uses a compact progress ring, explicit phase copy (`Capturing comments...` / `Mapping comments into clusters...` / `Preparing Compare...`), and skeleton placeholders instead of a dot-only waiting state
- **Pending-state skeletons (2026-04-17)**: `LibraryView` pending rows and the Compare unavailable hero now render shimmer placeholders while posts are queued/crawling/analyzing; keep this visual-only, do not invent fake progress percentages, and keep new skeleton colors on shared token values.
- **Rounded surface clip fix (2026-04-09)**: the popup shell now separates the rounded outer frame from the inner scroll viewport, and shared surface cards clip inner divider/list content by default so long comment/readiness surfaces no longer visually square off at the corners
- **Compact compare verdict pass (2026-04-09)**: Compare hero now compresses the AI brief into a shorter verdict headline plus a localized `創作提示`, while the longer implication remains inside the expandable brief body; keyword pills are clickable and expand/focus the brief state, and compare-brief prompt guidance now asks for one-line verdicts and short actionable cues instead of mini-report paragraphs
- **Compare section-anchor pass (2026-04-09, updated 2026-04-10)**: `Receipts`, `Discussion move`, and `A/B divergence` now use lighter 11px/600 anchors with spacing-first separation; compare field labels and post-header labels share the same lighter grammar, and section identity depends less on outer divider chrome
- **Compare section-anchor spacing pass (2026-04-09)**: the three primary analysis sections now keep an actual `20px` break before their anchors, and `SectionLabel` no longer carries a dead `size` prop that implied a second, non-existent anchor variant
- **Compare label casing lock (2026-04-17)**: `SectionLabel` and `PostHeader` stay sentence-case with `12px / 600 / 0.02em`; do not reintroduce uppercase chrome or the older `0.06em` tracking.
- **Bubble navigator semantic labels (2026-04-17)**: `ClusterBubbleMap` hover previews now lead with `${clusterTitle} · ${percentage}%`; keep the in-bubble `%` badge, preserve hover-preview / click-to-lock behavior, and avoid re-rendering the same cluster title twice inside the preview card.
- **Keyword pill distinction pass (2026-04-09)**: compare hero keywords now render as ghost-outline exploration pills while alignment badges keep a filled semantic state treatment, so the two pill systems no longer read as the same visual object before interaction logic changes
- **Keyword evidence filter pass (2026-04-09)**: clicking a compare hero keyword now also narrows `Receipts` to Post A, Post B, or both via a deterministic text matcher over cluster title/thesis/direction/evidence; ambiguous keywords deliberately fall back to both sides rather than forcing a false single-side read
- **Discussion-move presentation pass (2026-04-10)**: Compare now reads more like field notes than a neutral report: first-screen evidence is labeled `Receipts`, the former `Technique` buttons are promoted into `Discussion move` cards before `A/B divergence`, and each card uses `Observed / Interpretation / Needs reply tree` so tactic readings stay explicitly grounded and uncertain until reply structure exists. `Add to tactics library` is visible but disabled as a Phase 2 affordance.
- **Operational hardening pass (2026-04-09)**: compare providers now use a `30s` timeout with up to `2` retries and short backoff; compare brief / one-liner / cluster-summary caches now trim to `50` entries via access-based eviction; and queued/running/late-analyzing items now auto-fail after `5` minutes without backend status updates instead of waiting forever
- popup worker status feedback (`idle` / `draining` / `already running` toast)
- job polling and late analysis polling (10s interval, exponential backoff on failure)
- compare tab for any 2 **ready** items (crawl + analysis both succeeded)
- compare and result tabs now auto-expand popup width to 560px with smooth CSS transition
- **readiness board**: per-item status list when < 2 items are ready
- smart entry chooses the initial workspace mode once per popup open, then preserves user mode control until the popup closes
- auto-pair selection via `pickCompareSelection()` with self-compare prevention
- **redesigned Compare UI** (2026-03-30, updated 2026-04-08): intelligence-first layout — compact selector strip → thesis-first analysis sheet → collapsible support data → engagement compare → expandable comments
- **audience cluster navigator**: dual bubble maps (A/B), hover preview, click-to-lock selected cluster detail, AI-enhanced one-line summaries with deterministic fallback, audience-evidence-first detail panel, inline evidence metrics, and an analysis summary strip with plain-language dominance label (高度集中/中度分散/高度分散); these now live behind collapsed support data instead of leading the first screen
- Compare post headers now show total comments captured, not ambiguous `comments crawled` copy
- engagement compare now splits raw totals from a provisional momentum surface and shows approximate age labels when only `time_token_hint` is available
- Compare shows a compact inline notice when AI keys are missing instead of rendering an empty AI Summary card
- compact post headers replace old verbose post cards
- Library selected-post raw comments cap at 10 by default and label truncation as `Comments (10/N)`
- top comments collapsed by default with expand toggle
- client-side compare summaries using the user's Google (Gemini 3.1 Flash Lite), OpenAI, or Claude key; Google is the default provider
- per-cluster AI summaries use the same local provider/key; invalid or failed model responses fall back to deterministic cluster copy
- manifest host permission for Google Generative Language API is present so Gemini compare requests can execute from the background worker
- MV3 wake recovery and retry-on-connection-loss behavior
- `localPage` state for instant tab switching (no round-trip delay for width/content change)
- `chrome.storage.local` persistence with schema-backed extension state; hover state remains in memory only
- standalone analysis toolkit under `src/analysis/`
  - stable deterministic helpers for evidence lookup, cluster ranking, and compare-side shaping
  - experimental Python-parity ports for keyword extraction, like-share metrics, and cluster interpretation seed building
  - CompareView now consumes the stable deterministic layer; experimental ports remain out of production
- popup shell split is now in place
  - shared atoms live in `src/ui/components.tsx`
  - `InPageCollectorApp.tsx` is a thin wrapper that delegates to `useInPageCollectorAppState.ts`
  - popup layout is split across `InPageCollectorPopup.tsx`, `InPageCollectorOverlays.tsx`, and `InPageCollectorFolderControls.tsx`
- background queue/refresh writes now serialize through a shared async lock, so bulk queue/refresh sweeps do not overwrite sibling item updates
- shared popup design tokens now live in `src/ui/tokens.ts`; common atoms read from that source
- **editorial warm-paper visual design (2026-04-20)**: `tokens.ts` now defines the active field-guide direction — warm paper canvas, deep ink text, matte paper shadows, and navy/oxide accents. Treat the earlier soft-white-glass notes as superseded reference material, not the current spec.
- **Compare display correction pass (2026-04-02)**: Compare keeps independent selected clusters for Post A and Post B, hides raw backend cluster counts behind `1 dominant cluster` / `+N low-signal clusters hidden` display copy, upgrades support metrics into icon-first pills, collapses audience evidence until clicked, and only shows cross-post cluster hints inside the selected detail panel
- popup shell separation on pure white pages was strengthened with a clearer border and deeper shadow so opening the launcher remains visually obvious on Threads' own white background
- compare planning is now documented in `docs/product/2026-04-03-compare-working-plan.md`, explicitly split into immediate extension work, backend-dependent work, new feature proposals, and deferred architecture path; the immediate sequence is evidence-first, and any future compare gate is framed as a soft reaction rather than a hard issue-classification control
- the next Compare presentation pass is constrained by `docs/product/2026-04-03-compare-frontend-brief.md`: presentation-only, fewer cards, stronger bubble hierarchy, and a single selected-cluster dock; it must not redefine backend semantics or cluster logic
- the current product-shape recovery note is `docs/product/2026-04-04-two-page-product-plan.md`: `Compare` is the fast decision-entry page, `Technique / Evidence` is the deeper reading page for tactic-like interpretation, and `Library` should evolve toward a casebook of saved evidence / techniques rather than a post tray
- the 2026-04-06 acceptance notes are now folded into `docs/product/2026-04-04-two-page-product-plan.md`: if clusters like `航班調整影響` and `香港快運航班調整` split apart, treat that as backend merge/pairing quality, not a Compare-only bug; audience-evidence metrics now use a shared four-icon row; `Technique / Evidence` now uses Chinese-first cards rather than English placeholder rows
- **Observation-first compare contract (2026-04-20, prompt v8 as of 2026-05-20)**: `CompareBrief` includes `relation` alongside `headline`, `supportingObservations[]`, `aReading`/`bReading`, `whyItMatters`, `creatorCue`, and `confidence`; evidence catalog remains `e1..eN` alias-based; uncited observations/readings are still rejected at parse; `whyItMatters` is constrained to one short consequence sentence; `relation` is extension-owned presentation synthesis, not backend cluster truth.
- **Evidence annotation layer (2026-04-14)**: third analysis tier targeting individual quotes (not clusters); `src/compare/evidence-annotation.ts` defines `EvidenceAnnotation` (`writerMeaning` / `discussionFunction` / `whyEffective` / `relationToCluster` / `phraseMarks`); max 4 quotes per compare call; background handles `compare/get-evidence-annotations` with cache + per-quote deterministic fallback; `CompareView` loads annotation map after cluster summaries resolve and threads it to `DictionaryCard` plus selected-cluster evidence detail rows, which now show `（尚未個別分析此留言）` instead of fabricated prose when no annotation exists; prompt version `v1`
- **Editorial shell pass (2026-04-20)**: popup IA now uses a masthead + left rail shell; `Collect` is back as a primary mode, `Settings` keeps utility-drawer behavior, and `Result` stays the dedicated contextual reading route with hybrid landing (`active result -> newest saved analysis -> empty state`)
- saved analyses now persist in `chrome.storage.local` under `dlens:v1:saved-analyses`; tab UI state now tracks `currentMainPage`, `activeCompareDraft`, `activeAnalysisResult`, and `lastViewedResultId`
- **Compare setup contrast fix (2026-04-14)**: `CompareSetupView` now renders on a soft gray work surface again instead of collapsing into a single white slab; the header, selector block, and teaser block keep distinct card elevation so setup reads like a staged pairing flow
- **Result surface cleanup pass (2026-04-14)**: Result now renders without an extra clipping surface wrapper, so inner cards keep their edges and rounded corners; representative evidence cards use a blank grey placeholder avatar plus inline engagement metrics; and the validation drawer keeps only the new cluster distribution graph + methodology, with the old dual bubble-map navigator removed from that flow
- **Ambient cluster field pass (2026-04-14)**: `FlowingClusterViz` now keeps dots anchored to stable cluster origins, adds very slow idle drift, applies only local cursor repulsion instead of whole-cloud distortion, clamps total drift so clusters stay readable, honors `prefers-reduced-motion`, uses smaller particle radii, and no longer draws enclosing halo ellipses around each cluster cloud
- **Validation grouping pass (2026-04-14)**: the trust drawer under `FlowingClusterViz` no longer renders six neutral stat tiles; it now groups support data into `資料覆蓋` and `結構特徵`, and uses lighter accent-topped stat tiles instead of a second role-chip card row under the graph
- first compare trust batch is now in the UI: top evidence is surfaced above the audience navigator, compare hero exposes quick jumps to clusters/engagement/comments, visible cluster copy is positive-first (`Showing X most significant clusters`), and alignment/momentum presentation is demoted to readable-proxy support instead of headline-strength labels
- Compare hidden-cluster copy now uses the actual `analysis.clusters.length` array as the display source of truth; `metrics.n_clusters` is treated as backend metadata only and no longer inflates navigator copy when old analyses or stale processes drift
- Compare now includes a sticky section rail (`Clusters / Engagement / Comments`) that stays visible after the hero scrolls away and preserves the fast evidence-first reading loop
- Compare now has an internal `Technique / Evidence` second page with a `Deeper reading →` jump from the selected-cluster dock, reverse `← back to cluster` navigation, cluster-specific notebook context, shared four-icon evidence metrics, and local saved-reading snapshots in `chrome.storage.local` under `dlens:v1:technique-readings`
- Library now reads `dlens:v1:technique-readings` through a dedicated background message and splits internally into `Posts / Casebook`, so saved readings render in a notebook-like casebook view instead of competing with the saved-post list
- **Library readiness table pass (2026-04-08)**: Library now treats posts as preparation rows instead of product cards — `ready`, `near-ready`, `moving`, and `later` render as dense line-separated tables, and the selected post reads as an inspection sheet rather than a second dashboard card
- **Library row refinement (2026-04-08)**: readiness rows now render a 28x28 placeholder avatar, clearer support-copy hierarchy under `Readiness table`, and keep compare affordance in the row grammar rather than in extra card chrome
- **Compact shell strip pass (2026-04-08)**: the popup no longer opens under a large workspace overview card; folder switching now lives in a thinner utility strip so the shell reads more like desktop chrome and less like a dashboard hero
- **Collect capture-card pass (2026-04-08)**: Collect now keeps preview, keyboard hints, and collect-mode entry/exit in a single low-friction decision surface
- **Settings drawer grammar (2026-04-08)**: Settings remains page-backed for now, but the UI now behaves like a narrower utility drawer with runtime-focused connection and key groups rather than a fourth full-weight page
- **Compare honesty pass (2026-04-08, updated 2026-04-10)**: Compare now opens as a single analysis sheet (`thesis → receipts → discussion move → A/B divergence`) with badge-row stance copy and a stacked evidence ledger instead of side-by-side primary cards; bubble maps, cluster summaries, and selected-cluster detail are demoted into a collapsed support-data section until the user explicitly opens them
- **Review cleanup pass (2026-04-08)**: Compare section labels no longer use all-caps chrome, evidence reasons now cite the selected comment text instead of generic cluster-title templates, and the shell canvas has been pulled off pure white so the popup keeps separation on white Threads surfaces
- **Runtime guard pass (2026-04-08)**: extension-owned render/runtime errors in the content script no longer blank the whole workspace silently; `threads.content.ts` now swaps in a visible crash fallback so the failing path can be identified instead of looking like the extension disappeared
- **Compare brief cache fix (2026-04-08)**: legacy compare-brief cache entries no longer crash the Compare hero; `background.ts` now normalizes cached brief payloads against the current insight contract, `COMPARE_BRIEF_PROMPT_VERSION` has been bumped, and `CompareView` no longer assumes `whyTrue` / `implication` always exist at runtime
- **Technique notebook pass (2026-04-08)**: `Technique / Evidence` is now a cluster-specific notebook page rather than a glossary carousel; cluster thesis/context comes first, evidence reads like case notes, and each technique must explain how it appears in the current cluster
- **Technique missing-detail fallback (2026-04-08)**: if the deeper-reading route loses its selected cluster context, the popup now shows an explicit fallback with `Back to Compare` instead of rendering a blank workspace
- **Compact evidence metric row (2026-04-06)**: shared audience-evidence metrics now stay on one line with smaller icon badges, tighter gaps, and `1k+` shorthand for values above 999
- **Technique selective swipe pass (2026-04-08)**: technique detection now adds extension-side trigger/specificity/display scoring; saved snapshots keep original technique order, while `TechniqueView` ranks only at render time and surfaces the top 1-2 notes as swipe cards with dot indicators
- **Compare brief fast-reading pass (2026-04-08)**: `CompareBrief` now includes `keywords[]`, `COMPARE_BRIEF_PROMPT_VERSION` is `v4`, the compare hero shows headline + keyword pills + visible implication, and the full brief body (`whyTrue / aDirection / bDirection / implication`) stays collapsed until expanded
- **Support-data swipe detail pass (2026-04-08)**: bubble maps remain the comparison object, but support detail now moves into side-specific swipe pages (`Post A clusters` / `Post B clusters`) instead of stacked dual cluster cards
- **Export placeholder (2026-04-08)**: Compare ends with a visible `Export full report` action framed as `Developing`; no local file generation exists yet
- compare-level brief now has a narrower production contract: deterministic fallback first, then AI upgrade for `headline`, `why_true`, `a_direction`, `b_direction`, and `implication`
- generic cluster labels are rejected from AI output; deterministic fallback copy also avoids weak labels like `general`
- low-signal micro-clusters are suppressed in the stable analysis layer, so Compare can collapse to a single dominant discussion when needed
- ProcessingStrip, LibraryView, and Compare now expose stable phase/state `data-*` outlets for a later SAO/glass frontend pass without changing data logic

## DictionaryCard Behavior Contract (2026-04-17)

**DictionaryCard is the primary evidence display component in `src/ui/CompareView.tsx`.** The rules below govern its rendering behavior. Do not regress them.

### Rendering modes

| `analysis` | `effectiveness` | UI mode |
|---|---|---|
| non-null string | non-null object | **Full card**: header + quote + 剖析 block + "為什麼被挑出來" expander |
| non-null string | `null` | **Full card without expander**: header + quote + 剖析 block only |
| `null` | any | **Compact mode**: header + quote only. No 剖析 block. No expander. No fallback copy. |

### `effectiveness` prop shape

```ts
effectiveness: {
  discussionFunction: string;  // 在討論中扮演什麼角色
  relationToCluster: string;   // 跟 cluster 主線的關係 (may be empty)
  whyEffective: string;        // 修辭為什麼有效
} | null
```

- `hasEffectiveness` guard: `effectiveness !== null && (effectiveness.discussionFunction.length > 0 || effectiveness.whyEffective.length > 0)`
- If both core fields are empty, expander is hidden (same compact posture)
- `relationToCluster` is optional within the object — render conditionally

### Call-site mapping

```ts
// CompareView.tsx — inside the evidence-rendering loop
const analysisText = annotation?.writerMeaning || null;
const effectivenessData = annotation ? {
  discussionFunction: annotation.discussionFunction,
  relationToCluster: annotation.relationToCluster,
  whyEffective: annotation.whyEffective,
} : null;
```

`discussionFunction` is NOT a fallback for `writerMeaning`. It has its own slot in `effectivenessData`.

### Testing pattern

`renderToStaticMarkup` only captures initial state — expanded panel content is NOT visible in static HTML. To test `DictionaryCard` directly, use `compareViewTestables.DictionaryCard` (exported from `CompareView.tsx`), not the full `CompareView`.

---

## Result Surface Spacing Contract (2026-04-17)

Result page vertical rhythm is owned by two tokens in `src/ui/tokens.ts`:

- `tokens.spacing.resultSectionGap` (`32px`) — gap between top-level Result sections
- `tokens.spacing.resultCardGap` (`16px`) — gap between cards within a section

The Result container uses `display: flex; flex-direction: column; gap` against these tokens. Do NOT reintroduce per-section `marginTop` / `marginBottom` overrides or height-spacer `<div>`s. If a new Result section is added, it inherits the gap automatically — do not hand-tune its spacing.

---

## Standalone Workspace Modes

- `extension-only dev`
  - `npm run typecheck`, tests, `npm run build`, Compare UI work, and summary work do not need any backend checkout
- `full pipeline dev`
  - runtime still only needs `settings.ingestBaseUrl`
  - local backend discovery is a dev convenience only: prefer `DLENS_INGEST_CORE_DIR`, otherwise `npm run backend:locate` checks `../dlens-ingest-core`
  - auth files and crawler credentials are backend startup concerns, not extension runtime concerns

## Product Phase B State (2026-04-27)

Product mode is no longer an honest stub in the Phase B worktree:

- extension name is `DLens v3` in `wxt.config.ts` and the built manifest
- `ProductContextCompiler` lives in `src/compare/product-context.ts`
- compiled ProductContext is stored at `dlens:v1:product-context`; legacy `dlens_product_context` is migrated forward
- `ProductSignalAnalyzer` lives in `src/compare/product-signal-analysis.ts`
- product analysis storage lives at `dlens:v1:product-signal-analyses`
- background messages are wired: `product/get-context`, `product/list-signal-analyses`, `product/analyze-signals`
- background has a session-level in-flight guard for product analysis to avoid duplicate LLM calls
- UI lives in `src/ui/ProductSignalViews.tsx` and is mounted through `InPageCollectorPopup.tsx`
- evidence mapping is built in `useTopicState.ts` and passed as `evidenceBySignalId`

The ProductSignalAnalyzer output contract is:

- `signalType`: `learning | competitor | demand | technical | marketing | noise`
- `signalSubtype`: precise behavior or technical pattern, for example `mcp_integration`, `browser_automation`, `recurring_data_crawl`, `pm_document_generation`
- `contentType`: `content | discussion_starter | mixed`
- `relevance`: `1..5`
- `relevantTo`: `ProductContext` field names plus learning/reference targets (`technicalLearning`, `workflowPattern`, `marketLanguage`, `productAnalogy`, `generalLearning`, `noDirectFit`)
- `referenceType`: `product_reference | technical_learning | workflow_pattern | market_language | general_learning | no_direct_fit`
- `referenceLabel` / `referenceTakeaway`: user-facing "對產品可參考 / 可學習" layer; do not force every useful signal into direct product relevance
- `verdict`: `try | watch | park | insufficient_data`
- `evidenceRefs`: valid `e1..eN` discussion reply refs only
- `experimentHint`: optional
- `agentTaskSpec`: optional and only for `verdict = "try"`; `taskPrompt` must be directly pasteable into Codex / Claude / a generic agent

Important product boundary:

- Product mode should show useful insights, cited evidence, verdicts, experiment hints, and agent task prompts.
- Product mode should not expose backend clusters as the main user output.
- Topic mode may keep Casebook / folder-like topic concepts; Product mode should avoid leaking the old folder concept into the user-facing workflow.
- The prompt must not use or reintroduce `contentTypeHint`; content type is a ProductSignalAnalyzer output over the assembled thread.

Live crawl lesson from the Kathy Threads test:

- discussion replies are first-class product intelligence, especially around recurring crawl, MCP/tool calling, browser automation, and PM document generation
- backend `ThreadReadModel` is the quality gate for product analysis
- C-Backend B1-B4 now remove root duplication, split true OP continuation from OP reply chatter, carry orphan/reply metadata into extension evidence, type the API read-model response, and lock seven shared golden thread fixtures across backend and extension projection

Do not start signal digest, watch mode, mobile share extension, or MCP execution until the ThreadReadModel and ProductSignalAnalyzer output are stable in Chrome.

## Layout Preference State (2026-05-14)

The layout sprint line is on `main`:

```text
2738d2f feature: Persist layout preferences (#4)
f52f73b feature: Compare result parallel and chapters layouts (#3)
16ae177 feature: Product signal and synthesis layout variants (#2)
```

Important implementation points:

- `LayoutPreferences` lives in `src/state/types.ts`.
- `createDefaultLayoutPreferences()` returns `marginalia`, `console`, and `parallel`.
- `settings/set-layout-preferences` merges partial layout updates through the background storage path.
- `SettingsView.tsx` no longer owns visible layout controls; it stays focused on folder mode, connection/storage usage, API keys, and ProductProfile.
- `InPageCollectorPopup.tsx` threads persisted layout settings into Product signal cards, Topic synthesis, and Compare Result.
- Topic Detail's primary overview is now semantic `SignalTagsRecord` data from `dlens:v1:signal-tags`, not deterministic keyword frequency. `TopicSynthesis` and `FolderSynthesis` remain deterministic extension-side layers over analyzed signals for legacy/folder contexts and do not replace backend clustering.
- Latest merged-code verification was run from `dlens-product-latest`: `726/726` tests, `npm run typecheck`, and `npm run build` passed. Open PR #22 is separately verified at `732/732` with GitHub `verify` checks passing.
- The verified unpacked build was copied to `output/chrome-mv3` for Chrome load-unpacked use.
- User-visible Chrome QA must use Jason's `Default` Chrome profile (`jason@brandonproject.co`), where the unpacked DLens extension is installed from this repo's `output/chrome-mv3`. Open DLens through the real extension action or the content-script in-page launcher on a real Threads page; do not count a direct `chrome-extension://.../sidepanel.html` tab or a temporary Chrome profile as user-visible QA.
- `dlens-product-latest` source checkout may be dirty; do not infer clean source state from the copied build artifact.

## Motion Layer State (2026-05-19)

The shared motion layer is pure CSS/token-based and injected under `data-dlens-control="true"`:

- `src/ui/tokens.ts` owns spring-like easing and keyframe shorthands.
- `entrypoints/threads.content.ts` injects `DLENS_MOTION_CSS` plus one-shot `dlens-bump` / `dlens-success-pulse` keyframes.
- `src/ui/components.tsx` applies the global button press/lift grammar through `data-dlens-button`.
- `ProductSignalViews.tsx` uses the same layer for verdict filter sliding plates, card hover/lift, smooth disclosure, loading shimmer, copy feedback, and filed-reading compose highlights.
- All motion must keep a `prefers-reduced-motion` guard.

## Version Rule (locked 2026-05-14)

Every user-visible update that is pushed to `main` should bump the extension version unless the user explicitly says not to. Keep these four locations in sync:

- `package.json`
- `package-lock.json`
- `wxt.config.ts` `manifest.version`
- `src/ui/version.ts` `BUILD_VERSION`

The Chrome extension page shows `manifest.version`; the popup masthead shows `BUILD_VERSION`. `tests/manifest-config.test.ts` locks package / manifest / UI version consistency. After a version bump, run typecheck, tests, build, and copy the verified build to `output/chrome-mv3` if that is the active load-unpacked folder.

## Signal Reading Review State (2026-05-20)

Product Agent Brief now has a local reading-corpus layer:

- `src/compare/signal-reading.ts` builds free-text SignalReading prompts and source packet hashes; prompt version is `v9`.
- `SIGNAL_READING_EVIDENCE_CAP` is 15; representative refs now union analyzer refs with top-liked replies, preserving like counts in the stored source packet and source-packet hash.
- `src/compare/signal-reading-storage.ts` stores `SignalReading[]` at `dlens:v1:signal-readings`, with `model`, `sourceRefs`, trimmed `sourcePacket`, `reviewState`, and append-only `feedbackEvents`.
- `product/synthesize-signal-reading` supports `force: true` to regenerate stale or legacy readings instead of returning the cache hit.
- `product/list-signal-readings` returns readings for the UI to match against current saved signals by `signalId`; review actions target `cacheKey`.
- `product/review-signal-reading` appends a review event and sets `reviewState` atomically.
- `src/compare/signal-reading-brief.ts` owns the filed-only gate. Brief output must only use readings where `reviewState === "filed"`; stale filed readings are allowed but marked.
- `ProductSignalViews.tsx` owns the Review → Compose UI and must not duplicate the filed-only filter outside the shared pure module.

## Signal Packet Export State (2026-05-20)

- `src/compare/signal-packet.ts` builds `DLensSignalPacket` records from storage without asking the backend to recompute anything.
- `DLENS_SIGNAL_PACKET_VERSION` is `v3`; keep new JSONL fields additive unless a reader-breaking semantic change is unavoidable.
- Background messages are wired: `signal-packet/get`, `signal-packet/index`, and `signal-packet/export`.
- HTML export is a human reading surface; JSONL export is the agent handoff surface. HTML must not expose `decisionTrace` as raw reasoning text.
- Packet output includes source provenance, top-level text evidence, latest/filed/all readings, feedback timeline, agent handoff, topic context, and `decisionTrace`.
- Current known review items for the next HTML/JSONL sprint: rename/limit HTML cited evidence, add provenance strip, add true `citedInReadingRefs`, clarify superseded readings, and investigate root `source.pageUrl` fallback before changing capture paths.

## PR Evidence Mode V1 State (2026-05-07)

PR Evidence mode is implemented as a separate workspace type for agency / PR operators.

- `FolderMode` includes `pr-evidence`.
- Main route is `pr-evidence`; allowed pages are PR Evidence + Collect + Settings.
- Popup width for the PR workspace is `720px`.
- Data lives in `src/state/pr-evidence-storage.ts`.
- PR contracts live in `src/compare/pr-evidence.ts`.
- UI lives in `src/ui/PrEvidenceViews.tsx`.
- Background messages include `pr/list-campaigns`, `pr/save-campaign`, `pr/list-evidence-rows`, `pr/save-evidence-row`, `pr/generate-criteria`, `pr/match-criteria`, and `pr/generate-summary`.
- Storage keys are `dlens:v1:pr-campaigns` and `dlens:v1:pr-evidence-rows`.

Contract rules:

- V1 has one active campaign per PR Evidence session. Do not add campaign switching unless explicitly requested.
- Criteria ids are fixed at `c1..c6`; labels are editable, count is not.
- Criteria generation accepts common AI JSON shapes and must fall back to campaign-specific deterministic labels rather than leaving `criterion_1..6`.
- Collect creates `PrEvidenceRow`, not Topic `Signal` or Product analysis.
- Collect must not run AI. AI only runs on explicit criteria generation, explicit batch matching, or explicit summary generation.
- Criteria match output is `✓ / blank` only. Deterministic visible-keyword matching may backstop AI results, but do not add confidence, explanations, `?`, duplicate groups, reach, EAV, or follower scraping to V1 rows.
- CSV is the primary evidence output and includes UTF-8 BOM. CSV preview is read-only, capped to header + first 20 rows, and should not render blank-looking cells without placeholders.
- Topline PR audit summary is facts-first and client-ready Markdown. It uses `Executive Read`, `Message Pull-Through`, `Interpretation`, `Evidence Highlights`, and `Data Limits`; AI may rewrite tone but must not invent reach, EAV, or all-channel claims.
- Summary export supports `.md` and true `.docx` through `src/ui/pr-summary-export.ts`.
- Views may be extracted from DOM metrics or inferred from visible text like `132 views`; if Threads does not expose views, leave them unavailable rather than estimating reach.

V1 non-goals:

- no social listening
- no duplicate policy
- no true reach
- no EAV
- no XLSX
- no detail inspector
- no in-app spreadsheet editing

## Slice A–B: Mode-Aware Topic Intelligence Layer (2026-04-23)

This was a major product-direction change. Summary for any agent picking up here:

### What changed

**Product direction**: dlens is no longer just "capture two posts → compare brief". It is now a **mode-aware Threads intelligence extension**. Each folder carries a `mode` (`archive | topic | product | pr-evidence`) that determines which surfaces mount and which AI passes run.

**New core objects**: `Topic` (named discussion container with status + signalIds + pairIds) and `Signal` (inbox item linking a captured post to a topic after triage).

**New navigation rule**: `ALLOWED_PAGES` in `InPageCollectorPopup.tsx` determines which nav icons mount. `archive` = Library + Collect only. `topic`/`product` = Casebook + Inbox + Collect + Compare. `pr-evidence` = PR Evidence + Collect. Pages not in the allowed set are *unmounted*, not disabled.

**Save routing**: `ensureSignalForSavedItem()` in `background.ts:607` is called after every successful save in `topic`/`product` mode. Creates a `Signal { inboxStatus: 'unprocessed' }` in the Inbox. Idempotent (deduped by `itemId`).

**Judgment Pass 2**: `getOrGenerateJudgment` at `background.ts:478` is the 5th `createLlmCallWrapper` — same pattern as brief/cluster/annotation. Uses `buildJudgmentPrompt(brief, profile)` + `parseJudgmentResponse` from `src/compare/judgment.ts` (fully implemented). Cache at `dlens:v1:compare-judgment-cache`. Fallback via `buildDeterministicJudgment`.

### New files

| File | Purpose |
|------|---------|
| `src/state/topic-storage.ts` (250 lines) | Topic + Signal CRUD, normalizeTopic, normalizeSignal, triageSignal |
| `src/ui/CasebookView.tsx` (266 lines) | Topic triage console with status filter tabs |
| `src/ui/InboxView.tsx` (276 lines) | Signal inbox with assign/create-topic/archive triage |
| `src/ui/TopicDetailView.tsx` (373 lines) | Single topic: overview, signals, pairs, judgment panel (product mode) |
| `tests/topic-storage.test.ts` | Topic/Signal CRUD + triage edge cases |
| `tests/casebook-view.test.tsx` | CasebookView rendering + filter |
| `tests/inbox-view.test.tsx` | InboxView triage flow |
| `tests/topic-detail-view.test.tsx` | TopicDetailView three tabs |
| `tests/judgment-eval.test.ts` | Judgment prompt/parser/fallback determinism (no real LLM calls) |
| `tests/judgment-fixtures.ts` | 18 golden fixture pairs for eval |

### Modified files (significant)

| File | Change |
|------|--------|
| `src/state/types.ts` | Added `FolderMode`, `Topic`, `Signal`, `TopicStatus`, `SignalSource`, `SignalInboxStatus`; added `mode` to `SessionRecord`; expanded `MainPage` to include `'casebook' | 'inbox'` |
| `src/state/messages.ts` | Added `topic/*`, `signal/*`, `session/set-mode`, `TriageAction` |
| `src/state/store-helpers.ts` | `normalizeSessionRecord` defaults `mode` to `'topic'` for legacy sessions |
| `entrypoints/background.ts` | Expanded in Slice A-B and later Product / PR / Signal Packet / TopicSignalReading work; current split roadmap lives in `docs/ENGINEERING_PLAN.md` |
| `src/ui/InPageCollectorPopup.tsx` | Mode guard (`ALLOWED_PAGES` + `guardPage`); casebook + inbox + topic detail + PR routing |
| `src/ui/useInPageCollectorAppState.ts` | Grew after Product / PR / export / TopicSignalReading orchestration; current extraction roadmap lives in `docs/ENGINEERING_PLAN.md` |
| `src/ui/CompareView.tsx` | Breadcrumb + "附加至案例" button for topic context |
| `src/ui/CollectView.tsx` | Save toast changes to "已加入收件匣" in topic/product mode |
| `src/ui/SettingsView.tsx` | Folder mode selector + ProductProfile form (product mode only) |

### Files NOT changed

`src/compare/judgment.ts`, `src/compare/saved-analysis-storage.ts`, `src/compare/brief.ts`, `src/compare/provider.ts`, `src/compare/evidence-annotation.ts`, `src/compare/cluster-interpretation.ts`, `src/ui/LibraryView.tsx`.

### Test gate

```bash
npm run typecheck && npx tsx --test tests/*.test.ts tests/*.test.tsx
# Expected on current checkout: 618 pass, 0 fail
```

### Current engineering roadmap

This older handoff section is historical context for the Slice A-B mode work.
Use `docs/ENGINEERING_PLAN.md` for the current tech-debt and roadmap source of
truth, including background handler split, hook extraction, storage migration,
and popup resilience work.

---

## What Is Intentionally Not In This Repo

- direct Supabase access
- account/auth flows
- full analyst workspace
- topic expansion
- claims runner / deep LLM pipeline
- multi-source inbox (Dcard / Instagram / PTT / YouTube) — Phase 2
- Deep Reading / Evidence Route — Phase 2
- Weekly Intelligence Brief — Phase 2
- Topic auto-suggestion from signal clustering — Phase 2

## Current Pipeline

```text
Extension
  -> POST /capture-target
  -> ingest backend
  -> Supabase captures + crawl_jobs
  -> worker drain
  -> crawl_results
  -> capture_analyses
  -> GET /captures/{id}
  -> Compare tab + client-side summaries
```

Important boundary:

- backend never receives user OpenAI / Claude keys
- compare summaries are generated in the extension only
- current v0 runtime still depends on the external ingest backend for crawl jobs, comment extraction, and final deterministic clustering; only selected analysis/display helpers were copied into this repo
- the extension treats backend cluster output as the source of truth and only reshapes it for display, brief generation, and fallback UX

## Repo Boundary: Extension ↔ Backend

The extension repo has TypeScript **display adapters** that reshape backend cluster output for the UI. These are NOT duplicates of the backend clustering engine. The canonical clustering, evidence generation, and normalization live in `dlens-ingest-core`.

| Extension TS file | Purpose | Corresponding backend Python file |
|---|---|---|
| `src/contracts/ingest.ts` | Capture/job/analysis request/response types | `adapter.py`, `normalize.py` (output shape) |
| `src/analysis/cluster-summary.ts` | Rank, suppress, compare-row assembly for display | `quant_analysis.py` (cluster output consumer) |
| `src/analysis/cluster-validation.ts` | Reject weak labels for display | — (extension-only UX guard) |
| `src/compare/cluster-interpretation.ts` | AI cluster summary prompt/parse + deterministic fallback | — (extension-only LLM layer) |
| `src/compare/brief.ts` | Compare brief contract (observation-first, evidence-catalog) + deterministic fallback | — (extension-only LLM layer) |
| `src/compare/evidence-annotation.ts` | Per-quote annotation contract, prompt, parse, deterministic fallback | — (extension-only LLM layer) |
| `src/analysis/experimental/cip.ts` | Python-parity ports (not in production) | `quant_analysis.py` cluster interpretation seeds |
| `src/analysis/experimental/metrics.ts` | Python-parity ports (not in production) | `quant_analysis.py` keyword/metric helpers |

**Boundary rule**: Do not let the extension gradually become a second backend analysis runtime. If new analysis logic needs to be canonical, it goes in `dlens-ingest-core`, not here. Extension-side code should only consume, reshape, and present backend output.

## Backend Pipeline Detail (for context)

The full cluster pipeline runs in `dlens-ingest-core`, not in this repo:

1. **Crawl**: `runner.py` → `fetcher_runtime.py` → Threads DOM scrape → `post_payload.json`, `threads_comments.json`, `threads_comment_edges.json`
2. **Normalize**: `normalize.py` → strips comments to `{ comment_id, author, text, time_token, like_count, reply_count }`. NOTE: `parent_id` is NOT preserved — reply tree is lost here.
3. **Cluster**: `quant_analysis.py` → tokenize (CJK bigrams, English 3+ chars) → semantic embedding (paraphrase-multilingual-MiniLM-L12-v2) or greedy token fallback → KMeans → per-cluster metrics (size_share, like_share, keywords, evidence top 3 by like_count)
4. **Extension consumes**: `GET /captures/{id}` → clusters[], evidence[], metrics, source_comment_count

**Known backend limitations** (for future work, see `docs/product/2026-04-03-compare-working-plan.md`):
- Evidence selection is only by like_count — misses representativeness and reply-generating value
- Reply tree (`threads_comment_edges`) exists in crawl artifacts but is dropped at normalize step
- max_clusters hard cap is 3 — too low for posts with 20+ comments
- Cluster pairing between two posts is rank-based in extension, no semantic signal from backend

## Key Files

| File | Role |
|------|------|
| `entrypoints/background.ts` | service worker; state owner; queue, polling, worker control, compare-summary bridge |
| `entrypoints/threads.content.ts` | content script; targeting, overlay, React mount |
| `src/targeting/threads.ts` | Threads heuristics, engagement extraction, author extraction |
| `src/ui/InPageCollectorApp.tsx` | thin popup shell that wires the hook and split UI modules |
| `src/ui/useInPageCollectorAppState.ts` | popup state, effects, polling handlers, selection actions, and shell-level orchestration |
| `src/ui/InPageCollectorPopup.tsx` | main popup layout and page routing |
| `src/ui/InPageCollectorOverlays.tsx` | launcher button plus hover/flash overlays |
| `src/ui/InPageCollectorFolderControls.tsx` | folder strip, rename flow, and prompt controls |
| `src/ui/inpage-helpers.tsx` | popup helper functions and compact display atoms |
| `src/ui/components.tsx` | shared popup atoms, PreviewCard, and styling helpers |
| `src/ui/ProcessingStrip.tsx` | processing summary strip component |
| `src/ui/CollectView.tsx` | collect rail page wired to the existing preview/save/toggle contract |
| `src/ui/LibraryView.tsx` | library home: saved posts, saved analyses, casebook |
| `src/ui/CompareSetupView.tsx` | compare setup page: pair selection, teaser, result CTA |
| `src/ui/SettingsView.tsx` | settings tab view |
| `src/ui/CompareView.tsx` | compare UI; intelligence-first layout: compare hero, dual audience bubble maps, selected cluster detail, engagement support, expandable comments |
| `src/ui/TechniqueView.tsx` | Compare-internal second page for deeper reading: static technique rows, evidence list, save action, and reverse jump back to the selected cluster |
| `src/compare/technique-reading.ts` | stable technique-reading snapshot builder plus static placeholder technique definitions |
| `src/compare/saved-analysis-storage.ts` | local storage helpers for saved analysis snapshots |
| `src/compare/technique-reading-storage.ts` | local storage helpers for saved technique-reading snapshots |
| `src/ui/controller.tsx` | snapshot sync, retry-on-worker-wake, 10s polling |
| `src/state/analysis-result-state.ts` | hybrid result landing resolver (`active -> saved -> empty`) |
| `src/state/processing-state.ts` | processing summary, readiness status, polling delay, popup width constants |
| `src/state/snapshot-lock.ts` | tiny async lock used to serialize background queue/refresh snapshot writes |
| `src/state/messages.ts` | ExtensionMessage union type definitions |
| `src/ingest/client.ts` | backend HTTP client including worker drain/status |
| `src/contracts/ingest.ts` | capture/job/analysis/worker status contracts |
| `src/compare/brief.ts` | stable compare brief contract, prompt/parsing helpers, deterministic fallback |
| `src/analysis/cluster-summary.ts` | stable read-model cluster/evidence shaping helpers, visible suppression, dominance labels, compare-row assembly |
| `src/analysis/experimental/cip.ts` | experimental Python-parity cluster interpretation helpers kept separate from production flow |
| `src/compare/cluster-interpretation.ts` | cluster AI summary prompt/parsing helpers plus deterministic fallback copy for backend-shaped clusters |
| `src/state/store-helpers.ts` | session item operations, normalization, refresh decisions |
| `src/ui/tokens.ts` | shared popup design tokens for common atoms |

## Rules You Must Not Break

1. Background is the only network owner.
2. Hover updates stay in memory, not storage.
3. Any path reading preview state must respect the hover cache.
4. All post URL comparisons go through `normalizePostUrl()`.
5. Polling must continue until both crawl and analysis reach stable states.
6. Compare summaries must degrade cleanly when no key is configured or model call fails.
7. Google (Gemini 3.1 Flash Lite) is the default compare-summary provider; `ExtensionSettings.googleApiKey` must be handled alongside openai/claude keys in all settings paths.
8. `src/analysis/*` and `src/compare/*` are display/read-model adapters, not the canonical backend clustering source of truth.
9. After any code change, update this file and the README. If a boundary, data flow, async path, storage seam, backend job path, LLM call path, or ViewModel/View responsibility changed, update `docs/architecture/dlens-current-architecture-map.md` too.
10. Run `npm run boundary:guard` before merging any PR that touches `src/ui/**/*.tsx` or `src/viewmodel/**/*.ts`; it must report zero unauthorized findings and zero allowlisted bypasses.

## Known Risks

### P2

- `useInPageCollectorAppState.ts` is still a large orchestration hub after the shell split and is the next place to keep carving down
- inline styles are widespread but `tokens.ts` now provides the full design token layer; remaining inline refs can migrate incrementally
- hover debounce still feels slow (360ms)
- the full `tests/*.test.ts{,x}` suite passes **726/726** on merged `main` through PR #21; open PR #22 is separately verified at **732/732**

### P3

- skeleton coverage is still partial outside Library pending rows and the Compare unavailable hero
- compare cluster matching is still by rank, not by semantic/keyword overlap
- skeleton loading is still missing for crawl / analysis pending states outside the compact `ProcessingStrip`
- save/bookmark for interesting compare results is still unresolved and should stay lightweight until there is a real downstream destination
- UI polish and onboarding are still minimal
- no auth / multi-user support

## Alignment Note (2026-03-31)

Some audits against `historical dlens_chrome_extension_branch checkout` no longer describe the real state of this repo.

In the active `dlens-product-latest` extension repo, these older prototype debts are already reduced or closed:

- local persistence uses `chrome.storage.local`, not `window.localStorage`
- hover preview no longer writes to storage; it uses in-memory state/cache
- repo-level README / AGENTS are the source of truth for v0

The active debt list for v0 is the one in this file, not the older prototype bundle.

## Recently Changed (2026-03-30)

- **Compare UI redesigned**: intelligence-first layout replaces old engagement-heavy view
  - Section order: Selector → Compact Post Headers → AI Summary → Audience Clusters (A vs B side-by-side) → Engagement Table (with time + delta%) → Expandable Comments
  - Cluster comparison is now full-width cards, one per rank, with Post A on left, Post B on right
  - Analysis summary strip shows cluster count, dominance label in plain Chinese, comment count
  - Evidence quotes increased from 2 to 3 per cluster
  - Top comments collapsed by default (show 2, expand for 10)
- **Google/Gemini provider added**: `ExtensionSettings.googleApiKey`, `oneLinerProvider: "google"` option, `provider.ts` calls Gemini 3.1 Flash Lite API
- **Default provider changed**: `oneLinerProvider` now defaults to `"google"` instead of `null`
- **Settings UI updated**: Google API key field added, provider dropdown includes "Google (Gemini 3.1 Flash Lite)"
- Files changed: `types.ts`, `messages.ts`, `provider.ts`, `one-liner.ts`, `background.ts`, `InPageCollectorApp.tsx`, `CompareView.tsx`, `compare-view.test.tsx`

## Recently Changed (2026-04-01)

- **Google/Gemini runtime wiring completed**: MV3 manifest now includes `https://generativelanguage.googleapis.com/*` in `host_permissions`
- **Regression coverage added**: `tests/manifest-config.test.ts` guards the Google API host permission so the provider wiring does not silently drift again
- **Standalone analysis modules added**: `src/analysis/` now contains isolated TypeScript helpers for evidence selection, cluster summary shaping, compare-row assembly, and experimental Python-parity ports (`experimental/metrics.ts`, `experimental/cip.ts`)
- **New regression coverage**: `tests/analysis-modules.test.ts` locks the public behavior of the standalone analysis toolkit
- **Dead session model removed**: `src/state/session-model.ts` and `tests/session-model.test.ts` were deleted after confirming no production path imported them
- **Dominance labels unified**: `CompareView.tsx` now uses `getDominanceLabel()` from `src/analysis/cluster-summary.ts`, so the summary strip matches the shared `0.65 / 0.45` thresholds
- **CompareView now consumes the stable analysis layer**: cluster ranking, evidence ordering, and compare payload shaping now flow through `src/analysis/cluster-summary.ts` instead of ad-hoc view helpers
- **Popup page views extracted**: `CollectView.tsx`, `LibraryView.tsx`, and `SettingsView.tsx` now hold the tab bodies, while `components.tsx` and `ProcessingStrip.tsx` carry the shared UI atoms
- **Google key draft hydration fixed**: popup settings now rehydrate `googleApiKey` into the local draft state instead of only syncing OpenAI/Claude keys
- **Background queue/refresh lock added**: `queueSessionItem()` and `refreshItem()` now run through `src/state/snapshot-lock.ts`, and bulk queue/refresh sweeps execute sequentially to avoid whole-snapshot overwrite races
- **Design token file added**: `src/ui/tokens.ts` now owns shared popup colors/radii/shadows while `components.tsx` consumes that source
- **Cluster AI summaries added**: Compare now asks the configured local provider for all visible cluster summaries in one request, validates returned evidence ids, caches successful results, and falls back to deterministic copy if the model output is invalid or missing
- **Compare engagement + evidence details improved**: raw engagement totals and age-adjusted velocity now render as separate sections, missing capture data is labeled explicitly (`Not captured` / `Partial metrics only`), approximate ages use `time_token_hint` when exact post time is missing, and cluster evidence cards expose expandable metric details
- **Compare empty AI state tightened**: when no local provider key is configured, Compare now renders a small inline notice instead of a full-width empty AI Summary card; the view also reads its local palette from the shared token source to reduce future style drift
- **Boundary cleanup started**: repo docs now treat the backend as an optional HTTP dependency, `npm run backend:locate` resolves a local checkout via `DLENS_INGEST_CORE_DIR` or `../dlens-ingest-core`, and ingest auth paths are explicitly documented as backend-owned
- **Compare brief upgraded**: Compare top summary now uses a stable compare brief contract with headline, claim contrast, emotion contrast, risk signals, representative evidence references, and deterministic fallback before AI enrichment
- **Compare trust fixes landed**: post headers now use total comments captured, canonical metrics merge with local extracted engagement per field, weak generic cluster labels are rejected, low-signal clusters are suppressed, evidence metrics render inline, and momentum is explicitly marked `Developing`
- **Frontend handoff outlets prepared**: `processing-state.ts` now exposes phase/progress helpers, `ProcessingStrip` and `LibraryView` emit stable `data-*` phase/variant attrs, and `CompareView` tags compare-brief / alert-rail / cluster-summary states for a later Claude-only UI pass

## Still TODO (2026-03-31)

- Migrate remaining inline style constants to `tokens.ts` incrementally (token foundation is in place as of 2026-04-02)
- Reduce hover debounce and clear stale overlay state on SPA route changes
- Preserve and eventually expose reply-tree structure from backend crawl artifacts (`threads_comment_edges` / parent-child links) into normalized results and analysis inputs; this is a future backend/runtime upgrade for reply-aware clustering, battlefield flows, and branch-emergence signals, not current v0 work
- Improve Compare trust and summary quality
  - cluster summaries should describe argument / posture / evidence, not only restate keywords and share percentages
  - cluster pairing should not stay rank-only forever
- Add a rare-insight / alert layer beyond static clustering
  - detect discussion-branch emergence
  - detect early-vs-late cluster share shifts
  - surface small but high-engagement outlier clusters
  - separate these alerts from the top compare brief
- Improve crawl/analyze progress UX in the UI
  - add animated per-post loading states while crawl or analysis is running
  - fake progress is acceptable if backend ETA is unavailable, but it should stay honest about state
  - prefer status language like `Crawling comments...` / `Analyzing clusters...` over precise fake time promises
  - if backend later exposes stable duration hints, upgrade the same surface to estimated time remaining
- Investigate why raw engagement fields can still disappear in Compare after collect-mode extraction succeeded
- Replace current placeholder momentum surface with a real Threads-specific model once there is enough evidence to do better than `Developing`
- Distinguish metric `0` from `data unavailable`
- Keep any compare save/bookmark feature lightweight until there is a real external destination
- Treat near-duplicate cluster splits as a backend-quality work item first; do not paper over semantic merge issues purely in extension presentation
- Preferred navigation direction for the next major UI pass is an in-page slide-in drawer, not Chrome Side Panel first
  - do this only after the God Component split makes the popup views drawer-ready

## UI Design Direction (2026-04-13) — PENDING IMPLEMENTATION

**No extension code was changed in this session.** A full interactive mockup was built in a separate repo. Design specs below are the implementation target.

### Design Language
- **Positioning**: news-led, finance-disciplined. "Annotated field guide" (社群現象注解手冊). NOT a dashboard.
- **References**: Apple News (editorial cards, source chips) + finance apps (compact metrics, trust structure)
- **Confirmed by Codex + user. Not negotiable.**

### Design Tokens (target for `src/ui/tokens.ts`)
| Token | Current | Target |
|-------|---------|--------|
| Canvas | `#f4f4f5` | `#f2f2f7` |
| Primary text | `#111827` | `#1d1d1f` |
| Accent | — | `#0071e3` |
| Font | — | SF Pro (`-apple-system, BlinkMacSystemFont`) |
| Card radius | — | 12-16px |
| Button radius | — | 8px |
| Badge radius | — | 5px |

Full spec: `DESIGN.md`

### Three-Page IA (confirmed, not reversible)
| Page | Metaphor | Contents |
|------|----------|----------|
| Library | Bookshelf | Saved posts, Casebook, Compare entry |
| Compare | Problem room | Post A/B selector + thesis preview + CTA only |
| Result | Reading room | Hero card + DictionaryCard evidence + Why it matters + verification drawer |

Mockup: `local Claude artifacts-builder/dlens-compare-mockup/` (live: http://localhost:5199)

### Components to Implement

**DictionaryCard** (replaces evidence section in CompareJudgmentSheet):
- Inline phrase highlights (semi-transparent marker background)
- Phrase → dotted line → colored pill label annotation
- BBC-style left-border `剖析` section (2.5px solid, left-border accent)
- Expandable `+ 為什麼有效` (SparkleIcon + ChevronDown toggle)
- Header: rank badge + avatar + handle + engagement count

**FlowingClusterViz** (replaces static cluster map, moves to verification drawer):
- SVG dot clusters with cursor-repulsion spring animation
- RAF loop, lerp factor 0.1 (spring feel); REPEL_RADIUS = 32 SVG units
- Heavy dots (large/high-engagement) move slower (mass = 3)
- `prefers-reduced-motion`: stop all animation; `onMouseLeave`: spring back to origin

**Multi-cluster Balance Card** (replaces current A/B binary card):
- Supports k > 2 (3-column flex layout)
- Per cluster: % + name + description + narrative badge (主流/高互動/散落)
- Multi-color segment bar at bottom (flex ratio = % ratio)

**Trust Strip** (replaces current method note):
- Compact badges: `◎ k-means(k=N)` `◌ N則留言` `◷ date range`
- Collapsible drawer with: FlowingClusterViz + stats grid + methodology note

### Typography Changes (immediate)
- **Remove ALL CAPS**: delete `textTransform: uppercase` from SectionLabel, EvidenceFieldLabel, PostHeader
- **Replace with**: `fontSize: 12px, fontWeight: 600` micro labels
- **Rule**: ALL CAPS is dashboard language. dlens is editorial.

---

## Recently Changed (2026-04-02)

- **Soft white glass visual redesign** — complete design-direction switch
  - `src/ui/tokens.ts` fully rewritten: canvas `#f4f4f5`, text `#111827`/`#4b5563`/`#9ca3af`, elevated near-white surfaces, glass shadow uses soft drops not glow
  - `src/ui/InPageCollectorApp.tsx`: popup container background switched from `rgba(6,10,22,0.92)` to `tokens.color.canvas`; launcher button shadow lightened from `rgba(0,0,0,0.35)` to `rgba(0,0,0,0.12)`
  - `src/ui/CompareView.tsx` three structural changes:
    1. **Compare Brief hero**: headline (16px/700) rendered first; "Compare Brief" label + status badge moved below with dividing border; risk signals converted to compact inline chips with red left-border accent; representative evidence now uses left-border accent instead of tinted full box
    2. **Four-layer cluster cards**: title + share badge (inline) → thesis one-liner (2-line max) → best evidence quote (italic, left-border) → metrics strip (10px, soft). Internal `ClusterSide` sub-component keeps the layout clean. TypeScript typecheck passes clean.
    3. **Lighter engagement section**: age row condensed to mini-row with 10px labels; momentum collapsed to footnote line; removed heavy box around momentum note
- **Typecheck**: zero errors after quote normalization fix (smart quotes in Edit output replaced with straight ASCII)

## Recently Fixed (2026-03-28)

- Compare tab popup width now expands to 504px instantly (localPage state bypass round-trip)
- Process All button moved outside item selection — always visible in Library
- Worker status optimistic update race removed (only set after response.ok)
- ProcessingStrip idle state visibility improved (darker background/border)
- "Queue this" disabled during worker drain
- Compare auto-selects distinct pair; self-compare prevented; readiness board shows per-item status
- Processing strip shows ready/total/crawling/analyzing/pending counts
- `processing-state.ts` added: pure logic for session summary, readiness, polling delay
- `messages.ts` added: typed message union for all chrome.runtime message types

Also fixed in the optional ingest backend:
- `runner.py` control flow bug: success logging + analysis enqueue was unreachable after exception return; restructured with flag-based flow

## Verification Standard

Before claiming success:

```bash
cd dlens-product-latest
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx  # expect current-branch count: 726/726 on main through PR #21; 732/732 on PR #22
npm run build
```

If a change touches ingest or compare behavior, also verify against the optional ingest backend checkout when full pipeline dev is in scope.
