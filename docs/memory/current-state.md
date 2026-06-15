# Current State

## System State As Of 2026-06-12

DLens is now best described as a **desktop-first Threads research, product-signal, and PR evidence extension**.

The architecture handoff source of truth is now
`docs/architecture/dlens-current-architecture-map.md`. Treat its colors as the
live status contract: 🟢 means built, 🟩 means regression-locked, 🟡 means
partial/risky, and 🔴 means not built or not trustworthy enough to rely on.

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
   - `ProductSignalAnalyzer` prompt/cache version is `v17`; new strict provider output no longer asks for legacy action-recipe fields (`copy_recipe_markdown`, `workflow_stack`, `copyable_template`)
   - product pages read real stored analysis state and show readiness/error/empty states instead of fabricated analytics
   - product cards show useful insight, cited discussion replies, reusable evidence patterns, `experimentHint`, and optional paste-ready `agentTaskSpec`; they should not turn Product Action into a long tutorial recipe surface, and the UI ignores legacy recipe fields if old records still contain them
   - product signal cards now support persisted layout variants: `marginalia` and `verdict`; default is `marginalia`
   - Product Action route restores the 0.1.15 `SignalReadingReviewWorkspace` / `READING REVIEW` UI only when the current saved signals have matching `SignalReading` rows; review callbacks alone must not switch the route away from the Marginalia action cards
   - the old page-level batch export must not return to the Action route; Saved Signals owns the `行動簡報匯出` selection/copy surface
   - Settings has a Product-only cache reset that clears derived product analyses, agent-task feedback, SignalReading rows, and compiled ProductContext without deleting saved signals/topics/PR evidence
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

5. Layout preference storage and compact UI surface
   - landed on `main` as `2738d2f feature: Persist layout preferences (#4)`
   - depends on `16ae177 feature: Product signal and synthesis layout variants (#2)` and `f52f73b feature: Compare result parallel and chapters layouts (#3)`
   - `ExtensionSettings.layoutPreferences` persists:
     - `productSignalCardLayout: "verdict" | "marginalia"`; default `marginalia`
     - `topicSynthesisLayout: "stack" | "console"`; default `console`
     - `compareResultLayout: "reading" | "parallel" | "chapters"`; default `parallel`
   - `InPageCollectorPopup` still threads persisted values to Product signal, Topic synthesis, and Compare result views
   - Settings no longer exposes the visible Layout preference card; runtime settings stay focused on folder mode, connection, keys, storage usage, and ProductProfile
   - Product and PR headers, Product recovered-analysis rows, Settings groups, and workspace switching now follow the Topic-style typography, 20px card radius, shadow, and compact content grammar
   - Workspace mode switching now reserves the ProcessingStrip slot, resets scroll before paint with `useLayoutEffect`, and crossfades the mode frame while preserving same-mode tab navigation without extra animation
   - Collect preview metrics use shared icon chips across the overlay and popup, and Product pending signal cards use Topic-style matte cards with compact clamped preview text
   - verified clean-main build output was copied to `output/chrome-mv3` for Chrome load-unpacked use

6. Signal Reading Review surface
   - `src/compare/signal-reading.ts` builds the free-text reading prompt and source packet identity; prompt version is `v9`
   - representative comments use `SIGNAL_READING_EVIDENCE_CAP = 15`, union analyzer refs with top-liked replies, and preserve like counts in the stored source packet
   - `src/compare/signal-reading-storage.ts` stores `SignalReading` rows at `dlens:v1:signal-readings`
   - each row keeps provenance (`model`, `sourceRefs`, trimmed `sourcePacket`), `reviewState`, and append-only `feedbackEvents`
   - `product/review-signal-reading` updates `reviewState` atomically with a feedback event
   - `src/compare/signal-reading-brief.ts` is the single filed-only gate: only `reviewState === "filed"` readings enter the Agent Brief output

