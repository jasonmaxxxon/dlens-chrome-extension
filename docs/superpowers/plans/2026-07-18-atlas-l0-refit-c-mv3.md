# Atlas L0 Refit C MV3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 `docs/mockups/2026-07-18-atlas-l0-refit-C-refined.html` 的三個 L0 presentation refit 落地到 Threads 頁內 MV3 Topic Atlas，同時補齊 evidence-bound P3 producer contract、舊報告相容性與真實來源操作。

**Architecture:** P3 v4 只新增 optional narrative display hints；parser 與 storage normalization 保持 lenient，ViewModel 再補 cross-post strength。Topic UI 以兩個純 React 元件取代現有 inline narrative/compass markup，來源清單改成 ready-state disclosure，但既有 Atlas shell、headline/ledger/episode、reliability、single drawer、run ledger 與 SourceRow commands 全部保留。

**Tech Stack:** TypeScript 5.8、React 19、WXT 0.20 MV3、Node test runner + tsx、Chrome content script。

## Global Constraints

- 真正 surface 是 `entrypoints/threads.content.ts` 掛載的 Threads in-page workspace，不修改 legacy `SidepanelApp`。
- P3 contract 固定為 `topic-audit-p3.v4`；`beats` 與 `trajectory` 都是 optional，舊 memo 不得失效。
- `beats` 只有 `{ setup, tension, outcome }` 三個完整非空欄位才保留，每欄 trim 後最多 48 字；`trajectory` 只接受 `"new" | "carried"`。
- beats 是 display hints，不是 evidence；stage 引文只能取自 lane 的真實 `signalRefs`，不得由 label/prose 猜測。
- ready Atlas 只顯示一個 source list 且預設 closed；pre-Atlas/empty state 保持可見，不新增第二份 manifest。
- bubble hover/focus 顯示真實 `dynamicImplication`，click/Enter/Space 仍開現有 unified drawer。
- 保留 `none / running / ready / stale / failed` 同一 Atlas canvas、舊 Atlas regeneration retention、episode strip、reliability zones。
- View 不碰 `chrome.*`、storage、message 或時間 API；所有 design values 只讀 `src/ui/tokens.ts`。
- 所有新增 motion 必須在 `prefers-reduced-motion` guard 內；窄 viewport 的 beats/distribution 必須改為單欄。
- one-in-one-out：移除現有 segmented lane cells、inline compass legend 與未使用的 `ReactionPatternLane` surface；不得把新 UI 疊在舊 UI 上。
- built content script 必須同時符合 raw `910000`、gzip `256000`、Brotli `203000` bytes 預算；0.3.51 baseline Brotli 為 `203321`，本次需降到預算內。
- user-visible release 版本為 `0.3.52`，同步 package、WXT manifest、UI version、manifest test、README 與 `docs/memory/latest-shared-context.md`。
- 不碰主 checkout 既有 untracked backup／PNG；不 push、不 merge main，除非使用者另行批准。

---

### Task 1: P3 v4 narrative display contract

**Files:**
- Modify: `tests/topic-audit-prompts.test.ts`
- Modify: `src/compare/topic-audit.ts`
- Modify: `src/compare/topic-audit-prompts.ts`

**Interfaces:**
- Produces: `NarrativeLaneBeats`, `NarrativeLaneTrajectory`, and optional `beats` / `trajectory` on `AuditPromptNarrativeLane` and persisted `LensMemo.displayHints.narrativeLanes`.
- Consumes: existing `parseAuditPromptEnvelopeResponse(raw, allowedRefs)` and `buildP3NarrativePrompt(input)`.

- [ ] **Step 1: Write failing prompt-version and producer tests**

Add assertions to the existing P2–P6 prompt test:

```ts
const p3 = buildP3NarrativePrompt({
  topicName: "love",
  packets: [packet],
  signalReadings: [reading],
  lexiconMemo: lexicon
});
assert.equal(TOPIC_AUDIT_PROMPT_VERSIONS.p3, "topic-audit-p3.v4");
assert.match(p3, /beats/);
assert.match(p3, /setup.*tension.*outcome/s);
assert.match(p3, /每段.*48/);
assert.match(p3, /trajectory.*new.*carried/s);
```

- [ ] **Step 2: Write failing parser compatibility tests**

Add one camelCase and one snake_case parser case:

```ts
test("P3 parser preserves optional narrative beats and trajectory without breaking legacy lanes", () => {
  const modern = parseAuditPromptEnvelopeResponse(JSON.stringify({
    prose: "跨帖敘事。",
    evidenceRefs: ["S1.OP"],
    caveats: [],
    displayHints: { narrativeLanes: [{
      id: "lane-1",
      label: "結構性困境",
      signalRefs: ["S1.OP"],
      consensus: 0.8,
      beats: { setup: "職缺收縮", tension: "經驗門檻升高", outcome: "困境被重讀為結構問題" },
      trajectory: "carried"
    }] }
  }), new Set(["S1.OP"]));
  assert.deepEqual(modern?.displayHints?.narrativeLanes?.[0]?.beats, {
    setup: "職缺收縮",
    tension: "經驗門檻升高",
    outcome: "困境被重讀為結構問題"
  });
  assert.equal(modern?.displayHints?.narrativeLanes?.[0]?.trajectory, "carried");

  const legacy = parseAuditPromptEnvelopeResponse(JSON.stringify({
    prose: "舊敘事。",
    evidenceRefs: ["S1.OP"],
    caveats: [],
    display_hints: { narrative_lanes: [{ label: "舊 lane", signal_refs: ["S1.OP"], consensus: 0.6 }] }
  }), new Set(["S1.OP"]));
  assert.equal(legacy?.displayHints?.narrativeLanes?.[0]?.beats, undefined);
  assert.equal(legacy?.displayHints?.narrativeLanes?.[0]?.trajectory, undefined);
});
```

Also test snake aliases `setup_text / tension_text / outcome_text` only if all three values are present; incomplete beats must become `undefined`, and an invalid trajectory must become `undefined`.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npx tsx --test tests/topic-audit-prompts.test.ts
```

Expected: FAIL because P3 is still v3 and parsed lanes do not expose beats/trajectory.

- [ ] **Step 4: Add shared narrative hint types**

In `src/compare/topic-audit.ts`, add:

```ts
export interface NarrativeLaneBeats {
  setup: string;
  tension: string;
  outcome: string;
}

export type NarrativeLaneTrajectory = "new" | "carried";
```

Extend the persisted `displayHints.narrativeLanes[]` entry with:

```ts
beats?: NarrativeLaneBeats;
trajectory?: NarrativeLaneTrajectory;
```

- [ ] **Step 5: Implement the lenient parser and P3 schema**

In `src/compare/topic-audit-prompts.ts`:

```ts
const NARRATIVE_BEAT_MAX_CHARS = 48;

function readNarrativeBeat(value: unknown): string {
  return readTrimmedString(value).slice(0, NARRATIVE_BEAT_MAX_CHARS);
}

function readNarrativeBeats(value: unknown): NarrativeLaneBeats | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const setup = readNarrativeBeat(raw.setup ?? raw.setup_text);
  const tension = readNarrativeBeat(raw.tension ?? raw.tension_text);
  const outcome = readNarrativeBeat(raw.outcome ?? raw.outcome_text);
  return setup && tension && outcome ? { setup, tension, outcome } : undefined;
}

function readNarrativeTrajectory(value: unknown): NarrativeLaneTrajectory | undefined {
  return value === "new" || value === "carried" ? value : undefined;
}
```

Read `raw.beats ?? raw.storyBeats ?? raw.story_beats`, spread only valid values into each lane, bump `TOPIC_AUDIT_PROMPT_VERSIONS.p3` to v4, and change the narrative schema example to:

```json
{
  "id": "lane-1",
  "label": "敘事線名稱",
  "signalRefs": ["S1.OP"],
  "consensus": 0.6,
  "icon": "heart",
  "beats": { "setup": "起", "tension": "張力", "outcome": "收束" },
  "trajectory": "new|carried"
}
```

Add P3-only instructions: all three beats are topic-language, each ≤48 chars; compare current evidence against prior narrative state for trajectory; omit both fields when evidence cannot support them.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
npx tsx --test tests/topic-audit-prompts.test.ts
npm run typecheck
```

Expected: all focused tests pass; typecheck exits 0.

- [ ] **Step 7: Commit the producer contract**

```bash
git add src/compare/topic-audit.ts src/compare/topic-audit-prompts.ts tests/topic-audit-prompts.test.ts
git commit -m "feature: add atlas narrative beat contract"
```

---

### Task 2: Preserve narrative hints through storage and ViewModel

