# Product Refit D Focus Field Mockup Design

**Date:** 2026-07-19
**Status:** Approved design, pending written-spec review
**Scope:** Product mode reference-only interactive mockup

## 1. Outcome

Create one new self-contained HTML mockup that combines the strongest parts of the approved Product refit directions:

- Variant A's compact coverage ledger;
- Variant C's signal-level relevance field;
- Variant B's one-at-a-time Product Action stage and pager;
- the current Product `watch` reading semantics: `保留觀察`, `觀察原因`, retained reference knowledge, next step, and evidence.

The design is named **Variant D · Focus Field（參考度場 × 觀察閱讀窗）**. Its job is to make Product mode feel like one connected reading flow rather than a stack of equal-weight dashboard cards.

The reference mockup will be saved as:

`docs/mockups/2026-07-19-product-refit-D-focus-field.html`

## 2. Scope and Non-goals

This slice produces and verifies a reference mockup only. It does not edit `ProductSignalViews.tsx`, change storage, add a new model contract, bump the extension version, build MV3, or claim real Chrome acceptance.

Explicit non-goals:

- no KMeans, clustering, or Product use of Topic `ReactionPattern`;
- no invented engagement values, evidence refs, counts, summaries, or analysis prose;
- no copying Atlas cyan or `color.signal` into Product surfaces;
- no second Product detail workspace or modal drawer;
- no scoreboard tiles, card wall, or repeated per-row provenance chips;
- no production implementation decision beyond seams already supported by current Product data.

## 3. Source Truth

The mockup uses the seven supplied signal fixtures. Six are analyzed; one is still crawling.

| ID | Signal | Type | Relevance | Known engagement | Verdict |
| --- | --- | --- | --- | --- | --- |
| r1 | 介面微互動的節制應用原則 | learning | 2/5 | 224 likes, 5 replies, 23 reposts, 158 shares; total 410 | 保留觀察 |
| r2 | vibe coding 我开发了一个看得见 Wi-Fi 信号强… | unknown | unavailable | crawling | 抓取中 |
| r3 | AI 驅動的快速原型開發流程 | learning | 2/5 | 47 likes, 5 replies, 2 reposts, 24 shares; total 78 | 保留觀察 |
| r4 | AI 程式碼除錯的信任門檻 | noise | 1/5 | 68 likes, 21 replies, 3 shares; total 92 | 前提不符 |
| r5 | 透過嚴格 JSON 協定降低模型依賴 | technical | 3/5 | 17 likes, 25 replies, 2 reposts, 5 shares; total 49 | 保留觀察 |
| r6 | 無直接產品參考價值 | noise | 1/5 | unavailable | 前提不符 |
| r7 | 數據呈現的環境變數過濾 | technical | 2/5 | unavailable | 保留觀察 |

The analyzed classification distribution is therefore `technical 2 / learning 2 / noise 2`, denominator 6. The mockup must not reuse Variant C's inconsistent `1 / 2 / 3` distribution or Variant B's extra `模型發佈時程傳聞` row.

Detailed reading prose and evidence may be used only where it already exists in the supplied mockups. When a fixture lacks a detailed field, the UI shows a concise unavailable state such as `既有截圖未載入此欄` instead of authoring replacement analysis.

## 4. Information Architecture

The HTML contains two Product frames in this order:

1. **已存訊號 — Focus Field**
2. **候選行動 — Observation Stage**

Each frame has one visual protagonist.

### 4.1 Saved Signals protagonist

The Saved Signals frame contains:

1. a compact header and coverage ledger;
2. one composite Focus Field surface;
3. a compact seven-row signal index.

The Focus Field surface contains the plot and one selected observation reading dock. They are parts of one reading surface, not two equal glass cards.

Classification counts appear once in a quiet legend. There is no separate distribution bar panel.

### 4.2 Product Action protagonist

The Action frame contains:

1. a quiet section line: `候選行動 · 保留觀察`, `4 則 · 7 已收錄`;
2. exactly one visible observation stage;
3. a pager;
4. one collapsed exclusion strip containing only r4 and r6.

The four `watch` signals are r1, r3, r5, and r7. The Action frame contains four real page records. A page may disclose missing detailed prose, but it must never duplicate another page while changing only the pager position.

## 5. Saved Signals Interaction Contract

### 5.1 Coverage ledger

The ledger reads:

- `6/7 已分析`;
- `6/6 AI 已分類`;
- `1 補爬中`.

Provider and context readiness are reduced to one mono status line. `重新分析` remains the only primary action. `查看候選行動` remains a secondary route cue.

### 5.2 Signal field

The field uses Product data dimensions only:

- x-axis: relevance `1–5`;
- y-axis: known engagement heat on a log scale;
- bubble size: known total engagement;
- Product steel blue: `保留觀察`;
- neutral gray: `前提不符`.

Analyzed signals with missing engagement values remain visible as dashed `?` bubbles in a clearly labelled `互動未讀` shelf. They are not assigned a precise y-axis value. The crawling r2 signal does not enter the analyzed field.

Every bubble represents one signal, not a generated cluster.

### 5.3 Hover

Hovering a bubble:

- increases its halo and contrast;
- shows a compact tooltip with title, type, relevance, known metrics, and verdict;
- mirrors a soft highlight on the corresponding index row;
- does not replace the currently selected reading dock.

Hovering an index row mirrors the halo on its bubble. It does not open a second preview card.

