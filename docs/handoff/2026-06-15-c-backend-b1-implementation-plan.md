# B1 Implementation Plan — Backend OP/Reply Read-Model

Date: 2026-06-15
Target repo: `dlens-ingest-core` (`main` @ `1f0e29d`)
Consumer audit: `docs/audit/2026-06-15-c-backend-readmodel-survey.md` (product repo, landed `2799a29`)
Status: **implementation plan**, three independently-shippable slices
Owner: Codex
Reviewer: Claude (pre-merge)

## Purpose

Move `READMODEL_BACKEND` from 🔴 to 🟡 (and within reach of 🟢) by fixing the three failure classes the C0 audit nailed down:

1. **B1.1** — duplicate-root no longer enters `op_continuations` / `assembled_content`.
2. **B1.2** — same-author OP continuation chains stay together; `1f0e29d`'s OP-reader-reply protection stays intact.
3. **B1.3** — the read-model exposes which reply edges resolved and which are orphaned, so extension consumers stop treating `parent_comment_id` as silently trustworthy.

Each slice is one PR. They can land in order (B1.1 → B1.2 → B1.3) without rebasing; later slices assume earlier ones merged.

## Cross-slice invariants

These must hold at every slice boundary. Codex checks them per slice; Claude re-runs them pre-merge.

1. **`1f0e29d`'s regression test stays green** — `test_thread_read_model_keeps_op_replies_to_readers_out_of_assembled_content` (`tests/crawlers/test_threads_adapter.py:139-175`). Do not delete, weaken, or rewrite it. New heuristics must subsume its case.
2. **Backend targeted suite stays green** — `PYTHONPATH=src .venv/bin/pytest tests/crawlers/test_threads_adapter.py tests/crawlers/test_threads_contract.py -q` → currently `13 passed`. After each slice this number only grows.
3. **C0 fixtures become reproducible against expected output by the end of the slice** — replaying the case's `input.json` through the post-slice `build_thread_read_model` matches the case's `expected_output.json`. (Earlier slices may match expected on their own fixture only; B1.3 brings all three to expected.)
4. **Contract changes are additive only** — `ThreadReadModel` may gain fields (B1.3); fields may not be renamed or dropped. Extension consumers ignore unknown fields today (audit Q5), so additive is safe; subtractive is not.
5. **Vendor and fetcher layers are not touched** — work happens in `contracts.py` and `normalize.py`. The audit flagged data losses at the vendor / fetcher layer (e.g. `parent_source_comment_id` dropped at `vendor/fetcher.py:2206-2229`); those are deliberately out of B1 scope (see Q7).
6. **No silent API-shape change** — `CrawlResultSnapshot.thread_read_model` is `dict[str, Any]` today (audit Q1, `api/schemas.py:83-95`). B1.3 may widen the read-model's Pydantic shape, but the API typing tightening is a separate slice after B1.

---

## B1.1 — Duplicate-Root Guard

**Problem.** A comment that fingerprints to the canonical root (same author + same text, or `source_comment_id == canonical_post.post_id`) currently flows through `build_thread_read_model` as a `op_continuation`. That doubles the OP text in `assembled_content` and pollutes downstream evidence ranking.

**Witness.** `docs/audit/fixtures/2026-06-15-readmodel/duplicate-root/`.
Current output (replay against `1f0e29d`):
- `op_continuations = [abc123_dup]`
- `assembled_content = "Main post: launch note.\n\nMain post: launch note."`

Expected:
- `op_continuations = []`
- `assembled_content = "Main post: launch note."`
- `c_reader` stays in `discussion_replies` (unaffected).

**Files touched.**
- `src/dlens_ingest_core/crawlers/threads/normalize.py` — add a root-duplicate detector that runs before classification.
- `tests/crawlers/test_thread_read_model_structure.py` — new file, owns B1.1/B1.2/B1.3 structure tests so the existing `test_threads_adapter.py` keeps its current scope.

