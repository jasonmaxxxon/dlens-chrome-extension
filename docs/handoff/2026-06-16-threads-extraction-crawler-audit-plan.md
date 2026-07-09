# Threads Extraction / Crawler Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is **preservation-first**. Do not change any crawler interaction default. Do not delete any code path. Do not run the live Threads crawler. If a step needs fixtures that do not yet exist, halt and ask — do not capture new fixtures from a live session.

**Goal:** Move `CRAWLER` from "rare-to-work, hard-to-audit" toward fixture-locked invariants and recorded operational knobs, **without changing any crawler interaction behavior, env defaults, or browser action shape**. Lock the contract first; risk-rank and change later.

**Architecture:** Two repos, three extraction layers. Extension (`src/targeting/threads.ts`) produces a descriptor on hover/click; backend adapter ranges over saved URLs; backend vendor fetcher drives Playwright; backend parser turns DOM/HTML into structured cards; normalizer projects to read model. The audit treats each layer's heuristics as load-bearing until fixture proof says otherwise.

**Tech Stack:** `dlens-product-latest` TypeScript / MV3 / Node test runner; `dlens-ingest-core` FastAPI / Python / pytest / Playwright; existing TRACE, SEAM_GUARD, RECONCILE, INVALIDATE, BOUNDARY, MIGRATE guards remain locked.

---

Date: 2026-06-16
Depends on: `docs/audit/2026-06-16-threads-extraction-crawler-code-audit.md`
Product baseline: `dlens-product-latest` `main` at `8478de0` after MIGRATE storage schema closure.
Backend baseline: `dlens-ingest-core` `main` (read-only checkout at `<ingest-core-repo>`).
Status: implementation plan, cross-repo sequence, fixture-first.

## Current Truth

`CRAWLER` is yellow in `docs/architecture/dlens-current-architecture-map.md`. The audit confirms it should stay yellow until:

- the extraction chain has fixture coverage end-to-end (not per-layer);
- the high-touch browser action budget (drill pages, wheel scroll, expand clicks) is recorded per crawl;
- the metric / author / permalink heuristics have replay tests for OP, reply, repost, quoted, and nested cases;
- author-profile hover stays opt-in by policy test;
- legacy fetch paths are marked `legacy-candidate` with call-path proof, not deleted.

The audit identified ten findings (F1–F10). This plan turns the five "可以優先做" items from the audit's `Change Policy For Future Work` into PRs, deliberately omits the seven "應該延後" items, and lands Phase A / B / C as the audit specified.

## Non-Negotiable Invariants

These must hold after every PR:

1. `TRACE`, `SEAM_GUARD`, `RECONCILE`, `INVALIDATE`, `BOUNDARY`, and `MIGRATE` stay locked. Do not weaken their tests, guard scripts, or architecture map wording.
2. **No crawler interaction default changes.** `DL_MAX_DRILL_TABS`, `DL_SCROLL_WHEEL_PX`, expand-click rounds, wait intervals, `--disable-blink-features=AutomationControlled`, and auth-file resolution all stay byte-identical.
3. **No live Threads crawl.** Every test added by this plan must run offline against saved fixtures. No browser launches against `threads.net` in CI or in worker steps.
4. **No deletion** of `fetch_page_html()`, `fetch_thread()`, `capture_archive_snapshot()`, or any vendor helper. They may be marked `legacy-candidate` in inventory; deletion needs a separate plan and call-path proof.
5. **`run_fetcher_test()` must never request `include_profile_metrics=True`.** Author-profile hover stays opt-in by explicit caller request, locked by policy test.
6. **Capture-hint mismatch is non-blocking.** Backend may log mismatch metadata but must not reject or alter a crawl based on hint divergence.
7. **Descriptor changes are additive only.** `engagement.source` and similar metadata fields are added; existing fields keep their current shape and meaning.
8. **Fixture insufficiency triggers a halt.** If a worker step needs a fixture that does not exist in saved crawl artifacts, the worker stops and asks. Do not capture new live data to fill the gap.
9. No Threads DOM selector rewrites in this plan. Replay tests assert current behavior, not desired behavior. F1–F4 selector changes belong to Phase C output.
10. No Product / Topic / PR UI changes. This plan does not touch user-visible surfaces.

## Done Condition

The plan is done when:

1. **Phase A** has shipped inventory artifacts: extension+backend static call graph, env var ledger with current defaults, artifact-produced→consumed mapping, browser action inventory, legacy-candidate ledger with call-path proof.
2. **Phase B** has shipped offline fixture replay coverage for:
   - extension descriptor (`findCardCandidate`, `buildTargetDescriptor`) over OP / direct reply / reply-with-nested-quote / repost / quoted-post / thread-with-expanded-replies / post-with-unrelated-page-counts;
   - backend `vendor/parser.py` over the same labels plus same-user-same-text-different-branch;
   - backend structured harvest over the same labels;
   - a cross-layer extraction report joining descriptor / structured cards / parser comments / normalized read model per label.
