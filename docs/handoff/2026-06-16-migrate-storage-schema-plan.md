# MIGRATE Storage Schema + Migration Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `MIGRATE` from 🔴 to 🟡 (registry primitive + one real registered migration with legacy fixture replay) and then to 🟩 (CI gate enforcing fixture coverage at zero unregistered migrations).

**Architecture:** Add `src/state/storage-schema.ts` as the **pure primitive** holding `CURRENT_STORAGE_SCHEMA_VERSION`, `defineMigration({...})`, and `runMigrationsFor(storageArea, key)`. Stamp `schemaVersion: <N>` inside the JSON payload (not the storage key) so version evolution doesn't require key renames. Read path: if persisted payload has no `schemaVersion`, treat as v0 and run the registered v0→v1 upgrade; write back with `schemaVersion: 1`. Single-direction (forward) migrations only.

**Tech Stack:** TypeScript, Node test runner, mocked `chrome.storage.local`, existing seam-owned write helpers (`writeGlobalStateSnapshot`, etc.) — migrations write through the seam, never raw.

---

## Current State

The five core product walls (`TRACE` / `SEAM_GUARD` / `RECONCILE` / `INVALIDATE` / `BOUNDARY`) are 🟩 after PR #29 / #38 / #42 / #45 / #48. The only remaining 🔴 node in the architecture map is `MIGRATE`.

`MIGRATE` is 🔴 because:

- `schemaVersion` does not exist anywhere in production code (grep across `src/` and `entrypoints/` returns zero hits);
- the **only `v0` storage keys remaining** are `dlens:v0:global-state` (`ExtensionGlobalState`: settings / sessions / activeSessionId / updatedAt) and `dlens:v0:tab-ui:<tabId>` — everything else has migrated to `v1` ad-hoc;
- `normalizeGlobalState()` is the current **implicit migration layer** — it silently tolerates whatever shape it finds. Drift accumulates undetected;
- one explicit legacy migration exists (`migrateLegacyProductContextStorage` for `dlens_product_context` → `dlens:v1:product-context`) but it has no version metadata, no registry, and no legacy fixture replay test;
- **net result**: any storage shape change to `SessionRecord`, `ExtensionSettings`, `TabUiState`, etc. is a silent break risk on existing user installs.

## Done Condition

`MIGRATE` can become 🟩 only when:

1. **Registry primitive ships**: `src/state/storage-schema.ts` exports `CURRENT_STORAGE_SCHEMA_VERSION`, `defineMigration({ key, from, to, migrate })`, and `runMigrationsFor(storageArea, key)`.
2. **At least one real migration is registered**: v0→v1 promotion of `dlens:v0:global-state` payload, stamping `schemaVersion: 1`.
3. **Legacy fixture replay test**: a real v0-shaped JSON in `tests/fixtures/storage/global-state-v0.json` runs through the registry and produces an output equal to `tests/fixtures/storage/global-state-v1.json` — the test fails RED if the migration changes shape silently.
4. **Non-destructive guarantee**: the migration preserves every field the v0 shape supports; new v1-only fields are nullable / defaulted and explicitly listed.
5. **CI gate**: `npm run storage:migrate-fixtures` enforces that every `defineMigration` entry has a paired `tests/fixtures/storage/<key>-v<from>.json` fixture + a `<key>-v<to>.json` expected output. Missing fixture = CI red.
6. **Zero unregistered migrations** — the ad-hoc tolerance in `normalizeGlobalState()` is replaced by registered upgrades for every shape it currently tolerates, OR explicitly documented as "tolerance, not migration" with a rationale.
7. Cross-lever invariants stay green:
   - `npm run storage:seam-guard -- --list` → 0 allowlisted bypasses;
   - `npm run boundary:guard` → 0 view / VM violations;
   - RECONCILE / INVALIDATE / BOUNDARY verbatim wording unchanged.

## Lane Survey

### Storage keys today

**v0 keys (legacy, needs migration)**:
- `dlens:v0:global-state` → holds `ExtensionGlobalState`. Most critical key. Touched on every session change.
- `dlens:v0:tab-ui:<tabId>` → per-tab UI state prefix. Lower stakes but same issue.

