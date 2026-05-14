# Current State

## System State As Of 2026-05-14

DLens is now best described as a **desktop-first Threads research, product-signal, and PR evidence extension**.

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
   - product signal cards now support persisted layout variants: `marginalia` and `verdict`; default is `marginalia`
   - product pages must not show backend clusters as the product output; clusters are internal backend support, not the user-facing product abstraction

3. Archive / Library mode
   - still works as local saved-post organization plus backend queue/crawl/readiness display
   - topic-mode Library can show a deterministic cross-topic Folder Briefing generated from analyzed signals across multiple topics

4. PR Evidence mode
   - new `FolderMode` value: `pr-evidence`
   - buyer: agency / PR operator
   - V1 handles already-found / currently-opened Threads posts only
   - workspace navigation is `PR Evidence · Collect · Settings`
   - Collect reuses the shared capture shell, creates `PrEvidenceRow`, and does not run AI
   - the main surface is a compact evidence ledger, not a full spreadsheet
   - CSV is the primary evidence export; summary is a secondary client-ready Markdown/DOCX audit memo

5. Layout preference surface
   - landed on `main` as `2738d2f feature: Persist layout preferences (#4)`
   - depends on `16ae177 feature: Product signal and synthesis layout variants (#2)` and `f52f73b feature: Compare result parallel and chapters layouts (#3)`
   - `ExtensionSettings.layoutPreferences` persists:
     - `productSignalCardLayout: "verdict" | "marginalia"`; default `marginalia`
     - `topicSynthesisLayout: "stack" | "console"`; default `console`
     - `compareResultLayout: "reading" | "parallel" | "chapters"`; default `parallel`
   - Settings exposes the three controls; `InPageCollectorPopup` threads them to Product signal, Topic synthesis, and Compare result views
   - verified clean-main build output was copied to `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3` for Chrome load-unpacked use

The verified build in the active Phase B implementation worktree is:

- clean verification worktree: `/Users/tung/Desktop/dlens-main-verify-20260514-152531`
- active load-unpacked folder: `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`
- note: `/Users/tung/Desktop/dlens-product-latest` source checkout may be dirty; do not infer clean source state from the copied build artifact
- unpacked extension: `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`
- backend stable entry: `/Users/tung/Desktop/dlens-ingest-core`
- backend physical checkout: `/Users/tung/Desktop/dlens-backend/dlens-ingest-core`
- old versions and historical worktrees: `/Users/tung/Desktop/dlens-old`
- verification: `npm run typecheck`, `npx tsx --test tests/*.test.ts tests/*.test.tsx`, and `npm run build`
- latest full test count on clean `origin/main` after marginalia rail dedupe: `397 pass, 0 fail`
- latest build output was mirrored to `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`
- live backend smoke from the prior product run: `GET http://127.0.0.1:8000/worker/status` returned `{"status":"idle"}`
- extension manifest name is `DLens v3`; current extension version is `0.1.6`
- version is locked across `package.json`, `package-lock.json`, `wxt.config.ts` `manifest.version`, and `src/ui/version.ts` `BUILD_VERSION`

## PR Evidence V1 Contract State

PR Evidence mode is implemented as a separate workspace type, not a Product export option.

Core objects:

- `PrCampaign`
  - storage key: `dlens:v1:pr-campaigns`
  - scoped by `sessionId`
  - V1 resolves "active campaign" as one active campaign per PR Evidence session; saving a campaign for the same session updates/replaces that active campaign posture instead of introducing campaign switching UI
  - exactly six criteria, fixed ids `c1..c6`
  - labels can be AI-suggested and user-edited, but users cannot add/remove criteria in V1
  - PDF/txt/md press-release upload fills `briefText`, detects core PR messages, and can auto-generate six criteria

- `PrEvidenceRow`
  - storage key: `dlens:v1:pr-evidence-rows`
  - scoped by `campaignId`
  - created from Collect using the visible post fields DLens already captures
  - `criteriaMatches` is normalized to six booleans and renders as `✓ / blank`
  - `expectedEngagement` stays intentionally blank/manual; DLens does not compute true reach or EAV