3. The crawler manifest records action budget (pages opened, wheel events, expand clicks, drill candidates attempted, elapsed seconds, stop reason, env-var snapshot) for every crawl, asserted by unit test against a recorded run, not a live run.
4. A policy test proves `run_fetcher_test()` cannot opt into `include_profile_metrics=True`; documentation flags advanced author-profile hover as opt-in only.
5. Backend reads `capture_hints` and emits non-blocking mismatch telemetry for URL canonical / author / body prefix / target type; tests assert mismatch is observed but does not change crawl outcome.
6. Extension descriptor exposes `engagement.source: "card" | "page_fallback" | "missing"`; existing tests still pass; saved sessions migrate cleanly.
7. **Phase C** has shipped a risk register ranking F1–F10 by correctness vs account-safety risk, with per-invariant single-PR change plan templates. The register names which behaviors are locked / gated / reducible / deletable, and which need owner-approved live QA before any further change.
8. Existing live QA harness fixture (`npm run qa:harness:fixture`) still passes. Existing `tests/targeting.test.ts` and `tests/threads-content.test.ts` still pass. Existing `tests/crawlers/test_threads_adapter.py` still passes.

## Status Decision Rule

Do not move `CRAWLER` out of yellow just because this plan exists.

- `CRAWLER` may move to **built/green** only after Phase A + Phase B + action-budget + policy test + mismatch telemetry + Phase C risk register all land **and** the existing happy-path live-recording fixture still passes.
- `CRAWLER` may move to **locked** only if a separate change plan (derived from Phase C) lands an automated guard catching at least the F1 metric-mis-attribution and F2 wrong-post-capture regression classes against fixtures. A pure helper test is necessary but not sufficient for locked.
- This plan does not change `API` / `JOBS` status; those are tracked by the parallel `docs/handoff/2026-06-16-backend-api-jobs-implementations-plan.md`.

## Fixture Sourcing Rule

All fixtures in PR 3 / PR 4 / PR 5 must come from **existing saved crawl artifacts** under the backend repo (e.g. prior `output/threads/*` runs) or from existing test fixtures in either repo.

If a required label has no saved artifact:

- the worker **halts** at the relevant step;
- the worker **asks** the user to supply a sanitized HTML/JSON snapshot for that label;
- the worker **does not** trigger a live crawl, ask Playwright to fetch, or simulate browser actions to generate the missing fixture.

This rule overrides "make tests pass". A missing fixture is acceptable as `xfail` / `skip` with an owner-tracked TODO; a synthetic or live-recaptured fixture is not.

## Cross-Repo File Map

Backend (`dlens-ingest-core`):

- Modify: `src/dlens_ingest_core/crawlers/threads/adapter.py` (PR 5: read capture_hints, emit mismatch; PR 2: thread action-budget summary into return path)
- Modify: `src/dlens_ingest_core/crawlers/threads/fetcher_runtime.py` (PR 2: emit action-budget manifest)
- Modify or extend: `src/dlens_ingest_core/crawlers/threads/vendor/fetcher.py` (PR 2: surface counters via callback or context; no behavior change)
- Test: `tests/crawlers/test_threads_adapter.py` (extend for hint mismatch telemetry)
- Test (new): `tests/crawlers/test_threads_parser_fixtures.py`
- Test (new): `tests/crawlers/test_threads_structured_harvest_fixtures.py`
- Test (new): `tests/crawlers/test_threads_action_budget.py`
- Test (new): `tests/crawlers/test_threads_profile_hover_policy.py`
- Test (new): `tests/crawlers/test_threads_capture_hint_mismatch.py`
- Fixture root (new): `tests/crawlers/fixtures/threads/{label}/raw.html`, `tests/crawlers/fixtures/threads/{label}/structured.json`
- Doc (new): `docs/audit/2026-06-16-threads-call-graph.md`
- Doc (new): `docs/audit/2026-06-16-threads-env-ledger.md`
- Doc (new): `docs/audit/2026-06-16-threads-artifacts-map.md`
- Doc (new): `docs/audit/2026-06-16-threads-browser-actions.md`
- Doc (new): `docs/audit/2026-06-16-threads-legacy-candidate-ledger.md`

Product (`dlens-product-latest`):

- Modify: `src/targeting/threads.ts` (PR 3: annotate descriptor with engagement source; no selector change)
- Modify: `src/contracts/ingest.ts` or `src/targeting/types.ts` (PR 3: additive descriptor field; PR 5: hint shape stays unchanged but typed if missing)
- Test: `tests/targeting.test.ts` (existing — keep green)
- Test: `tests/threads-content.test.ts` (existing — keep green)
- Test (new): `tests/targeting-descriptor-fixtures.test.ts`
- Test (new): `tests/targeting-engagement-source.test.ts`
- Fixture root (new): `tests/fixtures/threads/descriptor/{label}.html`, `tests/fixtures/threads/descriptor/{label}.expected.json`
- Doc (new): `docs/audit/2026-06-16-threads-cross-layer-extraction-report.md` (PR 5; landed in the product repo for cross-repo visibility)
- Doc (new): `docs/handoff/2026-06-16-threads-extraction-crawler-risk-register.md` (PR 6)

## PR 1: Phase A Inventory (Read-Only)

**Repo:** both. Docs only. No code changes.

**Goal:** Make the current extraction chain auditable on paper before any test or telemetry change. This is the artifact the audit's Phase A names.

**Files:**