**v1 keys (clean, no migration debt today)** — 17 keys, all under `src/state/` and `src/compare/`:
- `dlens:v1:active-session-id`
- `dlens:v1:topics` / `dlens:v1:signals`
- `dlens:v1:topic-audit-evidence` / `topic-audit-memos` / `topic-audit-reports` / `cross-topic-calibrations`
- `dlens:v1:pr-campaigns` / `pr-evidence-rows`
- `dlens:v1:product-context` / `product-agent-task-feedback` / `product-signal-analyses` / `signal-tags` / `signal-readings` / `topic-signal-readings` / `folder-synthesis` / `saved-analyses` / `technique-readings`
- `dlens:v1:compare-{brief,one-liner,cluster-summary,evidence-annotation,judgment}-cache`

**Legacy key already explicitly migrated (ad-hoc)**:
- `dlens_product_context` → `dlens:v1:product-context` via `migrateLegacyProductContextStorage`. No registry entry, no fixture replay test. This becomes the **PR 2 second registered migration** (template for future entries).

### Hidden migration debt: `normalizeGlobalState`

`normalizeGlobalState` in `src/state/store-helpers.ts` (or similar) is the **silent migration layer today**. Every time a `SessionRecord` field is added, renamed, or removed, the team patches `normalizeGlobalState` to tolerate both shapes. This works but:

- not testable as a migration (it's a runtime tolerance);
- accumulates indefinitely;
- contains shapes that no live install actually still has, but nobody can prove that.

PR 2 audits `normalizeGlobalState` and converts each "tolerance" into either (a) a registered v0→v1 migration step, or (b) an explicit comment "field always present since 2026-XX-XX; tolerance kept for defense in depth".

### Not In This Plan's Scope

- Renaming v0 keys to v1 names. Stamping `schemaVersion` inside the payload achieves version safety without key renames; rename is a follow-up.
- Background module split.
- `useInPageCollectorAppState.ts` decomposition.
- Backend / crawler / read-model behavior.
- New product features.
- Visual UI redesign.
- Chrome QA automation.

## Cross-PR Invariants

1. **`SEAM_GUARD` stays 🟩** — `npm run storage:seam-guard -- --list` reports 0 allowlisted bypasses after every slice. Migration writes go through the existing seam helpers (`writeGlobalStateSnapshot`, etc.), never raw `chrome.storage.local.set`.
2. **`RECONCILE` stays 🟩** — verbatim wording unchanged.
3. **`INVALIDATE` stays 🟩** — verbatim wording unchanged.
4. **`BOUNDARY` stays 🟩** — `npm run boundary:guard` reports 0 view / VM violations. Migration code lives in `src/state/`, not `src/ui/` or `src/viewmodel/`.
5. **`request-reconcile.ts` stays pure** — no business logic added.
6. **Migrations are forward-only** — no down-migrations / rollbacks. If a future migration is wrong, the fix is a new forward migration, not a reverse one.
7. **Migrations are pure** — `migrate(input) → output`. No I/O. The registry is responsible for calling `storageArea.set` after a successful migration; the `migrate` function never touches storage directly.
8. **No silent data loss** — migrations must preserve every field the input shape supports. New fields are nullable / defaulted; removed fields are explicitly documented.

---

## PR 1: Registry Primitive + Schema Version Infrastructure

**Intent:** Ship the pure primitive that future migrations register against. No real migrations yet; only the mechanism.

**Files:**
- New: `src/state/storage-schema.ts`
- New: `tests/storage-schema.test.ts`
- Modify: `src/state/types.ts` (export a `StorageSchemaMigration<TFrom, TTo>` interface if helpful for typing)
- (No source changes to `background.ts` or storage helpers yet — PR 1 is pure primitive.)

### Task 1.1: Define the registry primitive

- [ ] **Step 1: Write the failing test**

Add to `tests/storage-schema.test.ts`:

```ts
import { CURRENT_STORAGE_SCHEMA_VERSION, defineMigration, runMigrationsFor } from "../src/state/storage-schema";

test("runMigrationsFor on a payload with no schemaVersion runs the v0→v1 migration and stamps schemaVersion", async () => {
  const registry = [
    defineMigration({
      key: "test:example",
      from: 0,
      to: 1,
      migrate: (input: { name?: string }) => ({ name: input.name ?? "default" })
    })
  ];
  const result = runMigrationsFor(registry, "test:example", { name: "alice" });
  assert.deepEqual(result, { schemaVersion: 1, name: "alice" });
});

test("runMigrationsFor on a payload already at CURRENT version is a no-op", async () => {
  const registry = [
    defineMigration({
      key: "test:example",
      from: 0,
      to: 1,
      migrate: (input: { name?: string }) => ({ name: input.name ?? "default" })
    })
  ];
  const result = runMigrationsFor(registry, "test:example", { schemaVersion: 1, name: "alice" });
  assert.deepEqual(result, { schemaVersion: 1, name: "alice" });
});

test("runMigrationsFor with no registered migration for a key throws", () => {
  assert.throws(() => runMigrationsFor([], "test:example", {}), /no registered migration/);
});

test("runMigrationsFor refuses to run a migration backwards", () => {
  const registry = [defineMigration({ key: "test:example", from: 0, to: 1, migrate: (x) => x })];
  assert.throws(() => runMigrationsFor(registry, "test:example", { schemaVersion: 2 }), /future schema/);
});
```

- [ ] **Step 2: Run** — confirm RED.

- [ ] **Step 3: Implement `src/state/storage-schema.ts`**

```ts
export const CURRENT_STORAGE_SCHEMA_VERSION = 1; // bumped by future PRs as they register migrations

export interface StorageSchemaMigration<TFrom = unknown, TTo = unknown> {
  key: string;
  from: number; // 0 means "no schemaVersion field present"
  to: number;
  migrate: (input: TFrom) => TTo;
}

export function defineMigration<TFrom, TTo>(spec: StorageSchemaMigration<TFrom, TTo>): StorageSchemaMigration<TFrom, TTo> {
  if (spec.to <= spec.from) {
    throw new Error(`migration for ${spec.key}: to (${spec.to}) must be greater than from (${spec.from})`);
  }
  return spec;
}

export function runMigrationsFor<T = unknown>(
  registry: StorageSchemaMigration[],
  key: string,
  rawValue: unknown
): T {
  const entries = registry.filter((m) => m.key === key);
  if (entries.length === 0) {
    throw new Error(`no registered migration for key ${key}`);
  }
  const currentVersion = readSchemaVersion(rawValue);
  if (currentVersion > Math.max(...entries.map((e) => e.to))) {
    throw new Error(`payload for ${key} claims future schema version ${currentVersion}`);
  }
  let value = rawValue;
  let version = currentVersion;
  while (version < Math.max(...entries.map((e) => e.to))) {
    const next = entries.find((e) => e.from === version);
    if (!next) break;
    value = next.migrate(value);
    version = next.to;
  }
  return { ...stampSchemaVersion(value, version) } as T;
}

function readSchemaVersion(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  const v = (value as Record<string, unknown>).schemaVersion;
  return typeof v === "number" ? v : 0;
}

function stampSchemaVersion(value: unknown, version: number): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return { schemaVersion: version };
  }
  return { ...(value as Record<string, unknown>), schemaVersion: version };
}
```

- [ ] **Step 4: Run** — confirm GREEN.

### Task 1.2: Verify and commit PR 1

```bash
npm run typecheck
npm run storage:seam-guard -- --list
npm run boundary:guard
npx tsx --test 'tests/**/*.test.ts' 'tests/**/*.test.tsx'
npm run build
git diff --check
```

Expected:
- typecheck passes;
- both guards 0;
- full suite passes (no behavior change to any existing code path — the primitive is unused so far);
- build mirrors to worktree;
- diff check passes.

Commit:

```bash
git commit -m "refactor: add storage schema migration registry primitive"
```

---

## PR 2: First Real Migration — Global State v0 → v1 (+ Product Context Formalization)

**Intent:** Register the `dlens:v0:global-state` payload v0→v1 migration that stamps `schemaVersion: 1` and audits `normalizeGlobalState` tolerance. Bundle the existing `migrateLegacyProductContextStorage` as a second registry entry to prove the registry handles unrelated keys. Ship the first **legacy fixture replay test**.

**Files:**
- Modify: `src/state/storage-schema.ts` (export `STORAGE_MIGRATIONS` const + add the two real entries)
- Modify: `src/state/store-helpers.ts` (or wherever `normalizeGlobalState` lives — wire the migration into the load path; remove tolerances that the migration now handles explicitly)
- Modify: `src/compare/product-context-storage.ts` (refactor `migrateLegacyProductContextStorage` to register as a migration entry; existing read path keeps tolerance for the legacy key name)
- Modify: `entrypoints/background.ts` (in `loadGlobalState`, route the raw value through `runMigrationsFor` before passing to `normalizeGlobalState`)
- New: `tests/fixtures/storage/global-state-v0.json` (real v0-shaped payload — anonymized snapshot)
- New: `tests/fixtures/storage/global-state-v1.json` (expected v1 output)
- New: `tests/fixtures/storage/product-context-legacy.json` (the old `dlens_product_context` shape)
- New: `tests/fixtures/storage/product-context-v1.json` (expected v1 output)
- New: `tests/storage-migrations.test.ts` (fixture replay)

### Task 2.1: Audit `normalizeGlobalState` tolerances

- [ ] **Step 1: Inventory the tolerances**

Read `normalizeGlobalState` and list every "if field missing / wrong type / wrong shape, do X" branch. For each, decide:
- **(a) registered migration**: belongs in `migrate: (v0) => v1` because real v0 installs may have this shape;
- **(b) defensive tolerance**: kept in `normalizeGlobalState` with a comment explaining why (e.g., "external scripts may inject this state during dev");
- **(c) dead code**: tolerance for a shape no live install can have; remove.

This audit is the doc deliverable of Task 2.1 — add it as a comment block at the top of `normalizeGlobalState` listing every tolerance and its category.

### Task 2.2: Write the v0→v1 migration

- [ ] **Step 1: Define what changed between v0 and v1**

For PR 2, v0→v1 is the minimal "add `schemaVersion: 1`" plus any category (a) tolerances from Task 2.1. The `migrate` function takes the v0 raw payload and returns the v1 payload (schemaVersion still stamped by the registry, not by `migrate`).

- [ ] **Step 2: Failing fixture test**

Add to `tests/storage-migrations.test.ts`:

```ts
import { runMigrationsFor } from "../src/state/storage-schema";
import { STORAGE_MIGRATIONS } from "../src/state/storage-schema";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = new URL("./fixtures/storage/", import.meta.url);

test("global-state v0 fixture migrates to expected v1 shape", () => {
  const v0 = JSON.parse(readFileSync(new URL("./fixtures/storage/global-state-v0.json", import.meta.url), "utf8"));
  const expectedV1 = JSON.parse(readFileSync(new URL("./fixtures/storage/global-state-v1.json", import.meta.url), "utf8"));
  const result = runMigrationsFor(STORAGE_MIGRATIONS, "dlens:v0:global-state", v0);
  assert.deepEqual(result, expectedV1);
});

test("product-context legacy fixture migrates to v1 shape", () => {
  const legacy = JSON.parse(readFileSync(new URL("./fixtures/storage/product-context-legacy.json", import.meta.url), "utf8"));
  const expectedV1 = JSON.parse(readFileSync(new URL("./fixtures/storage/product-context-v1.json", import.meta.url), "utf8"));
  const result = runMigrationsFor(STORAGE_MIGRATIONS, "dlens:v1:product-context", legacy);
  assert.deepEqual(result, expectedV1);
});
```

- [ ] **Step 3: Implement migrations and fixture files**

Implement:
- `STORAGE_MIGRATIONS` array in `src/state/storage-schema.ts` with two entries.
- Real-shape fixtures (use anonymized data — no real user data).
- Wire `runMigrationsFor` into `loadGlobalState` (background.ts) and `loadProductContext` (wherever it lives).

### Task 2.3: Verify and commit PR 2

Same verification matrix as PR 1 + assert:
- the two new fixture tests pass;
- existing `tests/background-behavior.test.ts` and any `normalizeGlobalState` tests still pass (no regression in real-load behavior).

Commit:

```bash
git commit -m "refactor: register global-state and product-context migrations"
```

---

## PR 3: CI Gate (`storage:migrate-fixtures`) + Flip `MIGRATE` to 🟩

**Intent:** Ship the CI script that enforces "every registered migration must have a paired legacy fixture + expected output", wire it into CI, then flip arch map + memory docs.

**Files:**
- New: `scripts/check-migration-fixtures.mjs`
- Modify: `package.json` (add `storage:migrate-fixtures` script)
- Modify: `.github/workflows/ci.yml` (add `npm run storage:migrate-fixtures` to verify step)
- Modify: `docs/architecture/dlens-current-architecture-map.md`
- Modify: `docs/memory/current-state.md`
- Modify: `docs/memory/latest-shared-context.md`
- New: `tests/check-migration-fixtures.test.ts` (smoke test that wraps the scanner)

### Task 3.1: CI scanner

- [ ] **Step 1: Write the script**

`scripts/check-migration-fixtures.mjs` does:
1. Import `STORAGE_MIGRATIONS` from `src/state/storage-schema.ts` (or its compiled equivalent — match the seam-guard pattern's approach).
2. For each registered migration `{ key, from, to }`, assert that `tests/fixtures/storage/${slugify(key)}-v${from}.json` and `${slugify(key)}-v${to}.json` both exist.
3. Run `runMigrationsFor` on the v<from> fixture and assert the output equals the v<to> fixture.
4. Exit non-zero on any missing fixture or mismatch.

The script runs as part of CI; it also runs as a Node test (`tests/check-migration-fixtures.test.ts`) so failures surface in the local suite.

- [ ] **Step 2: Wire CI**

Add to `package.json`:

```json
"storage:migrate-fixtures": "node scripts/check-migration-fixtures.mjs"
```

Add to `.github/workflows/ci.yml`:

```yaml
- run: npm run storage:migrate-fixtures
```

### Task 3.2: Flip `MIGRATE` to 🟩

- [ ] **Step 1: Architecture map**

Update node label, edges, class assignment, and Track A2 paragraph. The 🟩 verbatim wording for the summary line:

> `MIGRATE` is 🟩 because every storage shape change is recorded in `src/state/storage-schema.ts`, every migration entry has a legacy fixture that replays through the registry into the current shape, and `npm run storage:migrate-fixtures` enforces fixture coverage in CI at zero unregistered migrations.

- [ ] **Step 2: Memory docs**

Append the same verbatim string to `docs/memory/current-state.md` and `docs/memory/latest-shared-context.md`.

### Task 3.3: Final verification matrix

```bash
npm run typecheck
npm run storage:seam-guard -- --list
npm run boundary:guard
npm run storage:migrate-fixtures
npx tsx --test 'tests/**/*.test.ts' 'tests/**/*.test.tsx'
npm run build
git diff --check
```

Expected: all green, all guards 0, build to worktree.

Commit:

```bash
git commit -m "refactor: lock storage migration registry with CI fixture gate"
```

---

## Verification Matrix Before Merging Any Slice

```bash
npm run typecheck
npm run storage:seam-guard -- --list
npm run boundary:guard
npm run storage:migrate-fixtures   # from PR 3 onward
npx tsx --test <slice-focused-tests>
npx tsx --test 'tests/**/*.test.ts' 'tests/**/*.test.tsx'
npm run build
git diff --check
```

For PR 3, additionally confirm `docs/architecture/dlens-current-architecture-map.md` does not claim 🟩 until `STORAGE_MIGRATIONS` is non-empty and `npm run storage:migrate-fixtures` is wired into CI with passing output.

## Out Of Scope

- Background module split (`entrypoints/background.ts` still 3839 lines after this plan).
- `useInPageCollectorAppState.ts` decomposition.
- Renaming v0 storage keys to v1 names — payload `schemaVersion` already provides version safety; renames are a follow-up if there's a separate readability win.
- Backend / crawler / read-model behavior.
- New product features.
- Visual UI redesign.
- Chrome QA automation or temporary Chrome profiles.
- Direct `chrome-extension://.../sidepanel.html` QA.
- Weakening `SEAM_GUARD` / `RECONCILE` / `INVALIDATE` / `BOUNDARY` (all must stay 🟩 with verbatim wording intact).
- Removing the existing 5 boundary tests; migration tests complement, not replace.
- Down-migrations / rollback (forward-only).
- Cross-key dependencies (migration B reads from key A) — if a future migration needs cross-key data, that's a separate plan; PR 2 entries are intra-key only.

## Permanent exceptions (empty by default)

If any tolerance in `normalizeGlobalState` cannot be cleanly converted to a registered migration, document it here:

| File | Function | Tolerance | Rationale | Planned removal |
|---|---|---|---|---|

(Empty at plan-write time. PR 2 Task 2.1 audit fills this in if needed; PR 3 merge requires this table to either be empty OR every entry to have a "planned removal" milestone.)

---

## After This Plan

With `MIGRATE` 🟩, the only remaining work in the architecture map is in the 🟡 runtime/data layer:

- **`SEAM_PARTIAL` 🟡** — domain seam closure (topic / compare / full session ownership).
- **`CS` 🟡** — Content Script DOM resilience.
- **`API` / `CRAWLER` / `JOBS` 🟡** — backend job orchestration, polling, timeout.

Codex's recommended order (from the 2026-06-16 status assessment):

1. **SEAM_PARTIAL** next (cleanest scope, structural).
2. **CS + Live ingestion** (DOM resilience + Chrome QA fixture work).
3. **CRAWLER + API + JOBS** (cross-repo, backend timeout/polling).
4. **READMODEL_BACKEND 🟢 → 🟩** as cascade work once live ingestion is locked.

After step 4, the internal architecture map has no 🔴 and no 🟡 in the core extension repo. The only remaining 🟡 then sits at runtime/external boundaries (Threads DOM, backend live ingestion) — which are no longer "we don't have a guard"; they're "external systems we can't fully control."
