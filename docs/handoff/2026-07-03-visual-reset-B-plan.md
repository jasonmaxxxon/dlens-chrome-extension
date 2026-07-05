# Visual Reset B — program plan (2026-07-03)

> Trigger: user reports visual fatigue with the warm-paper editorial language
> after ~3 months of daily use, and wants UI + UX reconsidered together, at a
> larger scale than a reskin.
> Written by the Fable founding session. Executable by Sonnet-class models and
> Codex under the repo CLAUDE.md + `~/.claude/protocols/` institution.
> 中文摘要：換視覺方向的完整計畫——先清掃寫死色值、再選方向、再一檔換皮、
> 最後按使用痛點動 UX。每階段有決策閘，你不點頭不往下走。

## Ground rules that survive ANY direction (do not relitigate per phase)

- Token ARCHITECTURE (names/slots in `tokens.ts`) stays; only VALUES change.
  Views keep consuming token names — that is what makes a reskin one PR.
- `src/ui/tokens-intent.md` is rewritten in the same PR that swaps values
  (guard: `tests/tokens-intent-guard.test.ts`).
- Mockup-first, user picks; one-in-one-out; 4-prefix commits; version lock;
  full verify gate per slice; DOM-locked marquee tests updated, not deleted.
- ONE palette at a time. If the chosen direction is dark, it REPLACES warm
  paper (or the user explicitly amends the one-palette rule first).

## Measured baseline (2026-07-03)

- 271 color literals in `src/ui/*.ts{,x}` outside `tokens.ts`; worst files:
  CompareView 54, ProductSignalViews 38, topic-audit-components 18,
  InPageCollectorOverlays 17, PrEvidenceViews 16, components 15.
- Consequence: swapping `tokens.ts` today changes only part of the screen.
  Phase 2 is therefore a prerequisite for Phase 3, independent of direction.

## Phase 0 — Diagnose the fatigue (½ session, user + any model)

Fatigue has three different cures; find which one this is:
1. Palette fatigue → cure is Phase 3 (new values).
2. Sameness fatigue (every surface = same card grammar, low contrast between
   modes) → cure may be contrast/differentiation tuning, cheaper than a reset.
3. UX-shape fatigue (daily workflow outgrew the layout) → cure is Phase 4.

Method: user reacts to `docs/mockups/2026-07-03-reset-B-direction-specimens.html`
(three contrasting directions on identical components) and answers, per main
surface (Product saved signals / Topic detail / Compare): "keep / repaint /
rebuild". Record answers at the bottom of this file. Known UX debt to fold in:
`docs/handoff/2026-06-22-topic-detail-text-density-todo.md`, LOC phase-2 plan,
VIEW row-primitive follow-up (architecture map).

**Gate 0: user picks a direction (or hybrid), and marks keep/repaint/rebuild
per surface. No code before this.**

## Phase 1 — Winner mockup (1 session, model + user)

One full-fidelity HTML mockup of the WINNING direction on the two
highest-traffic surfaces (Product saved signals + Topic detail), dated, in
`docs/mockups/`. This is where hybrid adjustments happen cheaply.
**Gate 1: user signs the mockup. It stays reference-only.**

## Phase 2 — Literal sweep (2–4 Codex slices, mechanical, direction-agnostic)

Migrate the 271 color literals to token references, file by file, worst-first.
- Rule per literal: exact-match an existing token → use it; near-miss → nearest
  token (record substitutions in the PR body); genuinely new role → add a token
  (with intent line if non-obvious).
- No visual change intended; DOM tests must stay green as-is.
- Finish with a NEW GUARD so this never regresses: extend `boundary:guard` or
  add `tests/color-literal-guard.test.ts` — zero `#hex`/`rgb(a)` literals in
  `src/ui` outside `tokens.ts` (allowlist `usePopupKeyframes.ts` only if
  keyframe strings genuinely cannot cite tokens).
