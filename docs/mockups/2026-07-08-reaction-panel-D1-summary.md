# D1 Reaction Panel Summary

Date: 2026-07-08

## Artifacts

- `2026-07-08-reaction-panel-dense-counts.html`
- `2026-07-08-reaction-panel-evidence-drawer.html`
- `2026-07-08-reaction-panel-coverage-first.html`
- `2026-07-08-reaction-panel-D1-brief.md`
- `2026-07-08-reaction-panel-D1-review-checklist.md`

## Chrome QA

Checked in Chrome profile `Default / jason@brandonproject.co` through local HTTP:

- `http://127.0.0.1:8787/docs/mockups/2026-07-08-reaction-panel-dense-counts.html`
- `http://127.0.0.1:8787/docs/mockups/2026-07-08-reaction-panel-evidence-drawer.html`
- `http://127.0.0.1:8787/docs/mockups/2026-07-08-reaction-panel-coverage-first.html`

Desktop checks passed for all three:

- page loaded in the requested Chrome profile
- no horizontal overflow at desktop width
- no `.card .card` nesting
- includes `sample` / mock data label
- includes `Schema back-pressure`
- includes required sample terms: `中港矛盾`, `身份邊界防守`, `資源競爭轉譯`, `降溫`, `534`

`file://` Chrome QA was blocked by browser-use URL policy, so the profile-based check used local HTTP instead. Mobile viewport was not verified through the Chrome profile because the exposed browser backend did not provide a viewport override capability in this session.

## Recommendation

Winner direction: **Variant B — Evidence Drawer**, with one addition from Variant C.

Why:

- It best reuses the shipped `NarrativeLane` + `NarrativeLaneDetailPanel` contract.
- It keeps the lane list scan-first and avoids turning the topic page into a table.
- It puts representative comments, counterexamples, and refs in the drill-down surface where users can understand what the pattern means, not just see that a count exists.
- It implies a smaller Phase 2 schema than Dense Counts.

Adopt from Coverage First:

- Add a compact coverage strip above the lanes: `posts / captured / read / usable`.
- Keep low-n warnings available in detail, not as a second full panel.

Do not use Dense Counts as the first UI:

- Useful for pressure-testing schema fields.
- Too dense for the primary topic page surface.
- Encourages adding optional numeric fields too early.

## Useful Information Contract

The reaction panel is valuable only if it explains the crowd dynamic, not merely surfaces stored fields.

The winner must let a user answer five questions quickly:

1. What reaction pattern is this?
2. How often did it appear in the actually-read comment pool?
3. Which comments make the pattern legible?
4. Which counterexamples limit the claim?
5. What does this imply about the topic's momentum or conflict dynamic?

This is why Variant B is the winner direction: it keeps the pattern list compact, then uses the existing detail-panel affordance to show the interpretive material that turns a count into useful information. Variant C's coverage strip should be merged in so every claim carries its denominator.

## Schema Back-Pressure

Minimal Phase 2 fields implied by the winner:

| UI need | Field |
|---|---|
| Topic-level denominator strip | `reactionCoverage.postCount` |
| Captured comments denominator | `reactionCoverage.capturedCommentCount` |
| Read comments denominator | `reactionCoverage.readCommentCount` |
| Usable audience denominator | `reactionCoverage.usableAudienceCommentCount` |
| Pattern label | `reactionPatterns[].label` |
| Useful interpretation | `reactionPatterns[].dynamicImplication` |
| Pattern count, deduped by comment | `reactionPatterns[].nComments` |
| Distinct author count | `reactionPatterns[].nAuthors` |
| Pattern denominator | `reactionPatterns[].coverageDenominator` |
| Support evidence refs | `reactionPatterns[].supportRefs[]` |
| Counter evidence refs | `reactionPatterns[].counterRefs[]` |
| Representative support quote refs | `reactionPatterns[].representativeRefs[]` |
| Counterexample quote refs | `reactionPatterns[].counterRepresentativeRefs[]` |

Defer to Phase 3 / refinement:

| UI need | Field |
|---|---|
| Engagement ranking | `reactionPatterns[].likeSum` |
| Stability badge | `reactionPatterns[].confidenceTier` |
| Normalized bar percentage | derived from `nComments / coverageDenominator` |

## Product Contract

The reaction panel should **replace** P4 audience free-prose display in Topic Detail. It should not render as a second audience section on the same page.

Implementation shape after 2026-07-08 UI-first slice:

1. Pipeline produces `CommentShardReading` and post/topic merge outputs with the fields above.
2. `src/compare/topic-audit-prompts.ts` preserves structured `reactionCoverage` / `reactionPatterns` from the LLM envelope and filters unknown evidence refs.
3. `src/viewmodel/topic-detail.ts` exposes the stored audit artifacts; `src/viewmodel/reaction-pattern-detail.ts` resolves detail content from `EvidencePacket`.
4. `src/ui/TopicDetailView.tsx` renders lanes and detail panel only; no storage or prompt logic in View.
5. `src/ui/AuditReportView.tsx` replaces §5 audience prose when structured reaction patterns exist.