- Create (backend repo): `docs/audit/2026-06-16-threads-call-graph.md`
- Create (backend repo): `docs/audit/2026-06-16-threads-env-ledger.md`
- Create (backend repo): `docs/audit/2026-06-16-threads-artifacts-map.md`
- Create (backend repo): `docs/audit/2026-06-16-threads-browser-actions.md`
- Create (backend repo): `docs/audit/2026-06-16-threads-legacy-candidate-ledger.md`

### Task 1.1: Static call graph

- [ ] **Step 1: Trace extension capture path**

  From `entrypoints/threads.content.ts` document the call chain through `findCardCandidate` → `buildTargetDescriptor` → `publishHoveredDescriptor` → background `selection/hovered` → popup save → `request-reconcile` seam. Use file:line references.

- [ ] **Step 2: Trace backend crawl path**

  From `ThreadsCrawlerAdapter.crawl()` through `fetch_threads_post()` → `run_fetcher_test()` → vendor harvest → parser → `normalize.py`. Note the temporary output directory boundary and the auth-file guard.

- [ ] **Step 3: Trace each vendor helper to its entry**

  For every public callable in `vendor/fetcher.py`, `vendor/parser.py`, `vendor/scroll_utils.py`, list its production callers using `rg`. Mark callers as `active` or `legacy-candidate`. **Do not delete** legacy candidates; the ledger is the deliverable.

### Task 1.2: Environment variable ledger

- [ ] **Step 1: Enumerate env vars affecting crawler behavior**

  At minimum: `DL_MAX_DRILL_TABS`, `DL_SCROLL_WHEEL_PX`, scroll wait intervals, plateau / coverage caps, auth-file path. For each, record: default value, code location, observed effect, audit risk class (correctness vs operational).

- [ ] **Step 2: Mark each var as `locked-operational-knob` or `safe-to-tune`**

  Per the audit's F7, treat scroll / wheel / automation flags as `locked-operational-knob` until a separate change plan proves otherwise.

### Task 1.3: Artifact-produced-→-consumed map

- [ ] **Step 1: List artifacts emitted by `run_fetcher_test()`**

  Raw HTML, raw cards JSON, structured threads JSON, comment edges JSON, manifest. For each, record: producer code path, consumer code path, whether normalizer reads it, whether read model exposes it.

- [ ] **Step 2: Flag unconsumed artifacts as `legacy-candidate`**

  Do not delete. The ledger feeds Phase C.

### Task 1.4: Browser action inventory

- [ ] **Step 1: Catalogue actions per crawl phase**

  Navigation, scroll wheel events, hover, click, new-page-open, drill-page-open. For each, record default count, env var that bounds it, observed worst case, whether it is currently bot-classification-sensitive (per F5/F7).

### Task 1.5: Legacy-candidate ledger

- [ ] **Step 1: Cross-reference Task 1.1 + Task 1.3**

  Produce a single table: function/artifact, current call-path status, evidence (`rg` output excerpts), audit finding reference (F9 mostly), proposed disposition (`keep` / `mark legacy-candidate` / `needs Phase C decision`).

  **No `delete` disposition in this PR.** Even `mark legacy-candidate` is a docstring/comment annotation only — no code deletion.

### Task 1.6: Commit

- [ ] **Step 1: Commit Phase A docs (backend repo)**

  ```bash
  cd <ingest-core-repo>
  git add docs/audit/2026-06-16-threads-call-graph.md docs/audit/2026-06-16-threads-env-ledger.md docs/audit/2026-06-16-threads-artifacts-map.md docs/audit/2026-06-16-threads-browser-actions.md docs/audit/2026-06-16-threads-legacy-candidate-ledger.md
  git commit -m "docs(crawler): inventory threads extraction call graph and operational knobs"
  ```

## PR 2: Action Budget Manifest + Profile Hover Policy Test

**Repo:** `dlens-ingest-core`

**Goal:** Make high-touch browser action behavior observable per crawl, and lock the author-profile hover opt-in by policy test. **No interaction defaults change.**

**Files:**

- Modify: `src/dlens_ingest_core/crawlers/threads/fetcher_runtime.py`
- Modify or extend: `src/dlens_ingest_core/crawlers/threads/vendor/fetcher.py` (surface counters; no behavior change)
- Modify: `src/dlens_ingest_core/crawlers/threads/adapter.py` (return manifest summary in crawl result)
- Test (new): `tests/crawlers/test_threads_action_budget.py`
- Test (new): `tests/crawlers/test_threads_profile_hover_policy.py`

### Task 2.1: Add action-budget counters (surface, do not change)

- [ ] **Step 1: Write failing fixture-replay test**

  Add `tests/crawlers/test_threads_action_budget.py` asserting that a recorded run's manifest includes counters:

  ```py
  def test_threads_crawl_manifest_records_action_budget(recorded_crawl):
      manifest = recorded_crawl.manifest

      assert "action_budget" in manifest
      budget = manifest["action_budget"]
      assert budget["pages_opened"] >= 1
      assert budget["wheel_events"] >= 0
      assert budget["expand_clicks"] >= 0
      assert budget["drill_candidates_attempted"] >= 0
      assert budget["elapsed_seconds"] >= 0
      assert budget["stop_reason"] in {"cap", "budget", "coverage", "plateau", "completed"}
      assert "env_snapshot" in budget
      assert budget["env_snapshot"]["DL_MAX_DRILL_TABS"] is not None
      assert budget["env_snapshot"]["DL_SCROLL_WHEEL_PX"] is not None
  ```

  `recorded_crawl` is a **fixture** built from saved artifacts (see Fixture Sourcing Rule). If no recorded crawl manifest is available, halt and ask.

