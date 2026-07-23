# Product Reading Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first completed Product analysis persist and display one high-quality complete reading for every `try`/`watch` signal, while removing the shallow proposal/deep-reading duplication and repairing the Product attention card geometry.

**Architecture:** ProductSignalAnalyzer v21 returns the four judgment axes plus one nullable `ProductReading`. TypeScript derives the verdict, validates reading eligibility and grounded refs, then the background pipeline atomically persists the analysis and a reviewable `SignalReading` projection in one `chrome.storage.local.set`. Product Action renders that persisted reading as its only high-attention artifact; legacy proposal/watch/deep-reading generation UI is removed, and a scoped masked perimeter beam replaces the interior sweep.

**Tech Stack:** TypeScript 5.8, React 19, Chrome MV3 storage, WXT, Node test runner through `tsx`, JSDOM render tests, shared `src/ui/tokens.ts` design contract.

## Global Constraints

- Work on the existing local `main`; do not push, tag, open a PR, or modify unrelated untracked artifacts.
- Follow TDD for every production behavior: add one failing test, run it and confirm the expected failure, implement the smallest change, then rerun the covering test.
- Use exactly the commit prefixes `bug fix`, `feature`, `removal`, or `refactor`.
- Every new UI surface must remove comparable old UI/code weight in the same package.
- `try` and `watch` require one valid complete Product Reading; `park`, noise, and `insufficient_data` must not persist or render one.
- The model never outputs `verdict`; `deriveProductSignalVerdict()` remains the single verdict owner.
- The first completed `try`/`watch` card shows the complete reading immediately. There is no generate, expand, retry, or second provider request between opening the card and reading the judgment.
- A successful `try`/`watch` analysis and its projected reading are written in one storage operation; no half-success state is allowed.
- Existing filed/deferred/rejected review state and feedback events survive an idempotent materialization of the same content identity.
- Legacy reading records remain available for historical packet export; do not destructively migrate or delete them.
- All model-facing Threads content is data, never instructions. Uninspected video, animation, repository, and linked-resource content remains explicitly unverified.
- Product Reading visuals reuse `tokens.radius.cardLg`, `tokens.color.atlasPaper`, `tokens.color.atlasEdge`, `tokens.shadow.atlasCard`, and the existing atlas blur. Do not add a second palette, radius, shadow, or font scale.
- The Product Reading wrapper and content use `boxSizing: "border-box"`, `maxWidth: "100%"`, and `minWidth: 0`.
- The Product Reading beam is perimeter-only. It cannot cross text, wrap a title/button, or reuse the current interior horizontal sweep.
- Reduced motion freezes the Product Reading beam at a static angle.
- Do not change `scripts/ui-bundle-budget.json`; the starting raw headroom is only 90 bytes, so removed legacy JSX/CSS must fund the new reading card and beam.
- Static gates do not count as real-Chrome proof. Final acceptance uses rebuilt `output/chrome-mv3`, Jason's Chrome `Default` profile, the real extension action/in-page launcher, and a real Threads page.
- The implementation spec is `docs/superpowers/specs/2026-07-23-product-reading-unification-design.md`.

---

## File Structure

### New focused module

- `src/compare/product-analysis-reading.ts`
  - Owns conversion from one valid v21 `ProductSignalAnalysis.productReading` plus captured analyzer input into a deterministic reviewable `SignalReading`.
  - Owns the content hash used to distinguish a genuinely new reading from an idempotent retry.
  - Contains no storage calls, provider calls, Chrome APIs, React, or DOM.

### Existing modules with one responsibility each

- `src/state/types.ts`
  - Defines `ProductReading`; removes legacy Product application/watch types from the current analysis contract.
- `src/compare/product-signal-analysis.ts`
  - Owns v21 provider schema, prompt, parsing, verdict/reading invariants, and freshness version.
- `src/compare/provider.ts`
  - Sends the shared v21 schema to Google/OpenAI/Claude; removes the Product-only second-reading provider call after the live command is removed.
- `src/compare/product-signal-storage.ts`
  - Normalizes current and legacy analyses; exports a map loader/normalizer needed by the composite persistence seam.
- `src/compare/signal-reading.ts`
  - Keeps source-packet/hash helpers; removes the retired second-reading prompt.
- `src/compare/signal-reading-storage.ts`
  - Adds reading headline/origin/root provenance and exports a safe map loader/normalizer.
- `src/compare/product-analysis-result-storage.ts`
  - Atomically commits one normalized analysis plus optional projected reading to both storage maps with one `set`.
- `entrypoints/background.ts`
  - Generates outside the lock, rechecks signal liveness inside the lock, materializes the reading, and calls the composite storage seam.
- `src/viewmodel/product-card-presentation.ts`
  - Removes recommendation/watch projections; exposes only card density, hero, category, brief eligibility, and reading readiness.
- `src/viewmodel/product-signal.ts`, `src/state/messages.ts`, `src/ui/useInPageCollectorAppState.ts`, `src/ui/InPageCollectorPopup.tsx`
  - Remove the Product Action `generateReading` command path.
- `src/ui/ProductSignalViews.tsx`
  - Renders one visible Product Reading card and its review/Agent footer; removes proposal, watch-guidance, and nested deep-reading surfaces.
- `src/ui/components.tsx`, `src/ui/motion.ts`
  - Add one scoped Product Reading perimeter owner without changing existing non-Product attention consumers.
- `src/compare/signal-reading-brief.ts`, `src/compare/signal-packet.ts`, `src/compare/signal-packet-export.ts`
  - Preserve headline/origin and identify the reading as the analyzer projection, not a second free-reading inference.

---

### Task 1: ProductSignalAnalyzer v21 Complete Reading Contract

**Files:**
- Modify: `src/state/types.ts:124-230`
- Modify: `src/compare/product-signal-analysis.ts:1-1065`
- Modify: `src/compare/provider.ts:313-365`
- Test: `tests/product-signal-analysis.test.ts`
- Test: `tests/provider-runtime.test.ts`

**Interfaces:**
- Consumes: existing `deriveProductSignalVerdict({ signalType, judgmentAxes })`.
- Produces:

```ts
export interface ProductReading {
  headline: string;
  body: string;
  supportRefs: string[];
}

export interface ProductSignalAnalysis {
  productReading?: ProductReading;
}
```

