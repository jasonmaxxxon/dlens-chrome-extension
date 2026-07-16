# UI dead-source inventory — verified 2026-07-16

Rule of this document (plan Task 2.3): candidates are RECORDED here, not deleted.
Each later deletion is its own `removal:` commit and must re-verify at deletion
time: production callers 0 · test callers understood · unique bundle marker 0 ·
typecheck/targeted tests green after · deterministic artifact hash identical
(pure tree-shaken source) or behavior-characterized (live dead state).

## Completed removals (this branch)

| Symbol | Callers | Tests | Bundle marker | Decision |
|---|---|---|---|---|
| `components.tsx` `statusTheme` / `hudLabel` / `formatElapsed` / `PageButton` | 0 (declaration-only) | none | 0 hits in `output/chrome-mv3` | deleted in `0d33342`; artifact hashes byte-identical |
| `topic-audit-components.tsx` `NewsroomLane` / `NewsroomLadder` / `NewsroomUncertainty` / `NarrativeLaneDetailPanel` / `ReactionPatternDetailPanel` + private `ReactionEvidenceList`, `NewsroomRole`, `NEWSROOM_ROLE_META`, `newsroomRoleForLane`, `NewsroomLadderSource/Quote` types | 0 production | `buildNewsroomLadder` had 1 orphan test (removed with it) | 0 hits (`Newsroom` string absent from bundle) | deleted in `0d33342`; Newsroom-absence contract tests preserved |
| `ModeRailButton`, `Dot`, `ReactionCoverageStrip` | live in-file callers only | covered via parents | n/a (live) | un-exported in `0d33342`, kept |
| `CompareView.tsx` `hoveredClusterKey`, `expandedEvidenceKeys` + `toggleEvidence`, `engagementExpanded`, `commentsExpanded`, `supportExpanded` (value + inert setter call), `highlightedClusterPanel` (+ timer effect) | setters fired but value never reached DOM/style/message/storage | 3 characterization tests added GREEN pre-deletion | live code (inside components) — verified by behavior, not hash | deleted in `ae93b16`; −306 B raw, −139 B gzip |

## Open candidates — recorded only, NOT deleted

| Symbol | Callers | Tests | Marker | Decision |
|---|---|---|---|---|
| `CompareView.tsx` `AudienceDetailPanel` | 0 production (declaration-only at `src/ui/CompareView.tsx:883`); NOT in `compareViewTestables` | 0 (one test-file mention is a comment, not a caller) | 0 hits in `output/chrome-mv3` (`AudienceDetailPanel` and `data-jump-highlight` both absent) — fully tree-shaken | independently deletable, hash-identity class (verified 2026-07-16; corrected from an earlier wrong "testables" claim) |
| `CompareView.tsx` `ClusterBubbleMap` | never rendered live; exported via `compareViewTestables` | exercised via testables | in bundle (testables keep it live) | DEFER — testables contract must be renegotiated first |
| `CompareView.tsx` `selectClusterAndFocus` | 0 live calls (pre-existing unused warning) | none directly | in bundle | candidate for next Compare `removal:` commit after testables review |
| `CompareView.tsx` `clustersSectionRef` / `engagementSectionRef` / `commentsSectionRef`, `commentsA/B`, `ageA/B` | pre-existing `--noUnusedLocals` warnings; not created by this branch | none | in bundle | candidate; verify no ref threading before removal |
| Compare Technique pipeline (`comparePage`, Technique reading storage/controller, `openTechniqueView`) | contract live in controller/storage/docs; UI entry unclear | motion-registry scroll contract locks `openTechniqueView` | in bundle | NOT dead-source scope — separate product decision: restore entry vs remove whole lane (plan global constraint) |

## Must-NOT-delete guard list (look dead, are live)

- `src/viewmodel/narrative-lane-detail.ts`, `src/viewmodel/reaction-pattern-detail.ts` — consumed directly by `TopicDetailView.tsx` (the current Topic drawer).
- Product `inferWorkflowPattern`, `citationUseCase` — live per plan §Task 2.3.
- All "Newsroom markers must NOT appear in the UI" absence-contract tests — they are the regression lock for the retired family, keep forever.
