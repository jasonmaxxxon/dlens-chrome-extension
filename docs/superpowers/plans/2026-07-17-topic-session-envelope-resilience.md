# Topic Session and Audit Envelope Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Topic crawl/generation state visible and recoverable, retry one invalid Topic Audit stage safely, remove Gemini keys from URLs, and ship a real-Chrome-verified 0.3.49.

**Architecture:** Reuse the existing Topic Audit mutation queue and add a disposable leased run-status map with request ownership. A shared envelope contract classifies provider output and drives Google/OpenAI structured output, one bounded semantic retry, telemetry, persisted failure state, and UI copy. A pure viewmodel derives one topic-scoped session state; one top card and one folder-scoped status disclosure render that truth without duplicate controls.

**Tech Stack:** TypeScript 5.8, React 19, WXT 0.20 MV3, Chrome `storage.local`, Node test runner via `tsx`, real Default Chrome profile via Computer Use.

## Global Constraints

- Start from local `main` commit `48c9dce`; execution must first use `superpowers:using-git-worktrees` and preserve every unrelated untracked file in the main checkout.
- Approved design: `docs/superpowers/specs/2026-07-17-topic-session-envelope-resilience-design.md`.
- Do not add a second Topic Audit mutation queue. Evidence, memos, reports, episodes, publication, calibrations, clear, and run-status mutations share the existing recoverable queue.
- `dlens:v1:topic-audit-runs` is a disposable leased coordination cache, intentionally outside the current migration registry. Missing, malformed, unknown-version, or cleared payloads normalize safely without touching durable audit artifacts.
- Card priority is `running audit > source processing > source needs crawl > terminal audit failure > ready to generate > current`. A paid run is never hidden. Source work may precede a previous terminal failure only while preserving that failure's stage/kind as secondary text.
- Source crawl state comes from reconciled `SessionItem` records. Audit run state comes from the persisted run cache and the existing topic-scoped request reconciler; component-local state is optimism only.
- Atlas generation is manual after crawl completion. Never auto-call a provider.
- Envelope failures are exactly `empty | truncated | schema_mismatch`; run failures additionally allow `provider_error | timeout | interrupted`.
- Exactly one semantic retry is allowed per failed stage. HTTP retry behavior remains separate and unchanged.
- `empty`/`schema_mismatch` repeat the same semantic prompt plus a fixed repair hint at the same token ceiling. `truncated` repeats with the same hint and a 1.5x ceiling (`2200 -> 3300`, final `3200 -> 4800`). Never include malformed raw output in the retry prompt.
- Native Topic Audit structured output is Google + OpenAI only. Claude keeps JSON prompt + deterministic parser + the same one-retry policy; do not add Claude tools/schema.
- Every Gemini `generateContent` call uses `x-goog-api-key`; no key may appear in a URL, command line, trace, prompt, artifact, or test snapshot.
- UI visual values come only from `tokens.ts`, shared primitives, and the shared motion registry. Spinner/pulse must obey `prefers-reduced-motion`.
- Folder rail counts are visibly labelled `資料夾`; Topic card counts are visibly labelled `議題`.
- Content-bundle baseline is raw `908,871 / 910,000`, gzip `254,079 / 256,000`, brotli `202,359 / 203,000`. Do not edit `scripts/ui-bundle-budget.json`. Stop for an explicit decision if any limit is exceeded.
- Keep the prior Atlas mounted until a complete replacement report + episodes publish atomically.
- Real-Chrome acceptance must use Computer Use. Do not substitute Playwright, AppleScript, or CDP.

## File and Interface Map

- Create `src/compare/topic-audit-envelope-contract.ts`: shared failure types, schema constant, repair suffix, token-budget rule, typed terminal error, and UI-copy mapper.
- Modify `src/compare/topic-audit-prompts.ts`: classified parse result while retaining the existing nullable compatibility wrapper.
- Modify `src/compare/provider.ts`: provider response metadata, Google header helper, Google/OpenAI Topic schema, one semantic retry, and trace metadata.
- Modify `src/state/topic-audit-storage.ts`: disposable run map and atomic owner-checked checkpoint/publication operations on the existing queue.
- Modify `src/state/topic-audit-handlers.ts`: begin/advance/fail/finish run ownership around real audit stages.
- Modify `src/state/messages.ts` and `entrypoints/background.ts`: expose run status and wire stage/attempt callbacks.
- Modify `src/ui/useTopicAudit.ts`: hydrate persisted run truth and reconcile late responses.
- Modify `src/viewmodel/topic-detail.ts`: pure `deriveTopicSourceSessionState` with approved priority.
- Create `src/ui/TopicSourceSessionCard.tsx`: one token-only Topic session card.
- Modify `src/ui/TopicDetailView.tsx`: mount the top owner, remove stale/duplicate owners, retain the lower source list.
- Modify `src/ui/components.tsx`: folder rail active indicator and hover/focus disclosure.
- Extend the existing focused tests named in each task; do not create a second UI or provider harness.

---

### Task 1: Disposable Audit-run Storage and Ownership

**Files:**
- Create: `src/compare/topic-audit-envelope-contract.ts`
- Modify: `src/state/topic-audit-storage.ts:4-253`
- Modify: `tests/topic-audit-storage.test.ts:1-590`
- Modify: `tests/storage-migrations.test.ts:1-60`

**Interfaces:**
- Produces `TopicAuditEnvelopeFailureKind`, `TopicAuditRunFailureKind`, `TopicAuditRunStatus`, `TopicAuditRunOwner`, and `TOPIC_AUDIT_RUN_LEASE_MS`.
- Produces `beginTopicAuditRun`, `advanceTopicAuditRun`, `failTopicAuditRun`, `loadTopicAuditRun`, `saveTopicAuditMemosForRun`, and owner-aware `publishTopicAuditReportAndEpisodes`.
- Later tasks consume these exact names; no second queue or nested enqueue is permitted.

- [ ] **Step 1: Add RED storage tests for disposable normalization, lease expiry, ownership, and queue recovery**

Append tests using the existing `MemoryStorage` and `ControlledInterleavingStorage` helpers. Add this one-shot failure helper beside them:

```ts
class RejectOnceStorage extends MemoryStorage {
  private shouldReject = true;
  constructor(private readonly rejectedKey: string) { super(); }
  override async set(values: Record<string, unknown>): Promise<void> {
    if (this.shouldReject && this.rejectedKey in values) {
      this.shouldReject = false;
      throw new Error("synthetic run-cache write failure");
    }
    await super.set(values);
  }
}
```

Then add:

