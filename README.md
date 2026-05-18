# dlens-chrome-extension-v0

A mode-aware MV3 Chrome extension for capturing Threads discussions and turning them into research, product-signal, and PR evidence workflows. Folders now carry a `mode` (`archive | topic | product | pr-evidence`) that determines which surfaces are available and how deep the AI analysis goes.

**Boundary:** this repo is a display / read-model consumer. The optional ingest backend is the canonical source for crawl output, clustering, and deterministic analysis. This repo renders backend snapshots and layers client-side compare briefs, evidence annotations, product-context judgment, and PR evidence matching on top.

> **Last updated:** 2026-05-18

---

## Local workspace layout

This Desktop has been consolidated around these paths:

| Purpose | Path |
|---------|------|
| Active product extension worktree | `/Users/tung/Desktop/dlens-product-latest` |
| Load unpacked extension after build | `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3` |
| Ingest backend stable entry | `/Users/tung/Desktop/dlens-ingest-core` |
| Ingest backend physical checkout | `/Users/tung/Desktop/dlens-backend/dlens-ingest-core` |
| Older extension worktrees and archives | `/Users/tung/Desktop/dlens-old` |
| Git metadata root for extension worktrees | `/Users/tung/Desktop/dlens-old/git-root-dlens-chrome-extension-v0` |

`dlens-product-latest` is the user's active load-unpacked path, and
`/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3` currently mirrors
the verified `main` build. Current extension version is `0.1.10`. The source checkout may contain local
dirty work; verify branch/status before editing or rebuilding there. Do not use
the old Desktop folders unless intentionally comparing historical versions.

---

## Current state

### Folder modes

| Mode | Navigation | Core objects | AI depth |
|------|-----------|--------------|----------|
| `archive` | Library · Collect · Settings | `SavedPost` | None |
| `topic` | Casebook · Inbox · Collect · Compare · Settings | `Topic` + `Signal` | Compare brief v7, evidence annotation v1 |
| `product` | Inbox · Collect · Product insight pages · Agent Brief · Settings | `Signal` + `ProductContext` + `ProductSignalAnalysis` + `SignalReading` | ProductContextCompiler + ProductSignalAnalyzer + evidence + agent task output + reviewable reading corpus |
| `pr-evidence` | PR Evidence · Collect · Settings | `PrCampaign` + `PrEvidenceRow` | Criteria suggestion, explicit batch match with deterministic backstop, client-ready Markdown summary |

Navigation mounts/unmounts based on `folder.mode` — unavailable pages are not disabled, they do not exist in the render tree.

### Popup surfaces

| Surface | Mode | Purpose | Status |
|---------|------|---------|--------|
| **Casebook** | topic / product | Topic triage console. List of named topics with status filter (待核/觀察/學習/測試/已歸檔). | Working |
| **Inbox** | topic / product | Signal triage desk. Unprocessed Threads captures waiting to be assigned to a topic or archived. Three routing actions: assign / create-topic / archive. | Working |
| **Topic Detail** | topic / product | Single topic: overview, signals list, linked pairs. Judgment panel visible in product mode only. | Working |
| **Library** | archive | Simple saved-post list. No topic objects, no inbox, no AI. | Working |
| **Compare** | topic / product | Pairing surface. Pick post A + B, preview teaser, open Result. Breadcrumb shows topic context if entered from Topic Detail. "附加至案例" attaches the pair to a topic. | Working |
| **Collect** | all | Hover-preview capture. In topic/product mode, save creates a Signal in the Inbox; in PR Evidence mode, save creates a campaign evidence row and does not run AI. | Working |
| **Settings** | all | Backend URL, AI provider keys. Product mode imports product context files and compiles them into a structured ProductContext. | Working |
| **Product insights** | product | Real stored product-signal analyses. Shows classification, usefulness verdict, cited evidence, experiment hint, and paste-ready agent task prompt when available. No fake numbers and no cluster UI. | Working |
| **Agent Brief** | product | Review each generated `SignalReading`, file useful readings into the local corpus, then compose a filed-only Markdown brief for coding agents. | Working |
| **PR Evidence** | pr-evidence | Campaign setup, PDF/txt/md brief upload, six editable criteria, compact evidence ledger, CSV preview/export, explicit criteria matching, and exportable Markdown/DOCX PR audit summary. | Working |
| **Result** | topic / product | Contextual reading route: full analysis sheet → cluster balance → representative quotes (DictionaryCard) → trust strip. | Working |

