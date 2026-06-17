# Threads extraction / crawler — Phase C risk register

Date: 2026-06-17
Plan: `docs/handoff/2026-06-16-threads-extraction-crawler-audit-plan.md`
Phase A evidence: `docs/audit/2026-06-16-threads-call-graph.md`, `…-env-ledger.md`, `…-artifacts-map.md`, `…-threads-browser-actions.md`, `…-threads-legacy-candidate-ledger.md` (in `dlens-ingest-core`).
Phase B evidence: `tests/crawlers/fixtures/threads/rich-thread/`, `tests/targeting-fixture-replay.test.ts`, `tests/crawlers/test_threads_parser_fixtures.py`, `tests/crawlers/test_threads_capture_hint_mismatch.py`, `docs/audit/2026-06-16-threads-cross-layer-extraction-report.md`.

Status: Phase C closure. **No selector / parser / drill changes land
from this document.** Each row's `disposition` names what should
happen next; per-finding Phase D PRs are templated below.

## Ranking

Axes per the audit plan:
- **Correctness risk** = the system can return a "successful" capture that disagrees with the user-visible truth.
- **Account safety risk** = the change in question affects how observable the crawler is to Threads bot classification.

| Finding | Headline | Correctness | Account safety | Replay coverage | Disposition |
| --- | --- | --- | --- | --- | --- |
| F1 | page-wide engagement fallback can mis-attribute views/followers | **High** | Low | `engagement_source` field exists; replay locks `card` for rich-thread (no fallback path exercised); `page_fallback` path needs `post-with-unrelated-page-counts` fixture | reducible — gate on missing-label fixture |
| F2 | permalink / author selection is heuristic | **High** | Low | replay locks `author_hint=aiposthub` for OP + OP self-reply via body-text hover; permalink-anchor hover still produces wrong author in JSDOM (test environment artifact, but reflects real F2 risk) | reducible — gate on direct-reply / repost / quoted-post fixtures |
| F3 | parser assumes `posts[0]=main`, `posts[1:]=comments` | **High** | Low | parser replay locks 6-comment count for rich-thread; recommendation / repost interleaving labels still uncovered | reducible — gate on repost / quoted-post fixtures, then write a `posts[0]` invariant test |
| F4 | comment dedup by `(user, text)` may collapse replies | Medium | Low | parser replay confirms OP-continuation chain (same author, different texts) survives dedup; explicit same-text collision still uncovered | reducible — needs `same-user-same-text-different-branch` fixture before any logic change |
| F5 | backend drill is high-touch (2 rounds × 6 clicks per page × 5 drill candidates = up to 60 expand-clicks per crawl) | Low | **High** | action_budget manifest now records counts; rich-thread capture intentionally skipped drill to lower exposure; live drill counts still uncaptured | **locked** — defaults must not change without owner-approved live QA; new fixture-with-drill needs a separate authorized capture |
| F6 | author-profile hover exists; must stay opt-in | High if breached | **High** if breached | policy test pins `run_fetcher_test` source against `include_profile_metrics=True` and pins `extract_metrics` keyword default to `False`; F6 inline comment added | **locked** — policy test must keep passing forever; opt-in path can change only through the documented `fetch_advanced_metrics` channel |
| F7 | wheel-scroll distance + automation launch flags shape observability | Medium | **High** | env_ledger enumerates 16 knobs + hard-coded launch flags; manifest now records env_snapshot per crawl | **locked** — `DL_SCROLL_WHEEL_PX`, `DL_SCROLL_WAIT_MS`, `DL_HARD_CAP_SCROLL_ROUNDS`, `--disable-blink-features=AutomationControlled` change only with owner-approved live QA |
| F8 | adapter ignored `capture_hints` (no client-side cross-check) | Medium | Low | adapter now reads hints, diffs them against canonical_post, surfaces mismatches in `crawl_meta.capture_hint_mismatches` + WARNING log; non-blocking by design | reducible — promote to **blocking** only after live variance data shows the mismatch rate is low |
| F9 | legacy fetch paths still exist (`fetch_thread`, `fetch_page_html`, `capture_archive_snapshot`); plus the `src/scraper/` shim partials and `vendor/login.py` chain | Low | Low | legacy-candidate ledger has full call-path grep proof; nothing deleted | deletable per-symbol — each removal needs a single-purpose PR with the characterization test for the *active* path written first |
| F10 | three independent DOM parse layers (extension descriptor, backend structured harvest, backend parser) drift independently | Medium | Low | cross-layer extraction report documents the rich-thread divergences (structured harvest loses `user`; extension descriptor contaminates `text_snippet` prefix; parser mis-attributes pinned CTA as author `Pin icon`) | reducible — every divergence is a Phase D candidate; ordering depends on which divergence surfaces in the most-active user flow |

## Per-finding Phase D PR templates

The plan's PR 6 task 6.2 asks for skeletons future PRs can pick up
without re-deriving the analysis. Each template names the single
invariant moved, the fixture proof required, the rollback criterion,
and the owner approval gate.

### F1 — kill the page-wide engagement fallback when it's the wrong signal

```yaml
invariant: engagement_source MUST be "card" for posts where the card itself surfaces views/followers
required fixture: post-with-unrelated-page-counts/raw.html + .expected.json
rollback criterion: if the new selector path drops the views/followers number on any pre-existing rich-thread fixture
owner approval: required before merging; the change touches what users see as the post's metric
phase D scope: extension only; backend unchanged
```

