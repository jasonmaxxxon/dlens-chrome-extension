# Code Review Checklist

Use this list before requesting review. Keep answers concrete: name the file,
message handler, storage key, or test that proves the claim.

- **Snapshot write path**: every snapshot mutation states whether it is
  tab-only, active-session-only, or full snapshot.
- **Lock seam**: any snapshot read-modify-write path uses `mutateSnapshot`
  first. Use raw `withSnapshotLock` only when the handler must return extra
  non-snapshot data or deliberately skip a write, and document that escape.
- **Storage migration plan**: every new persisted storage key has a forward
  migration or an explicit reason it can safely default when absent.
- **LLM fallback + usage accounting**: every new LLM call has deterministic
  fallback behavior and records or exposes token/cost usage when the provider
  returns it.
- **React prop stability**: new view props are optional or threaded through all
  call sites in the same change, including SSR/test render paths.
- **Mount-time fetches**: mount-time fetches are guarded so they do not
  re-trigger snapshot writes or loop on every render.
- **Response shape optional fields**: additions to extension response shape are
  optional fields unless every sender and receiver is migrated together.
- **Message handler RMW classification**: every new message handler says
  whether it is RMW; RMW handlers use the lock seam, non-RMW handlers avoid
  unnecessary `saveSnapshot` writes.