- Produces `PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION === "v21"`.
- Removes current-contract `ProductApplicationSuggestion`, `ProductWatchGuidance`, `applicationSuggestions`, and `watchGuidance`.

- [ ] **Step 1: Replace legacy schema assertions with failing v21 Product Reading tests**

In `tests/product-signal-analysis.test.ts`, add focused tests equivalent to:

```ts
test("ProductSignalAnalyzer v21 schema owns one nullable product reading", () => {
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION, "v21");
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_CACHE_VERSION, "v21");
  const required = new Set(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.required);
  assert.equal(required.has("product_reading"), true);
  assert.equal(required.has("application_suggestions"), false);
  assert.equal(required.has("watch_guidance"), false);
  const props = PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties as Record<string, unknown>;
  assert.equal(props.application_suggestions, undefined);
  assert.equal(props.watch_guidance, undefined);
  assert.deepEqual(
    (props.product_reading as {
      type: readonly string[];
      additionalProperties: boolean;
      required: readonly string[];
    }).type,
    ["object", "null"]
  );
  assert.equal((props.product_reading as { additionalProperties: boolean }).additionalProperties, false);
  assert.deepEqual(
    [...(props.product_reading as { required: readonly string[] }).required].sort(),
    ["body", "headline", "support_refs"]
  );
});
```

Add parser fixtures covering these exact behaviors:

```ts
test("v21 accepts a grounded complete reading for try and watch", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify(makeRawAnalysis({
      usefulness: "useful",
      testability: "reversible_test",
      evidence_state: "text_sufficient",
      conflict_state: "none",
      product_reading: {
        headline: "用 hover 動畫回應可互動狀態",
        body: "原文展示 hover 觸發的動態回應。對目前產品而言，值得先在非核心按鈕做局部測試，並觀察流暢度與視覺一致性。",
        support_refs: ["root", "e1"]
      }
    })),
    makeAnalyzerInput()
  );
  assert.equal(parsed?.verdict, "try");
  assert.deepEqual(parsed?.productReading?.supportRefs, ["root", "e1"]);
});

test("v21 rejects actionable analysis without a complete reading", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify(makeRawAnalysis({
      usefulness: "useful",
      testability: "not_yet_testable",
      evidence_state: "external_unverified",
      conflict_state: "none",
      product_reading: null
    })),
    makeAnalyzerInput()
  );
  assert.equal(parsed, null);
});

test("v21 discards reading content for a non-actionable verdict", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify(makeRawAnalysis({
      usefulness: "none",
      testability: "not_applicable",
      evidence_state: "text_sufficient",
      conflict_state: "none",
      product_reading: {
        headline: "不應顯示",
        body: "這段不應形成高注意力內容。",
        support_refs: ["root"]
      }
    })),
    makeAnalyzerInput()
  );
  assert.equal(parsed?.verdict, "park");
  assert.equal(parsed?.productReading, undefined);
});
```

Add invalid cases for duplicate refs, zero refs, more than five refs, refs absent from `evidence_refs`, refs without a `text_grounded` note, blank headline/body, and an over-1,200-code-point body.

In `tests/provider-runtime.test.ts`, assert every provider body exposes the same `product_reading` schema and neither retired field.

- [ ] **Step 2: Run the new tests and confirm the expected failures**

Run:

```bash
npx tsx --test --test-name-pattern="v21|product reading|ProductSignalAnalyzer" \
  tests/product-signal-analysis.test.ts tests/provider-runtime.test.ts
```

Expected: failures report v20, missing `product_reading`, and existing retired schema fields.

- [ ] **Step 3: Define the current Product Reading type and remove retired contract fields**

In `src/state/types.ts`, replace the two retired interfaces with:

```ts
export interface ProductReading {
  headline: string;
  body: string;
  supportRefs: string[];
}
```

Change `ProductSignalAnalysis`:

```ts
export interface ProductSignalAnalysis {
  // existing classification, verdict, evidence, provenance fields stay
  productReading?: ProductReading;
}
```

Remove `applicationSuggestions` and `watchGuidance` from the current interface. Keep unrelated `agentTaskSpec`, evidence, axes, warnings, and legacy optional analysis fields until a separate removal proves they have no consumer.

- [ ] **Step 4: Replace schema, prompt, and parser logic**

Set:

```ts
export const PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION = "v21";
export const PRODUCT_SIGNAL_ANALYSIS_CACHE_VERSION = PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION;
```

In `PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA`, require:

```ts
product_reading: {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["headline", "body", "support_refs"],
  properties: {
    headline: { type: "string" },
    body: { type: "string" },
    support_refs: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" }
    }
  }
}
```

Remove both retired properties and their required keys.

Add a parser helper with this contract:

```ts
function readProductReading(
  value: unknown,
  {
    eligible,
    allowedRefs,
    evidenceRefs,
    evidenceNotes
  }: {
    eligible: boolean;
    allowedRefs: Set<string>;
    evidenceRefs: Set<string>;
    evidenceNotes: ProductSignalEvidenceNote[];
  }
): ProductReading | null {
  if (!eligible || !value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const headline = readTrimmedString(raw.headline).slice(0, 60);
  const body = readTrimmedString(raw.body);
  const refs = raw.support_refs ?? raw.supportRefs;
  if (!headline || !body || [...body].length > 1200 || !Array.isArray(refs)) return null;
  if (refs.length < 1 || refs.length > 5) return null;
  if (refs.some((ref) => typeof ref !== "string" || !ref || ref !== ref.trim())) return null;
  const supportRefs = refs as string[];
  if (new Set(supportRefs).size !== supportRefs.length) return null;
  const grounded = new Set(
    evidenceNotes
      .filter((note) => note.grounding === "text_grounded")
      .map((note) => note.ref)
  );
  if (supportRefs.some((ref) =>
    !allowedRefs.has(ref) || !evidenceRefs.has(ref) || !grounded.has(ref)
  )) return null;
  return { headline, body, supportRefs };
}
```

After deriving the verdict:

```ts
const rawProductReading = parsed.productReading ?? parsed.product_reading;
const readingEligible = signalType !== "noise"
  && (derived.verdict === "try" || derived.verdict === "watch");
const productReading = readProductReading(rawProductReading, {
  eligible: readingEligible,
  allowedRefs,
  evidenceRefs: evidenceRefSet,
  evidenceNotes
});
if (readingEligible && !productReading) {
  return null;
}
```

