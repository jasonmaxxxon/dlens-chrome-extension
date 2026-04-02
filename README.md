# dlens-chrome-extension-v0

MV3 Chrome extension for capturing Threads posts and comments. Provides hover-to-preview targeting, folder-based collection, and optional backend queue integration.

> **Last updated:** 2026-04-02

## Current Status

**Working features:**
- Hover-to-preview on Threads feed and post-detail pages (collect mode)
- Engagement metric extraction (likes, comments, reposts, forwards, views)
- Author extraction with repost-aware fallback (skips reposter, finds real author)
- Folder/session management (create, rename, delete, switch)
- Save posts to folders with correct accumulation (multiple saves per folder)
- In-page popup UI with Collect / Library / Compare / Settings tabs
- Floating preview card during collect mode
- Queue single item or all pending items to backend
- **Process All** button (combined queue + drain) visible without item selection
- **Processing strip** shows worker status, ready/total counts, crawling/analyzing/pending badges
- Worker status feedback (`idle` / `draining` / `already running`)
- Job status polling (queued -> running -> succeeded -> dead)
- Comment preview after successful crawl
- Late analysis polling after crawl success until `capture.analysis` arrives
- 2-post Compare View: redesigned for intelligence-first comparison — compare brief at top, audience cluster side-by-side comparison as core section, compact post headers with post age, raw engagement totals plus age-adjusted velocity, and expandable top comments
- Compare tab auto-expands popup to 504px with smooth transition; auto-selects first valid distinct pair; prevents self-compare
- **Readiness board** in Compare tab shows per-item status when < 2 items are ready
- **Audience Clusters** section: clusters ranked by size, A vs B side-by-side per row with AI-enhanced one-line summaries, deterministic fallback copy, 2 example evidence comments per side, and expandable evidence details (`likes`, `comments`, `reposts`, `forwards`)
- Compare keeps cluster analysis visible even without API keys; missing-key AI state is now a small inline notice instead of a full empty summary card
- MV3 service worker wake recovery (globalStateCache, warmGlobalCache, resumeRunningPolls, backgroundRefreshInFlightItems)
- Queue/poll recovery: sendExtensionMessage retries once on connection loss to wake worker; polling does immediate refresh on mount
- Keyboard shortcuts in collect mode (S = save, Esc = exit)
- Toast notifications for save/queue feedback
- Settings tab supports local Google (Gemini 2.0 Flash), OpenAI, or Claude keys for compare summaries; Google is the default provider
- The same local provider/key also powers per-cluster AI summaries in Compare; when the model call fails, Compare falls back to deterministic cluster copy instead of leaving the cards blank
- Compare brief now uses a stable contract with headline, claim contrast, emotion contrast, risk signals, representative evidence references, and deterministic fallback before AI enrichment
- Manifest host permissions now include Google Generative Language API so Gemini compare requests can run from the extension background worker
- Standalone analysis toolkit under `src/analysis/` for future compare/backend adapters:
  - stable deterministic helpers for evidence lookup, cluster ranking, and compare-row shaping
  - experimental Python-parity ports for keyword extraction, like-share metrics, and cluster interpretation seeds
  - CompareView now uses the stable deterministic layer; experimental ports remain out of production
- Popup UI split has started:
  - shared atoms now live in `src/ui/components.tsx`
  - `ProcessingStrip`, `CollectView`, `LibraryView`, and `SettingsView` are separate modules
  - `InPageCollectorApp.tsx` dropped from ~1600 lines to ~980 lines
- Background snapshot writes now serialize queue/refresh mutations through a shared async lock to avoid sibling updates clobbering each other during Process All / refresh sweeps
- Shared UI tokens now live in `src/ui/tokens.ts`; common popup atoms read from that source instead of carrying their own local color/spacing constants

**Known issues (prioritized):**