- [ ] **Step 2: Run tests and confirm RED**

  ```bash
  cd <ingest-core-repo>
  python -m pytest tests/crawlers/test_threads_action_budget.py -q
  ```

- [ ] **Step 3: Thread counters through the existing fetcher**

  Add a counter object passed into `run_fetcher_test()` / vendor scroll + drill code. Increment on each action site. **Do not change loop bounds, defaults, or order of operations.** The counter is observation-only.

  When the run finishes, emit counters + env snapshot + stop reason into the manifest emitted by `fetcher_runtime.py`, surfaced through `ThreadsCrawlerAdapter.crawl()`'s return path.

- [ ] **Step 4: Run backend verification**

  ```bash
  python -m pytest tests/crawlers/test_threads_action_budget.py tests/crawlers/test_threads_adapter.py -q
  python -m pytest -q
  ```

  Expected: action-budget test passes; existing adapter test still green; full suite green.

### Task 2.2: Profile-hover policy test

- [ ] **Step 1: Write failing policy test**

  Add `tests/crawlers/test_threads_profile_hover_policy.py`:

  ```py
  def test_run_fetcher_test_never_requests_profile_hover():
      """Default crawl path must not opt into author-profile hover (F6)."""
      # Read run_fetcher_test source / assert via call inspection that
      # extract_metrics is never invoked with include_profile_metrics=True.
      # If the project prefers a runtime check, monkeypatch extract_metrics
      # and assert the kwarg is False or unset across all call sites.
      ...
  ```

  Choose the assertion technique that best fits the codebase (static AST scan, monkeypatch sentinel, or contract test on a wrapper). Document the choice inline.

- [ ] **Step 2: Run tests and confirm GREEN immediately**

  This test should pass with current code. Its purpose is to **fail in the future** if someone opts default crawl into profile hover.

  ```bash
  python -m pytest tests/crawlers/test_threads_profile_hover_policy.py -q
  ```

### Task 2.3: Documentation note

- [ ] **Step 1: Add an opt-in note**

  In `src/dlens_ingest_core/crawlers/threads/vendor/fetcher.py` near `_extract_author_profile_metrics()`, add a single short comment: this path hovers author links; only callers explicitly requesting `include_profile_metrics=True` may use it; default crawl must not.

  This is the only commentary added by this PR. Do not annotate every function.

### Task 2.4: Commit

- [ ] **Step 1: Commit**

  ```bash
  git add src/dlens_ingest_core/crawlers/threads/fetcher_runtime.py src/dlens_ingest_core/crawlers/threads/adapter.py src/dlens_ingest_core/crawlers/threads/vendor/fetcher.py tests/crawlers/test_threads_action_budget.py tests/crawlers/test_threads_profile_hover_policy.py
  git commit -m "feat(crawler): record threads action budget; lock profile-hover opt-in"
  ```

## PR 3: Engagement Source Labels + Extension Descriptor Fixture Replay

**Repo:** `dlens-product-latest`

**Goal:** Lock current extension descriptor behavior with offline fixture replay, and mark engagement provenance so the next phase can decide whether `page_fallback` is acceptable per surface. **No selector change.**

**Files:**

- Modify: `src/targeting/threads.ts`
- Modify: `src/contracts/ingest.ts` or `src/targeting/types.ts` (additive descriptor field)
- Test (new): `tests/targeting-descriptor-fixtures.test.ts`
- Test (new): `tests/targeting-engagement-source.test.ts`
- Test: `tests/targeting.test.ts` (verify still green)
- Test: `tests/threads-content.test.ts` (verify still green)
- Fixtures (new): `tests/fixtures/threads/descriptor/{label}.html`, `tests/fixtures/threads/descriptor/{label}.expected.json`

### Task 3.1: Add `engagement.source` field (additive)

- [ ] **Step 1: Write failing source-label test**

  Add `tests/targeting-engagement-source.test.ts`:

  ```ts
  test("descriptor records engagement source as card when counts come from selected card", () => {
    // Load fixture: op-post.html with counts inside the card
    // Build descriptor
    // assert descriptor.engagement.source === "card"
  });

  test("descriptor records engagement source as page_fallback when counts come from document body", () => {
    // Load fixture: op-post-counts-outside-card.html
    // assert descriptor.engagement.source === "page_fallback"
  });

  test("descriptor records engagement source as missing when neither card nor body has counts", () => {
    // Load fixture: reply-no-counts.html
    // assert descriptor.engagement.source === "missing"
  });
  ```

- [ ] **Step 2: Run tests and confirm RED**

  ```bash
  cd <product-repo>
  npx tsx --test tests/targeting-engagement-source.test.ts
  ```

