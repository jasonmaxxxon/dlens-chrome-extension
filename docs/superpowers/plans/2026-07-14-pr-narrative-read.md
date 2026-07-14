# PR Narrative Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a current-only PR narrative lens that reads only manually collected Threads main posts, keeps evidence refs auditable, and preserves the shipped PR evidence workflow.

**Architecture:** Extend the existing campaign with three narrative settings and store the latest narrative read separately. A pure domain module builds canonical-main-post snapshots, parses both LLM stages, validates refs, and materializes counts; background orchestration owns calls and persistence. The existing PR ViewModel remains the only UI boundary.

**Tech Stack:** TypeScript, React, WXT extension messaging, `chrome.storage.local`, Node test runner through `tsx`, and existing DLens tokens/components/provider transport.

## Global Constraints

- Analyze only `PrEvidenceRow` records already collected for the active campaign.
- Use `latestCapture.result.canonical_post.text`; fall back to the stored caption and never include comments, replies, or assembled content.
- Add exactly `narrativeAnchor`, `targetAudience`, and `desiredAction`.
- Do not add automatic discovery, monitoring, delta, trend, reach, EAV, or deterministic narrative fallback.
- Counterexamples are optional and never contribute to support counts.
- Model output never supplies counts or source metadata.
- Views remain ViewModel-in/command-out and use existing `tokens.ts` values.
- Preserve the dirty working tree's unrelated changes.
- Runtime QA uses the rebuilt extension in the real Chrome profile, never Chromium.
- Release version is `0.3.43` across package, lockfile, WXT manifest, UI version, docs, and tests.
- Do not make implementation commits that would absorb unrelated existing hunks; use file-scoped diffs and test checkpoints.

---

### Task 1: Backward-compatible campaign settings

**Files:**
- Modify: `src/state/pr-evidence-storage.ts`
- Modify: `tests/pr-evidence-storage.test.ts`

**Interfaces:**
- Produces: `PrNarrativeSettings`, `EMPTY_PR_NARRATIVE_SETTINGS`, and `normalizePrNarrativeSettings`.
- Preserves: old save callers that omit the optional nested settings.

- [ ] **Step 1: Write failing storage tests**

```ts
test("normalizes legacy campaigns with empty narrative settings", () => {
  const normalized = normalizePrCampaign({
    id: "campaign-1",
    sessionId: "session-1",
    name: "Launch",
    briefText: "Brief",
    criteria: normalizePrCriteria([]),
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  });
  assert.deepEqual(normalized?.narrativeSettings, {
    narrativeAnchor: "",
    targetAudience: "",
    desiredAction: ""
  });
});

test("legacy save messages preserve existing narrative settings", async () => {
  const campaign = normalizePrCampaign({
    id: "campaign-1",
    sessionId: "session-1",
    name: "Launch",
    briefText: "Brief",
    criteria: normalizePrCriteria([]),
    narrativeSettings: {
      narrativeAnchor: "Wellness belongs in daily life",
      targetAudience: "Young working adults",
      desiredAction: "Register for the event"
    },
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  });
  assert.ok(campaign);
  const storageWithNarrativeCampaign = createStorageArea({
    [PR_CAMPAIGNS_STORAGE_KEY]: [{
      ...campaign,
      narrativeSettings: {
        narrativeAnchor: "Wellness belongs in daily life",
        targetAudience: "Young working adults",
        desiredAction: "Register for the event"
      }
    }]
  });
  const saved = await savePrCampaignDraft(storageWithNarrativeCampaign, {
    sessionId: campaign.sessionId,
    id: campaign.id,
    name: "Renamed",
    briefText: campaign.briefText,
    criteria: campaign.criteria
  }, { now: "2026-07-14T01:00:00.000Z" });
  assert.equal(saved[0]?.narrativeSettings.desiredAction, "Register for the event");
});
```

- [ ] **Step 2: Verify RED**

```bash
npx tsx --test tests/pr-evidence-storage.test.ts
```

Expected: fail because the nested settings contract does not exist.

- [ ] **Step 3: Implement the additive schema**