AI boundaries:

- `pr/generate-criteria` can suggest six criteria labels from the campaign brief; parser accepts common AI response shapes and falls back to deterministic campaign-specific labels instead of `criterion_1..6`.
- `pr/match-criteria` runs only when the user clicks `Match criteria`; Collect never triggers this.
- Criteria matching accepts row ids plus `c1..c6` booleans, array match ids, and keyed row maps; AI output is OR'd with deterministic visible-keyword matching.
- `pr/generate-summary` receives deterministic facts and may rewrite tone, but summary validation rejects invented reach, EAV, all-channel, or unsupported numeric claims.
- Deterministic fallback exists for criteria labels, criteria matches, and client-ready Markdown summary.

Output boundaries:

- CSV export is V1's primary evidence output.
- CSV includes UTF-8 BOM and stable columns: campaign metadata, post fields, metrics, expected engagement, and six criteria labels.
- CSV preview is read-only, capped to header + first 20 rows, and uses placeholder dashes for empty cells so it does not appear as a blank sheet.
- Summary output is Markdown with `Executive Read`, `Message Pull-Through`, `Interpretation`, `Evidence Highlights`, and `Data Limits`, and can be exported as `.md` or `.docx`.
- Views are captured from DOM metrics when available and can be inferred from visible text such as `132 views`; if Threads does not expose views, V1 leaves them unavailable rather than estimating reach.
- The top-level UI is a compact evidence ledger, not an in-app spreadsheet editor.

Explicit V1 non-goals:

- no social listening discovery
- no duplicate grouping
- no true reach
- no EAV
- no XLSX
- no detail inspector
- no in-app editing workflow beyond campaign/criteria labels

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
   - prompt/cache version: `PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION = "v12"`
   - output schema: `PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA`
   - classifies saved signals into `learning | competitor | demand | technical | marketing | noise`
   - classifies content shape into `content | discussion_starter | mixed`
   - scores relevance `1..5`
   - maps relevance to widened `relevantTo` targets: ProductContext fields plus `technicalLearning`, `workflowPattern`, `marketLanguage`, `productAnalogy`, `generalLearning`, `noDirectFit`
   - adds `referenceType`, `referenceLabel`, and `referenceTakeaway` so Product mode can show "對產品可參考 / 可學習" without forcing direct product fit
   - judges `try | watch | park | insufficient_data`
   - includes evidence refs and an `experimentHint` string for `try`
   - includes optional `agentTaskSpec` only for `verdict = "try"`
   - `agentTaskSpec.taskPrompt` is a prompt the user can paste directly into Codex / Claude / a generic agent, not merely a suggestion summary
   - product signal removal is persisted through `signal/delete`: delete the signal, clear topic membership and affected topic synthesis, remove the matching product analysis row, clear session folder synthesis, then refresh Product pages

The ProductSignalAnalyzer prompt deliberately asks for precise `signalSubtype` values such as `mcp_integration`, `browser_automation`, `recurring_data_crawl`, `pm_document_generation`, and `competitor_release_monitoring`. It also explicitly avoids `contentTypeHint`; content type is an AI output over the assembled thread, not a rule-based hint.

Important boundary: these upgrades only apply to the product AI paths. Evidence annotation and compare judgment still keep their existing contracts and were not migrated to the product schemas.

## Synthesis And Layout State

Topic synthesis and Folder synthesis are deterministic extension-side display layers over already analyzed signals. They do not replace backend clustering.

- `src/compare/work-signal-lens.ts` is the shared deterministic lens for work/anxiety/language patterns.
- `src/compare/topic-synthesis.ts` produces `TopicSynthesis` with generator version `v2.work-signal-lens`, minimum 2 analyzed signals, and stale delta 3.
- `TopicSynthesisCard` supports two layouts:
  - `stack`: `sentimentNarrative` always visible; observations / clusters / verbal techniques / memes / outliers collapsed by default
  - `console`: dense always-visible mono view with cluster and meme percentage bars