**Approach (shape, not code).**
- Introduce a helper `_is_canonical_root_duplicate(comment, canonical_post)` that returns `True` when any of these match (cheap signals first):
  1. `comment.source_comment_id` and `canonical_post.post_id` are both non-empty and equal.
  2. `comment.parent_comment_id` is null/empty AND `(normalized_author(comment.author), normalized_text(comment.text))` equals `(normalized_author(canonical_post.author), normalized_text(canonical_post.text))`.
- In the main loop of `build_thread_read_model`, drop any comment matching the helper before the OP-continuation / discussion-reply branching. Do not move it to `discussion_replies`; the duplicate is dropped entirely.
- `_normalize_text` should mirror `_normalize_author` style: strip + casefold + collapse internal whitespace. Keep helpers private and one place; don't sprinkle them across modules.

**Testable assertions (must be in `test_thread_read_model_structure.py`).**
- `test_duplicate_root_dropped_from_op_continuations`: load `duplicate-root/input.json`, call builder, assert `op_continuations == []`, `assembled_content == "Main post: launch note."`, and `discussion_replies` has exactly the reader reply.
- `test_duplicate_root_signal_post_id_match`: synthetic input where `comment.source_comment_id == canonical_post.post_id` but text differs — still dropped.
- `test_duplicate_root_signal_text_match`: synthetic input where `source_comment_id` is unrelated but text+author match root and no parent — still dropped.
- `test_non_duplicate_same_author_no_parent_still_op_continuation`: synthetic input with same-author no-parent comment whose text differs from root — still goes to `op_continuations`. (Guards against the dedup being too aggressive.)

**Contract impact.** None. `ThreadReadModel` shape unchanged. Semantics tighten: `op_continuations` no longer contains a comment that fingerprints to the root.

**Done condition.**
- Four new tests above pass.
- `13 passed` targeted suite grows to `≥ 17`.
- `1f0e29d`'s test still green.
- Replaying `duplicate-root/input.json` against the new builder produces output equal to `duplicate-root/expected_output.json` (the C0 fixture flips RED → GREEN for this case).

---

## B1.2 — Parent-Aware OP Continuation Chain

**Problem.** `1f0e29d` changed the classifier from "same author" to "same author + no known parent." That correctly excludes OP replies to a captured reader (the OP-reader-reply case) but incorrectly excludes OP continuations that parent to an earlier OP continuation. Multi-part OP threads ("Part 2", "Part 3" replying to Part 2) lose Part 3 from `assembled_content`.

**Witness.** `docs/audit/fixtures/2026-06-15-readmodel/op-continuation-chain/`.
Current output:
- `op_continuations = [c1]` (Part 2 only)
- `discussion_replies = [c2, r1]` (Part 3 wrongly here, audience reply correctly here)
- `assembled_content = "Part 1: main thesis.\n\nPart 2: OP continuation."` (missing Part 3)

Expected:
- `op_continuations = [c1, c2]` (Part 2 + Part 3)
- `discussion_replies = [r1]` (audience reply only)
- `assembled_content = "Part 1: ...\n\nPart 2: ...\n\nPart 3: ..."`

**Files touched.**
- `src/dlens_ingest_core/crawlers/threads/normalize.py` — replace the single-pass classifier with a two-pass OP-chain resolver.
- `tests/crawlers/test_thread_read_model_structure.py` — add chain tests.

