# PR Narrative Read Design

**Date:** 2026-07-14
**Status:** Approved design, pending written-spec review
**Scope:** PR mode only

## 1. Outcome

PR mode gains two views over the same manually collected Threads posts:

- **敘事判讀** answers which current campaign narratives the collected posts echo, challenge, or turn into action.
- **證據匹配** preserves the shipped six-criterion matching, evidence ledger, advanced metrics, summary, and CSV workflow.

The feature is current-only. It does not discover posts, monitor Threads, compare historical snapshots, or claim narrative change over time.

## 2. Product Truth and Non-goals

The analysis scope is exactly the `PrEvidenceRow` records already collected for the active campaign. A row joins back to its `SessionItem` by `itemId`; no other folder item may enter the snapshot.

The narrative reader analyzes the collected **main post text only**:

1. Prefer `SessionItem.latestCapture.result.canonical_post.text` when it is non-empty.
2. Fall back to `PrEvidenceRow.caption` and mark that row as snippet-quality input.
3. Exclude comments, replies, `commentsPreview`, discussion fragments, and assembled thread content.
4. Exclude rows with neither canonical text nor caption from model input while retaining them in the collected-row count.

Explicit non-goals:

- no automatic or continuous search for new posts;
- no reaction-pattern delta, trend, increase, decrease, or cross-capture alignment;
- no audience-comment clustering;
- no fixed five-category taxonomy;
- no reach, impression, EAV, or all-channel coverage claims;
- no deterministic keyword fallback that pretends to be a narrative insight.

## 3. Campaign Settings

The existing `CampaignEditor` remains the single owner of campaign setup. Both the top-level `活動設定` control and the collapsed summary row's `編輯設定` control dispatch the existing `setSetupCollapsed(false)` command and reveal the same editor.

The expanded editor contains all existing fields plus three new optional strings:

| Field | Contract name | Purpose |
| --- | --- | --- |
| 核心敘事 | `narrativeAnchor` | The intended proposition that collected posts may echo, complicate, or challenge. |
| 目標受眾 | `targetAudience` | The audience used to judge relevance and decision impact. |
| 希望行動 | `desiredAction` | The behavior used to prioritize the most actionable claim. |

Existing fields remain unchanged: activity name, PR brief/PDF text, and six editable criteria.

Storage uses an optional nested `narrativeSettings` object on persisted campaigns for backward compatibility:

```ts
interface PrNarrativeSettings {
  narrativeAnchor: string;
  targetAudience: string;
  desiredAction: string;
}

interface PrCampaign {
  narrativeSettings?: PrNarrativeSettings;
}
```

`PrCampaignDraft` always exposes normalized empty strings. `PrCampaignSaveDraft.narrativeSettings` remains optional so old callers preserve existing settings rather than clearing them. The new UI always sends the complete normalized object through the existing `pr/save-campaign` message.

Generating setup suggestions uses one provider request to return both the three settings and the six criteria. Every generated value remains editable before save.

## 4. Narrative Data Contract

The latest successful read is stored independently from the campaign so editing or saving setup cannot erase the result.

```ts
type PrNarrativeMode = "attitude" | "experience" | "behavior" | "actionable";
type PrNarrativeAlignment = "challenges" | "mixed" | "echoes";
type PrNarrativeTextQuality = "canonical" | "snippet";

interface PrNarrativeEvidenceRef {
  rowId: string;
  summary: string;
}

interface PrNarrativeClaim {
  id: string;
  title: string;
  statement: string;
  implication: string;
  mode: PrNarrativeMode;
  alignment: PrNarrativeAlignment;
  supportRefs: PrNarrativeEvidenceRef[];
  counterRefs: PrNarrativeEvidenceRef[];
}

interface PrNarrativeRead {
  schemaVersion: 1;
  campaignId: string;
  sourceRowIds: string[];
  collectedRowCount: number;
  snippetFallbackCount: number;
  sourceHash: string;
  promptVersion: string;
  provider: string;
  model: string;
  generatedAt: string;
  status: "complete" | "insufficient_evidence";
  priorityClaimId: string | null;
  claims: PrNarrativeClaim[];
}
```

The new key is `dlens:v1:pr-narrative-reads`, stored as the latest read by campaign ID. Missing storage is an empty map, so no migration is required.

Counts are never persisted on claims. The viewmodel calculates:

- support count from unique valid `supportRefs`;
- counterexample count from unique valid `counterRefs`;
- denominator from `sourceRowIds.length`;
- readable coverage as `sourceRowIds.length / collectedRowCount`.

Author, URL, post text, and observed interactions are resolved from the current `PrEvidenceRow` by `rowId`; LLM output cannot supply or overwrite source metadata.

## 5. Evidence Snapshot

Before any LLM request, the background handler creates an immutable snapshot:

1. Load the campaign and its `PrEvidenceRow` records.
2. Locate the campaign session and join only those rows to `SessionItem` records.
3. Resolve main-post text under the rules in section 2.
4. Sort deterministically and assign prompt-local references `P01...Pn`.
5. Build `sourceHash` from the campaign name, brief, criteria, three narrative settings, ordered row IDs, URLs, resolved text, and text quality.

The prompt-local references never become durable identity. Stored results use real row IDs.

