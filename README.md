# dlens-chrome-extension-v0

A mode-aware MV3 Chrome extension for capturing Threads discussions and turning them into a personal intelligence asset. Folders now carry a `mode` (`archive | topic | product`) that determines which surfaces are available and how deep the AI analysis goes.

**Boundary:** this repo is a display / read-model consumer. The optional ingest backend is the canonical source for crawl output, clustering, and deterministic analysis. This repo renders backend snapshots and layers client-side compare briefs, evidence annotations, and product-context judgment on top.

> **Last updated:** 2026-04-24

---

## Current state

### Folder modes

| Mode | Navigation | Core objects | AI depth |
|------|-----------|--------------|----------|
| `archive` | Library · Collect · Settings | `SavedPost` | None |
| `topic` | Casebook · Inbox · Collect · Compare · Settings | `Topic` + `Signal` | Compare brief v7, evidence annotation v1 |
| `product` | Casebook · Inbox · Collect · Compare · Settings | `Topic` + `Signal` + `JudgmentResult` | + Judgment Pass 2 (relevance / recommendedState / whyThisMatters / actionCue) |

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
| **Settings** | all | Backend URL, AI provider keys. Product mode adds ProductProfile form (name / category / audience) with one-tap bootstrapper (paste 150-char description → AI extracts fields). | Working |
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
- **Eval harness (2026-04-23)**: `tests/judgment-eval.test.ts` covers prompt builder + parser + fallback determinism. `tests/judgment-fixtures.ts` has golden fixtures (no real LLM calls).
- **Compare brief** (observation-first contract, prompt v7): `headline / relation / supportingObservations[] / aReading / bReading / whyItMatters / creatorCue / keywords / audienceAlignment{Left,Right} / confidence`. Observations and side readings must cite evidence aliases (`e1..eN`) or they are rejected at parse time.
- **Cluster interpretation** (prompt v3): each cluster carries separate `observation` + `reading` fields alongside its `oneLiner`.
- **Evidence annotation layer** (prompt v1): per-quote `writerMeaning / discussionFunction / whyEffective / relationToCluster / phraseMarks`. Top 2 quotes per side (max 4 per compare).
- MV3 service-worker wake recovery, bounded LRU caches (50 entries), 30s timeout + 2 retries, queue + processing orchestration
- User-supplied Google / OpenAI / Claude key; keys stay local, never sent to backend

### Known gaps (open work)

| Priority | Gap | Note |
|----------|-----|------|
| P1 | Visual QA in Chrome: walk all five paths (archive save, topic inbox triage, casebook, pair inspection with topic context, product judgment) | Build + reload required |
| P2 | `useInPageCollectorAppState.ts` at 779 lines | Still the main popup orchestration hub; keep future topic/product additions in smaller hooks. |
| P2 | `background.ts` at 1766 lines | Topic/signal/judgment handlers added; consider further splitting before Phase 2 grows background behavior. |
| P2 | Compare cluster pairing is rank-based, not semantic | |
| P3 | AI-suggested topic names in Inbox (suggestedTopicIds is always `[]` in Slice A) | Phase 2: cluster inbox signals and suggest topic names. |
| P3 | Multi-source Inbox (Dcard / Instagram / PTT / YouTube) | Phase 2; current scope is Threads-only. |
| P3 | Deep Reading / Evidence Route (Screen 6) | Phase 2. |
| P3 | Weekly Intelligence Brief | Phase 2; requires 2+ weeks of topic data. |

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
    background.ts        ← Service worker: state, queue, topic/signal/judgment handlers, client AI calls (1766 lines)
    threads.content.ts   ← Content script: DOM targeting, overlay, React mount
  src/
    contracts/ingest.ts  ← API request/response types
    analysis/            ← Stable + experimental cluster/evidence helpers
    compare/
      brief.ts                  ← Compare brief contract (prompt v7)
      cluster-interpretation.ts ← Cluster summary (prompt v3)
      evidence-annotation.ts    ← Per-quote annotation (prompt v1, null fallback)
      judgment.ts               ← Product judgment (prompt v1): buildJudgmentPrompt, parseJudgmentResponse, buildDeterministicJudgment
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
      LibraryView.tsx              ← archive mode home: saved posts + analyses
      CollectView.tsx              ← Capture surface; toast changes to "已加入收件匣" in topic/product mode
      CompareView.tsx              ← Compare + Result; breadcrumb + "附加至案例" when opened from Topic Detail
      CompareSetupView.tsx         ← Pairing + teaser page
      SettingsView.tsx             ← Settings: backend URL, AI keys, folder mode selector, ProductProfile form (product mode)
      SidepanelApp.tsx             ← Debug sidepanel
      ProcessingStrip.tsx          ← Worker/processing context strip
      controller.tsx               ← useExtensionSnapshot hook
  tests/                 ← 256 node:test cases (was 53 before Slice A–B)
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
