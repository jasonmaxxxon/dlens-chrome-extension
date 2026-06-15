# B2 Extension Projection Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the extension-side Threads projection with backend B1 so OP continuation, OP reply chatter, audience reply, resolved edge, and orphan status come from the backend read-model contract instead of extension-side guessing.

**Architecture:** `src/contracts/ingest.ts` owns the wire shape, `src/state/captured-post.ts` is the only projection seam, and Product / Topic / Signal Packet consumers inherit semantics from that projection. B2 is additive and backwards-compatible for older captures, but when a backend read-model exists it must trust backend classification over same-author heuristics.

**Tech Stack:** TypeScript, node:test via `npx tsx --test`, existing DLens extension state / compare helpers, backend B1 `ThreadReadModel` from `dlens-ingest-core` PR #2 (`896373b`).

---

## Context

B1 is merged in backend `main`:

- Backend PR: `jasonmaxxxon/dlens-ingest-core#2`
- Merge commit: `896373b fix(read-model): complete B1 OP and reply structure`
- Product fixtures aligned in extension repo commit: `d520eeb feature(c-backend): align B1 fixture expected output`
- Architecture map status: `READMODEL_BACKEND` is now 🟡, not 🔴.

B1 fixed the backend builder:

- duplicate-root comments are dropped before OP/discussion classification
- same-author OP continuation chains stay in `op_continuations`
- `reply_edges` exposes resolved comment-to-comment parent links
- `orphan_replies` exposes non-root parent ids that do not resolve to captured comments

B2 fixes the extension mirror problem:

- `src/contracts/ingest.ts` does not type parent/source/time/reply fields or new `reply_edges` / `orphan_replies`
- `src/state/captured-post.ts` still promotes same-author `discussion_replies` into `opContinuations`
- Product / Topic / Packet consumers inherit that projection and can still treat OP reply chatter as OP continuation or audience evidence without metadata

## Non-Goals

- No backend code changes.
- No `dlens-ingest-core` API schema tightening from `dict[str, Any]` to `ThreadReadModel`; that is the separate API-hardening follow-up.
- No adoption of backend `threads_comment_edges`; B1 deliberately derives from normalized comments.
- No vendor / fetcher / Playwright parser work.
- No UI redesign.
- No prompt rewrite beyond adding compact, tested evidence metadata if a consumer already serializes evidence catalog lines.
- No change to evidence ordering or `e1`, `e2`, ... ref stability unless a test proves current ordering is wrong.

## Cross-Slice Invariants

1. **Backend remains semantic owner.** When `thread_read_model` exists, `op_continuations` are the only source of OP continuation fragments. The extension must not promote same-author `discussion_replies` into OP continuations.
2. **Older captures still work.** If no backend read-model exists and `includeLegacyComments` is true, the existing legacy comment fallback may keep its author heuristic because no backend contract is available.
3. **Visibility is preserved.** Orphan replies remain visible in `discussionReplies` / evidence. B2 marks them; it does not hide them.
4. **Refs stay stable.** Product evidence refs remain `e1`, `e2`, ... in current visible order. Topic refs remain deterministic by role and index.
5. **One projection seam.** Role, edge, and orphan logic live in `src/state/captured-post.ts`, not repeated in Product / Topic / Packet consumers.
6. **No false 🟩 claim.** B2 can improve extension alignment, but `READMODEL_BACKEND` should stay 🟡 until API typing and golden end-to-end fixtures close the remaining path to 🟢.

## Files

Modify:

- `src/contracts/ingest.ts`
  - Add backend B1 fields to read-model comment snapshots.
  - Add `ThreadReadModelReplyEdgeSnapshot`.
  - Add `ThreadReadModelOrphanReplySnapshot`.
  - Add `reply_edges` / `replyEdges` and `orphan_replies` / `orphanReplies` to `ThreadReadModelSnapshot`.