- [ ] **Step 3: Annotate `resolveEngagement()`**

  In `src/targeting/threads.ts`, change `resolveEngagement()` to return both the resolved counts (unchanged) **and** a `source` discriminator: `"card" | "page_fallback" | "missing"`. Thread the source into the descriptor under `engagement.source`.

  Add the field to the TypeScript contract additively. Existing readers ignore it; new tests assert it.

  **Do not change** which counts get picked. The selector / fallback logic is preserved byte-for-byte.

- [ ] **Step 4: Run product verification**

  ```bash
  npm run typecheck
  npx tsx --test tests/targeting-engagement-source.test.ts tests/targeting.test.ts tests/threads-content.test.ts
  npx tsx --test tests/*.test.ts tests/*.test.tsx
  npm run storage:seam-guard
  npm run boundary:guard
  npm run storage:migrate-fixtures
  npm run qa:harness:fixture
  npm run build
  git diff --check
  ```

  Expected: all pass. Migration check confirms `engagement.source` is backward-compatible against saved sessions.

### Task 3.2: Descriptor fixture replay

- [ ] **Step 1: Inventory available source HTML**

  Search saved crawl artifacts in the backend repo (e.g. `output/threads/<post-id>/raw.html` from prior runs) and existing test fixtures in both repos for HTML representative of:

  | Label | Audit reference |
  | --- | --- |
  | `op-post` | F2 OP heuristic |
  | `direct-reply` | F2 reply heuristic |
  | `reply-with-nested-quote` | F2, F3 |
  | `repost` | F2 repost-aware skip |
  | `quoted-post` | F2 nested `/post/` |
  | `thread-with-expanded-replies` | F5 drill output |
  | `post-with-unrelated-page-counts` | F1 page-wide fallback |

  Copy a sanitized HTML snapshot into `tests/fixtures/threads/descriptor/{label}.html`. Sanitize means: remove auth cookies, viewer-identifying tokens, and any PII unrelated to the post-under-test. Do not edit DOM structure.

  **If a label has no available source HTML, halt and ask.** Do not generate synthetic HTML and do not run a live crawl.

- [ ] **Step 2: Capture expected descriptor JSON**

  For each fixture, run the current `findCardCandidate` + `buildTargetDescriptor` and snapshot the output to `tests/fixtures/threads/descriptor/{label}.expected.json`. The snapshot represents **current behavior**, not desired behavior. F2-class drift is what we want the test to expose later.

- [ ] **Step 3: Write fixture replay test**

  Add `tests/targeting-descriptor-fixtures.test.ts`:

  ```ts
  test.each(labels)("descriptor replay: %s", (label) => {
    const dom = loadFixture(`tests/fixtures/threads/descriptor/${label}.html`);
    const expected = loadJson(`tests/fixtures/threads/descriptor/${label}.expected.json`);

    const candidate = findCardCandidate(dom.target);
    const descriptor = buildTargetDescriptor(candidate);

    assert.deepEqual(
      pick(descriptor, ["targetType", "postUrl", "authorHint", "bodyText", "engagement.source"]),
      expected
    );
  });
  ```

  Assert only the fields above (the audit-named invariants). Do not assert every descriptor field — that creates noise.

- [ ] **Step 4: Run product verification**

  ```bash
  npm run typecheck
  npx tsx --test tests/targeting-descriptor-fixtures.test.ts
  npx tsx --test tests/*.test.ts tests/*.test.tsx
  npm run qa:harness:fixture
  npm run build
  ```

### Task 3.3: Commit

- [ ] **Step 1: Commit**

  ```bash
  git add src/targeting/threads.ts src/contracts/ingest.ts src/targeting/types.ts tests/targeting-engagement-source.test.ts tests/targeting-descriptor-fixtures.test.ts tests/fixtures/threads/descriptor
  git commit -m "feat(targeting): label threads engagement source; lock descriptor with fixture replay"
  ```

## PR 4: Backend Parser + Structured Harvest Fixture Replay

**Repo:** `dlens-ingest-core`

**Goal:** Lock current backend parser and structured-harvest behavior with offline fixture replay against the same labels used in PR 3. Surface (not fix) F3 DOM-order assumption and F4 `(user, text)` de-dupe collision.

**Files:**

- Test (new): `tests/crawlers/test_threads_parser_fixtures.py`
- Test (new): `tests/crawlers/test_threads_structured_harvest_fixtures.py`
- Fixtures (new): `tests/crawlers/fixtures/threads/{label}/raw.html`, `tests/crawlers/fixtures/threads/{label}/structured.json`, `tests/crawlers/fixtures/threads/{label}/comment_edges.json`, `tests/crawlers/fixtures/threads/{label}/expected_parser.json`, `tests/crawlers/fixtures/threads/{label}/expected_structured.json`

### Task 4.1: Stage fixtures with shared labels

- [ ] **Step 1: Mirror PR 3 labels in backend repo**

  For each label staged in PR 3, copy or sanitize the corresponding saved crawl artifact set into `tests/crawlers/fixtures/threads/{label}/`. Labels:

  - `op-post`
  - `direct-reply`
  - `reply-with-nested-quote`
  - `repost`
  - `quoted-post`
  - `thread-with-expanded-replies`
  - `post-with-unrelated-page-counts` (HTML only — parser may not exercise this)

  Plus one backend-specific label per F4:

  - `same-user-same-text-different-branch`

  **If a label has no saved artifact set, halt and ask.** Synthetic HTML is not acceptable.