```ts
test("topic audit run cache normalizes malformed disposable payload without touching durable artifacts", async () => {
  const storage = new MemoryStorage();
  storage.values[TOPIC_AUDIT_RUNS_STORAGE_KEY] = ["not-a-map"];
  storage.values[TOPIC_AUDIT_MEMOS_STORAGE_KEY] = { "topic-1": makeMemoBundle("topic-1") };

  assert.equal(await loadTopicAuditRun(storage, "topic-1", "2026-07-17T10:00:00.000Z"), null);
  assert.deepEqual(await loadTopicAuditMemos(storage, "topic-1"), makeMemoBundle("topic-1"));
});

test("topic audit run cache discards an unknown disposable schema version", async () => {
  const storage = new MemoryStorage();
  storage.values[TOPIC_AUDIT_RUNS_STORAGE_KEY] = {
    schemaVersion: 2,
    runs: { "topic-1": makeRunStatus("future-request") }
  };
  assert.equal(await loadTopicAuditRun(storage, "topic-1", "2026-07-17T10:00:00.000Z"), null);
});

test("topic audit run lease expires to interrupted and blocks late owner writes", async () => {
  const storage = new MemoryStorage();
  await beginTopicAuditRun(storage, {
    sessionId: "session-1",
    topicId: "topic-1",
    requestId: "request-old",
    state: "running",
    stage: "narrative",
    startedAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-17T09:00:00.000Z",
    expiresAt: "2026-07-17T09:15:00.000Z"
  });

  const expired = await loadTopicAuditRun(storage, "topic-1", "2026-07-17T09:16:00.000Z");
  assert.equal(expired?.state, "failed");
  assert.equal(expired?.failureKind, "interrupted");
  await assert.rejects(
    () => saveTopicAuditMemosForRun(storage, { topicId: "topic-1", requestId: "request-old", now: "2026-07-17T09:16:01.000Z" }, makeMemoBundle("topic-1")),
    /no longer owns/i
  );
});

test("a newer topic audit request prevents an older request from publishing late", async () => {
  const storage = new MemoryStorage();
  await beginTopicAuditRun(storage, makeRunStatus("request-old"));
  await beginTopicAuditRun(storage, makeRunStatus("request-new"));

  await assert.rejects(
    () => publishTopicAuditReportAndEpisodes(storage, makeReportForEpisode(makeEpisode(1)), [makeEpisode(1)], {
      topicId: "topic-1",
      requestId: "request-old",
      now: "2026-07-17T10:01:00.000Z"
    }),
    /no longer owns/i
  );
  assert.equal(await loadTopicAuditReport(storage, "topic-1"), null);
});

test("a rejected run-cache write does not poison the shared mutation queue", async () => {
  const storage = new RejectOnceStorage(TOPIC_AUDIT_RUNS_STORAGE_KEY);
  await assert.rejects(() => beginTopicAuditRun(storage, makeRunStatus("request-fail")));
  await saveTopicAuditMemos(storage, makeMemoBundle("topic-2"));
  assert.ok(await loadTopicAuditMemos(storage, "topic-2"));
});
```

In `tests/storage-migrations.test.ts`, add an explicit contract test that `STORAGE_MIGRATIONS.map(({ key }) => key)` does not contain `TOPIC_AUDIT_RUNS_STORAGE_KEY`, with the assertion message `topic-audit-runs is a disposable leased cache, not an unregistered durable family`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test tests/topic-audit-storage.test.ts tests/storage-migrations.test.ts
```

Expected: FAIL because the run key/types/functions do not exist.

- [ ] **Step 3: Create the shared failure/run contract**

Create `src/compare/topic-audit-envelope-contract.ts` with these exact public types:

```ts
import type { TopicAuditStageName } from "./topic-audit.ts";

export type TopicAuditEnvelopeFailureKind = "empty" | "truncated" | "schema_mismatch";
export type TopicAuditRunFailureKind = TopicAuditEnvelopeFailureKind | "provider_error" | "timeout" | "interrupted";
export const TOPIC_AUDIT_RUN_LEASE_MS = 15 * 60_000;

