# Topic Audit Bounded P1 Design

## Goal

Make P1 a bounded shard-to-post reducer. P1 must never re-render the full raw audience reply pool after P0.5 has already read it.

## Chosen approach

Persist the existing P0.5 envelope prose on each `CommentShardReading` as an optional `reading` field for backward compatibility. Build P1 from:

1. bounded OP context;
2. bounded OP-authored continuations/replies;
3. bounded P0.5 shard readings and their structured pattern/lexicon hints.

The complete P1 prompt has a hard 24,000-character ceiling. Normal topics include every shard reading. If an extreme shard count cannot fit, the reducer samples shard readings evenly across the full range and states exactly how many were omitted; it never falls back to raw audience comments.

## Data flow

`raw audience comments -> P0.5 shard reads -> persisted CommentShardReading.reading -> bounded P1 post synthesis`

The normal full pipeline and the single-signal P1 command both ensure P0.5 readings exist before P1. P1 evidence refs are validated against the current packet rather than the whole topic.

## Compatibility

- `CommentShardReading.reading` is optional so stored pre-0.3.34 memos remain readable.
- Legacy shard readings fall back to their structured pattern/lexicon fields.
- Bump P0.5 and P1 prompt versions so old memo bundles are not reused as if they satisfied the new contract.

## Tests

- P1 contains P0.5 distillate and excludes raw audience text.
- A 1,000-comment fixture stays within 24,000 characters and represents the first and last shard.
- The handler persists P0.5 prose and passes it into P1.
- Single-signal P1 generates missing P0.5 readings before P1.

## Explicit non-goals

- No cross-run incremental cache.
- No NarrativeState or episode storage.
- No reaction-distribution UI change.
- No P2-P6 topic-level budget changes in this slice.