- Good first Codex slices: CompareView.tsx (54), ProductSignalViews.tsx (38).
**Gate 2: guard lands at zero violations; full verify gate green.**
**Gate 2 PASSED 2026-07-06**: 271 literals → 0 across 4 Codex slices
(CompareView 54 / ProductSignalViews 38 / topic-audit+PrEvidence+components+
CompareView.parts 62 / tail 48 incl. usePopupKeyframes via token
interpolation); `tests/color-literal-guard.test.ts` landed with an EMPTY
allowlist; 23 new-role tokens total (kill criterion was >50); final gate
964 tests / 959 pass / 0 fail / 5 skipped. Version bump + real-profile
runtime QA deferred to the Phase 2 exit decision with the user.

## Phase 3 — The swap (1 PR + 1 QA session)

One PR: new values in `tokens.ts` + rewritten `tokens-intent.md` (new metaphor,
new refuse-list) + shadow/motion adjustments the direction needs. Because of
Phase 2, this repaints everything at once. Then one QA session on the rebuilt
`output/chrome-mv3` in the real Chrome profile, all four modes, screenshots
into `docs/qa/`. Bump version (user-visible).
**Gate 3: user accepts runtime look. Rollback = revert one PR.**

## Phase 4 — UX shape (scoped separately, after the repaint settles)

Driven by Phase 0's rebuild-list, one surface per plan file, normal feature
process. Candidates already known: Topic detail text density; Product action
route simplification; row-level primitive adoption (VIEW 🟢→🟩 path).
Do NOT bundle UX rebuilds into Phase 3 — repaint and reshape must be
separately revertable.

## Kill criteria（什麼情況下停）

- Phase 0 shows fatigue is mostly sameness → do contrast tuning inside warm
  paper (cheap), park the reset, keep Phase 2 + its guard anyway (pure win).
- Phase 2 uncovers >50 "genuinely new role" tokens → token architecture is
  drifting; stop and re-scope with the user before Phase 3.
- Two consecutive failed QA rounds in Phase 3 → revert, return to mockup.

## Phase 0 answers (append below when collected)

- 2026-07-03: user reviewed the three direction specimens and rejected all
  three — current warm-paper design preferred. Reset PARKED per kill
  criteria. Phase 2 (literal sweep + color-literal guard) remains recommended
  as a direction-agnostic cleanup; run it standalone when convenient.
- 2026-07-05 amendment (supersedes the PARK verdict): on second review the
  user accepts direction B (Gallery White) as the working candidate and
  states the warm-paper editorial feel must eventually go. Scope is
  UI + UX + feature, but Phase 3 repaint and Phase 4 reshape stay separately
  revertable as written. Standing constraint from the user: no per-new-model
  UI "redos" — the swap happens once, through `tokens.ts`, with Phase 2's
  literal sweep + color-literal guard as the anti-accretion prerequisite.
  Specimen field audit (2026-07-05, verified against `src/state/types.ts`):
  參考度 X/5 IS real (`ProductSignalAnalysis.relevance` and
  `JudgmentResult.relevance`, both 1–5); verdict try/watch/park/
  insufficient_data real; signalType (technical/learning/demand/competitor/
  marketing/noise) real; tag chips + gist real (`SignalTagsRecord`); audit
  coverage/themes/lanes real. Two corrections the winner mockup must carry:
  (1) per-signal stance is TOPICAL (`TopicSignalStance` =
  central/adjacent/off-topic), not opinion 支持·帶保留 — relabel; (2) 轉發
  count has no field (`CapturedPostProjection` carries likes + commentCount
  only) — cut. Known B risk stays live: pure-white shell on Threads' white
  ground needs border/shadow separation in the real build (historical
  rejection noted in the specimen).
- Direction pick: B · Gallery White (working candidate; Gate 1 mockup
  sign-off still required before any code)
- Product saved signals: keep / repaint / rebuild —
- Topic detail: keep / repaint / rebuild —
- Compare: keep / repaint / rebuild —
- PR Evidence: keep / repaint / rebuild —