export interface TopicAuditRunStatus {
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

export interface TopicAuditRunOwner {
  topicId: string;
  requestId: string;
  now: string;
}

export function nextTopicAuditRunExpiry(now: string): string {
  return new Date(Date.parse(now) + TOPIC_AUDIT_RUN_LEASE_MS).toISOString();
}
```

- [ ] **Step 4: Add run-map operations to the existing storage queue**

Add `TOPIC_AUDIT_RUNS_STORAGE_KEY = "dlens:v1:topic-audit-runs"`. Store the disposable map in this private self-describing envelope so “unknown version” is testable without registering a durable migration:

```ts
interface TopicAuditRunCacheV1 {
  schemaVersion: 1;
  runs: Record<string, TopicAuditRunStatus>;
}
```

`readTopicAuditRunCache` returns `{}` unless the payload is a non-array object with `schemaVersion === 1` and an object `runs`; it filters invalid status entries rather than trusting casts. `writeTopicAuditRunCache` always writes `{ schemaVersion: 1, runs }`. Implement every mutation inside `enqueueTopicAuditMutation`; use a private owner assertion before guarded writes:

```ts
function assertRunOwner(status: TopicAuditRunStatus | null, owner: TopicAuditRunOwner): TopicAuditRunStatus {
  if (!status || status.requestId !== owner.requestId || status.state !== "running" || Date.parse(status.expiresAt) <= Date.parse(owner.now)) {
    throw new Error(`Topic audit request ${owner.requestId} no longer owns ${owner.topicId}`);
  }
  return status;
}

export async function beginTopicAuditRun(storageArea: StorageAreaLike, status: TopicAuditRunStatus): Promise<void> {
  await enqueueTopicAuditMutation(async () => {
    const runs = await readTopicAuditRunCache(storageArea);
    await writeTopicAuditRunCache(storageArea, { ...runs, [status.topicId]: status });
  });
}

export async function advanceTopicAuditRun(
  storageArea: StorageAreaLike,
  owner: TopicAuditRunOwner,
  stage: TopicAuditStageName
): Promise<TopicAuditRunStatus> {
  return enqueueTopicAuditMutation(async () => {
    const runs = await readTopicAuditRunCache(storageArea);
    const current = assertRunOwner(runs[owner.topicId] ?? null, owner);
    const next = { ...current, stage, updatedAt: owner.now, expiresAt: nextTopicAuditRunExpiry(owner.now) };
    await writeTopicAuditRunCache(storageArea, { ...runs, [owner.topicId]: next });
    return next;
  });
}
```

Implement `failTopicAuditRun`, `loadTopicAuditRun`, and `saveTopicAuditMemosForRun` with the same owner check. `loadTopicAuditRun` converts an expired running entry to `state:"failed", failureKind:"interrupted"` in the same queued RMW. Treat a non-object run map or invalid entry as empty disposable state.

- [ ] **Step 5: Make publication/clear atomic with run state**

Extend `publishTopicAuditReportAndEpisodes` with optional `owner?: TopicAuditRunOwner`. When supplied, read the run cache in the same queued operation, assert ownership, delete that topic's run entry, and write reports + episodes + `{ schemaVersion:1, runs:nextRuns }` in one `storageArea.set`. Extend `clearTopicAuditStorageTopic` to delete the run entry and write the same v1 envelope in the existing aggregate write without touching calibration or unrelated keys.

- [ ] **Step 6: Run focused verification**

Run:

```bash
npx tsx --test tests/topic-audit-storage.test.ts tests/storage-migrations.test.ts
npm run typecheck
npm run storage:seam-guard
git diff --check
```

Expected: all pass; existing publication remains one storage write and the queue still recovers after rejection.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/compare/topic-audit-envelope-contract.ts src/state/topic-audit-storage.ts tests/topic-audit-storage.test.ts tests/storage-migrations.test.ts
git commit -m "bug fix: persist topic audit run ownership"
```

---

### Task 2: Classified Envelope Parser

**Files:**
- Modify: `src/compare/topic-audit-prompts.ts:116-182,388-445`
- Modify: `src/compare/topic-audit-envelope-contract.ts`
- Modify: `tests/topic-audit-prompts.test.ts:313-445`

**Interfaces:**
- Consumes `TopicAuditEnvelopeFailureKind` from Task 1.
- Produces `TopicAuditEnvelopeParseResult`, `TopicAuditEnvelopeResponseMeta`, `parseAuditPromptEnvelopeResult`, and the existing compatibility function `parseAuditPromptEnvelopeResponse`.
- Task 3 consumes the classified result; callers that still need nullable parsing remain source-compatible.

- [ ] **Step 1: Write RED classification fixtures**

Add:

```ts
test("parseAuditPromptEnvelopeResult classifies empty, truncated, and schema mismatch", () => {
  assert.deepEqual(parseAuditPromptEnvelopeResult("   "), {
    ok: false,
    kind: "empty",
    outputChars: 0
  });

  assert.deepEqual(parseAuditPromptEnvelopeResult('{"prose":"未完', undefined, { finishReason: "MAX_TOKENS" }), {
    ok: false,
    kind: "truncated",
    finishReason: "MAX_TOKENS",
    outputChars: 13
  });

  assert.equal(parseAuditPromptEnvelopeResult('{"prose":"未完').ok, false);
  assert.equal((parseAuditPromptEnvelopeResult('{"prose":"未完') as { kind: string }).kind, "truncated");

  assert.deepEqual(parseAuditPromptEnvelopeResult('{"evidenceRefs":[],"caveats":[]}'), {
    ok: false,
    kind: "schema_mismatch",
    outputChars: 33
  });
});

test("nullable audit parser remains compatible with valid aliases", () => {
  const raw = '{"memo":"有效判讀","evidence_refs":[],"caveats":[]}';
  assert.equal(parseAuditPromptEnvelopeResult(raw).ok, true);
  assert.equal(parseAuditPromptEnvelopeResponse(raw)?.prose, "有效判讀");
});
```

Use `raw.length` for expected `outputChars` rather than hand-maintaining a number if the literal changes.

- [ ] **Step 2: Run the parser test and verify RED**

```bash
npx tsx --test tests/topic-audit-prompts.test.ts
```

Expected: FAIL because `parseAuditPromptEnvelopeResult` is missing.

- [ ] **Step 3: Add the classified result types**

Append to the shared contract:

```ts
import type { AuditPromptEnvelope } from "./topic-audit-prompts.ts";

export interface TopicAuditEnvelopeResponseMeta {
  finishReason?: string;
}

export type TopicAuditEnvelopeParseResult =
  | { ok: true; envelope: AuditPromptEnvelope }
  | { ok: false; kind: TopicAuditEnvelopeFailureKind; finishReason?: string; outputChars: number };
```

Keep this import type-only so no runtime cycle is introduced.

- [ ] **Step 4: Implement deterministic truncation classification and compatibility wrapper**

Refactor the existing parser body into a private nullable `parseAuditEnvelopeObject`. Add a quote/escape-aware structural-tail scan and finish-reason mapping:

```ts
const TRUNCATED_FINISH_REASONS = new Set(["MAX_TOKENS", "length", "max_tokens"]);

function hasIncompleteJsonTail(raw: string): boolean {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const char of stripCodeFence(raw)) {
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && quoted) { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === "{" || char === "[") depth += 1;
    if (char === "}" || char === "]") depth -= 1;
  }
  return quoted || depth > 0;
}

export function parseAuditPromptEnvelopeResult(
  raw: string,
  allowedRefs?: ReadonlySet<string>,
  meta: TopicAuditEnvelopeResponseMeta = {}
): TopicAuditEnvelopeParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, kind: "empty", outputChars: 0 };
  const envelope = parseAuditEnvelopeObject(raw, allowedRefs);
  if (envelope) return { ok: true, envelope };
  const finishReason = meta.finishReason?.trim();
  const truncated = Boolean(finishReason && TRUNCATED_FINISH_REASONS.has(finishReason)) || hasIncompleteJsonTail(raw);
  return {
    ok: false,
    kind: truncated ? "truncated" : "schema_mismatch",
    ...(finishReason ? { finishReason } : {}),
    outputChars: trimmed.length
  };
}

export function parseAuditPromptEnvelopeResponse(raw: string, allowedRefs?: ReadonlySet<string>): AuditPromptEnvelope | null {
  const result = parseAuditPromptEnvelopeResult(raw, allowedRefs);
  return result.ok ? result.envelope : null;
}
```

- [ ] **Step 5: Verify parser compatibility and commit**

```bash
npx tsx --test tests/topic-audit-prompts.test.ts tests/topic-audit-handlers.test.ts
npm run typecheck
git diff --check
git add src/compare/topic-audit-envelope-contract.ts src/compare/topic-audit-prompts.ts tests/topic-audit-prompts.test.ts
git commit -m "bug fix: classify topic audit envelope failures"
```

Expected: all pass; valid aliases and evidence filtering remain unchanged.

---

### Task 3: Provider Schema, One-stage Retry, and Google Header

**Files:**
- Modify: `src/compare/topic-audit-envelope-contract.ts`
- Modify: `src/compare/provider.ts:84-230,268-325,941-1035`
- Modify: `tests/provider-runtime.test.ts`
- Modify: `tests/backend-llm-trace.test.ts:116-153`

**Interfaces:**
- Consumes `parseAuditPromptEnvelopeResult` and failure types.
- Produces `TOPIC_AUDIT_ENVELOPE_JSON_SCHEMA`, `TopicAuditEnvelopeError`, `topicAuditFailureCopy`, and the new signature `generateTopicAuditEnvelope(provider, apiKey, stageName, prompt, maxOutputTokens, options?)`.
- `options.onAttempt` has signature `(attempt: 1 | 2) => Promise<void> | void`; Task 4 uses it to renew the run lease.

- [ ] **Step 1: Add RED request-contract and retry tests**

Add provider-runtime tests that stub `globalThis.fetch`:

```ts
test("Google requests keep the key in x-goog-api-key and out of the URL", async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"prose":"ok","evidenceRefs":[],"caveats":[]}' }] } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await generateTopicAuditEnvelope("google", "sentinel-secret", "final", "prompt", 3200);
    assert.equal(calls[0]?.headers.get("x-goog-api-key"), "sentinel-secret");
    assert.doesNotMatch(calls[0]?.url ?? "", /sentinel-secret|[?&]key=/);
  } finally { globalThis.fetch = originalFetch; }
});

test("truncated Topic Audit output retries one stage once with a larger ceiling", async () => {
  const bodies: any[] = [];
  const attempts: number[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    const first = bodies.length === 1;
    return new Response(JSON.stringify({ candidates: [{
      finishReason: first ? "MAX_TOKENS" : "STOP",
      content: { parts: [{ text: first ? '{"prose":"cut' : '{"prose":"complete","evidenceRefs":[],"caveats":[]}' }] }
    }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await generateTopicAuditEnvelope("google", "secret", "final", "semantic prompt", 3200, {
      onAttempt: (attempt) => attempts.push(attempt)
    });
    assert.equal(result.prose, "complete");
    assert.deepEqual(attempts, [1, 2]);
    assert.equal(bodies[0].generationConfig.maxOutputTokens, 3200);
    assert.equal(bodies[1].generationConfig.maxOutputTokens, 4800);
    assert.match(bodies[1].contents[0].parts[0].text, /semantic prompt/);
    assert.doesNotMatch(bodies[1].contents[0].parts[0].text, /\{"prose":"cut/);
  } finally { globalThis.fetch = originalFetch; }
});
```

Also assert Google/OpenAI request bodies contain native schema, Claude contains neither a new tool nor schema, a valid first response calls fetch once, and two invalid responses throw `TopicAuditEnvelopeError` after exactly two semantic attempts.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npx tsx --test tests/provider-runtime.test.ts tests/backend-llm-trace.test.ts
```

Expected: FAIL because keys remain in URLs, the signature lacks `stageName/options`, and invalid envelopes do not retry.

- [ ] **Step 3: Define the shared schema, retry suffix, typed error, and copy mapper**

Add to `topic-audit-envelope-contract.ts`:

```ts
export const TOPIC_AUDIT_ENVELOPE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    prose: { type: "string" },
    evidenceRefs: { type: "array", items: { type: "string" } },
    caveats: { type: "array", items: { type: "string" } },
    coverage: { type: ["string", "null"] },
    commentRefsInShard: { type: "array", items: { type: "string" } },
    patternCandidates: { type: "array", items: { type: "object" } },
    lexiconCandidates: { type: "array", items: { type: "string" } },
    displayHints: { type: ["object", "null"] },
    continuityReview: { type: ["object", "null"] }
  },
  required: ["prose", "evidenceRefs", "caveats"]
} as const;