**Files:**
- Modify: `tests/topic-audit-handlers.test.ts`
- Modify: `tests/topic-detail-viewmodel.test.ts`
- Modify: `tests/narrative-lane-detail.test.ts`
- Modify: `src/viewmodel/topic-detail.ts`
- Modify: `src/viewmodel/narrative-lane-detail.ts`
- Modify: `src/ui/topic-audit-components.tsx`

**Interfaces:**
- Consumes: Task 1 `NarrativeLaneBeats` and `NarrativeLaneTrajectory`.
- Produces: optional `beats` / `trajectory` on `TopicAuditNarrativeLaneHint` and UI `NarrativeLaneHint`; `pickRepresentativeNarrativeEvidence({ lane, packets })` returning an exact-ref quote or `null`.

- [ ] **Step 1: Write failing normalization and VM tests**

Extend the existing narrative handler fixture with beats/trajectory, then assert the saved narrative memo still contains them after unknown refs are filtered:

```ts
assert.deepEqual(narrativeMemo?.displayHints?.narrativeLanes?.[0]?.beats, {
  setup: "職缺收縮",
  tension: "經驗門檻升高",
  outcome: "結構性困境成為共同框架"
});
assert.equal(narrativeMemo?.displayHints?.narrativeLanes?.[0]?.trajectory, "carried");
```

In the VM strength test, add the same fields to `lane-cross` and assert:

```ts
assert.deepEqual(lanes[0]?.beats, {
  setup: "職缺收縮",
  tension: "經驗門檻升高",
  outcome: "結構性困境成為共同框架"
});
assert.equal(lanes[0]?.trajectory, "carried");
```

- [ ] **Step 2: Write a failing exact-ref quote test**

In `tests/narrative-lane-detail.test.ts`, add packets where an unrelated reply has more likes than the lane refs:

```ts
test("representative narrative evidence is selected only from exact lane refs", () => {
  const quote = pickRepresentativeNarrativeEvidence({
    lane: { id: "lane-1", signalRefs: ["S1.OP", "S2.R1"] },
    packets: [packetOne, packetTwo]
  });
  assert.equal(quote?.ref, "S2.R1");
  assert.doesNotMatch(quote?.text ?? "", /unrelated high-like reply/);
});
```

- [ ] **Step 3: Run focused tests and verify RED**

```bash
npx tsx --test tests/topic-audit-handlers.test.ts tests/topic-detail-viewmodel.test.ts tests/narrative-lane-detail.test.ts
```

Expected: FAIL because the exact-ref selector/export is missing; typecheck also identifies any lane-type propagation gap.

- [ ] **Step 4: Extend VM/UI lane types without re-parsing**

Add these two fields to both `TopicAuditNarrativeLaneHint` and `NarrativeLaneHint`:

```ts
beats?: NarrativeLaneBeats;
trajectory?: NarrativeLaneTrajectory;
```

Import the shared types from `src/compare/topic-audit.ts`. Keep `withNarrativeStrength()` as a spread-based projection so the fields survive unchanged while cross-post counts remain derived from evidence refs.

- [ ] **Step 5: Implement exact evidence selection**

Add a `ref` field to the returned quote shape and implement:

```ts
export function pickRepresentativeNarrativeEvidence({ lane, packets }: {
  lane: NarrativeLaneRef;
  packets: ReadonlyArray<EvidencePacket>;
}): (LaneComment & { ref: string }) | null {
  const byRef = new Map<string, LaneComment & { ref: string }>();
  for (const packet of packets) {
    byRef.set(`${packet.shortCode}.OP`, {
      ref: `${packet.shortCode}.OP`,
      shortCode: packet.shortCode,
      author: packet.opAuthor || "unknown",
      text: (packet.opText || "").trim(),
      likes: packet.opLikes,
      kind: "op"
    });
    for (const fragment of packet.replyFragments) {
      byRef.set(fragment.ref, {
        ref: fragment.ref,
        shortCode: packet.shortCode,
        author: fragment.author || "unknown",
        text: (fragment.text || "").trim(),
        likes: fragment.likes,
        kind: "reply"
      });
    }
  }
  return lane.signalRefs
    .map((ref) => byRef.get(ref))
    .filter((entry): entry is LaneComment & { ref: string } => Boolean(entry?.text))
    .sort((a, b) => likesValue(b.likes) - likesValue(a.likes) || a.ref.localeCompare(b.ref))[0] ?? null;
}
```