```ts
export interface PrNarrativeSettings {
  narrativeAnchor: string;
  targetAudience: string;
  desiredAction: string;
}

export const EMPTY_PR_NARRATIVE_SETTINGS: PrNarrativeSettings = {
  narrativeAnchor: "",
  targetAudience: "",
  desiredAction: ""
};

export function normalizePrNarrativeSettings(value: unknown): PrNarrativeSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    narrativeAnchor: readString(raw.narrativeAnchor).trim(),
    targetAudience: readString(raw.targetAudience).trim(),
    desiredAction: readString(raw.desiredAction).trim()
  };
}
```

Persisted campaigns and drafts expose normalized settings. `PrCampaignSaveDraft.narrativeSettings` remains optional. `savePrCampaignDraft` uses incoming settings only when the property is present, otherwise preserving the existing object and then falling back to empty settings for a new campaign.

- [ ] **Step 4: Verify GREEN and inspect scope**

```bash
npx tsx --test tests/pr-evidence-storage.test.ts
npm run typecheck
git diff --check -- src/state/pr-evidence-storage.ts tests/pr-evidence-storage.test.ts
git diff -- src/state/pr-evidence-storage.ts tests/pr-evidence-storage.test.ts
```

Expected: commands exit `0`; diff contains only additive campaign settings behavior and its tests.

---

### Task 2: Pure narrative evidence contract

**Files:**
- Create: `src/compare/pr-narrative.ts`
- Create: `tests/pr-narrative-contract.test.ts`

**Interfaces:**
- Consumes: `PrCampaign`, `PrEvidenceRow`, and `SessionRecord`.
- Produces: `buildPrNarrativeSnapshot`, `chunkPrNarrativeSources`, both prompt builders/parsers, and `materializePrNarrativeRead`.

- [ ] **Step 1: Write failing snapshot tests**

```ts
test("snapshot reads only campaign rows and canonical main-post text", async () => {
  const snapshot = await buildPrNarrativeSnapshot({ campaign, rows, session });
  assert.deepEqual(snapshot.sources.map((source) => source.rowId), ["row-1", "row-2"]);
  assert.equal(snapshot.sources[0]?.text, "Canonical main post");
  assert.equal(snapshot.sources[1]?.text, rows[1]?.caption);
  assert.equal(snapshot.sources.some((source) => source.text.includes("excluded reply")), false);
  assert.equal(snapshot.collectedRowCount, 2);
  assert.equal(snapshot.snippetFallbackCount, 1);
});
```

Add separate tests for deterministic ordering/hash changes, fixed row/character chunking, unrelated session items, and exclusion of rows without readable text.

- [ ] **Step 2: Write failing parser/publication tests**

```ts
test("post-read parser rejects duplicate, missing, and unknown refs", () => {
  assert.throws(() => parsePrNarrativePostReadResponse(
    JSON.stringify({ readings: [{ ref: "P01", gist: "x" }, { ref: "P01", gist: "y" }] }),
    ["P01", "P02"]
  ), /duplicate|missing/i);
});

test("materializer keeps counterexamples outside support counts", () => {
  const read = materializePrNarrativeRead({
    snapshot,
    postReadings: [
      makeReading("P01", -0.4, 0.8),
      makeReading("P02", 0.2, 0.6),
      makeReading("P03", 0.7, -0.2)
    ],
    synthesis: {
      status: "complete",
      priorityClaimId: "claim-1",
      claims: [{
        id: "claim-1",
        title: "Setup friction dominates",
        statement: "Collected posts describe setup friction.",
        implication: "Lead with a simpler onboarding proof.",
        supportRefs: ["P01", "P02"],
        counterRefs: ["P03"]
      }]
    },
    generatedAt: "2026-07-14T02:00:00.000Z",
    provider: "openai",
    model: "gpt-4.1-mini"
  });
  assert.equal(read.claims[0]?.supportRefs.length, 2);
  assert.equal(read.claims[0]?.counterRefs.length, 1);
  assert.equal(read.sourceRowIds.length, 3);
});
```

Add distinct assertions rejecting unknown refs, support/counter overlap, multiple priority claims, unknown inline `Pxx` citations, model-authored count fields, and temporal claims. Prove empty counter refs are valid.

- [ ] **Step 3: Verify RED**

```bash
npx tsx --test tests/pr-narrative-contract.test.ts
```

Expected: module-not-found failure for `src/compare/pr-narrative.ts`.

- [ ] **Step 4: Implement snapshot types and hash**