export const TOPIC_AUDIT_REPAIR_SUFFIX = "上一個回應不符合 JSON envelope contract。請用相同 evidence 重新回答，只輸出一個完整 JSON object；prose、evidenceRefs、caveats 必須存在。不要加入解釋。";

export class TopicAuditEnvelopeError extends Error {
  constructor(
    readonly stage: TopicAuditStageName,
    readonly kind: TopicAuditEnvelopeFailureKind,
    readonly attempt: 1 | 2,
    readonly finishReason: string | undefined,
    readonly outputChars: number
  ) {
    super(`Topic audit ${stage} envelope ${kind} after attempt ${attempt}`);
    this.name = "TopicAuditEnvelopeError";
  }
}
```

Implement `topicAuditFailureCopy(kind)` as the single Traditional-Chinese mapping from the approved spec.

- [ ] **Step 4: Move every Gemini key to one header helper**

Create a private helper and use it at all eight current callsites:

```ts
function googleGenerateContentRequest(apiKey: string, body: unknown): { input: string; init: RequestInit } {
  return {
    input: `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_COMPARE_MODEL}:generateContent`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body)
    }
  };
}
```

Replace every ``generateContent?key=${apiKey}`` URL. Add a source assertion in `provider-runtime.test.ts` using `readFile` that `provider.ts` contains neither `generateContent?key=` nor ``key=${apiKey}``.

- [ ] **Step 5: Add provider response metadata and exactly one semantic retry**

Make the JSON transport return `{ text, finishReason }` internally while leaving non-Topic callers' `generateJsonText` string contract intact. Map finish metadata as follows: Google `candidate.finishReason`, OpenAI `choice.finish_reason`, Claude `stop_reason`.

Implement the Topic function with this shape:

```ts
export async function generateTopicAuditEnvelope(
  provider: "openai" | "claude" | "google",
  apiKey: string,
  stageName: TopicAuditStageName,
  prompt: string,
  maxOutputTokens = 2200,
  options: { onAttempt?: (attempt: 1 | 2) => Promise<void> | void } = {}
): Promise<AuditPromptEnvelope> {
  let previousKind: TopicAuditEnvelopeFailureKind | null = null;
  for (const attempt of [1, 2] as const) {
    await options.onAttempt?.(attempt);
    const ceiling = attempt === 2 && previousKind === "truncated" ? Math.round(maxOutputTokens * 1.5) : maxOutputTokens;
    const attemptPrompt = attempt === 1 ? prompt : `${prompt}\n\n${TOPIC_AUDIT_REPAIR_SUFFIX}${previousKind === "truncated" ? " 請縮短 prose，確保 JSON 完整閉合。" : ""}`;
    const response = await requestTopicAuditJson(provider, apiKey, attemptPrompt, ceiling);
    const parsed = parseAuditPromptEnvelopeResult(response.text, undefined, { finishReason: response.finishReason });
    emitTopicAuditEnvelopeAttempt({
      provider,
      model: modelForProvider(provider),
      stageName,
      attempt,
      outputTokenCeiling: ceiling,
      finishReason: response.finishReason,
      outputChars: parsed.ok ? response.text.trim().length : parsed.outputChars,
      result: parsed.ok ? "success" : attempt === 1 ? "retrying" : "terminal",
      ...(!parsed.ok ? { failureKind: parsed.kind } : {})
    });
    if (parsed.ok) return parsed.envelope;
    previousKind = parsed.kind;
    if (attempt === 2) throw new TopicAuditEnvelopeError(stageName, parsed.kind, attempt, parsed.finishReason, parsed.outputChars);
  }
  throw new Error("unreachable topic audit retry state");
}
```

Google uses `responseMimeType` + `responseJsonSchema`; OpenAI uses `response_format.type="json_schema"` with `strict:false` because the shared envelope contains optional stage-specific extensions that remain deterministically validated after transport. Claude stays on the existing JSON prompt path. The telemetry call receives scalar metadata only; never pass the transport response object because it contains raw model text.

- [ ] **Step 6: Run the real Google schema smoke before continuing**

Use a hidden zsh read so the key never appears in history or process arguments:

```bash
read -rs "GOOGLE_API_KEY?Google API key: "
export GOOGLE_API_KEY
npx tsx -e 'import { generateTopicAuditEnvelope } from "./src/compare/provider.ts"; const value = await generateTopicAuditEnvelope("google", process.env.GOOGLE_API_KEY ?? "", "lexicon", "Return a concise envelope about the literal token schema-smoke. evidenceRefs and caveats must be empty arrays.", 220); if (!value.prose) process.exit(1); console.log("schema-smoke ok")'
unset GOOGLE_API_KEY
```

Expected: only `schema-smoke ok`. If Google rejects `responseJsonSchema` for `gemini-3.1-flash-lite`, stop execution and revise the approved spec; do not silently remove the schema.

- [ ] **Step 7: Verify trace redaction and commit**

```bash
npx tsx --test tests/provider-runtime.test.ts tests/backend-llm-trace.test.ts tests/topic-audit-prompts.test.ts
npm run typecheck
git diff --check
git add src/compare/topic-audit-envelope-contract.ts src/compare/provider.ts tests/provider-runtime.test.ts tests/backend-llm-trace.test.ts
git commit -m "bug fix: harden topic audit provider envelopes"
```

Expected: all pass; trace details contain provider/stage/attempt/finish reason/output chars but no raw output, prompt, or key.

---

### Task 4: Stage-aware Run Ledger in the Audit Pipeline

**Files:**
- Modify: `src/state/topic-audit-handlers.ts:67-90,598-610,877-1180,1260-1320`
- Modify: `src/state/messages.ts:55-90,205-225`
- Modify: `entrypoints/background.ts:2843-2890`
- Modify: `tests/topic-audit-handlers.test.ts:292-1370`
- Modify: `tests/background-behavior.test.ts`

**Interfaces:**
- Consumes Task 1 storage operations and Task 3's stage-aware `generateTopicAuditEnvelope` attempt callback.
- Extends `TopicAuditHandlerResult`/`ExtensionSuccessResponse` with `auditRunStatus?: TopicAuditRunStatus | null`.
- Extends `generateEnvelope` to accept `onAttempt: (attempt: 1 | 2) => Promise<void>`.
- Produces truthful begin/renew/fail/atomic-finish semantics for Task 5 hydration.

- [ ] **Step 1: Write RED handler tests for stage ownership and terminal state**

Add focused tests:

```ts
test("topic audit run persists real stage attempts and clears its run entry only with publication", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  const stages: string[] = [];
  const result = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", requestId: "request-1", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    now: () => "2026-07-17T10:00:00.000Z",
    generateEnvelope: async (stage, _prompt, onAttempt) => {
      await onAttempt(1);
      stages.push(stage);
      return makeEnvelope(stage);
    }
  });
  assert.ok(stages.includes("final"));
  assert.equal(result.auditRunStatus, null);
  assert.equal(await loadTopicAuditRun(storage, "topic-1", "2026-07-17T10:01:00.000Z"), null);
  assert.ok(await loadTopicAuditReport(storage, "topic-1"));
});

