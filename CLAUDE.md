# DLens Extension — Project Rules

<!-- Created 2026-07-03 (Fable 5 institution session). Loaded every session in this repo. -->
<!-- 中文註解：這是 dlens 的專案守則。驗收指令、UI 品質底線、文件讀法都在這裡。 -->

Mode-aware MV3 Chrome extension (Threads capture → topic/product/PR-evidence
workflows). Extension-first: local storage owns state; optional private backend
(`../dlens-ingest-core`, port 8000) owns crawl jobs and canonical read models.

## Reading order (do NOT read everything)

1. This file, then `README.md` header block (version + latest contract truth).
2. Architecture work → `docs/architecture/dlens-current-architecture-map.md`.
3. **AGENTS.md is huge (800+ lines) — never Read it whole.** `grep -n "<topic>" AGENTS.md`
   and read only the matching section. Locked rules live under
   "Process Rules (locked 2026-04-17)"; "Recently Fixed" entries are history.
4. Truth hierarchy when docs disagree: code/git/built manifest > README header >
   architecture map > AGENTS.md locked rules > everything in `docs/handoff/`,
   `docs/product/`, MemPalace vault. Report conflicts; don't silently edit old docs.

## Verify gate — run ALL of this before calling any change done

```bash
npm run typecheck
npm run boundary:guard        # View/ViewModel wall, zero violations
npm run storage:seam-guard    # zero allowlisted bypasses
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build                 # mirrors unpacked build to output/chrome-mv3
git diff --check
```

- `tsx` is fetched by `npx` (it is not a devDependency). If `npx` prompts or
  fails offline, that is an environment issue, not a test failure — report it
  as such; do not call the tests red.
- A "done" report from Codex, a subagent, or your own earlier turn is an
  unverified claim. Rerun the gate before merge/push.
- Runtime QA only counts on: rebuilt `output/chrome-mv3` + Jason's Chrome
  `Default` profile + opening DLens via the real extension action or in-page
  launcher on a real Threads page. A direct `chrome-extension://…/sidepanel.html`
  tab or a temp profile is NOT proof.
- If runtime behavior contradicts source, suspect a stale bundle before
  changing code: check `output/chrome-mv3/manifest.json` version and grep the
  bundle for the expected `data-*` markers.

## Version lock (user-visible changes to main)

Bump all four together — `package.json`, `package-lock.json`,
`wxt.config.ts` `manifest.version`, `src/ui/version.ts` `BUILD_VERSION`.
`tests/manifest-config.test.ts` enforces consistency.

## Design & UI contract

- `src/ui/tokens.ts` is the ONLY design spec (warm-paper editorial + macOS
  utility shell). Never write a markdown design spec; never add a second
  palette/font scale. Mockups in `docs/mockups/` are reference, not spec.
- **One-in-one-out:** a PR adding UI surface/copy/dependency must remove
  comparable weight; note both sides in the commit message.
- Commit prefixes: exactly one of `bug fix` / `feature` / `removal` /
  `refactor`. "pass/polish/round/tune" are banned words.
- `src/ui/InPageCollectorApp.tsx` hard cap: 400 lines.
- No contract field renders twice on one page (grep the field name across
  `src/ui/` before adding a surface).
- **Substance over decoration:** every clickable element must reveal real
  derived data. Example (good): a tag chip that filters signals to the rows
  that produced it. Example (bad): a "insight" badge that expands to restate
  the row's own title. If a surface can't show real data yet, don't ship the
  affordance disabled-but-pretty — leave it out.
- All motion keeps a `prefers-reduced-motion` guard.
- **Visual-direction changes start as mockups, not code.** For anything that
  changes the look (vs. a mechanical fix), build 1–3 dated HTML variants in
  `docs/mockups/`, let the user pick, then implement the winner against
  `tokens.ts` (new values go into `tokens.ts` in the same PR — the mockup
  stays reference-only).
- **When unsure what "fits", imitate the newest shipped marquee surface**
  (Topic detail, Compare hero, PR Evidence ledger) instead of inventing.
  Recurring rejected patterns in this repo's history: dashboard KPI cards,
  hero/stat blocks, decorative badges, English placeholder copy in
  Chinese-first surfaces. When in doubt, denser and quieter wins.

## Boundaries (CI-enforced, don't fight them)

Views: no messaging, storage, `Date.now`/`Math.random`, or chrome APIs.
ViewModels: no chrome/fetch/DOM/File/React. Needed side effect → controller/
hook/app shell. Never add `TODO(boundary-bypass)`.

## Delegation

Codex lane (implement in superpowers worktree → PR → verify gate → squash-merge
→ desktop ff-pull + build + reload) and subagent rules:
`~/.claude/protocols/model-dispatch.md`.