- [ ] **Step 6: Run focused tests and typecheck**

```bash
npx tsx --test tests/topic-audit-handlers.test.ts tests/topic-detail-viewmodel.test.ts tests/narrative-lane-detail.test.ts
npm run typecheck
```

Expected: all focused tests pass; typecheck exits 0.

- [ ] **Step 7: Commit the projection contract**

```bash
git add src/viewmodel/topic-detail.ts src/viewmodel/narrative-lane-detail.ts src/ui/topic-audit-components.tsx tests/topic-audit-handlers.test.ts tests/topic-detail-viewmodel.test.ts tests/narrative-lane-detail.test.ts
git commit -m "feature: project atlas narrative stages"
```

---

### Task 3: Replace narrative ribbons with the paged stage

**Files:**
- Create: `src/ui/AtlasNarrativeStage.tsx`
- Create: `tests/atlas-narrative-stage.test.tsx`
- Modify: `src/ui/TopicDetailView.tsx`
- Modify: `tests/topic-detail-view.test.tsx`

**Interfaces:**
- Consumes: `NarrativeLaneHint`, `EvidencePacket[]`, `pickRepresentativeNarrativeEvidence`, `EvidenceRefChip`.
- Produces: `AtlasNarrativeStage` with markers `data-atlas-narrative-pager`, `data-atlas-narrative-page`, `data-narrative-participation`, and `data-narrative-participation-fill`.

- [ ] **Step 1: Write failing static markup tests**

The fixture must contain two cross-post lanes (first modern, second legacy) and one single-post observation. Assert:

```ts
assert.match(html, /data-atlas-narrative-page="lane-modern"/);
assert.match(html, /data-narrative-participation="lane-modern"/);
assert.match(html, /data-narrative-participation-fill="lane-modern"[^>]*width:50%/);
assert.match(html, />起</);
assert.match(html, />張力</);
assert.match(html, />收束</);
assert.match(html, /data-narrative-trajectory="carried"/);
assert.match(html, /data-narrative-representative-ref="S2\.R1"/);
assert.doesNotMatch(html, /unrelated high-like reply/);
assert.match(html, /data-atlas-single-observation="lane-single"/);
assert.doesNotMatch(html, /data-narrative-strength-cell/);
```

- [ ] **Step 2: Write a failing mounted pager test**

Mount the component in JSDOM; click `data-atlas-narrative-next`, assert the second lane replaces the first, the position live region becomes `2 / 2`, next is disabled, and the legacy lane has no beats row. Click previous and verify `1 / 2`.

- [ ] **Step 3: Run tests and verify RED**

```bash
npx tsx --test tests/atlas-narrative-stage.test.tsx tests/topic-detail-view.test.tsx
```

Expected: FAIL because the component/markers do not exist and the old segmented cells remain.

- [ ] **Step 4: Implement `AtlasNarrativeStage`**

Use this public shape:

```ts
export interface AtlasNarrativeStageProps {
  lanes: NarrativeLaneHint[];
  packets: EvidencePacket[];
  postTotal: number;
  selectedLaneId: string | null;
  pinnedRef: string | null;
  fragmentLookup: Map<string, EvidenceFragmentLookup>;
  onSelectLane: (id: string) => void;
  onPinRef: (ref: string) => void;
}
```

Implementation rules:

- filter `!isSinglePostObservation` into pages; local `page` starts at 0 and clamps when the lane list changes;
- stage click selects the lane, but pager buttons call `stopPropagation()`;
- continuous fill is `Math.min(100, crossPostCount / max(1, postTotal) * 100)`;
- render beats only when all three values exist; render trajectory badge only when valid;
- quote comes from `pickRepresentativeNarrativeEvidence` and is annotated with exact ref, author and likes;
- render at most three `EvidenceRefChip`s; preserve all refs in the drawer contract;
- `aria-live="polite"` announces page position; buttons expose disabled state and labels;
- single-post observations remain as compact, clickable rows after the pager;
- CSS inside the component uses existing tokens and stacks beat cards at `max-width: 520px`;
- stage entrance animation is inside `@media (prefers-reduced-motion: no-preference)` only.

- [ ] **Step 5: Integrate and remove old lane markup**

In `TopicDetailView`, keep the hero kicker/topic/ledger/episode/headline, close the hero after headline, then render:

