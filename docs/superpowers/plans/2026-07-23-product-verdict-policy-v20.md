# Product Verdict Policy v20 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive Product verdicts deterministically from four model-supplied axes and make watch results concretely useful.

**Architecture:** Provider schemas return structured judgment axes, never verdict. A pure TypeScript policy derives and persists verdict once. Product Action keeps four tiles but uses mutually exclusive membership and renders structured watch guidance.

**Tech Stack:** TypeScript, React, WXT MV3, Node test runner through `tsx`.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-23-product-verdict-policy-v20-design.md` exactly.
- Use TDD and observe each focused test fail before production changes.
- Do not touch Product Import Package B or copy Package C.
- Do not push or bump the public extension version.
- Preserve unrelated untracked files.

---

### Task 1: Four-axis provider and policy core

**Files:**
- Modify: `src/state/types.ts`
- Modify: `src/compare/product-signal-analysis.ts`
- Modify: `src/compare/product-signal-storage.ts`
- Test: `tests/product-signal-analysis.test.ts`
- Test: `tests/product-signal-storage.test.ts`

**Interfaces:**
- Produces: `ProductSignalJudgmentAxes`, `ProductSignalJudgmentWarning`, `ProductWatchGuidance`, and `deriveProductSignalVerdict`.

- [ ] Add failing schema tests proving raw `verdict` is absent and four snake-case axes plus `watch_guidance` are required.
- [ ] Add failing table-driven tests for every ordered policy rule and warning case.
- [ ] Run focused tests and record the expected RED failures.
- [ ] Implement types, pure policy, v20 prompt/schema/parser, strict guidance gates, persistence normalization, and stale-v19 behavior.
- [ ] Run `npx tsx --test tests/product-signal-analysis.test.ts tests/product-signal-storage.test.ts` and `npm run typecheck`.

### Task 2: Mutually exclusive Product Action grouping and watch UI

**Files:**
- Modify: `src/ui/ProductSignalViews.tsx`
- Modify: `src/viewmodel/product-card-presentation.ts`
- Test: `tests/views.test.tsx`
- Test: `tests/product-card-presentation.test.ts`
- Test: `tests/product-signal-viewmodel.test.ts`

**Interfaces:**
- Consumes: Task 1 derived `analysis.verdict` and `watchGuidance`.
- Produces: four mutually exclusive Action tiles and three-row watch guidance.

- [ ] Add failing tests for ordered noise/insufficient/watch+park/try membership, no double counting, empty noise, and watch guidance labels.
- [ ] Add failing mixed-density pager fixture.
- [ ] Run focused tests and record RED.
- [ ] Implement the ordered grouping helper, rename the second tile to `噪音`, merge non-noise park into `保留觀察`, and render watch guidance.
- [ ] Preserve compact park, full watch, application/brief gates, four-tile CSS, and pager behavior.
- [ ] Run focused view/presentation/viewmodel tests and typecheck.

### Task 3: Package verification

- [ ] Run Product analysis, storage, presentation, viewmodel, and view tests together.
- [ ] Run `npm run typecheck`, `npm run boundary:guard`, `npm run storage:seam-guard`, full tests, build, bundle check, and `git diff --check`.
- [ ] Perform the real-Chrome acceptance in the design spec; do not claim release readiness if it remains pending.

