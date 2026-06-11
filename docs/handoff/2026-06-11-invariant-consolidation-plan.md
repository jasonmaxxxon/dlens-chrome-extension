# Invariant Consolidation Plan — turning scattered guardrails into named system state

> Date: 2026-06-11 · Author: Claude (plan) for Codex (execution) · Baseline: `main` @ `f9d0abf` (0.1.32)

## Why this exists

Observed pattern: **the same question gets answered (guessed) independently in many places.** Each place adds a small guardrail. Short-term it blocks a bug; long-term the guards drift and fight each other (e.g. `15/15 已分析` while an uncrawled S2 was silently counted; counts reconciled with `Math.max/min`; coverage clamped with `auditCoverageDisplay`).

The fix is **not** "write more defensive UI". It is: **give each core question one explicit answer (a single source of truth), then delete the ring of guards around it.**

Slice ① (signal readiness) already proved this: `src/state/signal-readiness.ts` is now the one classifier; Topic audit gates on it; counts derive from one evidence list; ~5 clamp sites were *deleted*. That is the template for everything below.

## The core questions (each = one slice)

| # | Unnamed question | State |
|---|------------------|-------|
| ① | Is this signal ready to analyze? | **DONE** — `signal-readiness.ts` |
| ② | What is the canonical content of a captured post? | next |
| ③ | Is this view loading / empty / error / recovering? | after ② |
| ④ | (defensive arrays / safe props) | **SKIP** |
| ⑤ | Which entity does this action target? | sequenced |
| ⑥ | What single write path keeps storage consistent? | sequenced (riskiest) |
| ⑦ | Does this page exist / can I enter / how wide / which workspace? | sequenced |
| ⑧ | Is this derived record stale / reusable? | sequenced |
| ⑨ | Did this output come from AI, fallback, or is it missing? | sequenced |

## Governing rules (apply to EVERY slice — do not skip)