```tsx
<AtlasNarrativeStage
  lanes={auditLanes}
  packets={auditEvidence}
  postTotal={postTotal}
  selectedLaneId={selectedLaneId}
  pinnedRef={pinnedAuditRef}
  fragmentLookup={auditFragmentLookup}
  onSelectLane={(id) => setActiveDetail({ kind: "narrative", id })}
  onPinRef={handlePinAuditRef}
/>
```

Delete the current `crossLanes.map()` segmented cells and `singleLanes.map()` ribbon block. Update the old raw-comment guard: allow exactly one `data-narrative-representative-ref` quote while still rejecting unrelated/raw fixture strings.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
npx tsx --test tests/atlas-narrative-stage.test.tsx tests/topic-detail-view.test.tsx tests/narrative-lane-detail.test.ts
npm run typecheck
```

Expected: focused tests pass; typecheck exits 0.

- [ ] **Step 7: Commit the stage replacement**

```bash
git add src/ui/AtlasNarrativeStage.tsx src/ui/TopicDetailView.tsx tests/atlas-narrative-stage.test.tsx tests/topic-detail-view.test.tsx
git commit -m "feature: replace atlas narrative ribbons"
```

---

### Task 4: Replace the compass legend with the accessible distribution view

**Files:**
- Create: `src/ui/AtlasReactionMap.tsx`
- Create: `tests/atlas-reaction-map.test.tsx`
- Modify: `src/ui/TopicDetailView.tsx`
- Modify: `src/ui/topic-audit-components.tsx`
- Modify: `src/ui/motion.ts`
- Modify: `tests/topic-detail-view.test.tsx`
- Modify: `tests/motion-registry.test.ts`

**Interfaces:**
- Consumes: `ReactionPattern[]` and `layoutSignalAtlasCompass(patterns)`.
- Produces: `AtlasReactionMap` with `data-atlas-assignment-distribution`, `data-atlas-assignment-row`, and focus/hover tooltip state.

- [ ] **Step 1: Write failing static and interaction tests**

Assert static markup contains bubble names/counts, a decorative donut, rows sorted by `nComments`, and percentages calculated from total assignments:

```ts
assert.match(html, /data-atlas-assignment-distribution="true"/);
assert.match(html, /data-atlas-assignment-total="78"/);
assert.match(html, /data-atlas-assignment-row="doom"[^>]*data-assignment-percent="31"/);
assert.match(html, /data-signal-atlas-dot="doom"/);
assert.match(html, />行業悲觀與結構性焦慮</);
```

Mount the component and dispatch `mouseenter` and `focus` on a bubble; assert `role="tooltip"` displays that pattern's `dynamicImplication`. Dispatch click/Enter/Space and assert `onSelect` receives the real pattern id.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx tsx --test tests/atlas-reaction-map.test.tsx tests/topic-detail-view.test.tsx tests/motion-registry.test.ts
```

Expected: FAIL because the distribution/tooltip markers are missing and the old legend class remains.

- [ ] **Step 3: Implement `AtlasReactionMap`**

Use this public shape:

```ts
export interface AtlasReactionMapProps {
  patterns: ReactionPattern[];
  usableCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}
```

Inside the component:

- call `layoutSignalAtlasCompass(patterns)`; keep fallback field copy for old audits without coordinates;
- render full label below each bubble, without 12-character truncation;
- include `dynamicImplication` in `aria-label` and a visible tooltip on mouse/focus;
- keep keyboard activation and circular `:focus-visible` rings;
- use dark count text on signal/amber bubbles and light text on violet/rose bubbles;
- assignment total is `sum(pattern.nComments)`; row percent is `Math.round(nComments / total * 100)`;
- donut is `aria-hidden`, rows are semantic buttons and the readable source of count/percentage data;
- order rows by `nComments` descending with stable original-index tie-break;
- distribution becomes one column at `max-width: 520px`;
- no color literal: palette is `[signal, techniqueViolet, queued, techniqueRose, accent]` from tokens.

- [ ] **Step 4: Integrate and remove obsolete surfaces**

Replace the entire inline `data-signal-atlas-map` section in `TopicDetailView` with:

```tsx
<AtlasReactionMap
  patterns={reactionPatterns}
  usableCount={compassDenominator}
  selectedId={selectedReactionId}
  onSelect={(id) => setActiveDetail({ kind: "reaction", id })}
/>
```