- `src/compare/folder-synthesis.ts` produces `FolderSynthesis` with generator version `v2.work-signal-lens`, minimum 3 analyzed signals across at least 2 topics, and stale delta 3.
- Folder synthesis persists at `dlens:v1:folder-synthesis` through `src/compare/folder-synthesis-storage.ts`.
- `FolderSynthesisCard` renders the Briefing layout in topic-mode Library.
- `ActionableItemCard` supports `verdict` and `marginalia`; `marginalia` is the default persisted Product signal card layout.
- Marginalia rail keeps duplicated long prose out of the narrow right column: `對到` shows a category only, while TASK shows `agentTaskSpec.taskTitle` and leaves `experimentHint` in the main TRY block.
- Product `classification` is a first-class product signal page in route guards and width/data-effect helpers; do not let it fall back to `saved-signals`.
- `CompareView` supports `reading`, `parallel`, and `chapters`; `parallel` is the default persisted Result layout.

## Version State

- Current extension version: `0.1.6`.
- Chrome extension page version comes from `wxt.config.ts` `manifest.version` in the built manifest.
- Popup masthead version comes from `src/ui/version.ts` `BUILD_VERSION`.
- `package.json`, `package-lock.json`, `wxt.config.ts`, and `src/ui/version.ts` must stay in sync for every main-facing update unless explicitly skipped.
- `tests/manifest-config.test.ts` verifies package / manifest / UI version consistency.

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
2. Chrome QA: reload `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3` and walk Product Settings -> Collect -> crawl -> Product insights, layout preference switching, Compare Parallel/Chapters, Topic Console/Stack, then PR Evidence campaign setup -> PDF upload -> Generate criteria -> Collect -> Match criteria -> CSV export -> summary MD/DOCX export.
3. UI cleanup: verify topic mode green theme everywhere, product mode does not show folder concept, PR Evidence keeps the compact ledger grammar, and popup spacing/mode/layout switching stay fixed.
4. Background split: move product/topic/PR handlers out of `entrypoints/background.ts` before adding digest/watch-mode work.
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
- Product mode cards now default to Marginalia; Verdict remains available through layout preferences
- Topic synthesis defaults to Console; Stack remains available through layout preferences
- Compare Result defaults to Parallel; Reading and Chapters remain available through layout preferences
- the popup shell now uses an editorial masthead + left vertical rail instead of the older horizontal pill strip
- Result hero now follows an editorial grammar: compact headline, explicit relation line, compact `AI Brief · CONF` label
- Library ready cards now use left-accent case cards with real keyword chips from current analysis snapshots
- shared visual language now uses warm paper canvas, deep ink text, matte shadows, and navy/oxide accents
- product judgment can rebuild a compare brief on cache miss before generating `JudgmentResult`

## Open Gaps

- backend ThreadReadModel OP continuation quality is now Product mode P0
- Chrome QA still needs to walk the v3 Product, PR Evidence, and layout preference flows in `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`
- topic mode theme still needs verification that hover overlays and action buttons are fully green
- Product mode should not leak folder concept into user-facing workflow
- compare cluster pairing is still rank-based, not semantic
- no canonical semantic axis / constellation data exists yet in the backend contract
- `useInPageCollectorAppState.ts` is still a large popup orchestration hub at 1041 lines
- `background.ts` is still large at 2341 lines and should be split before signal digest / watch mode grows background behavior
- full build/test verification in some local environments may still hit the existing `rolldown` native binding issue in `tests/manifest-config.test.ts`; this is an environment/runtime problem, not product behavior

## What Not To Revisit

Do not reopen these unless there is a concrete blocker:

- direct Supabase access from the extension
- SaaS-first product direction
- turning the extension into a second backend analysis runtime
- fake semantic axis/constellation output in the frontend
- rewriting targeting heuristics from scratch
