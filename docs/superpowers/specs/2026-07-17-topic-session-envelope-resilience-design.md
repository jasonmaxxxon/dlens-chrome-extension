# Topic Session and Audit Envelope Resilience Design

**Date:** 2026-07-17
**Status:** Approved
**Release target:** 0.3.49
**Scope:** Topic source-session UI, shared status rail, Topic Audit envelope resilience, and Google provider authentication transport

## 1. Outcome

Topic detail must keep one truthful, visible workflow at the top of the page:

`待爬取 -> 爬取／分析中 -> 已完成，可生成 -> Atlas 生成中 -> 成功或可重試的失敗`

The workflow does not start Atlas generation automatically. After source processing completes, the user explicitly chooses `用 N 篇重新生成 Atlas` so an API charge is never hidden behind a crawl action.

The same release also prevents a syntactically empty, truncated, or schema-invalid provider response from immediately failing a whole Topic Audit run. Only the failing audit stage may retry once. The last complete Atlas remains visible until a new complete report is atomically published.

## 2. Verified 0.3.48 Baseline

### 2.1 Topic Audit storage serialization is already shipped

Commit `b7d3696` already introduced one recoverable `topicAuditMutationQueue` shared by evidence, memos, reports, episodes, cross-topic calibrations, report publication, and clear operations. `tests/topic-audit-storage.test.ts` already proves:

- concurrent whole-map RMW saves serialize across every Topic Audit storage family;
- the queue recovers after a rejected write;
- save and clear obey call order;
- report/episode publication and clear obey call order.

Therefore this release must not add a second queue. Storage serialization is **work item 0: a precondition and regression gate**. New run-status writes and retry checkpoints must use the existing queue, and a new regression must prove a retried stage cannot clobber another topic's evidence or memos.

### 2.2 Current bundle headroom

The verified 0.3.48 `output/chrome-mv3/content-scripts/threads.js` baseline is:

| Metric | Current | Limit | Remaining |
| --- | ---: | ---: | ---: |
| raw | 908,871 B | 910,000 B | 1,129 B |
| gzip -9 | 254,079 B | 256,000 B | 1,921 B |
| brotli | 202,359 B | 203,000 B | 641 B |

The brotli ceiling is the tightest compressed constraint even though the raw headroom is the number most visible in prior reviews.

### 2.3 Reproduction evidence

The current existing-Atlas branch renders `topicSourceFeed` after the complete Atlas and only while `auditEvidence.length === 0 || unanalyzedItemIds.length > 0`. Clicking `開始爬取` changes those items from saved/failed to queued, making `unanalyzedItemIds` empty. The parent gate then removes the entire source feed, including the already implemented spinner and processing bar, while the outer Topic list continues to show truthful processing counts.

The reported regeneration failure occurs only after the user manually clicks `重新生成`. `generateTopicAuditEnvelope` currently collapses every invalid response into `Invalid topic audit envelope payload`; it neither classifies the failure nor retries the failing semantic stage.

## 3. Scope and Non-goals

### In scope

1. Keep one topic-scoped source-session card above the previous Atlas.
2. Give the shared folder status rail truthful active motion and a hover/focus progress disclosure.
3. Hydrate card state from reconciled/persisted owners rather than treating component-local flags as truth.
4. Classify Topic Audit envelope failures as `empty`, `truncated`, or `schema_mismatch`.
5. Use provider-native structured output for Google and OpenAI Topic Audit envelopes.
6. Retry an invalid envelope once at the failing stage only.
7. Persist enough audit-run status to survive popup close/reopen and reject expired phantom runs.
8. Move every Gemini API key in `src/compare/provider.ts` from the URL query to the `x-goog-api-key` request header.
9. Ship and verify 0.3.49.

### Explicit non-goals

- no automatic Atlas generation after crawling;
- no autonomous Threads discovery or Topic relevance gate;
- no global provider semaphore, rate-budget scheduler, or new ingest backend endpoint;
- no persisted percentage or ETA for LLM generation;
- no Claude tool-use/schema implementation in this release;
- no broad Topic visual redesign;
- no bundle-budget increase without a separate explicit decision;
- no parser relaxation that publishes incomplete prose as a valid Atlas.

## 4. Topic Source-session Card

### 4.1 Placement and ownership

One compact card appears directly below the Topic breadcrumb/action row and before any previous-version notice or Atlas content. The complete source list remains in its current lower section for inspection and deletion, but its crawl CTA and processing card move to the top owner.

The top card replaces, rather than duplicates:

