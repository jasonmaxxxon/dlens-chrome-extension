# DLens Product Mode Schema-First Handoff

_Written 2026-04-27 after Product Phase B P0/P1 extension implementation._

## Product Reality

DLens is currently a desktop-first Threads research and product-signal triage extension.

- Topic mode is the most complete workflow: saved posts become signals, signals can be triaged into topics, and compare/judgment surfaces are connected to real storage.
- Product mode now has real AI plumbing and real storage. It is not just a three-page placeholder anymore.
- Mobile share extension / PWA entry remains a future entry point, not current product behavior.

## What Was Implemented

### Product context ingestion

Settings now supports richer product context:

- product profile fields
- imported README / AGENTS / AI-agent files
- local caps: 30k chars per file, 60k chars total
- save flow persists the profile, then compiles a `ProductContext`

The compiled context is stored at:

```text
chrome.storage.local["dlens_product_context"]
```

Relevant files:

- `src/compare/product-context.ts`
- `src/ui/SettingsView.tsx`
- `src/ui/settings-save-messages.ts`
- `src/ui/useInPageCollectorAppState.ts`
- `entrypoints/background.ts`

### ProductContextCompiler

`ProductContextCompiler` is schema-first:

- OpenAI: strict `json_schema`
- Gemini: `responseJsonSchema`
- Claude: required tool call with `input_schema`

The compiled object contains:

- `productPromise`
- `targetAudience`
- `agentRoles`
- `coreWorkflows`
- `currentCapabilities`
- `explicitConstraints`
- `nonGoals`
- `preferredTechDirection`
- `evaluationCriteria`
- `unknowns`
- metadata: `compiledAt`, `sourceFileIds`, `promptVersion`

Settings now shows a `系統理解` preview so the user can inspect ProductContext before trusting Product mode judgments.

### ProductSignalAnalyzer

`ProductSignalAnalyzer` is also schema-first:

- schema: `PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA`
- provider body helper: `buildProductSignalAnalysisBody`
- parser/normalizer: `parseProductSignalAnalysisResponse`
- storage helpers: `src/compare/product-signal-storage.ts`
- background message wiring: `product/analyze-signal`, `product/list-analyses`, `product/get-context`

It produces:

- `signalType`: `learning | competitor | demand | technical | noise`
- `signalSubtype`
- `contentType`: `content | discussion_starter | mixed`
- `contentSummary`
- `relevance`: `1..5`
- `relevantTo`: ProductContext field names
- `whyRelevant`
- `verdict`: `try | watch | park | insufficient_data`
- `reason`
- `experimentHint`
- `evidenceRefs`
- metadata and status fields

Product pages now read stored analysis state:

- Classification
- Worth trying
- Improvement suggestions

They show real readiness, error, and empty states. They do not render fake scores or fabricated analytics.

## Important Design Decisions

- No RAG in V1. ProductContext is the compressed reusable context.
- Do not feed raw README/AGENTS into every product signal call.
- Backend owns crawl and canonical thread structure.
- Extension owns user API keys, ProductContext storage, ProductSignalAnalysis storage, and display.
- OP continuation detection belongs to backend deterministic read-model construction, not frontend rule UI.
- `contentType` should be model output, not a hard rule from length/question marks.
- Schema-first contracts are preferred over prompt-only JSON instructions for product-core AI.

## Current Backend Dependency

The ProductSignalAnalyzer expects best results from backend `ThreadReadModel`:

```text
rootPost + opContinuations -> assembledContent
non-OP replies -> discussionReplies
```

Current extension code can fall back to older capture shapes, but mature Product mode requires backend support for:

- OP continuation split
- discussion reply split
- assembled content
- stable reply IDs for evidence refs

## Verified Commands

Run in:

```bash
cd /Users/tung/Desktop/dlens-product-latest
```

Verified:

```bash
npm run typecheck
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
curl -s http://127.0.0.1:8000/worker/status
```

Latest result:

- `275 pass, 0 fail`
- build succeeded
- unpacked extension mirrored to `output/chrome-mv3`
- backend smoke returned `{"status":"idle"}`

## Next Engineering Steps

1. Backend Thread read model
   - add deterministic OP continuation detection
   - emit `assembledContent`
   - emit `discussionReplies`
   - keep crawler mechanical and dumb

2. Product analyzer evals
   - build golden fixtures for `learning / competitor / demand / technical / noise`
   - test false positive marketing/noise cases
   - test OP continuation content cases from Threads

3. Product mode UX hardening
   - show manual re-analyze affordance per signal
   - expose ProductContext hash/version in a compact debug line
   - keep all empty/error states honest

4. Mobile entry later
   - iOS Share Extension or PWA inbox can post URL into the same backend queue
   - do not fork product semantics for mobile
