# Compare Prompt And Trust-Layer Plan

Last updated: 2026-04-14

This note defines the next product-quality pass for Compare after the three-page IA split:

- make AI output less empty and more grounded
- borrow the right discipline from `DLens_26` analyst without importing the full analyst runtime
- upgrade the validation layer so the distribution graph and support metrics feel trustworthy instead of decorative

This is a **prompt + presentation** plan, not a backend-clustering rewrite.

---

## 1. Problem Statement

The current extension Compare surface is directionally correct, but the language quality is still too soft:

- the AI brief often sounds smooth but says little
- cluster summaries still drift toward generic reaction labels
- `為什麼重要` is readable but not yet analytically sharp
- the validation layer under the distribution graph still looks like six equal gray stat boxes, which weakens trust

The root problem is not only model quality.

The deeper issue is that the current prompt contracts in:

- [src/compare/brief.ts](/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/brief.ts)
- [src/compare/cluster-interpretation.ts](/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/cluster-interpretation.ts)

still ask the model to produce a verdict-like summary too early.

The model receives:

- cluster keywords
- cluster shares
- like shares
- a small evidence pool

and is then asked to generate:

- headline
- why_true
- a_direction / b_direction
- implication

That contract still leaves too much room for abstraction. The model can satisfy the schema while saying very little.

The product result is:

- language that feels correct in tone but weak in substance
- repeated phrases such as `互動結構分流`, `值得關注`, `反應型態差異`
- explanations that are not wrong, but not memorable or useful

The next pass must force the model to say:

1. what it actually observes
2. which evidence supports that observation
3. only then what it means

---

## 2. What To Learn From `DLens_26`

The useful reference is not the full analyst stack. It is the discipline in the `claims_only` path.

Relevant files in `DLens_26`:

- [analysis/analyst.py](/Users/tung/Desktop/DLens_26/analysis/analyst.py)
- especially `format_claims_only_metrics()`
- especially `build_claims_only_prompt()`

The critical pattern in `DLens_26` is:

1. precompute evidence inputs first
2. format a minimal hard-metrics block
3. present an evidence catalog with aliases
4. force every claim to cite evidence aliases
5. omit any claim that cannot be cited

This is the part worth borrowing.

### 2.1 What `DLens_26` Does Well

In [analysis/analyst.py](/Users/tung/Desktop/DLens_26/analysis/analyst.py), `build_claims_only_prompt()` does three things that matter:

- it separates `POST`, `CLUSTERS`, `MIN_METRICS`, and `EVIDENCE_CATALOG`
- it outputs a strict JSON schema
- it enforces `If you cannot cite, omit that claim`

This is why that system produces more substantial output. It is not simply "better writing." It is better constraint.

### 2.2 What We Should Borrow

Borrow these three ideas only:

#### A. Evidence catalog

Give the model a compact list of allowed evidence with aliases such as:

```text
[e1] 「我拜託無用🥲」
[e2] 「AI 可以處理，剩下的人工作量反而翻倍」
[e3] 「其實問題唔係感受，而係制度點解會咁」
```

This gives the model discrete anchors.

#### B. Claim schema

Make the model output `observations` first, not just a verdict.

Each observation should include:

- short claim text
- evidence aliases
- scope

#### C. Audit rule

Adopt the same rule in lighter form:

- if the model cannot tie a statement to evidence aliases, it should omit that statement

This is the most important transfer from `DLens_26`.

### 2.3 What We Should Not Borrow

Do **not** port the full analyst stack into the extension.

Do not borrow:

- the full `claims -> audits -> projector -> analysis_json` architecture
- heavy taxonomy / sector ontology
- multi-layer narrative stack (`l1/l2/l3`)
- backend-only truth objects the extension does not have

Why not:

- the extension is a reading product, not the canonical analyst runtime
- over-porting would make the extension pretend it owns backend truth
- this repo must stay within its boundary: consume, reshape, and present backend output

The extension should borrow **discipline**, not **backend scope**.

---

## 3. Recommended Prompt Refactor

### 3.1 Product Rule

The prompt must stop asking for "a nice summary."

It should instead ask for:

1. grounded observations
2. side-specific readings
3. a short implication

That makes the writing sharper without requiring a heavier model.

### 3.2 New Compare Brief Contract

Replace the current compare prompt emphasis with a `claims_only-lite` contract.

Recommended output shape:

```json
{
  "headline": "A 偏共鳴放大，B 偏分歧探索",
  "supporting_observations": [
    {
      "text": "A 端高互動留言反覆把焦點拉回無力感，而不是提出解法",
      "scope": "left",
      "evidence_ids": ["e1", "e2"]
    },
    {
      "text": "B 端代表性留言更常把討論改寫成制度或責任判斷",
      "scope": "right",
      "evidence_ids": ["e3"]
    },
    {
      "text": "兩邊差異不在主題本身，而在回應入口：A 是情緒投射，B 是框架重寫",
      "scope": "cross",
      "evidence_ids": ["e1", "e3"]
    }
  ],
  "a_reading": "A 的留言區把個人焦慮收束成可共鳴的情緒入口。",
  "b_reading": "B 的留言區則把事件重新框成較理性的責任判斷。",
  "why_it_matters": "若最有影響力的聲音來自 B，但最大聲量仍來自 A，這代表讀者可能在共鳴與接受新框架之間分裂。",
  "keywords": ["情緒放大", "框架重寫", "聲量與影響脫鉤"],
  "audience_alignment_left": "Align",
  "audience_alignment_right": "Mixed",
  "confidence": "medium"
}
```

### 3.3 Required Behavioral Rules

The prompt should enforce:

- `headline` must be short and verdict-like
- `supporting_observations` must come before interpretation
- every observation must include `evidence_ids`
- `a_reading`, `b_reading`, and `why_it_matters` must reuse the observations
- if a statement cannot cite evidence, it should be omitted instead of generalized

### 3.4 Prompt Input Structure

The compare prompt should move to this input grammar:

```text
[POST A]
author=...
post_text=...
source_comment_count=...

[POST B]
author=...
post_text=...
source_comment_count=...

[CLUSTER SNAPSHOT]
- side=A cluster=...
- side=B cluster=...

[MIN HARD METRICS]
- left_top_cluster_size_share=...
- left_top_cluster_like_share=...
- right_top_cluster_size_share=...
- right_top_cluster_like_share=...
- left_visible_clusters=...
- right_visible_clusters=...

[EVIDENCE CATALOG]
[e1] ...
[e2] ...
[e3] ...
```

This is much closer to `DLens_26` discipline while staying lightweight enough for extension runtime.

### 3.5 Specific Change To `brief.ts`

Current file:

- [src/compare/brief.ts](/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/brief.ts)

Current weakness:

- the contract jumps directly into `why_true`
- it allows high-level language without structured evidence use

Recommended change:

- add `supporting_observations[]`
- add explicit `evidence_ids`
- make parse failure stricter if observations are missing or uncited

This will likely increase rejection rate, which is acceptable. A stricter fallback is better than smooth nonsense.

---

## 4. Recommended Cluster Prompt Refactor

Current file:

- [src/compare/cluster-interpretation.ts](/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/cluster-interpretation.ts)

Current weakness:

- the cluster one-liner still encourages descriptive-but-generic output
- it still asks for a one-line reaction summary before forcing a more precise observation

### 4.1 New Cluster Output Shape

Instead of only:

- `label`
- `one_liner`
- `evidence_ids`

the model should produce:

```json
{
  "capture_id": "...",
  "cluster_id": 1,
  "label": "情緒共鳴群",
  "observation": "這群留言多以無力感或自我投射回應原文，而不是提出具體方案。",
  "reading": "它更像情緒放大入口，不像問題拆解。",
  "evidence_ids": ["c1", "c2"]
}
```

Where:

- `observation` is the grounded claim
- `reading` is the lightweight interpretation

This produces stronger content for:

- cluster dock
- receipts cards
- `為什麼重要`

### 4.2 New One-Liner Rule

If we keep a single-line field for UI compactness, it should be generated from:

- one observation
- one evidence-backed reading

not directly from keywords and ratios.

Recommended format:

- `這群留言多把事件收束成無力感共鳴，代表性句型都在放大「努力無用」的感受。`
- `這群留言常把焦點改寫成制度或責任問題，因此理性拆解比單純情緒回應更常出現。`

Avoid:

- `這群留言以共鳴放大型方式回應原文`
- `這群留言互動集中於少數高讚`

Those lines are structurally correct but weak as reading objects.

---

## 5. Reusable Analyst Terms For `為什麼重要`

The `為什麼重要` card should become sharper, but not by becoming academic theater.

The right move is to define a small repeated lexicon: terms that sound analytical, remain understandable, and can be reused across prompts and UI.

### 5.1 Good User-Facing Terms

These are suitable for user-facing Compare output:

- `共鳴入口`
- `情緒放大`
- `框架轉移`
- `責任重寫`
- `群體投射`
- `敘事收束`
- `表面主流`
- `高影響少數聲音`
- `聲量與影響脫鉤`
- `分歧預留`
- `理性拆解`
- `焦點轉向`

These work because they are:

- short
- repeatable
- descriptive without pretending to be formal diagnosis

### 5.2 Internal-Only Terms

These may help prompt quality, but should not be shown to users directly unless tested carefully:

- `interpretive frame`
- `responsibility recoding`
- `affective convergence`
- `narrative consolidation`
- `discursive deflection`

These are useful as prompt scaffolding, but too academic for the current extension UI.

### 5.3 Recommended Rule For `為什麼重要`