| Priority | Issue | Details |
|----------|-------|---------|
| ~P1~ | ~~Memory: hover writes to storage~~ | ~~Already fixed — selection/hovered uses in-memory cache at background.ts:591~~ |
| ~P1~ | ~~Service worker death~~ | ~~Fixed — globalStateCache + warmGlobalCache + resumeRunningPolls in background.ts; keepalive port cleanup; controller.tsx retries on connection loss~~ |
| ~P1~ | ~~Parallel queue/refresh writes can race~~ | ~~Mitigated on 2026-04-01 — queue/refresh mutations now serialize through a shared async lock and bulk loops run sequentially~~ |
| P2 | Hover debounce too slow | 360ms debounce causes laggy feel; SPA page transitions leave stale overlay |
| ~P2~ | ~~Compare selection edge cases~~ | ~~Fixed — auto-selects distinct pair via `pickCompareSelection()`; self-compare prevented; readiness board shows per-item status~~ |
| P2 | Popup shell still too large | `InPageCollectorApp.tsx` is down to ~980 lines after extracting shared atoms and page views, but it still owns too much popup orchestration |
| P2 | Inline styling debt | Visual system still depends on widespread inline styles; no shared design tokens yet |
| P3 | UI loading states are still weak | No skeleton loading during crawl/analyze wait; empty waiting states feel abrupt |
| P3 | Compare cluster matching is misleading | Current cluster pairing is by rank, not by semantic/keyword overlap |
| P3 | Backend context is incomplete | Folder/collection name still not sent to backend |

**Architecture decision (2026-03-26, clarified 2026-04-02):**
- Extension will NOT connect directly to Supabase
- Pipeline: Extension -> POST /capture-target -> optional ingest backend API -> Supabase -> Worker -> crawl_results -> capture_analyses
- Runtime only depends on `ingestBaseUrl`; a local backend checkout is optional and is only needed for full pipeline dev
- For local discovery, this repo prefers `DLENS_INGEST_CORE_DIR`; otherwise `npm run backend:locate` will look for `../dlens-ingest-core`
- Post-crawl deterministic analysis is now persisted in ingest-core and returned from `GET /captures/{id}`
- Popup processing is explicit: `Queue` only enqueues; `Start processing` calls `POST /worker/drain`; popup reads `GET /worker/status`
- Compare summaries are generated client-side with the user's Google, OpenAI, or Claude key; backend never stores that key; default provider is Google (Gemini 2.0 Flash)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Content Script (threads.content.ts)                │
│  - DOM targeting heuristics (card scoring)           │
│  - Hover overlay + collect mode                      │
│  - Builds TargetDescriptor from DOM                  │
│  - Renders InPageCollectorApp (React)                │
└──────────────┬──────────────────────────────────────┘
               │ chrome.runtime.sendMessage
┌──────────────▼──────────────────────────────────────┐
│  Background Service Worker (background.ts)           │
│  - State management (global + per-tab)               │
│  - Session/folder CRUD                               │
│  - In-memory hover cache (no storage writes on hover)│
│  - Queue orchestration → POST /capture-target        │
│  - Processing control → POST /worker/drain           │
│  - Worker status → GET /worker/status                │
│  - Job/result polling → GET /jobs/{id}, GET /captures/{id} │
│  - Client-side compare summaries using user API key  │
│  - Broadcasts state updates to content script        │
└──────────────┬──────────────────────────────────────┘
               │ fetch()
┌──────────────▼──────────────────────────────────────┐
│  Backend (optional ingest service)                   │
│  - Default: http://127.0.0.1:8000                    │
│  - POST /capture-target → returns capture_id, job_id │
│  - POST /worker/drain → bounded queue drain          │
│  - GET /worker/status → idle/draining                │
│  - GET /jobs/{job_id} → job status                   │
│  - GET /captures/{capture_id} → crawl + analysis     │
└─────────────────────────────────────────────────────┘

