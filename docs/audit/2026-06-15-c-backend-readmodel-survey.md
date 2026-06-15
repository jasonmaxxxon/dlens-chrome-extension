# C0 Backend Read-Model Survey

Date: 2026-06-15
Product repo: `/Users/tung/Desktop/dlens-product-latest` (`main` @ `2cec71e`)
Backend repo: `/Users/tung/Desktop/dlens-ingest-core` -> `/Users/tung/Desktop/dlens-backend/dlens-ingest-core` (`main` @ `1f0e29d`)
Scope: docs + reproducible fixtures only. No backend or extension source edits.

## Executive Summary

`ThreadReadModel` already exists, but it is not yet a trustworthy Threads discussion structure contract.

The current backend builder is still a thin classifier:

- `op_continuations`: same normalized author as root and no parent that resolves to a known comment.
- `discussion_replies`: everything else.
- `assembled_content`: canonical root text plus `op_continuations`, joined with `\n\n`.

That explains the three current failure classes:

1. duplicate-root is not detected, so duplicated root text can enter `op_continuations` and `assembled_content`.
2. OP continuation chains are split when a later OP continuation replies to an earlier OP continuation.
3. orphaned nested replies are passed through as if their parent relationship were usable, while the current contract has no `reply_edges` or orphan marker.

The 2026-06-14 backend commit `1f0e29d fix: keep op reader replies out of assembled content (#1)` fixed one subcase only: OP replies to a captured reader comment no longer enter assembled content. It did not fix duplicate-root, OP continuation chains, missing-parent OP replies, or a reply tree contract.

## Repro Fixtures

Fixtures live under:

`docs/audit/fixtures/2026-06-15-readmodel/`

Each case has:

- `input.json`: input for backend `build_thread_read_model(**input)`.
- `current_output.json`: output produced by backend commit `1f0e29d`.
- `expected_output.json`: intended behavior. For `orphan-nested-reply`, the expected output deliberately includes a contract delta (`reply_edges`, `orphan_replies`) because the current `ThreadReadModel` cannot express that case.

Replay command:

```bash
cd /Users/tung/Desktop/dlens-ingest-core
PYTHONPATH=src .venv/bin/python - <<'PY'
from pathlib import Path
from dlens_ingest_core.crawlers.threads.normalize import build_thread_read_model
import json

fixture_root = Path("/Users/tung/Desktop/dlens-product-latest/docs/audit/fixtures/2026-06-15-readmodel")
for case_dir in sorted(path for path in fixture_root.iterdir() if path.is_dir()):
    current = build_thread_read_model(**json.loads((case_dir / "input.json").read_text()))
    expected_current = json.loads((case_dir / "current_output.json").read_text())
    if current != expected_current:
        raise SystemExit(f"{case_dir.name}: current_output mismatch")
    print(f"{case_dir.name}: current_output matches")
PY
```

Note: direct `.venv/bin/python` import fails in this backend checkout unless `PYTHONPATH=src` is set.

## Q1. Current Contract Surface

Backend contract definitions:

| Model | Fields | Backend file | Docstring / Field docs | Test coverage |
|---|---|---:|---|---|
| `CanonicalPost` | `post_id`, `url`, `author`, `text`, `text_raw`, `time_token`, `metrics`, `images`, `captured_at` | `src/dlens_ingest_core/crawlers/threads/contracts.py:9-20` | None | Contract accepts shape in `tests/crawlers/test_threads_contract.py:14-24`; normalize maps all fields in `tests/crawlers/test_threads_adapter.py:62-79`. |
| `CanonicalComment` | `comment_id`, `source_comment_id`, `parent_comment_id`, `parent_source_comment_id`, `author`, `text`, `time_token`, `like_count`, `reply_count` | `contracts.py:23-34` | None | Contract accepts representative shape in `test_threads_contract.py:25-35` and `:45-57`; normalize maps parent/source fields in `test_threads_adapter.py:80-103`; null metadata covered in `test_threads_adapter.py:253-278`. |
| `ThreadReadModel` | `post_id`, `op_continuations`, `discussion_replies`, `assembled_content` | `contracts.py:37-43` | None | Contract accepts shape in `test_threads_contract.py:42-59`; rejects old `content_type_hint` in `test_threads_contract.py:71-83`; normalize output covered in `test_threads_adapter.py:104-134`; OP-reader-reply subcase covered in `test_threads_adapter.py:139-175`. |

Backend builder and data path:

| Layer | Evidence |
|---|---|
| Builder | `build_thread_read_model` in `src/dlens_ingest_core/crawlers/threads/normalize.py:31-59`. |
| Raw -> canonical | `normalize_threads_result` maps `post_payload` and `threads_comments` in `normalize.py:62-119`. |
| Fetcher runtime | `fetch_threads_post` returns `post_payload`, `threads_comments`, `threads_comment_edges`, `threads_posts_raw`, `manifest` in `src/dlens_ingest_core/crawlers/threads/fetcher_runtime.py:19-34`. |
| Important gap | `normalize_threads_result` ignores `threads_comment_edges`; it only consumes `post_payload`, `threads_comments`, `manifest`, and `threads_posts_raw` (`normalize.py:68-103`). |
| API response | `CrawlResultSnapshot.thread_read_model` is only `dict[str, Any]` in `src/dlens_ingest_core/api/schemas.py:83-95`; API does not re-validate the `ThreadReadModel` pydantic shape. |
| DB read | `thread_read_model` is returned as stored JSON in `src/dlens_ingest_core/db/read_store.py:121-137`. |

Extension consumer audit:

The handoff calls this "7 extension consumers", but the file list contains 8 names. This audit checks all 8.

| Consumer | Direct read-model fields actually read | Notes |
|---|---|---|
| `src/ui/ProductSignalViews.tsx` | None direct | UI depends on upstream readiness / analyses. It displays ThreadReadModel readiness copy (`ProductSignalViews.tsx:306-320`) and signal/reading source URLs (`:2462-2467`), but does not read backend fields itself. |
| `src/contracts/ingest.ts` | Declares `thread_read_model/threadReadModel`, `root_post/rootPost`, `op_continuations/opContinuations`, `discussion_replies/discussionReplies`, `assembled_content/assembledContent`; post fields `post_id/postId/comment_id/commentId/author/text/like_count/likeCount` | `root_post/rootPost` is extension-side tolerated shape, not backend-defined today (`contracts.py:37-43`). Parent fields are not included in `ThreadReadModelPostSnapshot` (`ingest.ts:85-105`). |
| `src/state/captured-post.ts` | `threadReadModel/thread_read_model`, `rootPost/root_post`, `opContinuations/op_continuations`, `discussionReplies/discussion_replies`, `assembledContent/assembled_content`; per-post `postId/post_id/commentId/comment_id/author/text/likeCount/like_count`; legacy `result.comments` only when model absent | This is the real projection seam (`captured-post.ts:56-99`, `:139-200`). It does not read `result.canonical_post.text` for the visible OP projection. |
| `src/compare/product-signal-analysis.ts` | Via `projectCapturedPostFromCapture`: `assembledContent` and `discussionReplies`; fallback `result.canonical_post.text`; evidence refs from discussion replies | Analyzer input uses backend assembled content and discussion evidence (`product-signal-analysis.ts:166-207`, `:446-457`, `:459-526`). |
| `src/compare/topic-audit.ts` | Via `projectCapturedPost`: OP author/text/likes, `opContinuations`, `discussionReplies`, `hasThreadReadModel`, comment count | Builds evidence packets and role refs (`topic-audit.ts:144-171`, `:196-240`). |
| `src/compare/signal-tags.ts` | `threadReadModel/thread_read_model`, `assembledContent/assembled_content`; fallback `canonical_post.text`; evidence catalog via Product signal helper | Input and prompt use assembled content + evidence catalog (`signal-tags.ts:38-50`, `:57-74`, `:77-103`). |
| `src/compare/topic-signal-reading.ts` | `threadReadModel/thread_read_model`, `assembledContent/assembled_content`; fallback `canonical_post.text`; evidence catalog via Product signal helper | Input and prompt use assembled content + audience evidence (`topic-signal-reading.ts:45-58`, `:84-108`, `:111-153`). |
| `src/compare/signal-packet.ts` | `threadReadModel/thread_read_model`, `assembledContent/assembled_content`; fallback `canonical_post.text`; evidence catalog via Product signal helper | Source packet uses assembled content and representative comments (`signal-packet.ts:491-510`, `:640-652`). |

Field x consumer x backend-defined:

| Field / field group | Backend-defined? | Extension consumers |
|---|---|---|
| `canonical_post.post_id/url/author/text/text_raw/time_token/metrics/images/captured_at` | Yes | `contracts/ingest.ts` accepts as untyped `Record`; `product-signal-analysis.ts`, `signal-tags.ts`, `topic-signal-reading.ts`, `signal-packet.ts` use `canonical_post.text` as fallback only. |
| `comments[]` raw canonical list | Yes | `captured-post.ts` uses only as legacy fallback when read-model absent; Product/Tags/TopicReading/SignalPacket can inherit that through `buildProductSignalEvidenceCatalogFromCapture`; `topic-audit.ts` does not enable legacy comments. |
| `thread_read_model.post_id` | Yes | Declared in TS; no observed runtime reader. |
| `thread_read_model.root_post/rootPost` | No | `captured-post.ts` reads it if present; backend does not emit it, so visible OP projection falls back to capture hints/snippet. |
| `thread_read_model.op_continuations` | Yes | `captured-post.ts` direct; `topic-audit.ts` indirect for OP continuation refs. Other consumers mainly feel it through `assembled_content`. |
| `thread_read_model.discussion_replies` | Yes | `captured-post.ts` direct; Product analyzer, tags, topic reading, and signal packet use it as evidence through `buildProductSignalEvidenceCatalogFromCapture`; `topic-audit.ts` uses it for role refs. |
| `thread_read_model.assembled_content` | Yes | `captured-post.ts`, Product analyzer, signal tags, topic signal reading, signal packet; Product readiness indirectly gates on non-empty assembled content through `signal-readiness.ts:38-44`. |
| `CanonicalComment.comment_id/source_comment_id/parent_comment_id/parent_source_comment_id/time_token/reply_count` inside read-model arrays | Yes in backend Pydantic model | Mostly ignored by extension. `ThreadReadModelPostSnapshot` only models id/author/text/like count; parent/source/time/reply fields are not part of the TS read-model post snapshot. |
| `CanonicalComment.author/text/like_count` inside read-model arrays | Yes | Read by `captured-post.ts`; then by Product evidence, Topic evidence, signal tags, topic reading, signal packet. |

## Q2. Witness Fixtures

| Case | Fixture | Current output | Expected output | Root-cause hypothesis |
|---|---|---|---|---|
| duplicate-root | `fixtures/2026-06-15-readmodel/duplicate-root/` | Duplicate root appears in `op_continuations`, and `assembled_content` repeats root text twice. | Duplicate root is removed; reader reply remains discussion evidence; assembled content is root only. | Fetcher can admit a root-like card into comments, and builder has no root duplicate guard. |
| OP-continuation vs discussion-reply split | `fixtures/2026-06-15-readmodel/op-continuation-chain/` | First OP continuation is `op_continuations`; second OP continuation, because it parents to the first, becomes `discussion_replies`; assembled content misses part 3. | Both same-author OP chain nodes stay in `op_continuations`; audience reply stays discussion; assembled content includes parts 1-3. | `1f0e29d` changed the heuristic from same-author only to same-author + no known parent. That protects OP replies to readers, but it splits same-author OP chains. |
| orphaned nested reply | `fixtures/2026-06-15-readmodel/orphan-nested-reply/` | Orphaned child stays in flat `discussion_replies` with a parent id that does not resolve to root or any comment. | The reply remains visible, but the read model exposes `orphan_replies` and resolved `reply_edges`; this needs a contract extension. | Normalization ignores `threads_comment_edges`, and the current contract has no way to distinguish resolved edges from orphaned parent ids. |

All fixtures are synthetic. They are intentionally small so Claude can replay them against the current builder before reviewing B1.

## Q3. Failure-Mode Attribution

| Case | Attribution | Evidence |
|---|---|---|
| duplicate-root | (a) vendor/fetcher can produce the bad raw shape; (c) builder does not defend against it. | `vendor/fetcher.py:1855-1883` adds structured `main_cards` as comments without comparing against the canonical root fingerprint; `:1892-1940` enriches those nodes. `normalize.py:41-52` then classifies any same-author no-parent comment as OP continuation and appends its text to assembled content. |
| OP-continuation chain split | (c) canonical -> read-model classifier is too coarse. | `normalize.py:42-44` only allows same-author comments with no parent found in comment identities into `op_continuations`; a same-author OP continuation replying to a previous OP continuation has a known parent and is sent to `discussion_replies` at `normalize.py:45-46`. |
| orphaned nested reply | (b) raw -> canonical ignores available edge artifact; (d) contract lacks resolved edge / orphan expression. | `fetcher_runtime.py:28-34` returns `threads_comment_edges`, but `normalize.py:68-103` ignores it. `vendor/fetcher.py:2136-2140` writes raw edges and `:2232-2247` writes `threads_comment_edges.json`. `contracts.py:37-43` has no `reply_edges`, `reply_tree`, or `orphan_replies`. |

