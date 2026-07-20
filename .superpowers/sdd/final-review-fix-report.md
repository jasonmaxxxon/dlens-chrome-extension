# Final Review Fix Report

**Date:** 2026-07-20

**Base HEAD:** `0ba8d3ddb66d9324378c2c85a4139ff89c57c045`

**Expected version:** `0.3.54`

**Status:** implementation and static verification complete; real Chrome/Threads QA remains pending

## Binding product decision preserved

- Signals remains the sole owner of analysis start/retry.
- Action remains the owner of reading, review, and export.
- The Action total-zero state still renders four disabled verdict tiles and directs the user back to Signals; no analyze/retry control was added.

## TDD evidence

### Fix 1 — visual order versus default priority

- RED command: `npx tsx --test --test-name-pattern='Product Action verdict tiles render|follows visual tile keyboard order' tests/views.test.tsx`
- RED result: exit 1; 2 tests failed. DOM order was `try → watch → park → insufficient`, and ArrowRight from `try` selected `watch` instead of `park`.
- Implementation: split `ACTION_VERDICT_VISUAL_ORDER` (`try → park → insufficient → watch`) from `ACTION_VERDICT_DEFAULT_PRIORITY` (`try → watch → park → insufficient`); render and directional navigation use visual order while first-enabled selection uses default priority.
- GREEN command: `npx tsx --test --test-name-pattern='Product Action verdict tiles render|follows visual tile keyboard order|default to the first enabled bucket' tests/views.test.tsx`
- GREEN result: exit 0; 3 tests passed, 0 failed.

### Fix 2 — Product session stage-state reset

- RED command: `npx tsx --test --test-name-pattern='Product Action resets verdict stage state' tests/views.test.tsx`
- RED result: exit 1; 1 test failed because same-root session B retained session A's selected verdict (`aria-selected=false` for B's expected default `try`).
- Implementation: key the `ProductActionStage` mount by stable `viewModel.sessionId`. This resets filter, per-bucket signal/source position, direction, and other Action-local state only when the Product session changes; ordinary rerenders in the same session preserve memory.
- GREEN command: `npx tsx --test --test-name-pattern='Product Action resets verdict stage state|brief selection prunes' tests/views.test.tsx`
- GREEN result: exit 0; 2 tests passed, 0 failed.

### Fix 3 — tab/panel semantics and 44px targets

- RED command: `npx tsx --test --test-name-pattern='Product Action verdict tabs link' tests/views.test.tsx`
- RED result: exit 1; 1 test failed because verdict tabs had no stable IDs/`aria-controls`; the panel contract and explicit 44px targets were also absent.
- Implementation: every verdict control remains a native button with `role=tab`, stable tab ID, `aria-selected`, and `aria-controls`; the one active or empty panel now has stable `id=product-action-stage-panel` and `role=tabpanel`, with `aria-labelledby` when a verdict is selected. Verdict tiles and both pager buttons have explicit `minHeight: 44`.
- GREEN command: `npx tsx --test --test-name-pattern='Product Action verdict tabs link|total-zero state|stage groups completed analyses' tests/views.test.tsx`
- GREEN result: exit 0; 3 tests passed, 0 failed.

### Fix 4 — persisted analysis error lifecycle

- RED command: `npx tsx --test --test-name-pattern='SavedSignalsBoard counts persisted analysis errors' tests/views.test.tsx`
- RED result: exit 1; 1 test failed. An `analysis.status:error` signal with ready source rendered ledger `可分析 0` and row `可分析`.
- Implementation: added one `savedSignalLifecycle` helper used by both ledger counts and management-row labels. Ready, never-analyzed signals and ready, retryable analysis errors share the `可分析／重試` cell; error rows render `分析失敗 · 可重試` with warning tone. Crawl-error aggregation and backend detail contracts were untouched.
- GREEN command: `npx tsx --test --test-name-pattern='SavedSignalsBoard|saved signals|Saved and Action surfaces|distinct information shape' tests/views.test.tsx`
- GREEN result: exit 0; 10 tests passed, 0 failed.

