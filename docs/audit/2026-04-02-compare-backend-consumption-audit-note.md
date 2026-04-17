# Compare Backend Consumption Audit Note

Last updated: 2026-04-02

This note is the audit-oriented boundary record for how `dlens-chrome-extension-v0` currently consumes backend compare data.

## Boundary

The backend is the canonical source of truth for crawl output, cluster generation, and deterministic analysis. The extension does not recompute canonical clusters from raw Threads comments.

`src/analysis/*` and `src/compare/*` are read-model and display adapters:

- `src/analysis/*` sorts, suppresses, and shapes backend analysis snapshots into UI-ready rows, summaries, and evidence selections
- `src/compare/*` builds the extension-side compare brief and cluster-summary prompts, validates model output, and falls back deterministically when AI output is missing or invalid

## Current Consumption Path

1. The optional ingest backend returns `capture_analyses` as the read model for each capture.
2. The extension reads those snapshots and treats their clusters, evidence, and metrics as the source data for Compare.
3. `buildClusterSummaries()` applies the visible-cluster heuristic:
   - sort by size share, then like share, then cluster key
   - hide clusters unless estimated support is at least 2 comments or `size_share` is at least `0.20`
   - if nothing survives, keep the top cluster so the UI still has one visible target
4. `resolveClusterSurface()` shapes the selected detail card:
   - title comes from the cluster interpretation layer when available
   - thesis comes from AI one-liner output when valid
   - audience evidence comes from the allowed evidence ids returned by the backend, with deterministic fallback to the top evidence slice
5. Compare now maintains one selected cluster per side:
   - `selectedClusterA`
   - `selectedClusterB`
   - if a side has no manual selection, it defaults to that side's first visible cluster
   - that is a UI ordering choice, not a backend relation score
6. `buildCompareBriefRequest()` feeds the same backend-backed summaries into the compare brief adapter.
7. `src/compare/brief.ts` and `src/compare/cluster-interpretation.ts` then apply the extension-side deterministic layer first, with AI enrichment only as an optional upgrade.

## Audit Points

- Raw clusters and evidence are consumed from backend analysis snapshots, not reconstructed locally.
- Visible suppression is a UI heuristic, not a backend clustering rule.
- Selected-cluster detail is display shaping over the read model, with backend evidence used as the allowed pool.
- Related-cluster hints are deterministic UI heuristics over title / keyword overlap only; they are not embedding matches or shared backend coordinates.
- Compare brief generation is extension-side and deterministic-first; backend output is only the input read model.
- Experimental ports in `src/analysis/experimental/*` stay outside the production compare path.