**Approach (shape).**
- Phase 1: index comments by `comment_id` and by `source_comment_id` so parent lookups are O(1) and resilient to either id flavour.
- Phase 2: define the **OP chain set** as the transitive closure under this rule: a comment is in the OP chain if it is same-author as root AND `(parent is root OR parent is in the OP chain)`. "Parent is root" means `parent_comment_id` equals `canonical_post.post_id`, or is null/empty (legacy continuations without an explicit root pointer — keep `1f0e29d`'s behaviour intact for that subcase).
- Iterate to fixpoint (in practice ≤ comments.length iterations; bound it). On each pass, promote same-author comments whose parent just became part of the chain.
- Phase 3: classify — chain members → `op_continuations`; everything else → `discussion_replies`. Run B1.1's duplicate-root drop before this phase so the chain resolver never sees a duplicated root.
- Preserve insertion order within `op_continuations` (don't sort by id; the audit Q5 already flagged that consumers assume insertion-order semantics).

**Testable assertions.**
- `test_op_continuation_chain_two_levels`: `op-continuation-chain/input.json` → `op_continuations == [c1, c2]`, `discussion_replies == [r1]`, `assembled_content` contains all three OP parts joined by `\n\n` in input order.
- `test_op_reply_to_captured_reader_stays_discussion` (re-stated from `1f0e29d`): keep the existing test green; optionally add a structural variant that uses the new helper directly.
- `test_op_reply_to_uncaptured_reader_still_op_continuation`: same-author comment whose `parent_comment_id` doesn't resolve in the comment set and is not root — still `op_continuation` (graceful when the parent reader was scrolled past and never captured). Pair this with B1.3: the same comment surfaces an orphan marker, but classification doesn't downgrade.
- `test_audience_reply_to_op_chain_is_discussion_reply`: a reader replying to an OP-continuation (c1 or c2) is `discussion_reply`. Not OP-continuation just because its parent is OP.
- `test_cycle_safety`: synthetic input where two comments parent to each other (malformed data). The resolver terminates and classifies safely (treat the cycle as discussion to be conservative).

**Contract impact.** None. Classification semantics tighten and become parent-aware.

**Done condition.**
- New tests pass; targeted suite grows again.
- `1f0e29d` test still green.
- Replaying `op-continuation-chain/input.json` matches its `expected_output.json` exactly.
- `duplicate-root` fixture still matches (B1.1 not regressed).

---

## B1.3 — Reply Edge / Orphan Surface

**Problem.** `parent_comment_id` is currently passed through as a raw string. Extension consumers (audit Q5) implicitly assume it resolves to either root or another captured comment — but the audit shows there's no field to distinguish "resolved" from "orphaned" parent ids. Worse, the fetcher already extracts `threads_comment_edges` (`fetcher_runtime.py:31`) but normalize ignores it (`normalize.py:62-119`) — data is on the floor.

**Witness.** `docs/audit/fixtures/2026-06-15-readmodel/orphan-nested-reply/`.
Current output (against `1f0e29d`):
- `discussion_replies` includes both c1 (top-level reader) and c2 (orphan), with no flag distinguishing them.

Expected:
- `discussion_replies` unchanged (visibility preserved).
- New `reply_edges: []` — comment-to-comment resolved edges (c1 parents to root, which is not a comment edge by design; so the list is empty for this fixture).
- New `orphan_replies: [{comment_id: "c2", parent_comment_id: "missing-parent", parent_source_comment_id: "src-missing-parent", reason: "parent_not_found_in_comments_or_root"}]`.

**Files touched.**
- `src/dlens_ingest_core/crawlers/threads/contracts.py` — extend `ThreadReadModel` with `reply_edges` and `orphan_replies`; add small models for each.
- `src/dlens_ingest_core/crawlers/threads/normalize.py` — build the two collections in a single pass after classification.
- `tests/crawlers/test_thread_read_model_structure.py` — add edge / orphan tests.
- `tests/crawlers/test_threads_contract.py` — the contract test that rejected old `content_type_hint` (`:71-83`) now needs to accept the two new fields; extend the round-trip assertion to cover them.

**Approach (shape).**
- New types (sketch, Codex finalizes names):

  ```
  class ReplyEdge(BaseModel):
      comment_id: str
      parent_comment_id: str
      parent_kind: Literal["comment"]  # root edges intentionally not represented; see semantics below

  class OrphanReply(BaseModel):
      comment_id: str
      parent_comment_id: str | None
      parent_source_comment_id: str | None
      reason: Literal["parent_not_found_in_comments_or_root"]

  class ThreadReadModel(BaseModel):
      # existing fields unchanged
      reply_edges: list[ReplyEdge] = Field(default_factory=list)
      orphan_replies: list[OrphanReply] = Field(default_factory=list)
  ```

- Semantics (write these as docstrings on `ThreadReadModel`):
  - **`reply_edges`** carries comment-to-comment parent links only. A comment whose parent is the root post is intentionally not represented — the root edge is implicit in being in `discussion_replies` or `op_continuations` of the read-model itself. Rationale: keeps the edge list scoped to the structure consumers actually need to draw a reply tree, and avoids restating root for every top-level reply.
  - **`orphan_replies`** carries comments whose `parent_comment_id` is non-null but resolves to neither root nor another captured comment. This is the orphan signal extension consumers can act on (B2). Comments with no parent at all are not orphans; they are top-level replies (parent implicit = root).
- `threads_comment_edges` from the fetcher remains unused in B1.3. The audit flagged it as "data already arrives, just dropped" — but adopting it requires understanding its semantic relationship to `parent_comment_id`, which is a separate slice. B1.3 derives edges purely from the comment list, the same input source the rest of the builder uses.
- Resolution rule used twice (chain in B1.2 already uses a similar lookup — share the helper):
  - Build a `(comment_id ∪ source_comment_id) → comment` index.
  - `is_root(parent)`: `parent in {canonical_post.post_id, "", None}`.
  - `is_resolved(parent)`: parent is in the index.
  - Orphan if parent is non-empty AND not root AND not resolved.

**Testable assertions.**
- `test_orphan_nested_reply_surfaced`: `orphan-nested-reply/input.json` → `orphan_replies` contains exactly one entry for `c2` with the expected `reason`; `reply_edges == []`; `c2` still appears in `discussion_replies` (visibility preserved).
- `test_resolved_nested_reply_in_reply_edges`: synthetic input with a reader reply chain where c2's parent is c1 (both captured) → `reply_edges` has one entry `{comment_id: c2, parent_comment_id: c1, parent_kind: "comment"}`; `orphan_replies == []`.
- `test_top_level_reader_reply_not_in_reply_edges_or_orphan`: c1 parents directly to root → neither `reply_edges` nor `orphan_replies` mention c1. (Encodes the "root edge implicit" semantic.)
- `test_op_chain_intersects_reply_edges_only_when_parented_via_comment`: an OP continuation whose parent is root contributes nothing to `reply_edges` (root edge implicit); an OP continuation whose parent is another OP continuation contributes one comment-to-comment edge.
- `test_thread_read_model_accepts_new_fields_roundtrip` (`test_threads_contract.py`): Pydantic round-trip preserves the two new fields; missing fields default to empty lists.

**Contract impact.**
- `ThreadReadModel` gains two list fields, both with empty-list defaults. The Pydantic `model_config = ConfigDict(extra="forbid")` rule (`contracts.py:38`) was the audit's flag for "contract is strict"; adding fields here is a normal forward extension.
- Extension consumers ignore unknown fields today (audit Q5); they remain backward compatible. B2 (extension projection alignment) will consume the two new fields explicitly — but that is a separate plan, post-B1.
- API response shape `CrawlResultSnapshot.thread_read_model: dict[str, Any]` (`api/schemas.py:83-95`) continues to silently accept the wider shape. Tightening that to use `ThreadReadModel` directly is a follow-up to B1, not B1 itself.

**Done condition.**
- New tests pass; targeted suite green at the new total.
- `1f0e29d` test still green.
- All three C0 fixtures' replays now match their `expected_output.json` exactly.
- New helper `_index_comments_for_resolution` (or whatever Codex names it) is shared between the OP-chain resolver (B1.2) and the edge / orphan builder (B1.3). No two separate "lookup comment by id" implementations.

---

## Out of scope (carried forward from C0 Q7)

- Vendor parser rewrite or Playwright crawler strategy.
- `fetcher_runtime` launch / auth behaviour.
- Database migrations or extension storage `schemaVersion`.
- Extension UI redesign or Product / Topic view-model rewrites.
- B2 projection alignment (extension consumes the new contract) — separate plan, post-B1.3.
- Quote / repost ambiguity, media / image handling.
- Engagement ranking or evidence sorting changes.
- LLM prompt changes.
- HTTP/SSE MCP transport (separate frontier, mempalace #1812).
- Adopting `threads_comment_edges` from the fetcher — call it out in B1.3 docs as a known follow-up, do not pull it in.
- Tightening `CrawlResultSnapshot.thread_read_model` from `dict[str, Any]` to `ThreadReadModel` — follow-up.

## PR shape

Three PRs, one per slice, against `dlens-ingest-core` `main`:

| Slice | Suggested branch | Suggested title |
|---|---|---|
| B1.1 | `fix/read-model-duplicate-root-guard` | `fix(read-model): drop canonical-root duplicates before classification` |
| B1.2 | `fix/read-model-op-chain-resolver` | `fix(read-model): parent-aware OP continuation chain` |
| B1.3 | `feat/read-model-reply-edges-and-orphans` | `feat(read-model): expose reply_edges and orphan_replies` |

PR body for each must include:
- The C0 fixture witness (link to product repo path).
- The current → expected behaviour summary from this plan.
- "Out of scope" call-out matching the lists above.
- Backend targeted test diff (`13` → `N`).
- Note on contract impact (B1.1 / B1.2 = none; B1.3 = additive widening).

## Worktree mechanics

Backend repo lives outside the extension repo. Use the local `dlens-ingest-core`
checkout configured for this machine. Unlike `dlens-product-latest`, there may
not be a preconfigured `~/.config/superpowers/worktrees/dlens-ingest-core/<branch>`
tree.

Suggested Codex setup (per slice):

```bash
cd <backend-repo>
git checkout -b fix/read-model-duplicate-root-guard main
# implement, test
git push -u origin fix/read-model-duplicate-root-guard
gh pr create --base main --title "..." --body "..."
```

If the user prefers a worktree-isolated checkout symmetric to the product repo, that setup is a one-time chore — flag it on the first slice and the user decides. Don't decide unilaterally.

## Pre-merge review (Claude runs before squash-merge)

For each slice PR:

- [ ] **Suite** — `PYTHONPATH=src .venv/bin/pytest tests/crawlers/test_threads_adapter.py tests/crawlers/test_threads_contract.py tests/crawlers/test_thread_read_model_structure.py -q` green.
- [ ] **`1f0e29d` test** — `test_thread_read_model_keeps_op_replies_to_readers_out_of_assembled_content` still green in the PR diff.
- [ ] **Fixture replay** — run the C0 replay script (audit doc, "Repro Fixtures" section) against the slice's branch. Slice's fixture must match `expected_output.json`. Other fixtures match either current (not yet fixed) or expected (already fixed) — never an unexpected third state.
- [ ] **Scope** — diff touches only files this slice's plan lists. Vendor / fetcher / API / DB / migrations untouched. Search the diff for `vendor/`, `fetcher_runtime`, `api/schemas`, `db/`, `migrations/` — any hit gets explained or rejected.
- [ ] **Contract semantics in docstring** — B1.3 only. `ThreadReadModel` docstring records the "root edge implicit" rule so B2 consumers don't have to reverse-engineer it.
- [ ] **No code in shared helper has a second copy** — B1.2's chain resolver and B1.3's edge / orphan builder share their comment-lookup index. Check `git grep -n "comment_identities\|source_comment_id"` for accidental duplication.
- [ ] **Backend repo stays on `main`** — no incidental branch checkouts left behind in the user's working tree after squash-merge.

## After B1

The audit's "After B1: Move Toward 🟢" list is the right follow-up shape:

- Golden fixtures expanded to cover OP-reader-reply (the case `1f0e29d` already protects), resolved nested reply, plus the three C0 cases — all as committed test data.
- Tighten `CrawlResultSnapshot.thread_read_model` from `dict[str, Any]` to `ThreadReadModel`.
- Update `docs/architecture/dlens-current-architecture-map.md` to flip `READMODEL_BACKEND` from 🔴 to 🟡 only after the regression tests above would fail without B1.
- B2 implementation plan (extension consumes new contract fields).