test("topic audit terminal envelope failure records its actual stage and typed kind", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  await assert.rejects(() => handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", requestId: "request-fail", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stage, _prompt, onAttempt) => {
      await onAttempt(1);
      throw new TopicAuditEnvelopeError(stage, "truncated", 2, "MAX_TOKENS", 3200);
    }
  }), TopicAuditEnvelopeError);
  const status = await loadTopicAuditRun(storage, "topic-1", new Date().toISOString());
  assert.equal(status?.state, "failed");
  assert.equal(status?.stage, "comment-shard-reading");
  assert.equal(status?.failureKind, "truncated");
});
```

Add a background behavior test proving a subsequent `topic/audit/get` response contains typed run status but no API key/raw provider payload.

Add an interleaving regression in which topic A's first envelope attempt fails validation, topic B saves a memo while topic A performs attempt 2, and both topics' final memo maps remain present. This is the acceptance proof that stage retry widens no whole-map overwrite window.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx tsx --test tests/topic-audit-handlers.test.ts tests/background-behavior.test.ts
```

Expected: FAIL because run ownership is not wired into handlers/messages.

- [ ] **Step 3: Extend handler/message contracts**

Add `auditRunStatus?: TopicAuditRunStatus | null` to `TopicAuditHandlerResult`. Replace the existing two-argument `generateEnvelope` member in `TopicAuditHandlerOptions` with this exact signature:

```ts
generateEnvelope?: (
  stageName: TopicAuditStageName,
  prompt: string,
  onAttempt: (attempt: 1 | 2) => Promise<void>
) => Promise<AuditPromptEnvelope>;
```

Require a non-empty `requestId` for production `topic/audit/run`; test fixtures must supply stable IDs. `topic/audit/get` returns `auditRunStatus` from `loadTopicAuditRun`.

- [ ] **Step 4: Wrap the pipeline in begin/attempt/fail/finish ownership**

At run start, create a `TopicAuditRunOwner`, persist a running status at `p1-signal-reading`, and pass an attempt callback through `generateOrParseEnvelope`:

```ts
const onAttempt = async (_attempt: 1 | 2) => {
  const now = nowIso(options);
  await advanceTopicAuditRun(storageArea, { ...owner, now }, stageName);
};
const raw = await generateEnvelope(stageName, prompt, onAttempt);
```

Route every memo checkpoint through `saveTopicAuditMemosForRun`. Pass `owner` into final `publishTopicAuditReportAndEpisodes`, which atomically publishes and clears the run. On catch, map `TopicAuditEnvelopeError.kind`, timeout text, or generic provider failure to a `TopicAuditRunFailureKind`, persist `failTopicAuditRun`, then rethrow the original error.

Update direct `topic/audit/p1-signal` and `cross-topic/calibrate` calls to satisfy the new generator signature with a module-level async no-op attempt callback. Those paths still receive Task 3's bounded provider retry but do not create or mutate the full Topic Atlas run ledger.

- [ ] **Step 5: Wire background provider attempts without duplicating retry**

Change the background generator closure to:

```ts
generateEnvelope: async (stageName, prompt, onAttempt) => generateTopicAuditEnvelope(
  providerConfig.provider,
  providerConfig.apiKey,
  stageName,
  prompt,
  stageName === "final" ? 3200 : 2200,
  { onAttempt }
)
```

Do not catch/retry envelope failures in background; Task 3 already owns exactly one semantic retry.

- [ ] **Step 6: Verify ownership, publication, and serialization**

```bash
npx tsx --test tests/topic-audit-storage.test.ts tests/topic-audit-handlers.test.ts tests/background-behavior.test.ts
npm run typecheck
npm run storage:seam-guard
git diff --check
```

Expected: all pass; a retried stage cannot clobber another topic's memo, late owners cannot checkpoint/publish, and no partial report replaces the prior Atlas.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/state/topic-audit-handlers.ts src/state/messages.ts entrypoints/background.ts tests/topic-audit-handlers.test.ts tests/background-behavior.test.ts
git commit -m "bug fix: reconcile topic audit run ownership"
```

---

### Task 5: Hydrate Run Truth and Derive One Topic Session State

**Files:**
- Modify: `src/ui/useTopicAudit.ts:1-535`
- Modify: `src/viewmodel/topic-detail.ts:150-240,788-930`
- Modify: `src/ui/InPageCollectorPopup.tsx:170-205`
- Modify: `tests/use-topic-audit.test.tsx`
- Modify: `tests/reconcile-ui-adoption.test.ts`
- Modify: `tests/topic-detail-viewmodel.test.ts`

**Interfaces:**
- Extends `LoadedTopicAuditState` and `TopicAuditUiState` with `auditRunStatus: TopicAuditRunStatus | null`.
- Produces `TopicGenerationFailure`, `TopicSourceSessionState`, and `deriveTopicSourceSessionState` in the pure viewmodel layer.
- Extends `TopicDetailViewModel` with `sourceSession: TopicSourceSessionState` and `BuildTopicDetailViewModelInput` with `auditRunStatus?: TopicAuditRunStatus | null`.
- Keeps `SessionItem` records as the only source-progress owner and persisted run status as the generation owner.

- [ ] **Step 1: Add RED hydration and reconciliation tests**

In `tests/use-topic-audit.test.tsx`, add a harness whose `topic/audit/get` response contains a running status. Toggle `popupOpen` false then true and assert the hook rehydrates `summary.reportStatus === "running"` and exposes the exact persisted stage/request ID. Add a second case returning an expired status already reconciled by the handler as `{ state:"failed", failureKind:"interrupted" }` and assert the summary is failed rather than permanently running.

In `tests/reconcile-ui-adoption.test.ts`, add a load-lane test proving a `topic/audit/get` response started for folder A is rejected after switching to folder B, and a superseded get cannot replace a newer accepted run result.

- [ ] **Step 2: Add the RED pure-state priority matrix**

Add table-driven tests in `tests/topic-detail-viewmodel.test.ts` for all six states and the two review amendments:

```ts
test("paid generation stays primary when a new source arrives", () => {
  const state = deriveTopicSourceSessionState({
    analysisCounts: { total: 8, ready: 7, saved: 1, queued: 0, crawling: 0, analyzing: 0, failed: 0, missing: 0, processing: 0 },
    crawlableCount: 1,
    auditRunStatus: makeRunStatus({ state: "running", stage: "final" }),
    reportStatus: "stale",
    addedSinceReport: 1
  });
  assert.deepEqual(state, { kind: "generating", scope: "topic", total: 8, ready: 7 });
});