- the amber `目前顯示上一版` banner;
- the second `重新生成` entry while a stale/source-update session is active;
- the processing card currently trapped inside the bottom source feed.

`審查報告` remains available. When the current Atlas is fresh and no source work is pending, the session card is absent and the compact manual `重新生成` action may return.

### 4.2 Pure state contract

The view receives one derived state rather than independently checking several arrays:

```ts
interface TopicGenerationFailure {
  stage: TopicAuditStageName;
  failureKind: TopicAuditRunFailureKind;
}

type TopicSourceSessionState =
  | { kind: "needs_crawl"; scope: "topic"; total: number; ready: number; pending: number; failed: number; previousGenerationFailure?: TopicGenerationFailure }
  | { kind: "processing"; scope: "topic"; total: number; ready: number; queued: number; crawling: number; analyzing: number; previousGenerationFailure?: TopicGenerationFailure }
  | { kind: "ready_to_generate"; scope: "topic"; total: number; ready: number; addedSinceReport: number }
  | { kind: "generating"; scope: "topic"; total: number; ready: number }
  | { kind: "generation_failed"; scope: "topic"; total: number; ready: number; stage: TopicAuditStageName; failureKind: TopicAuditRunFailureKind }
  | { kind: "current"; scope: "topic"; total: number; ready: number };
```

Precedence is deterministic:

1. persisted audit run `running`;
2. reconciled source processing;
3. source items requiring crawl/retry;
4. persisted audit run `failed` when no source work is pending;
5. stale/missing Atlas with all current sources ready;
6. current Atlas.

An in-flight paid generation is therefore never hidden when a new source arrives or starts processing. The `generating` card continues to show the current topic `ready/total` counts, including any new source delta.

`needs_crawl` deliberately precedes a prior terminal generation failure: regenerating before the newly added sources are ready would spend another provider call on an already incomplete source set. The prior failure's real stage/kind remains visible as secondary text on `needs_crawl` and `processing`; it is not discarded. Once source work settles, the normal `generation_failed` state becomes primary again.

A source failure is never counted as ready. It remains an explicit retryable count.

### 4.3 Visible states

| State | Required UI |
| --- | --- |
| `needs_crawl` | `議題 · X/Y 已完成`, pending/failed counts, `開始爬取 N 篇` or `重試 N 篇` |
| `processing` | spinner, `議題 · X/Y 已完成`, queued/crawling/analyzing counts, determinate source bar |
| `ready_to_generate` | success mark, `議題 · Y/Y 已完成`, `用 Y 篇重新生成 Atlas` |
| `generating` | `正在重新生成 Atlas`, spinner and indeterminate bar; previous Atlas stays mounted |
| `generation_failed` | localized failure kind and exact failing stage, old Atlas retained, `重試生成` |
| `current` | no session card; normal fresh Atlas controls |

The source bar is determinate because source counts are real. Atlas generation remains indeterminate because the current message channel does not provide honest continuous percentage completion. A stage name may be used for failure diagnosis or popup rehydration, but not converted into a fabricated `Pn/6` progress percentage.

## 5. Shared Folder Status Rail

The masthead rail remains folder-scoped. Its visible count must say `資料夾 X/Y ready`; the Topic card must say `議題 X/Y 已完成`. A folder total such as `19/20` must never appear as if it were the active topic's `19/19`.

When backend work is active:

- the work indicator uses the existing shared spin/pulse keyframes;
- hover and keyboard focus reveal the backend work label, folder count, and a determinate ready/total bar;
- error/retry states retain their existing warning/danger semantics.

When idle, no motion runs. All new spin/pulse behavior is covered by the existing `[data-dlens-control="true"]` `prefers-reduced-motion: reduce` safety net and receives an explicit regression test. The disclosure must also be reachable by keyboard and represented in `aria-label`; native `title` alone is insufficient.

Every card and rail color, radius, shadow, spacing, typography, and motion value must come from `tokens.ts` or the existing shared motion registry. This slice adds no literal visual system and no new visual direction.

## 6. State Reconciliation and Popup Reopen

There are two separate truth owners and the implementation must not conflate them.

### 6.1 Source crawl state

Queued/crawling/analyzing/ready/failed counts come only from the active folder's reconciled `SessionItem` records. Popup open already triggers `session/refresh-all`, and the processing coordinator continues to reconcile terminal backend state. The topic card derives from those records and does not keep a second local copy of source progress.

### 6.2 Atlas generation state

