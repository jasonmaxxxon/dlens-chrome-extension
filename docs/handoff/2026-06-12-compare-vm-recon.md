# Compare VM slice — recon (for Codex)

> Date: 2026-06-12 · Author: Claude · Companion to `docs/handoff/2026-06-11-0.2-viewmodel-boundary-plan.md`
> Target: `src/viewmodel/compare.ts` ← `src/ui/CompareView.tsx` (4116 lines). Same recipe as Product/Topic VM, **with one structural divergence — read B first.**

Entry today: `CompareView({ session, settings, onGoToLibrary, forcedSelection, hideSelector, fromTopicId, fromTopicName, onReturnToTopic, topics, activeResultId, attachedTopicIds, onAttachToTopic, compareLayout })` — `src/ui/CompareView.tsx:3569`. Replace the **data** inputs (`session`, `settings`) with a `CompareViewModel`; the nav/config callbacks become commands.

## A. Snapshot-derived derivation the VM must absorb (pure — like Product/Topic)

`getItemReadinessStatus(item)` is called inline ~9× and `pickCompareSelection` once. All of this moves into the VM:

- `CompareView.tsx:1987-2001` — `readyCount` / `analyzingCount` / `failedCount` / `pendingItem` / `pendingStatus` (all via `getItemReadinessStatus`).
- `CompareView.tsx:3585` — `readyItems = session.items.filter(getItemReadinessStatus === "ready")`.
- `CompareView.tsx:3589` — `pickCompareSelection(session.items, A, B)` → A/B selection candidates.

Note: Compare's readiness is `getItemReadinessStatus` (`ready|analyzing|failed`, from `processing-state`), **not** the 6-state product `signal-readiness`. The VM owns whichever readiness the surface needs — the rule is just "UI never calls `getItemReadinessStatus` inline; the VM does."

## B. ⚠️ DIVERGENCE — Compare is NOT a pure `snapshot → VM` surface

Unlike Product/Topic, Compare's core data (brief, cluster interpretations, evidence annotations) is **async-fetched via messages and held in component state**, with deterministic fallbacks. It is not in the tab snapshot.

- `compare/get-brief` — `CompareView.tsx:3677` (brief lives in background `COMPARE_BRIEF_CACHE_KEY`, not the snapshot)
- `compare/get-cluster-summaries` — `:3721`
- `compare/get-evidence-annotations` — `:3818`
- Fallbacks: `buildDeterministicCompareBrief`, `buildDeterministicClusterInterpretation` (`:595`)
- Surface state already exists: `CompareBriefSurfaceState = "idle" | "loading" | "ready" | "fallback"` (`:88`); provenance already wired via `ai-provenance` (`normalizeAiOutputProvenance` / `describeAiOutputProvenance`, `:8,595-599`).

**Implication for the builder signature** — it must take both the snapshot AND the fetched compare results:

```ts
buildCompareViewModel(snapshot: ExtensionSnapshot, fetched: {
  brief: CompareBrief | null;
  clusterInterpretations: ClusterInterpretation[];
  evidenceAnnotations: EvidenceAnnotation[];
  briefState: "idle" | "loading" | "ready" | "fallback";
}): CompareViewModel
```

- The VM's `analysisState` (brief load/stale) composes **`load-state` + `derived-record`** (slice ⑧ — brief staleness belongs in the VM, not a UI ternary).
- The VM's `provenance` (ai vs fallback) composes **`ai-provenance`** (slice ⑨ — already imported; move the `describeAiOutputProvenance` formatting consumption to read the VM field).
- The async fetches stay effectful in the component, but their **results feed into the builder**, and the component holds no derivation logic — only "dispatch fetch command → store result → rebuild VM".

## C. Commands (inline messages + callbacks → typed descriptors)

- **Read/fetch** (effectful loads, dispatched by component): `compare/get-brief`, `compare/get-cluster-summaries`, `compare/get-evidence-annotations`.
- **Mutation**: `compare/save-technique-reading` — `CompareView.tsx:3982`.
- **Nav/config callbacks → descriptors**: `onGoToLibrary`, `onReturnToTopic`, `onAttachToTopic(topicId)`.

All carry explicit targets (sessionId / itemA / itemB / topicId) — no closures over raw state.

## D. Defensive surface is small

`Array.isArray` / `safe*` count in CompareView = **1** — minimal ④-class residue, nothing to consolidate here.

## Recipe (same as Product/Topic, with B baked in)

1. `buildCompareViewModel(snapshot, fetched)` pure builder composing `getItemReadinessStatus`-equivalent + `load-state` + `derived-record` + `ai-provenance`.
2. **Characterization tests** must cover the matrix **briefState {idle/loading/ready/fallback} × provenance {ai/fallback}** + readiness counts + A/B selection — not just the happy path. (This is the bug surface that a naive snapshot-only copy would miss.)
3. Swap `CompareView` to `{ viewModel, onCommand }`; delete the inline `getItemReadinessStatus` loops + brief/provenance ternaries.
4. Shell (`InPageCollectorPopup`) maps the fetch/mutation/nav commands.

DoD + governing rules per the 0.2 plan. One PR, off `main`, green, no version bump.