test("source work keeps a prior terminal generation failure as secondary context", () => {
  const state = deriveTopicSourceSessionState({
    analysisCounts: { total: 8, ready: 7, saved: 1, queued: 0, crawling: 0, analyzing: 0, failed: 0, missing: 0, processing: 0 },
    crawlableCount: 1,
    auditRunStatus: makeRunStatus({ state: "failed", stage: "narrative", failureKind: "schema_mismatch" }),
    reportStatus: "stale",
    addedSinceReport: 1
  });
  assert.equal(state.kind, "needs_crawl");
  assert.deepEqual(state.previousGenerationFailure, { stage: "narrative", failureKind: "schema_mismatch" });
});
```

Also lock: processing precedes needs-crawl; terminal generation failure is primary after source work settles; all-ready stale/missing Atlas becomes `ready_to_generate`; fresh Atlas becomes `current`; a source failure is not added to `ready`.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
npx tsx --test tests/use-topic-audit.test.tsx tests/reconcile-ui-adoption.test.ts tests/topic-detail-viewmodel.test.ts
```

Expected: FAIL because `topic/audit/get` drops run status and no pure source-session state exists.

- [ ] **Step 4: Hydrate persisted run status through a topic-scoped load lane**

Change the helper to `loadAuditState(topicId, sendAndSync)` so hydration uses the hook's injected message path and is deterministic in tests. Read `response.auditRunStatus ?? null`. For every popup-open load/refresh, begin a reconciler token on `topic.audit.load:${topicId}` with target `{ sessionId, topicId }`; only commit `setLoadedByTopicId` after `complete(...)` accepts the current folder/topic target. Starting a new manual run must supersede any outstanding load token for that topic before applying local optimism, so an older `get` cannot restore a previous failed owner.

Replace the minimal local run shape with the same request-bound status contract used by persistence. Populate `startedAt`, `updatedAt`, and `expiresAt` from one local timestamp via `nextTopicAuditRunExpiry`; these values are optimistic display fallback only:

```ts
type LocalRunState = TopicAuditRunStatus;

export function resolveTopicAuditRunStatus(
  persisted: TopicAuditRunStatus | null,
  local: LocalRunState | undefined
): TopicAuditRunStatus | null {
  return persisted ?? local ?? null;
}
```

On a new run, invalidate the cached previous run entry for that topic, then set local `running` with the new request ID. Hydrated persisted truth wins whenever present. On an accepted success response, update artifacts and `auditRunStatus` from the response. On an accepted error response/throw, perform one reconciled `topic/audit/get` refresh so the UI receives the persisted typed failure; fall back to local `provider_error` only if that refresh also fails. On target mismatch, clear only that request's local optimism. Do not add a polling loop.

- [ ] **Step 5: Add the exact pure state contract to the viewmodel**

Add the approved union without JSX or storage reads:

```ts
export interface TopicGenerationFailure {
  stage: TopicAuditStageName;
  failureKind: TopicAuditRunFailureKind;
}

export type TopicSourceSessionState =
  | { kind: "needs_crawl"; scope: "topic"; total: number; ready: number; pending: number; failed: number; previousGenerationFailure?: TopicGenerationFailure }
  | { kind: "processing"; scope: "topic"; total: number; ready: number; queued: number; crawling: number; analyzing: number; previousGenerationFailure?: TopicGenerationFailure }
  | { kind: "ready_to_generate"; scope: "topic"; total: number; ready: number; addedSinceReport: number }
  | { kind: "generating"; scope: "topic"; total: number; ready: number }
  | { kind: "generation_failed"; scope: "topic"; total: number; ready: number; stage: TopicAuditStageName; failureKind: TopicAuditRunFailureKind }
  | { kind: "current"; scope: "topic"; total: number; ready: number };
```

Implement priority in one linear function: running run; `analysisCounts.processing > 0`; `crawlableCount > 0`; terminal failed run; stale/none report with all crawlable source work settled; current. `pending` is `saved + missing`, `failed` is separate, and `ready` is the reconciled succeeded count. A failed run contributes `previousGenerationFailure` to processing/needs-crawl but never displaces an active running run.

- [ ] **Step 6: Pass run truth through the popup boundary and verify**

Pass `auditRunStatus: app.activeTopicAudit?.auditRunStatus` into `buildTopicDetailViewModel`. Keep the viewmodel pure: no `chrome`, controller, storage, or React imports.

```bash
npx tsx --test tests/use-topic-audit.test.tsx tests/reconcile-ui-adoption.test.ts tests/topic-detail-viewmodel.test.ts
npm run typecheck
npm run boundary:guard
git diff --check
```

