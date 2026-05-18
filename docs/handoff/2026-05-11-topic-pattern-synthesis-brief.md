# Branch Handoff: Topic Pattern Synthesis + UX Tightening

**Branch:** `codex/product-phase-b-p0`
**Date:** 2026-05-11
**Base:** `d81e554` (feature(pr-evidence): ship evidence workflow v1)

---

## What shipped

### Sprint 1 — Visual noise reduction + routing bugfix

**Removed vibe-code progress bar from TopicCard** (`CasebookView.tsx`)
The animated progress bar beside each topic card was removed. The raw counts (`analyzedCount / totalCount`) are still displayed for context, but the bar itself was pure visual noise — it communicated "loading" falsely when analysis was complete.

**Fixed "查看完整分析" CTA routing** (`useInPageCollectorAppState.ts`)
The compare result page was silently clobbered back to `"collect"` every time a user clicked "查看完整分析". Root cause: `resolveEffectivePopupPage()` called `guardPage()` which checked `ALLOWED_PAGES[activeFolderMode]` — `"result"` was never in any mode's allowed list, so it got replaced with `allowed[0]`. Fix: special-case `"result"` (and `"settings"`) to pass through before the guard check.

```ts
export function resolveEffectivePopupPage(page, activeFolderMode) {
  if (page === "settings" || page === "result") return page;
  return guardPage(page, activeFolderMode);
}
```

Regression test added: `tests/inpage-collector-state-split.test.ts` — covers all 4 FolderModes.

**Extended motion token foundation** (`tokens.ts`)
Added `tokens.motion.duration`, `tokens.motion.easing`, `tokens.motion.preset`, `tokens.motion.keyframes` — standardised animation vocabulary for future UI work.

---

### Sprint 2 — Progressive topic synthesis (L1 immediate + L2 deterministic)

**New types** (`types.ts`):
- `TopicSynthesis` — per-topic AI-ready container: `observations`, `clusters`, `memes`, `outliers`, `synthesisNarrative`
- `Topic.synthesis?: TopicSynthesis | null` — extended the core Topic shape

**New file: `src/compare/topic-synthesis.ts`**
- `generateTopicSynthesis(input)` — deterministic, cluster-aggregation-based, no LLM required
- `TOPIC_SYNTHESIS_VERSION = "v1.deterministic"` — versioned for forward-compat invalidation
- `TOPIC_SYNTHESIS_MIN_ANALYZED = 2` — gate to avoid generating from 1 item
- `TOPIC_SYNTHESIS_STALE_DELTA = 3` — `currentAnalyzedCount - generatedFromCount ≥ 3` → stale

**Storage** (`topic-storage.ts`):
- `normalizeTopicSynthesis()` — deserializes + validates synthesis from storage
- Updated `normalizeTopic()` to include `synthesis`
- Added `loadTopicById(storageArea, topicId)` helper

**Background handlers** (`background.ts`):
- `topic/synthesis/generate` — loads topic by ID, runs generator, saves back
- `topic/synthesis/clear` — clears synthesis field on topic

**UI — `TopicDetailView.tsx`**:
- Removed "比較結果" as a co-equal tab; pairs demoted to a collapsed `<details>` block at the bottom of overview
- Added `TopicSynthesisCard` component: locked state (below min threshold), empty+CTA, ready (with stale indicator + "可更新" affordance)
- `TopicDetailTab` reduced to `"overview" | "signals"`

---

### Sprint 3 — "文章" → "脈絡" rename + cross-topic folder synthesis

**Rail label rename**: `{ key: "library", label: "文章" }` → `{ key: "library", label: "脈絡" }`
Rail icon updated from books SVG to network-nodes SVG (conceptually: cross-topic connections).

**New types** (`types.ts`):
- `FolderSynthesisCluster` — has `topicCount: number` + `topicIds: string[]` (the cross-topic spread metric)
- `FolderSynthesisMeme` — has `topicIds` (which topics mention the phrase)
- `FolderSynthesisTopicCoverage` — `{ topicId, topicName, analyzedCount, totalCount }`
- `FolderSynthesis` — top-level container with `contributingTopicCount`, `totalSignalCount`, `generatedFromCount`