```ts
export interface PrNarrativeSource {
  ref: string;
  rowId: string;
  itemId: string;
  sourceUrl: string;
  authorHandle: string;
  text: string;
  textQuality: "canonical" | "snippet";
}

export interface PrNarrativeSnapshot {
  campaignId: string;
  sourceHash: string;
  collectedRowCount: number;
  snippetFallbackCount: number;
  sources: PrNarrativeSource[];
}
```

Read canonical text directly from `item.latestCapture?.result?.canonical_post?.text`. Do not call an assembled-content helper. Hash stable JSON with `crypto.subtle.digest("SHA-256", ...)`, including campaign definition and ordered resolved source content.

- [ ] **Step 5: Implement strict parsing and materialization**

```ts
export interface PrNarrativeClaim {
  id: string;
  title: string;
  statement: string;
  implication: string;
  mode: "attitude" | "experience" | "behavior" | "actionable";
  alignment: "challenges" | "mixed" | "echoes";
  supportRefs: PrNarrativeEvidenceRef[];
  counterRefs: PrNarrativeEvidenceRef[];
}
```

Require every Stage A ref exactly once, constrain both scores to `[-1, 1]`, validate synthesis refs against the allow-list, convert prompt refs to row IDs, derive final mode/alignment from average support scores, and reject temporal language before publication.

- [ ] **Step 6: Verify GREEN and boundaries**

```bash
npx tsx --test tests/pr-narrative-contract.test.ts
npm run boundary:guard
npm run typecheck
git diff --check -- src/compare/pr-narrative.ts tests/pr-narrative-contract.test.ts
```

Expected: commands exit `0`; the domain module contains no storage, Chrome, React, current-time, or random dependencies.

---

### Task 3: Narrative read persistence

**Files:**
- Create: `src/state/pr-narrative-storage.ts`
- Create: `tests/pr-narrative-storage.test.ts`

**Interfaces:**
- Consumes: `PrNarrativeRead` and `StorageAreaLike`.
- Produces: `PR_NARRATIVE_READS_STORAGE_KEY`, `normalizePrNarrativeRead`, `loadPrNarrativeRead`, and `savePrNarrativeRead`.

- [ ] **Step 1: Write failing storage tests**

```ts
test("missing narrative storage hydrates as null", async () => {
  assert.equal(await loadPrNarrativeRead(createMemoryStorage({}), "campaign-1"), null);
});

test("save keeps one latest read per campaign", async () => {
  const storage = createMemoryStorage({});
  await savePrNarrativeRead(storage, readOne);
  await savePrNarrativeRead(storage, readTwo);
  assert.deepEqual(await loadPrNarrativeRead(storage, "campaign-1"), readTwo);
});
```

Add a malformed-payload test for missing campaign IDs, invalid priority IDs, duplicate source rows, and support/counter overlap.

- [ ] **Step 2: Verify RED**

```bash
npx tsx --test tests/pr-narrative-storage.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement normalize-on-read map storage**

```ts
export const PR_NARRATIVE_READS_STORAGE_KEY = "dlens:v1:pr-narrative-reads";