Expected: all pass; popup remount restores persisted generation state, while source counts remain derived from current session items.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/ui/useTopicAudit.ts src/viewmodel/topic-detail.ts src/ui/InPageCollectorPopup.tsx tests/use-topic-audit.test.tsx tests/reconcile-ui-adoption.test.ts tests/topic-detail-viewmodel.test.ts
git commit -m "bug fix: derive topic source session truth"
```

---

### Task 6: One Top Topic Session Card and Measured Removal Credit

**Files:**
- Create: `src/ui/TopicSourceSessionCard.tsx`
- Modify: `src/ui/TopicDetailView.tsx:808-917,1760-2075,2075-2390,2560-3025,3195-3270`
- Modify: `tests/topic-detail-view.test.tsx`
- Create: `docs/qa/assets/2026-07-17/0.3.49-topic-session/bundle-budget.md`

**Interfaces:**
- Produces `TopicSourceSessionCard({ state, disabled, onAnalyze, onStartProcessing, onRunAudit })`.
- The card owns crawl, source processing, ready-to-generate, generating, and generation-failed UI.
- `TopicAuditAtlasToolbar` owns regeneration only when `sourceSession.kind === "current"`; `審查報告` remains available in every Atlas state.

- [ ] **Step 1: Add RED rendering, ordering, ownership, and action tests**

Extend the existing server-render and JSDOM harnesses in `tests/topic-detail-view.test.tsx` to prove:

1. `data-topic-source-session` occurs after the breadcrumb row but before `data-signal-atlas-canvas` and the previous Atlas hero.
2. A queued/crawling source renders `data-topic-source-session="processing"` even though `unanalyzedItemIds` is empty.
3. A running audit plus one newly saved source renders `generating`, shows `議題 7/8 已完成`, and does not render a crawl CTA over the paid run.
4. A previous failed `narrative/schema_mismatch` run plus pending source renders the crawl CTA and the exact failure as secondary text.
5. All-ready stale sources render `用 8 篇重新生成 Atlas`; rendering alone invokes no command, and one click dispatches exactly one `runAudit` command.
6. Stale/running/failed session states have one regeneration owner, no `目前顯示上一版` banner, and no duplicate bottom processing/crawl owner.
7. `data-topic-source-list="true"` and all per-source inspect/delete rows remain available below the Atlas.

Use DOM hooks rather than style-string snapshots for state behavior. Add one token-source assertion that the new component imports `tokens` and contains no literal hex/rgb/hsl color.

- [ ] **Step 2: Run the focused view test and verify RED**

```bash
npx tsx --test tests/topic-detail-view.test.tsx
```

Expected: FAIL because the current source owner disappears after queueing and stale/regenerate controls are duplicated.

- [ ] **Step 3: Record the pre-removal build and create the budget ledger**

```bash
npm run build
npm run bundle:guard
```

Create `bundle-budget.md` with rows for approved 0.3.48 baseline, Task-5 pre-removal build, removal-only build, final card build, and final rail build. Record raw/gzip-9/brotli values copied verbatim from `npm run bundle:guard`; never place estimates in a measured column.

- [ ] **Step 4: Remove the three duplicate owners, then measure removal-only credit**

In both Atlas and legacy Topic branches:

- remove `TopicAuditAtlasStatus` and its amber stale banner owner;
- suppress toolbar/overview regeneration whenever `sourceSession.kind !== "current"`, while retaining `審查報告`;
- remove `TopicProcessingStatus` and bulk crawl CTA from the lower source feed/legacy source section, while retaining inventory, tag cloud, source list, row actions, and empty-state copy.

Do not add the new card in this step. Build and append exact removal-only values/deltas to the ledger:

```bash
npm run build
npm run bundle:guard
```

Expected: the focused view tests remain RED only for the missing top card; removed-owner assertions pass.

- [ ] **Step 5: Implement the token-only card**

Render one compact `<section aria-label="議題處理狀態">` with `data-topic-source-session={state.kind}` and a visible `議題 ${ready}/${total} 已完成` label. Put the changing state sentence in a visually hidden child with `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`; do not put interactive buttons inside the status role. State behavior is fixed:

- `needs_crawl`: determinate bar, pending/failed counts, `開始爬取 N 篇` or `重試 N 篇`, plus previous stage/kind secondary copy when present;
- `processing`: existing source spinner semantics, real queued/crawling/analyzing counts, determinate `ready/total` bar, optional existing worker-start recovery action;
- `ready_to_generate`: success mark and one manual `用 N 篇重新生成 Atlas` button;
- `generating`: spinner + indeterminate bar, no source or duplicate regeneration CTA;
- `generation_failed`: `topicAuditFailureCopy(failureKind)`, compact real stage, and one `重試生成` button;
- `current`: return `null`.

Use only `tokens`, shared buttons/text primitives, and `tokens.motion.keyframes`. The indeterminate/spinner elements must sit under the existing `data-dlens-control="true"` root so the global reduced-motion registry neutralizes them.

- [ ] **Step 6: Mount the card before both Topic content branches**

Create one `topicSourceSessionCard` element immediately after each branch's breadcrumb/action row and before Atlas/overview content. Wire `onAnalyze` to the existing `analyzeItems` command, `onStartProcessing` to `startProcessing`, and `onRunAudit` to `{ kind:"runAudit", force:true }`. Do not auto-dispatch an audit when state changes to `ready_to_generate`.

In the Atlas branch, replace the old parent gate `auditEvidence.length === 0 || unanalyzedItemIds.length > 0` with unconditional `topicSourceFeed` rendering after the Atlas. In the legacy branch, keep its lower source list mounted. The top card must not depend on `unanalyzedItemIds` after queueing.

- [ ] **Step 7: Verify UI behavior and record final card bytes**

```bash
npx tsx --test tests/topic-detail-view.test.tsx tests/topic-detail-viewmodel.test.ts
npm run typecheck
npm run boundary:guard
npm run build
npm run bundle:guard
git diff --check
```

Append final card raw/gzip/brotli values plus removal/addition/net deltas to the ledger. If any current limit fails, stop before editing `scripts/ui-bundle-budget.json` and request an explicit budget decision.

- [ ] **Step 8: Commit Task 6**

```bash
git add src/ui/TopicSourceSessionCard.tsx src/ui/TopicDetailView.tsx tests/topic-detail-view.test.tsx docs/qa/assets/2026-07-17/0.3.49-topic-session/bundle-budget.md
git commit -m "bug fix: keep topic source session visible"
```

---

### Task 7: Folder-scoped Status Rail Motion and Disclosure

**Files:**
- Modify: `src/ui/components.tsx:598-735`
- Modify: `src/ui/InPageCollectorPopup.tsx:460-480`
- Modify: `tests/components.test.tsx:690-750`
- Modify: `tests/motion-registry.test.ts:125-145`
- Modify: `docs/qa/assets/2026-07-17/0.3.49-topic-session/bundle-budget.md`

**Interfaces:**
- Extends `StatusRail` with `scopeLabel?: string`, defaulting to `資料夾`.
- Adds `data-status-rail-active`, `data-status-rail-disclosure`, and `data-status-rail-progress` hooks without changing backend work-state ownership.

- [ ] **Step 1: Add RED accessibility, scope, motion, and progress tests**

Extend `tests/components.test.tsx` with server-render assertions:

```ts
test("StatusRail labels folder progress and exposes an active disclosure", () => {
  const html = renderToStaticMarkup(<StatusRail
    scopeLabel="資料夾"
    backendWorkUiState={{ kind: "draining", count: 3 }}
    workerStatus="draining"
    ready={9}
    total={20}
  />);
  assert.match(html, /data-status-rail-active="true"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /資料夾 9\/20 ready/);
  assert.match(html, /data-status-rail-disclosure="true"/);
  assert.match(html, /data-status-rail-progress="true"/);
  assert.match(html, /width:45%/);
});
```

Add an idle case asserting `data-status-rail-active="false"` and no animation style. Add retry/error cases proving their warning/danger labels remain. Extend the motion-registry test to prove the active rail hook remains under the global `[data-dlens-control="true"]` reduced-motion neutralizer.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npx tsx --test tests/components.test.tsx tests/motion-registry.test.ts
```

Expected: FAIL because the rail has no scope label, keyboard disclosure, progress bar, or active hook.

- [ ] **Step 3: Implement active-only motion and a hover/focus disclosure**

Define active work as `analysis_waiting`, `draining`, or `workerStatus === "draining"`. Keep retry/error non-idle semantics but do not animate them. On the rail root:

- set `tabIndex={0}`, `data-status-rail-active`, and `position:"relative"`;
- change the visible count to `${scopeLabel} ${ready}/${total} ready`;
- include the same scoped count, reachability, and work detail in `aria-label`;
- wrap the existing work dot in a span whose animation is `tokens.motion.keyframes.pulse` only when active;
- render a token-only disclosure containing work label, scoped count, and a clamped determinate bar width `total > 0 ? ready / total : 0`;
- reveal the disclosure on `:hover` and `:focus-visible` through a small scoped CSS rule keyed by `data-status-rail`.

Replace the rail's current literal gap/padding/work-dot dimensions with the nearest existing `tokens.spacing` values while making this edit. All color, radius, shadow, typography, spacing, and animation declarations in the modified rail/disclosure must reference `tokens`, `textStyles`, or the shared motion registry; only data-derived progress percentages may be computed inline. Do not add React state or timers for hover. Pass `scopeLabel="資料夾"` explicitly at the only popup callsite.

- [ ] **Step 4: Verify, build, and close the three-track budget ledger**

```bash
npx tsx --test tests/components.test.tsx tests/motion-registry.test.ts
npm run typecheck
npm run build
npm run bundle:guard
git diff --check
```

Append the final rail build, rail-only delta, and total 0.3.48-to-final raw/gzip/brotli delta. Confirm all three values remain at or below raw `910000`, gzip `256000`, brotli `203000`. If not, stop; do not modify the budget file.

- [ ] **Step 5: Commit Task 7**

```bash
git add src/ui/components.tsx src/ui/InPageCollectorPopup.tsx tests/components.test.tsx tests/motion-registry.test.ts docs/qa/assets/2026-07-17/0.3.49-topic-session/bundle-budget.md
git commit -m "bug fix: disclose active folder progress"
```

---

### Task 8: Review, Full Static Gate, and 0.3.49 Build

**Files:**
- Modify: `package.json:3`
- Modify: `package-lock.json:3,9`
- Modify: `wxt.config.ts:20`
- Modify: `src/ui/version.ts:1`
- Modify: `tests/manifest-config.test.ts:22`
- Modify: `README.md:6-7,68`
- Modify: `docs/memory/latest-shared-context.md:106-110`

- [ ] **Step 1: Run the full implementation gate before release metadata**

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

