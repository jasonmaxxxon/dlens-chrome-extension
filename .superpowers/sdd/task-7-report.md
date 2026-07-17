# Task 7 report: Folder-scoped Status Rail Motion and Disclosure

## TDD evidence

- Baseline: `npx tsx --test tests/components.test.tsx tests/motion-registry.test.ts` passed `52/52` before edits.
- RED: after adding the Task 7 assertions, the same command failed `4/55` for the expected missing contracts: scoped folder count, active/disclosure/progress hooks, idle active marker, and active rail pulse source hook.
- First GREEN attempt: `54/55`; the remaining failure correctly caught hidden `idle` copy under an unreachable backend. Production copy was corrected to preserve the existing reachability-first contract.
- Final GREEN: `55/55`, including active disclosure, keyboard focus, `45%` and zero progress, idle/retry/error no-animation semantics, warning/danger labels, and the global reduced-motion wildcard.

## Implementation summary

- Added optional `scopeLabel` with default `資料夾`; the popup's only callsite passes it explicitly.
- Added `data-status-rail-active`, `data-status-rail-disclosure`, and `data-status-rail-progress` hooks without changing backend work-state ownership.
- Active work alone uses `tokens.motion.keyframes.pulse`; retry, error, and idle remain still. The existing global reduced-motion neutralizer covers the pulse.
- Added a `tabIndex={0}` hover/`focus-visible` disclosure with scoped work copy and a clamped determinate bar. No React state or timers were added.
- Replaced rail gap, padding, and work-dot dimensions with the nearest shared spacing tokens; modified rail/disclosure visual declarations use tokens or shared text styles.

## Verification

| Command | Result |
| --- | --- |
| `npx tsx --test tests/components.test.tsx tests/motion-registry.test.ts` | PASS — 55 tests, 0 failures |
| `npm run typecheck` | PASS — `tsc --noEmit` |
| `npm run build` | PASS — Chrome MV3 production build |
| `npm run bundle:guard` | PASS — 909983 raw / 255021 gzip -9 / 202997 brotli bytes |
| `git diff --check` | PASS |

## Bundle ledger

- Task 6 final checkpoint: `909055 / 254785 / 202737` raw/gzip/brotli bytes.
- Task 7 rail-only delta: `+928 / +236 / +260` bytes.
- Approved 0.3.48 baseline: `908871 / 254079 / 202359` bytes.
- Total 0.3.48-to-final delta: `+1112 / +942 / +638` bytes.
- Final headroom against unchanged limits: `17 / 979 / 3` bytes.