Topic Audit generation runs in the extension background, not in `dlens-ingest`. The existing `useTopicAudit` request reconciler prevents late or target-mismatched responses from updating the wrong topic, but it is not a durable run ledger and cannot by itself rehydrate after a content-script remount.

Add a small `dlens:v1:topic-audit-runs` map, serialized by the existing Topic Audit mutation queue:

```ts
type TopicAuditRunFailureKind =
  | TopicAuditEnvelopeFailureKind
  | "provider_error"
  | "timeout"
  | "interrupted";

interface TopicAuditRunStatus {
  sessionId: string;
  topicId: string;
  requestId: string;
  state: "running" | "failed";
  stage: TopicAuditStageName;
  failureKind?: TopicAuditRunFailureKind;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
}
```

Migration stance: `dlens:v1:topic-audit-runs` is an explicitly **disposable leased coordination cache**, not durable user/domain data. It is intentionally excluded from the current migration registry. Missing, malformed, unknown-version, or manually cleared payloads normalize to an empty map; the lease-expiry and request-ownership rules below make discarding the entire map safe without touching evidence, memos, reports, or episodes. Tests must lock this declared exclusion so a future migration-registry completeness repair can distinguish disposable caches from accidentally unregistered durable families.

Rules:

1. `topic/audit/run` persists `running` before the first provider stage.
2. The stage field updates at a real stage boundary, never on a timer. Each real stage/attempt boundary renews `expiresAt` to 15 minutes after `updatedAt`.
3. Checkpoint and publication writes verify that the same `requestId` still owns a non-expired run. A superseded or interrupted run cannot publish late output.
4. Successful atomic publication removes the run entry.
5. Terminal failure persists the typed stage/failure kind.
6. `topic/audit/get` returns the run entry with evidence/memos/report and serially reconciles an expired `running` entry to `interrupted`.
7. `useTopicAudit` hydrates that entry through its existing topic-scoped request-reconcile lane; local state may provide immediate optimism but cannot override hydrated truth.
8. A service-worker restart therefore cannot leave a permanent spinner or later publish output from an expired owner.

No new ingest backend route or polling loop is introduced.

## 7. Envelope Contract and Failure Classification

### 7.1 One shared result type

The parser boundary returns a discriminated result:

```ts
type TopicAuditEnvelopeFailureKind = "empty" | "truncated" | "schema_mismatch";

type TopicAuditEnvelopeParseResult =
  | { ok: true; envelope: AuditPromptEnvelope }
  | {
      ok: false;
      kind: TopicAuditEnvelopeFailureKind;
      finishReason?: string;
      outputChars: number;
    };
```

Classification is fixed:

- `empty`: trimmed model text is empty;
- `truncated`: provider finish metadata reports a token/length stop, or non-empty JSON is structurally incomplete at its tail;
- `schema_mismatch`: the response is non-empty and not positively truncated, but is not a valid envelope object with non-empty `prose` and valid required field types. This includes other malformed JSON.

The same enum drives telemetry, persisted run status, and localized UI copy. Raw provider strings are not rendered to the user.

### 7.2 Structured-output provider scope

Only two providers gain native Topic Audit schema wiring in 0.3.49:

- **Google:** `responseMimeType: "application/json"` plus `responseJsonSchema`.
- **OpenAI:** `response_format: { type: "json_schema", ... }` using the same logical envelope contract.

The shared schema includes required core fields (`prose`, `evidenceRefs`, and `caveats`) plus the existing optional stage-specific hints. Deterministic parsing, reference allow-listing, and normalization remain mandatory after provider validation.

Claude keeps the existing JSON-only prompt and deterministic parser. It participates in the same failure classification and bounded retry but receives no new tool definition or provider-specific schema implementation.

### 7.3 Exactly one semantic retry

Network/status retries in `fetchWithRetry` remain unchanged. The new envelope retry occurs only after an HTTP-success response fails envelope validation.

For each semantic stage:

1. Attempt 1 uses the existing stage prompt.
2. On `empty` or `schema_mismatch`, attempt 2 repeats the same evidence prompt, appending a constant repair instruction that demands one complete envelope and names the required fields. It does not include the malformed raw response.
3. On `truncated`, attempt 2 uses the same evidence prompt plus the repair instruction, asks for more concise prose, and increases only that attempt's output ceiling by 1.5x (`2200 -> 3300`; final `3200 -> 4800`).
4. Attempt 2 uses the same provider, model, temperature, evidence allow-list, and input hash.
5. If attempt 2 fails, throw a typed error carrying the actual stage and second failure kind.

