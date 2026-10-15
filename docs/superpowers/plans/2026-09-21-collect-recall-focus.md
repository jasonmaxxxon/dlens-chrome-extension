# Collect and recall focus implementation plan

User approved 2026-09-21: keep one Product signals page; put a small thumbnail on the left; prioritize original post, author, engagement and crawl state; collapse AI prose until explicitly opened. User authorizes computer-use collection testing and backend repair.

Goal: capture accurate visible Threads metrics, immediately show saved posts and images, and restore the existing crawl pipeline without expanding AI suggestions.
Base: claude/v4-beta b9a358e (0.4.1). Isolated checkout; preserve the active unpacked folder and ID, all saved data, unrelated checkouts and concurrent branches. No main push/merge without authorization. No secrets in reports.

- [x] Capture: characterize current title/title-child icons and role-button controls, scoped count and nested-post boundaries; implement minimal extraction repair; preserve unknown versus zero and legacy DOM compatibility. Files: src/targeting/threads.ts, tests/targeting*.test.ts.
- [x] Collection UI: render existing stored image URL as a small leading thumbnail; show original text/author/metrics and lifecycle immediately in Product intake and Library; graceful missing/broken image fallback; keep AI reading behind explicit disclosure. Files: LibraryView.parts.tsx, ProductSignalViews.tsx, shared thumbnail component, corresponding projection/tests/tokens as needed. Remove redundant guidance/status prose instead of adding banners.
- [x] Backend: diagnose configured DB/worker/auth truth without leaking secrets; restore only evidence-supported existing configuration/service; validate health plus worker status before enqueuing real test posts. Do not invent credentials or drain an unhealthy queue.
- [x] Integration: synchronize five version sites to 0.4.2, update README/shared context; run typecheck, boundaries, storage seam guard, full TS suite, build, diff check.
- [ ] Real acceptance: backup current loaded bundle; replace contents at same folder; reload extension and Threads; save public text/image posts using real Chrome UI; compare original -> preview -> saved metrics/images; run bounded crawl, inspect results and reopening. Record exact evidence and any external blockers. Leave no mock results or false completion claims.

Status: code/build installed in the same folder; live backend crawl passed. Real Chrome UI acceptance remains blocked by Computer Use connection failures; no claim that extension saving was tested.
