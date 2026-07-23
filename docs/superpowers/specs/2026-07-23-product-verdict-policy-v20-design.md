# Product Verdict Policy v20 Design

## Goal

Make Product mode trustworthy enough that users can rely on its judgment without useful, low-priority inspiration being silently treated as noise or rejected.

## Boundary

This is a new Verdict Policy package. It is independent from Product Import Package B and copy Package C. It keeps `ProductSignalVerdict` unchanged and does not add repo-grounded adjudication.

## Model output and persisted analysis

The provider schema and raw provider payload must not contain `verdict`. The model supplies:

```ts
export type ProductSignalUsefulness = "useful" | "uncertain" | "none";
export type ProductSignalTestability = "reversible_test" | "not_yet_testable" | "not_applicable";
export type ProductSignalEvidenceState = "text_sufficient" | "external_unverified" | "insufficient";
export type ProductSignalConflictState = "none" | "explicit_constraint" | "explicit_non_goal";

export interface ProductSignalJudgmentAxes {
  usefulness: ProductSignalUsefulness;
  testability: ProductSignalTestability;
  evidenceState: ProductSignalEvidenceState;
  conflictState: ProductSignalConflictState;
}
```

The parser validates the axes and calls exactly one pure policy function:

```ts
deriveProductSignalVerdict({
  signalType,
  judgmentAxes
}): {
  verdict: ProductSignalVerdict;
  warnings: ProductSignalJudgmentWarning[];
}
```

The derived verdict and axes are persisted in `ProductSignalAnalysis`. Downstream code may read `analysis.verdict`; no downstream path may read or fall back to a model verdict because the raw field no longer exists.

## Ordered policy

Order is product policy and must be implemented as an exhaustive ordered decision:

1. `signalType === "noise"` -> `park`.
2. `evidenceState === "insufficient"` -> `insufficient_data`.
3. `conflictState !== "none"` -> `park`.
4. useful + reversible test + text sufficient -> `try`.
5. useful or uncertain -> `watch`.
6. none + reversible test -> `park` with `none_with_reversible_test`.
7. all other none combinations -> `park` without warning.
8. enum exhaustiveness default -> `assertNever`.

Deliberate edges:

- insufficient precedes conflict because an unsupported conflict is not trusted;
- uncertain plus an explicit conflict parks;
- external-unverified can never become try even when a reversible test is claimed;
- roadmap priority is not an axis and cannot turn a useful reversible experiment into park.

## Useful watch output

`try` keeps the v19 `ProductApplicationSuggestion`.

`watch` gains:

```ts
export interface ProductWatchGuidance {
  sourcePattern: string;
  fitReason: string;
  nextEvidence: string;
  supportRefs: string[];
}
```

The UI renders `來源做法`, `為何保留`, and `下一步要知道`. A watch response without all three non-empty fields and grounded support refs is incomplete and follows the existing retry/error path. It must not fall back to a single generic reusable-pattern label.

Try keeps only valid application suggestions. Watch keeps only valid watch guidance. Noise, park, and insufficient show neither.

If the model claims `reversible_test` but produces no valid application suggestion, the candidate cannot remain try. It is downgraded to watch with a consistency warning; if it also lacks valid watch guidance, the whole response is incomplete.

## Prompt and freshness

Set Product Signal prompt/cache version to `v20`. v19 analyses are stale and must be reanalyzed. Do not reconstruct axes from old verdicts.

Prompt rules:

- low priority does not mean park;
- a useful, text-grounded, bounded reversible experiment is try;
- useful but not-yet-testable or external-unverified material is watch;
- park requires a supported explicit ProductContext conflict or usefulness none;
- noise is reserved for empty, spam-like, or non-storable material;
- external media/repo/link contents remain unverified unless captured evidence supports them.

## Four-tile UI grouping

Keep the existing four-tile layout and pager. Grouping is ordered and mutually exclusive:

1. `signalType === "noise"` -> noise tile.
2. `verdict === "insufficient_data"` -> insufficient tile.
3. `verdict === "watch"` -> watch tile.
4. `verdict === "park"` -> watch tile; noise has already been excluded.
5. `verdict === "try"` -> try tile.

The former second tile becomes `噪音` and contains only true noise. The fourth tile remains `保留觀察` and counts watch plus non-noise park. Park cards retain compact density, no application, and no brief eligibility. Watch cards retain full density and watch guidance.

The grouping function must be one ordered exhaustive switch/helper, not independent overlapping predicates.

## Storage, exports, and visibility

Persist axes and warnings and include them in JSONL packet output for audit. Do not render raw axis chips in the normal UI. Users see concrete guidance, reason, evidence, and missing information instead.

## Automated acceptance

- Table-driven coverage for all axis combinations plus noise precedence.
- OpenAI, Claude, and Google schemas match and contain no raw `verdict`.
- Parser/storage reject legacy model-verdict-only v20 responses.
- Thinking Orbs fixture produces watch, not park/noise.
- Useful + reversible + text-sufficient fixture produces try.
- External-unverified fixture produces watch with next evidence.
- Explicit non-goal fixture produces park.
- Low-content reactions produce noise or insufficient and no guidance.
- Four bucket memberships are mutually exclusive and counts sum to completed analyses.
- Empty noise tile renders correctly.
- Mixed full watch and compact park cards page correctly.

## Real Chrome acceptance

- Reanalyze Thinking Orbs and confirm it appears under 保留觀察 with concrete guidance.
- Page between a full watch and compact park without clipping, focus loss, or broken responsive layout.
- Confirm the empty noise tile and narrow popup remain usable.
- Do not release `0.3.58` until this passes.