- [ ] **Step 2: Capture expected parser output**

  Run the current `vendor/parser.py` `extract_data_from_html()` over each fixture's raw HTML. Snapshot the structured output (main post, comments list, de-dupe collapsing) into `expected_parser.json`. **Current behavior**, not desired.

- [ ] **Step 3: Capture expected structured harvest output**

  Run the current structured-harvest path over the saved structured/comment-edges JSON. Snapshot into `expected_structured.json`.

### Task 4.2: Parser replay test

- [ ] **Step 1: Write failing replay test**

  Add `tests/crawlers/test_threads_parser_fixtures.py`:

  ```py
  @pytest.mark.parametrize("label", THREADS_FIXTURE_LABELS)
  def test_threads_parser_replay(label):
      html = read_fixture(f"threads/{label}/raw.html")
      expected = read_json_fixture(f"threads/{label}/expected_parser.json")

      result = extract_data_from_html(html)

      assert result["main_post"]["author"] == expected["main_post"]["author"]
      assert result["main_post"]["body_text"] == expected["main_post"]["body_text"]
      assert [c["text"] for c in result["comments"]] == [c["text"] for c in expected["comments"]]
      # F4: de-dupe collision surfaced — same-user-same-text-different-branch
      # current behavior collapses; assertion documents that.
  ```

- [ ] **Step 2: Confirm GREEN immediately**

  These are characterization tests; they should pass against unchanged parser code. Their job is to **fail in the future** if a parser change drifts a label.

  ```bash
  cd <ingest-core-repo>
  python -m pytest tests/crawlers/test_threads_parser_fixtures.py -q
  ```

### Task 4.3: Structured harvest replay test

- [ ] **Step 1: Write structured-harvest replay test**

  Add `tests/crawlers/test_threads_structured_harvest_fixtures.py`. Same structure as Task 4.2, asserting structured cards and comment-edges JSON outputs match snapshots.

- [ ] **Step 2: Confirm GREEN**

  ```bash
  python -m pytest tests/crawlers/test_threads_structured_harvest_fixtures.py -q
  python -m pytest -q
  ```

### Task 4.4: Document the surfaced collisions

- [ ] **Step 1: Update legacy-candidate ledger from PR 1**

  In `docs/audit/2026-06-16-threads-legacy-candidate-ledger.md`, add a section noting which labels currently exhibit F3 (DOM order misalignment) and F4 (de-dupe collapse) under the present parser. This is data for Phase C, not a change.

### Task 4.5: Commit

- [ ] **Step 1: Commit**

  ```bash
  git add tests/crawlers/test_threads_parser_fixtures.py tests/crawlers/test_threads_structured_harvest_fixtures.py tests/crawlers/fixtures/threads docs/audit/2026-06-16-threads-legacy-candidate-ledger.md
  git commit -m "test(crawler): replay threads parser and structured harvest fixtures"
  ```

## PR 5: Cross-Layer Extraction Report + Capture-Hint Mismatch Telemetry

**Repo:** both.

**Goal:** Land the audit's Phase B cross-layer report, and start observing hint divergence non-blockingly. The report drives Phase C decisions; the telemetry surfaces F8 without changing crawl outcomes.

### Task 5.1: Cross-layer extraction report (product repo)

- [ ] **Step 1: Author the cross-layer report**

  Create `docs/audit/2026-06-16-threads-cross-layer-extraction-report.md`. For each label staged in PR 3 + PR 4, fill a row:

  | label | extension `targetType` | extension `authorHint` | extension `postUrl` | backend structured main post | backend parser comment count | normalized read model post | mismatch flag |

  Source rows from PR 3 / PR 4 fixture outputs by hand (or a one-off script run locally). The deliverable is the markdown table itself; no runtime tool needs to be productionized in this PR.

  Add a short trailing section: "what looks divergent across layers" — narrative observations, no code recommendations. Phase C will turn observations into change items.

### Task 5.2: Capture-hint mismatch telemetry (backend repo)

- [ ] **Step 1: Write failing telemetry test**

  Add `tests/crawlers/test_threads_capture_hint_mismatch.py`:

  ```py
  def test_adapter_logs_hint_mismatch_without_blocking_crawl(recorded_crawl_with_hints):
      adapter = ThreadsCrawlerAdapter(...)

      result = adapter.crawl(
          target=recorded_crawl_with_hints.target,
          capture_hints={
              "expected_author": "different_author",
              "expected_post_url_canonical": "https://www.threads.net/@x/post/000",
              "expected_body_prefix": "totally unrelated text",
              "expected_target_type": "reply",
          },
      )

      assert result.success is True  # crawl must NOT fail because of mismatch
      mismatches = result.diagnostics["capture_hint_mismatches"]
      assert "author" in mismatches
      assert "post_url_canonical" in mismatches
      assert "body_prefix" in mismatches
      assert "target_type" in mismatches


  def test_adapter_emits_no_mismatch_when_hints_align(recorded_crawl_with_hints):
      adapter = ThreadsCrawlerAdapter(...)
      result = adapter.crawl(
          target=recorded_crawl_with_hints.target,
          capture_hints=recorded_crawl_with_hints.matching_hints,
      )

      assert result.success is True
      assert result.diagnostics.get("capture_hint_mismatches", {}) == {}
  ```

  `recorded_crawl_with_hints` is a fixture combining a saved crawl artifact with a known-good hint set (and a deliberately mismatched hint set). If saved artifacts cannot supply this, halt and ask.