7. Signal Packet export surface
   - `src/compare/signal-packet.ts` builds `DLensSignalPacket` records from local storage, existing ProductSignalAnalysis rows, SignalReading rows, topics, and feedback
   - `src/compare/signal-packet-export.ts` renders JSONL, Markdown, and HTML exports
   - background messages are wired: `signal-packet/get`, `signal-packet/index`, and `signal-packet/export`
   - JSONL is the agent handoff surface; HTML is the human reading surface and deliberately hides raw `decisionTrace`
   - `DLENS_SIGNAL_PACKET_VERSION` is `v3`; keep upcoming JSONL semantic clarifications additive unless a breaking reader change is truly required

8. Engineering-plan hardening slice
   - `docs/ENGINEERING_PLAN.md` §2 N1-N5 is complete
   - popup React tree has a top-level `WorkspaceErrorBoundary`
   - Settings surfaces local storage usage through background message `storage/get-usage`
   - snapshot RMW paths use `mutateSnapshot` by default; raw `withSnapshotLock` escapes are documented
   - storage behavior contracts now dispatch real background handlers with mocked `chrome.storage`
   - PR template links `docs/CODE_REVIEW.md`

The verified build in the active Phase B implementation worktree is:

- verification worktree: `dlens-product-latest`
- current extension version: `0.1.33`
- active load-unpacked folder: `output/chrome-mv3`
- note: `dlens-product-latest` source checkout may be dirty; do not infer clean source state from the copied build artifact
- unpacked extension: `output/chrome-mv3`
- backend stable entry: `../dlens-ingest-core`
- backend physical checkout: `../dlens-ingest-core`
- old versions and historical worktrees: `local dlens-old archive`
- verification: `npm run typecheck`, `npx tsx --test tests/*.test.ts tests/*.test.tsx`, and `npm run build`
- latest merged-code full test count after PR #25: `752 pass, 0 fail`
- PR #25 merged as `8106c42`; PR #28 merged as `807cfb4`; PR #26 merged as `3faff1b`; PR #27 merged as `10404ed`; version remains `0.1.33`
- latest build output was mirrored to `output/chrome-mv3`
- current engineering branch: `main`
- live backend smoke from the prior product run: `GET http://127.0.0.1:8000/worker/status` returned `{"status":"idle"}`
- extension manifest name is `DLens v3`; current extension version is `0.1.33`
- version is locked across `package.json`, `package-lock.json`, `wxt.config.ts` `manifest.version`, and `src/ui/version.ts` `BUILD_VERSION`
- runtime tab targeting fix: content-script `state/get-active-tab` and collect start/cancel must resolve to `sender.tab.id` before falling back to Chrome's focused tab, otherwise the popup can show collect mode off while the Threads content script is already in crosshair/overlay mode

## Recent PR Progress As Of 2026-06-13