1. **One invariant per slice/PR.** Never cram two different state-truths into one refactor. If a slice starts touching a second question, stop and split.
2. **Characterization-test-first.** Before refactoring, write tests that lock the *current observable behavior* green (e.g. the `15/15`-with-an-uncrawled-signal test). Then refactor under them. Red-green, not edit-and-pray.
3. **Collapse, don't add.** A good slice *deletes* scattered guards. Net LOC should trend flat or negative. If a slice only adds code, the invariant probably isn't actually consolidating anything — reconsider.
4. **Single source lives in `src/state/`, pure and unit-testable.** UI/hooks/handlers consume it; they do not re-derive it. `signal-readiness.ts` is the reference shape (pure function, no DOM, no chrome.* ).
5. **Add invariant tests, not just scenario tests.** Property-style assertions catch the class that hand-written fixtures miss: `analyzed ⊆ source`, `coverage ≤ 1`, `counts sum`. (This session's bugs slipped precisely because fixtures encoded the happy path.)
6. **Build fixtures from real data shapes.** Include legacy snake_case, missing fields, uncrawled items — the states the backend actually produces — not idealized objects.
7. **Branch discipline.** Each slice = its own branch off `main`, one PR, each green (`npm run typecheck` + `npx tsx --test tests/*.test.ts tests/*.test.tsx` + `npm run build`). **Do not bump version or ride a release branch inside a cleanup slice** — version bumps are separate release commits. (This session's worktree/branch tangle is the cautionary tale.)

## Do NOT touch (these are real guards, not the treadmill)

- **Storage backward-compat normalize / legacy snake_case** — `src/compare/product-signal-storage.ts:54` and the `?? snake_case` reads. Only remove behind a migration/version gate.
- **Backend polling / backoff** — `src/state/processing-state.ts` (~`:254`). Real MV3 + eventual-consistency guard.
- **Runtime fallback / error boundaries** — keep.
- **`guardPage()`** — do not delete; *refactor it to read the registry* (⑦).

---

## Slice ② — Capture projection (DO NEXT)

**Question:** What are the canonical author / body / replies / OP-continuations / sourceUrl / likes / commentCount / hasAssembledContent of a captured post?

**Current scatter (everyone fallback-guesses their own precedence + handles snake/camel duality independently):**
- `src/compare/topic-audit.ts`: `resolveOpAuthor`, `resolveOpText`, `resolveSourceUrl`, `resolveCommentCount`, `readThreadReadModel` (`threadReadModel ?? thread_read_model`), `readRootPost` (`rootPost ?? root_post`), `readOpContinuations`, `readDiscussionReplies`, `readPostLikes` (`likeCount ?? like_count`), `buildReplyFragments`.
- `src/compare/product-signal-analysis.ts`: `hasProductSignalAssembledContent` (consumed by `signal-readiness.ts`).
- `src/ui/SignalDrawer.tsx`: `buildFragmentLookup` re-derives OP + replies for display.

**Consolidate to:** `src/state/captured-post.ts` exporting one pure `projectCapturedPost(item: SessionItem): CapturedPost` returning a canonical, camelCased view: `{ author, text, sourceUrl, likes, commentCount, replies: ReplyFragment[], opContinuations: ReplyFragment[], hasAssembledContent }`. Snake/camel duality handled **once**, inside this module.

**Delete:** the per-reader `resolve*` chains + duplicated `?? snake_case` reads. `signal-readiness`, topic-audit packet build, and SignalDrawer all read `projectCapturedPost`.

**Tests:** characterization fixtures from a *real* capture (camel + legacy snake + missing-field + uncrawled). Invariants: "OP author/text never silently swaps with a reply", "replies empty ⟺ no discussion_replies", "commentCount null ⟺ not succeeded".

**Risk: MEDIUM** — this feeds the LLM audit input; a projection bug changes what the model sees. Mitigate with the existing topic-audit tests + new characterization tests.

**Claude's note:** ② strengthens ① (readiness already calls `hasProductSignalAssembledContent`). Keep it a *pure projection* — no readiness/eligibility logic leaks in (that's ①'s job). The inline-citation issue we saw is downstream of this: once projection is canonical, "OP-only" is a property of the projection, not a guess.

---

## Slice ⑦ — Page registry (CHEAP WIN — Claude recommends doing right after ②)

**Question:** Does a page exist, can it be entered from this mode, how wide is it, which workspace/rail does it belong to?

**Current scatter:** `PRODUCT_SIGNAL_PAGES`, `ALLOWED_PAGES`, `guardPage()` in `src/state/processing-state.ts`; hardcoded page branches + `getPopupWidth()` in `src/ui/InPageCollectorPopup.tsx` (~`:394`).

**Consolidate to:** `src/state/page-registry.ts` — one record per page: `{ key, mode, width, railVisible, componentKind, allowedFrom }`. `ALLOWED_PAGES`, `PRODUCT_SIGNAL_PAGES`, width lookups, and `guardPage()` all **derive** from the registry.

**Delete:** the parallel constant lists + popup hardcoded width/branch logic.

**Risk: LOW–MEDIUM** — mechanical, well-contained, easy characterization (snapshot allowed-pages-per-mode before/after must be identical).

**Claude's note:** I'd slot this *second* (right after ②), not last. It's low-risk, high-clarity, and unblocks reasoning about every other UI slice. Keep `guardPage()` as the API; only change its *implementation* to read the registry — zero behavior change, fully test-lockable.

**Implementation note (codex/page-registry):** `src/state/page-registry.ts` now owns page key, workspace mode, allowed-entry order, rail visibility, component kind, home page, and width. `processing-state` keeps the legacy public adapters (`ALLOWED_PAGES`, `guardPage()`, `getModeHomePage()`, `getPopupWidth()`), but their answers derive from the registry. `InPageCollectorPopup` now reads rail pages, width, home page, and Product page family from the registry instead of re-declaring page lists.

---

## Slice ③ — Hydration / load state (after ⑦)

**Question:** Is a data region loading, truly-empty, error, or recovering?

**Current scatter:** `isHydrating` / `isHydratingProductSignals`, `hasRecoveredAnalyses`, the `isHydrating && length===0 ? 讀取中 : …` stamp ternaries and `data-product-hydrating` branch in `src/ui/ProductSignalViews.tsx`, plus ~20 inferred sites across `src/ui`.

**Consolidate to:** an explicit `LoadState = "loading" | "ready" | "empty" | "error" | "recovering"` derived once per region (small helper in `src/state/` or `src/ui/`), consumed by views. Replace boolean-flag *inference* with one enum read.

**Delete:** scattered `isHydrating && empty` inference ternaries.

**Risk: MEDIUM** — broad UI surface. Scope to Product + Topic views; don't boil the ocean.

**Claude's note:** This is more UI-state than pure-data, so the "src/state pure module" pattern is looser — a derive helper + a consistent prop is enough. Pairs with ⑨ (both are "show the real state honestly").

---

## Slice ⑨ — AI / fallback / missing provenance

**Question:** Did this output come from a real AI call, a deterministic fallback, or is it absent?

**Current scatter:** AI-with-deterministic-fallback in cluster summaries, `judgment` fallback, `brief`/`signal-reading` — fallback output is shaped like real analysis, so it can read as a genuine judgment (related to the OP-only cold-read and noise-framing issues).

**Consolidate to:** tag every such output with `provenance: "ai" | "fallback" | "missing"`; UI displays it honestly (e.g. fallback is visibly marked, never presented as a confident reading).

**Risk: LOW–MEDIUM.**

**Claude's note:** This is the "honesty" slice and it directly retires a whole bug class (fallback polluting judgment). Cheap relative to its value; could even precede ③.

---

## Slice ⑧ — Cache / staleness provenance

**Question:** Is a derived record stale, reusable, or in need of regeneration?

**Current scatter:** ad-hoc `hash` / `version` / `updatedAt` checks — compare brief cache, one-liner cache, audit report staleness (`isStale = added>0 || updatedAt>generatedAt`), `productContextHash`, `promptVersion`.

**Consolidate to:** every derived record carries `{ sourceHash, generatedAt, generatorVersion, stalenessReason }`; one `isStale(record, currentSource)` helper.

**Risk: MEDIUM.**

**Claude's note:** The stale-reading-with-no-inline-citations issue lives here (old `promptVersion`). After ⑧, "this reading is from an old prompt version" becomes an explicit `stalenessReason`, not an invisible degradation.

---

## Slice ⑤ — Identity / ownership (explicit target) — HIGH VALUE, HIGH RISK

**Question:** Which session / topic / item / signal / tab does this action target?

**Current scatter:** write paths infer from background `activeSessionId` / current active state; collect-save routing, sender-tab routing (`resolveTabId`), `setLiveCollectionTarget`, and the entire B-05 drift saga (the `withPersistableActiveSessionId` guard is a *symptom* of this question being unnamed).

**Consolidate to:** every mutation message carries an **explicit** `ActionTarget` (sessionId/topicId/itemId as appropriate). Background stops inferring target from `activeSessionId` on writes; `activeSessionId` becomes a UI *cursor*, not a write *authority*.

**Delete (eventually):** implicit active-state reads in write paths; the active-pointer persistence guard becomes far less load-bearing.

**Risk: HIGH** — touches the message protocol + background write paths. Largest blast radius. Lock with the `background-behavior` tests + new explicit-target tests before changing anything.

**Claude's note:** Permanently kills the B-05 class, but treat as its own *multi-PR* effort, sequenced after the lower-risk slices. Do not bundle.

---

## Slice ⑥ — Storage consistency / single mutation seam — DO LAST

**Question:** What is the one write path that keeps `sessions` / `signals` / `analyses` / `topics` mutually consistent?

**Current scatter:** multiple storage keys; `saveSnapshot` / `saveActiveSessionSnapshot` / `persistGlobalStateOnly` / `mutateSnapshot` + lock + `ensureSignalsForSessionItems` repair + orphan cleanup + refresh fallback.

**Consolidate to:** route important writes through a single mutation seam with an explicit transaction boundary; cross-key consistency (signals reconciled to items) happens *at the seam*, not via scattered repair/orphan passes.

**Risk: HIGHEST** — this is the data core. Approach with a migration/version gate; a *partial* result (define the seam, migrate the few riskiest writes) may be sufficient. Do **after** ⑤ clarifies identity.

**Claude's note:** Most dangerous slice. Do not attempt until ⑤ is done and stable. It's acceptable for this one to stay partial.

---

## Recommended sequence (Claude's risk-adjusted ordering)

User-agreed: ① done → ② → ③ → skip ④. I agree, and propose slotting the unordered ⑤–⑨ by **risk-adjusted ROI** (low-risk/high-clarity first, data-core last):

```
① readiness            ✅ done (main @ f9d0abf)
② capture projection   ← next  (MEDIUM, feeds ①)
⑦ page registry        (LOW, cheap clarity win, unblocks UI reasoning)
⑨ AI/fallback provenance (LOW–MED, retires fallback-pollution class)
③ hydration load-state (MEDIUM, UI breadth)
⑧ cache/staleness      (MEDIUM, explains stale readings)
⑤ identity/target      (HIGH, multi-PR, kills B-05 class)
⑥ storage seam         (HIGHEST, last, may stay partial)
④ defensive arrays     SKIP
```

Rationale for moving ⑦/⑨ up: both are low-risk, delete real scatter, and make the higher-risk slices (③⑤⑥) easier to reason about. ⑤ and ⑥ are deliberately last — they have the largest blast radius and benefit from the others being settled.

## Definition of done (per slice)

- One `src/state/*.ts` (or equivalent) pure module = the single answer; consumers read it, none re-derive.
- Characterization tests locking prior behavior + ≥1 invariant test.
- The scattered guards it replaces are **deleted** (grep clean).
- `typecheck` + full suite + `build` green. No version bump. Branch off `main`, one PR.
- Short note appended to this file: slice ✓, what was deleted, what now reads the single source.

## Open item (not part of this plan)

Reload-path topology: `main` is currently checked out in the archived `dlens-old/git-root` worktree, so the Desktop checkout can't `git switch main`. Resolving that (free `main` for Desktop) is pending user decision and is independent of the slices above.
