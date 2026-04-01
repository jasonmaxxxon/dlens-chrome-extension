# Current State

## System State As Of 2026-03-27

DLens now has two active subsystems and one frozen prototype repo:

1. `dlens-ingest-core`
   - supports `POST /capture-target`, `GET /jobs/{job_id}`, `GET /captures/{capture_id}`
   - supports `POST /worker/drain` and `GET /worker/status`
   - persists `captures`, `crawl_jobs`, `crawl_results`, and `capture_analyses`
   - keeps crawl status and analysis status separate
   - runs deterministic post-crawl analysis and returns it in the capture read model

2. `dlens-chrome-extension-v0`
   - production MV3 shell for Threads capture and queueing
   - local folders in `chrome.storage.local`
   - explicit `Start processing` action instead of assuming a permanent worker
   - compare tab now reads backend analysis snapshots and can auto-generate a compare one-liner from a user-supplied OpenAI or Claude key
   - now also contains a standalone `src/analysis/` toolkit for future reuse, but it is not wired into the popup/background flow yet

3. `dlens_chrome_extension_branch`
   - frozen page-side targeting prototype
   - still the canonical source for Playwright-side targeting validation

## Fresh Known-Good Pipeline

The verified live path is now:

`Extension queue -> POST /capture-target -> captures/crawl_jobs -> worker drain -> crawl_results -> capture_analyses -> GET /captures/{id}`

Latest known-good live checks in this branch history:

- crawl results persisted successfully after the normalized image payload fix
- `capture_analyses` rows now succeed after fixing the analyzer call signature in ingest-core worker control
- extension keeps polling after crawl success until late-arriving analysis snapshot appears

## What This Repo Now Does

This repo is no longer only a queue shell. It now covers:

- precise Threads selection and local folder organization
- enqueue and refresh against ingest-core
- explicit processing control from the popup
- compare view for two succeeded captures
- deterministic backend analysis rendering:
  - top clusters
  - evidence comments
  - metrics
- optional client-side compare one-liner using the user's own API key
- standalone local analysis helpers for future integration:
  - stable deterministic evidence/cluster shaping
  - experimental Python-parity ports from `DLens_26`

## What Is Already Decided

- extension does not connect directly to Supabase
- backend owns crawl and deterministic analysis
- extension owns user API keys and LLM one-liners
- `src/analysis/experimental/*` is allowed to hold future-facing ports, but it must stay disconnected from production UI/background until explicitly integrated
- processing is bounded and explicit, not a permanent daemon
- compare remains limited to two posts for v1.x

## What Not To Revisit

Do not reopen these unless there is a concrete blocker:

- direct Supabase access from the extension
- SaaS-first product direction
- mid-crawl preview analysis in v1.1
- claims runner / topic expansion / full analyst workspace inside the extension
- rewriting targeting heuristics from scratch