- PR #17 merged: Topic ViewModel boundary, Topic view consumes `{ viewModel, onCommand }`, and B-14 audit denominator drift is characterized.
- PR #18 merged: Compare ViewModel boundary with readiness/selection, fallback/provenance/load-state, cluster surfaces, and async fetch responsibility kept in the shell.
- PR #19 merged: PR Evidence campaign/row read ownership lifted to the app shell so Collect and PrEvidenceView consume the same resource.
- PR #20 merged: PR Evidence ViewModel boundary, typed command descriptors, background-owned campaign id/time stamping, and export/file side effects moved out of the view.
- PR #21 merged: typed pipeline trace stream in `src/state/pipeline-trace.ts`; old production `markQaTrace` strings collapsed into typed events.
- PR #22 merged: collect/capture requestId trace correlation across content, popup, background save/queue/worker/refresh, and processing coordinator paths. It deliberately does not implement stale-response rejection yet.
- PR #23 merged: terminal `ui.ready` events now project from Product / Topic / Compare / PR Evidence ViewModel state through the UI shell.
- PR #24 merged: typed trace summary + live QA harness gate landed; `TRACE` remains 🟡 until backend/direct LLM trace paths and real live trace artifacts are locked.
- PR #25 merged: `RECONCILE` started with tested stale-result ignore for Compare/Product/Folder/PR UI async response writes plus a narrow session-scoped snapshot guard. Treat it as 🟡 until storage-seam-wide stale write rejection lands.
- PR #28 merged: adds `docs/qa/assets/2026-06-13/live-trace-happy.json`, `npm run qa:harness:fixture`, and a CI verify step that runs the live pipeline harness against a committed Chrome-captured typed `ui.ready` trace. This locks popup rehydrate / `ui.ready` terminal reachability only; backend/direct LLM trace and a full hover → queue → analysis live artifact remain pending.
- PR #26 merged: mirrors the request reconciler into the background snapshot save seam for `session/refresh-all` and `session/queue-items-and-start-processing`; stale capture/queue responses now skip snapshot storage writes and `state/updated` broadcasts.
- PR #27 merged: guards known stale-sensitive direct storage-key write lanes with the same reconciler: Folder synthesis generate/clear, Product analyze/synthesize/review writes, and PR criteria/advanced-metrics writes. It adds behavioral stale direct-key regression tests for `pr/fetch-advanced-metrics` and in-flight `pr/match-criteria` supersession. `RECONCILE` still stays 🟡 because this is targeted lane coverage, not a repo-wide raw storage bypass rule.
- PR #30 merged: adds `npm run storage:seam-guard`, `scripts/check-no-raw-storage.mjs`, and a CI verify step that blocks new production `chrome.storage.local.{set,remove,clear}` writes unless the site carries `TODO(seam-bypass): <key>`. It marked 14 existing `entrypoints/background.ts` bypasses as explicit legacy debt and moved `SEAM_GUARD` to 🟡 at that time.
- SEAM_GUARD zero-bypass closure: the 14 legacy `entrypoints/background.ts` write bypasses now route through seam-owned helpers for compare cache, Product context/cache, global snapshots, snapshot payloads, and tab cleanup. `npm run storage:seam-guard` reports 0 allowlisted bypasses, so `SEAM_GUARD` is now 🟩. `RECONCILE` remains 🟡 until terminal-stale storage/broadcast/UI behavior is locked across the remaining async lanes.
- Current TRACE full-live branch: expands the trace spine with `backend.request` and `llm.call`, instruments ingest backend HTTP calls and direct provider HTTP calls, mirrors service-worker trace entries back into the active QA Threads page, and adds `--require-phases` to the summary/harness gate. Jason-profile full live QA captured `docs/qa/assets/2026-06-13/full-live-backend-llm/live-trace-full-hover-save-queue-analysis.json` (hover → save → queue → backend capture → direct Google LLM → Product analysis, 900 events, no pipeline errors). The full-phase harness is wired into `npm run qa:harness:fixture` and CI, so `TRACE` moves to 🟩 when PR #29 lands.

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
   - prompt/cache version: `PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION = "v17"`
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

The ProductSignalAnalyzer prompt deliberately asks for precise `signalSubtype` values such as `mcp_integration`, `browser_automation`, `recurring_data_crawl`, `pm_document_generation`, and `competitor_release_monitoring`. It also explicitly avoids `contentTypeHint`; content type is an AI output over the assembled thread, not a rule-based hint.

Important boundary: these upgrades only apply to the product AI paths. Evidence annotation and compare judgment still keep their existing contracts and were not migrated to the product schemas.

## Synthesis And Layout State

Topic Detail now uses per-signal semantic tags as the primary scan layer. Topic synthesis and Folder synthesis remain deterministic extension-side layers over already analyzed signals; they do not replace backend clustering.