Target pipeline (VERIFIED 2026-03-27):
Extension → POST /capture-target → ingest backend → Supabase → Worker → crawl_results → capture_analyses
```

## Storage Model

- **Global state** (`dlens:v0:global-state`): sessions[], activeSessionId, settings
- **Per-tab UI** (`dlens:v0:tab-ui:{tabId}`): popupOpen, selectionMode, currentPreview, activeItemId
- **In-memory hover cache** (`Map<tabId, TabUiState>`): hoveredTarget, flashPreview — NOT persisted to storage

This matters because older prototype audits against `dlens_chrome_extension_branch` may still mention `window.localStorage`; that no longer reflects v0.

## Repo Layout

```text
dlens-chrome-extension-v0/
  AGENTS.md              ← Agent handoff doc (read this first)
  README.md              ← This file
  entrypoints/
    background.ts        ← Service worker: state, queue, polling (~1025 lines)
    threads.content.ts   ← Content script: DOM targeting, overlay, React mount
    sidepanel/
      index.html         ← Sidepanel entry (debug UI)
      main.tsx
  src/
    contracts/
      ingest.ts          ← API request/response types (jobs, captures, worker status, analysis)
    analysis/
      evidence.ts        ← stable deterministic evidence lookup/picking helpers
      cluster-summary.ts ← stable cluster ranking + compare-row shaping helpers
      compare-analysis.ts ← stable side-shaping helper for future adapters
      experimental/
        metrics.ts       ← Python-parity keyword + like-share metric ports
        cip.ts           ← Python-parity cluster interpretation seed/evidence helpers
    compare/
      brief.ts           ← compare brief contract, prompt builder, parser, deterministic fallback
      one-liner.ts       ← legacy compare one-liner payload + prompt builder
      cluster-interpretation.ts ← cluster AI summary prompt, parsing, deterministic fallback, cache key helpers
    ingest/
      client.ts          ← HTTP client for backend API + worker control
    state/
      types.ts           ← ExtensionSnapshot, SessionRecord, SessionItem types
      messages.ts        ← ExtensionMessage union type definitions
      processing-state.ts ← Processing summary, readiness status, polling delay, popup width constants
      snapshot-lock.ts    ← Small async lock helper used by background queue/refresh writes
      store-helpers.ts   ← normalizePostUrl, addItemToSession, duplicate-check logic
      ui-state.ts        ← applyHoveredPreview, isSavedInFolder helpers
    targeting/
      threads.ts         ← Card scoring, engagement extraction, author extraction (~475 lines)
    ui/
      InPageCollectorApp.tsx  ← Popup shell + state orchestration (~980 lines after view extraction)
      components.tsx          ← Shared popup atoms + PreviewCard + style helpers
      tokens.ts              ← Shared popup design tokens
      ProcessingStrip.tsx     ← Worker/processing summary strip
      CollectView.tsx         ← Collect tab view
      LibraryView.tsx         ← Library tab view
      SettingsView.tsx        ← Settings tab view
      CompareView.tsx         ← 2-post compare UI with readiness board, auto-pair selection (~627 lines)
      SidepanelApp.tsx        ← Debug sidepanel UI
      controller.tsx          ← useExtensionState hook (retry on connection loss, 10s polling)
  tests/
    *.test.ts / *.test.tsx ← Tests (targeting heuristics + processing state + compare view)