## 6. LLM Pipeline

The pipeline is two semantic stages followed by a deterministic publication gate. It reuses the provider transport, retry, timeout, tracing, structured-output, evidence allow-list, and hash patterns already present in Product and Topic code, but does not reuse Topic `ReactionPattern` types or comment prompts.

### Stage A: Main-post readings

Rows are divided by a fixed row and character budget. Each provider response must return exactly one reading for every supplied prompt-local reference:

```ts
interface PrNarrativePostReading {
  ref: string;
  gist: string;
  evidenceSummary: string;
  alignmentScore: number;    // -1 challenge to +1 echo
  actionabilityScore: number; // -1 attitude to +1 action
  claimSeeds: string[];
  caveat: string;
}
```

Unknown, duplicated, or missing references invalidate the batch. Partial batches are not published to the UI.

### Stage B: Campaign synthesis

The synthesis request consumes only validated Stage A readings and returns two to four dynamic claims plus exactly one priority claim when defensible. It may return no claims when evidence is insufficient.

The prompt prohibits temporal language, monitoring claims, external evidence, model-authored counts or percentages, and forced counterexamples. `counterRefs` are empty when no genuine counterexample exists.

Priority selection considers:

1. decision impact for the campaign;
2. specificity of a possible action;
3. breadth of valid support;
4. clarity of limitations and counterevidence.

### Deterministic validator and materializer

Publication succeeds only when:

- every reference is on the snapshot allow-list;
- support and counter references are disjoint within a claim;
- every claim has at least one support reference;
- prose cannot cite an unknown `Pxx` reference;
- claim IDs are unique;
- a complete result has exactly one valid priority claim;
- an insufficient result has no fabricated claims or priority ID.

The materializer converts prompt-local references to row IDs and computes compass coordinates from the Stage A scores of each claim's support rows. The LLM does not output final bubble coordinates.

## 7. UI Contract

The PR workspace uses the current design language and values from `tokens.ts`.

### Shared shell

- Current campaign scope and readable coverage appear once.
- The campaign setup editor appears once and can always be reopened.
- A two-option lens control switches between `敘事判讀` and `證據匹配`.
- Opening campaign settings temporarily replaces the analysis body so the same criteria or campaign fields are not rendered in two slots.

### Narrative lens

- The primary insight is the first decision surface, not a distribution chart.
- Remaining claims form a compact current-state list.
- Each claim renders its support count and common denominator once.
- Clicking a claim opens one drawer containing the claim explanation, supporting posts, optional named counterexamples, original-post links, and data limitation.
- A compass is a secondary disclosure. It uses challenge-to-echo and attitude-to-action axes; it never replaces the primary insight.
- The manual CTA reads `判讀已收集的 N 篇` or `重新判讀 N 篇`. Nothing runs automatically when rows change or the popup opens.

### Evidence lens

The existing six-criterion matching, criteria health, evidence ledger, advanced metrics, summary, and CSV/export actions remain functional. They are moved under the Evidence lens rather than duplicated.

## 8. Messages, State, and Reconciliation

Messages:

- `pr/get-narrative-read { campaignId }`
- `pr/generate-narrative-read { campaignId }`
- `pr/generate-criteria` returns both `prCriteria` and optional generated narrative settings.

Responses add `prNarrativeRead` and `prNarrativeSettings`.

The resource owns the hydrated narrative result, notice, and error. UI state owns `activeLens` and `isGeneratingNarrative`. Views remain viewmodel-in/command-out and do not read storage, send messages, read time, or generate random IDs.

Generation uses a campaign-scoped reconcile lane. A response for an inactive or superseded campaign cannot update UI or overwrite a newer stored result.

## 9. Failure and Staleness

- **No configured provider/key:** Narrative lens explains that an AI provider is required; Evidence remains usable.
- **Stage A failure:** publish no partial result and keep the last successful read.
- **Stage B or validation failure:** keep the last successful read and show the current error.
- **Insufficient evidence:** persist and render an explicit `insufficient_evidence` state without keyword-generated claims.
- **Source hash mismatch:** show the stored read as stale and offer manual re-read; do not label it current.
- **Snippet fallback:** keep the row eligible but disclose the readable/snippet coverage.

## 10. Testing and Acceptance

The implementation follows red-green-refactor. Acceptance requires tests proving:

1. Old campaigns normalize without the new settings and preserve them through old save calls.
2. All three settings round-trip and remain editable.
3. Both campaign-setting entry controls reveal the complete editor.
4. Snapshot creation includes only campaign rows and main-post canonical text, with explicit snippet fallback.
5. Stage A rejects missing, duplicate, and unknown references.
6. Stage B and the validator reject invalid refs, overlap, fake counts, and multiple priority claims.
7. Counterexamples are optional and never added to support counts.
8. Narrative reads persist, hydrate, become stale on source-hash change, and survive popup reopen.
9. A superseded request cannot publish or overwrite a newer campaign result.
10. Lens switching preserves every shipped Evidence action.
11. The View/ViewModel boundary remains intact.
12. The full typecheck, boundary guards, storage guard, complete test suite, production build, manifest/version checks, and `git diff --check` pass.

Runtime QA uses the rebuilt extension in the real Chrome profile. Chromium is not used.