### What actually works right now

- Hover-to-preview on Threads feeds + post-detail pages, with stale overlay reset on SPA route changes
- Folder CRUD, rename, switch, delete
- **Mode-aware save routing (2026-04-23)**: `session/save-current-preview` checks `folder.mode`; `archive` saves directly to Library, `topic`/`product` creates a `Signal` in Inbox and shows "已加入收件匣" toast. Signal creation is idempotent (deduped by `itemId`).
- **Topic triage workflow (2026-04-24)**: Inbox lists unprocessed signals; analyst assigns to existing topic, creates a new topic, or archives. `triageSignal` writes `triagedAt`, removes stale topic membership on reassignment/archive/reject, and topic deletion unassigns all related signals through one batch write.
- **Casebook home (2026-04-23)**: topic list with status-filter tabs, signal count, last-updated, `新建主題` button. AI-suggested topic section (static placeholder; Phase 2 will auto-cluster from inbox signals).
- **Topic Detail (2026-04-23)**: three-tab layout (總覽 / 討論訊號 / 成對分析). In product mode, 總覽 tab shows Judgment panel with highest-relevance `JudgmentResult` across linked pairs.
- **Pair Inspection within topic context (2026-04-23)**: breadcrumb `案例本 > [topicName] > 成對檢視`; "附加至案例" button appends `resultId` to `topic.pairIds`.
- **Product Judgment Pass 2 (2026-04-24)**: `judgment/start` handler is live. Background pulls compare brief from cache or rebuilds it from the saved pair, calls LLM via `createLlmCallWrapper` (5th wrapper, same pattern as brief/cluster/annotation), writes `JudgmentResult` back to `SavedAnalysisSnapshot`, broadcasts `judgment/result`. Graceful fallback via `buildDeterministicJudgment` when provider is missing.
- **Judgment cache** at `dlens:v1:compare-judgment-cache`, keyed by `briefHash|profileHash|promptVersion`.
- **ProductContextCompiler (2026-04-27)**: product-mode Settings compiles imported README / AGENTS / product notes into `ProductContext` using schema-first OpenAI, Gemini, or Claude output. Stored at `dlens:v1:product-context`, with migration from legacy `dlens_product_context`.
- **ProductSignalAnalyzer (2026-05-07)**: saved product signals are analyzed from the backend `ThreadReadModel` plus compiled ProductContext. Output includes `signalType`, precise `signalSubtype`, `contentType`, relevance, widened `relevantTo`, `referenceType` / `referenceLabel` / `referenceTakeaway`, verdict, reason, `experimentHint`, cited `evidenceRefs`, and optional `agentTaskSpec` for `try`. Signals can be retained as technical/general learning even when they are not a direct product fit.
- **Product insight UI (2026-04-27)**: product pages now render real stored analyses from `dlens:v1:product-signal-analyses`; cards show insight-first copy, cited discussion replies, and paste-ready Codex / Claude / generic agent task prompts. Product mode deliberately does not expose backend clusters to end users.
- **Product signal delete (2026-05-14)**: saved/product signal remove controls call `signal/delete` instead of only clearing local UI state. Deletion removes the signal from `dlens:v1:signals`, clears topic membership and affected topic synthesis, deletes the matching product analysis row, clears folder synthesis for the session, and refreshes the product pages.
- **Product analysis guard (2026-04-27)**: background keeps a per-session in-flight map so automatic analysis and manual analysis do not double-spend LLM calls for the same product session.
- **Live product crawl smoke (2026-04-27)**: real Threads post crawl succeeded through local backend; read model returned `assembledContent`, 5 OP continuation candidates, and 48 discussion replies. This validated that discussion replies are product intelligence, but also exposed that backend OP continuation splitting needs refinement.
- **PR Evidence Mode V1 (2026-05-07)**: `pr-evidence` folders now expose a dedicated PR workspace plus the shared Collect shell. V1 keeps one active campaign per PR session, PDF/txt/md press-release upload, detected core PR messages, six fixed criteria labels that AI can suggest and the user can edit, compact evidence rows for already-found Threads posts, explicit `Match criteria` batching with deterministic keyword backstop, `✓ / blank` criteria output, CSV export with UTF-8 BOM, read-only CSV preview, and a client-ready Markdown PR audit summary with MD/DOCX export. Collect does not run AI and does not create Topic signals or Product analyses in this mode.
- **Layout preferences and design variants (2026-05-14)**: `main` includes the product/synthesis/compare layout sprint line. `ExtensionSettings.layoutPreferences` persists `productSignalCardLayout`, `topicSynthesisLayout`, and `compareResultLayout` through `chrome.storage.local`; defaults are `marginalia`, `console`, and `parallel`.
- **Product signal card variants (2026-05-14)**: `ActionableItemCard` supports `verdict` and `marginalia`. Marginalia is the default product signal card layout and keeps `reusable_pattern` as the headline, cited evidence visible, and `agentTaskSpec`/`experimentHint` in the task slot.
- **Topic and folder synthesis (2026-05-14)**: Topic synthesis uses deterministic `v2.work-signal-lens` output and can render as Stack or Console. Folder synthesis uses the same work-signal lens to produce the Briefing card across multiple topics; folder synthesis is stored at `dlens:v1:folder-synthesis`.
- **Compare result variants (2026-05-14)**: Result supports `reading`, `parallel`, and `chapters`. Parallel is the default persisted layout and renders sticky A/B columns; Chapters renders a linear five-section reading path.
- **Signal Reading Review (2026-05-18)**: Product Agent Brief now uses `SignalReading` records as a reviewable local corpus. Each reading stores provenance (`model`, `sourceRefs`, trimmed `sourcePacket`), `reviewState`, and append-only `feedbackEvents`; only `reviewState === "filed"` readings enter the generated brief. Stale filed readings remain allowed but are marked in the preview/output.
- **Signal Reading UI (2026-05-18)**: The Agent Brief page is `review → compose`. Review cards keep a compact Marginalia signal strip (`verdict`, `referenceType`, `relevance`) so the older green-card signal density is not lost inside the reading workflow. Compose offers reading-first output, full package, decision-only output, and raw JSON.
- **Product signal card variants (2026-05-14)**: `ActionableItemCard` supports `verdict` and `marginalia`. Marginalia is the default product signal card layout and keeps `reusable_pattern` as the headline, cited evidence visible, `contentSummary` in the main drop-cap prose, `experimentHint` in the TRY block, and `agentTaskSpec.taskTitle` in the right-rail TASK slot.
- **Topic and folder synthesis (2026-05-14)**: Topic synthesis uses deterministic `v2.work-signal-lens` output and can render as Stack or Console. Folder synthesis uses the same work-signal lens to produce the Briefing card across multiple topics; folder synthesis is stored at `dlens:v1:folder-synthesis`.
- **Compare result variants (2026-05-14)**: Result supports `reading`, `parallel`, and `chapters`. Parallel is the default persisted layout and renders sticky A/B columns; Chapters renders a linear five-section reading path.
- **Product classification route fix (2026-05-14)**: Product mode now treats `classification` as a first-class product signal page, so the 分类 view keeps product data effects, 720px product width, and no longer guards back to Saved Signals after navigation settles.
- **Marginalia rail dedupe (2026-05-14)**: Product signal Marginalia cards keep the right rail short: `對到` shows a category only, and TASK no longer repeats the TRY experiment sentence.
- **Marginalia visual simplification (2026-05-14)**: Product signal Marginalia cards drop the verdict from the eyebrow, hide the old FOOTNOTES header, keep bottom AI experiment/judgment detail blocks out of the marginalia path, and flatten workflow evidence rows into label-stacked dotted sections. Verdict layout keeps its existing boxed evidence/detail treatment.
- **Classification row simplification (2026-05-14)**: Product classification list rows no longer render relevance dots; `最新在前` only appears when the selected type group has at least two signals.
- **Version lock (2026-05-18)**: extension version is `0.1.10` across `package.json`, `package-lock.json`, `wxt.config.ts` manifest version, and `src/ui/version.ts`. Chrome's extension page reads the built manifest version; the popup masthead reads `BUILD_VERSION`.
- **Eval harness (2026-04-23)**: `tests/judgment-eval.test.ts` covers prompt builder + parser + fallback determinism. `tests/judgment-fixtures.ts` has golden fixtures (no real LLM calls).
- **Compare brief** (observation-first contract, prompt v7): `headline / relation / supportingObservations[] / aReading / bReading / whyItMatters / creatorCue / keywords / audienceAlignment{Left,Right} / confidence`. Observations and side readings must cite evidence aliases (`e1..eN`) or they are rejected at parse time.
- **Cluster interpretation** (prompt v3): each cluster carries separate `observation` + `reading` fields alongside its `oneLiner`.
- **Evidence annotation layer** (prompt v1): per-quote `writerMeaning / discussionFunction / whyEffective / relationToCluster / phraseMarks`. Top 2 quotes per side (max 4 per compare).
- MV3 service-worker wake recovery, bounded LRU caches (50 entries), 30s timeout + 2 retries, queue + processing orchestration
- User-supplied Google / OpenAI / Claude key; keys stay local, never sent to backend

