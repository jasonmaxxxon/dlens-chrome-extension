# AGENTS.md — DLens Chrome Extension v0

> **Last updated:** 2026-04-01
> **For:** any agent continuing work in this repo

## What This Repo Is

Production MV3 Chrome extension for capturing Threads posts, organizing them into local folders, queueing them to `dlens-ingest-core`, and comparing two crawled posts with lightweight analysis.

The extension is now **extension-first**, not SaaS-first:

- local folders and UI state live in `chrome.storage.local`
- backend owns crawl jobs and deterministic analysis
- extension owns user API keys and compare one-liners

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

- hover-to-preview on Threads feed and post-detail pages
- engagement extraction for likes, comments, reposts, forwards, views
- repost-aware author extraction
- folder CRUD and save accumulation
- popup tabs: Collect / Library / Compare / Settings
- queue single post or all pending posts to ingest-core
- **Process All** button (combined queue + drain) always visible in Library, no item selection required
- **Processing strip** above tabs: shows idle/draining status, ready/total counts, crawling/analyzing/pending badges
- popup worker status feedback (`idle` / `draining` / `already running` toast)
- job polling and late analysis polling (10s interval, exponential backoff on failure)
- compare tab for any 2 **ready** items (crawl + analysis both succeeded)
- compare tab auto-expands popup width to 504px with smooth CSS transition
- **readiness board**: per-item status list when < 2 items are ready
- auto-pair selection via `pickCompareSelection()` with self-compare prevention
- **redesigned Compare UI** (2026-03-30): intelligence-first layout — AI summary → audience cluster comparison → engagement compare → expandable comments
- **audience cluster comparison**: full-width cards with A vs B side-by-side per cluster rank, AI-enhanced one-line summaries, deterministic fallback copy, 2 example evidence comments per side, expandable evidence details (`likes`, `comments`, `reposts`, `forwards`), and an analysis summary strip with plain-language dominance label (高度集中/中度分散/高度分散)
- engagement compare now splits raw totals from age-adjusted velocity and shows approximate age labels when only `time_token_hint` is available
- compact post headers replace old verbose post cards
- top comments collapsed by default with expand toggle
- client-side compare one-liner using the user's Google (Gemini 2.0 Flash), OpenAI, or Claude key; Google is the default provider
- per-cluster AI summaries use the same local provider/key; invalid or failed model responses fall back to deterministic cluster copy
- manifest host permission for Google Generative Language API is present so Gemini compare requests can execute from the background worker
- MV3 wake recovery and retry-on-connection-loss behavior
- `localPage` state for instant tab switching (no round-trip delay for width/content change)
- `chrome.storage.local` persistence with schema-backed extension state; hover state remains in memory only
- standalone analysis toolkit under `src/analysis/`
  - stable deterministic helpers for evidence lookup, cluster ranking, and compare-side shaping
  - experimental Python-parity ports for keyword extraction, like-share metrics, and cluster interpretation seed building
  - CompareView now consumes the stable deterministic layer; experimental ports remain out of production
- popup UI split has started
  - shared atoms now live in `src/ui/components.tsx`
  - `ProcessingStrip`, `CollectView`, `LibraryView`, and `SettingsView` are separate modules
  - `InPageCollectorApp.tsx` is down to ~980 lines instead of ~1600
- background queue/refresh writes now serialize through a shared async lock, so bulk queue/refresh sweeps do not overwrite sibling item updates
- shared popup design tokens now live in `src/ui/tokens.ts`; common atoms read from that source

## What Is Intentionally Not In This Repo

- direct Supabase access
- account/auth flows
- full analyst workspace
- topic expansion
- claims runner / deep LLM pipeline

## Current Pipeline

```text
Extension
  -> POST /capture-target
  -> dlens-ingest-core
  -> Supabase captures + crawl_jobs
  -> worker drain
  -> crawl_results
  -> capture_analyses
  -> GET /captures/{id}
  -> Compare tab + client-side one-liner
```

Important boundary:

- backend never receives user OpenAI / Claude keys
- compare one-liner is generated in the extension only

## Key Files

