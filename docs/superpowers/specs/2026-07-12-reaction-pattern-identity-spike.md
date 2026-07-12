# Reaction Pattern Identity Spike (0.4.0 gating question)

**Date:** 2026-07-12
**Question:** Can Reaction Pattern Trajectory (0.4.0 functionality #3) rest on
`ReactionPattern.id`? i.e. is a pattern's identity stable enough across audit
runs to draw a per-pattern trajectory line across episodes?

**Answer:** No — and the question resolves at the architecture level, so no
runtime re-run measurement is needed. DLens has **two identity systems**: claim
identity is robust and validated; reaction-pattern identity does not exist.
Ship claim-backed episode delta in 0.4.0; defer pattern trajectory to 0.4.x
behind a new carry-forward mechanism.

---

## Evidence

### Claim identity — robust (backs Episode Explorer + Narrative Delta, #1 + #2)

- `NarrativeClaim.id` is server-assigned and stable: `claim-${nextIds.claim++}`
  at [topic-audit-continuity.ts:181](../../../src/compare/topic-audit-continuity.ts).
  Carried claims keep the prior id (`id: prior.id`, line 171).
- Cross-run continuity is explicit: the LLM returns a `carriedClaims` review that
  references each prior `claimId`, and
  `assertPriorClaimsAccounted` ([topic-audit-continuity.ts:111](../../../src/compare/topic-audit-continuity.ts))
  **hard-throws** on a duplicate, unknown, or unaccounted-for prior claim
  ("must account for every active prior claim exactly once").
- Evidence anchors are deterministic: `a_${fnv1a64(stableKey)}`
  (`buildNarrativeAnchorId`, line 74) — same evidence → same anchor id across runs.
- `strengthened` is guarded: requires a genuinely new evidence anchor vs. the
  prior claim (line 164-168).
- The already-shipped `TopicEpisodeDeltaStrip`
  ([TopicDetailView.tsx:543](../../../src/ui/TopicDetailView.tsx)) renders
  new / strengthened / weakened / retired straight off `episode.delta`, which is
  derived from `claim.trajectory` (`episodeDelta`, line 255).

→ Trajectory built on claims is trustworthy today. #2 is largely already built;
0.4.0 extends it from single-episode to cross-episode.

### Reaction-pattern identity — absent (would back Reaction Trajectory, #3)

- `pattern.id` is whatever the LLM emits. The P4 schema literally seeds
  `"id": "reaction-1"` ([topic-audit-prompts.ts:503](../../../src/compare/topic-audit-prompts.ts))
  — an ordinal, regenerated fresh each run.
- `normalizeReactionPatterns`
  ([topic-audit-handlers.ts:463](../../../src/state/topic-audit-handlers.ts))
  spreads `...pattern` and only filters evidence refs. No id re-derivation, no
  stabilization, no semantic keying.
- There is **no carry-forward mechanism**: grep for
  `carriedPattern|patternContinuity|priorPattern` across `src/` returns nothing.
  Nothing plays the role `carriedClaims` plays for claims.
- `reactionSnapshot` is stored on every episode
  ([topic-audit-continuity.ts:240](../../../src/compare/topic-audit-continuity.ts))
  but has **zero consumers** outside the module that writes it — no UI, no VM
  reads it. It is currently dead-stored data.

→ Drawing a per-pattern line across episodes on `pattern.id` would be
architecturally wrong (matching ordinals, not identities), not merely noisy.

---

## Decision

- **0.4.0 ships:** Episode Explorer + cross-episode **claim** delta (#1 + #2).
  Backed by real, validated, persistent claim identity.
- **Reaction in 0.4.0:** show per-episode reaction **coverage numbers only**
  (count / usable denominator are real and per-episode meaningful). No per-pattern
  continuity line, no "this pattern strengthened since last episode."
- **0.4.x (deferred):** Reaction Pattern Trajectory requires **building** the
  missing mechanism, mirroring the proven claim design:
  1. server-assigned stable pattern ids (not LLM ordinals),
  2. a `carriedPatterns` review where P4 references prior pattern ids,
  3. a completeness validator analogous to `assertPriorClaimsAccounted`.
  This is net-new prompt + validator + storage work — a real feature slice, not a
  hack, and clearly out of 0.4.0 scope.

## Non-need

The runtime re-run experiment originally proposed (run one topic's audit 2-3×,
diff pattern ids) is **not required**: with no carry-forward mechanism, empirical
id stability is moot. Skipping it saves a runtime-QA cycle.
