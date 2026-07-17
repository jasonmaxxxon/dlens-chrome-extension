# Task 6 report — complete

## RED proof

`npx tsx --test tests/topic-detail-view.test.tsx` ran after adding Task 6 ordering, state, action, duplicate-owner, inventory, and token-source regressions.

- Existing: 57 passing.
- New Task 6 regressions: 6 failing for the expected missing source-session owner/component contract.
- No production implementation was added before this RED run.

## Task 5 pre-removal bundle measurement

`npm run build && npm run bundle:guard` measured `output/chrome-mv3/content-scripts/threads.js` as:

| Metric | Measured | Limit | Result |
| --- | ---: | ---: | --- |
| raw | 911173 | 910000 | over by 1173 |
| gzip -9 | 254768 | 256000 | within by 1232 |
| brotli | 202947 | 203000 | within by 53 |

## Removal-only measurement

The pre-removal raw excess is retained as a measurement fact only. Per the approved implementation order, duplicate owners were then removed before deciding whether the final card needs a budget decision.

The original `903764 / 253041 / 201640` result is a partial removal-only checkpoint: it preceded the legacy non-Atlas `TopicProcessingStatus` and `BulkAnalyzeCta` removal. The complete removal-only checkpoint was measured by temporarily removing the card import and both mounts with `apply_patch`, running the build guard, then restoring the same import and mounts with `apply_patch`.

| Metric | Pre-removal | Partial removal-only | Full removal-only | Full delta vs pre-removal | Limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| raw | 911173 | 903764 | 903986 | -7187 | 910000 |
| gzip -9 | 254768 | 253041 | 253101 | -1667 | 256000 |
| brotli | 202947 | 201640 | 201752 | -1195 | 203000 |

Full removal-only is within every current limit. No budget file was modified.

## Final card verification

The legacy one-owner RED regression first failed on the old `data-topic-bulk-analyze` owner, then passed after removal. It covers both `needs_crawl` and `processing`, retains the source row, and asserts one top-level crawl/restart owner.

The focused source-session and viewmodel suite passed: 66/66.

- `npm run typecheck`: passed.
- `npm run boundary:guard`: passed.
- `npm run build`: passed.
- `npm run bundle:guard`: passed final delivery after completing duplicate-owner removal.

| Metric | Baseline | Full removal-only | Prior final | Final card | Limit | Final result |
| --- | ---: | ---: | ---: | ---: | --- |
| raw | 908871 | 903986 | 911979 | 908914 | 910000 | within by 1086 |
| gzip -9 | 254079 | 253101 | 255544 | 254718 | 256000 | within by 1282 |
| brotli | 202359 | 201752 | 203477 | 202808 | 203000 | within by 192 |

The final card adds +4928 raw, +1617 gzip -9, and +1056 brotli bytes over full removal-only. It remains inside the immutable limits. The prior over-budget final measurement is retained as evidence only; it was superseded by the completed approved removal.

The exact baseline and measured values are in `docs/qa/assets/2026-07-17/0.3.49-topic-session/bundle-budget.md`.