export async function loadPrNarrativeRead(
  storageArea: StorageAreaLike,
  campaignId: string
): Promise<PrNarrativeRead | null> {
  const raw = await storageArea.get(PR_NARRATIVE_READS_STORAGE_KEY);
  const map = normalizePrNarrativeReadMap(raw[PR_NARRATIVE_READS_STORAGE_KEY]);
  return map[campaignId] ?? null;
}
```

`savePrNarrativeRead` reads the current map, replaces only `read.campaignId`, and writes through the injected seam.

- [ ] **Step 4: Verify GREEN and storage seam**

```bash
npx tsx --test tests/pr-narrative-storage.test.ts tests/pr-evidence-storage.test.ts
npm run storage:seam-guard
npm run typecheck
git diff --check -- src/state/pr-narrative-storage.ts tests/pr-narrative-storage.test.ts
```

Expected: commands exit `0`; no raw global `chrome.storage` call exists.

---

### Task 4: Setup suggestion and two-stage producer

**Files:**
- Create: `src/state/pr-narrative-handlers.ts`
- Create: `tests/pr-narrative-handlers.test.ts`
- Modify: `src/compare/pr-evidence.ts`
- Modify: `src/compare/provider.ts`
- Modify: `src/state/messages.ts`
- Modify: `entrypoints/background.ts`
- Modify: `tests/pr-evidence-contract.test.ts`
- Modify: `tests/background-behavior.test.ts`

**Interfaces:**
- Produces: `generatePrCampaignSetupSuggestion`, `generatePrNarrativePostReadings`, and `generatePrNarrativeSynthesis`.
- Produces: `getPrNarrativeReadState` and `runPrNarrativeRead` with injected storage/provider dependencies.
- Adds messages `pr/get-narrative-read` and `pr/generate-narrative-read`.

- [ ] **Step 1: Write the failing setup-suggestion test**

```ts
test("setup parser returns six criteria and three editable fields", () => {
  const suggestion = parsePrCampaignSetupSuggestion(JSON.stringify({
    criteria: ["C1", "C2", "C3", "C4", "C5", "C6"],
    narrativeSettings: {
      narrativeAnchor: "Wellness is practical and social",
      targetAudience: "Young working adults",
      desiredAction: "Register for the event"
    }
  }));
  assert.equal(suggestion.criteria.length, 6);
  assert.equal(suggestion.narrativeSettings.targetAudience, "Young working adults");
});
```

The existing criteria prompt requests one JSON envelope containing criteria plus settings. With no provider, preserve deterministic criteria and return empty narrative settings.

- [ ] **Step 2: Write failing orchestration tests**

```ts
test("producer batches posts then atomically publishes one read", async () => {
  const stageACalls: string[][] = [];
  const stageBCalls: PrNarrativePostReading[][] = [];
  const fakeStageA = async (_provider: ProviderName, _apiKey: string, _prompt: string, refs: string[]) => {
    stageACalls.push(refs);
    return refs.map((ref) => makeReading(ref, 0.4, 0.7));
  };
  const fakeStageB = async (_provider: ProviderName, _apiKey: string, readings: PrNarrativePostReading[]) => {
    stageBCalls.push(readings);
    return makeValidSynthesis(readings.map((reading) => reading.ref));
  };
  const result = await runPrNarrativeRead({
    storageArea,
    campaign,
    rows: makeRows(32),
    session: makeSession(32),
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-4.1-mini",
    generatePostReadings: fakeStageA,
    generateSynthesis: fakeStageB,
    now: "2026-07-14T03:00:00.000Z"
  });
  assert.equal(stageACalls.length, 2);
  assert.equal(stageBCalls.length, 1);
  assert.equal(result.sourceRowIds.length, 32);
  assert.deepEqual(await loadPrNarrativeRead(storageArea, campaign.id), result);
});

test("failed synthesis preserves the last successful read", async () => {
  await savePrNarrativeRead(storageArea, previousRead);
  await assert.rejects(() => runPrNarrativeRead({
    storageArea,
    campaign,
    rows: makeRows(2),
    session: makeSession(2),
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-4.1-mini",
    generatePostReadings: async (_provider, _key, _prompt, refs) => refs.map((ref) => makeReading(ref, 0, 0)),
    generateSynthesis: async () => { throw new Error("invalid synthesis"); },
    now: "2026-07-14T03:00:00.000Z"
  }), /invalid synthesis/);
  assert.deepEqual(await loadPrNarrativeRead(storageArea, campaign.id), previousRead);
});
```

Add individual tests for no readable rows, missing provider key, and `insufficient_evidence` publication.

- [ ] **Step 3: Verify RED**

```bash
npx tsx --test tests/pr-evidence-contract.test.ts tests/pr-narrative-handlers.test.ts
```

Expected: failures for the missing setup parser and handler.

- [ ] **Step 4: Implement provider calls and orchestration**

```ts
export async function generatePrNarrativePostReadings(
  provider: ProviderName,
  apiKey: string,
  prompt: string,
  expectedRefs: string[]
): Promise<PrNarrativePostReading[]> {
  const raw = await generateJsonText(
    provider,
    apiKey,
    prompt,
    "Read only supplied PR posts and return JSON only.",
    2600
  );
  return parsePrNarrativePostReadResponse(raw, expectedRefs);
}
```

The handler builds the snapshot, chunks by the domain helper, awaits every Stage A batch, calls Stage B once, materializes, and saves only the validated final result.

- [ ] **Step 5: Add messages and background handlers**

```ts
| { type: "pr/get-narrative-read"; campaignId: string }
| { type: "pr/generate-narrative-read"; campaignId: string }

