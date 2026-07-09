# D1 Reaction Panel Mockup Brief

Date: 2026-07-08
Scope: mockup only. Do not edit `src/`.

## Existing Contract

- Baseline visual language: `docs/mockups/2026-07-06-reset-B-warm-fusion-live.html`.
- Reuse the shipped `lane + bar + compact row + detail panel` grammar.
- Live surface exists in `src/ui/TopicDetailView.tsx`: `NarrativeLane` + `NarrativeLaneDetailPanel`.
- Evidence drill-down exists in `src/viewmodel/narrative-lane-detail.ts`: clicking a lane can show real `EvidencePacket` content.
- New reaction panel must replace P4 audience free-prose display, not render a second audience block on the same page.

## Design Goal

Design a focused Topic detail reaction/audience panel that turns LLM deep-reading output into useful evidence-bound UI:

- pattern label in the topic language
- true count based on `commentId` dedup
- support / counter evidence
- representative comments
- enough coverage context to avoid fake precision

## Mock Data

Use this as sample-only content. Do not present it as live data.

Topic: 中港矛盾
Coverage: 6 posts, 684 captured comments, 612 comments read, 534 usable audience comments

Patterns:

1. 身份邊界防守
   - n_comments: 84
   - n_authors: 67
   - like_sum: 1284
   - coverage: 84 / 534
   - support refs: S1.R14, S2.R8, S4.R33
   - counter refs: S3.R21, S5.R9
   - representative: 「講到最後都係身份安全感問題，唔係一兩句融合可以解決。」
   - counter: 「我覺得日常相處其實冇咁嚴重，網上聲量放大咗。」

2. 資源競爭轉譯
   - n_comments: 57
   - n_authors: 45
   - like_sum: 731
   - coverage: 57 / 534
   - support refs: S1.R31, S3.R5, S6.R12
   - counter refs: S2.R19
   - representative: 「房屋、學位、醫療一擺出嚟，大家就唔再講文化，只講分配。」
   - counter: 「把所有生活壓力都推去外來人，會遮住本地制度問題。」

3. 降溫／日常共處
   - n_comments: 23
   - n_authors: 21
   - like_sum: 204
   - coverage: 23 / 534
   - support refs: S2.R44, S5.R18
   - counter refs: S1.R9, S4.R40
   - representative: 「返工同街坊相處其實冇咁戲劇化，最怕係網上先互相標籤。」
   - counter: 「講日常可以共處，唔代表結構矛盾不存在。」

## Variant Assignments

### A: Dense Counts

File: `docs/mockups/2026-07-08-reaction-panel-dense-counts.html`
Focus: maximum useful numeric density without looking like a spreadsheet.
Must test: `n_comments`, `n_authors`, `like_sum`, coverage denominator, support/counter refs.

### B: Evidence Drawer

File: `docs/mockups/2026-07-08-reaction-panel-evidence-drawer.html`
Focus: lane remains compact, detail panel carries representative comments and counterexamples.
Must test: click/open affordance, support vs counter quote hierarchy, source refs.

### C: Coverage First

File: `docs/mockups/2026-07-08-reaction-panel-coverage-first.html`
Focus: avoid fake precision by foregrounding captured/read/usable denominators.
Must test: coverage strip, uncertainty/caveat text, low-n pattern styling.

## Output Requirements

Each HTML must be self-contained and fit as a docs mockup.

Each file must include a visible or near-bottom section named `Schema back-pressure` with a table:

| UI need | Schema field |
|---|---|

The table should list only fields actually needed by that variant.

Hard constraints:

- Do not create a second visual system.
- Do not use cards inside cards.
- Do not present sample counts as real production data.
- Do not modify `src/`, package files, or architecture docs.
- Keep all edits inside `docs/mockups/`.
