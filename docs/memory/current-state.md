# Current State

## System State As Of 2026-04-27

DLens is now best described as a **desktop-first Threads research and product-signal triage extension**.

The current product split is:

1. Topic mode
   - complete enough to use as a real research workflow
   - saved Threads posts become inbox `Signal`s
   - signals can be triaged into `Topic`s and shown in Casebook / Topic detail
   - Compare results can be attached to topic context
   - judgment storage and provider calls are wired through the extension

2. Product mode
   - no longer a fake-number stub
   - Settings accepts product context via profile fields and imported README / AGENTS / AI-agent files
   - `ProductContextCompiler` makes a real AI call and stores compiled context in `chrome.storage.local["dlens:v1:product-context"]`
   - legacy `chrome.storage.local["dlens_product_context"]` is migrated forward and removed
   - Settings shows a `系統理解` preview so the user can inspect what the AI understood before trusting later judgments
   - `ProductSignalAnalyzer` is wired as the product AI path for saved signals
   - product pages read real stored analysis state and show readiness/error/empty states instead of fabricated analytics
   - product cards show useful insight, cited discussion replies, `experimentHint`, and optional paste-ready `agentTaskSpec`
   - product pages must not show backend clusters as the product output; clusters are internal backend support, not the user-facing product abstraction

3. Archive / Library mode
   - still works as local saved-post organization plus backend queue/crawl/readiness display

The verified build in the active Phase B implementation worktree is:

- worktree: `/Users/tung/Desktop/dlens-product-latest`
- unpacked extension: `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`
- backend stable entry: `/Users/tung/Desktop/dlens-ingest-core`
- backend physical checkout: `/Users/tung/Desktop/dlens-backend/dlens-ingest-core`
- old versions and historical worktrees: `/Users/tung/Desktop/dlens-old`
- verification: `npm run typecheck`, `npx tsx --test tests/*.test.ts tests/*.test.tsx`, and `npm run build`
- latest full test count in this worktree after ProductSignalAnalyzer + agent task output: `284 pass, 0 fail`
- live backend smoke: `GET http://127.0.0.1:8000/worker/status` returned `{"status":"idle"}`
- extension manifest name in this worktree is `DLens v3`

## Product AI Contract State

Product mode now has two schema-first AI contracts:

1. `ProductContextCompiler`
   - file: `src/compare/product-context.ts`
   - prompt version: `PRODUCT_CONTEXT_PROMPT_VERSION = "v1"`
   - output schema: `PRODUCT_CONTEXT_JSON_SCHEMA`
   - OpenAI uses strict `response_format: { type: "json_schema" }`
   - Gemini uses `generationConfig.responseJsonSchema`
   - Claude uses a required tool call with `input_schema`

2. `ProductSignalAnalyzer`
   - files: `src/compare/product-signal-analysis.ts`, `src/compare/provider.ts`
   - prompt/cache version: `PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION = "v1"`
   - output schema: `PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA`
   - classifies saved signals into `learning | competitor | demand | technical | noise`
   - classifies content shape into `content | discussion_starter | mixed`
   - scores relevance `1..5`
   - maps relevance to `ProductContext` fields via `relevantTo`
   - judges `try | watch | park | insufficient_data`
   - includes evidence refs and an `experimentHint` string for `try`
   - includes optional `agentTaskSpec` only for `verdict = "try"`
   - `agentTaskSpec.taskPrompt` is a prompt the user can paste directly into Codex / Claude / a generic agent, not merely a suggestion summary

The ProductSignalAnalyzer prompt deliberately asks for precise `signalSubtype` values such as `mcp_integration`, `browser_automation`, `recurring_data_crawl`, `pm_document_generation`, and `competitor_release_monitoring`. It also explicitly avoids `contentTypeHint`; content type is an AI output over the assembled thread, not a rule-based hint.

Important boundary: these upgrades only apply to the product AI paths. Evidence annotation and compare judgment still keep their existing contracts and were not migrated to the product schemas.

## Current Backend Dependency

ProductSignalAnalyzer is designed to consume the backend `ThreadReadModel`, especially:

- `assembledContent`
- `opContinuations`
- `discussionReplies`

The extension has fallback behavior for older capture shapes, but product-quality judgment depends on the backend producing a good Thread read model. OP continuation detection and discussion split should stay backend/deterministic, not in extension UI.

The live Kathy Threads crawl validated the shape but also exposed the next backend fix:

- crawler captured 53 comments, with 5 OP continuation candidates and 48 discussion replies
- discussion replies contained product-intelligence value around recurring crawl, MCP/tool calling, browser automation, and PM document output
- current OP continuation detection can include duplicate root content and OP interaction replies, so backend should split `content_continuation` from `op_reply_chatter`

RAG remains intentionally out of V1. The accepted V1 design is:

- user imports compact product docs
- ProductContextCompiler compresses them into structured ProductContext
- every product signal analysis receives the compiled ProductContext
- revisit RAG only when real users routinely upload very large documents/codebase-scale context

## Do Not Forget

- Product mode output should answer: "這條 signal 對我的產品有什麼用？下一步可以交給 agent 做什麼？"
- Product mode should not become a cluster dashboard. Show insight, evidence, verdict, and agent task, not `cluster_1 / cluster_2`.
- Discussion replies are first-class product evidence. The cited replies need to stay visible because they explain why the verdict is credible.
- Full README RAG is not needed for V1. Use compiled `ProductContext`; revisit retrieval only for genuinely large user documents.
- Cost is controlled by trigger timing: analyze saved signals, and only generate richer agent tasks for `verdict = "try"` or explicit user action.
- Mobile/share-extension direction remains product-valid, but it should reuse the same backend queue and ProductSignalAnalyzer contract rather than becoming a separate product.

## Immediate Next Work

1. Backend P0: refine `ThreadReadModel` OP continuation splitting and remove root duplication.
2. Chrome QA: reload `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3` and walk product Settings -> Collect -> crawl -> Product insights.
3. UI cleanup: verify topic mode green theme everywhere, product mode does not show folder concept, and popup top spacing/mode switching stay fixed.
4. Background split: move product/topic handlers out of `entrypoints/background.ts` before adding digest/watch-mode work.
5. Phase C later: signal digest / watch mode / recurring intelligence. Do not start there before backend read-model quality is fixed.

## Previous System State As Of 2026-04-24

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
- Product mode has its own insight pages backed by `dlens:v1:product-signal-analyses`; these pages should not render backend clusters as the primary product output
- Product mode cards should lead with useful insight, cited evidence, verdict, experiment hint, and optional `agentTaskSpec`
- the popup shell now uses an editorial masthead + left vertical rail instead of the older horizontal pill strip
- Result hero now follows an editorial grammar: compact headline, explicit relation line, compact `AI Brief · CONF` label
- Library ready cards now use left-accent case cards with real keyword chips from current analysis snapshots
- shared visual language now uses warm paper canvas, deep ink text, matte shadows, and navy/oxide accents
- product judgment can rebuild a compare brief on cache miss before generating `JudgmentResult`

## Open Gaps

- backend ThreadReadModel OP continuation quality is now Product mode P0
- Chrome QA still needs to walk the v3 Product mode flow in `/Users/tung/Desktop/dlens-product-phase-b-p0/output/chrome-mv3`
- topic mode theme still needs verification that hover overlays and action buttons are fully green
- Product mode should not leak folder concept into user-facing workflow
- compare cluster pairing is still rank-based, not semantic
- no canonical semantic axis / constellation data exists yet in the backend contract
- `useInPageCollectorAppState.ts` is still a large popup orchestration hub at 905 lines
- `background.ts` is still large at 1986 lines and should be split before signal digest / watch mode grows background behavior
- full build/test verification in some local environments may still hit the existing `rolldown` native binding issue in `tests/manifest-config.test.ts`; this is an environment/runtime problem, not product behavior

## What Not To Revisit

Do not reopen these unless there is a concrete blocker:

- direct Supabase access from the extension
- SaaS-first product direction
- turning the extension into a second backend analysis runtime
- fake semantic axis/constellation output in the frontend
- rewriting targeting heuristics from scratch
