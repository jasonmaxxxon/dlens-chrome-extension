# dlens-chrome-extension-v0

A mode-aware MV3 Chrome extension for capturing Threads discussions and turning them into a personal intelligence asset. Folders now carry a `mode` (`archive | topic | product`) that determines which surfaces are available and how deep the AI analysis goes.

**Boundary:** this repo is a display / read-model consumer. The optional ingest backend is the canonical source for crawl output, clustering, and deterministic analysis. This repo renders backend snapshots and layers client-side compare briefs, evidence annotations, and product-context judgment on top.

> **Last updated:** 2026-04-27

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

`dlens-product-latest` is a Git linked worktree on branch `codex/product-phase-b-p0`.
Use it for current product-mode extension work. Do not use the old Desktop
folders unless intentionally comparing historical versions.

---

## Current state

### Folder modes

| Mode | Navigation | Core objects | AI depth |
|------|-----------|--------------|----------|
| `archive` | Library · Collect · Settings | `SavedPost` | None |
| `topic` | Casebook · Inbox · Collect · Compare · Settings | `Topic` + `Signal` | Compare brief v7, evidence annotation v1 |
| `product` | Inbox · Collect · Product insight pages · Settings | `Signal` + `ProductContext` + `ProductSignalAnalysis` | ProductContextCompiler + ProductSignalAnalyzer + evidence + agent task output |

Navigation mounts/unmounts based on `folder.mode` — unavailable pages are not disabled, they do not exist in the render tree.

### Popup surfaces

