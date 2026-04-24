# Current State

## System State As Of 2026-04-24

DLens currently has two active subsystems and one frozen prototype repo:

1. optional ingest backend
   - supports `POST /capture-target`, `GET /jobs/{job_id}`, `GET /captures/{capture_id}`
   - supports `POST /worker/drain` and `GET /worker/status`
   - persists `captures`, `crawl_jobs`, `crawl_results`, and `capture_analyses`
   - keeps crawl status and analysis status separate
   - runs deterministic post-crawl analysis and returns it in the capture read model

2. `dlens-chrome-extension-v0`
   - production MV3 shell for Threads capture and queueing
   - local folders in `chrome.storage.local`
   - explicit processing control instead of assuming a permanent worker
   - compare/result now read backend analysis snapshots and layer extension-side compare briefs plus evidence annotations on top
   - popup design tokens now follow an editorial warm-paper field-guide direction instead of the older soft-white-glass palette

3. `dlens_chrome_extension_branch`
   - frozen page-side targeting prototype
   - still the canonical source for Playwright-side targeting validation

## Fresh Known-Good Pipeline

The verified runtime path remains:

`Extension queue -> POST /capture-target -> captures/crawl_jobs -> worker drain -> crawl_results -> capture_analyses -> GET /captures/{id}`

Latest branch-state confirmations:

- backend capture requests still forward `client_context.folder_name`
- compare brief prompt version is now `v7`
- extension-side compare brief now includes `relation`
- Result hero now shows both the relation framing and a compact confidence label
- Result why card now renders both A and B side readings when both are present
- Library ready cards now derive their visible keyword chips from the real top cluster keywords, not mock data
- background wake refresh merges fetched job/capture updates into the latest persisted global snapshot instead of overwriting from a stale worker-start snapshot

## What This Repo Now Does

This repo currently covers:

- precise Threads selection and local folder organization
- enqueue and refresh against the ingest HTTP contract
- explicit processing control from the popup
- compare/result reading for two succeeded captures
- deterministic backend analysis rendering:
  - top clusters
  - evidence comments
  - metrics
- extension-side compare brief synthesis:
  - `headline`
  - `relation`
  - `supportingObservations`
  - `aReading`
  - `bReading`
  - `whyItMatters`
  - `creatorCue`
  - `keywords`
  - `audienceAlignment{Left,Right}`
  - `confidence`
- per-quote evidence annotation with compact-mode fallback when AI annotation is absent
- evidence annotation retry state resets after empty/error responses so the same request key can be retried
- standalone local analysis helpers for display-layer shaping
- topic/signal storage keeps topic membership consistent across reassignment, archive/reject, and topic deletion

## What Is Already Decided

- extension does not connect directly to Supabase
- backend owns crawl and canonical deterministic analysis
- extension owns user API keys and extension-side compare brief fields such as `relation` and `confidence`
- runtime boundary is `ingestBaseUrl`; local backend checkout discovery is documentation/tooling only
- `src/analysis/experimental/*` may hold future-facing ports, but must stay disconnected from production UI/background until explicitly integrated
- processing is bounded and explicit, not a permanent daemon
- compare remains limited to two posts for v1.x
- `tokens.ts` is the sole design spec, and the active direction is now editorial warm paper / field guide

## Current Important Boundary

Do not collapse this distinction:

- **extension-owned presentation synthesis**
  - compare brief copy such as `headline`, `relation`, `whyItMatters`, `creatorCue`, `confidence`
- **backend-owned semantics**
  - canonical semantic cluster pairing
  - divergence / positioning axes
  - any constellation-style layout that claims to encode real discussion distance

The extension may present backend output more clearly, but it should not fabricate new semantic truth.

## Active Product/UI State

- `Library` is the preparation desk and casebook entry surface
- `Compare` remains the pairing/setup page
- `Collect` is back as a primary rail mode, but still uses the existing content-script preview/save/toggle contract
- `Settings` stays a utility drawer in behavior, now presented inside the same editorial shell grammar
- `Result` is the contextual reading route, not a primary rail destination
- the popup shell now uses an editorial masthead + left vertical rail instead of the older horizontal pill strip
- Result hero now follows an editorial grammar: compact headline, explicit relation line, compact `AI Brief · CONF` label
- Library ready cards now use left-accent case cards with real keyword chips from current analysis snapshots
- shared visual language now uses warm paper canvas, deep ink text, matte shadows, and navy/oxide accents
- product judgment can rebuild a compare brief on cache miss before generating `JudgmentResult`

## Open Gaps

- compare cluster pairing is still rank-based, not semantic
- no canonical semantic axis / constellation data exists yet in the backend contract
- `useInPageCollectorAppState.ts` is still the main popup orchestration hub at 779 lines
- `background.ts` is still large at 1766 lines and should stay a split target before Phase 2 grows background behavior
- full build/test verification in some local environments may still hit the existing `rolldown` native binding issue in `tests/manifest-config.test.ts`; this is an environment/runtime problem, not product behavior

## What Not To Revisit

Do not reopen these unless there is a concrete blocker:

- direct Supabase access from the extension
- SaaS-first product direction
- turning the extension into a second backend analysis runtime
- fake semantic axis/constellation output in the frontend
- rewriting targeting heuristics from scratch
