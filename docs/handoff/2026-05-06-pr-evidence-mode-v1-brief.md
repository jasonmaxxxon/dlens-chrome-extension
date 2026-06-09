# PR Evidence Mode V1 Handoff

> **This is a product-engineering brief, not a visual redesign.**
> PR Evidence mode adds a new agency workflow to DLens: turn already-found Threads posts into a defendable campaign evidence CSV and a topline PR audit summary draft.
>
> **Core boundary:** V1 does not promise social listening, full coverage, true reach, EAV calculation, duplicate analysis, or spreadsheet editing. It is an Excel autofill workflow for agency / PR operators.

---

## Implementation Status (2026-05-07)

Implemented in `dlens-product-latest`.

Resolved implementation choices:

- route: `pr-evidence`
- `FolderMode`: `"archive" | "topic" | "product" | "pr-evidence"`
- `MainPage`: includes `"pr-evidence"`
- PR workspace pages: `PR Evidence · Collect · Settings`
- popup width: `720px`
- active campaign rule: one active campaign per PR Evidence session in V1
- campaign storage: `dlens:v1:pr-campaigns`
- row storage: `dlens:v1:pr-evidence-rows`
- storage module: `src/state/pr-evidence-storage.ts`
- PR contract module: `src/compare/pr-evidence.ts`
- PR UI module: `src/ui/PrEvidenceViews.tsx`
- PR brief upload module: `src/ui/pr-brief-upload.ts`
- PR summary export module: `src/ui/pr-summary-export.ts`
- criteria generation message: `pr/generate-criteria`
- match message: `pr/match-criteria`
- summary message: `pr/generate-summary`
- brief upload: PDF/txt/md, with text-based PDF extraction and core PR message detection
- Collect routing: PR mode creates `PrEvidenceRow`, not Topic `Signal`, and does not run AI
- criteria generation: accepts common AI JSON shapes and falls back to campaign-specific deterministic labels
- matching: accepts common AI match shapes and ORs AI output with deterministic visible-keyword matching
- views: reads DOM metrics when available, infers from visible text such as `132 views`, and otherwise leaves views unavailable
- CSV output: UTF-8 BOM, stable PR evidence columns, `✓ / blank` criteria cells, read-only preview with placeholder dashes for empty cells
- summary output: client-ready Markdown with `Executive Read`, `Message Pull-Through`, `Interpretation`, `Evidence Highlights`, and `Data Limits`, plus MD/DOCX export
- summary validation: rejects unsupported reach, EAV, all-channel claims, and invented numeric claims outside the deterministic facts

Verification:

```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

Latest test result in this worktree: `361 pass, 0 fail`.

---

## Product Decision

DLens should not sell this workflow as "understanding all online discourse." That depends too heavily on platform search coverage, crawler stability, and client expectations.

V1 should sell a narrower job:

> Help agency / PR operators turn already-found Threads posts into a structured campaign evidence table, criteria matches, CSV export, and client-facing topline audit copy.

The buyer is **agency / PR operator**.

The mode name is **PR Evidence mode**.

This is a new workspace type, not a Product mode export option.

---

## What This Mode Does

Input:

- Campaign name
- Campaign brief / PR guideline / press release text, pasted or uploaded as PDF/txt/md
- Six PR criteria labels, AI-suggested from the brief and user-editable
- Already-found / currently-opened Threads posts

Collect:

- Reuse the existing DLens Collect shell.
- Save collected posts into the current campaign as evidence rows.
- Collect raw visible fields only. No AI call during collect.

Analyze:

- Batch criteria matching only when the user explicitly clicks `Match criteria`.
- AI fills six boolean criteria columns per row: `✓ / blank`; deterministic visible-keyword matching backs up obvious campaign terms.
- No long per-row reasoning, confidence UI, evidence quotes, duplicate policy, reach estimate, or EAV estimate.

Output:

- CSV as the primary output.
- Client-ready Markdown PR audit summary as the secondary output, exportable as `.md` and `.docx`.
- Optional read-only CSV/table preview before export.

---

## Non-Goals

Do not implement these in V1:

- Social listening discovery
- Platform-wide keyword search
- Coverage guarantee
- Duplicate grouping / dedupe policy
- True reach calculation
- EAV calculation
- Follower scraping as a required field
- XLSX export
- In-app spreadsheet editing
- Detail inspector / signal intelligence card
- Product mode agent brief behavior
- Topic mode cluster / Pair Lens behavior
- Manual scoring rubric UI
- Review queue or `?` criteria state

If a later version needs any of these, it should be added from real agency usage data, not preloaded into V1.

---

## Existing Architecture Fit

Current mode model:

```ts
export type FolderMode = "archive" | "topic" | "product";
```

V1 should extend this to:

```ts
export type FolderMode = "archive" | "topic" | "product" | "pr-evidence";
```

Current `ALLOWED_PAGES` should gain a PR-specific route set. Suggested minimum:

```ts
pr-evidence: ["pr-campaign", "collect", "pr-evidence-table", "pr-summary"]
```

If route churn must be minimized, use:

```ts
pr-evidence: ["pr-campaign", "collect", "pr-evidence"]
```

Where `pr-evidence` internally switches between ledger, preview, export, and summary sections.

Keep:

- `WorkspaceShell`
- `ModeRail`
- `WorkspaceSurface`
- Existing Collect preview/save interaction
- Existing settings page as the workspace type switch location

Do not fold PR Evidence mode into Product mode. Their jobs are different:

| Mode | Main Question | Main Object | Main Output |
|------|---------------|-------------|-------------|
| Product | Is this useful for my product workflow? | Signal Card | Agent Brief / Product decision |
| Topic | What social phenomenon is happening? | Topic Note / Cluster Card | Case note |
| PR Evidence | Does this post support campaign reporting criteria? | Evidence row | CSV + PR audit summary |

---

## Data Model

Add two V1 core objects.

### `PrCampaign`

```ts
export interface PrCampaign {
  id: string;
  sessionId: string;
  name: string;
  briefText: string;
  criteria: [
    PrCriterion,
    PrCriterion,
    PrCriterion,
    PrCriterion,
    PrCriterion,
    PrCriterion
  ];
  createdAt: string;
  updatedAt: string;
  lastMatchedAt?: string;
}

