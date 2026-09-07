# Bootstrap Handoff

> **2026-09-07 狀態：** **Bootstrap 歷史。** 下文 implementation targets 是當時初始清單，不是今日 backlog。現在先讀 [CLAUDE](../../CLAUDE.md)、[README](../../README.md) 與[固定 shared context](../memory/latest-shared-context.md)；`current-state.md` 僅是歷史導引。

## What Has Been Bootstrapped

This repo now has:

- scope-locking docs
- explicit contracts with the optional ingest backend
- a WXT + React + TypeScript shell
- background, content-script, and sidepanel entrypoints
- shared extension contracts and state types

## What The Next Agent Should Do

1. read `AGENTS.md`
2. read `docs/memory/latest-shared-context.md`
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
  - `historical dlens_chrome_extension_branch checkout`
- ingestion heart:
  - set `DLENS_INGEST_CORE_DIR` or place the checkout at `../dlens-ingest-core` if full pipeline dev is needed
