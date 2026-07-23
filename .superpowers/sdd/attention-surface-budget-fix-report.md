# Product Attention Surface budget fix report

## Status

Complete on top of prior implementation head `6b5f5d2`; the fix commit is `5eb5d57`.

Commit subject: `bug fix: restore attention surface bundle budget`

## Scope

Changed only:

- `src/ui/ProductSignalViews.tsx`
- `src/ui/motion.ts`
- `tests/views.test.tsx`
- this report

Existing untracked artifacts were left untouched. No budget, token, prompt,
storage, verdict, behavior, version, manifest, dependency, or approved visual
value was changed.

## Root cause and implementation

Fresh temporary builds isolated the raw bundle growth:

| Revision | Raw bytes | Delta |
| --- | ---: | ---: |
| `e141b56` | 917,196 | baseline |
| `8319dc8` | 918,098 | +902 |
| `c406153` | 918,493 | +395 |
| `6b5f5d2` | 919,494 | +1,001 |

The raw-only failure came from duplicated full-surface CSS declarations plus
repeated inline layout objects in the new application surface. Compressed
budgets were already green.

The fix:

- removed the unused `AttentionBeam` import from `ProductSignalViews.tsx`;
- merged common beam/surface CSS base declarations;
- retained one shared sweep rule and reduced the surface-specific sweep rule
  to its required `z-index` override;
- reused two local style helpers for byte-identical `space-between` rows and
  compact field stacks.

All existing data markers and DOM behavior remain. Full analysis,
deep-reading, and application surface ownership remain. `SearchingOrb`,
reduced motion, and legacy `AttentionBeam` consumers remain. Application
`cardLg` / `atlasPaper` / `atlasCard` / `atlasEdge` material and the
source-fit-test-verification-Agent hierarchy remain. Watch, park, noise, and
insufficient surfaces remain neutral.

## Ownership regression

Added:

`Product Action application render has one actionable owner and no nested beams`

It renders a grounded application suggestion with an Agent task and asserts:

- exactly one `data-attention-beam="actionable"` in the application render;
- the application surface owns that marker;
- the recommendation heading, brief CTA, Agent footer, and Agent copy button
  do not own a nested beam.

This is coverage strengthening, not a valid TDD RED. The first test attempt
failed with `0 !== 1` because its fixture omitted captured evidence, so the
presentation correctly rejected the application suggestion. After correcting
the fixture, the new assertion passed against the existing production
ownership before bundle implementation changes.

## Fresh verification

| Command | Result |
| --- | --- |
| `npx tsx --test tests/components.test.tsx tests/motion-registry.test.ts tests/views.test.tsx` | 198 passed, 0 failed |
| `npm run typecheck` | passed |
| `npm run boundary:guard` | View and ViewModel: 0 violations, 0 bypasses |
| `npm run build` | passed; Chrome MV3 mirrored to `output/chrome-mv3` |
| `npm run bundle:guard` | passed |
| `git diff --check` | passed |

Fresh final bundle metrics:

```text
rawBytes:    918410 / 918500 bytes  (90 bytes headroom)
gzip9Bytes:  258353 / 258700 bytes  (347 bytes headroom)
brotliBytes: 205534 / 206000 bytes  (466 bytes headroom)
```

The final raw bundle is 1,084 bytes smaller than the failing `6b5f5d2`
artifact without changing the approved budget.

## Concerns

- Raw headroom is intentionally narrow at 90 bytes; the guard is green, but
  future UI changes should continue consolidating repeated style/markup
  footprint.
- This task performed static render-contract, type, boundary, build, and bundle
  verification only. It does not claim fresh real-Chrome visual acceptance.