prNarrativeRead?: PrNarrativeRead | null;
prNarrativeCurrentSourceHash?: string;
prNarrativeSettings?: PrNarrativeSettings;
```

The get handler rebuilds the current snapshot hash and returns it with the stored read. Generation uses the `pr.generateNarrative` reconcile lane, `withDirectStorageReconcile`, and one `broadcastDirectStorageUpdate` after successful persistence.

- [ ] **Step 6: Add background behavior tests**

Use the existing `pr/match-criteria` harness to prove exactly one broadcast on success and no stale narrative-key write when a newer campaign request supersedes the producer.

- [ ] **Step 7: Verify GREEN and producer boundaries**

```bash
npx tsx --test tests/pr-evidence-contract.test.ts tests/pr-narrative-contract.test.ts tests/pr-narrative-storage.test.ts tests/pr-narrative-handlers.test.ts tests/background-behavior.test.ts
npm run storage:seam-guard
npm run boundary:guard
npm run typecheck
git diff --check -- src/compare/pr-evidence.ts src/compare/provider.ts src/state/pr-narrative-handlers.ts src/state/messages.ts entrypoints/background.ts
```

Expected: commands exit `0`; no auto-run trigger, comment input, temporal fallback, or partial publication exists.

---

### Task 5: Resource, ViewModel, hydration, and commands

**Files:**
- Modify: `src/ui/pr-evidence-resource.ts`
- Modify: `src/viewmodel/pr-evidence.ts`
- Modify: `src/ui/useInPageCollectorAppState.ts`
- Modify: `tests/pr-evidence-viewmodel.test.ts`
- Modify: `tests/use-in-page-collector-app-state.test.ts`
- Modify: `tests/pr-evidence-readmodel-boundary.test.ts`

**Interfaces:**
- Produces: `PrLens`, narrative claim/detail ViewModels, and `setLens`, `generateNarrative`, `selectNarrativeClaim` commands.
- Resource owns read/current hash/error; UI state owns active lens/loading/selected claim.

- [ ] **Step 1: Write failing ViewModel tests**

```ts
test("ViewModel derives narrative counts from refs", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-1",
    resource: { ...resource, narrativeRead, narrativeCurrentSourceHash: narrativeRead.sourceHash },
    uiState: { ...uiState, activeLens: "narrative", selectedNarrativeClaimId: "claim-1" }
  });
  assert.equal(vm.activeLens, "narrative");
  assert.equal(vm.narrative?.priorityClaim?.supportCount, 2);
  assert.equal(vm.narrative?.priorityClaim?.denominator, narrativeRead.sourceRowIds.length);
  assert.equal(vm.narrative?.priorityClaim?.counterCount, 1);
});

