# D1 Reaction Panel Review Checklist

Date: 2026-07-08

Use this to compare the three reaction panel variants.

## Contract Checks

- Reuses the existing warm-fusion lane/bar/row language.
- Replaces the P4 audience prose surface; does not add a second audience section.
- Shows sample data as sample data, not production truth.
- Keeps numeric claims evidence-bound: every count has a visible denominator or evidence refs.
- Keeps support and counter evidence both visible.
- Makes the click/drill-down path obvious enough to map onto `NarrativeLaneDetailPanel`.
- Avoids card-inside-card nesting.

## Schema Back-Pressure

Record only fields that the UI truly needs:

| UI need | Candidate field | Required in Phase 2? |
|---|---|---|
| pattern label | `label` | yes |
| topic-dynamic interpretation | `dynamicImplication` | yes |
| count distinct comments | `nComments` | yes |
| count distinct authors | `nAuthors` | likely |
| support evidence refs | `supportRefs` | yes |
| counter evidence refs | `counterRefs` | yes |
| representative quotes | `representativeQuotes` | yes |
| captured/read/usable denominator | `coverage` | yes |
| summed likes | `likeSum` | optional/refine |
| confidence or stability label | `confidence` | Phase 3/refine |

## Winner Criteria

Pick the variant that best satisfies all three:

1. The user can understand the crowd pattern without reading a prose paragraph.
2. The user can inspect why the number exists.
3. The schema it implies is minimal enough for Phase 2.

## Useful Information Gate

The selected UI must help the user answer a research question, not just display backend fields.

It passes only if a reader can answer:

- What reaction pattern is present?
- How frequent is it in the actually-read comment pool?
- Which representative comments make the pattern intelligible?
- Which counterexamples or boundary cases prevent overclaiming?
- What does this pattern imply for the topic dynamics?

Fail conditions:

- It only shows `n` without explaining what the pattern means.
- It only shows quotes without frequency / denominator.
- It hides counterexamples.
- It duplicates the old P4 audience prose instead of replacing it with evidence-bound structure.
