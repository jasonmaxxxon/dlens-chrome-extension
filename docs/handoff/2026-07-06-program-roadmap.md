# DLens Program Roadmap（2026-07-06）

> Written by the Fable session that landed Phase 2 slices 1–2 and the
> gallery-white winner mockup. Purpose: ONE place any future session (Claude or
> Codex) reads to know what's next, in what order, and who decides what.
> 中文摘要：Codex 5.5 額度充裕，實作全部派 Codex；Claude 出方向、寫 slice 規格、
> 驗收、看 merge gate；Jason 只握品味閘。此檔只排隊，不重複各計畫檔的細節。

## Operating model（why this doc exists）

- **Codex quota is abundant (5.5 max)** — implementation defaults to Codex,
  dispatched non-interactively (`codex exec --cd <worktree> --sandbox
  workspace-write`; pre-run `npm ci` + `npm install --no-save tsx`; tell it
  NOT to commit — sandbox can't write the shared `.git`; tests inside the
  sandbox run via `node --import tsx --test`).
- **Claude = direction + contracts + merge gate.** Every Codex "done" is an
  unverified claim; the full repo verify gate reruns in the verifier's own
  context before merge. Dispatch prompts follow
  `~/.claude/protocols/delegation-templates.md` T2.
- **Jason = taste gates only**: mockup sign-offs, token swaps, version bumps,
  anything user-visible at the language level. Mechanical gate-green slices
  merge without per-slice approval (mandate given 2026-07-06).

## Queue

### NOW — Phase 2 of the visual reset（mechanical, Codex）

Plan of record: `docs/handoff/2026-07-03-visual-reset-B-plan.md`.
Done: slice 1 CompareView (54→0), slice 2 ProductSignalViews (38→0,
+19 new-role tokens). Remaining:

- **Slice 3** (dispatched): `topic-audit-components.tsx` 18,
  `PrEvidenceViews.tsx` 16, `components.tsx` 15, `CompareView.parts.tsx` 13.
- **Slice 4**: the tail — `SignalDrawer.tsx` 11, `ProcessingStrip.tsx` 5,
  `LibraryView.tsx` 5, `runtime-guard.ts` 4, `CompareSetupView.tsx` 3,
  `TopicsListView/TopicDetailView/InPageCollectorPopup` 1 each,
  `InPageCollectorOverlays.tsx` 17, plus the `usePopupKeyframes.ts` (9)
  decision: allowlist ONLY if keyframe strings genuinely cannot cite tokens.
- **Phase 2 exit**: add `tests/color-literal-guard.test.ts` (zero `#hex` /
  `rgb(a)` / `hsl(a)` literals in `src/ui` outside `tokens.ts` + explicit
  allowlist). Then ONE version bump (4-file lock) + runtime QA on the real
  Chrome `Default` profile. Known automation gap: extension reload at
  `chrome://extensions` needs one manual click from Jason; everything after
  (real Threads page → in-page launcher → per-surface screenshots) is drivable
  via the Claude-in-Chrome MCP.

### GATED ON JASON — before Phase 3 can start

1. **Gate 1**: sign (or amend) the winner mockup
   `docs/mockups/2026-07-05-reset-B-gallery-white-winner.html`.
2. **Gate 0 leftovers**: per-surface keep / repaint / rebuild for
   Product signals / Topic detail / Compare / PR Evidence (record in the
   reset-B plan file).

### THEN — Phase 3: the swap（1 PR + 1 QA session）

New gallery-white values into `tokens.ts` + full `tokens-intent.md` rewrite
(new metaphor + refuse-list; also rename the component-named tokens
`productActionCardHover/Strong` to role names). Version bump. Real-profile QA
all four modes. Rollback = revert one PR. Details in the reset-B plan.

### PARALLEL LANE — independent of the reset

- **Topic detail text density, Slice A (P0)** —
  `docs/handoff/2026-06-22-topic-detail-text-density-todo.md`: §1/§7 verbatim
  duplicate, §3 "尚未生成" placeholder leak, numbered-list → `<ol>` parsing.
  Doc-specified bug fixes; dispatch to Codex any time; user-visible → include
  in the next version bump. Slices B (visual rhythm) and C (affordances) wait
  for Jason's taste review.

### LATER

- **Phase 4 UX reshape** — driven by the Gate 0 rebuild list, one surface per
  plan file, never bundled with the Phase 3 repaint.
- **LOC follow-up phase 2** — `docs/handoff/2026-06-22-loc-followup-phase2-plan.md`
  (`<View>.parts.tsx` structural splitting, PR #68 pattern). Quota-friendly
  big Codex slices; honest LOC accounting required.
- **Backend API/JOBS guard** — stays 🟢 until a live-failure guard proves
  visible recovery against a real regression class (architecture-map note).

## Standing rails (do not relitigate per slice)

Full verify gate green in the verifier's own context before any merge;
mockup-first for anything that changes the look; one-in-one-out for UI
surface; substance-over-decoration (real derived data behind every click);
no per-model UI redos — design-language changes are ONE deliberate token
migration through this queue, nothing else.