- `src/state/captured-post.ts`
  - Normalize reply edges and orphan replies.
  - Add projection metadata to `CapturedPostFragment`.
  - Stop same-author promotion for backend-model discussion replies.
- `src/compare/product-signal-analysis.ts`
  - Carry role / orphan / parent metadata in `ProductSignalDiscussionReply` and evidence catalog lines.
- `src/compare/topic-audit.ts`
  - Add an `op_reply` role if B2 keeps OP self-replies visible but separate from OP continuations.
  - Keep audience filters strict: only `role === "audience"` is audience.
- `src/compare/topic-audit-prompts.ts`
  - If `op_reply` is added, update prompt guidance so OP self-replies are excluded from audience consensus.
- `src/compare/signal-packet.ts`
  - Preserve new evidence metadata in packet text evidence where the existing type allows additive fields.
- `docs/architecture/dlens-current-architecture-map.md`
  - Update only if B2 changes map status text or next-step notes.

Test:

- `tests/captured-post.test.ts`
- `tests/product-signal-analysis.test.ts`
- `tests/topic-audit.test.ts`
- `tests/signal-tags.test.ts`
- `tests/topic-signal-reading.test.ts`
- `tests/signal-packet.test.ts`
- `tests/views.test.tsx` only if role copy / data attributes change in rendered UI

## B2.1 — Type The Backend B1 Contract And Normalize Projection Metadata

**Purpose.** Make the extension know the fields backend B1 now emits.

### Expected Contract Shape

`ThreadReadModelPostSnapshot` should accept the backend-defined canonical comment fields already present in B1:

```ts
source_comment_id?: string;
sourceCommentId?: string;
parent_comment_id?: string | null;
parentCommentId?: string | null;
parent_source_comment_id?: string | null;
parentSourceCommentId?: string | null;
time_token?: string | null;
timeToken?: string | null;
reply_count?: number | null;
replyCount?: number | null;
```

Add B1 relationship types:

```ts
export interface ThreadReadModelReplyEdgeSnapshot {
  comment_id?: string;
  commentId?: string;
  parent_comment_id?: string;
  parentCommentId?: string;
  parent_kind?: "comment";
  parentKind?: "comment";
}

export interface ThreadReadModelOrphanReplySnapshot {
  comment_id?: string;
  commentId?: string;
  parent_comment_id?: string | null;
  parentCommentId?: string | null;
  parent_source_comment_id?: string | null;
  parentSourceCommentId?: string | null;
  reason?: "parent_not_found_in_comments_or_root";
}
```

Add to `ThreadReadModelSnapshot`:

```ts
reply_edges?: ThreadReadModelReplyEdgeSnapshot[];
replyEdges?: ThreadReadModelReplyEdgeSnapshot[];
orphan_replies?: ThreadReadModelOrphanReplySnapshot[];
orphanReplies?: ThreadReadModelOrphanReplySnapshot[];
```

### Projection Shape

Extend `CapturedPostFragment` additively:

```ts
sourceId?: string;
parentId?: string | null;
parentSourceId?: string | null;
timeToken?: string | null;
replyCount?: number | null;
isOrphan?: boolean;
orphanReason?: "parent_not_found_in_comments_or_root";
resolvedParentId?: string | null;
```

Add relationship lists to `CapturedPostProjection`:

```ts
replyEdges: Array<{ commentId: string; parentCommentId: string; parentKind: "comment" }>;
orphanReplies: Array<{ commentId: string; parentCommentId: string | null; parentSourceCommentId: string | null; reason: "parent_not_found_in_comments_or_root" }>;
```

### Steps

- [ ] **Step 1: Write failing contract/projection tests**

Add to `tests/captured-post.test.ts`:

```ts
test("projectCapturedPost normalizes backend B1 reply edges and orphan replies", () => {
  const item = makeItem();
  item.latestCapture = {
    ...item.latestCapture!,
    result: {
      ...item.latestCapture!.result!,
      threadReadModel: null,
      thread_read_model: {
        assembled_content: "Root\n\nPart two",
        root_post: { post_id: "root", author: "op", text: "Root" },
        op_continuations: [
          { comment_id: "op-1", source_comment_id: "src-op-1", parent_comment_id: "root", author: "op", text: "Part two" }
        ],
        discussion_replies: [
          { comment_id: "c1", source_comment_id: "src-c1", parent_comment_id: "root", author: "reader", text: "Top-level reply" },
          { comment_id: "c2", source_comment_id: "src-c2", parent_comment_id: "missing-parent", parent_source_comment_id: "src-missing", author: "reader2", text: "Orphan reply" }
        ],
        reply_edges: [],
        orphan_replies: [
          { comment_id: "c2", parent_comment_id: "missing-parent", parent_source_comment_id: "src-missing", reason: "parent_not_found_in_comments_or_root" }
        ]
      }
    }
  } as SessionItem["latestCapture"];

  const post = projectCapturedPost(item);

  assert.deepEqual(post.replyEdges, []);
  assert.deepEqual(post.orphanReplies.map((entry) => entry.commentId), ["c2"]);
  assert.equal(post.discussionReplies.find((fragment) => fragment.id === "c2")?.isOrphan, true);
  assert.equal(post.discussionReplies.find((fragment) => fragment.id === "c2")?.parentId, "missing-parent");
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npx tsx --test tests/captured-post.test.ts
```

Expected before implementation: TypeScript/runtime assertion fails because `replyEdges`, `orphanReplies`, and fragment orphan metadata do not exist.

- [ ] **Step 3: Implement minimal type + projection support**

Update `src/contracts/ingest.ts` and `src/state/captured-post.ts`. Keep helpers private:

- `readReplyEdges(model)`
- `readOrphanReplies(model)`
- `readCommentIdentity(post)`
- `readParentIdentity(post)`
- `buildOrphanIdSet(orphanReplies)`

Do not sort. Preserve backend order.

- [ ] **Step 4: Run B2.1 tests**

Run:

```bash
npx tsx --test tests/captured-post.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ingest.ts src/state/captured-post.ts tests/captured-post.test.ts
git commit -m "feature(c-backend): type B1 read-model relationships"
```

## B2.2 — Stop Extension OP Guessing When Backend Model Exists

**Purpose.** Remove the frontend behavior that undermines B1: same-author `discussion_replies` must no longer become OP continuations when a backend read-model exists.

### Role Semantics

When `thread_read_model` exists:

| Backend source | Extension role |
|---|---|
| `op_continuations[]` | `op_continuation` |
| `discussion_replies[]` with missing author | `placeholder` |
| `discussion_replies[]` with author same as root | `op_reply` |
| `discussion_replies[]` with other author | `audience` |

When no backend model exists and `includeLegacyComments` is true, legacy fallback may keep current author heuristic because there is no backend classification to trust.

`CapturedPostProjection.opContinuations` should contain only backend `op_continuations` for model-backed captures. `CapturedPostProjection.discussionReplies` should still contain visible discussion fragments, including `op_reply`, `audience`, `placeholder`, and orphan-marked replies.

### Steps

- [ ] **Step 1: Update failing role tests**

Change existing `tests/captured-post.test.ts` expectations:

- the camelCase model test should expect `opContinuations` to include only `op-1`
- `same-author` should remain in `discussionReplies` with role `op_reply`
- `replies` should include every visible non-continuation reply, including `op_reply`, unless the implementation deliberately keeps `replies` audience-only and documents that decision in the test name

Add:

```ts
test("projectCapturedPost trusts backend discussion_replies over same-author OP heuristic", () => {
  const post = projectCapturedPost(makeItem());

  assert.deepEqual(post.opContinuations.map((fragment) => fragment.id), ["op-1"]);
  assert.equal(post.discussionReplies.find((fragment) => fragment.id === "same-author")?.role, "op_reply");
});
```