### Known gaps (open work)

| Priority | Gap | Note |
|----------|-----|------|
| P0 | Backend ThreadReadModel refinement | Remove root duplication from OP continuation candidates; split true content continuation from OP moderation/reply chatter. Product judgment quality depends on this. |
| P1 | Real Chrome QA for v3 product + PR Evidence + Agent Brief flow | Load `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`, check Settings layout controls, Product signal Marginalia/Verdict, Signal Reading review/compose/copy, Topic Console/Stack, Compare Parallel/Chapters, PR campaign setup, PDF upload, PR Collect save routing, criteria generation, match/export, summary MD/DOCX export, topic green theme, and popup spacing. |
| P1 | Product analysis detail path | Keep evidence drill-down visible and add a dedicated signal detail route only if the card becomes too dense. |
| P2 | `background.ts` at 2341 lines | Product and PR AI handlers are live; split feature-specific handlers before adding digest/watch-mode work. |
| P2 | `useInPageCollectorAppState.ts` at 1041 lines | Topic/Product/PR orchestration is concentrated here; continue extracting before adding more workspace routes. |
| P2 | Signal digest / weekly synthesis | Cross-signal synthesis is not implemented. Current ProductSignalAnalyzer analyzes one signal at a time. |
| P3 | Watch mode / recurring crawl | Not implemented. Current flow is manual save first, then analysis. |
| P3 | Multi-source Inbox (Dcard / Instagram / PTT / YouTube) | Current scope is Threads-only. |