export interface PrCriterion {
  id: "c1" | "c2" | "c3" | "c4" | "c5" | "c6";
  label: string;
}
```

V1 criteria count is fixed at six. Labels can be edited. Users cannot add or remove criteria in V1.

### `PrEvidenceRow`

```ts
export interface PrEvidenceRow {
  id: string;
  campaignId: string;
  itemId: string;
  postUrl: string;
  authorHandle: string;
  caption: string;
  metrics: {
    likes?: number;
    comments?: number;
    reposts?: number;
    views?: number;
  };
  expectedEngagement?: string;
  criteriaMatches: {
    c1: boolean;
    c2: boolean;
    c3: boolean;
    c4: boolean;
    c5: boolean;
    c6: boolean;
  };
  collectedAt: string;
  matchedAt?: string;
}
```

`expectedEngagement` is an intentionally blank/manual column in V1. DLens does not calculate it.

Do not add confidence, duplicate group, followers, screenshot, EAV, or reach fields to the V1 object.

Suggested storage keys:

```text
dlens:v1:pr-campaigns
dlens:v1:pr-evidence-rows
```

Rows should be scoped by `campaignId`; campaigns should be scoped by `sessionId`.

---

## UI Surfaces

### 1. Campaign Setup

Purpose: establish campaign and six criteria.

Minimum fields:

- campaign name
- brief / PR guideline textarea
- `Generate criteria` action
- six editable criteria label inputs

Behavior:

- AI can suggest six criteria from the brief.
- User can edit labels.
- User cannot add/remove criteria in V1.
- Missing brief is allowed if the user manually fills criteria.

### 2. Collect

Purpose: collect already-found Threads posts.

Use the existing Collect shell. Save behavior changes by workspace mode:

- Archive saves to raw library.
- Topic saves to signal inbox.
- Product saves to saved/product signal flow.
- PR Evidence saves to current campaign evidence rows.

Collect must not run AI.

Collected rows should fill:

- `postUrl`
- `authorHandle`
- `caption`
- visible metrics where available
- `collectedAt`
- blank `expectedEngagement`
- all criteria booleans as `false` until batch matching

### 3. Evidence Ledger

Purpose: show that posts have been collected without rendering a full spreadsheet.

The main UI should be a compact collected-post ledger:

```text
status / author / caption snippet / key metrics / matched count / collected time
```

Example:

```text
✓  @kol_a    "BoostUP event..."      1.2k likes · 38 replies     4/6 matched     22:41
✓  @media_b  "Mannings wellness..."  320 likes · 12 replies      2/6 matched     22:43
```

Do not show all six criteria columns in the main ledger. Use `matched_count / 6`.

Primary actions:

- `Match criteria`
- `Preview CSV`
- `Export CSV`
- `Generate summary`

Cost visibility:

```text
100 rows
6 criteria
Estimated AI batches: 3
```

This can be approximate. The point is to show that matching is batched, not one LLM call per row.

### 4. CSV Preview

Purpose: let the operator confirm export shape without becoming a spreadsheet app.

Rules:

- Read-only.
- Header + first 20 rows only.
- No editing.
- No filter/sort.
- Full data is in CSV export.

### 5. Topline Summary

Purpose: generate a PR report copy draft similar to:

```text
Mannings BoostUP Wellness Carnival - Topline PR Performance Audit Summary

