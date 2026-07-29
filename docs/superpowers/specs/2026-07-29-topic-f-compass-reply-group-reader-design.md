# Topic F — Compass-integrated Reply Group Deep Reader

**Date:** 2026-07-29  
**Status:** Approved direction; mockup design gate  
**Deliverable:** One standalone interactive HTML reference mockup  
**Production impact:** None

## 1. Goal

Create a clearer continuation from the existing 民情羅盤 into a reply-group deep-reading surface.

The user starts from the current compass, selects one `ReactionPattern`, and opens a focused reader that answers:

1. What dynamic is happening inside this reply group?
2. What reasons support the reading?
3. Which replies resist or complicate it?
4. What tone, vocabulary, and discourse form are visible?
5. Which conversational or real-world context is present, missing, or unverified?

The mockup must feel like one continuous DLens workspace, not a dashboard beside a separate report.

## 2. Scope

Create:

- `docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html`

Reference without modifying:

- `docs/mockups/2026-07-18-atlas-l0-refit-C-refined.html`
- `docs/mockups/2026-07-28-topic-E-evidence-reader-hierarchy.html`
- `src/ui/AtlasReactionMap.tsx`
- `src/ui/TopicDetailView.tsx`
- `src/viewmodel/reaction-pattern-detail.ts`
- `src/ui/tokens-intent.md`

Do not modify:

- D or E mockups
- production React, view-model, prompt, storage, or manifest files
- package files
- existing dirty worktree files

## 3. Approved Information Architecture

Use a single-column guided reading spine inside the existing drawer pattern.

Do not use:

- analysis tabs
- a second dashboard rail
- equal-weight card grids
- four-run ranking or simulated longitudinal movement
- schema terms such as `voice-03`, `counterRefs`, or `NarrativeClaim.rationale`

The page consists of two connected states:

### State A — Compass

Show the existing compass as the parent surface:

- horizontal axis: 質疑 ↔ 支持
- vertical axis: 行動導向 ↔ 情緒共鳴
- bubble size: `ReactionPattern.nComments`
- bubble position: `valence` and `mode`
- distribution rows using the same pattern labels and counts

Selecting a bubble or distribution row:

- visibly selects the same pattern in both places
- opens the deep-reader drawer
- preserves the compass behind the drawer to maintain spatial continuity

The three non-reference patterns open a bounded preview using only their existing label, count, and Atlas description. They show an availability notice instead of fabricated detailed evidence. Only `行業悲觀與結構性焦慮` receives the fully expanded evidence fixture in this mockup.

### State B — Reply Group Deep Reader

The drawer reading order is fixed:

1. identity and bounded sample ledger
2. core reading
3. group dynamic
4. reasoning and evidence
5. conversational context
6. language, tone, and discourse
7. real-world context status
8. reversal condition and limits

## 4. Reference Data

The mockup uses the current Atlas reference topic rather than inventing a new policy topic.

Compass patterns:

| Pattern | Count | Share |
|---|---:|---:|
| 行業悲觀與結構性焦慮 | 24 | 31% |
| 實用主義求職策略 | 21 | 27% |
| 道德審判與階級歸因 | 19 | 24% |
| 職場戲謔與表演性解構 | 14 | 18% |

The fully expanded fixture is `行業悲觀與結構性焦慮`, grounded in the existing work-topic audit material.

This is a design fixture assembled from two existing references:

- the four labels, counts, shares, and visual positions in the current Atlas mockup
- validated quotes and findings in the work-topic audit files

It is not presented as a dump of one current persisted `ReactionPattern` object. Production adoption must resolve every displayed ref from the selected pattern's actual `supportRefs`, `counterRefs`, and evidence packets before rendering it.

Evidence themes:

- 「飽和／供過於求／氾濫」repeats across multiple sectors.
- Employment anxiety is repeatedly converted into arithmetic: salary, cost, layoffs, and percentages.
- AI displacement is extended into a feedback-loop argument rather than remaining a one-line joke.
- The captured sample contains rich individual and structural vocabulary but little collective or intermediary vocabulary.

Reference evidence includes:

- `S5.OP`, `S12.OP`, `S12.R1`, `S13.OP` for saturation-coded language.
- `S10.OP`, `S10.R1`, `S10.R2` for conflicting individual survival strategies.
- `S11.OP`, `S11.R1`, `S11.R2` for AI displacement, satire, and second-order reasoning.
- `S5.R1` as a bounded counterexample to an oversupply assumption.

No external news or policy claim may be invented for the mockup.

## 5. Drawer Content Contract

### 5.1 Header

Show:

- `返回民情羅盤`
- selected pattern label
- snapshot date
- `24 次留言歸屬`
- number of sources and available comments when supported

Avoid percentages in the drawer headline. Distribution share remains on the compass.

### 5.2 Core Reading

One short editorial statement:

> 這組回覆把個別失業、低薪與轉行焦慮，重讀成跨行業的結構性收縮；「飽和」和「算帳」成為共同語言，但並非每個行業都接受同一種悲觀判斷。

Mark it as:

- `由本批留言推導`
- not platform-wide
- not a claim about all Hong Kong workers

### 5.3 Group Dynamic

Present one compact interpretive structure, not a causal timeline:

- **共同 frame:** 個別困境被提升為行業問題
- **支撐方式:** 跨 sector 重複、數字算帳、AI／裁員因果鏈
- **內部張力:** 拒絕規則 vs 適應規則；全面飽和 vs insider 反例

Every line must expose at least one evidence ref.

### 5.4 Reasoning and Evidence

Each reason row contains:

- model-organised reason label
- one-sentence explanation
- exact quote
- visible evidence ref
- support or counter status in words, not colour alone

The mockup must distinguish:

- original words
- model interpretation
- alternative explanation

### 5.5 Conversational Context

Show a small same-thread reading stack when the fixture supports it:

- OP excerpt
- reply excerpt
- a reply that extends the OP into second-order reasoning

Sibling replies must remain siblings. Do not draw reply-to-reply arrows or imply a complete reply tree unless parent linkage is available.

When linkage is missing, show:

> 父層回覆未能還原；以下留言按獨立文字閱讀，模型不補寫其對話對象。

### 5.6 Language, Tone, and Discourse

Keep one section with three subordinate rows:

- **詞彙:** 飽和、供過於求、算帳、整水喉
- **語氣／姿態:** 冷嘲、風險計算、結構性悲觀
- **discourse reading:** 個體與制度之間的中間層語言在本次 captured sample 中薄弱

Tone and discourse must be labelled as model interpretations from captured text.

The absence statement must remain sample-bounded. It may not claim that Hong Kong society lacks intermediary organisations.

### 5.7 Real-world Context

Show an honest empty state:

> 尚未附加已核實外部來源。這次判讀只使用已捕捉的 Threads 文字。

Also show the future source contract without fabricating content:

- official primary material
- direct reporting
- analysis or advocacy
- user-supplied note
- source conflict status

The mockup may offer `加入 context` as a secondary action, but external material does not enter the reading until explicitly approved.

### 5.8 Reversal Condition and Limits

Show one falsifiable next question:

> 如果更多獨立 thread 出現具體可行的中層回應，或 insider 反例在多個 sector 重現，便會削弱「個體直接撞向制度、中間層薄弱」的判讀。

Use a native `details` element for:

- captured sample boundary
- assignment count versus unique comment count
- missing refs
- unresolved parent context
- model-derived tone and discourse

## 6. Visual Design

Follow the current DLens shared glass workspace:

- compass remains the protagonist on the parent surface
- drawer shell may use workspace glass
- all long-reading cards and evidence rows remain opaque
- one raised surface only: core reading
- other sections use dividers, indentation, and whitespace instead of separate cards
- one Topic signal accent; counterevidence also uses a text label and icon, not red alone
- serif only for the core editorial statement and selected quotations
- sans for tool chrome and explanations
- mono/tabular figures for counts and refs

The mockup does not introduce a new palette, font stack, token family, or decorative icon style.

## 7. Responsive and Interaction Behaviour

Desktop reference:

- compass remains visible behind or beside a 390–430px drawer
- drawer opens from the right with a subtle scrim
- selecting another compass bubble updates and reopens the drawer

Narrow reference:

- drawer becomes full-width
- compass remains in the back stack, not compressed beside the drawer
- closing returns to the same compass selection and scroll position

Keyboard:

- bubble and distribution rows support Enter and Space
- Escape closes the drawer
- opening moves focus to the drawer title
- closing restores focus to the trigger
- all interactive targets are at least 44px
- native `details` remains keyboard-operable

Motion:

- only drawer translation and scrim opacity animate
- 150–300ms
- disabled under `prefers-reduced-motion`

## 8. Loading, Empty, and Error States

Loading:

- render compass immediately
- drawer shows stable section skeletons
- do not show action buttons before evidence is ready

Empty reply group:

> 這組回覆暫未抽出可重複理由；目前只看到短回應或附和。

Partial failure:

- preserve available evidence
- show local failure only for the unavailable section
- never replace the entire reader with a generic error

No parent context:

- render the explicit missing-context notice
- do not create a synthetic reply chain

No external context:

- render the honest empty state
- do not use model background knowledge as if sourced

## 9. Mockup Acceptance Criteria

The standalone HTML must:

1. Show the current four-pattern compass and distribution.
2. Open the deep reader from both a bubble and its distribution row.
3. Default to the full `行業悲觀與結構性焦慮` reference fixture for review.
4. Open the other three patterns in a clearly labelled bounded-preview state without invented refs.
5. Keep source quotes, model readings, counterevidence, and missing context visually distinct.
6. Include at least one same-thread context stack and one missing-parent notice.
7. Include the external-context empty state and source-type contract.
8. Contain no invented external factual claims.
9. Contain no group-level longitudinal ranking or fake time slider.
10. Contain no horizontal overflow at 320px, 390px, 768px, and 1280px.
11. Provide visible focus states, 44px targets, Escape close, focus restoration, and reduced-motion behaviour.
12. Preserve D and E unchanged.
13. Remain reference-only; no production source changes.

## 10. Out of Scope

- automatic news search
- source ingestion or RAG
- stable cross-audit group identity
- production prompt changes
- production parent-chain plumbing
- Casebook persistence
- group dataset naming
- MV3 release or real-Chrome QA

These may be evaluated after the integrated mockup proves that the reading hierarchy is useful.