test("ViewModel marks a hash-mismatched read stale", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-1",
    resource: { ...resource, narrativeRead, narrativeCurrentSourceHash: "sha256:new" },
    uiState
  });
  assert.equal(vm.narrative?.status, "stale");
});
```

Add separate tests for insufficient evidence, settings in `saveDraft`, optional counters, and preservation of existing Evidence commands.

- [ ] **Step 2: Write failing reconcile tests**

```ts
test("stale narrative response cannot replace the active campaign", () => {
  const settled = { accepted: false, reason: "target-mismatch" } as const;
  const currentResource = createPrEvidenceResource("session-current");
  const oldResponse = { ok: true, prNarrativeRead: narrativeRead } as ExtensionResponse;
  assert.equal(applyPrNarrativeResult(currentResource, oldResponse, settled), currentResource);
});
```

Add hydrate coverage for campaign → rows → narrative read and loading cleanup only for accepted generation responses.

- [ ] **Step 3: Verify RED**

```bash
npx tsx --test tests/pr-evidence-viewmodel.test.ts tests/use-in-page-collector-app-state.test.ts tests/pr-evidence-readmodel-boundary.test.ts
```

Expected: failures for missing resource/UI fields and commands.

- [ ] **Step 4: Extend resource and ViewModel**

```ts
export interface PrEvidenceResourceState {
  campaign: PrCampaignDraft;
  rows: PrEvidenceRow[];
  narrativeRead: PrNarrativeRead | null;
  narrativeCurrentSourceHash: string;
  narrativeError: string;
  summary: string;
  notice: string;
  uploadError: string;
  setupCollapsed: boolean;
}
```

Join claim refs to row ViewModels and derive counts/source links there. Keep the View free of storage, messages, time, and identity generation.

- [ ] **Step 5: Extend hydrate and command dispatch**

```ts
const DEFAULT_PR_EVIDENCE_UI_STATE: PrEvidenceUiState = {
  activeLens: "narrative",
  selectedNarrativeClaimId: null,
  isGeneratingNarrative: false,
  activePane: "ledger",
  isSaving: false,
  isReadingBrief: false,
  isGeneratingCriteria: false,
  isMatching: false,
  isFetchingAdvancedMetrics: false,
  isGeneratingSummary: false
};
```

After campaign and rows load, request `pr/get-narrative-read`. Manual generation uses a `pr.generateNarrative` request token keyed by session and campaign.

- [ ] **Step 6: Verify GREEN and boundaries**

```bash
npx tsx --test tests/pr-evidence-viewmodel.test.ts tests/use-in-page-collector-app-state.test.ts tests/pr-evidence-readmodel-boundary.test.ts
npm run boundary:guard
npm run typecheck
git diff --check -- src/ui/pr-evidence-resource.ts src/viewmodel/pr-evidence.ts src/ui/useInPageCollectorAppState.ts
```

Expected: commands exit `0`; no automatic generation effect exists.

---

### Task 6: Interactive settings and dual-lens UI

**Files:**
- Modify: `src/ui/PrEvidenceViews.tsx`
- Modify: `tests/views.test.tsx`

**Interfaces:**
- Consumes only `PrEvidenceViewModel` and `PrEvidenceCommand`.
- Produces one settings surface, one lens switcher, a priority insight, claim list, optional compass disclosure, and one evidence drawer.

- [ ] **Step 1: Write failing settings interaction tests**

```tsx
test("PR settings controls reveal all narrative fields", () => {
  const commands: PrEvidenceCommand[] = [];
  const rendered = render(
    <PrEvidenceView viewModel={collapsedVm} onCommand={(command) => commands.push(command)} />
  );
  fireEvent.click(rendered.getByRole("button", { name: "活動設定" }));
  assert.deepEqual(commands[0], {
    kind: "setSetupCollapsed",
    target: { sessionId: collapsedVm.sessionId },
    collapsed: false
  });

  const expanded = render(<PrEvidenceView viewModel={expandedVm} onCommand={() => undefined} />);
  assert.ok(expanded.getByLabelText("核心敘事"));
  assert.ok(expanded.getByLabelText("目標受眾"));
  assert.ok(expanded.getByLabelText("希望行動"));
});
```

Add a distinct test proving the collapsed row's `編輯設定` sends the same command and expanded setup does not simultaneously render criteria health.

- [ ] **Step 2: Write failing lens and drawer tests**

```tsx
test("narrative lens opens an evidence drawer with optional counterexample", () => {
  const rendered = render(<PrEvidenceView viewModel={narrativeVm} onCommand={() => undefined} />);
  assert.equal(rendered.getByRole("tab", { name: /敘事判讀/ }).getAttribute("aria-selected"), "true");
  fireEvent.click(rendered.getByRole("button", { name: /Setup friction dominates/ }));
  assert.ok(rendered.getByRole("dialog", { name: "Setup friction dominates" }));
  assert.ok(rendered.getByText(/反例/));
  assert.ok(rendered.getAllByRole("link", { name: /Threads 原帖/ }).length >= 1);
});

test("evidence lens retains matching and CSV", () => {
  const rendered = render(<PrEvidenceView viewModel={evidenceVm} onCommand={() => undefined} />);
  assert.ok(rendered.getByRole("button", { name: "批次判斷" }));
  assert.ok(rendered.getByRole("button", { name: "匯出 CSV" }));
});
```

Add separate tests for no counterexample section, stale/insufficient/provider-error states, readable coverage, and manual `判讀已收集的 N 篇` dispatch.

- [ ] **Step 3: Verify RED**

```bash
npx tsx --test tests/views.test.tsx
```

Expected: missing settings labels, tabs, narrative action, and dialog assertions fail.

- [ ] **Step 4: Extend the single CampaignEditor**

```tsx
<label>
  <span>核心敘事</span>
  <textarea
    aria-label="核心敘事"
    value={campaign.narrativeSettings.narrativeAnchor}
    onChange={(event) => onChange({
      ...campaign.saveDraft,
      narrativeSettings: {
        ...campaign.narrativeSettings,
        narrativeAnchor: event.target.value
      }
    })}
  />