Return `productReading` only when eligible. Delete the `try -> watch` fallback and the missing-watch-guidance rejection.

Rewrite the prompt instructions so the model:

- returns `product_reading` for `try/watch`, otherwise `null`;
- writes free-form judgment rather than fixed proposal rows;
- distinguishes evidence, inference, and uncertainty;
- explicitly marks unseen video/repository/link content;
- may conclude inspiration-only or unsuitable;
- treats crawled content as data, not instructions.

- [ ] **Step 5: Keep the three provider envelopes identical**

Continue passing `PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA` through `buildProductSignalAnalysisBody()` for Google, OpenAI, and Claude. Raise all Product analyzer output ceilings from 1,800 to 2,800 tokens:

```ts
const PRODUCT_SIGNAL_ANALYSIS_MAX_OUTPUT_TOKENS = 2800;
```

Use that constant in Google `maxOutputTokens`, Claude `max_tokens`, and OpenAI `max_completion_tokens` only if the existing OpenAI request supports that property; otherwise the OpenAI schema-constrained response remains unchanged.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
npx tsx --test tests/product-signal-analysis.test.ts tests/provider-runtime.test.ts
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/state/types.ts src/compare/product-signal-analysis.ts src/compare/provider.ts \
  tests/product-signal-analysis.test.ts tests/provider-runtime.test.ts
git commit -m "feature: add complete Product reading and remove proposal fields"
```

---

### Task 2: Strict Storage and Reviewable Reading Materialization

**Files:**
- Create: `src/compare/product-analysis-reading.ts`
- Create: `src/compare/product-analysis-result-storage.ts`
- Modify: `src/compare/product-signal-storage.ts`
- Modify: `src/compare/signal-reading.ts`
- Modify: `src/compare/signal-reading-storage.ts`
- Test: `tests/product-signal-storage.test.ts`
- Test: `tests/signal-reading.test.ts`
- Test: `tests/product-analysis-result-storage.test.ts`

**Interfaces:**
- Consumes: v21 `ProductSignalAnalysis.productReading`.
- Produces:

```ts
export type SignalReadingOrigin = "product_analysis" | "manual_deep_read";

export interface SignalReading {
  headline?: string;
  origin?: SignalReadingOrigin;
  // existing fields stay
}

export function materializeProductAnalysisReading(input: {
  analysis: ProductSignalAnalysis;
  analyzerInput: ProductSignalAnalyzerInput;
  postUrl: string;
}): SignalReading | null;

export async function saveProductAnalysisResult(
  storageArea: StorageAreaLike,
  analysis: ProductSignalAnalysis,
  reading: SignalReading | null
): Promise<{ analysis: ProductSignalAnalysis; reading: SignalReading | null }>;
```

- [ ] **Step 1: Write failing strict-storage and idempotency tests**

In `tests/product-signal-storage.test.ts`, replace v20 proposal/watch strict tests with:

```ts
test("v21 storage requires a Product Reading for try and watch", async () => {
  await assert.rejects(
    saveProductSignalAnalysis(storage, makeAnalysis("missing", {
      promptVersion: "v21",
      verdict: "watch",
      productReading: undefined
    })),
    /Invalid product signal analysis/
  );
});

test("v21 storage discards Product Reading for non-actionable records", async () => {
  await saveProductSignalAnalysis(storage, makeAnalysis("park", {
    promptVersion: "v21",
    verdict: "park",
    productReading: validProductReading()
  }));
  assert.equal((await getProductSignalAnalysis(storage, "park"))?.productReading, undefined);
});
```

In `tests/signal-reading.test.ts`, add:

```ts
test("projected reading preserves explicit headline origin and root provenance", async () => {
  const reading = materializeProductAnalysisReading({
    analysis: makeAnalysisWithReading(),
    analyzerInput: makeAnalyzerInput(),
    postUrl: "https://www.threads.com/@author/post/abc"
  });
  assert.equal(reading?.headline, "值得注意的互動模式");
  assert.equal(reading?.origin, "product_analysis");
  assert.deepEqual(reading?.sourceRefs, ["root", "e1"]);
  assert.equal(reading?.sourcePacket.rootText, makeAnalyzerInput().rootText);
});
```

In new `tests/product-analysis-result-storage.test.ts`, add one in-memory storage double that records `set` calls and test:

```ts
test("analysis and projected reading use one storage set", async () => {
  const result = await saveProductAnalysisResult(storage, analysis, reading);
  assert.equal(storage.setCalls.length, 1);
  assert.deepEqual(
    Object.keys(storage.setCalls[0]!).sort(),
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY, SIGNAL_READINGS_STORAGE_KEY].sort()
  );
  assert.equal(result.reading?.cacheKey, reading.cacheKey);
});

test("idempotent materialization preserves review state and feedback", async () => {
  await saveProductAnalysisResult(storage, analysis, {
    ...reading,
    reviewState: "filed",
    feedbackEvents: [{ type: "filed", at: "2026-07-23T00:00:00.000Z" }]
  });
  await saveProductAnalysisResult(storage, analysis, {
    ...reading,
    reviewState: "pending",
    feedbackEvents: []
  });
  const stored = await getSignalReading(storage, reading.cacheKey);
  assert.equal(stored?.reviewState, "filed");
  assert.equal(stored?.feedbackEvents.length, 1);
});
```

- [ ] **Step 2: Run the tests and confirm missing interfaces fail**

Run:

```bash
npx tsx --test tests/product-signal-storage.test.ts \
  tests/signal-reading.test.ts tests/product-analysis-result-storage.test.ts
