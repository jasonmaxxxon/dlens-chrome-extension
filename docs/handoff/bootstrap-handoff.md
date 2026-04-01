# Bootstrap Handoff

## What Has Been Bootstrapped

This repo now has:

- scope-locking docs
- explicit contracts with `dlens-ingest-core`
- a WXT + React + TypeScript shell
- background, content-script, and sidepanel entrypoints
- shared extension contracts and state types

## What The Next Agent Should Do

1. read `AGENTS.md`
2. read `docs/memory/current-state.md`
3. read `docs/contracts/ingest-core-api.md`
4. read `docs/contracts/target-descriptor.md`
5. inspect `src/targeting/threads.ts`
6. inspect `entrypoints/background.ts`, `entrypoints/threads.content.ts`, and `entrypoints/sidepanel/main.tsx`

## Immediate Next Implementation Targets

1. tighten feed selection heuristics using prototype-derived helpers
2. improve sidebar UX for current selection and queue status
3. add automated tests for:
   - feed card selection
   - post-detail post selection
   - post-detail comment selection
   - submit payload mapping
   - queue status transitions

## Do Not Reopen

- repo scope
- backend ownership
- parser rewrite
- raw result preview

## Canonical Upstream Repos

- browser-side prototype:
  - `/Users/tung/Desktop/dlens_chrome_extension_branch`
- ingestion heart:
  - `/Users/tung/Desktop/dlens-ingest-core`