Delete the unused `ReactionPatternLane` export/import, move the bubble contrast test to the new component, and rename the quiet hover CSS/test from `.dlens-atlas-legend-row` to `.dlens-atlas-distribution-row`.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
npx tsx --test tests/atlas-reaction-map.test.tsx tests/topic-detail-view.test.tsx tests/motion-registry.test.ts tests/signal-atlas-compass.test.ts
npm run typecheck
```

Expected: focused tests pass; typecheck exits 0.

- [ ] **Step 6: Commit the distribution replacement**

```bash
git add src/ui/AtlasReactionMap.tsx src/ui/TopicDetailView.tsx src/ui/topic-audit-components.tsx src/ui/motion.ts tests/atlas-reaction-map.test.tsx tests/topic-detail-view.test.tsx tests/motion-registry.test.ts
git commit -m "feature: add atlas assignment distribution"
```

---

### Task 5: Make the ready source list a truthful disclosure

**Files:**
- Modify: `src/ui/TopicDetailView.tsx`
- Modify: `tests/topic-detail-view.test.tsx`
- Modify: `tests/source-row.test.tsx`

**Interfaces:**
- Consumes: existing `mergedSourceSection`, `SourceRow`, `PendingSignalRow`, delete/compare/crawl callbacks.
- Produces: one `details[data-atlas-source-disclosure]`; ready Atlas defaults closed, no-Atlas source work remains open.

- [ ] **Step 1: Write failing disclosure tests**

For ready Atlas static markup:

```ts
assert.match(html, /<details[^>]*data-atlas-source-disclosure="true"/);
assert.doesNotMatch(html, /<details[^>]*data-atlas-source-disclosure="true"[^>]*open/);
assert.match(html, /data-topic-source-list="true"/);
assert.match(html, /貼文 · 點入單帖/);
```

For a no-Atlas/pending fixture assert the same disclosure has `open`. In a mounted test toggle the summary and verify the visible caret/copy changes from `展開` to `收合`; the existing SourceRow callbacks must still fire after opening.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx tsx --test tests/topic-detail-view.test.tsx tests/source-row.test.tsx
```

Expected: FAIL because the source section is not wrapped in a disclosure.

- [ ] **Step 3: Implement the disclosure without duplicating rows**

Replace the outer source `<section>` with:

```tsx
<details
  data-atlas-source-disclosure="true"
  defaultOpen={!hasAtlasData}
  onToggle={(event) => setSourceDisclosureOpen(event.currentTarget.open)}
  style={{ borderRadius: tokens.radius.cardLg, background: tokens.color.elevated, boxShadow: tokens.shadow.topicCard }}
>
  <summary aria-label={`${sourceDisclosureOpen ? "收合" : "展開"}貼文清單`}>
    <span>貼文 · 點入單帖</span>
    <span>{sourceListCounts}</span>
    <span>{sourceDisclosureOpen ? "收合 ▴" : "展開 ▾"}</span>
  </summary>
  <div data-topic-source-list="true">{existingRowsUnchanged}</div>
</details>
```

