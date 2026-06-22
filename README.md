# DLens Chrome Extension

DLens is a mode-aware MV3 Chrome extension for capturing Threads posts and turning them into research, product-signal, and PR evidence workflows.

> Last updated: 2026-06-22
> Current release: `0.3.2` · latest local full suite `915 passed / 5 skipped` · build clean
> Current engineering branch: `main`
> Positioning (2026-06-18): local power-tool (self + small technical circle); two separate repos (extension public · ingest-core **private**), not monorepo; Visual Reset A contract is `src/ui/tokens.ts` warm editorial + macOS utility shell
> Verified build: `output/chrome-mv3`
> Stability note (0.3.0): `TRACE`, `SEAM_GUARD`, `RECONCILE`, `INVALIDATE`, `BOUNDARY`, and `MIGRATE` are locked in the live architecture map. Visual Reset A shipped the native-feeling shell plus PR Evidence, Topic, Compare, and Product marquee surfaces without changing storage, backend, ViewModel, command, or signal-packet contracts.

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

- Hover-to-preview and collect on Threads feeds/post pages. Hover uses a warm in-memory cache (no per-move storage read); saves carry the live hovered post and the popup's visible folder/topic so they always land where intended. Collect metrics use shared icon chips across the overlay and popup preview. Collect saves and refresh-all writes share the snapshot lock so Topic signals cannot be left without a usable backing saved item/descriptor; pre-existing orphan/corrupt signals are hidden from Topic counts/lists and queued for storage cleanup. Content scripts also rehydrate active collect mode after extension reload/page refresh (see AGENTS.md "Recently Fixed 2026-05-22").
- Mode-aware save routing: archive saves to Library; topic/product saves become Inbox signals; PR Evidence saves become campaign rows. Save messages now pass an explicit `sessionId`/`topicId`, so a drifted active folder cannot reroute a save.
- Backend queue/drain/polling against `ingestBaseUrl`, defaulting to `http://127.0.0.1:8000`.
- Popup backend health dot uses the lightweight backend `/health` endpoint for liveness, while `/worker/status` remains the slower work-truth projection for backlog / retry / analysis state. One failed health poll is suppressed, two mark the dot slow, and three mark it unreachable.
- Compare setup and Result surfaces with backend read models plus extension-side compare brief v8, cluster summaries, evidence annotations, and saved analysis snapshots.
- Topic workflow: Casebook, Inbox, Topic Detail, signal triage, per-signal semantic tags/gists, optional-question TopicSignalReading, and attached compare pairs.
- Product workflow: ProductContextCompiler, ProductSignalAnalyzer v17, Marginalia/Verdict card layouts, the restored Reading Review action UI, SignalReading packet/export support, and local feedback history. v17 stops asking the model for legacy action-recipe fields such as `copy_recipe_markdown` / `workflow_stack`; action cards also ignore those legacy fields if present and keep evidence as reusable patterns plus agent briefs, not tutorial recipes.
- Signal Packet export: Product sessions can export `DLensSignalPacket` records as HTML, Markdown, or JSONL through `signal-packet/export`. The 0.2.1 surface adds compact HTML density, source/capture/item provenance, reading citation refs, filed-reading lineage, source URL provenance, and a Product reading-review provenance mirror. These fields are additive on packet v3; no storage migration is required.
- Visual Reset A: the popup shell, PR Evidence ledger, Topic detail, Compare hero, and Product action surfaces now use the `src/ui/tokens.ts` warm-paper editorial contract with macOS utility shell affordances. VIEW remains 🟢, not 🟩: marquee surfaces are DOM-test-locked, while row-level primitive adoption / LOC reduction remains follow-up work.
- PR Evidence workflow: one active campaign per session, brief upload, six editable criteria, evidence rows, criteria matching, CSV export, Markdown/DOCX audit summary.
- Layout preferences remain persisted for existing records, but the visible Settings layout card is removed; workspace typography, rounded surfaces, and shadow treatment now follow the Topic card grammar across modes. Shared cards default to the 20px Topic-style radius.
- Workspace mode switches reserve the processing-strip slot, reset scroll before paint, and crossfade the content frame so Topic/Product/PR data changes no longer produce a visible vertical jump.
- 0.3.2 UI fix: compact masthead now removes nonessential shortcut/issue chrome, keeps only status + version on the right, and Topic cards/buttons stay inside the content width with a non-overlapping remove action.
- 0.3.1 UI fix: popup masthead status/key hints now shrink inside the 720px shell, Product classification detail text wraps instead of clipping, and Topic cards expose an explicit remove action.
- Product Action route restores the 0.1.15 `READING REVIEW` UI only when the current saved signals have matching `SignalReading` rows. Review callbacks alone must not switch the Action route away from the Marginalia action cards. The old page-level batch export remains off the Action route; Saved Signals owns the `行動簡報匯出` selection/copy surface.
- Product Settings includes a Product-only cache reset. It clears derived Product analysis, SignalReading, feedback, and compiled ProductContext storage without deleting saved signals, topics, archive folders, or PR evidence.
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
cd dlens-product-latest
npm run typecheck
npm run storage:seam-guard
npm run boundary:guard
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
```

Expected verified state for merged `main` `0.3.2`:

- `915 passed / 5 skipped` in `npx tsx --test tests/*.test.ts tests/*.test.tsx`
- `npm run typecheck` passes
- `npm run storage:seam-guard` reports zero allowlisted bypasses
- `npm run boundary:guard` reports zero View / ViewModel wall violations and zero allowlisted bypasses
- `npm run build` mirrors the unpacked MV3 build to `output/chrome-mv3`
- `output/chrome-mv3/manifest.json` reports `version: "0.3.2"` and `name: "DLens v3"`

## Second Mac Install

For a 30-minute assisted install on another Mac, use [`docs/setup/second-mac-30-minute-install.md`](./docs/setup/second-mac-30-minute-install.md). It is written for someone using Terminal with help from a simple AI chatbot.

## Active Paths

| Purpose | Path |
|---|---|
| Active extension worktree | `dlens-product-latest` |
| Load unpacked extension | `output/chrome-mv3` |
| Chrome QA profile | Jason `Default` profile (`jason@brandonproject.co`); this is the only local Chrome profile with DLens installed from `output/chrome-mv3` |
| Backend (resolved at) | sibling `../dlens-ingest-core` or `DLENS_INGEST_CORE_DIR` |
| Backend repo | `github.com/jasonmaxxxon/dlens-ingest-core` (private) — clone as a sibling; see its `SETUP.md` |
| Backups | `~/dlens-archive-<date>/` (extension + backend bundles + RESTORE.md) |

## Architecture Boundary

- The extension does not connect directly to Supabase.
- Runtime only depends on `settings.ingestBaseUrl`; a local backend checkout is optional for extension-only development.
- Backend analysis snapshots are the source of truth for crawl output and deterministic clustering.
- Extension-side AI calls use the user's local Google/OpenAI/Claude key and must degrade cleanly when no key is configured.
- Product mode must stay insight/evidence/task-first; backend clusters are support data, not the user-facing abstraction.
- View modules must not own extension messaging, raw storage access, or nondeterministic time/random sources; ViewModels must not own browser APIs, network calls, DOM globals, file constructors, or React imports. `npm run boundary:guard` enforces both walls.

## Where To Continue

Read these before non-trivial work:

- [`docs/architecture/dlens-current-architecture-map.md`](./docs/architecture/dlens-current-architecture-map.md) for the live architecture/status map. Treat 🟢 as built, not locked; update the map if a node/edge status changes.
- [`AGENTS.md`](./AGENTS.md) for process rules, current contracts, and agent handoff notes.
- [`docs/handoff/2026-06-18-visual-reset-A-plan.md`](./docs/handoff/2026-06-18-visual-reset-A-plan.md) for the Visual Reset A PR sequence and single design-source contract.
- [`docs/ENGINEERING_PLAN.md`](./docs/ENGINEERING_PLAN.md) for the completed N1-N5 engineering-plan slice and deferred-trigger pool.
- [`docs/CODE_REVIEW.md`](./docs/CODE_REVIEW.md) for the current PR self-check contract.
- [`docs/memory/current-state.md`](./docs/memory/current-state.md) for the fuller repo state.
- [`docs/memory/latest-shared-context.md`](./docs/memory/latest-shared-context.md) for Codex/Claude shared memory context.

Current state and open risks:

- `entrypoints/background.ts` is 3488 lines; do not split handlers unless the trigger in `docs/ENGINEERING_PLAN.md` promotes that work into the committed-next slice.
- `src/ui/useInPageCollectorAppState.ts` is 2148 lines; continue extraction before adding more product/PR/export routes.
- C-Backend read-model hardening is now 🟢: B1-B4 landed across backend and extension projection; future read-model changes must update the shared seven-case golden fixtures.
- BOUNDARY is now 🟩: View / ViewModel wall guards are wired into CI through `npm run boundary:guard`.
- Signal Packet HTML/JSONL needs the next semantic cleanup: HTML evidence density/provenance, `citedInReadingRefs`, latest vs superseded readings, and root `source.pageUrl` investigation.