Related upstream notes:

- `vendor/parser.py:321-362` best-effort extracts `source_comment_id`, `parent_comment_id`, and `parent_source_comment_id`.
- `vendor/fetcher.py:2206-2229` writes final `threads_comments.json`, but it does not carry `source_comment_id` or `parent_source_comment_id`; it only carries `comment_id` and `parent_comment_id`.
- `_build_parsed_tree` treats missing-parent nodes as roots (`vendor/fetcher.py:818-858`), which is fine for rendering a tree but loses the distinction between a true top-level reply and an orphan.

## Q4. What `1f0e29d` Fixed

Commit: `1f0e29d fix: keep op reader replies out of assembled content (#1)`.

Diff summary:

- Added `_comment_identity_set` and `_has_comment_parent` in `normalize.py:13-28`.
- Changed builder classification so root-author comments only become `op_continuations` when they do not parent to an existing comment (`normalize.py:41-46`).
- Added `test_thread_read_model_keeps_op_replies_to_readers_out_of_assembled_content` (`tests/crawlers/test_threads_adapter.py:139-175`).

Touched case: OP-continuation vs discussion-reply split, but only one sub-symptom.

Fixed sub-symptom:

- If reader comment `c1` is present and OP reply `c2` parents to `c1`, OP reply `c2` becomes a `discussion_reply` and is excluded from `assembled_content`.

Still unfixed:

- If the reader parent is missing or not captured, OP reply still looks like no-parent same-author content and can enter `op_continuations`.
- Same-author OP continuation chains now split after the first continuation if later continuations parent to earlier OP continuations.
- Duplicate root is not deduped.
- Orphan parent ids are not detected or surfaced.
- Reply tree / edge structure is not part of the contract.
- API response schema still treats read-model as `dict[str, Any]`, not as `ThreadReadModel`.

## Q5. Extension-Side Implicit Assumptions

| Assumption | Consumer(s) | Status |
|---|---|---|
| `assembled_content` is root text plus all OP continuation texts in meaningful order, joined by `\n\n`. | Product analyzer, signal tags, topic reading, signal packet, readiness | Confirmed by current code (`normalize.py:48-52`) but not documented in the backend contract; order depends on incoming comment order. |
| `op_continuations` is semantically clean OP continuation material, not duplicate root or OP replies to readers. | `captured-post.ts`, `topic-audit.ts`, Product/Tags/TopicReading through assembled content | Not guaranteed. Fixtures show duplicate root and OP-chain split failures. |
| `discussion_replies` can be used as audience evidence. | Product analyzer, signal tags, topic reading, signal packet | Not guaranteed. It can include OP same-author discussion replies after `1f0e29d`; `captured-post.ts:169-185` also relabels same-author discussion replies as `op_continuation` by author equality while still leaving them in `discussionReplies`. |
| Parent ids in comments resolve to root or another comment. | Future B1/B2 consumers; current extension mostly ignores parent ids | Not guaranteed. Orphan fixture shows unresolved parent ids. |
| Backend may return `root_post/rootPost` in `thread_read_model`. | `captured-post.ts` | Not backend-defined. Current backend returns `canonical_post` separately and `ThreadReadModel` has no root post field. |
| Visible OP text in Topic evidence comes from backend canonical post. | `topic-audit.ts` via `projectCapturedPost` | Not guaranteed. `captured-post.ts` does not read `result.canonical_post.text`; without `root_post`, it falls back to capture hints/snippet. |
| Evidence refs `e1`, `e2`, ... represent top replies by engagement. | Product analyzer, signal tags, topic reading, signal packet | Not guaranteed by backend or projection. The helper preserves current `discussionReplies` order and caps; it does not sort by likes. |
| Non-empty `assembled_content` means read-model quality is good enough. | `signal-readiness.ts`, Product UI | Not guaranteed. Readiness only checks non-empty assembled content (`signal-readiness.ts:38-44`). |
| Source ids and parent source ids are available end-to-end. | Future reply-tree work | Not guaranteed. Parser attempts extraction, but final fetcher output drops source parent fields before normalize. |
| API response has a strong read-model schema. | `contracts/ingest.ts` and all consumers | Not guaranteed. Backend API schema uses `dict[str, Any]`; TypeScript accepts both snake and camel shapes for compatibility, not because backend guarantees both. |