```

Expected: failures identify missing v21 normalizer, materializer, headline/origin/root provenance, and composite save.

- [ ] **Step 3: Normalize v21 analysis storage**

In `src/compare/product-signal-storage.ts`:

- set `PRODUCT_SIGNAL_ANALYSIS_STRICT_VERSION = "v21"`;
- add `normalizeProductReading()` with the same headline/body/ref boundaries as Task 1;
- require a reading for stored complete `try/watch` v21 records;
- discard it for noise/park/insufficient;
- remove current-version application/watch normalizers and fields;
- keep old v20 records readable as legacy stale analyses.

Export the existing normalizer/map loader under internal names:

```ts
export const normalizeProductSignalAnalysisRecord = normalizeProductSignalAnalysis;
export const loadProductSignalAnalysisMap = readAnalysisMap;
```

- [ ] **Step 4: Extend reading provenance without breaking legacy records**

In `src/compare/signal-reading.ts`:

```ts
export interface SignalReadingSourcePacket {
  rootText?: string;
  assembledContent: string;
  postUrl: string;
  representativeComments: SignalReadingComment[];
  analysisPromptVersion: string;
}
```

Update `buildStoredSourcePacket()` to preserve `rootText` when the input supplies it.

In `src/compare/signal-reading-storage.ts`:

```ts
export type SignalReadingOrigin = "product_analysis" | "manual_deep_read";

export interface SignalReading {
  headline?: string;
  origin?: SignalReadingOrigin;
  // existing identity, body, refs, packet, review fields stay
}
```

Legacy records without these fields remain valid. Export:

```ts
export const normalizeSignalReadingRecord = normalizeSignalReading;
export const loadSignalReadingMap = readReadingMap;
```

- [ ] **Step 5: Create deterministic materialization**

Create `src/compare/product-analysis-reading.ts` with:

```ts
import type { ProductSignalAnalysis } from "../state/types.ts";
import type { ProductSignalAnalyzerInput } from "./product-signal-analysis.ts";
import {
  buildSignalReadingCacheKey,
  type SignalReading
} from "./signal-reading-storage.ts";

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function materializeProductAnalysisReading({
  analysis,
  analyzerInput,
  postUrl
}: {
  analysis: ProductSignalAnalysis;
  analyzerInput: ProductSignalAnalyzerInput;
  postUrl: string;
}): SignalReading | null {
  const productReading = analysis.productReading;
  if (analysis.verdict !== "try" && analysis.verdict !== "watch") return null;
  if (!productReading) throw new Error("Actionable Product analysis is missing productReading");

  const sourcePacket = {
    rootText: analyzerInput.rootText,
    assembledContent: analyzerInput.assembledContent.slice(0, 8000),
    postUrl,
    representativeComments: analyzerInput.discussionReplies.slice(0, 20).map((reply, index) => ({
      ref: `e${index + 1}`,
      author: reply.author,
      text: reply.text.slice(0, 500),
      likeCount: reply.likeCount ?? null
    })),
    analysisPromptVersion: analysis.promptVersion
  };
  const sourcePacketHash = hashText(JSON.stringify(sourcePacket));
  const contentHash = hashText(JSON.stringify(productReading));
  const cacheKey = buildSignalReadingCacheKey({
    signalId: analysis.signalId,
    productContextHash: analysis.productContextHash,
    sourcePacketHash,
    promptVersion: analysis.promptVersion,
    contentHash
  });

  return {
    signalId: analysis.signalId,
    cacheKey,
    productContextHash: analysis.productContextHash,
    sourcePacketHash,
    promptVersion: analysis.promptVersion,
    headline: productReading.headline,
    reading: productReading.body,
    generatedAt: analysis.analyzedAt,
    model: analysis.model ?? "",
    sourceRefs: [...productReading.supportRefs],
    sourcePacket,
    origin: "product_analysis",
    reviewState: "pending",
    feedbackEvents: []
  };
}
```

Extend `buildSignalReadingCacheKey()` with optional `contentHash` while keeping legacy four-part keys unchanged:

```ts
export function buildSignalReadingCacheKey(parts: {
  signalId: string;
  productContextHash: string;
  sourcePacketHash: string;
  promptVersion: string;
  contentHash?: string;
}): string {
  return [
    parts.signalId,
    parts.productContextHash,
    parts.sourcePacketHash,
    parts.promptVersion,
    parts.contentHash
  ].filter(Boolean).join("::");
}
```

- [ ] **Step 6: Add the one-set composite persistence seam**

Create `src/compare/product-analysis-result-storage.ts`:

```ts
import {
  PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY,
  loadProductSignalAnalysisMap,
  normalizeProductSignalAnalysisRecord,
  type StorageAreaLike
} from "./product-signal-storage.ts";
import {
  SIGNAL_READINGS_STORAGE_KEY,
  loadSignalReadingMap,
  normalizeSignalReadingRecord,
  type SignalReading
} from "./signal-reading-storage.ts";
import type { ProductSignalAnalysis } from "../state/types.ts";

export async function saveProductAnalysisResult(
  storageArea: StorageAreaLike,
  analysis: ProductSignalAnalysis,
  reading: SignalReading | null
): Promise<{ analysis: ProductSignalAnalysis; reading: SignalReading | null }> {
  const normalizedAnalysis = normalizeProductSignalAnalysisRecord(analysis);
  if (!normalizedAnalysis) throw new Error("Invalid product signal analysis");
  const normalizedReading = reading ? normalizeSignalReadingRecord(reading) : null;
  if (reading && !normalizedReading) throw new Error("Invalid signal reading");
  if (
    (normalizedAnalysis.verdict === "try" || normalizedAnalysis.verdict === "watch")
    && !normalizedReading
  ) {
    throw new Error("Actionable Product analysis requires a projected reading");
  }

  const [analyses, readings] = await Promise.all([
    loadProductSignalAnalysisMap(storageArea),
    loadSignalReadingMap(storageArea)
  ]);
  const existing = normalizedReading ? readings[normalizedReading.cacheKey] : null;
  const preservedReading = normalizedReading && existing
    ? {
        ...normalizedReading,
        reviewState: existing.reviewState,
        feedbackEvents: existing.feedbackEvents
      }
    : normalizedReading;

  await storageArea.set({
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      ...analyses,
      [normalizedAnalysis.signalId]: normalizedAnalysis
    },
    [SIGNAL_READINGS_STORAGE_KEY]: preservedReading
      ? { ...readings, [preservedReading.cacheKey]: preservedReading }
      : readings
  });
  return { analysis: normalizedAnalysis, reading: preservedReading };
}
```

- [ ] **Step 7: Run storage tests, seam guard, and typecheck**

Run:

```bash
npx tsx --test tests/product-signal-storage.test.ts \
  tests/signal-reading.test.ts tests/product-analysis-result-storage.test.ts