For earlier change history, see `git log`. Historical change bullets and per-PR tables have been removed from this file to keep it a state description, not a diary.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Content Script (threads.content.ts)                │
│  - DOM targeting heuristics (card scoring)          │
│  - Hover overlay + collect mode                     │
│  - Builds TargetDescriptor from DOM                 │
│  - Renders InPageCollectorApp (React)               │
└──────────────┬──────────────────────────────────────┘
               │ chrome.runtime.sendMessage
┌──────────────▼──────────────────────────────────────┐
│  Background Service Worker (background.ts)         │
│  - State management (global + per-tab)             │
│  - Session/folder CRUD                             │
│  - In-memory hover cache (no storage writes on hover)│
│  - Queue orchestration → POST /capture-target     │
│  - Processing control → POST /worker/drain        │
│  - Worker status → GET /worker/status             │
│  - Job/result polling                             │
│  - Client-side compare brief + cluster interp +   │
│    evidence annotation (user API key)             │
│  - ProductContextCompiler + ProductSignalAnalyzer │
│    (user API key, local storage output)           │
│  - PR criteria suggestion, matching, and summary  │
│    (user API key, local storage output)           │
└──────────────┬──────────────────────────────────────┘
               │ fetch()
┌──────────────▼──────────────────────────────────────┐
│  Backend (optional ingest service)                 │
│  - Default: http://127.0.0.1:8000                  │
│  - POST /capture-target                            │
│  - POST /worker/drain, GET /worker/status          │
│  - GET /jobs/{id}, GET /captures/{id}              │
└─────────────────────────────────────────────────────┘
```

### Architecture rules

- Extension does NOT connect directly to Supabase.
- Runtime only depends on `ingestBaseUrl`; a local backend checkout is optional and only needed for full-pipeline dev.
- Backend analysis snapshots are the source of truth for cluster content; the extension only re-ranks, suppresses, and annotates that read-model for display.
- Compare briefs / cluster interpretations / evidence annotations are generated client-side with the user's key. Backend never stores the key.

---

## Storage model

| Key | Contents |
|-----|----------|
| `dlens:v0:global-state` | `sessions[]` (each with `mode: FolderMode`), `activeSessionId`, `settings` (incl. `productProfile`) |
| `settings.layoutPreferences` | Persisted layout choices inside `ExtensionSettings`: product signal card (`verdict` / `marginalia`), topic synthesis (`stack` / `console`), compare result (`reading` / `parallel` / `chapters`) |
| `dlens:v0:tab-ui:{tabId}` | `popupOpen`, `currentMainPage`, `popupPage`, selection mode, current preview, active item id, active compare / result state |
| `dlens:v1:saved-analyses` | Lightweight compare-reading snapshots; each entry now carries `judgmentResult / judgmentVersion / judgmentSource` |
| `dlens:v1:topics` | `Topic[]` — named discussion topics with status, tags, signalIds, pairIds |
| `dlens:v1:signals` | `Signal[]` — inbox items linking a captured post to a topic after triage |
| `dlens:v1:folder-synthesis` | `FolderSynthesis[]` — deterministic cross-topic briefing records generated from analyzed topic signals |
| `dlens:v1:product-context` | Compiled `ProductContext` derived from imported product docs; legacy key `dlens_product_context` is migrated forward |
| `dlens:v1:product-signal-analyses` | `ProductSignalAnalysis[]` — per-signal product judgment, evidence refs, experiment hints, and optional agent task specs |
| `dlens:v1:signal-readings` | `SignalReading[]` — free-text per-signal reading records with provenance, review state, feedback events, and filed-only brief eligibility |
| `dlens:v1:pr-campaigns` | `PrCampaign[]` — one active PR campaign per PR Evidence session, with fixed `c1..c6` criteria labels |
| `dlens:v1:pr-evidence-rows` | `PrEvidenceRow[]` — collected Threads evidence rows scoped by campaign, criteria matches, and CSV fields |
| `dlens:v1:compare-evidence-annotation-cache` | Per-quote annotation cache |
| `dlens:v1:compare-judgment-cache` | Per-pair product judgment cache (keyed by briefHash + profileHash + promptVersion) |
| In-memory `Map<tabId, TabUiState>` | `hoveredTarget`, `flashPreview` — NOT persisted |

---

## Repo layout

```text
dlens-chrome-extension-v0/
  AGENTS.md              ← Agent handoff + process rules (read first)
  README.md              ← This file
  entrypoints/
    background.ts        ← Service worker: state, queue, topic/signal/judgment/product/PR handlers, client AI calls (2341 lines)
    threads.content.ts   ← Content script: DOM targeting, overlay, React mount
  src/
    contracts/ingest.ts  ← API request/response types
    analysis/            ← Stable + experimental cluster/evidence helpers
    compare/
      brief.ts                  ← Compare brief contract (prompt v7)
      cluster-interpretation.ts ← Cluster summary (prompt v3)
      evidence-annotation.ts    ← Per-quote annotation (prompt v1, null fallback)
      judgment.ts               ← Product judgment (prompt v1): buildJudgmentPrompt, parseJudgmentResponse, buildDeterministicJudgment
      work-signal-lens.ts       ← Deterministic work/anxiety/language lens shared by topic and folder synthesis
      topic-synthesis.ts        ← TopicSynthesis generator (v2.work-signal-lens; min 2 analyzed signals, stale delta 3)
      folder-synthesis.ts       ← FolderSynthesis generator (v2.work-signal-lens; min 3 analyzed signals across 2 topics)
      folder-synthesis-storage.ts ← FolderSynthesis storage at dlens:v1:folder-synthesis
      product-context.ts        ← ProductContextCompiler contract, parser, schema, storage key migration helpers
      product-signal-analysis.ts ← ProductSignalAnalyzer input builder, prompt, parser, evidence catalog, auto-analysis guards
      product-signal-storage.ts ← ProductSignalAnalysis storage normalization and sorting
      signal-reading.ts         ← Free-text SignalReading prompt, source packet hash, stored source packet trimming
      signal-reading-storage.ts ← SignalReading corpus storage, reviewState, feedbackEvents, staleness helpers
      signal-reading-brief.ts   ← Filed-only SignalReading brief composition
      pr-evidence.ts            ← PR criteria suggestion, match parser/backstop, CSV export, client-ready summary validator
      provider.ts               ← Google / OpenAI / Claude runtime
      saved-analysis-storage.ts ← SavedAnalysisSnapshot CRUD + normalization + judgment write-back
    state/
      types.ts           ← All types: FolderMode, Topic, Signal, SessionRecord, JudgmentResult, etc.
      messages.ts        ← ExtensionMessage union incl. topic/*, signal/*, judgment/*, product/*, pr/*, session/set-mode
      pr-evidence-storage.ts ← PrCampaign + PrEvidenceRow CRUD, normalization, one-active-campaign session rule
      topic-storage.ts   ← Topic + Signal CRUD, normalizeTopic, normalizeSignal, triageSignal
      store-helpers.ts   ← Session CRUD; normalizeSessionRecord defaults mode to 'topic' for legacy data
      processing-state.ts ← Job status, polling delay, popup width constants
    targeting/threads.ts ← Card scoring, engagement + author extraction
    ui/
      InPageCollectorApp.tsx       ← Thin popup shell + module wiring (≤400 lines)
      useInPageCollectorAppState.ts ← Popup state/effects/handlers (1041 lines; topic/product/PR state added)
      InPageCollectorPopup.tsx     ← Mode-aware routing: ALLOWED_PAGES guard, casebook + inbox + topic + PR pages
      InPageCollectorOverlays.tsx  ← Launcher + hover/flash overlays
      InPageCollectorFolderControls.tsx ← Folder strip / prompt UI
      inpage-helpers.tsx           ← Shared popup helpers and tiny display atoms
      components.tsx               ← Shared atoms, PreviewCard, ModeHeader, Stamp, Kicker, SideMark, style helpers
      tokens.ts                    ← Shared design tokens (sole design spec)
      CasebookView.tsx             ← Topic triage console: list with status filter tabs, AI-suggested topics section
      InboxView.tsx                ← Signal inbox: unprocessed signals, assign/create-topic/archive triage actions
      TopicDetailView.tsx          ← Single topic: overview, signals, pairs; Judgment panel in product mode
      ProductSignalViews.tsx       ← Product insight pages and Agent Brief: classification, evidence, reading review, filed-only brief output
      PrEvidenceViews.tsx          ← PR campaign setup, compact evidence ledger, CSV preview/export, summary export
      pr-brief-upload.ts           ← PR PDF/txt/md brief upload + text extraction
      pr-summary-export.ts         ← PR summary Markdown + DOCX export
      LibraryView.tsx              ← archive mode home: saved posts + analyses
      CollectView.tsx              ← Capture surface; signal routing in topic/product, evidence-row routing in PR mode
      CompareView.tsx              ← Compare + Result; breadcrumb + "附加至案例" when opened from Topic Detail
      CompareSetupView.tsx         ← Pairing + teaser page
      SettingsView.tsx             ← Settings: backend URL, AI keys, folder mode selector, ProductProfile form (product mode)
      SidepanelApp.tsx             ← Debug sidepanel
      ProcessingStrip.tsx          ← Worker/processing context strip
      controller.tsx               ← useExtensionSnapshot hook
  tests/                 ← 440 node:test cases in the verified main build
  docs/
    product/             ← Active product / contract plans
    archive/             ← Historical design specs kept for reference
```

---

## Local development

```bash
npm install
npm run dev          # WXT dev mode with hot reload
npm run build        # Production build → output/chrome-mv3/ (mirrors WXT's hidden .output build)
npm run typecheck    # tsc --noEmit
npx tsx --test tests/*.test.ts tests/*.test.tsx
```

### Standalone dev modes

- **Extension-only dev** — works with typecheck, tests, build, Compare UI, prompt / validation work. No backend checkout required.
- **Full-pipeline dev** — needs a separately running ingest backend reachable from `ingestBaseUrl`. `npm run backend:locate` finds a local checkout via `DLENS_INGEST_CORE_DIR` or `../dlens-ingest-core`.

### Loading in Chrome

1. `npm run build`
2. `chrome://extensions` → enable Developer mode
3. **Load unpacked** → select `output/chrome-mv3/`
4. Navigate to `threads.net` — the `+` launcher button appears top-right

---

## Deferred / parked

These were written up but are not on the current execution path:

- **70s retro-futuristic visual direction** — paused. The current visual direction is editorial warm paper / field guide (paper canvas, deep ink text, navy Post A / oxide Post B accents).
- **Reply-tree / battlefield metrics** — requires backend to thread `threads_comment_edges` through normalized comments first. Not current extension scope.
- **In-page slide-in drawer navigation** — preferred long-term direction over Chrome Side Panel, not yet implemented.
- **Collection-name forwarding to backend** — completed; active folder name is forwarded in `client_context.folder_name`.
- **Rare-insight / alert rail** — outlet stub exists in UI contract, no real feature behind it.

---

## Related repos

| Repo | Role |
|------|------|
| `dlens_chrome_extension_branch` (prototype) | Original page-side targeting / replay export prototype. Superseded. |
| Optional ingest backend checkout | Crawler, job queue, worker control, capture storage, deterministic analysis |
| This repo (`dlens-chrome-extension-v0`) | Production MV3 extension shell |
