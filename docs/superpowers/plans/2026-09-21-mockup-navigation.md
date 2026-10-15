> Resumed by explicit user request 2026-09-29. Current evidence: `docs/handoff/mockup-navigation-paused.md`.

# Mockup navigation implementation plan

User explicitly approved the 2026-09-18 collection/reading mockup direction on 2026-09-21 with「直接開始」. This supersedes the permanent Topic/Product/PR switcher and repeated status/empty Atlas surfaces, while preserving all stored domains and workflows.

- [x] Shell: only 收藏 / 工作區 as primary navigation; global collection reads existing snapshot sessions, no migration/reclassification on browse. Settings/version/backend diagnostics in a secondary menu. Remove masthead counters and mode rail.
- [x] Collection: recognizable source thumbnail and at most two original-text lines; local search; full-width reader with original body/image. Metrics/status behind details. Same post can keep multiple workspace memberships without losing data.
- [x] Workspaces: all existing sessions reachable, even multiple of one mode; explicit named creation by task type. Existing domain views reachable from workspace cards; switching primary tabs preserves reading/search location.
- [x] Topic: no empty Atlas banner before result; source-first rows and one action/progress owner. Existing results retained during regeneration. Bulk selection drops repeated suggestion labels and long bold paragraphs.
- [x] Source fidelity: strip known translation chrome from new snippets and clean existing snippet display without rewriting stored text.
- [x] Verify: targeted behavior tests first, independent review, full type/boundary/storage/test/build gate; real Chrome visual and navigation checks on user's Threads page, same-folder update with backup.

Ownership: root shell/app integration/source text/version/docs; collection_browser new collection view/projection/tests; navigation_map new WorkspaceHomeView/tests; topic_declutter Topic/Collect subviews/tests. No backend schema, credential changes, AI prompt/model changes, or main push/merge.

Completed 2026-09-29. Runtime coverage, added QA item, existing capture/image limitations and final gate evidence are recorded in `docs/handoff/mockup-navigation-paused.md`. No main merge/push.