</label>
```

Use the same normalized draft update for target audience and desired action. Reuse current field styles and tokens.

- [ ] **Step 5: Add the scope bar and lens switcher**

Use the shared `SegmentedTabs`. The top `活動設定` and collapsed `編輯設定` controls both dispatch `setSetupCollapsed(false)`. When setup is expanded, render only `CampaignEditor`; when collapsed, render the switcher and selected lens.

- [ ] **Step 6: Render narrative insight and evidence drawer**

The priority surface renders implication first. Claim rows render `supportCount/denominator` once and dispatch `selectNarrativeClaim`. The optional compass renders positions without repeating counts. The drawer receives fully resolved ViewModel rows:

```tsx
<aside
  role="dialog"
  aria-modal="true"
  aria-label={claim.title}
  data-pr-narrative-drawer="true"
>
  <SecondaryButton onClick={() => onCommand(closeCommand)}>關閉</SecondaryButton>
  <NarrativeEvidenceList title="支持證據" rows={claim.supportRows} />
  {claim.counterRows.length
    ? <NarrativeEvidenceList title="反例" rows={claim.counterRows} />
    : null}
</aside>
```

- [ ] **Step 7: Verify GREEN and UI boundaries**

```bash
npx tsx --test tests/views.test.tsx tests/pr-evidence-viewmodel.test.ts tests/pr-evidence-readmodel-boundary.test.ts
npm run boundary:guard
npm run typecheck
git diff --check -- src/ui/PrEvidenceViews.tsx tests/views.test.tsx
```

Expected: commands exit `0`; no message/storage calls or new untokenized design values appear, and the Evidence workflow remains present.

---

### Task 7: Release coherence and full verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `wxt.config.ts`
- Modify: `src/ui/version.ts`
- Modify: `tests/manifest-config.test.ts`
- Modify: `README.md`
- Modify: `docs/memory/latest-shared-context.md`

**Interfaces:**
- Produces: one coherent `0.3.43` release and updated product/runtime documentation.

- [ ] **Step 1: Change the version test first and verify RED**

Set the expected version in `tests/manifest-config.test.ts` to `0.3.43`, then run:

```bash
npx tsx --test tests/manifest-config.test.ts
```

Expected: fail because production version files remain `0.3.42`.

- [ ] **Step 2: Update version and release-note surfaces**

Set `0.3.43` in package metadata, lockfile root/package entry, WXT manifest config, and `UI_VERSION`. Add this release contract to README and shared context:

```md
- PR mode offers current-only Narrative and Evidence lenses over manually collected Threads posts.
- Narrative reads only collected main-post text, keeps clickable support/counter refs, and never auto-discovers posts or claims temporal delta.
- Campaign settings add editable core narrative, target audience, and desired action fields.
```

- [ ] **Step 3: Run the complete automated gate**

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npm run storage:migrate-fixtures
npm run qa:harness:fixture
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
git diff --check
```

Expected: every command exits `0`; full tests report zero failures.

- [ ] **Step 4: Verify artifacts and forbidden copy**

```bash
rg -n '"version": "0\.3\.43"' .output/chrome-mv3/manifest.json output/chrome-mv3/manifest.json
rg -n '自動持續尋找|自動監察|上升|下降|最近 12 天' .output/chrome-mv3 output/chrome-mv3 || true
rg -n '核心敘事|目標受眾|希望行動|敘事判讀|證據匹配' .output/chrome-mv3 output/chrome-mv3
```

Expected: both manifests are `0.3.43`; forbidden monitoring/delta copy is absent; all intended labels are bundled.

- [ ] **Step 5: Run real Chrome profile QA**

Reload `/Users/tung/developer/dlens-product-latest/output/chrome-mv3` in the user's real Chrome profile and verify:

1. Both settings entry controls reveal the complete form.
2. All three fields save and survive popup reopen.
3. Generation runs only after the manual CTA and only over collected posts.
4. A claim opens its source links and any genuine counterexample.
5. Evidence lens retains matching, metrics, summary, and CSV actions.
6. Stale or provider-error states do not erase the last successful read.

- [ ] **Step 6: Audit final scope**

```bash
git status --short
git diff --stat
git diff --name-only
git log -3 --oneline
```

Expected: implementation files match this plan; pre-existing unrelated working-tree changes are reported separately.
