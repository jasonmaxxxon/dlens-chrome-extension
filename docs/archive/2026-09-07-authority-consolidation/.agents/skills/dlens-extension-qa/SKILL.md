---
name: dlens-extension-qa
description: Verify DLens extension changes before handoff, especially collect/save, Product mode routes, product signal analysis output, storage normalization, settings access, and visible UX regressions in dlens-product-latest.
---

# DLens Extension QA

Use this before claiming a DLens extension change is ready.

## Scope

Run this for changes touching:

- collect/save flows
- `ProductSignalAnalyzer`, product-signal storage, or Product mode UI
- Product mode routes such as Saved Signals and Actionable Filter
- Settings / product profile / API key behavior
- popup shell, workspace strip, mode rail, or mode theme tokens

## Workflow

1. Check the working tree first:
   - `git status --short`
   - `git diff --stat`
   - Do not revert unrelated user changes.

2. Verify route and UI contracts:
   - Product mode must render `saved-signals` as the guarded landing page.
   - Settings must stay a utility action outside the primary mode rail.
   - Saved Signals rows must be compact list rows.
   - Batch export must require manual selection and must offer `原文優先` and `精簡決策`.

3. Verify analyzer and storage contracts:
   - Product signal schema accepts `marketing`.
   - Parser/storage must preserve valid records and drop malformed legacy records.
   - Product analysis must use real `ThreadReadModel` / assembled content, not fixture or fake AI output.

4. Run targeted tests:
   ```bash
   npx tsx --test \
     tests/product-routing.test.ts \
     tests/inpage-collector-state-split.test.ts \
     tests/components.test.tsx \
     tests/views.test.tsx \
     tests/product-signal-analysis.test.ts \
     tests/product-signal-storage.test.ts \
     tests/processing-state.test.ts
   ```

5. Run full verification before handoff:
   ```bash
   npm run typecheck
   npx tsx --test tests/*.test.ts tests/*.test.tsx
   npm run build
   ```

6. Check build output:
   - Confirm `output/chrome-mv3/manifest.json` exists.
   - Confirm build timestamps changed after `npm run build`.
   - If the user is testing the unpacked extension, tell them the verified path is `output/chrome-mv3`.

## Reporting

Report exact commands run and whether they passed. If anything was not verified, say so directly.