```

## Local Development

```bash
npm install
npm run dev          # WXT dev mode with hot reload
npm run build        # Production build → .output/chrome-mv3/
npm run typecheck    # tsc --noEmit
npm run backend:locate  # Optional: locate a local ingest backend checkout
npx tsx --test tests/*.test.ts tests/*.test.tsx   # Run tests
```

## Standalone Dev Modes

- `extension-only dev`
  - Works with `npm run typecheck`, tests, `npm run build`, Compare UI work, and summary prompt/validation work.
  - No backend checkout is required.
- `full pipeline dev`
  - Requires a separately running ingest backend reachable from `ingestBaseUrl`.
  - `npm run backend:locate` helps find a local checkout using `DLENS_INGEST_CORE_DIR` first, then `../dlens-ingest-core`.
  - Backend auth files and crawler credentials remain backend setup concerns, not extension runtime concerns.

## Loading in Chrome

1. `npm run build`
2. Go to `chrome://extensions` -> Enable Developer mode
3. Click "Load unpacked" -> select `.output/chrome-mv3/`
4. Navigate to `threads.net` — the `+` launcher button appears top-right

## Bug Fix Log (2026-03-26)

| Bug | Root Cause | Fix | File |
|-----|-----------|-----|------|
| Engagement all showing "—" | `childElementCount === 0` filter excluded buttons with child elements | Reverted leaf-node-only restriction; use `textContent` capped at 40 chars | `src/targeting/threads.ts` |
| Author shows reposter instead of real author | `querySelector` grabbed first `/@` link which was the reposter | Iterate all `/@` links, skip ones whose parent contains "reposted" | `src/targeting/threads.ts` |
| False "Saved" badge on unsaved posts | `normalizePostUrl("") === ""` matched empty `optimisticSavedUrl` | Add `!== ""` guard on comparison + clear optimistic state on folder switch | `src/ui/InPageCollectorApp.tsx` |
| Save only keeps last item per folder | Duplicate-check in background used inconsistent URL normalization | Use `normalizePostUrl()` consistently in `store-helpers.ts` for duplicate check | `src/state/store-helpers.ts`, `entrypoints/background.ts` |
| MV3 worker death loses state (P1-A) | No cache or recovery after service worker restart | Added globalStateCache, warmGlobalCache(), resumeRunningPolls(), backgroundRefreshInFlightItems(); keepalive port cleanup | `entrypoints/background.ts` |
| Queue/poll fails after worker restart (P1-B) | sendExtensionMessage errors on dead worker; no immediate refresh on mount | sendExtensionMessage retries once on "Could not establish connection"; polling useEffect does immediate refresh | `src/ui/controller.tsx` |
| Analysis never appeared after crawl success | UI stopped polling once crawl status flipped to succeeded, even if analysis was still pending | Added `needsCaptureRefresh()` check for late analysis arrival in background/controller/store helpers | `src/state/store-helpers.ts`, `src/ui/controller.tsx`, `entrypoints/background.ts` |
| Start processing had no durable status | Popup only knew immediate button result, not current worker state | Added `GET /worker/status`, popup polling, and explicit `idle` / `draining` status text | `src/ui/InPageCollectorApp.tsx`, `src/ingest/client.ts`, `entrypoints/background.ts`, optional ingest backend |
| normalize.py images field type mismatch | images was `list[dict]` from crawler but contract expected `list[str]` | Extract `img["src"]` from dict entries | ingest backend `normalize.py` |

## Bug Fix Log (2026-03-28)

| Bug | Root Cause | Fix | File |
|-----|-----------|-----|------|
| Compare tab popup stayed 348px instead of expanding to 504px | `page` derived from `snapshot?.tab.popupPage` requires background round-trip; width rendered with stale value before broadcast returns | Added `localPage` state that updates immediately on `onNavigate()`, syncs back when snapshot catches up | `src/ui/InPageCollectorApp.tsx:575-578,803` |
| Process All button hidden behind item selection | Button was inside `activeItem` conditional — user had to click an item first to see it | Moved Process All + status text outside `activeItem` block; now always visible in Library card | `src/ui/InPageCollectorApp.tsx:1451-1477` |
| Worker status optimistic update race condition | `setWorkerStatus("draining")` called before async `worker/start-processing` — if request failed, UI stuck on "Processing..." | Removed premature set; only set "draining" after `response.ok` | `src/ui/InPageCollectorApp.tsx:950-956` |
| ProcessingStrip invisible in idle state | Idle background `rgba(241,245,249,0.85)` + border `rgba(148,163,184,0.2)` blended into popup background | Darkened to `rgba(226,232,240,0.9)` + border `rgba(100,116,139,0.3)` | `src/ui/InPageCollectorApp.tsx:279-283` |
| "Queue this" not disabled during worker drain | Button lacked `disabled` check for `workerStatus === "draining"` | Added `disabled={workerStatus === "draining"}` | `src/ui/InPageCollectorApp.tsx:1464` |
| runner.py success path unreachable after exception | `return` at line 368 in `except` block made lines 371-390 (success logging + analysis enqueue) unreachable | Restructured with `crawl_succeeded` flag; heartbeat.stop() in finally; success path runs after try/except/finally | ingest backend `src/dlens_ingest_core/workers/runner.py:331-390` |

## Bug Fix Log (2026-04-01)

| Bug | Root Cause | Fix | File |
|-----|-----------|-----|------|
| Google/Gemini compare one-liner could not call the API from the extension runtime | MV3 manifest host permissions included OpenAI and Anthropic but omitted `generativelanguage.googleapis.com` | Added Google Generative Language API host permission and regression test coverage for manifest config | `wxt.config.ts`, `tests/manifest-config.test.ts` |
| Future analysis reuse had no isolated home inside the extension repo | Reusable logic from `DLens_26` would have been mixed into UI/background or lost in ad-hoc snippets | Added `src/analysis/` standalone toolkit plus `tests/analysis-modules.test.ts`, keeping deterministic production helpers separate from experimental Python-parity ports | `src/analysis/*`, `tests/analysis-modules.test.ts` |
| Dead session state model drifted away from production types and helpers | `src/state/session-model.ts` and its test suite duplicated older state logic that no runtime path imported | Deleted the dead file and old tests instead of carrying a second state model | `src/state/session-model.ts`, `tests/session-model.test.ts` |
| CompareView dominance labels could disagree with the stable analysis helper | `CompareView.tsx` used local thresholds `0.7 / 0.4` while `cluster-summary.ts` used `0.65 / 0.45` | Replaced the local label helper with `getDominanceLabel()` and added a regression test for the 0.68 case | `src/ui/CompareView.tsx`, `tests/compare-view.test.tsx` |
| CompareView could drift from the stable cluster/evidence shaping rules | The compare UI still used inline `slice()`/lookup helpers instead of the deterministic `src/analysis/*` adapters | Routed CompareView cluster rows and one-liner payload shaping through `buildClusterSummaries()` and `buildClusterCompareRows()` with regression coverage for sorted clusters/evidence | `src/ui/CompareView.tsx`, `tests/compare-view.test.tsx` |
| Popup UI split was blocked by a single 1600-line React file | Collect/Library/Settings markup and shared atoms all lived inside `InPageCollectorApp.tsx`, making every UI change high-friction | Extracted shared atoms to `components.tsx`, moved `ProcessingStrip` to its own file, and split tab bodies into `CollectView`, `LibraryView`, and `SettingsView`; popup shell is now ~980 lines | `src/ui/InPageCollectorApp.tsx`, `src/ui/components.tsx`, `src/ui/ProcessingStrip.tsx`, `src/ui/CollectView.tsx`, `src/ui/LibraryView.tsx`, `src/ui/SettingsView.tsx`, `tests/components.test.tsx`, `tests/processing-strip.test.tsx`, `tests/views.test.tsx` |
| Google API key draft state did not rehydrate from stored settings | Settings hydration effect updated OpenAI and Claude drafts but omitted `googleApiKey` | Added `draftGoogleKey` sync to the popup settings hydration effect while moving the form into `SettingsView` | `src/ui/InPageCollectorApp.tsx`, `src/ui/SettingsView.tsx` |
| Process All / refresh sweeps could clobber sibling item updates | Parallel queue/refresh helpers each did `loadSnapshot() -> mutate -> saveSnapshot()` against whole-state writes | Added shared async lock coverage for queue/refresh mutations, switched bulk sweeps to sequential iteration, and added lock regression tests | `entrypoints/background.ts`, `src/state/snapshot-lock.ts`, `tests/snapshot-lock.test.ts` |
| Shared popup atoms still hid their own design constants | `components.tsx` carried local colors/radii/shadows, blocking reuse and future visual cleanup | Added `src/ui/tokens.ts` and moved shared atom styling to read from that token source while preserving the existing visual output | `src/ui/tokens.ts`, `src/ui/components.tsx` |
| Cluster cards lacked per-cluster introductions and example evidence | Compare only showed keywords plus raw evidence ordering; there was no short summary for what each cluster represented | Added cached per-cluster AI summaries in the background, deterministic fallback copy in the UI, validated evidence-id selection, and fixed cluster cards to show 2 example comments per side | `src/compare/cluster-interpretation.ts`, `src/compare/provider.ts`, `src/state/messages.ts`, `entrypoints/background.ts`, `src/ui/CompareView.tsx`, `tests/compare-cluster-interpretation.test.ts`, `tests/compare-view.test.tsx` |
| Engagement compare overstated raw deltas and hid missing metric detail | The old table compared totals directly, framed them as deltas, and used `—` for missing capture data, which made newer posts look artificially weak | Split Compare into raw totals vs age-adjusted velocity, surfaced `Approx. ... old` labels from time tokens when exact post time is missing, replaced bare `—` with explicit capture-state copy, and added expandable cluster evidence metric details | `src/ui/CompareView.tsx`, `tests/compare-view.test.tsx` |
| Compare lost too much vertical space when no AI key was configured | The empty AI Summary card still rendered as a full section, pushing the cluster analysis down even though the user could still use deterministic compare | Replaced the empty card with a small inline notice and kept the audience cluster section immediately visible; CompareView now also sources its local palette from the shared token layer | `src/ui/CompareView.tsx`, `tests/compare-view.test.tsx` |
| Compare top summary was too thin to be useful | A single one-liner did not surface the actual claim contrast, emotional tone, risks, or evidence references users need when deciding whether a comparison matters | Added a stable compare brief contract, deterministic fallback, AI enrichment, representative evidence references, and a richer Compare top card | `src/compare/brief.ts`, `src/compare/provider.ts`, `src/state/messages.ts`, `entrypoints/background.ts`, `src/ui/CompareView.tsx`, `tests/compare-brief.test.ts`, `tests/compare-view.test.tsx` |

## Relation to Other Repos

| Repo | Role |
|------|------|
| `/Users/tung/Desktop/dlens_chrome_extension_branch` | Original prototype (page-side targeting, local review, replay export) |
| Optional ingest backend checkout | Crawler, job queue, bounded worker control, capture storage, post-crawl deterministic analysis |
| This repo (`dlens-chrome-extension-v0`) | Production MV3 extension shell |

**Codex audit note (2026-03-26):** The prototype at `dlens_chrome_extension_branch` has a `div[data-pressable-container="true"]` DOM fix that this repo already includes in `threads.ts` scoring. The prototype uses `window.localStorage`; this repo uses `chrome.storage.local`. The prototype sends `collection_name` in `client_context`; this repo does NOT send folder name to backend yet.

## Current Technical Debt (2026-03-31 Alignment)

The most recent aligned view is:

### P2

- `InPageCollectorApp.tsx` is smaller after the page split, but the popup shell still owns too much orchestration and effect logic
- inline styles are still too pervasive for easy theme or visual-direction work
- hover debounce remains too slow, and SPA route transitions can leave stale overlay state

### P3

- no skeleton loading while crawl/analysis data is pending
- compare cluster matching still pairs by rank instead of semantic overlap
- compare save/bookmark should remain lightweight until there is a real external destination

## UI / Compare Follow-Ups

- API key settings should maximize trust:
  - clear saved-state feedback
  - clear statement that keys remain local to the extension/browser
- Compare should optimize for fast discussion understanding, not just model output:
  - clarify total comments captured vs surfaced evidence
  - stop shipping generic cluster names like `general` as if they were analytical labels
  - improve cluster summaries so they explain argument, posture, and evidence quality
  - expose evidence metrics inline
  - add low-n cluster guardrails and a single-dominant-cluster fallback
  - investigate why raw engagement can still disappear in Compare
  - treat current velocity math as developing until Threads-specific propagation is modeled better
  - add a future rare-insight / alert rail for branch emergence, temporal narrative shifts, and high-engagement outlier clusters
- crawl/analyze waiting states should feel alive:
  - add animated per-post loading bars or shimmer states while crawl / analysis is running
  - fake progress is acceptable if backend ETA is unknown
  - avoid precise fake time promises unless the backend later exposes reliable duration hints
- preferred future navigation direction is an in-page slide-in drawer, not Chrome Side Panel first
- compare methodology is documented in `docs/product/2026-04-02-compare-methodology.md`
- visual direction can explore a lighter glass-bubble / HUD feel, but only after component split + token cleanup make that affordable
