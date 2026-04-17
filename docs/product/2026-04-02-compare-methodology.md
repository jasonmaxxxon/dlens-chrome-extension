# Compare Methodology

Last updated: 2026-04-02

This note captures the product methodology behind DLens compare, based on a review of the current UI and live screenshots.

Boundary note: this document describes the extension UI's consumption of compare data. The backend remains the source of truth for cluster generation and deterministic analysis; `src/analysis/*` and `src/compare/*` only reshape that read model for display and extension-side briefs.

## Core Principle

The goal of Compare is not to prove that the model can output a summary.

The goal is to let a user answer, quickly and with confidence:

- how much discussion was actually captured
- who is saying what
- what each major cluster is really about
- which evidence is representative
- whether anything unusual happened in the discussion

If the UI cannot answer those questions quickly, the summary is not useful even if it is grammatically correct.

## Applied In v0 (2026-04-02)

These principles are now partially implemented in production:

- post headers say `comments captured` instead of `comments crawled`
- Compare distinguishes total captured discussion size from surfaced evidence count
- generic cluster labels are rejected from AI output and deterministic fallback no longer ships `general` as a title
- low-signal micro-clusters are suppressed so single-dominant posts do not grow fake extra rows
- evidence metrics now surface inline before expansion
- Compare now uses dual bubble navigators with hover preview and click-to-lock selected detail instead of stacked `Cluster #1/#2/#3` rows
- selected cluster detail now prioritizes audience evidence before author stance
- Library raw comments now cap at 10 by default to keep the selected-post panel readable
- momentum is marked `Developing` instead of pretending likes/hour is a settled product metric
- rare-insight / alert work remains a future rail, not a fabricated output

## Implementation Boundary

The current extension does not generate canonical clusters. It consumes backend analysis snapshots and then applies display-only heuristics:

- `src/analysis/cluster-summary.ts` sorts clusters, suppresses low-signal output with the visible thresholds `supportCount >= 2` or `size_share >= 0.20`, and falls back to the top cluster if everything would otherwise disappear
- `src/analysis/compare-analysis.ts` packages the shaped summaries into compare-side read models and dominance labels for the UI
- `src/compare/brief.ts` builds the compare brief prompt, validates AI output, and falls back to a deterministic brief if the model is missing or invalid
- `src/compare/cluster-interpretation.ts` does the same for per-cluster labels and one-liners, using backend evidence candidates as the allowed pool
- the selected-cluster panel is a UI heuristic over visible clusters; when nothing is locked, the first visible cluster becomes the default detail target
- cluster "relatedness" in the current UI is therefore a display ordering choice, not a backend clustering claim

## Current Failure Modes

### 1. Ambiguous count language reduces trust

`6 comments crawled` / `9 comments crawled` is not enough.

Users cannot tell:

- whether this is the full captured discussion size
- whether only 6 or 9 comments exist in the dataset
- how many comments were used as evidence
- whether a cluster built from 1 comment is being overinterpreted

### 2. Generic cluster labels are not analysis

Labels like `general` or `chill` do not explain the discussion.

A good cluster output needs:

- a short human-readable title
- a one-line thesis of what that cluster is arguing or doing
- a sense of tone or social posture
- representative evidence
- relative weight in the discussion

If a cluster says `general`, the system has failed to name the discussion.

### 3. Tiny clusters need guardrails

When the total comment count is small, a cluster built from 1 comment can still look visually important.

Compare should support:

- single-dominant-cluster posts
- post-hoc merging of tiny/nearby clusters
- low-n guardrails so small fragments are not overstated

### 4. Evidence must be legible at a glance

Users should not have to expand details to learn whether a piece of evidence matters.

Every key evidence item should expose:

- likes
- replies/comments
- reposts
- forwards
- why it was selected

### 5. Missing metrics break confidence

If raw engagement disappears in Compare after extraction already captured it, users stop trusting the page.

The system must clearly distinguish:

- extracted and present
- not captured
- intentionally hidden or experimental

### 6. Velocity is not ready as a confident product story

Simple `likes/hour` is too naive for Threads propagation.

Until there is a better model, velocity should be treated as:

- experimental
- developing
- not a primary decision surface

### 7. Clustering alone is not enough

Compare should not only answer "what are the clusters?"

It should also surface "what is unusual here?"

This is where the product gets differentiated.

In practice, that means the compare surface should read like a backend-backed report with UI shaping, not a second clustering engine living in the extension.

## Product Direction

### A. Move from cluster display to discussion understanding

Each visible cluster should answer:

- who is this cluster
- what are they talking about
- what is their posture or emotional stance
- how strong or marginal are they
- what evidence best represents them

### B. Add a rare-insight / alert layer

This is separate from the summary itself.

Candidate alert types:

- discussion branch emergence
- narrative shift over time
- cluster share changing between earlier and later comments
- a small but high-engagement outlier cluster
- a new topic that is weak in count but strong in interaction

### C. Prefer trustworthy summaries over decorative summaries

The product should optimize for:

- fewer but better clusters
- explicit uncertainty
- visible evidence quality
- strong naming

Not for:

- maximum cluster count
- generic model-generated filler
- false precision from weak metrics

## Immediate Product TODO

### P0

- Investigate why Compare is still losing raw engagement fields after collect-mode extraction succeeded.

### P1

- Replace generic cluster names with short AI-generated titles grounded in metrics and key evidence.
- Upgrade cluster summaries so they describe the actual discussion, not only the keyword bucket.
- Improve the new low-n guardrails beyond simple suppression so nearby tiny clusters can merge when that is more truthful.

### P2

- Add crawl/analyze progress UI with animated loading states.
- If ETA is not available, fake progress is acceptable as long as state changes remain honest.
- Prefer animated loading bars / shimmer states over exact fake countdowns.
- If the backend later exposes stable phase durations, upgrade the same surface to estimated time remaining.
- Add a rare-insight / alert rail for narrative shifts, outlier clusters, and timeline-based discussion changes.

## Note On Embeddings

There is currently no direct embedding-aware surface in the extension compare UI.

If embeddings are used upstream, they only affect backend-side clustering before the data reaches Compare. The extension currently receives finished clusters and evidence, then renders/ranks them. Compare does not yet expose:

- semantic similarity confidence
- cluster merge confidence
- embedding-based cluster pairing
- anomaly detection from embedding distance

That is why clustering quality problems currently show up as product problems directly in the UI.