npm run storage:seam-guard
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/compare/product-analysis-reading.ts \
  src/compare/product-analysis-result-storage.ts \
  src/compare/product-signal-storage.ts src/compare/signal-reading.ts \
  src/compare/signal-reading-storage.ts tests/product-signal-storage.test.ts \
  tests/signal-reading.test.ts tests/product-analysis-result-storage.test.ts
git commit -m "feature: materialize Product readings and preserve review history"
```

---

### Task 3: Atomic Background Analysis Publication

**Files:**
- Modify: `entrypoints/background.ts:667-765`
- Test: `tests/background-behavior.test.ts`
- Test: `tests/session-signal-seam.test.ts`

**Interfaces:**
- Consumes `materializeProductAnalysisReading()` and `saveProductAnalysisResult()`.
- Produces the first-open invariant: a completed `try/watch` analysis and its reading become visible together.
- Keeps provider calls outside `withSnapshotLock`.

- [ ] **Step 1: Add failing background publication and race tests**

Extend the Product analyzer payload helper in `tests/background-behavior.test.ts` with a valid `product_reading`.

Add tests that assert:

```ts
test("product analysis publishes analysis and reading in one storage write", async () => {
  const response = await runProductAnalyzeMessage();
  assert.equal(response.ok, true);
  const writes = storage.setCalls.filter((value) =>
    PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY in value
    || SIGNAL_READINGS_STORAGE_KEY in value
  );
  assert.equal(writes.length, 1);
  assert.equal(PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY in writes[0]!, true);
  assert.equal(SIGNAL_READINGS_STORAGE_KEY in writes[0]!, true);
});

test("a signal deleted while provider work runs leaves neither analysis nor reading", async () => {
  const pending = beginDeferredProductAnalysis();
  await deleteSignalBeforeProviderResolves();
  pending.resolve(validV21TryPayload());
  await pending.response;
  assert.equal(await getProductSignalAnalysis(storage, signalId), null);
  assert.equal(
    (await listSignalReadings(storage)).some((reading) => reading.signalId === signalId),
    false
  );
});

test("normal Product analysis does not call the second reading provider", async () => {
  await runProductAnalyzeMessage();
  assert.equal(fetchCalls.filter(isSignalReadingProviderCall).length, 0);
});
```

Extend the stale-request regression so an older analyzer completion cannot write either storage key after a newer request owns the signal.

- [ ] **Step 2: Run the background tests and confirm missing projection failures**

Run:

```bash
npx tsx --test --test-name-pattern="product analysis|Product analysis|projected reading|deleted while provider" \
  tests/background-behavior.test.ts tests/session-signal-seam.test.ts
```

Expected: analysis currently writes alone; reading assertions fail.

- [ ] **Step 3: Publish outside-provider work through one locked commit**

In `analyzeProductSignalsForSessionUnlocked()`:

1. Build `analyzerInput` and call `generateProductSignalAnalysis()` outside the lock.
2. Build the projected reading using the same input and `item.descriptor.post_url || item.descriptor.page_url || ""`.
3. Enter `withSnapshotLock`.
4. Reload the target session/signals and confirm the same signal/item still exists and is not archived/rejected.
5. Call `saveProductAnalysisResult()` once.
6. If the signal disappeared or a newer request owns the work, return without writing either result.

The core success branch must follow this shape:

```ts
const analysis = await generateProductSignalAnalysis(
  providerConfig.provider,
  providerConfig.apiKey,
  input
);
const reading = materializeProductAnalysisReading({
  analysis,
  analyzerInput: input,
  postUrl: item.descriptor.post_url || item.descriptor.page_url || ""
});
await withSnapshotLock(async () => {
  const liveSignals = await loadSignals(chrome.storage.local, session.id);
  const liveSignal = liveSignals.find((entry) =>
    entry.id === signal.id
    && entry.itemId === item.id
    && entry.inboxStatus !== "archived"
    && entry.inboxStatus !== "rejected"
  );
  if (!liveSignal) return;
  await saveProductAnalysisResult(storageArea, analysis, reading);
});
```

Keep error-analysis persistence separate because an error has no completed reading. Preserve existing retry/error copy and request ownership checks.

- [ ] **Step 4: Run background, seam, and boundary checks**

Run:

```bash
npx tsx --test tests/background-behavior.test.ts tests/session-signal-seam.test.ts
npm run storage:seam-guard
npm run boundary:guard
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit Task 3**

```bash
git add entrypoints/background.ts tests/background-behavior.test.ts \
  tests/session-signal-seam.test.ts
git commit -m "bug fix: publish Product analysis and reading atomically"
```

---

### Task 4: One First-Open Reading and Removal of Legacy Product Paths

**Files:**
- Modify: `src/ui/ProductSignalViews.tsx:1600-3600`
- Modify: `src/viewmodel/product-card-presentation.ts`
- Modify: `src/viewmodel/product-signal.ts`
- Modify: `src/state/messages.ts`
- Modify: `src/ui/useInPageCollectorAppState.ts`
- Modify: `src/ui/InPageCollectorPopup.tsx`
- Modify: `entrypoints/background.ts:3350-3467`
- Modify: `src/compare/provider.ts:793-860`
- Modify: `src/compare/signal-reading.ts:128-185`
- Modify: `scripts/qa-code-path-audit.mjs`
- Test: `tests/views.test.tsx`
- Test: `tests/product-card-presentation.test.ts`
- Test: `tests/product-signal-viewmodel.test.ts`
- Test: `tests/request-reconcile.test.ts`
- Test: `tests/qa-code-path-audit.test.ts`
- Test: `tests/signal-reading.test.ts`

**Interfaces:**
- Product Action consumes the already-persisted `SignalReading`; it exposes review and Agent handoff but no synthesis command.
- A fresh `try/watch` signal produces exactly one `data-product-reading-card="true"` on first open.
- `ProductCardPresentation` no longer exposes `recommendations`, `recommendationTier`, or `watchGuidance`.
- No Product generate-reading control, `product/synthesize-signal-reading` message, or second provider call remains.

- [ ] **Step 1: Write the removal and first-open tests first**

Update the viewmodel/action tests to assert:

- Product card presentation has no recommendation/watch projection fields;
- completed Product signals expose no `generateReading` action;
- Product Action no longer reconciles a synthesis command;
- the code-path audit identifies the Product analyzer/materialization seam as the sole Product Reading producer.