1. Overall Collected Evidence Performance
...

2. Brand Message Pull-Through Analysis
...

3. Notable Evidence / Posts for Client Review
...
```

The summary should sound like a PR audit report, but it must not invent reach, EAV, or all-channel claims.

---

## CSV Schema

V1 CSV columns:

```text
post_url
author_handle
post_caption
likes
comments
reposts
views
expected_engagement
criterion_1
criterion_2
criterion_3
criterion_4
criterion_5
criterion_6
manual_notes
collected_at
```

Column behavior:

- `criterion_1..6` use the campaign criteria labels as exported column headers when possible.
- Values are `✓` or blank.
- `expected_engagement` is blank unless manually set in later versions.
- `manual_notes` is blank in V1 unless a later minimal text field is explicitly added.
- CSV should include UTF-8 BOM for Excel compatibility.

Do not export confidence fields in V1.

---

## AI Contract 1: Criteria Suggestions

Input:

- Campaign name
- Campaign brief / PR guideline / press release

Output:

```json
{
  "criteria": [
    { "id": "c1", "label": "..." },
    { "id": "c2", "label": "..." },
    { "id": "c3", "label": "..." },
    { "id": "c4", "label": "..." },
    { "id": "c5", "label": "..." },
    { "id": "c6", "label": "..." }
  ]
}
```

Rules:

- Exactly six criteria.
- Labels should be short enough for CSV headers.
- No scores.
- No explanations.
- No extra fields.
- If the model returns fewer/more than six, normalize to exactly six with deterministic placeholders.

Suggested prompt intent:

```text
You are helping a PR operator turn a campaign brief into six reportable message criteria.
Return exactly six short criteria labels.
Do not produce strategy advice.
Do not invent performance numbers.
```

---

## AI Contract 2: Batch Criteria Matching

Input:

- Campaign brief
- Six criteria labels
- Batch of rows: `row_id + caption`

Output:

```json
{
  "rows": [
    {
      "row_id": "row_1",
      "matches": {
        "c1": true,
        "c2": false,
        "c3": true,
        "c4": false,
        "c5": false,
        "c6": true
      }
    }
  ]
}
```

Rules:

- Only return known row ids.
- Every returned row must include `c1..c6`.
- Values must be booleans.
- No explanations.
- No confidence.
- No quotes.
- No criteria edits.
- Missing rows fallback to all `false`.
- Unknown row ids are ignored.

Batching:

```text
25-50 rows per LLM call
```

Choose the chunk size conservatively based on provider payload limits. V1 target is 100-300 rows per campaign.

---

## AI Contract 3: Topline Summary

Summary generation is facts-first.

Step 1: deterministic aggregation creates facts:

```json
{
  "campaign_name": "...",
  "total_rows": 120,
  "observed_metrics": {
    "likes": 12345,
    "comments": 456,
    "reposts": 78,
    "views": 90000,
    "views_rows_observed": 64
  },
  "criteria": [
    { "id": "c1", "label": "...", "matched_rows": 96, "pull_through_rate": 0.8 },
    { "id": "c2", "label": "...", "matched_rows": 70, "pull_through_rate": 0.5833 }
  ],
  "top_rows": [
    {
      "author_handle": "@kol_a",
      "caption": "...",
      "likes": 1200,
      "comments": 38,
      "matched_count": 4
    }
  ]
}
```

Step 2: AI writes PR audit copy from facts only.

Required sections:

```text
1. Overall Collected Evidence Performance
2. Brand Message Pull-Through Analysis
3. Notable Evidence / Posts for Client Review
```

Rules:

- Do not mention all-channel coverage.
- Do not invent reach.
- Do not invent EAV.
- Do not invent media value.
- Do not use numbers not present in facts.
- If views are missing for many rows, phrase as "views observed on N rows" rather than total reach.
- If validation fails, show deterministic fallback summary.

---

## Implementation Tasks

Run typecheck, targeted tests, full tests, and build after each task or tightly related task batch.

### T1 — Extend mode and routing

Files:

- `src/state/types.ts`
- `src/state/processing-state.ts`
- `src/state/store-helpers.ts`
- `src/state/messages.ts` if needed
- `src/ui/InPageCollectorPopup.tsx`
- `src/ui/SettingsView.tsx`

Work:

- Add `pr-evidence` to `FolderMode`.
- Add allowed PR pages.
- Add rail labels/icons for PR pages.
- Let Settings switch current workspace to PR Evidence mode.
- Preserve existing mode data; switching mode must not move old data.

### T2 — Add PR storage module

New file:

- `src/state/pr-evidence-storage.ts`

Work:

- Define `PrCampaign`, `PrCriterion`, `PrEvidenceRow`.
- Add normalizers.
- Add load/save/upsert/delete helpers.
- Add tests for malformed records and session/campaign scoping.

### T3 — Add PR background messages

Files:

- `src/state/messages.ts`
- `entrypoints/background.ts`

Messages:

```text
pr/list-campaigns
pr/save-campaign
pr/list-evidence-rows
pr/save-evidence-row
pr/generate-criteria
pr/match-criteria
pr/generate-summary
```

Work:

- Wire storage calls.
- Criteria matching and summary generation should use existing provider infrastructure where possible.
- Add in-flight guard for `pr/match-criteria` per campaign.

### T4 — Save routing from Collect

Files:

- `entrypoints/background.ts`
- `src/ui/useInPageCollectorAppState.ts`
- `src/ui/CollectView.tsx`

Work:

- In PR Evidence mode, saving a post creates a `PrEvidenceRow` for the active campaign.
- V1 defines active campaign as one campaign per PR Evidence session; campaign switching is intentionally not implemented.
- Do not create Topic `Signal`.
- Do not create Product analysis row.
- Do not run AI.
- If no campaign exists, Collect should show a clear "create campaign first" state.

### T5 — Campaign setup view

New file:

- `src/ui/PrCampaignView.tsx` or `src/ui/PrEvidenceViews.tsx`

Work:

- Campaign name input.
- Brief textarea.
- Six criteria inputs.
- Generate criteria action.
- Save campaign action.
- Honest empty/error/loading states.

### T6 — Evidence ledger and CSV preview

Same PR UI file as T5 or split if it stays small.

Work:

- Compact ledger rows.
- `matched_count / 6`.
- Batch estimate display.
- Read-only CSV preview: header + first 20 rows.
- Export CSV with UTF-8 BOM.

### T7 — Batch criteria matching

Files:

- New compare/pr module, for example `src/compare/pr-evidence.ts`
- Background message handler
- PR UI view

Work:

- Build prompt request.
- Parse strict JSON.
- Normalize to `c1..c6` booleans.
- Chunk rows.
- Persist matches and `matchedAt`.

### T8 — Topline summary

Files:

- `src/compare/pr-evidence-summary.ts`
- PR UI view
- Background message handler

Work:

- Deterministically aggregate facts.
- Build facts-first summary prompt.
- Validate AI summary numbers and claims against facts; reject unsupported reach, EAV, all-channel, or invented numeric claims before display.
- Fallback deterministic summary if invalid.

---

## Tests

Add focused tests before broad integration.

Suggested test files:

```text
tests/pr-evidence-storage.test.ts
tests/pr-evidence-contract.test.ts
tests/pr-evidence-view.test.tsx
tests/pr-evidence-routing.test.ts
```

Coverage:

- `FolderMode` accepts `pr-evidence`.
- `ALLOWED_PAGES.pr-evidence` exposes only PR pages + Collect.
- Archive/Topic/Product behavior stays unchanged.
- PR campaign normalizer enforces exactly six criteria.
- Evidence row normalizer defaults all matches to false.
- Collect save in PR mode creates a PR evidence row, not a Topic signal.
- Criteria suggestion parser returns exactly six labels.
- Criteria matching parser accepts only row ids and booleans.
- Missing row ids fallback false.
- CSV export uses stable columns and `✓ / blank`.
- Preview table renders header + first 20 rows only.
- Summary facts aggregation computes criteria pull-through rate from matched rows.
- Summary validator rejects invented reach/EAV/all-channel claims.

---

## Verification Gates

Run from:

```bash
cd dlens-product-latest
```

Required:

```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

Chrome QA for the finished V1 should verify:

1. Create PR Evidence workspace in Settings.
2. Create campaign with brief and six criteria.
3. Save at least three Threads posts through Collect.
4. Confirm rows appear in Evidence Ledger.
5. Run `Match criteria`.
6. Confirm rows show `matched_count / 6`.
7. Open CSV preview; only header + first 20 rows render.
8. Export CSV; verify criteria columns use `✓ / blank`.
9. Generate topline summary; verify no invented reach/EAV/all-channel claim.

---

## Product Acceptance

V1 is acceptable when an agency operator can:

- Create a campaign.
- Define six report criteria.
- Collect already-found Threads posts.
- Batch match criteria.
- Export a CSV that can be opened in Excel / Google Sheets.
- Copy a topline PR audit summary draft.

V1 is not acceptable if it:

- Looks like Product mode with different labels.
- Requires per-row manual editing inside DLens.
- Claims true reach or EAV without user-provided data.
- Makes an AI call on every collect.
- Requires the extension to discover all relevant posts.
