# 2026-06-08 Product Status Audit

Audit time: 2026-06-08 15:50:43 HKT
Repo: `dlens-product-latest`
Branch: `codex/pr-visible-metrics`

## Executive Status

- Mainline code is currently healthy by local extension verification.
- There have been no commits dated 2026-06-01 or later after `git fetch --all --prune`.
- Current HEAD is `553b861 fix: restore compare provider gate`, and `origin/main` points to the same commit.
- Current branch is still configured against `origin/codex/pr-visible-metrics` and is ahead of that older branch by 3 commits.
- Extension version is synchronized at `0.1.27` across package, lockfile, WXT manifest config, UI build version, and built MV3 manifest.
- Fresh build output exists at `output/chrome-mv3`; manifest reports `DLens v3` and `0.1.27`.
- Backend live smoke is not verified in this run because `http://127.0.0.1:8000/worker/status` was not reachable.

## Verification Evidence

Commands run:

```bash
git fetch --all --prune
git status --short --branch
git log --since='2026-06-01' --all
node -e "..."
curl -sS --max-time 3 http://127.0.0.1:8000/worker/status
npm run typecheck
npx tsx --test tests/product-routing.test.ts tests/inpage-collector-state-split.test.ts tests/components.test.tsx tests/views.test.tsx tests/product-signal-analysis.test.ts tests/product-signal-storage.test.ts tests/processing-state.test.ts
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
git diff --check
```

Results:

- `npm run typecheck`: ok.
- DLens targeted QA suite: 135 tests ok.
- Full test suite: 615 tests ok, 0 failed.
- `npm run build`: ok, mirrored unpacked extension to `output/chrome-mv3`.
- `git diff --check`: ok.
- Built artifact timestamp: `2026-06-08 15:49:34 HKT`.
- Built manifest: `name = "DLens v3"`, `version = "0.1.27"`, `manifest_version = 3`.

Note: `npx` printed a temporary install warning for `tsx@4.22.4`; it did not create new package files in the working tree.

## Working Tree

Current dirty files:

- `.agents/skills/ui-ux-pro-max/scripts/__pycache__/core.cpython-313.pyc`
- `.agents/skills/ui-ux-pro-max/scripts/__pycache__/design_system.cpython-313.pyc`
- `src/ui/InPageCollectorPopup.tsx`
- `src/ui/components.tsx`
- `tests/components.test.tsx`
- `docs/audit/2026-06-08-product-status-audit.md`

Source diff summary before this audit file:

- `InPageCollectorPopup` computes one `showProcessingContextStrip` boolean and passes `reserveContextStrip` only when that strip is actually relevant.
- `WorkspaceShell` no longer reserves an empty processing-strip slot by default; it can reserve the slot when explicitly requested.
- Workspace switcher accents now use Topic cyan and PR rose.
- Component tests cover mode accents and the conditional processing-strip reservation.

Risk judgment:

- The UI/test diff is coherent and locally verified.
- The `.pyc` binary changes are workspace noise and should not be included in a product commit.
- If the UI diff is shipped to `main`, it is user-visible and should trigger the normal version bump rule.

## Runtime Contract Check

- Product `classification` remains in both `PRODUCT_SIGNAL_PAGES` and `ALLOWED_PAGES.product`.
- Product mode still opens `saved-signals` as home.
- Product Action route tests reject the removed page-level `Agent export`, `原文優先`, `精簡決策`, and `複製 Agent Brief` surface.
- Settings remains outside the primary mode rail through `UtilityEdge` and covered component tests.
- `product/clear-cache` is covered by behavior tests and removes derived Product cache without deleting saved signals.
- Snapshot RMW behavior is covered by background behavior tests, including `mutateSnapshot` serialization and no-op refresh writes.

## Documentation Drift

Items to fix before the next handoff refresh:

- `docs/memory/latest-shared-context.md` still says Topic/Folder synthesis use `v2.work-signal-lens`; runtime and `docs/memory/current-state.md` say `v3.generic-keyword-lens`.
- `README.md` and `docs/memory/latest-shared-context.md` still list `609/609`; current full suite is `615/615`.
- `README.md` open-risk line counts are stale: actual `entrypoints/background.ts` is 3373 lines and `src/ui/useInPageCollectorAppState.ts` is 1604 lines.
- `.agents/skills/dlens-extension-qa/SKILL.md` says Batch export must offer `原文優先` and `精簡決策`; current AGENTS/README/tests say the Action route must not show the removed page-level Agent export panel. The QA skill should distinguish legacy batch export tests from the current Action route contract.

## Product Status

- Archive/Library: local save, readiness, queue/drain UI, and Process All remain covered by tests.
- Topic: Casebook, Topic Detail, semantic tags/gists, topic signal readings, audit pipeline, and synthesis compatibility remain covered by tests.
- Product: ProductContext/ProductSignalAnalyzer v17, Product Action reading review, Marginalia/Verdict cards, cache reset, SignalReading v9, and Signal Packet v3 remain covered by tests.
- PR Evidence: campaign setup, evidence ledger, CSV/MD/DOCX summary surfaces, criteria generation/matching, and PR-only build routing remain covered by tests.
- Backend-dependent product quality, especially ThreadReadModel OP-continuation refinement, is still open and was not live-smoked because backend was offline.

## Recommended Next Actions

1. Decide whether to keep the current UI diff. If yes, remove `.pyc` noise from the commit scope, bump to `0.1.28`, rebuild, and ship deliberately.
2. Refresh docs in place: `docs/memory/latest-shared-context.md`, README test count, README line counts, and the DLens QA skill wording.
3. Start the backend and run a Chrome manual QA walk from `output/chrome-mv3`: Product recovered-analysis/action views, Topic Console/Stack, Compare Parallel/Chapters, PR PDF upload, criteria generation, matching, CSV export, and MD/DOCX summary export.
