# AGENTS.md — DLens Chrome Extension v0.1

> **Last updated:** 2026-04-23 (Slice A–B complete — 241/241 tests; mode-aware topic intelligence layer live)
> **For:** any agent continuing work in this repo

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

Production MV3 Chrome extension for capturing Threads posts, organizing them into local folders, queueing them to an optional ingest backend over HTTP, and comparing two crawled posts by rendering backend read models plus extension-side brief summaries.

The extension is now **extension-first**, not SaaS-first:

- local folders and UI state live in `chrome.storage.local`
- backend owns crawl jobs and the canonical clustering / deterministic analysis read model
- extension owns user API keys and compare one-liners
- runtime does not depend on any hard-coded local backend checkout path
- `src/analysis/*` is the stable display/read-model layer: evidence lookup, cluster ranking, visible suppression, compare-row shaping, and experimental ports stay detached from the canonical backend output
- `src/compare/*` is the extension-side brief layer: prompt building, parsing, deterministic fallback, and cache-key helpers around backend analysis snapshots

## Quick Start

1. Read `/Users/tung/Desktop/dlens-chrome-extension-v0/README.md`
2. Read `/Users/tung/Desktop/dlens-chrome-extension-v0/docs/memory/current-state.md`
3. Run:

```bash
cd /Users/tung/Desktop/dlens-chrome-extension-v0
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
```

## Current Working Features

- hover-to-preview on Threads feed and post-detail pages, with stale overlay reset on SPA route changes
- engagement extraction for likes, comments, reposts, forwards, views
- repost-aware author extraction
- folder CRUD and save accumulation
- popup workspace shell now uses an editorial masthead + left rail with primary mode navigation for `Library / Compare / Collect`, plus a separate Settings utility action
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
- client-side compare summaries using the user's Google (Gemini 2.0 Flash), OpenAI, or Claude key; Google is the default provider
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
- **Observation-first compare contract (2026-04-20)**: `CompareBrief` now includes `relation` alongside `headline`, `supportingObservations[]`, `aReading`/`bReading`, `whyItMatters`, `creatorCue`, and `confidence`; evidence catalog remains `e1..eN` alias-based; uncited observations/readings are still rejected at parse; brief prompt version is `v7`; `relation` is extension-owned presentation synthesis, not backend cluster truth.
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

## Slice A–B: Mode-Aware Topic Intelligence Layer (2026-04-23)

This was a major product-direction change. Summary for any agent picking up here:

### What changed

**Product direction**: dlens is no longer just "capture two posts → compare brief". It is now a **mode-aware Threads intelligence extension**. Each folder carries a `mode` (`archive | topic | product`) that determines which surfaces mount and which AI passes run.

**New core objects**: `Topic` (named discussion container with status + signalIds + pairIds) and `Signal` (inbox item linking a captured post to a topic after triage).

**New navigation rule**: `ALLOWED_PAGES` in `InPageCollectorPopup.tsx` determines which nav icons mount. `archive` = Library + Collect only. `topic`/`product` = Casebook + Inbox + Collect + Compare. Pages not in the allowed set are *unmounted*, not disabled.

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
| `entrypoints/background.ts` | 1394 → 1929 lines; added topic/signal/judgment handlers; `ensureSignalForSavedItem` on save path |
| `src/ui/InPageCollectorPopup.tsx` | Mode guard (`ALLOWED_PAGES` + `guardPage`); casebook + inbox + topic detail routing |
| `src/ui/useInPageCollectorAppState.ts` | 712 → 1028 lines; topics/signals/mode state + triage/topic CRUD callbacks |
| `src/ui/CompareView.tsx` | Breadcrumb + "附加至案例" button for topic context |
| `src/ui/CollectView.tsx` | Save toast changes to "已加入收件匣" in topic/product mode |
| `src/ui/SettingsView.tsx` | Folder mode selector + ProductProfile form (product mode only) |

### Files NOT changed

`src/compare/judgment.ts`, `src/compare/saved-analysis-storage.ts`, `src/compare/brief.ts`, `src/compare/provider.ts`, `src/compare/evidence-annotation.ts`, `src/compare/cluster-interpretation.ts`, `src/ui/LibraryView.tsx`.

### Test gate

```bash
npm run typecheck && npx tsx --test tests/*.test.ts tests/*.test.tsx
# Expected: 241 pass, 0 fail
```

### Watch items for next agent