**New file: `src/compare/folder-synthesis.ts`**
- `generateFolderSynthesis(input)` — aggregates clusters across all topics in the folder; key filter: only clusters where `topicCount ≥ FOLDER_SYNTHESIS_MIN_TOPICS` survive (cross-topic spread requirement)
- `FOLDER_SYNTHESIS_VERSION = "v1.deterministic"`
- `FOLDER_SYNTHESIS_MIN_ANALYZED = 3`, `FOLDER_SYNTHESIS_MIN_TOPICS = 2`
- `evaluateFolderSynthesisEligibility(input)` → `{ meetsAnalyzedMin, meetsTopicMin }`
- `folderSynthesisStaleReason(synthesis, currentTotal)` → `"fresh" | "stale" | "absent"`

**New file: `src/compare/folder-synthesis-storage.ts`**
- Storage key: `dlens:v1:folder-synthesis`
- `loadFolderSynthesis(storageArea, sessionId)`, `saveFolderSynthesis()`, `clearFolderSynthesis()`
- `normalizeFolderSynthesis()` — validates version + `contributingTopicCount ≥ MIN_TOPICS`

**Background handlers** (`background.ts`):
- `folder/synthesis/get`, `folder/synthesis/generate`, `folder/synthesis/clear`

**UI — `LibraryView.tsx`**:
- Added `FolderSynthesisCard` component: locked (thresholds not met), empty+CTA, ready (clusters as chips with `×N · M 主題` annotation, observations as prose, meme badges)
- Rendered as first element in topic mode folder view

**State** (`useInPageCollectorAppState.ts`):
- `folderSynthesis`, `isGeneratingFolderSynthesis`, `folderSynthesisError` state
- `folderAnalyzedCount`, `folderContributingTopicCount` memos
- `onGenerateFolderSynthesis()`, `onClearFolderSynthesis()` async actions
- Load effect on library page open (topic mode)

---

### Sprint 4 — Compare demotion + rail tier system

**Rail tier separator** (`components.tsx`):
- Added `type RailTier = "primary" | "tool"`
- `compare` marked `tier: "tool"` in `PRIMARY_WORKSPACE_MODES`
- `ModeRail` renders a 28×1px hairline divider before the first tool-tier entry
- `ModeRailButton` for tool tier: 52px height (vs primary's natural height), 0.72 opacity when inactive

This communicates that Compare is a derived-view tool, not a primary workspace mode.

**Overview pairs demotion** (`TopicDetailView.tsx`):
- Pairs moved from co-equal tab into a `<details data-topic-pairs="folded">` block at the bottom of the overview tab
- Block hidden entirely when `pairs.length === 0`

---

## Test coverage

All new files have dedicated test suites:

| Test file | Coverage |
|-----------|----------|
| `tests/topic-synthesis.test.ts` | generator eligibility, cluster filtering, staleness |
| `tests/folder-synthesis.test.ts` | cross-topic spread filter, eligibility, staleness |
| `tests/folder-synthesis-storage.test.ts` | upsert, load, clear, normalization |
| `tests/inpage-collector-state-split.test.ts` | result page routing across all 4 modes |
| `tests/topic-detail-view.test.tsx` | folded pairs behavior, synthesis card states |
| `tests/library-view.test.tsx` | folder synthesis card states |

Run: `npm test` → all tests pass, `npm run typecheck` → clean.

---

## Open issues (not yet fixed)

### 1. Popup width not unified
Product mode uses 720px width; topic mode uses a different size. Switching modes causes a jarring visual resize. All panels should use 720px (or a single token value).

### 2. Mode isolation boundary leak
Switching product mode → topic mode causes topic mode posts/signals to be replaced by product mode data. Likely a `sessionId` key collision or shared slice in store state that isn't scoped per-mode.

### 3. Topic overview UI
Codex improved the content quality (newsletter/briefing format) but the UI structure could be further improved — dense text sections need better visual rhythm, section headers, and progressive disclosure.

---

## Key architectural invariants to preserve

- `FOLDER_SYNTHESIS_VERSION` bump → all stored synthesis records for old version will be rejected by `normalizeFolderSynthesis()` on next load (automatic invalidation)
- `TOPIC_SYNTHESIS_VERSION` same — bump the constant if the shape changes
- Cross-topic spread filter: `topicCount ≥ FOLDER_SYNTHESIS_MIN_TOPICS` is the defining rule for folder synthesis clusters; single-topic clusters are intentionally excluded
- `resolveEffectivePopupPage` must keep `"result"` and `"settings"` as pass-through pages — do not add them to `ALLOWED_PAGES`
