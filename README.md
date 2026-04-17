# dlens-chrome-extension-v0

MV3 Chrome extension for reading Threads conversations as an *annotated field guide*: capture two posts, cluster their comment sections, and read a side-by-side compare brief grounded in quoted evidence.

**Boundary:** this repo is a display / read-model consumer. The optional ingest backend is the canonical source for crawl output, clustering, and deterministic analysis. This repo renders backend snapshots and layers client-side compare briefs + evidence annotations on top.

> **Last updated:** 2026-04-17

---

## Current state

### Three-page workspace

| Page | Purpose | Status |
|------|---------|--------|
| **Library** | Home surface. Saved posts, saved analyses, casebook. Collect lives as a utility mode *inside* Library (not a primary tab). | Working |
| **Compare** | Pairing surface. Pick post A + B, preview teaser, `查看完整分析 →` opens Result. | Working |
| **Result** | Full reading surface. Hero analysis sheet → cluster balance → representative quotes (`DictionaryCard`) → trust / validation drawer. | Working |

Settings is a separate utility drawer, not a primary tab.

### What actually renders right now

- Hover-to-preview on Threads feeds + post-detail pages (collect mode), with stale overlay reset on SPA route changes
- Save posts into folders; rename / switch / delete folders
- Queue single or all pending items to the ingest backend; `Process All` drains the worker
- Job + analysis polling with late-analysis recovery after crawl success
- **Compare brief** (observation-first contract, prompt v6): `headline / supportingObservations[] / aReading / bReading / whyItMatters / creatorCue / keywords / audienceAlignment{Left,Right} / confidence`. Observations and side readings must cite evidence aliases (`e1..eN`) or they are rejected at parse time.
- **Cluster interpretation** (prompt v3): each cluster carries separate `observation` + `reading` fields alongside its `oneLiner`.
- **Evidence annotation layer** (prompt v1): per-quote `writerMeaning / discussionFunction / whyEffective / relationToCluster / phraseMarks`. Top 2 quotes per side (max 4 per compare).
- **No fabricated per-quote copy.** When AI annotation is unavailable the UI renders an explicit `（尚未個別分析此留言）` empty state. Cluster-level prose is never copy-pasted into individual `DictionaryCard`s or selected-cluster evidence detail rows.
- **Compare labels stay sentence-case.** `SectionLabel` and `PostHeader` use `12px / 600 / 0.02em` label styling instead of all-caps chrome.
- **Bubble navigator labels are semantic.** Hover previews now show `${clusterTitle} · ${percentage}%`, while the bubble itself keeps the numeric `%` badge.
- **Backend capture requests include the active folder name.** The extension now forwards `client_context.folder_name` so the ingest backend receives the collection context.
- MV3 service-worker wake recovery (global state cache, warm cache, resume running polls)
- User-supplied Google / OpenAI / Claude key (Google default); keys stay local, 30s timeout + 2 retries for provider calls, bounded LRU caches for briefs / one-liners / cluster summaries

### Known gaps (open work)

| Priority | Gap | Note |
|----------|-----|------|
| P2 | `InPageCollectorApp.tsx` is ~1442 lines | Process rule caps this at 400 lines; see AGENTS.md. Still owns too much popup orchestration. |
| P2 | Compare cluster pairing is rank-based, not semantic | |
| P3 | No skeleton loading during crawl / analyze pending | Existing `ProcessingStrip` progress ring covers status, not content placeholders. |
| P3 | Several `tests/compare-view.test.tsx` cases track intended support-data UI that is not fully wired (e.g. `群組 A` swipe detail label) | Test acts as spec; tracked as pre-existing before current work. |

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
| `dlens:v0:global-state` | `sessions[]`, `activeSessionId`, `settings` |
| `dlens:v0:tab-ui:{tabId}` | `popupOpen`, `currentMainPage`, `popupPage`, selection mode, current preview, active item id, active compare / result state |
| `dlens:v1:saved-analyses` | Lightweight compare-reading snapshots used by Library + Result fallback |
| `dlens:v1:compare-evidence-annotation-cache` | Per-quote annotation cache |
| In-memory `Map<tabId, TabUiState>` | `hoveredTarget`, `flashPreview` — NOT persisted |

---

## Repo layout

```text
dlens-chrome-extension-v0/
  AGENTS.md              ← Agent handoff + process rules (read first)
  README.md              ← This file
  entrypoints/
    background.ts        ← Service worker: state, queue, polling, client AI calls
    threads.content.ts   ← Content script: DOM targeting, overlay, React mount
  src/
    contracts/ingest.ts  ← API request/response types
    analysis/            ← Stable + experimental cluster/evidence helpers
    compare/
      brief.ts                  ← Compare brief contract (prompt v6)
      cluster-interpretation.ts ← Cluster summary (prompt v3)
      evidence-annotation.ts    ← Per-quote annotation (prompt v1, null fallback)
      provider.ts               ← Google / OpenAI / Claude runtime
    state/               ← Snapshot types, messages, processing state, store helpers
    targeting/threads.ts ← Card scoring, engagement + author extraction
    ui/
      InPageCollectorApp.tsx    ← Popup shell + orchestration (over-sized; cap: 400)
      components.tsx            ← Shared atoms, PreviewCard, style helpers
      tokens.ts                 ← Shared design tokens (sole design spec)
      LibraryView.tsx           ← Library home + saved posts / analyses / casebook
      CollectView.tsx           ← Collect utility surface embedded in Library
      CompareView.tsx           ← Compare + Result surfaces (DictionaryCard, hero, trust strip)
      CompareSetupView.tsx      ← Pairing + teaser page
      SettingsView.tsx          ← Settings drawer surface
      SidepanelApp.tsx          ← Debug sidepanel
      ProcessingStrip.tsx       ← Worker/processing context strip
      controller.tsx            ← useExtensionSnapshot hook
  tests/                 ← node:test suites for targeting, state, compare contract, views
  docs/
    product/             ← Active product / contract plans
    archive/             ← Historical design specs kept for reference
```

---

## Local development

```bash
npm install
npm run dev          # WXT dev mode with hot reload
npm run build        # Production build → .output/chrome-mv3/
npm run typecheck    # tsc --noEmit
npx tsx --test tests/*.test.ts tests/*.test.tsx
```

### Standalone dev modes

- **Extension-only dev** — works with typecheck, tests, build, Compare UI, prompt / validation work. No backend checkout required.
- **Full-pipeline dev** — needs a separately running ingest backend reachable from `ingestBaseUrl`. `npm run backend:locate` finds a local checkout via `DLENS_INGEST_CORE_DIR` or `../dlens-ingest-core`.

### Loading in Chrome

1. `npm run build`
2. `chrome://extensions` → enable Developer mode
3. **Load unpacked** → select `.output/chrome-mv3/`
4. Navigate to `threads.net` — the `+` launcher button appears top-right

---

## Deferred / parked

These were written up but are not on the current execution path:

- **70s retro-futuristic visual direction** — paused. The current visual direction is soft white glass (zinc canvas, indigo Post A / amber Post B accents).
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