- `src/compare/signal-tags.ts` produces client-side LLM `SignalTagsRecord` output: `signalTags[]` semantic tags plus one-sentence `signalGist`, based on assembled post content and top reply evidence. Tags persist at `dlens:v1:signal-tags` keyed by `itemId`.
- `TopicDetailView` renders the semantic tag cloud and per-row `signalGist`/tag chips. The old `TopicSynthesisCard` keyword-frequency UI is not rendered in Topic Detail.
- `src/compare/topic-synthesis.ts` still produces `TopicSynthesis` with generator version `v3.generic-keyword-lens`, minimum 2 analyzed signals, stale delta 3, generic top-keyword clusters/observations/memes, and empty narrative/techniques until a future L2 synthesis layer.
- `src/compare/folder-synthesis.ts` produces `FolderSynthesis` with generator version `v3.generic-keyword-lens`, minimum 3 analyzed signals across at least 2 topics, stale delta 3, generic cross-topic keyword clusters/observations/memes, and empty narrative/techniques until a future L2 synthesis layer.
- Folder synthesis persists at `dlens:v1:folder-synthesis` through `src/compare/folder-synthesis-storage.ts`.
- `FolderSynthesisCard` renders the Briefing layout in topic-mode Library.
- Topic Detail can generate per-signal `TopicSignalReading` records from assembled post content, discussion reply evidence refs, cluster keyword hints, and an optional `TopicContext.researchQuestion`. Empty research question now runs exploratory mode instead of blocking generation. These records persist at `dlens:v1:topic-signal-readings`.
- `ActionableItemCard` supports `verdict` and `marginalia`; `marginalia` is the default persisted Product signal card layout.
- Marginalia rail keeps duplicated long prose out of the narrow right column: `對到` shows a category only, while TASK shows `agentTaskSpec.taskTitle` and leaves `experimentHint` in the main TRY block.
- Marginalia visual hierarchy is intentionally reduced: the eyebrow omits verdict, the old FOOTNOTES header is hidden, bottom AI experiment/judgment detail blocks do not render in marginalia, and workflow evidence rows use flat stacked labels with dotted dividers.
- Product classification list rows no longer show relevance dots; the `最新在前` sort hint only renders for type groups with at least two signals.
- Product `classification` is a first-class product signal page in route guards and width/data-effect helpers; do not let it fall back to `saved-signals`.
- `CompareView` supports `reading`, `parallel`, and `chapters`; `parallel` is the default persisted Result layout.
- Agent Brief review cards reuse the Marginalia signal grammar as a compact strip inside the active reading card.
- Shared Motion Layer v2 is pure CSS/token-based: buttons, rail icons, stronger card hover/lift, smooth disclosure, Product reading-review feedback, Apple Music-style verdict filter sliding plates, loading shimmer, copy feedback, and filed-reading compose highlights share the same scoped motion layer under `data-dlens-control="true"` and respect `prefers-reduced-motion`.
- Signal Reading review text uses a lighter lead-title + summary rhythm to reduce heavy long-heading fatigue; Product rail and candidate-action navigation can trigger on pointerdown to avoid Chrome/Threads swallowing the click.

## Version State

- Current extension version: `0.1.33`.
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

As of 2026-06-15, C-Backend B1 is merged in `dlens-ingest-core` PR #2 (`896373b`), extension B2 is merged through PR #32-#34 (`23d36d1`), backend B3 API typing is merged in `dlens-ingest-core` PR #3 (`116e18c`), and B4 golden fixtures are merged in backend PR #4 (`6d0cb70`) plus extension PR #36 (`282a3ea`). `READMODEL_BACKEND` is now 🟢: backend tests cover duplicate-root removal, parent-aware OP continuation chains, additive `reply_edges` / `orphan_replies`, and seven golden thread-structure cases; extension projection consumes that contract, separates OP self-replies, preserves orphan metadata, and carries the metadata into Product / Topic / Signal Packet evidence; API `thread_read_model` validates as `ThreadReadModel`.

The live Kathy Threads crawl validated the older shape and exposed the backend fix that B1 now covers:

- crawler captured 53 comments, with 5 OP continuation candidates and 48 discussion replies
- discussion replies contained product-intelligence value around recurring crawl, MCP/tool calling, browser automation, and PM document output
- pre-B1 OP continuation detection could include duplicate root content and OP interaction replies; B1 fixes the backend builder, and B2 removes the extension-side same-author promotion heuristic when a backend read model exists.

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