Expected: zero failures, existing skips only, and every bundle track within its unchanged limit. Record exact test/pass/fail/skip and bundle values in the budget/release notes; do not copy 0.3.48 counts.

- [ ] **Step 2: Request a fresh code review and resolve findings**

Use `superpowers:requesting-code-review` against the complete Task 1-7 diff from `48c9dce`. The review must explicitly check request ownership, queue re-entrancy, exactly-two semantic attempts, key/trace leakage, state priority, duplicate controls, accessibility, and bundle accounting. For each valid finding, return to the responsible task, add a failing regression first, implement the narrow fix, rerun its focused gate, and commit it. Then rerun Step 1 in full.

- [ ] **Step 3: Bump all five version locks to 0.3.49**

Use the package manager only for the package/lock pair:

```bash
npm version 0.3.49 --no-git-tag-version
```

Use `apply_patch` for `wxt.config.ts`, `src/ui/version.ts`, and `tests/manifest-config.test.ts`. Update README and latest shared context with the exact static gate and measured bundle delta. At this point state explicitly: source/build 0.3.49 is ready, but Default-Chrome reload/manual acceptance is still pending. Do not claim runtime-green in this commit.

- [ ] **Step 4: Re-run the release gate and verify both MV3 manifests**

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npm run storage:migrate-fixtures
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run qa:harness:fixture
npm run build
npm run bundle:guard
node --input-type=module -e 'import { readFileSync } from "node:fs"; for (const path of [".output/chrome-mv3/manifest.json", "output/chrome-mv3/manifest.json"]) { const manifest = JSON.parse(readFileSync(path, "utf8")); if (manifest.version !== "0.3.49" || manifest.name !== "DLens v3") throw new Error(`${path}: ${manifest.name} ${manifest.version}`); console.log(`${path}: ${manifest.name} ${manifest.version}`); }'
git diff --check
```

Expected: both manifests print `DLens v3 0.3.49`; all static gates pass within unchanged limits.

- [ ] **Step 5: Commit the release metadata**

```bash
git add package.json package-lock.json wxt.config.ts src/ui/version.ts tests/manifest-config.test.ts README.md docs/memory/latest-shared-context.md
git commit -m "feature: bump extension to 0.3.49"
```

---

### Task 9: Default Chrome Computer Use Acceptance

**Files:**
- Create: `docs/qa/2026-07-17-topic-session-envelope-runtime.md`
- Create artifacts under: `docs/qa/assets/2026-07-17/0.3.49-topic-session/`
- Modify after runtime truth is known: `README.md`
- Modify after runtime truth is known: `docs/memory/latest-shared-context.md`

**Required skill:** Read and use `computer-use:computer-use` before touching Chrome. Use the user's real Default Chrome profile and visible UI only. Playwright, AppleScript, CDP, and synthetic browser evidence are prohibited.

- [ ] **Step 1: Establish a safe runtime baseline**

Confirm the backend `/health` and `/worker/status` are healthy with read-only terminal requests. Through visible Chrome UI, open `chrome://extensions`, reload the unpacked extension at `output/chrome-mv3`, return to the existing Threads tab, reload that page once, open DLens, and visually confirm `v.0.3.49`.

Record timestamp, extension version, backend reachability/work state, and the selected real Topic in the runtime report. Do not record API keys, prompt text, raw evidence, or private post content. If no suitable Topic with a previous Atlas and a legitimate pending source exists, stop and ask the user to nominate one rather than adding unrelated evidence.

- [ ] **Step 2: Verify placement, scope, and source-work continuity**

On a Topic with a previous Atlas and pending source:

1. capture the top session card before the Atlas;
2. confirm `議題 X/Y 已完成` differs from the masthead's `資料夾 A/B ready`;
3. click the card's crawl action once;
4. confirm the card remains mounted as items become queued/crawling/analyzing and its determinate bar/counts advance;
5. confirm the rail animates only while work is active;
6. hover the rail, then keyboard-focus it, and confirm both reveal the same folder-scoped determinate disclosure;
7. close and reopen the popup during source work and confirm the card rehydrates to current reconciled counts.

Save cropped screenshots for pending, processing, rail disclosure, and reopened processing states.

- [ ] **Step 3: Verify manual generation and persisted run ownership**

Wait for source work to settle. Confirm the card becomes `用 N 篇重新生成 Atlas` and that no provider generation starts before a click. Click once and verify:

- the card becomes `正在重新生成 Atlas`;
- the previous Atlas stays visible;
- a newly arriving/pending source, if present, does not hide the running generation;
- closing and reopening the popup restores the generating state from the run ledger.

Use visible Chrome UI to open the extension service-worker inspector and inspect only normalized Topic Audit attempt metadata. Confirm attempts are at most `1,2` for one stage and no API key, prompt, raw output, or evidence text appears. Do not copy private payloads into the report.

- [ ] **Step 4: Verify terminal success or typed retryable failure**

For a successful live run, confirm the replacement Atlas publishes in place, the session card disappears to `current`, and the compact manual regenerate action returns once. If the real provider terminates after its bounded retry, confirm the old Atlas remains and the card shows localized failure kind plus actual stage with one retry action; do not force a provider failure merely for QA. The deterministic tests remain the proof of the malformed-response branch.

Record observed timings and state transitions without inventing percentages or claiming provider failure coverage that did not occur.

- [ ] **Step 5: Handle any live failure before declaring green**

If any acceptance step fails, do not write a green report. Return to the owning task, reproduce with a failing automated test, implement the narrow fix under TDD, rerun the complete Task-8 gate, rebuild/reload 0.3.49, and repeat the failed Chrome sequence. Keep the release version at 0.3.49 unless a separate release has already shipped.

- [ ] **Step 6: Write runtime truth, update docs, and commit acceptance evidence**

Write `docs/qa/2026-07-17-topic-session-envelope-runtime.md` with pass/fail per acceptance step, exact observed counts/timings, screenshot paths, provider attempt metadata summary, and explicit limitations. Update README/latest shared context from “Chrome pending” to the actual verified result only after every required step passes.

```bash
git diff --check
git status --short
git add docs/qa/2026-07-17-topic-session-envelope-runtime.md docs/qa/assets/2026-07-17/0.3.49-topic-session README.md docs/memory/latest-shared-context.md
git commit -m "docs: record 0.3.49 chrome acceptance"
```

Expected: runtime evidence is committed without secrets or unrelated screenshots; 0.3.49 is called runtime-green only if every required Computer Use check passed.

---

## Spec Coverage Checklist

- [ ] Storage work item 0 remains a regression gate; one existing queue owns all new run/checkpoint writes.
- [ ] Run cache is explicitly disposable, lease-bound, request-owned, and safe to discard independently of durable Atlas artifacts.
- [ ] UI precedence keeps paid generation above new source work and preserves prior failure context when source work leads.
- [ ] Topic and folder scopes are visibly distinct; popup reopen uses reconciled/persisted owners.
- [ ] Parser, provider, telemetry, run status, and UI share the same typed failure vocabulary.
- [ ] Google/OpenAI receive native schema; Claude does not; every Gemini key moves to the header.
- [ ] Exactly one semantic retry repeats only the failed stage with the approved token rules.
- [ ] Previous Atlas stays mounted until atomic successful publication.
- [ ] Stale banner, duplicate regenerate action, and duplicate lower processing owner are removed before adding the unified card.
- [ ] Reduced motion, keyboard disclosure, three-track bundle accounting, five version locks, full static gate, and real Default-Chrome acceptance are all evidenced.