`為什麼重要` should usually use one of these formulas:

#### Formula A — influence split

`當最大聲量來自 A，但最有影響力的聲音開始往 B 移動，這表示讀者正在共鳴入口與新框架之間分裂。`

#### Formula B — reframing

`這不只是立場不同，而是討論入口被改寫了：A 要你先感受，B 要你先判斷。`

#### Formula C — latent shift

`表面主流仍在 A，但 B 的高互動少數聲音像是在預演新的敘事收束。`

The key is:

- one analytical idea
- one memorable phrase
- one consequence

not a paragraph of polite summary.

---

## 6. Validation Layer Upgrade

The validation layer has two jobs:

1. prove the reading is grounded
2. provide an inspectable support object when the user wants to verify

Right now the distribution graph is directionally right, but the support metrics under it are too flat.

### 6.1 Problem With The Current Six Gray Boxes

Current issue:

- all six tiles have equal visual weight
- they do not show category or relationship
- they read like placeholders, not analytical support

This weakens the graph above them, because the graph looks intentional but the metrics below it do not.

### 6.2 Recommended Metric Grammar

Replace the six equal gray tiles with two semantic groups.

#### Group 1 — Coverage

- `總留言`
- `A 留言`
- `B 留言`

This answers:

- how much data was analyzed
- whether the two sides have balanced sample sizes

#### Group 2 — Structure

- `A 群組數`
- `B 群組數`
- `主導率`

This answers:

- how fragmented the discourse is
- whether the visible reading is built on a narrow or broad structure

### 6.3 Visual Recommendation

Do not use six identical neutral cards.

Instead:

- keep cards small and compact
- add section labels above each group:
  - `資料覆蓋`
  - `結構特徵`
- tint group headers lightly:
  - neutral/ink for coverage
  - blue/orange/green accent touches for structure
- make `主導率` the most visually distinct metric in the second group

This keeps the trust layer readable without turning it into a dashboard.

---

## 7. Dots Motion Direction

The direction remains good, but it should stay in Phase 2.

Current relevant file:

- [src/ui/CompareView.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CompareView.tsx)
- current component: `FlowingClusterViz`

### 7.1 Desired Behavior

The motion should feel like:

- slow breathing
- ambient drift
- local attraction or repulsion when cursor approaches

It should **not** feel like:

- loading animation
- physics demo
- particle toy

### 7.2 Phase 1 vs Phase 2

#### Phase 1

Keep:

- current static graph
- current group labels
- current support copy

Allow:

- minor code cleanup so the component can accept motion parameters later

#### Phase 2

Add:

- per-dot idle drift around origin
- low-amplitude, different-phase oscillation
- cursor field that only affects local dots
- smooth return to origin
- `prefers-reduced-motion` guard

### 7.3 Motion Constraints

Hard constraints:

- idle motion must be very slow
- dot displacement must stay small
- bigger dots should feel heavier
- no global swirl
- no constant re-layout of the whole cluster

The graph must remain an evidence object, not become a decorative centerpiece.

---

## 8. Implementation Order

Recommended sequence:

### Step 1 — Prompt contract refactor

Files:

- [src/compare/brief.ts](/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/brief.ts)
- [src/compare/cluster-interpretation.ts](/Users/tung/Desktop/dlens-chrome-extension-v0/src/compare/cluster-interpretation.ts)

Goals:

- move from verdict-first to observation-first
- require evidence aliases
- tighten parse validation

### Step 2 — Result language update

Files:

- [src/ui/CompareView.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CompareView.tsx)

Goals:

- use stronger repeated analyst terms in:
  - `為什麼重要`
  - cluster readings
  - receipts support copy

### Step 3 — Validation metrics redesign

Files:

- [src/ui/CompareView.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CompareView.tsx)

Goals:

- replace six flat gray boxes with grouped trust metrics
- improve semantic grouping and visual hierarchy

### Step 4 — Dots motion

Files:

- [src/ui/CompareView.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CompareView.tsx)

Goals:

- add idle drift
- add local cursor response
- preserve readability

---

## 9. Hard Boundary Rules

These rules should stay explicit:

- the extension must not pretend to own canonical analyst truth
- the extension may borrow `claims_only` discipline from `DLens_26`, but not its full runtime architecture
- if prompt strictness increases fallback frequency, that is acceptable
- evidence-backed emptiness is better than polished nonsense
- validation layer should support trust, not compete with the reading card

---

## 10. Success Criteria

This plan is successful if:

- compare output stops sounding interchangeable across posts
- `為什麼重要` becomes a memorable analytical sentence rather than a soft explanation
- receipts and cluster readings feel citation-bound
- the validation layer feels like a trust surface instead of six generic gray placeholders
- future dots motion adds character without reducing clarity

The target is not "more AI writing."

The target is:

- less fluff
- more evidence
- more repeated analytical language
- more trust in what the product is actually seeing