1. `useInPageCollectorAppState.ts` is at 1028 lines / 51 hooks — next refactor target before adding Phase 2 features: extract `useTopicState` mini-hook.
2. `background.ts` is at 1929 lines — consider splitting topic handlers to `src/state/topic-handlers.ts` before Phase 2.
3. `suggestedTopicIds` is always `[]` in Slice A — Phase 2 fills this from AI inbox clustering.
4. Product mode is live (not disabled) — ProductProfile form in Settings is the entry point.

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
| `/Users/tung/Desktop/dlens-chrome-extension-v0/entrypoints/background.ts` | service worker; state owner; queue, polling, worker control, compare-summary bridge |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/entrypoints/threads.content.ts` | content script; targeting, overlay, React mount |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/targeting/threads.ts` | Threads heuristics, engagement extraction, author extraction |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/InPageCollectorApp.tsx` | thin popup shell that wires the hook and split UI modules |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/useInPageCollectorAppState.ts` | popup state, effects, polling handlers, selection actions, and shell-level orchestration |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/InPageCollectorPopup.tsx` | main popup layout and page routing |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/InPageCollectorOverlays.tsx` | launcher button plus hover/flash overlays |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/InPageCollectorFolderControls.tsx` | folder strip, rename flow, and prompt controls |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/inpage-helpers.tsx` | popup helper functions and compact display atoms |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/components.tsx` | shared popup atoms, PreviewCard, and styling helpers |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/ProcessingStrip.tsx` | processing summary strip component |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CollectView.tsx` | collect rail page wired to the existing preview/save/toggle contract |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/LibraryView.tsx` | library home: saved posts, saved analyses, casebook |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CompareSetupView.tsx` | compare setup page: pair selection, teaser, result CTA |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/SettingsView.tsx` | settings tab view |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CompareView.tsx` | compare UI; intelligence-first layout: compare hero, dual audience bubble maps, selected cluster detail, engagement support, expandable comments |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/TechniqueView.tsx` | Compare-internal second page for deeper reading: static technique rows, evidence list, save action, and reverse jump back to the selected cluster |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/technique-reading.ts` | stable technique-reading snapshot builder plus static placeholder technique definitions |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/saved-analysis-storage.ts` | local storage helpers for saved analysis snapshots |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/technique-reading-storage.ts` | local storage helpers for saved technique-reading snapshots |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/controller.tsx` | snapshot sync, retry-on-worker-wake, 10s polling |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/analysis-result-state.ts` | hybrid result landing resolver (`active -> saved -> empty`) |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/processing-state.ts` | processing summary, readiness status, polling delay, popup width constants |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/snapshot-lock.ts` | tiny async lock used to serialize background queue/refresh snapshot writes |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/messages.ts` | ExtensionMessage union type definitions |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ingest/client.ts` | backend HTTP client including worker drain/status |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/contracts/ingest.ts` | capture/job/analysis/worker status contracts |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/brief.ts` | stable compare brief contract, prompt/parsing helpers, deterministic fallback |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/analysis/cluster-summary.ts` | stable read-model cluster/evidence shaping helpers, visible suppression, dominance labels, compare-row assembly |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/analysis/experimental/cip.ts` | experimental Python-parity cluster interpretation helpers kept separate from production flow |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/cluster-interpretation.ts` | cluster AI summary prompt/parsing helpers plus deterministic fallback copy for backend-shaped clusters |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/store-helpers.ts` | session item operations, normalization, refresh decisions |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/tokens.ts` | shared popup design tokens for common atoms |

## Rules You Must Not Break

1. Background is the only network owner.
2. Hover updates stay in memory, not storage.
3. Any path reading preview state must respect the hover cache.
4. All post URL comparisons go through `normalizePostUrl()`.
5. Polling must continue until both crawl and analysis reach stable states.
6. Compare summaries must degrade cleanly when no key is configured or model call fails.
7. Google (Gemini 2.0 Flash) is the default compare-summary provider; `ExtensionSettings.googleApiKey` must be handled alongside openai/claude keys in all settings paths.
8. `src/analysis/*` and `src/compare/*` are display/read-model adapters, not the canonical backend clustering source of truth.
9. After any code change, update this file and the README.

## Known Risks

### P2

- `useInPageCollectorAppState.ts` is still a large orchestration hub after the shell split and is the next place to keep carving down
- inline styles are widespread but `tokens.ts` now provides the full design token layer; remaining inline refs can migrate incrementally
- hover debounce still feels slow (360ms)
- the full `tests/*.test.ts{,x}` suite passes **178/178** as of Phase 2 (commit `6453f73`); `manifest-config.test.ts` has a known pre-existing rolldown native binding issue on Darwin arm64 that is environment-specific and not a code failure

### P3

- skeleton coverage is still partial outside Library pending rows and the Compare unavailable hero
- compare cluster matching is still by rank, not by semantic/keyword overlap
- skeleton loading is still missing for crawl / analysis pending states outside the compact `ProcessingStrip`
- save/bookmark for interesting compare results is still unresolved and should stay lightweight until there is a real downstream destination
- UI polish and onboarding are still minimal
- no auth / multi-user support

## Alignment Note (2026-03-31)

Some audits against `/Users/tung/Desktop/dlens_chrome_extension_branch` no longer describe the real state of this repo.

In `dlens-chrome-extension-v0`, these older prototype debts are already reduced or closed:

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
- **Google/Gemini provider added**: `ExtensionSettings.googleApiKey`, `oneLinerProvider: "google"` option, `provider.ts` calls Gemini 2.0 Flash API
- **Default provider changed**: `oneLinerProvider` now defaults to `"google"` instead of `null`
- **Settings UI updated**: Google API key field added, provider dropdown includes "Google (Gemini 2.0 Flash)"
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

Full spec: `/Users/tung/Desktop/dlens-chrome-extension-v0/DESIGN.md`

### Three-Page IA (confirmed, not reversible)
| Page | Metaphor | Contents |
|------|----------|----------|
| Library | Bookshelf | Saved posts, Casebook, Compare entry |
| Compare | Problem room | Post A/B selector + thesis preview + CTA only |
| Result | Reading room | Hero card + DictionaryCard evidence + Why it matters + verification drawer |

Mockup: `/Users/tung/.claude/skills/artifacts-builder/dlens-compare-mockup/` (live: http://localhost:5199)

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
cd /Users/tung/Desktop/dlens-chrome-extension-v0
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx  # expect 178/178
npm run build
```

If a change touches ingest or compare behavior, also verify against the optional ingest backend checkout when full pipeline dev is in scope.