The exact implementation may keep the existing mapped rows in a local element, but must not clone or render them twice. `showP1Progress` stays in the summary. Add summary focus/hover CSS using tokens only.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
npx tsx --test tests/topic-detail-view.test.tsx tests/source-row.test.tsx
npm run typecheck
```

Expected: focused tests pass; typecheck exits 0.

- [ ] **Step 5: Commit the source disclosure**

```bash
git add src/ui/TopicDetailView.tsx tests/topic-detail-view.test.tsx tests/source-row.test.tsx
git commit -m "feature: collapse ready atlas sources"
```

---

### Task 6: Version, contract docs, build budget, and full verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `wxt.config.ts`
- Modify: `src/ui/version.ts`
- Modify: `tests/manifest-config.test.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/memory/latest-shared-context.md`
- Modify only if needed for touched-surface size reduction: `src/ui/TopicDetailView.tsx`, `src/ui/topic-audit-components.tsx`, `src/ui/motion.ts`

**Interfaces:**
- Consumes: Tasks 1–5 completed behavior and markers.
- Produces: source/build version `0.3.52`, budget-compliant MV3 build, current docs, and reproducible verification evidence.

- [ ] **Step 1: Write the failing version test first**

Change the expected version in `tests/manifest-config.test.ts` to `0.3.52`, then run:

```bash
npx tsx --test tests/manifest-config.test.ts
```

Expected: FAIL because package/WXT/UI still report `0.3.51`.

- [ ] **Step 2: Synchronize all version lock sites**

Run:

```bash
npm version 0.3.52 --no-git-tag-version
```

Then set `wxt.config.ts` manifest version and `src/ui/version.ts` `BUILD_VERSION` to `0.3.52`. Rerun the manifest test; expected PASS.

- [ ] **Step 3: Update current contract docs in place**

Update the README header to identify `0.3.52` as local-only/static-ready until real Chrome acceptance finishes. Add one concise feature bullet covering P3 v4 optional beats/trajectory, paged narrative stage, assignment distribution, and closed ready source disclosure.

Update `AGENTS.md` Topic mode contract with:

```text
P3 v4 may publish optional evidence-bound displayHints.narrativeLanes[].beats
(setup/tension/outcome, ≤48 chars each) plus trajectory new/carried. Legacy lanes
remain valid; the UI never derives missing beats from prose.
```

Update `docs/memory/latest-shared-context.md` in place to `0.3.52`; remove stale `0.3.49` current-version wording rather than adding another dated handoff file.

- [ ] **Step 4: Run targeted regression bundle**

```bash
npx tsx --test \
  tests/topic-audit-prompts.test.ts \
  tests/topic-audit-handlers.test.ts \
  tests/topic-detail-viewmodel.test.ts \
  tests/narrative-lane-detail.test.ts \
  tests/atlas-narrative-stage.test.tsx \
  tests/atlas-reaction-map.test.tsx \
  tests/topic-detail-view.test.tsx \
  tests/source-row.test.tsx \
  tests/signal-atlas-compass.test.ts \
  tests/motion-registry.test.ts \
  tests/manifest-config.test.ts
```

Expected: zero failures.

- [ ] **Step 5: Run the complete repository gate**

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
git diff --check
npm run bundle:guard
```

Expected: every command exits 0; full suite has zero failures; built manifest is `0.3.52`; raw/gzip/Brotli are at or below all three limits. If bundle size remains red, remove obsolete touched-surface code/classes and rerun build + budget; do not raise the limit.

- [ ] **Step 6: Verify built artifact markers and manifest mirror**

```bash
shasum -a 256 .output/chrome-mv3/manifest.json output/chrome-mv3/manifest.json
node -e 'const fs=require("fs"); for (const p of [".output/chrome-mv3/manifest.json","output/chrome-mv3/manifest.json"]) console.log(p,JSON.parse(fs.readFileSync(p)).version)'
rg -l 'data-atlas-narrative-pager|data-narrative-participation|data-atlas-assignment-distribution|data-atlas-source-disclosure' output/chrome-mv3/content-scripts/threads.js
```

Expected: manifest hashes match, both versions are `0.3.52`, and the content bundle contains all four markers.

- [ ] **Step 7: Commit release coherence**

```bash
git add package.json package-lock.json wxt.config.ts src/ui/version.ts tests/manifest-config.test.ts README.md AGENTS.md docs/memory/latest-shared-context.md
git commit -m "feature: release atlas refit c as 0.3.52"
```

- [ ] **Step 8: Real Chrome acceptance**

Load the rebuilt `output/chrome-mv3` in Jason's Chrome `Default` profile, open DLens from the real extension action or in-page launcher on a real Threads page, and verify:

1. an existing 0.3.51 Atlas renders a legacy stage without invented beats;
2. a manual regeneration publishes P3 v4 beats/trajectory while the old Atlas remains mounted during the run;
3. pager buttons, live position, keyboard navigation, and narrow layout work;
4. bubble hover/focus tooltip and click/Enter drawer agree on the same pattern;
5. distribution total and percentages use attribution count, not usable-comment count;
6. ready source disclosure starts closed and every original action still works after opening;
7. stale/failed states retain the last usable Atlas and reliability zones.

Record only version, route/state, command outcomes, marker presence, and screenshots; do not record API keys, prompts, raw private posts, or provider output.

---

## Plan Self-Review

- Spec coverage: producer, parser, storage, ViewModel, narrative UI, compass distribution, source disclosure, accessibility, compatibility, version/docs, bundle/build, and real runtime QA each have an owning task.
- Placeholder scan: clean; every code change step names exact files, APIs, command, and expected result.
- Type consistency: Task 1 shared types flow unchanged through Task 2; Task 3 consumes `NarrativeLaneHint`; Task 4 owns compass layout; Task 5 only wraps the existing source list; Task 6 verifies the four stable DOM markers.