### 5.4 Selection and reading dock

Clicking a bubble or analyzed index row selects the same signal. Selection:

- persists after hover ends;
- updates `aria-pressed` or equivalent selected state;
- updates the reading dock with a 180–220ms crossfade and 4–6px vertical settle;
- updates the active index-row border and background;
- does not navigate to Action automatically.

The reading dock preserves the current signal-reading sequence:

1. verdict, readiness, type, and relevance;
2. serif headline or retained reference title;
3. source excerpt or explicit unavailable copy;
4. `觀察原因` or `排除原因`;
5. `新知保留` when known;
6. evidence/provenance line without repeated decorative chips.

Selecting r2 shows a stable crawling state and does not try to create a bubble selection.

### 5.5 Keyboard and touch

- Bubbles are focusable controls with visible focus treatment.
- Arrow keys move between bubbles; `Enter` and `Space` select.
- Index rows are real buttons or equivalent keyboard controls.
- On touch, first tap selects; no required information exists only on hover.
- Selection is conveyed by border/fill/text as well as color.

## 6. Product Action Stage Contract

The stage reuses Product semantics but adopts Topic's one-at-a-time presentation grammar.

Each page can contain:

- index, verdict, readiness, type, and relevance;
- serif headline and summary;
- three beats: `觀察原因 → 新知保留 → 下一步`;
- an optional representative quote;
- Product evidence refs and a truthful evidence count;
- explicit unavailable states for fields absent from the supplied fixture.

Story beats are presentation groupings over existing Product fields. They are not a new persisted data contract and do not become evidence.

### 6.1 Pager behavior

- Previous/next buttons and all four dots are clickable.
- Position reads `1 / 4` through `4 / 4`.
- `ArrowLeft` and `ArrowRight` move one page.
- `Home` and `End` move to the first and last page.
- A page change uses a 180–240ms directional crossfade/slide.
- Focus remains predictable; keyboard paging announces the new title through an `aria-live` position/title label.
- Disabled controls remain visibly disabled at the boundaries.
- `prefers-reduced-motion: reduce` removes translation and smooth scrolling.

### 6.2 Evidence interaction

Evidence chips use Product steel blue. Clicking a ref briefly highlights the corresponding visible quote or evidence line when that content exists. A missing or unresolved ref is not rendered as a clickable chip.

### 6.3 Exclusion strip

The collapsed strip contains r4 and r6 only. Opening it shows compact title + exclusion reason rows. It does not use the same geometry as the main stage and does not create another pager.

## 7. Visual Language

The mockup maps visual values to `src/ui/tokens.ts` and treats the HTML values as reference-only.

- Product accent: steel blue, not Atlas cyan.
- Serif: selected reading and stage headlines only.
- Sans: rows and explanatory body copy.
- Mono: counts, axes, refs, pager position, and terse status.
- One composite hero surface per frame; secondary rows use opaque or quiet surfaces.
- Accent budget is concentrated on current selection, pager action, and evidence refs.
- Motion communicates state transition; it is not continuous decoration.

## 8. Empty, Loading, and Missing-data States

The mockup includes truthful state demonstrations where they affect the interaction model:

- r2 crawling row;
- r6 and r7 missing engagement scalars;
- at least one Action page with a missing detailed field;
- disabled previous/next controls at pager boundaries.

Production-oriented behavior recorded for later implementation:

- no analyzed signals: keep the current list-first empty state and analysis CTA;
- field failure: keep the index usable and label the field unavailable;
- missing evidence: retain the analysis but show no fake evidence chip;
- stale or superseded state: outside this reference mockup's implementation scope.

## 9. Mockup Implementation Boundary

The artifact is a single self-contained HTML file with no external network dependencies. It may reuse the supplied A/B/C markup and interaction ideas, but must correct their fixture and accessibility gaps.

No production code is modified. A future MV3 implementation would map to existing Product seams rather than importing the demo JavaScript:

- Saved Signals projection and filters in `ProductSignalViews.tsx`;
- existing `ProductSignalAnalysis` fields for reason, reference, verdict, relevance, readiness, and evidence;
- React pager state patterned after `AtlasNarrativeStage`, without sharing Topic data types.

## 10. Verification and Acceptance

The mockup is complete only when all of the following are verified:

1. It loads as a standalone local HTML file with no console errors.
2. The seven-row fixture, six analyzed denominator, `2/2/2` distribution, four watch items, two excluded items, and one crawling item are internally consistent.
3. All six analyzed signals can be selected from the index; all field bubbles select the matching signal.
4. Bubble and row hover mirror each other without changing the committed selection.
5. The reading dock changes once per selection and never duplicates the headline in two simultaneous reading panes.
6. All four Action pager pages are distinct records.
7. Previous, next, dots, `ArrowLeft`, `ArrowRight`, `Home`, and `End` work.
8. Evidence-ref clicks act only on existing evidence content.
9. Bubble controls and pager controls expose usable accessible names and focus states.
10. Reduced-motion mode removes non-essential translation and smooth scrolling.
11. Desktop and narrow screenshots show no clipping, horizontal overflow, or unreadable tooltip placement.
12. Screenshots cover default Saved view, bubble hover, alternate signal selection, Action page 1, Action page 4, exclusion strip open, and narrow layout.

Runtime claims stop at standalone-browser mockup verification. This artifact is not proof that the MV3 extension has been rebuilt, reloaded, or exercised on a real Threads page.
