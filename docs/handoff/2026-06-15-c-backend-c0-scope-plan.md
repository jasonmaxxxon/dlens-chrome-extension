# C0 Scope Survey — C-Backend OP/Reply Read-Model

Date: 2026-06-15
Target repos: `dlens-ingest-core` (primary), `dlens-product-latest` (consumer audit)
Status: **docs-only**, no code changes
Owner: Codex
Reviewer: Claude (pre-merge)

## Why we need C0 (not jump straight to B1)

Backend already has a `ThreadReadModel` shape (`src/dlens_ingest_core/crawlers/threads/contracts.py:37-43`) and a builder
(`src/dlens_ingest_core/crawlers/threads/normalize.py:31` `build_thread_read_model`). Extension already consumes those fields
across 7 files (see Q5 below). Yet [`docs/architecture/dlens-current-architecture-map.md:34`](../architecture/dlens-current-architecture-map.md)
keeps `READMODEL_BACKEND` at 🔴 with the note:

> duplicate-root / continuation split not fixed

So the gap is not "build the read-model" — it's "the existing read-model gets 3 known case classes wrong, and we don't yet know
**which step** breaks them." Writing a B1 implementation plan without that knowledge would be guessing.

The single backend commit since 2026-06-12 (`1f0e29d fix: keep op reader replies out of assembled content (#1)`) is a
22+39-line point-fix in `normalize.py`, not a structural lift. It hints that there's more under the same rock.

## Scope of C0

**Pure survey.** Codex produces **one PR with one new document** (no source edits):

- File: `docs/audit/2026-06-15-c-backend-readmodel-survey.md` (in `dlens-product-latest`)
- Companion fixtures (if needed): `docs/audit/fixtures/2026-06-15-readmodel/*.json`

The PR body says: "docs-only audit, no code change. Inputs for the B1 implementation plan."

## Must-answer questions

Codex's deliverable is the audit doc with these answered. Skipping any one means C0 isn't done.

### Q1. Current contract surface

- List every field on `ThreadReadModel`, `CanonicalPost`, `CanonicalComment` (file + line). Mark which have docstrings, which have unit-test coverage, which have neither.
- For each of the 7 extension consumers
  (`src/ui/ProductSignalViews.tsx`, `src/contracts/ingest.ts`, `src/compare/product-signal-analysis.ts`,
   `src/state/captured-post.ts`, `src/compare/topic-audit.ts`, `src/compare/signal-tags.ts`,
   `src/compare/topic-signal-reading.ts`, `src/compare/signal-packet.ts`),
  list which read-model fields it actually reads.
- Output: one table `field × consumer × backend-defined?`.

### Q2. Witness fixtures for the three known broken cases

For each of the three, produce a minimal raw input + current builder output + expected output. Real captures preferred; synthetic OK if labeled.