- [ ] **Step 2: Run tests and confirm RED**

  ```bash
  cd <ingest-core-repo>
  python -m pytest tests/crawlers/test_threads_capture_hint_mismatch.py -q
  ```

- [ ] **Step 3: Implement non-blocking mismatch**

  In `src/dlens_ingest_core/crawlers/threads/adapter.py`:

  - **Stop discarding `capture_hints`.** Read it; do not delete.
  - After crawl returns, compare hint fields (`expected_author`, `expected_post_url_canonical`, `expected_body_prefix`, `expected_target_type`) against the normalized crawl result.
  - Emit a `capture_hint_mismatches` dict into the diagnostics surface of the result, keyed by mismatch type with `{hint, observed}` payloads.
  - **Mismatch must not change `result.success`**, must not retry, must not alter normalized output. It is observation-only per F8.

- [ ] **Step 4: Run backend verification**

  ```bash
  python -m pytest tests/crawlers/test_threads_capture_hint_mismatch.py tests/crawlers/test_threads_adapter.py -q
  python -m pytest -q
  ```

### Task 5.3: Cross-repo verification

- [ ] **Step 1: Run product side checks too**

  Even though PR 5 does not modify product source, run product checks to confirm nothing in the recent PRs interacts:

  ```bash
  cd <product-repo>
  npm run typecheck
  npx tsx --test tests/*.test.ts tests/*.test.tsx
  npm run qa:harness:fixture
  npm run build
  ```

### Task 5.4: Commit

- [ ] **Step 1: Commit backend changes**

  ```bash
  cd <ingest-core-repo>
  git add src/dlens_ingest_core/crawlers/threads/adapter.py tests/crawlers/test_threads_capture_hint_mismatch.py
  git commit -m "feat(crawler): log non-blocking capture-hint mismatches"
  ```

- [ ] **Step 2: Commit cross-layer report**

  ```bash
  cd <product-repo>
  git add docs/audit/2026-06-16-threads-cross-layer-extraction-report.md
  git commit -m "docs(crawler): cross-layer threads extraction report"
  ```

## PR 6: Phase C Risk Register + Per-Invariant Change Plan

**Repo:** `dlens-product-latest`. Docs only.

**Goal:** Convert Phase A + B evidence into a ranked risk register, and stage per-invariant change plans **without authorizing any of them**. This PR closes the audit's Phase C scope. Each downstream change plan is a separate follow-up PR with its own owner approval.

**Files:**

- Create: `docs/handoff/2026-06-16-threads-extraction-crawler-risk-register.md`
- Modify: `docs/architecture/dlens-current-architecture-map.md` (status note only — see Task 6.3)
- Modify: `docs/memory/current-state.md`
- Modify: `docs/memory/latest-shared-context.md`

### Task 6.1: Author the risk register

- [ ] **Step 1: Rank F1–F10 along two axes**

  For each finding, record: correctness risk (low/med/high), account-safety risk (low/med/high), evidence pointers (which PR 3 / PR 4 / PR 5 fixture or report row), recommended disposition (`locked` / `gated by manual QA` / `reducible with fixture proof` / `deletable after call-path proof` / `needs Phase D`).

  Disposition rules per audit `Change Policy For Future Work`:

  - F1 `page-wide engagement fallback` → reducible, requires fixture proof that `card`-source counts cover real product surfaces.
  - F2 `permalink/author heuristic` → reducible, requires F2 fixture pass + extension descriptor change in a dedicated PR.
  - F3 `parser DOM-order assumption` → reducible, requires structured-vs-parser cross-check stable on all labels.
  - F4 `(user, text)` de-dupe → reducible, requires stable id/parent signal.
  - F5 `backend drill` → **locked**. Reductions require owner-approved live QA.
  - F6 `profile hover` → **locked** via policy test (PR 2). Any change is reviewer-approved.
  - F7 `scroll / automation flags` → **locked**.
  - F8 `capture_hints` → telemetry exists (PR 5); promotion to blocking requires live variance data.
  - F9 `legacy fetch paths` → marked `legacy-candidate` (PR 1); deletion is a per-symbol follow-up PR after call-path proof.
  - F10 `multi-layer parser drift` → reducible after cross-layer report (PR 5) shows real divergence.

### Task 6.2: Per-invariant change plan templates

- [ ] **Step 1: Write skeletons for the reducible items**

  In the same risk register, add a "change plan template" subsection per reducible finding. Each template names the single invariant the future PR will move, the fixture proof required, the rollback criterion, and the owner-approval requirement.

  Do not author the change PRs in this plan. The templates are starting points.

### Task 6.3: Architecture map status update (conservative)