### Combined focused gate

- Command: `npx tsx --test --test-name-pattern='Product Action verdict tiles render|follows visual tile keyboard order|resets verdict stage state|verdict tabs link|counts persisted analysis errors|default to the first enabled bucket|total-zero state' tests/views.test.tsx`
- Result: exit 0; 7 tests passed, 0 failed.

## Required verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npx tsx --test tests/views.test.tsx tests/motion-registry.test.ts tests/product-signal-viewmodel.test.ts tests/qa-code-path-audit.test.ts tests/manifest-config.test.ts` | exit 0; 140 passed, 0 failed |
| `node scripts/qa-code-path-audit.mjs` | exit 0; 5 pass, 0 warn, 0 fail |
| `git diff --check` | exit 0 |
| `npx tsx --test tests/*.test.ts tests/*.test.tsx` | exit 0; 1326 tests, 1321 passed, 5 skipped, 0 failed |
| `npm run build` | exit 0; WXT chrome-mv3 build completed as version `0.3.54`; mirrored to `output/chrome-mv3` |
| `npm run bundle:guard` | exit 0; raw 887,801 / 910,000; gzip9 250,270 / 256,000; brotli 199,667 / 203,000 bytes |

## Changed files

- `src/ui/ProductSignalViews.tsx` — order contracts, session boundary, tab/panel semantics, target sizes, Saved lifecycle helper.
- `tests/views.test.tsx` — DOM order, keyboard order, same-root session reset, accessibility/target contract, and retryable persisted-error regressions.
- `README.md` — approved verdict visual order and Saved ready/retry wording.
- `docs/superpowers/specs/2026-07-20-product-action-verdict-intake-design.md` — binding Signals/Action ownership and retryable-error lifecycle; removed the stale Action recovery-path sentence.
- `.superpowers/sdd/final-review-fix-report.md` — this RED/GREEN, verification, changed-files, and self-review record.

## Self-review

- No changes to background, evidence, reading, export, storage, or message data contracts.
- Version remains `0.3.54`; no dependency or lockfile changes.
- Default bucket priority is still independent of the visual/keyboard order.
- Session reset occurs at the Action stage boundary, so same-session analysis refreshes do not erase stage memory.
- The all-zero Action state retains disabled tiles, no active plate, and no analyze/retry button.
- Persisted analysis errors use existing status/readiness facts only; no raw backend detail was invented or exposed.

## Remaining concerns

- Real Chrome reload and real Threads interaction QA were not performed and remain explicitly pending.
- The bundle guard passes, but brotli headroom is 3,333 bytes; future UI growth should be watched.
- `npm install` reported 15 dependency audit findings (3 low, 4 moderate, 5 high, 3 critical). The install was already up to date and this fix wave changed no dependencies; remediation is outside this brief.

## Final re-review docs evidence refresh

- Manifest lookup command: `node -e 'const m=require("./output/chrome-mv3/manifest.json"); console.log(JSON.stringify(m.content_scripts,null,2))'`
- Manifest result: the Threads match entry (`*://*.threads.com/*`, `*://*.threads.net/*`) references only `content-scripts/threads.js`.
- Hash command: `shasum -a 256 output/chrome-mv3/content-scripts/threads.js`
- Hash result: `f445adf5d147d2224e76358430966a5d854105b12c1bdcd4074c0b4e7155cb4b  output/chrome-mv3/content-scripts/threads.js`.
- README and `docs/memory/latest-shared-context.md` now record the final full-suite result (1326 tests / 1321 pass / 5 skipped / 0 fail), bundle sizes (887801 raw / 250270 gzip-9 / 199667 brotli), source/build version `0.3.54`, the fresh content-script SHA-256 above, and pending real Chrome/Threads QA.
- Read-back confirmed both release-evidence locations contain those exact values; a fresh `git diff --check` exited 0.
- This docs-only refresh did not modify code, tests, or built artifacts; tests/build were not rerun by explicit instruction.
