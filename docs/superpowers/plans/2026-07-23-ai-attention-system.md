# AI Attention System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize user-triggered AI generation and ready-to-act attention states with a shared Searching Orb and Attention Beam.

**Architecture:** Shared primitives own markup and motion. An explicit call-site allow-list adopts them; background crawl, queue, hydrate, retry, and synchronization states remain unchanged.

**Tech Stack:** TypeScript, React, CSS keyframes in the existing motion registry, WXT MV3.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-23-ai-attention-system-design.md` exactly.
- Use TDD and observe focused RED before production changes.
- Do not perform a global loading-spinner replacement.
- Do not push or bump the public extension version.
- Preserve unrelated untracked files.

---

### Task 1: Shared attention primitives

**Files:**
- Modify: `src/ui/components.tsx`
- Modify: `src/ui/motion.ts`
- Test: `tests/components.test.tsx`
- Test: `tests/motion-registry.test.ts`

- [ ] Add failing render/source tests for `SearchingOrb` and `AttentionBeam` states and reduced-motion ownership.
- [ ] Run focused tests and record RED.
- [ ] Implement a single 20px default bright orb, generating/actionable/none beam states, aria-safe markup, and reduced-motion CSS.
- [ ] Run focused tests and typecheck.

### Task 2: Adopt only allow-listed AI actions

**Files:**
- Modify only relevant call sites in `src/ui/ProductSignalViews.tsx`, `src/ui/TopicDetailView.tsx`, `src/ui/PrEvidenceViews.tsx`, `src/ui/CompareSetupView.tsx`, and `src/ui/LibraryView.tsx`.
- Test the matching existing view files.

- [ ] Add failing assertions for allow-listed AI generation controls.
- [ ] Add negative assertions for crawl, queue, hydrate, retry, and synchronization states.
- [ ] Run focused tests and record RED.
- [ ] Replace local generation spinners/shimmers only at the allow-listed call sites.
- [ ] Apply actionable static attention to try application surfaces and primary action CTA only.
- [ ] Run focused tests and typecheck.

### Task 3: Package verification

- [ ] Run component, motion, and all touched View tests.
- [ ] Run typecheck, boundary guard, full tests, build, bundle check, and `git diff --check`.
- [ ] Perform real-Chrome idle/generating/success/error and reduced-motion acceptance; keep release pending if not completed.