- [ ] **Step 1: Decide CRAWLER status honestly**

  `CRAWLER` may move from yellow to **built/green** only if all of:

  - PR 1 inventory landed;
  - PR 2 action budget + policy test landed and passing;
  - PR 3 descriptor fixture replay landed and passing;
  - PR 4 parser + structured harvest fixture replay landed and passing;
  - PR 5 mismatch telemetry landed and passing;
  - PR 6 risk register landed;
  - existing `npm run qa:harness:fixture` and backend `pytest` suite still green.

  Otherwise leave it yellow.

  Suggested wording if upgrading:

  ```md
  `CRAWLER` is built/green for the inventory + fixture-replay + observation
  contract: extension descriptor and backend parser/structured harvest are
  locked against shared fixture labels (OP / reply / nested quote / repost /
  quoted / expanded replies / unrelated page counts), crawl manifest records
  the per-run action budget and env snapshot, author-profile hover is opt-in
  only by policy test, and capture-hint mismatches are observed non-blockingly.
  Selector / parser correctness changes (F1–F4, F10) are tracked in the risk
  register and remain individually gated.
  ```

  **Do not** mark `CRAWLER` locked. Locked requires an automated guard against the F1 / F2 regression classes, which the risk-register follow-up PRs deliver.

- [ ] **Step 2: Update memory docs**

  Update `docs/memory/current-state.md` and `docs/memory/latest-shared-context.md` only with the status / contract observation. Do not narrate Phase D plans there.

### Task 6.4: Commit

- [ ] **Step 1: Final verification**

  ```bash
  cd <product-repo>
  npm run typecheck
  npx tsx --test tests/*.test.ts tests/*.test.tsx
  npm run storage:seam-guard
  npm run boundary:guard
  npm run storage:migrate-fixtures
  npm run qa:harness:fixture
  npm run build
  git diff --check
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/handoff/2026-06-16-threads-extraction-crawler-risk-register.md docs/architecture/dlens-current-architecture-map.md docs/memory/current-state.md docs/memory/latest-shared-context.md
  git commit -m "docs(crawler): risk register and conservative status update"
  ```

## Required Fixture Labels (Reference)

These must appear with identical names in extension and backend fixture directories. PR 3 stages the extension set; PR 4 stages the backend set; PR 5 joins them in the cross-layer report.

```txt
op-post
direct-reply
reply-with-nested-quote
repost
quoted-post
thread-with-expanded-replies
post-with-unrelated-page-counts
same-user-same-text-different-branch   # backend only (F4)
```

Future PRs must not silently remove or rename a label. The cross-layer report assumes set equality on the first seven.

## Out Of Scope

Per the audit's `應該延後的高風險變動` and `Behavior That Should Be Preserved` lists, this plan **must not**:

- Change `DL_SCROLL_WHEEL_PX`, scroll wait intervals, or any wheel-event timing (F7).
- Change `DL_MAX_DRILL_TABS` or expand-click round counts (F5).
- Remove `--disable-blink-features=AutomationControlled` or related launch flags (F7).
- Enable `include_profile_metrics=True` on default crawl path (F6).
- Delete `fetch_page_html()`, `fetch_thread()`, `capture_archive_snapshot()`, or any vendor helper (F9). Marking `legacy-candidate` in docs is allowed; code deletion is not.
- Rewrite `findCardCandidate`, `extractPermalink`, `extractAuthorHint`, `resolveEngagement`, or `extract_data_from_html` selector logic. Selector changes belong to per-invariant Phase D PRs derived from the risk register.
- Promote capture-hint mismatch from non-blocking telemetry to crawl rejection.
- Touch click-interception guard, selection-mode listener gating, SPA reset, popup-save hover channel, backend auth-file guard, temporary output directory, scroll/coverage/plateau caps, or author-profile hover default skip.
- Make any change to Product / Topic / PR UI surfaces.
- Move `API` / `JOBS` status (separate plan).
- Run the live Threads crawler in CI or worker steps.
- Capture new live fixtures to fill gaps. Halt and ask instead.
- Weaken `TRACE`, `SEAM_GUARD`, `RECONCILE`, `INVALIDATE`, `BOUNDARY`, or `MIGRATE` guards.

## Recommended Order

1. **PR 1 first.** Inventory is cheap, read-only, and grounds every subsequent PR. Without it, action-budget / fixture / report PRs lack call-graph evidence.
2. **PR 2 second.** Action-budget manifest is additive and gives every later live observation a numerical backbone. The profile-hover policy test is a tiny lock that prevents the most damaging accidental regression.
3. **PR 3 and PR 4 in parallel** if owner allows; otherwise PR 3 then PR 4. They share fixture labels but touch independent repos. Either order works as long as both land before PR 5.
4. **PR 5 fourth.** Cross-layer report needs PR 3 + PR 4 fixture outputs; mismatch telemetry is independent but pairs naturally as the "Phase B observation closure".
5. **PR 6 last.** Risk register quotes evidence from PR 1 / 3 / 4 / 5. Architecture status moves only after the contract is locked.

Per-invariant change PRs (selector fixes, parser corrections, drill-budget reductions) are explicitly **not** part of this plan. They are scheduled by the PR 6 risk register, gated by fixture proof + owner approval, and each touches one invariant only.
