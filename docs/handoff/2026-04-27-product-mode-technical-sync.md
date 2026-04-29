# 2026-04-27 Product Mode Technical Sync

## Current State

This handoff describes the Phase B worktree:

- repo: `/Users/tung/Desktop/dlens-product-latest`
- build output: `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`
- extension name: `DLens v3`
- latest verified gate before this documentation sync: `npm run typecheck`, `npx tsx --test tests/*.test.ts tests/*.test.tsx`, `npm run build`
- latest full test count: `281 pass, 0 fail`

Topic mode is complete enough for real use: save Threads posts into Inbox, triage into Topics, inspect Casebook, compare posts, and attach results to topic context.

Product mode is no longer a fake-number stub. It now has real local storage, real product-context compilation, real product-signal analysis, cited evidence display, and optional paste-ready agent task output.

## Implemented Product Phase B Pieces

### ProductContextCompiler

Files:

- `src/compare/product-context.ts`
- `entrypoints/background.ts`
- `src/ui/SettingsView.tsx`

State:

- compiles imported README / AGENTS / product notes into structured `ProductContext`
- supports OpenAI strict JSON schema, Gemini response JSON schema, and Claude required tool call
- stores compiled context at `dlens:v1:product-context`
- migrates legacy `dlens_product_context` forward
- uses compiled context for later product signal analysis instead of sending raw README every time

### ProductSignalAnalyzer

Files:

- `src/compare/product-signal-analysis.ts`
- `src/compare/product-signal-storage.ts`
- `src/compare/provider.ts`
- `entrypoints/background.ts`
- `src/ui/ProductSignalViews.tsx`
- `src/ui/useTopicState.ts`

State:

- analyzes saved product signals using backend `ThreadReadModel` + compiled `ProductContext`
- classifies `signalType`: `learning | competitor | demand | technical | noise`
- classifies `contentType`: `content | discussion_starter | mixed`
- produces precise `signalSubtype`, relevance `1..5`, `relevantTo`, verdict, reason, evidence refs, and experiment hint
- persists results at `dlens:v1:product-signal-analyses`
- filters invalid AI refs and invalid ProductContext fields
- only includes `agentTaskSpec` for `verdict = "try"`
- keeps a background per-session in-flight guard to avoid duplicate LLM calls

### Product UI

Product mode output should be:

- useful insight first
- cited discussion evidence second
- verdict and experiment direction third
- paste-ready agent task prompt when available

Product mode output should not be:

- backend cluster dashboards
- fake numeric analytics
- folder-management UI
- generic "AI says this is useful" text without evidence

## Live Crawl Test

Test URL:

`https://www.threads.com/@kathy._.yuhsuan/post/DXeTGZbjINV`

Observed live backend output:

- capture succeeded through local backend
- crawl produced 53 captured comments
- backend read model produced 5 OP continuation candidates and 48 discussion replies
- assembled content was available for ProductSignalAnalyzer input

Product insight from this post:

- recurring crawl is a real workflow demand: "I check once" is shifting toward "agent watches this for me"
- MCP/tool calling is a product-mode amplifier, not just a nice extra
- browser automation matters because some product intelligence lives behind app screens, pricing pages, onboarding, and screenshots
- PM document output is a concrete workflow: test cases, epics, user stories, PRD fragments, roadmap notes, and release notes
- discussion replies are first-class product evidence, not just comments

Backend caveat:

- OP continuation detection is not clean enough yet
- next backend fix should remove root duplication and distinguish true content continuation from OP reply chatter

## Product Decision Notes

- Do not build RAG for V1. Use compiled `ProductContext` unless users routinely upload large, codebase-scale documents.
- Do not auto-generate large downstream plans for every signal. Generate richer agent tasks only for `verdict = "try"` or when the user asks.
- The `agentTaskSpec.taskPrompt` is a prompt the user can paste directly into Codex / Claude / a generic agent. It is not a suggestion summary.
- `signalSubtype` quality matters. Avoid vague values like `agent_workflow`; prefer specific values like `mcp_integration`, `browser_automation`, `recurring_data_crawl`, `pm_document_generation`.
- The prompt must not reintroduce `contentTypeHint`; content type is AI output over the assembled thread.

## Next Work

1. Backend P0: fix ThreadReadModel OP continuation quality.
2. Chrome QA: reload `output/chrome-mv3` and walk Settings -> Product mode -> Collect -> crawl -> product insight cards.
3. UI QA: confirm topic mode theme is fully green, Product mode does not show folder concept, and Settings mode switching works with no active folder.
4. Product UI: make `agentTaskSpec` prominent enough for `try` signals without turning every card into a long report.
5. Later: signal digest, watch mode, mobile share extension, and recurring intelligence.

## Files To Read First

1. `README.md`
2. `AGENTS.md`
3. `docs/memory/current-state.md`
4. `docs/handoff/2026-04-27-phase-b-plan.md`
5. `docs/handoff/2026-04-27-product-mode-technical-sync.md`