| Surface | Mode | Purpose | Status |
|---------|------|---------|--------|
| **Casebook** | topic / product | Topic triage console. List of named topics with status filter (待核/觀察/學習/測試/已歸檔). | Working |
| **Inbox** | topic / product | Signal triage desk. Unprocessed Threads captures waiting to be assigned to a topic or archived. Three routing actions: assign / create-topic / archive. | Working |
| **Topic Detail** | topic / product | Single topic: overview, signals list, linked pairs. Judgment panel visible in product mode only. | Working |
| **Library** | archive | Simple saved-post list. No topic objects, no inbox, no AI. | Working |
| **Compare** | topic / product | Pairing surface. Pick post A + B, preview teaser, open Result. Breadcrumb shows topic context if entered from Topic Detail. "附加至案例" attaches the pair to a topic. | Working |
| **Collect** | all | Hover-preview capture. In topic/product mode, save creates a Signal in the Inbox instead of a direct Library item. | Working |
| **Settings** | all | Backend URL, AI provider keys. Product mode imports product context files and compiles them into a structured ProductContext. | Working |
| **Product insights** | product | Real stored product-signal analyses. Shows classification, usefulness verdict, cited evidence, experiment hint, and paste-ready agent task prompt when available. No fake numbers and no cluster UI. | Working |
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
- **ProductSignalAnalyzer (2026-04-27)**: saved product signals are analyzed from the backend `ThreadReadModel` plus compiled ProductContext. Output includes `signalType`, precise `signalSubtype`, `contentType`, relevance, `relevantTo`, verdict, reason, `experimentHint`, cited `evidenceRefs`, and optional `agentTaskSpec` for `try`.
- **Product insight UI (2026-04-27)**: product pages now render real stored analyses from `dlens:v1:product-signal-analyses`; cards show insight-first copy, cited discussion replies, and paste-ready Codex / Claude / generic agent task prompts. Product mode deliberately does not expose backend clusters to end users.
- **Product analysis guard (2026-04-27)**: background keeps a per-session in-flight map so automatic analysis and manual analysis do not double-spend LLM calls for the same product session.
- **Live product crawl smoke (2026-04-27)**: real Threads post crawl succeeded through local backend; read model returned `assembledContent`, 5 OP continuation candidates, and 48 discussion replies. This validated that discussion replies are product intelligence, but also exposed that backend OP continuation splitting needs refinement.
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
| P1 | Real Chrome QA for v3 product flow | Load `output/chrome-mv3/`, check Settings mode switch, product Collect, product analysis pages, topic green theme, and popup spacing. |
| P1 | Product analysis detail path | Keep evidence drill-down visible and add a dedicated signal detail route only if the card becomes too dense. |
| P2 | `background.ts` at 1986 lines | Product AI handlers added; split product/topic handlers before adding digest/watch-mode work. |
| P2 | `useInPageCollectorAppState.ts` at 905 lines | Some topic logic already moved to `useTopicState`; continue extracting before new product pages grow. |
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
| `dlens:v0:tab-ui:{tabId}` | `popupOpen`, `currentMainPage`, `popupPage`, selection mode, current preview, active item id, active compare / result state |
| `dlens:v1:saved-analyses` | Lightweight compare-reading snapshots; each entry now carries `judgmentResult / judgmentVersion / judgmentSource` |
| `dlens:v1:topics` | `Topic[]` — named discussion topics with status, tags, signalIds, pairIds |
| `dlens:v1:signals` | `Signal[]` — inbox items linking a captured post to a topic after triage |
| `dlens:v1:product-context` | Compiled `ProductContext` derived from imported product docs; legacy key `dlens_product_context` is migrated forward |
| `dlens:v1:product-signal-analyses` | `ProductSignalAnalysis[]` — per-signal product judgment, evidence refs, experiment hints, and optional agent task specs |
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
    background.ts        ← Service worker: state, queue, topic/signal/judgment/product handlers, client AI calls (1986 lines)
    threads.content.ts   ← Content script: DOM targeting, overlay, React mount
  src/
    contracts/ingest.ts  ← API request/response types
    analysis/            ← Stable + experimental cluster/evidence helpers
    compare/
      brief.ts                  ← Compare brief contract (prompt v7)
      cluster-interpretation.ts ← Cluster summary (prompt v3)
      evidence-annotation.ts    ← Per-quote annotation (prompt v1, null fallback)
      judgment.ts               ← Product judgment (prompt v1): buildJudgmentPrompt, parseJudgmentResponse, buildDeterministicJudgment
      product-context.ts        ← ProductContextCompiler contract, parser, schema, storage key migration helpers
      product-signal-analysis.ts ← ProductSignalAnalyzer input builder, prompt, parser, evidence catalog, auto-analysis guards
      product-signal-storage.ts ← ProductSignalAnalysis storage normalization and sorting
      provider.ts               ← Google / OpenAI / Claude runtime
      saved-analysis-storage.ts ← SavedAnalysisSnapshot CRUD + normalization + judgment write-back
    state/
      types.ts           ← All types: FolderMode, Topic, Signal, SessionRecord, JudgmentResult, etc.
      messages.ts        ← ExtensionMessage union incl. topic/*, signal/*, judgment/*, session/set-mode
      topic-storage.ts   ← Topic + Signal CRUD, normalizeTopic, normalizeSignal, triageSignal
      store-helpers.ts   ← Session CRUD; normalizeSessionRecord defaults mode to 'topic' for legacy data
      processing-state.ts ← Job status, polling delay, popup width constants
    targeting/threads.ts ← Card scoring, engagement + author extraction
    ui/
      InPageCollectorApp.tsx       ← Thin popup shell + module wiring (≤400 lines)
      useInPageCollectorAppState.ts ← Popup state/effects/handlers (779 lines; topic/signal/mode state added)
      InPageCollectorPopup.tsx     ← Mode-aware routing: ALLOWED_PAGES guard, casebook + inbox + topic detail pages
      InPageCollectorOverlays.tsx  ← Launcher + hover/flash overlays
      InPageCollectorFolderControls.tsx ← Folder strip / prompt UI
      inpage-helpers.tsx           ← Shared popup helpers and tiny display atoms
      components.tsx               ← Shared atoms, PreviewCard, ModeHeader, Stamp, Kicker, SideMark, style helpers
      tokens.ts                    ← Shared design tokens (sole design spec)
      CasebookView.tsx             ← Topic triage console: list with status filter tabs, AI-suggested topics section
      InboxView.tsx                ← Signal inbox: unprocessed signals, assign/create-topic/archive triage actions
      TopicDetailView.tsx          ← Single topic: overview, signals, pairs; Judgment panel in product mode
      ProductSignalViews.tsx       ← Product insight pages: classification, usefulness, evidence, agent task prompt output
      LibraryView.tsx              ← archive mode home: saved posts + analyses
      CollectView.tsx              ← Capture surface; toast changes to "已加入收件匣" in topic/product mode
      CompareView.tsx              ← Compare + Result; breadcrumb + "附加至案例" when opened from Topic Detail
      CompareSetupView.tsx         ← Pairing + teaser page
      SettingsView.tsx             ← Settings: backend URL, AI keys, folder mode selector, ProductProfile form (product mode)
      SidepanelApp.tsx             ← Debug sidepanel
      ProcessingStrip.tsx          ← Worker/processing context strip
      controller.tsx               ← useExtensionSnapshot hook
  tests/                 ← 281 node:test cases in the Phase B worktree
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
- **Collection-name forwarding to backend** — noted in prototype audit, not yet wired.
- **Rare-insight / alert rail** — outlet stub exists in UI contract, no real feature behind it.

---

## Related repos

| Repo | Role |
|------|------|
| `dlens_chrome_extension_branch` (prototype) | Original page-side targeting / replay export prototype. Superseded. |
| Optional ingest backend checkout | Crawler, job queue, worker control, capture storage, deterministic analysis |
| This repo (`dlens-chrome-extension-v0`) | Production MV3 extension shell |