Checkpointed prior stages are reused. The retry must not restart the full pipeline or publish a partial report. P0.5/P1 per-signal catches occur only after the bounded envelope retry has been exhausted.

### 7.4 Telemetry and UI copy

Each envelope attempt emits metadata only:

- provider and model;
- topic-audit stage;
- attempt `1 | 2`;
- output-token ceiling;
- finish reason when supplied;
- output character count;
- failure kind and terminal/retrying result.

API keys, prompts, raw model output, evidence text, and post content are excluded.

User-facing copy is shared by failure kind:

- `empty`: `模型沒有回傳可用內容，已重試一次。`
- `truncated`: `生成內容過長而未完整結束，已重試一次。`
- `schema_mismatch`: `模型回傳格式不完整，已重試一次。`
- expired run: `上次生成已中斷，舊版 Atlas 仍保留。`

The card additionally names the real stage in compact form. Developer-level details remain in QA trace metadata.

## 8. Google API-key Transport

All eight Gemini `generateContent` callsites currently place the API key in `?key=...`. This release replaces them with one request helper:

- endpoint URL contains no key query parameter;
- headers include `Content-Type: application/json` and `x-goog-api-key`;
- existing provider timeout/retry tracing remains unchanged;
- tests assert that a sentinel key appears in the header and nowhere in the request URL or emitted trace metadata.

This is the current authentication contract documented by the official Gemini API reference: <https://ai.google.dev/api>.

Changing only the Topic Audit callsite would leave seven equivalent leaks in the same module, so the transport fix applies to every Gemini call in `src/compare/provider.ts`.

## 9. Bundle Budget

Provider, background, and storage paths are expected to tree-shake out of `threads.js` except for deliberately shared exports; the constrained content bundle should therefore be affected primarily by the Topic card and status rail. The measured production build, not that expectation, is authoritative.

Implementation order must make the removal credit measurable:

1. record the 0.3.48 baseline above;
2. remove the stale banner, duplicate regeneration entry, and duplicate bottom processing owner; build and record the released bytes;
3. add the unified card and rail disclosure; build and record the net delta.

Pre-implementation estimate:

| Change | Raw estimate | gzip estimate | brotli estimate |
| --- | ---: | ---: | ---: |
| Removed duplicate UI | -450 to -750 B | -120 to -250 B | -90 to -180 B |
| Unified card + rail disclosure | +850 to +1,350 B | +200 to +430 B | +130 to +320 B |
| **Expected net** | **+100 to +900 B** | **-50 to +310 B** | **-50 to +230 B** |

The default decision is **no budget change**. If the measured final build exceeds any current headroom—raw `+1,129 B`, gzip `+1,921 B`, or brotli `+641 B`—implementation stops before editing `scripts/ui-bundle-budget.json`. Raising a limit requires an explicit user decision with the measured removal, addition, and net numbers.

## 10. Expected Code Surfaces

Primary production surfaces:

- `src/ui/TopicDetailView.tsx`: remove duplicate owners and render the top session card;
- `src/viewmodel/topic-detail.ts`: derive the pure topic session state if the existing viewmodel boundary can own it without storage/runtime reads;
- `src/ui/components.tsx`: active/focusable shared status-rail disclosure;
- `src/ui/useTopicAudit.ts`: hydrate persisted run status and preserve existing request reconciliation;
- `src/compare/topic-audit-prompts.ts`: classified envelope parser;
- `src/compare/provider.ts`: provider finish metadata, Google/OpenAI structured output, bounded envelope retry, and Google header transport;
- `src/state/topic-audit-storage.ts`: run-status map on the existing serial queue;
- `src/state/topic-audit-handlers.ts`: real stage-boundary run status and typed terminal failure;
- `src/state/messages.ts` and `entrypoints/background.ts`: run-status response contract and stage-aware generator wiring.

Tests should extend existing files rather than create parallel harnesses unless a pure contract deserves its own focused file.

## 11. Test-first Acceptance

Implementation follows red-green-refactor. Required regressions:

1. Two concurrent evidence/memo saves remain lossless while one topic's stage performs an envelope retry.
2. A rejected storage write does not poison subsequent run-status or memo writes.
3. The Topic session card renders before the previous Atlas.
4. Clicking crawl and transitioning items to queued keeps the card mounted when `unanalyzedItemIds` becomes empty.
5. The processing card shows real topic counts and never substitutes folder totals.
6. Completion transitions to `用 N 篇重新生成 Atlas` without invoking an audit request automatically.
7. A stale Atlas has one regeneration owner, not the old banner plus duplicate buttons.
8. Folder rail hover/focus shows folder scope and a determinate bar; active motion is absent while idle.
9. Reduced-motion CSS neutralizes the new rail and card animation.
10. Popup reopen rehydrates source counts from reconciled session items and audit generation from persisted run status, not a fresh component-local default.
11. An expired run status becomes an interrupted failure rather than an endless spinner.
12. Parser fixtures independently classify empty, explicit max-token truncation, structurally incomplete JSON, and schema mismatch.
13. Google and OpenAI Topic Audit requests carry the native schema; Claude does not acquire a new schema/tool path.
14. Empty/schema-invalid responses retry once with the same semantic prompt plus the fixed repair hint.
15. Truncated responses retry once with the fixed hint and 1.5x output ceiling.
16. A valid first response does not retry; an invalid second response stops after exactly two semantic attempts.
17. Only the failed stage repeats and prior stage checkpoints remain reusable.
18. Failure telemetry and UI use the same typed kind without storing raw output.
19. Every Google provider request uses `x-goog-api-key`; no request URL or trace contains the sentinel key.
20. A running paid audit remains the primary card state if a new source arrives; its updated topic counts remain visible.
21. Source work may become primary after a terminal generation failure only when the prior stage/kind remains visible as secondary context.
22. Missing or malformed disposable run-cache storage normalizes safely without clearing durable Topic Audit artifacts.
23. Existing publication compatibility and atomic report/episode publication remain green.

## 12. Verification and Release Gate

Static gate:

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npm run storage:migrate-fixtures
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run qa:harness:fixture
npm run build
npm run bundle:guard
git diff --check
```

Release metadata then moves to 0.3.49 across the five lock sites:

1. `package.json`
2. `package-lock.json`
3. `wxt.config.ts`
4. `src/ui/version.ts`
5. `tests/manifest-config.test.ts`

`README.md` and `docs/memory/latest-shared-context.md` receive the user-visible release truth. Both `.output/chrome-mv3/manifest.json` and the mirrored `output/chrome-mv3/manifest.json` must report 0.3.49.

## 13. Real Chrome Acceptance

Use Computer Use against the user's actual Default Chrome profile and the unpacked `output/chrome-mv3` extension. Do not substitute Playwright, AppleScript, or CDP evidence.

1. Reload the unpacked extension and confirm the popup displays `v.0.3.49`.
2. Open a Topic with a previous Atlas and unprocessed new sources.
3. Confirm the session card appears before the previous Atlas and folder/topic scope labels differ correctly.
4. Start crawling; confirm the Topic card remains mounted, counts advance, and the folder rail animates only while work is active.
5. Hover and keyboard-focus the rail; confirm the folder progress disclosure is readable.
6. Close and reopen the popup during source work; confirm state rehydrates from reconciled items.
7. After completion, confirm the card becomes `用 N 篇重新生成 Atlas` and no generation starts automatically.
8. Trigger one real manual regeneration. Confirm the previous Atlas stays visible during the run and the run survives popup close/reopen.
9. Confirm success publishes the replacement Atlas, or a terminal provider failure remains retryable with typed stage/kind rather than raw `Invalid topic audit envelope payload`.
10. Inspect QA trace metadata to confirm at most one semantic envelope retry and no API key, prompt, or raw evidence leakage.

The release is not runtime-green until this Chrome pass is recorded. A deterministic malformed-response test proves the retry branch; live QA is not required to coerce a real provider into failing.

## 14. Implementation Order

1. Lock the existing storage queue regressions and add the run-status storage contract.
2. Add classified parser results, typed errors, and exactly-one-stage retry tests.
3. At the start of provider work, use the configured Google provider helper for one minimal real call to verify that `responseJsonSchema` is accepted by the currently pinned `gemini-3.1-flash-lite`; keep the key out of the command line, URL, and trace. If the model rejects the field, stop and revise this spec rather than silently falling back. Then add Google/OpenAI structured output and move every Google key to the header.
4. Remove duplicate Topic UI and measure bundle credit.
5. Add the unified Topic card and folder rail disclosure under the remaining budget.
6. Run the complete static gate.
7. Bump the five version locks, update release truth, rebuild and mirror MV3.
8. Run real Chrome acceptance with Computer Use.

Each step must be independently reviewable. The release must not hide a bundle-limit change, a second storage queue, or an unrelated provider scheduler inside the UI fix.