## Q6. Draft B1 Slice Plan

### B1.1 Duplicate-root Guard

Problem: root-like comments can be treated as OP continuations and duplicate `assembled_content`.

Backend files:

- `src/dlens_ingest_core/crawlers/threads/normalize.py`
- `tests/crawlers/test_threads_adapter.py` or new `tests/crawlers/test_thread_read_model_structure.py`

Testable assertion:

- Given `duplicate-root/input.json`, `build_thread_read_model` excludes `abc123_dup` from `op_continuations` and returns `assembled_content == "Main post: launch note."`.

Contract impact:

- No new field. Semantics tighten: `op_continuations` must not contain root duplicates.

### B1.2 Parent-Aware OP Continuation Chain

Problem: `1f0e29d` prevents one OP-reader reply bug but also makes OP continuation chains look like discussion replies.

Backend files:

- `src/dlens_ingest_core/crawlers/threads/normalize.py`
- `tests/crawlers/test_thread_read_model_structure.py`

Testable assertions:

- Given `op-continuation-chain/input.json`, both `c1` and `c2` are in `op_continuations`, and `r1` stays in `discussion_replies`.
- Existing `test_thread_read_model_keeps_op_replies_to_readers_out_of_assembled_content` still passes.

Contract impact:

- No new field required for the first fix. Semantics tighten: same-author child of an OP-continuation can remain OP continuation, while same-author child of reader reply remains discussion.

### B1.3 Reply Edge / Orphan Surface

Problem: current read-model arrays carry parent ids but do not say which edges resolve, which are orphaned, or whether a nested reply chain is complete.

Backend files:

- `src/dlens_ingest_core/crawlers/threads/contracts.py`
- `src/dlens_ingest_core/crawlers/threads/normalize.py`
- `tests/crawlers/test_thread_read_model_structure.py`

Optional input source:

- `raw_result["threads_comment_edges"]`, already returned by `fetch_threads_post` but ignored by normalize.

Testable assertions:

- Given `orphan-nested-reply/input.json`, `ThreadReadModel` exposes an orphan marker for `c2` rather than silently presenting its parent as trustworthy.
- For a resolved parent/child fixture, `reply_edges` contains the resolved parent-child pair.

Contract impact:

- Additive contract widening: likely `reply_edges` and `orphan_replies` (or an equivalent structure). This should stay backward-compatible because current extension ignores unknown read-model fields, but B2 should add explicit TypeScript types and projection behavior.

### After B1: Move Toward 🟢

To move `READMODEL_BACKEND` from 🟡 to 🟢 after B1:

- Add golden backend fixtures for at least duplicate-root, OP chain, OP-reader reply, resolved nested reply, orphan nested reply.
- Strong-type API response shape against the backend read-model contract instead of returning raw `dict[str, Any]`.
- Update `docs/architecture/dlens-current-architecture-map.md` only after tests would fail on these regressions.

## Q7. Explicitly Not In Scope For B1

- Vendor parser rewrite or broad Playwright crawler strategy changes.
- `fetcher_runtime` launch/auth behavior.
- Database migrations or extension storage `schemaVersion`.
- Extension UI redesign or Product/Topic view-model rewrites.
- B2 projection alignment, except for documenting the contract delta B2 must consume.
- Quote/repost ambiguity.
- Image/media handling.
- Engagement ranking or evidence sorting changes.
- LLM prompt changes.
- HTTP/SSE MCP transport.

## Verification Performed In This Survey

- Confirmed product worktree status before edits: existing unrelated untracked docs/mockups were already present; this survey adds only the audit doc and fixture files.
- Confirmed backend checkout is clean and `/Users/tung/Desktop/dlens-ingest-core` is a symlink to `/Users/tung/Desktop/dlens-backend/dlens-ingest-core`.
- Replayed the three fixture inputs through `PYTHONPATH=src .venv/bin/python` and backend `build_thread_read_model`; current outputs in this report match backend commit `1f0e29d`.
- Ran backend targeted tests: `PYTHONPATH=src .venv/bin/pytest tests/crawlers/test_threads_adapter.py tests/crawlers/test_threads_contract.py -q` -> `13 passed`.
- Ran product repo whitespace check: `git diff --check` -> no output.
- Did not run full extension tests because this C0 artifact is docs/fixtures-only and does not change runtime code.