| File | Role |
|------|------|
| `/Users/tung/Desktop/dlens-chrome-extension-v0/entrypoints/background.ts` | service worker; state owner; queue, polling, worker control, one-liner bridge |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/entrypoints/threads.content.ts` | content script; targeting, overlay, React mount |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/targeting/threads.ts` | Threads heuristics, engagement extraction, author extraction |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/InPageCollectorApp.tsx` | popup shell + state orchestration (~980 lines after view extraction) |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/components.tsx` | shared popup atoms, PreviewCard, and styling helpers |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/ProcessingStrip.tsx` | processing summary strip component |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CollectView.tsx` | collect tab view |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/LibraryView.tsx` | library tab view |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/SettingsView.tsx` | settings tab view |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CompareView.tsx` | compare UI (~580 lines); intelligence-first layout: AI summary, cluster A vs B, engagement+time, expandable comments |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/controller.tsx` | snapshot sync, retry-on-worker-wake, 10s polling |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/processing-state.ts` | processing summary, readiness status, polling delay, popup width constants |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/snapshot-lock.ts` | tiny async lock used to serialize background queue/refresh snapshot writes |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/messages.ts` | ExtensionMessage union type definitions |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ingest/client.ts` | backend HTTP client including worker drain/status |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/contracts/ingest.ts` | capture/job/analysis/worker status contracts |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/analysis/cluster-summary.ts` | stable deterministic cluster/evidence shaping helpers for future compare/backend adapters |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/analysis/experimental/cip.ts` | experimental Python-parity cluster interpretation helpers kept separate from production flow |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/cluster-interpretation.ts` | cluster AI summary prompt/parsing helpers plus deterministic fallback copy |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/store-helpers.ts` | session item operations, normalization, refresh decisions |
| `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/tokens.ts` | shared popup design tokens for common atoms |

## Rules You Must Not Break

1. Background is the only network owner.
2. Hover updates stay in memory, not storage.
3. Any path reading preview state must respect the hover cache.
4. All post URL comparisons go through `normalizePostUrl()`.
5. Polling must continue until both crawl and analysis reach stable states.
6. Compare one-liner must degrade cleanly when no key is configured or model call fails.
7. Google (Gemini 2.0 Flash) is the default one-liner provider; `ExtensionSettings.googleApiKey` must be handled alongside openai/claude keys in all settings paths.
8. After any code change, update this file and the README.

## Known Risks

### P2

- `InPageCollectorApp.tsx` is smaller after the page split, but the popup shell still owns too much orchestration/effect logic
- inline styles are still widespread; no real design token layer yet
- hover debounce still feels slow (360ms)
- SPA route changes can leave stale overlay state

### P3

- no skeleton loading during crawl / analysis wait states
- compare cluster matching is still by rank, not by semantic/keyword overlap
- folder/collection name is still not sent to backend
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
- **CompareView now consumes the stable analysis layer**: cluster ranking, evidence ordering, and one-liner payload shaping now flow through `src/analysis/cluster-summary.ts` instead of ad-hoc view helpers
- **Popup page views extracted**: `CollectView.tsx`, `LibraryView.tsx`, and `SettingsView.tsx` now hold the tab bodies, while `components.tsx` and `ProcessingStrip.tsx` carry the shared UI atoms
- **Google key draft hydration fixed**: popup settings now rehydrate `googleApiKey` into the local draft state instead of only syncing OpenAI/Claude keys
- **Background queue/refresh lock added**: `queueSessionItem()` and `refreshItem()` now run through `src/state/snapshot-lock.ts`, and bulk queue/refresh sweeps execute sequentially to avoid whole-snapshot overwrite races
- **Design token file added**: `src/ui/tokens.ts` now owns shared popup colors/radii/shadows while `components.tsx` consumes that source
- **Cluster AI summaries added**: Compare now asks the configured local provider for all visible cluster summaries in one request, validates returned evidence ids, caches successful results, and falls back to deterministic copy if the model output is invalid or missing
- **Compare engagement + evidence details improved**: raw engagement totals and age-adjusted velocity now render as separate sections, missing capture data is labeled explicitly (`Not captured` / `Partial metrics only`), approximate ages use `time_token_hint` when exact post time is missing, and cluster evidence cards expose expandable metric details

## Still TODO (2026-03-31)

- Move inline styles toward CSS variables / design tokens before any larger visual redesign
- Reduce hover debounce and clear stale overlay state on SPA route changes
- Improve Compare evidence quality
  - cluster pairing should not stay rank-only forever
- Distinguish metric `0` from `data unavailable`
- Keep any compare save/bookmark feature lightweight until there is a real external destination
- Preferred navigation direction for the next major UI pass is an in-page slide-in drawer, not Chrome Side Panel first
  - do this only after the God Component split makes the popup views drawer-ready

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

Also fixed in `dlens-ingest-core`:
- `runner.py` control flow bug: success logging + analysis enqueue was unreachable after exception return; restructured with flag-based flow

## Verification Standard

Before claiming success:

```bash
cd /Users/tung/Desktop/dlens-chrome-extension-v0
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

If a change touches ingest or compare behavior, also verify against `/Users/tung/Desktop/dlens-ingest-core`.