1. Chrome QA: use Jason's `Default` Chrome profile (`jason@brandonproject.co`), where DLens is installed from `output/chrome-mv3`; reload that unpacked extension and walk Product Settings -> Collect -> crawl -> Product insights, Compare Parallel/Chapters, Topic Console/Stack, then PR Evidence campaign setup -> PDF upload -> Generate criteria -> Collect -> Match criteria -> CSV export -> summary MD/DOCX export. Open DLens through the real extension action or the content-script in-page launcher on a real Threads page; do not count a direct `chrome-extension://.../sidepanel.html` tab or a temporary Chrome profile as user-visible QA.
2. UI cleanup: verify topic mode green theme everywhere, product mode does not show folder concept, PR Evidence keeps the compact ledger grammar, and popup spacing/mode/layout switching stay fixed.
3. TRACE is locked by the full live backend/LLM fixture gate once PR #29 lands; the remaining trace follow-up is performance investigation, not spine coverage.
4. Background split: move product/topic/PR handlers out of `entrypoints/background.ts` before adding digest/watch-mode work.
5. Phase C later: signal digest / watch mode / recurring intelligence. Do not start there before Chrome QA and popup/background orchestration cleanup are handled.

## Previous System State As Of 2026-04-24

DLens currently has two active subsystems and one frozen prototype repo:

1. optional ingest backend
   - supports `POST /capture-target`, `GET /jobs/{job_id}`, `GET /captures/{capture_id}`
   - supports `POST /worker/drain` and `GET /worker/status`
   - persists `captures`, `crawl_jobs`, `crawl_results`, and `capture_analyses`
   - keeps crawl status and analysis status separate
   - runs deterministic post-crawl analysis and returns it in the capture read model

2. `dlens-product-latest` active extension checkout (formerly `dlens-chrome-extension-v0`)
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
- compare brief prompt version is now `v8`
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
- Product mode cards now default to Marginalia; persisted Verdict records remain supported, but Settings no longer exposes the layout switcher
- Product Action route uses `SignalReadingReviewWorkspace` / `READING REVIEW` only when the current saved signals have matching `SignalReading` rows; do not render the Saved Signals `行動簡報匯出` / `原文優先` batch-copy panel there
- Product cache reset is `product/clear-cache`; keep it scoped to derived Product keys only, not saved `Signal` rows or session items
- Marginalia should avoid duplicate support chrome: the rail owns verdict/relevance/task summary, the main column owns TRY/drop-cap/footnotes, and repeated bottom AI detail panels stay hidden for this layout
- Topic synthesis defaults to Console; persisted Stack settings remain supported
- Compare Result defaults to Parallel; persisted Reading and Chapters settings remain supported
- the popup shell now uses an editorial masthead + left vertical rail instead of the older horizontal pill strip
- Result hero now follows an editorial grammar: compact headline, explicit relation line, compact `AI Brief · CONF` label
- Library ready cards now use left-accent case cards with real keyword chips from current analysis snapshots
- shared visual language now uses warm paper canvas, deep ink text, 20px paper-card radius, matte shadows, and navy/oxide accents
- product judgment can rebuild a compare brief on cache miss before generating `JudgmentResult`

## Open Gaps

- Broader Chrome QA still needs to walk the full v3 Product and PR Evidence export flows in `output/chrome-mv3`
- topic mode theme still needs verification that hover overlays and action buttons are fully green
- Product mode should not leak folder concept into user-facing workflow
- compare cluster pairing is still rank-based, not semantic
- no canonical semantic axis / constellation data exists yet in the backend contract
- `useInPageCollectorAppState.ts` is still a large popup orchestration hub at 1382 lines
- `background.ts` is still large at 2734 lines and should be split before signal digest / watch mode grows background behavior
- full build/test verification in some local environments may still hit the existing `rolldown` native binding issue in `tests/manifest-config.test.ts`; this is an environment/runtime problem, not product behavior

## What Not To Revisit

Do not reopen these unless there is a concrete blocker:

- direct Supabase access from the extension
- SaaS-first product direction
- turning the extension into a second backend analysis runtime
- fake semantic axis/constellation output in the frontend
- rewriting targeting heuristics from scratch