Replace legacy Product Action render assertions with:

```ts
test("Product Action first open shows one complete reading without another action", () => {
  const html = renderProductAction({
    analysis: makeTryAnalysis({ productReading: validProductReading() }),
    reading: makeProjectedReading({
      headline: "先把互動動畫當成局部視覺實驗",
      reading: "這則訊號真正值得注意的是 hover 觸發的動態回應，而不是持續播放的裝飾動畫。先在非核心控制上做可逆測試，再觀察流暢度與一致性。",
      origin: "product_analysis"
    })
  });
  assert.equal(count(html, 'data-product-reading-card="true"'), 1);
  assert.match(html, /先把互動動畫當成局部視覺實驗/);
  assert.match(html, /這則訊號真正值得注意的是/);
  assert.doesNotMatch(html, /生成完整判讀|展開深度閱讀|AI 提案 · 待驗證|來源做法|可能適合|先小試/);
});
```

Also test:

- explicit `headline` is used and the complete `reading` body is visible;
- review actions and eligible Agent handoff render once in the same footer;
- only provenance is collapsed;
- park/noise/insufficient cards render no Product Reading card;
- stale v20 actionable records show `需要重新分析以產生完整判讀` and never rebuild a proposal.

- [ ] **Step 2: Run the focused tests and confirm the expected failures**

Run:

```bash
npx tsx --test tests/product-card-presentation.test.ts \
  tests/product-signal-viewmodel.test.ts tests/request-reconcile.test.ts \
  tests/qa-code-path-audit.test.ts tests/signal-reading.test.ts \
  tests/views.test.tsx
```

Expected: legacy fields, actions, controls, and nested reading surfaces make the new assertions fail.

- [ ] **Step 3: Remove the recommendation projection and second provider path**

From `ProductCardPresentation`, remove recommendation/watch types, fields, and derivation helpers. Retain density, hero/category/takeaway, brief eligibility, and Agent readiness.

Delete:

- `generateReading` from the Product signal viewmodel;
- Product synthesis request/response variants;
- matching UI dispatch and background handler;
- `generateSignalReading()` and its Product reading prompt builders;
- prompt-only tests for the retired call.

Keep reading storage, source packet hashing/materialization, review, brief, and export code. Do not reconstruct Product Reading from `experimentHint`, evidence notes, or retired proposal fields.

- [ ] **Step 4: Render one complete Product Reading immediately**

Replace `createSignalReadingDisplayCopy()` title inference for projected readings with explicit `headline` plus a fully visible paragraph body. Historical readings without `headline` may use `analysis.contentSummary` as a quiet fallback; fresh v21 Product Action must require the explicit field.

In `ProductActionStage` remove:

- `renderRecommendationSurface`;
- watch-guidance/application JSX;
- the nested `data-product-action-deep-read` disclosure;
- `onSynthesizeSignalReading`.

Render one neutral, compilable `AttentionSurface as="section" state="none"` after the takeaway. Task 6 adds the actionable visual variant only after that component API exists. The root must already use:

```tsx
dataAttrs={{
  "data-product-reading-card": "true",
  "data-product-reading-origin": activeReading.origin ?? "legacy"
}}
style={glassCardStyle({
  gap: 12,
  padding: 16,
  boxSizing: "border-box",
  maxWidth: "100%",
  minWidth: 0
})}
```

Inside it, render the reading header, explicit headline/body, evidence state, one review/Agent footer, and one collapsed `來源、引用與新鮮度` disclosure. If an actionable analysis lacks the projected reading, show the stale/error copy; never rebuild the old short proposal.

- [ ] **Step 5: Run affected tests, guards, and typecheck**

Run:

```bash
npx tsx --test tests/product-card-presentation.test.ts \
  tests/product-signal-viewmodel.test.ts tests/request-reconcile.test.ts \
  tests/qa-code-path-audit.test.ts tests/signal-reading.test.ts \
  tests/views.test.tsx
npm run boundary:guard
npm run storage:seam-guard
npm run typecheck
```

Expected: all commands exit 0 and the intermediate commit is independently compilable.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/ui/ProductSignalViews.tsx \
  src/viewmodel/product-card-presentation.ts src/viewmodel/product-signal.ts \
  src/state/messages.ts src/ui/useInPageCollectorAppState.ts \
  src/ui/InPageCollectorPopup.tsx entrypoints/background.ts \
  src/compare/provider.ts src/compare/signal-reading.ts \
  scripts/qa-code-path-audit.mjs tests/views.test.tsx \
  tests/product-card-presentation.test.ts tests/product-signal-viewmodel.test.ts \
  tests/request-reconcile.test.ts tests/qa-code-path-audit.test.ts \
  tests/signal-reading.test.ts
git commit -m "removal: show one Product reading and remove duplicate paths"
```

---

### Task 5: Preserve Reading Identity in Briefs and Exports

**Files:**
- Modify: `src/compare/signal-reading-brief.ts`
- Modify: `src/compare/signal-packet.ts`
- Modify: `src/compare/signal-packet-export.ts`
- Test: `tests/signal-reading.test.ts`
- Test: `tests/signal-packet.test.ts`
- Test: `tests/signal-packet-export.test.ts`

**Interfaces:**
- Agent brief title prefers `SignalReading.headline`, then the analysis content summary.
- Packet and export formats preserve `headline` and `origin`.
- `origin === "product_analysis"` is described as the current Product analysis reading, not a separate free-reading stage.

- [ ] **Step 1: Write failing identity/provenance tests**

Add fixtures proving:

- explicit projected headline survives brief composition;
- packet JSON contains headline and origin;
- HTML/Markdown export labels `product_analysis` honestly;
- legacy readings without either optional field keep their existing fallback output.

- [ ] **Step 2: Run the focused tests and confirm the expected failures**

Run:

```bash
npx tsx --test tests/signal-reading.test.ts \
  tests/signal-packet.test.ts tests/signal-packet-export.test.ts
```

Expected: at least the new headline/origin assertions fail.

- [ ] **Step 3: Carry headline/origin through every reading-first output**

Update brief, packet, HTML, and Markdown composition without adding a new product suggestion artifact. Preserve the existing format for legacy readings. Do not call a projected Product analysis reading a separate provider-generated or free reading.

- [ ] **Step 4: Run focused tests, boundary guard, and typecheck**

Run:

```bash
npx tsx --test tests/signal-reading.test.ts \
  tests/signal-packet.test.ts tests/signal-packet-export.test.ts