### F2 — make permalink / author selection less heuristic

```yaml
invariant: extractAuthorHint MUST NOT return UI text like "Thread" — only handles matching the post author's profile path
required fixtures: direct-reply, reply-with-nested-quote, repost (real repost header, not the CSS-variable false positive), quoted-post
rollback criterion: any of the 4 fixture's expected author drifts off the asserted value
owner approval: required; selector change can ripple to non-Threads cards in other surfaces
phase D scope: extension src/targeting/threads.ts only; backend parser is independently covered by F3
```

### F3 — replace the `posts[0]=main` assumption

```yaml
invariant: extract_data_from_html MUST identify the canonical post by URL match, not by DOM order
required fixtures: repost, quoted-post (both exercise the "recommendation interleaved before main" risk)
rollback criterion: any rich-thread parser_fixtures assertion drifts
owner approval: required; backend behavior change visible in normalized read model
phase D scope: vendor/parser.py only
```

### F4 — replace `(user, text)` dedup with a stable identity

```yaml
invariant: _fingerprint_comment MUST NOT collapse two different replies authored by the same user with the same text
required fixture: same-user-same-text-different-branch (must exhibit the collision)
rollback criterion: the OP-continuation chain on rich-thread drops below 5 comments
owner approval: required; affects every reply in production
phase D scope: vendor/fetcher.py dedup loop only
```

### F8 — promote capture-hint mismatch from observation to blocking

```yaml
invariant: when capture_hint_mismatches contains "author" or "post_url_canonical", the crawl MUST raise InvalidTargetError instead of returning
required evidence: 4 weeks of production logs showing the mismatch rate is <0.5% on the affected kinds
rollback criterion: the warning rate goes above the threshold in any week after the gate flips
owner approval: required twice — once to approve the threshold, once to flip the gate
phase D scope: adapter.py only; helper compare_capture_hints stays unchanged
```

### F9 — delete the legacy fetch chain

```yaml
invariant: the active runtime call path (run_fetcher_test → extract_metrics → deep_scroll_comments → vendor parser) MUST be fully characterized before any legacy symbol is removed
required deliverable: characterization test for run_fetcher_test output contract (golden manifest replay)
removal order: capture_archive_snapshot first, then fetch_page_html, then fetch_thread, in dedicated single-symbol PRs
owner approval: required per-PR
phase D scope: vendor/fetcher.py only; also touches src/scraper/login.py per the legacy-candidate ledger
```

### F10 — converge or document the multi-layer divergences

```yaml
invariant: extension descriptor text_snippet MUST agree with backend parser body text head on at least the first 40 characters
required fixtures: rich-thread (already captured) + one direct-reply fixture
rollback criterion: the assertion fires on any future fixture replay
owner approval: required; the easiest convergence path is for extension to call a shared UI-token strip helper, which is a new shared dependency
phase D scope: cross-repo (extension targeting + backend parser shared helper)
```

## Items that need no Phase D PR

- **F5** — locked. Drill defaults must not change without owner-approved live QA. The action_budget manifest is sufficient telemetry; no code change is owed.
- **F6** — locked. The opt-in boundary is enforced by a static policy test plus an inline source comment. No code change is owed; future PRs that touch `extract_metrics` must keep both assertions passing.
- **F7** — locked. Env knobs and launch flags are documented in the env ledger. The action_budget env_snapshot makes operator drift visible. No code change is owed.

## Architecture map status — `CRAWLER`

Per the plan's PR 6 task 6.3, `CRAWLER` may move from yellow to
built/green only if all of: Phase A inventory landed (yes,
`acc8ea5`), Phase B fixture replay landed (yes, single label set),
action budget + policy test landed (yes, `ed7ac06`), mismatch
telemetry landed (yes, `f816551`), and Phase C risk register landed
(this document, when merged), AND the existing happy-path live QA
harness still passes.

**Recommendation: leave `CRAWLER` yellow** for one more round of
fixture growth. Single-fixture coverage means F1 / F2 / F3 / F10 are
documented but not actually tested against the labels that exhibit
them. Move to built/green once direct-reply, repost, and
quoted-post fixtures land (one authorized capture per label).

`CRAWLER` does not move to **locked** until a Phase D PR lands an
automated guard catching at least the F1 and F2 regression classes
against fixtures. The current `tests/targeting-fixture-replay.test.ts`
+ `tests/crawlers/test_threads_parser_fixtures.py` are necessary but
not sufficient for locked — they pin current behavior; locked needs
tests that fail when behavior drifts toward the F-named risk class
specifically.

## Reading order for the next agent

1. This file (the disposition table is the index).
2. `docs/audit/2026-06-16-threads-cross-layer-extraction-report.md` for the multi-layer evidence.
3. `dlens-ingest-core/docs/audit/2026-06-16-threads-call-graph.md` for symbol-level boundaries.
4. `dlens-ingest-core/tests/crawlers/fixtures/threads/LABEL_COVERAGE.md` for what fixtures exist and which labels remain uncovered.
5. The audit's original code-audit at `docs/audit/2026-06-16-threads-extraction-crawler-code-audit.md` for the F-finding text in full.