- [ ] **Step 2: Run the failing role tests**

Run:

```bash
npx tsx --test tests/captured-post.test.ts
```

Expected before implementation: current projection returns `same-author` in `opContinuations` with role `op_continuation`.

- [ ] **Step 3: Implement backend-model role split**

In `src/state/captured-post.ts`:

- Add `op_reply` to `CapturedPostReplyRole`.
- In model-backed discussion loop, classify same-author discussion fragments as `op_reply`, not `op_continuation`.
- In legacy fallback branch, keep current behavior unless a test proves it should change.
- Make `replies` semantics explicit in code comments and tests.

- [ ] **Step 4: Update Topic audit role handling**

In `src/compare/topic-audit.ts`:

- Add `op_reply` to `ReplyFragmentRole`.
- Add `makeFragmentRef(..., "op_reply", index)` prefix, suggested: `${shortCode}.OPR${index}`.
- Keep `getAudienceReplies()` strict to `role === "audience"`.
- Keep `getOpContinuations()` strict to `role === "op_continuation"`.
- Add `getOpReplies()` only if a caller needs it; do not add unused exports.

Update `tests/topic-audit.test.ts`:

- Same-author discussion reply should get `S1.OPR1`, not `S1.OPC2`.
- `getOpContinuations(packet)` should return only backend OP continuation text.
- `getAudienceReplies(packet)` should not include OP reply chatter.

- [ ] **Step 5: Update prompt wording if role is serialized**

If topic audit prompt receives role labels, update `src/compare/topic-audit-prompts.ts` so it says OP self-replies / `op_reply` are not audience consensus. Keep this copy small; no prompt redesign.

- [ ] **Step 6: Run role consumer tests**

Run:

```bash
npx tsx --test tests/captured-post.test.ts tests/topic-audit.test.ts tests/signal-drawer.test.tsx
npm run typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/state/captured-post.ts src/compare/topic-audit.ts src/compare/topic-audit-prompts.ts tests/captured-post.test.ts tests/topic-audit.test.ts tests/signal-drawer.test.tsx
git commit -m "feature(c-backend): trust backend OP reply classification"
```

## B2.3 — Carry Role / Orphan Metadata Through Product, Topic Reading, Tags, And Packets

**Purpose.** The eight audited consumers should inherit B1 semantics through one projection. They do not all need bespoke logic, but they must not lose role/orphan metadata at the evidence boundary.

### Consumer Expectations

| Consumer | B2 expectation |
|---|---|
| `src/contracts/ingest.ts` | Types B1 relationship fields. |
| `src/state/captured-post.ts` | Sole normalizer for role, edge, orphan metadata. |
| `src/compare/product-signal-analysis.ts` | Evidence entries include role and orphan metadata; prompt catalog can distinguish `audience` from `op_reply`. |
| `src/compare/topic-audit.ts` | Topic evidence refs distinguish `OPC`, `OPR`, `R`, and `P`; audience helper excludes OP reply chatter. |
| `src/compare/signal-tags.ts` | No local parsing; evidence catalog from Product helper carries metadata. |
| `src/compare/topic-signal-reading.ts` | No local parsing; evidence catalog from Product helper carries metadata. |
| `src/compare/signal-packet.ts` | Packet text evidence preserves role/orphan metadata additively. |
| `src/ui/ProductSignalViews.tsx` | No direct read-model parsing; only reacts to upstream state. No UI change unless evidence metadata is already rendered. |

### Steps

- [ ] **Step 1: Write failing Product evidence tests**

Add to `tests/product-signal-analysis.test.ts`:

```ts
test("buildProductSignalEvidenceCatalogFromCapture preserves OP reply and orphan metadata", () => {
  const evidence = buildProductSignalEvidenceCatalogFromCapture({
    result: {
      thread_read_model: {
        root_post: { author: "op", text: "Root" },
        assembled_content: "Root",
        discussion_replies: [
          { comment_id: "op-r1", author: "op", text: "OP replies to a reader.", like_count: 2 },
          { comment_id: "c2", author: "reader", text: "Orphaned child.", parent_comment_id: "missing", like_count: 1 }
        ],
        orphan_replies: [
          { comment_id: "c2", parent_comment_id: "missing", parent_source_comment_id: null, reason: "parent_not_found_in_comments_or_root" }
        ],
        reply_edges: []
      }
    }
  } as any);

  assert.deepEqual(evidence.map((entry) => [entry.ref, entry.id, entry.role, entry.isOrphan]), [
    ["e1", "op-r1", "op_reply", false],
    ["e2", "c2", "audience", true]
  ]);
});
```

- [ ] **Step 2: Run failing Product evidence test**

Run:

```bash
npx tsx --test tests/product-signal-analysis.test.ts
```

Expected before implementation: entries do not expose `role` / `isOrphan`.

- [ ] **Step 3: Extend Product evidence metadata**

In `src/compare/product-signal-analysis.ts`:

- Add `role: CapturedPostReplyRole` to `ProductSignalDiscussionReply`.
- Add `isOrphan?: boolean`, `parentId?: string | null`, `resolvedParentId?: string | null`.
- Update `buildEvidenceCatalog` lines to include compact metadata:

```text
e1 role=audience orphan=false parent=c1 author=reader likes=3 text=...
```

Keep existing `ref`, `id`, `author`, `text`, and `likeCount` fields unchanged.

- [ ] **Step 4: Verify indirect consumers**

Add or update focused assertions:

- `tests/signal-tags.test.ts`: generated input evidence catalog still caps and includes metadata without local parsing.
- `tests/topic-signal-reading.test.ts`: generated input evidence catalog includes role/orphan metadata for the B1 orphan case.
- `tests/signal-packet.test.ts`: `textEvidence` includes role/orphan metadata and source packet generation still works for older readings.

- [ ] **Step 5: Run B2 consumer tests**

Run:

```bash
npx tsx --test \
  tests/captured-post.test.ts \
  tests/product-signal-analysis.test.ts \
  tests/topic-audit.test.ts \
  tests/signal-tags.test.ts \
  tests/topic-signal-reading.test.ts \
  tests/signal-packet.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/compare/product-signal-analysis.ts src/compare/signal-packet.ts tests/product-signal-analysis.test.ts tests/signal-tags.test.ts tests/topic-signal-reading.test.ts tests/signal-packet.test.ts
git commit -m "feature(c-backend): carry reply structure into evidence projection"
```

## Final Verification

Run from `/Users/tung/Desktop/dlens-product-latest`:

```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
git diff --check
```

Expected:

- Typecheck exits 0.
- Full test suite exits 0.
- Build exits 0.
- Diff check exits 0.

Also run a scoped grep before PR:

```bash
rg -n "thread_read_model|threadReadModel|reply_edges|orphan_replies|op_reply|op_continuation" src tests
```

Review expectations:

- `src/state/captured-post.ts` is the only place that normalizes backend read-model role / edge / orphan semantics.
- Product / Topic / Packet consumers consume projection metadata, not raw backend fields.
- Same-author `discussion_replies` are not promoted into `opContinuations` for model-backed captures.
- Orphan replies are visible and marked.
- No backend, vendor, fetcher, DB, migration, or UI redesign changes.

## After B2

Do not flip `READMODEL_BACKEND` to 🟢 solely after B2. The path to 🟢 is:

1. Add committed extension-side golden captures that use backend B1 output for duplicate-root, OP chain, resolved nested reply, orphan nested reply, and OP reader reply.
2. Tighten backend API response typing from `dict[str, Any]` to `ThreadReadModel`.
3. Add an end-to-end fixture that proves extension projection consumes the typed backend shape without legacy fallbacks.

Only after those are in place should the architecture map consider `READMODEL_BACKEND` 🟢.