npm run boundary:guard
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/compare/signal-reading-brief.ts src/compare/signal-packet.ts \
  src/compare/signal-packet-export.ts tests/signal-reading.test.ts \
  tests/signal-packet.test.ts tests/signal-packet-export.test.ts
git commit -m "refactor: preserve Product reading identity in exports"
```

---

### Task 6: Contained Perimeter Beam and Product Card Geometry

**Files:**
- Modify: `src/ui/components.tsx:277-310`
- Modify: `src/ui/motion.ts:89-125`
- Modify: `src/ui/ProductSignalViews.tsx`
- Test: `tests/components.test.tsx`
- Test: `tests/motion-registry.test.ts`
- Test: `tests/views.test.tsx`

**Interfaces:**
- Extends `AttentionSurface` with `variant?: "default" | "product-reading"`.
- `variant="product-reading"` emits `data-product-reading-beam`.
- The Product Reading root owns the only actionable marker.

- [ ] **Step 1: Write failing perimeter and containment tests**

In `tests/components.test.tsx`:

```ts
test("Product Reading attention surface emits one scoped perimeter owner", () => {
  const html = renderToStaticMarkup(
    <AttentionSurface state="actionable" variant="product-reading">
      <span>判讀</span>
    </AttentionSurface>
  );
  assert.match(html, /data-product-reading-beam="actionable"/);
  assert.doesNotMatch(html, /data-attention-beam-sweep/);
});
```

In `tests/motion-registry.test.ts`:

```ts
test("Product Reading beam is masked to the perimeter and freezes for reduced motion", () => {
  assert.match(DLENS_ATTENTION_CSS, /\[data-product-reading-beam\]/);
  assert.match(DLENS_ATTENTION_CSS, /mask-composite:exclude/);
  assert.match(DLENS_ATTENTION_CSS, /-webkit-mask-composite:xor/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /data-product-reading-beam/);
  assert.doesNotMatch(
    productReadingCssSlice(DLENS_ATTENTION_CSS),
    /linear-gradient\(90deg.*signalGlow/
  );
});
```

In `tests/views.test.tsx`, assert the Product Reading root inline style includes:

```ts
assert.match(cardStyle, /box-sizing:border-box/);
assert.match(cardStyle, /max-width:100%/);
assert.match(cardStyle, /min-width:0/);
```

Add an interactive DOM geometry test that stubs parent/card rectangles and fails when `card.right > parent.right`. Name the test after the observed regression: `Product Reading card cannot exceed its parent by the former 12px content-box overflow`.

- [ ] **Step 2: Run the focused tests and confirm missing perimeter behavior**

Run:

```bash
npx tsx --test tests/components.test.tsx tests/motion-registry.test.ts \
  --test-name-pattern="Product Reading|12px"
npx tsx --test --test-name-pattern="Product Reading" tests/views.test.tsx
```

Expected: missing variant/marker/mask and geometry assertions fail.

- [ ] **Step 3: Add the scoped variant without changing other consumers**

Change `AttentionSurface`:

```ts
export function AttentionSurface({
  as = "div",
  state,
  variant = "default",
  children,
  style,
  dataAttrs
}: {
  as?: "div" | "section";
  state: AttentionBeamState;
  variant?: "default" | "product-reading";
  children: ReactNode;
  style?: CSSProperties;
  dataAttrs?: Record<`data-${string}`, string | undefined>;
}): ReactElement {
  const Element = as;
  return (
    <Element
      {...dataAttrs}
      data-attention-surface="true"
      data-attention-beam={state}
      data-attention-beam-sweep={
        variant === "default" && state === "generating" ? "true" : undefined
      }
      data-product-reading-beam={variant === "product-reading" ? state : undefined}
      style={style}
    >
      {children}
    </Element>
  );
}
```

- [ ] **Step 4: Replace Product Reading interior sweep with compact masked CSS**

Add one scoped rule to `DLENS_ATTENTION_CSS`. Keep it compact because the raw bundle has 90 bytes of starting headroom and legacy removal must fund it:

```css
[data-product-reading-beam]{
  box-sizing:border-box;
  max-width:100%;
  min-width:0;
  overflow:hidden;
  isolation:isolate;
}
[data-product-reading-beam]::after{
  content:"";
  position:absolute;
  z-index:2;
  inset:0;
  padding:1px;
  border-radius:inherit;
  pointer-events:none;
  background:conic-gradient(
    from var(--dlens-reading-beam-angle,42deg),
    transparent 0 56%,
    var(--dlens-mode-accent-soft) 68%,
    var(--dlens-mode-accent) 74%,
    transparent 84%
  );
  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor;
  mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
  mask-composite:exclude;
  opacity:.72;
}
```

The ready card uses fixed `42deg`. If the analysis-status Product surface uses this variant while generating, animate only `--dlens-reading-beam-angle` with a single shared keyframe already owned by `motion.ts`; do not copy the mockup's multi-gradient CSS, `@property`, canvas orb, or second bloom pseudo-element.

In reduced motion:

```css
[data-dlens-control="true"] [data-product-reading-beam]::after{
  animation:none!important;
  --dlens-reading-beam-angle:42deg;
}
```

The reading content remains above the pseudo-element with the existing child `z-index:1`; the perimeter pseudo-element uses `pointer-events:none`.

- [ ] **Step 5: Lock Product card geometry to existing tokens**

The Product Reading card root must use:

```ts
glassCardStyle({
  gap: 12,
  padding: 16,
  boxSizing: "border-box",
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden",
  borderRadius: tokens.radius.cardLg,
  borderColor: tokens.color.atlasEdge,
  background: tokens.color.atlasPaper,
  boxShadow: tokens.shadow.atlasCard
})
```

Do not add local values for radius, background, edge, shadow, blur, or typography. Remove `overflow: "visible"` from the active full card where it permits the previous bleed.

- [ ] **Step 6: Run focused tests and build-size measurement**

Run:

```bash
npx tsx --test tests/components.test.tsx tests/motion-registry.test.ts tests/views.test.tsx
npm run typecheck
npm run build
npm run bundle:guard
```

Expected: all commands exit 0. If any bundle measurement exceeds the existing limit, remove more retired Product-only JSX/CSS/helpers; do not edit the budget.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/ui/components.tsx src/ui/motion.ts src/ui/ProductSignalViews.tsx \
  tests/components.test.tsx tests/motion-registry.test.ts tests/views.test.tsx
git commit -m "bug fix: contain Product reading light and remove interior sweep"
```

---

### Task 7: Integration Gates, Version Lock, and Real Chrome Acceptance

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `wxt.config.ts`
- Modify: `src/ui/version.ts`
- Modify: `tests/manifest-config.test.ts`
- Modify: `README.md`
- Modify: `docs/memory/latest-shared-context.md`
- Test: all tests and guards
- Runtime artifact: `output/chrome-mv3`

**Interfaces:**
- Consumes all prior tasks.
- Produces local source/build version `0.3.58` only after static integration and real-Chrome Product Reading acceptance are both satisfied.

- [ ] **Step 1: Run the complete static gate before versioning**

Run:

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
npm run bundle:guard
git diff --check
```

Expected:

- every command exits 0;
- tests report 0 failures;
- raw/gzip/brotli remain within the existing budget;
- no budget file changes;
- built manifest still shows the pre-release version until the real-Chrome check is complete.

If any command fails, write a failing regression test for the observed behavior before changing production code, fix the issue, rerun its focused test, then restart this complete gate.

- [ ] **Step 2: Reload the real extension and perform the first-open test**

Use Jason's Chrome `Default` profile:

1. open `chrome://extensions`;
2. reload the unpacked DLens extension from `output/chrome-mv3`;
3. reload the existing real Threads tab so its content script is fresh;
4. open DLens through the real extension action or in-page launcher;
5. reanalyze the Border Beam signal;
6. open the completed `try/watch` card for the first time.

Verify:

- the complete reading headline/body are already visible;
- no generate-reading button, proposal form, watch-guidance form, or nested deep-reading disclosure appears;
- the reading honestly states when video/repository/link contents were not inspected;
- review and Agent actions appear once;
- the reading card right edge remains inside the parent at normal and narrow popup widths;
- radius, paper gradient, edge, shadow, inset, and type rhythm visibly match the live `分析收件匣`, metric cards, and `分析完成，查看哪些 signal 值得行動` card;
- ready light remains on the perimeter and does not cross text;
- no title curve, small coloured rectangle, or misplaced nested card appears;
- paging between a full reading and compact park card preserves focus and scroll;
- reduced-motion mode freezes the light.

Capture screenshots for the first-open card, narrow containment, and reduced-motion state under `output/playwright/` using dated filenames. These are local evidence artifacts unless the user explicitly asks to track them.

- [ ] **Step 3: Bump the five locked version sites**

After real-Chrome acceptance succeeds, change all five from `0.3.57` to `0.3.58`:

```text
package.json
package-lock.json
wxt.config.ts manifest.version
src/ui/version.ts BUILD_VERSION
tests/manifest-config.test.ts expected version
```

Update the README header and `docs/memory/latest-shared-context.md` in place. Record:

- one-pass Product reading;
- removal of proposal/watch/second-reading UI;
- atomic analysis+reading storage publication;
- scoped perimeter beam and content-box overflow fix;
- static gate counts;
- exact real-Chrome profile/path and acceptance result;
- built manifest version and bundle measurements.

- [ ] **Step 4: Rebuild and rerun the complete release gate**

Run:

```bash
npx tsx --test tests/manifest-config.test.ts
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
npm run bundle:guard
git diff --check
node -e "const m=require('./output/chrome-mv3/manifest.json'); if(m.version!=='0.3.58') process.exit(1); console.log(m.name, m.version)"
```

Expected: every command exits 0 and the final line reports `DLens v3 0.3.58`.

- [ ] **Step 5: Commit Task 7**

```bash
git add package.json package-lock.json wxt.config.ts src/ui/version.ts \
  tests/manifest-config.test.ts README.md docs/memory/latest-shared-context.md
git commit -m "feature: release unified Product reading and remove duplicate surfaces"
```

- [ ] **Step 6: Generate the final review package**

Record the pre-implementation base commit before Task 1 and run:

```bash
/Users/tung/.codex/superpowers/skills/subagent-driven-development/scripts/review-package \
  <BASE_COMMIT> HEAD
```

Dispatch the printed package to a fresh whole-branch reviewer with:

- this plan;
- the design spec;
- final static gate evidence;
- real-Chrome screenshots and measured card/parent geometry;
- the note that untracked mockups/artifacts predated this package and were not modified.

Resolve every Critical/Important finding through a focused regression test, one fix agent, and a fresh re-review before reporting completion.

---

## Plan Self-Review

### Spec coverage

- First-open complete reading: Tasks 1, 3, and 4.
- One provider request: Tasks 1 and 4.
- Verdict remains program-owned: Task 1.
- Actionable-only reading eligibility: Tasks 1 and 2.
- Grounded refs and unseen-resource honesty: Task 1.
- Atomic storage and review preservation: Tasks 2 and 3.
- Legacy record retention and current-version freshness: Task 2.
- One visible card and no nested proposal/deep-reading UI: Task 4.
- Agent brief/packet continuity: Task 5.
- Perimeter beam, existing Product visual language, reduced motion, and 12px containment: Task 6.
- Bundle budget unchanged: Tasks 6 and 7.
- Five-site version lock, latest context, and real-Chrome proof: Task 7.

### Type consistency

- `ProductReading` uses `headline`, `body`, `supportRefs` in type, parser, storage, materialization, and UI.
- Projected `SignalReading` uses `headline`, existing `reading` body, `sourceRefs`, and `origin`.
- `productReading` is canonical generated content; `SignalReading` is its reviewable persisted projection.
- The Product Action path reads the projection and never reconstitutes a reading from legacy short fields.

### Execution sequence

Tasks are deliberately sequential because Task 1 defines the contract consumed by Task 2; Task 2 defines the persistence seam consumed by Task 3; Task 4 removes legacy commands and UI while introducing a neutral one-card surface that compiles independently; Task 5 carries the reading identity through briefs and exports; Task 6 adds the visual variant only after one-card ownership exists; Task 7 verifies and versions the integrated result.