1. **duplicate-root** — same post appears twice as root (e.g., from a continuation that wasn't merged).
2. **OP-continuation vs discussion-reply split** — a reply that should land in `op_continuations` ends up in `discussion_replies`, or vice versa. (The current builder uses `root_author == comment.author && no parent` to classify — find a case where that heuristic misclassifies.)
3. **Nested reply parent/child chain broken** — `parent_comment_id` / `parent_source_comment_id` doesn't resolve to a real parent in `comments` (orphaned reply).

Each witness must include:
- `input.json` — raw input to `build_thread_read_model` (or `normalize_threads_result` if the break is upstream).
- `current_output.json` — what the builder produces today.
- `expected_output.json` — what it should produce.
- One-sentence root-cause hypothesis (which step breaks it — see Q3).

### Q3. Failure-mode attribution

For each case in Q2, attribute the break to one of:

- (a) **DOM / vendor parser** (`vendor/parser.py`) — raw extraction wrong.
- (b) **raw → canonical** (`normalize_threads_result`) — field-mapping or shape loss.
- (c) **canonical → read-model** (`build_thread_read_model`) — classification heuristic or assembly wrong.
- (d) **Contract definition itself** — the read-model doesn't have the field needed to express the correct answer (e.g., no nested-reply structure, no quote/repost flag).

Cite the file + line for each attribution. If two layers are wrong for one case, list both.

### Q4. What did `1f0e29d` actually fix?

Read the diff of `1f0e29d fix: keep op reader replies out of assembled content (#1)`. Answer:

- Which Q2 case did it touch (one, two, all three, or a fourth case)?
- What sub-symptom did it fix?
- What sub-symptoms in the same case remain unfixed after it?

### Q5. Implicit assumptions on the extension side

For each of the 7 consumer files in Q1, list the implicit assumptions the extension makes that aren't backed by an explicit backend contract. Examples of the shape we're hunting:

- "I assume `op_continuations` is in chronological order" — is it?
- "I assume `discussion_replies` parent_comment_id always resolves" — does it?
- "I assume `assembled_content` is OP-text + all OP-continuation texts, joined `\n\n`" — does the builder guarantee that ordering and that separator?

Output: one row per assumption. Mark each as **confirmed by contract / confirmed by code / not guaranteed**.

### Q6. Draft B1 slice plan

Based on Q1–Q5, sketch the next 2–3 PRs that would move `READMODEL_BACKEND` from 🔴 to 🟡 (and the one after that to 🟢). Each slice has:

- One-sentence problem statement.
- File list it touches.
- One testable assertion (the characterization test that flips from RED→GREEN).
- Impact on the extension consumer contract (does it widen the read-model? add a field? change semantics?).

Slices must be independently shippable — no slice depends on a future one to be useful.

### Q7. Explicitly NOT in scope of B1

List what B1 will deliberately not touch, to keep Codex from scope-creeping:

- vendor parser rewrites
- `fetcher_runtime` changes
- migrations / `schemaVersion` (unless Q6 says a slice needs a contract shape change — then call it out)
- extension UI / view-model changes (B2/B3)
- quote/repost ambiguity, image/media handling (separate frontier)

## Done condition

- All 7 questions answered in the audit doc.
- At least one witness fixture per Q2 case (or an explicit "needs production capture" with a script to capture it).
- Q6 has ≥ 2 independently-shippable slices with testable assertions.
- PR body marks it docs-only.
- Claude reviews before merge: every claim about a file or line resolves; every "current_output.json" actually matches what `build_thread_read_model` produces against the listed `input.json` (Codex must include a small script `scripts/replay_readmodel.py` or note the existing test that does this — so the audit is reproducible, not just assertions).

## Out of scope

- Any code change to either repo.
- HTTP/SSE MCP transport (separate frontier).
- migrations / `schemaVersion` lift (separate frontier).
- Quote/repost handling, media/image read-model (separate, B2/B3 territory).

## Worktree mechanics for Codex

Backend repo is the local `dlens-ingest-core` checkout configured for this
machine (main = current). The audit doc lands in `dlens-product-latest`, but
the inspection target is the backend repo.

Suggested setup:

```
# product-latest worktree (where the audit doc + fixtures live)
cd ~/.config/superpowers/worktrees/dlens-product-latest/audit-readmodel-c0
# backend (read-only inspection; do NOT branch / commit here)
cd <backend-repo>  # or its own worktree if Codex prefers
```

If Codex needs to replay a fixture through the real builder:

```
cd <backend-repo>
.venv/bin/python -c "
from dlens_ingest_core.crawlers.threads.normalize import build_thread_read_model
import json
inp = json.load(open('<path>/input.json'))
print(json.dumps(build_thread_read_model(**inp), indent=2, default=str))
"
```

## Pre-merge review checklist (Claude runs before squash-merge)

- [ ] No code changes in either repo (only docs + fixtures).
- [ ] Each Q2 fixture is reproducible — running `build_thread_read_model` on `input.json` yields `current_output.json`.
- [ ] Each attribution in Q3 cites a real file + line.
- [ ] Q6 slices are testable (each names a concrete assertion, not "improve X").
- [ ] Q7's exclusion list matches the slice plan (no slice quietly does an excluded thing).
- [ ] The doc reads cleanly cold — a new contributor can pick up B1 from this audit without rereading prior handoffs.
