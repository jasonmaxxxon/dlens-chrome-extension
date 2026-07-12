# Topic Audit Bounded P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace P1's full raw-reply prompt with a hard-bounded shard-to-post reducer.

**Architecture:** P0.5 persists its prose on `CommentShardReading`; P1 consumes bounded OP context, bounded author context, and bounded shard distillates. Both audit entry points create missing shard readings before P1.

**Tech Stack:** TypeScript, Node test runner via `tsx`, MV3 Chrome extension storage.

## Global Constraints

- Preserve evidence-bound LLM reading; do not replace it with deterministic keyword synthesis.
- Do not touch Topic distribution UI in this slice.
- Preserve legacy stored shard readings with an optional field.
- P1 prompt length must never exceed 24,000 characters.

---

### Task 1: Lock the bounded P1 contract

**Files:**
- Modify: `tests/topic-audit-prompts.test.ts`
- Modify: `tests/topic-audit-handlers.test.ts`

**Interfaces:**
- Consumes: `buildP1SignalReadingPrompt`, `handleTopicAuditMessage`
- Produces: failing tests for distillate-only P1, hard budget, and single-signal shard generation

- [x] Write prompt and handler regression tests.
- [x] Run `npx tsx --test tests/topic-audit-prompts.test.ts tests/topic-audit-handlers.test.ts` and confirm failures are caused by raw P1 rendering/missing shard prose.

### Task 2: Persist shard prose and build bounded P1

**Files:**
- Modify: `src/compare/topic-audit.ts`
- Modify: `src/compare/topic-audit-prompts.ts`
- Modify: `src/state/topic-audit-handlers.ts`

**Interfaces:**
- Consumes: P0.5 `AuditPromptEnvelope.prose`
- Produces: `CommentShardReading.reading?: string`, `TOPIC_AUDIT_P1_PROMPT_MAX_CHARS`, `buildP1SignalReadingPrompt(packet, shardReadings)`

- [x] Persist P0.5 prose as `CommentShardReading.reading`.
- [x] Add bounded OP/author/shard renderers and the 24,000-character guard.
- [x] Ensure full and single-signal handlers create/use packet-scoped shard readings.
- [x] Run targeted tests and confirm GREEN.

### Task 3: Version and document the live contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `wxt.config.ts`
- Modify: `src/ui/version.ts`
- Modify: `tests/manifest-config.test.ts`
- Modify: `README.md`
- Modify: `docs/architecture/dlens-current-architecture-map.md`
- Modify: `docs/memory/latest-shared-context.md`

**Interfaces:**
- Produces: source/build version `0.3.34` and current handoff documentation

- [x] Bump all five version locks to `0.3.34`.
- [x] Record the bounded P1 behavior and retained next steps.

### Task 4: Verify the slice

**Files:**
- Verify only

**Interfaces:**
- Produces: fresh gate evidence

- [x] Run targeted Topic audit tests.
- [x] Run `npm run typecheck`.
- [x] Run the full test suite.
- [x] Run boundary/storage guards, build, and `git diff --check`.
- [x] Confirm built manifest version and bounded-P1 bundle marker.
