# DLens Chrome Extension

DLens is a mode-aware MV3 Chrome extension for capturing Threads posts and turning them into research, product-signal, and PR evidence workflows.

> Last updated: 2026-05-27
> Current release: `0.1.26`
> Current engineering branch: `codex/pr-visible-metrics`
> Verified build: `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`

## What It Does

DLens is extension-first, not SaaS-first. Local folders, UI state, product context, user API keys, saved analyses, Product signal judgments, SignalReading records, and PR evidence rows live in Chrome/local extension storage. The optional ingest backend owns crawl jobs and canonical read models.

Current workspace modes:

| Mode | Main use | Current status |
|---|---|---|
| `archive` | Save and inspect Threads posts locally | Working |
| `topic` | Triage saved posts into topics, compare ready pairs, attach results to case context | Working |
| `product` | Analyze saved signals against ProductContext, review free-text readings, export agent-readable packets | Working |
| `pr-evidence` | Build PR evidence ledgers from already-found Threads posts, match criteria, export CSV/MD/DOCX | Working |

## Current Features

- Hover-to-preview and collect on Threads feeds/post pages. Hover uses a warm in-memory cache (no per-move storage read); saves carry the live hovered post and the popup's visible folder/topic so they always land where intended. Collect saves and refresh-all writes share the snapshot lock so Topic signals cannot be left without a usable backing saved item/descriptor; pre-existing orphan/corrupt signals are hidden from Topic counts/lists and queued for storage cleanup. Content scripts also rehydrate active collect mode after extension reload/page refresh (see AGENTS.md "Recently Fixed 2026-05-22").
- Mode-aware save routing: archive saves to Library; topic/product saves become Inbox signals; PR Evidence saves become campaign rows. Save messages now pass an explicit `sessionId`/`topicId`, so a drifted active folder cannot reroute a save.
- Backend queue/drain/polling against `ingestBaseUrl`, defaulting to `http://127.0.0.1:8000`.
- Compare setup and Result surfaces with backend read models plus extension-side compare brief v8, cluster summaries, evidence annotations, and saved analysis snapshots.
- Topic workflow: Casebook, Inbox, Topic Detail, signal triage, per-signal semantic tags/gists, optional-question TopicSignalReading, and attached compare pairs.
- Product workflow: ProductContextCompiler, ProductSignalAnalyzer, Marginalia/Verdict card layouts, SignalReading review/compose, local feedback history.
- Signal Packet export baseline: Product sessions can export `DLensSignalPacket` records as HTML, Markdown, or JSONL through `signal-packet/export`.
- PR Evidence workflow: one active campaign per session, brief upload, six editable criteria, evidence rows, criteria matching, CSV export, Markdown/DOCX audit summary.
- Layout preferences in Settings: Product signal card, Topic synthesis, Compare result.
- Popup runtime hardening: the React tree is wrapped in a top-level workspace ErrorBoundary, and the content-script runtime fallback remains separate.
- Storage diagnostics: Settings displays local `chrome.storage.local` usage through a background-only `storage/get-usage` message boundary.
- Snapshot write discipline: read-modify-write handlers route through `mutateSnapshot` where possible; documented raw-lock escapes cover extra return metadata, no-write returns, and global-only worker wake writes.
- Behavioral storage contracts cover `session/set-mode` fast/slow writes, `session/refresh-all` no-op writes, non-blocking snapshot broadcasts, and real `mutateSnapshot` serialization.

## Version Lock

For every user-visible `main` update, keep these in sync:

- `package.json`
- `package-lock.json`
- `wxt.config.ts` `manifest.version`
- `src/ui/version.ts` `BUILD_VERSION`

`tests/manifest-config.test.ts` verifies this. Chrome's extension page reads the built manifest version; the popup masthead reads `BUILD_VERSION`.

## Build And Verify

```bash
cd /Users/tung/Desktop/dlens-product-latest
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

Expected verified state for `0.1.26`:

- `604/604` tests pass
- `npm run typecheck` passes
- `npm run build` mirrors the unpacked MV3 build to `output/chrome-mv3`
- `output/chrome-mv3/manifest.json` reports `version: "0.1.26"` and `name: "DLens v3"`

## Active Paths

| Purpose | Path |
|---|---|
| Active extension worktree | `/Users/tung/Desktop/dlens-product-latest` |
| Load unpacked extension | `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3` |
| Backend stable entry | `/Users/tung/Desktop/dlens-ingest-core` |
| Backend physical checkout | `/Users/tung/Desktop/dlens-backend/dlens-ingest-core` |
| Older worktrees/archive | `/Users/tung/Desktop/dlens-old` |

## Architecture Boundary

- The extension does not connect directly to Supabase.
- Runtime only depends on `settings.ingestBaseUrl`; a local backend checkout is optional for extension-only development.
- Backend analysis snapshots are the source of truth for crawl output and deterministic clustering.
- Extension-side AI calls use the user's local Google/OpenAI/Claude key and must degrade cleanly when no key is configured.
- Product mode must stay insight/evidence/task-first; backend clusters are support data, not the user-facing abstraction.

## Where To Continue

Read these before non-trivial work:

- [`AGENTS.md`](./AGENTS.md) for process rules, current contracts, and agent handoff notes.
- [`docs/ENGINEERING_PLAN.md`](./docs/ENGINEERING_PLAN.md) for the completed N1-N5 engineering-plan slice and deferred-trigger pool.
- [`docs/CODE_REVIEW.md`](./docs/CODE_REVIEW.md) for the current PR self-check contract.
- [`docs/memory/current-state.md`](./docs/memory/current-state.md) for the fuller repo state.
- [`docs/memory/latest-shared-context.md`](./docs/memory/latest-shared-context.md) for Codex/Claude shared memory context.

Current open risks:

- `entrypoints/background.ts` is 3329 lines; do not split handlers unless the trigger in `docs/ENGINEERING_PLAN.md` promotes that work into the committed-next slice.
- `src/ui/useInPageCollectorAppState.ts` is 1577 lines; continue extraction before adding more product/PR/export routes.
- Backend ThreadReadModel OP-continuation refinement remains Product mode P0.
- Signal Packet HTML/JSONL needs the next semantic cleanup: HTML evidence density/provenance, `citedInReadingRefs`, latest vs superseded readings, and root `source.pageUrl` investigation.
