# AGENTS.md — DLens Chrome Extension

> **Restructured 2026-07-03.** The 874-line handoff diary this file used to be
> is archived verbatim at `docs/archive/agents-history-2026H1.md` — grep it for
> history ("Recently Fixed", DictionaryCard contract details, slice notes);
> do not read it whole. This file holds only current, load-bearing rules.
> **Operative rule file: `CLAUDE.md` at the repo root** (reading order, verify
> gate, version lock, design contract, boundaries). Read it first; on conflict,
> `CLAUDE.md` wins over this file, and code/tests win over both.

## What this repo is

Mode-aware MV3 Chrome extension: capture Threads posts, organize locally, and
run topic / product-signal / PR-evidence workflows. Extension-first: local
storage owns state and user API keys; the optional private ingest backend
(sibling `../dlens-ingest-core`, default `http://127.0.0.1:8000`) owns crawl
jobs and canonical clustering read models. The extension never talks to
Supabase directly and never sends user LLM keys to the backend.

## Reading order

1. `CLAUDE.md`, then the `README.md` header block (version + latest truth).
2. Architecture work → `docs/architecture/dlens-current-architecture-map.md`
   (status colors: 🟩 locked / 🟢 built / 🟡 partial / 🔴 not built — never
   treat 🟢 as 🟩).
3. History → `docs/archive/agents-history-2026H1.md` (grep only).

## Process rules (locked 2026-04-17; violations block merge)

1. **One-in-one-out** — every PR adding content, UI surface, copy, or
   dependency removes comparable weight; name both sides in the commit message.
2. **Four commit prefixes only**: `bug fix` / `feature` / `removal` /
   `refactor`. The words "pass", "polish", "round", "tune" are banned from
   commit messages and doc headings.
3. **Design contract**: `src/ui/tokens.ts` is the sole source of design
   VALUES; `src/ui/tokens-intent.md` is the sole intent doc, value-free by
   guard (`tests/tokens-intent-guard.test.ts`; amended 2026-07-03 from the
   total markdown ban). No other design markdown. Mockups in `docs/mockups/`
   are reference, not spec.
4. **`src/ui/InPageCollectorApp.tsx` hard cap: 400 lines.**
5. **One UI slot per contract field** — grep the field name across `src/ui/`
   before adding a surface; no field renders twice on one page.

## Boundaries (CI-enforced by `npm run boundary:guard`, zero violations)

- Views: no `sendExtensionMessage`, no `chrome.*`, no storage, no
  `Date.now` / `Math.random` / `performance.now`.
- ViewModels: no `chrome.*` / `fetch` / DOM / `File` / `Blob` / `FormData` /
  React.
- A needed side effect moves to a controller / hook / app shell. Never add
  `TODO(boundary-bypass)`.

## Version lock (locked 2026-05-14)

User-visible `main` updates bump all FIVE together: `package.json`,
`package-lock.json`, `wxt.config.ts` `manifest.version`,
`src/ui/version.ts` `BUILD_VERSION`, and the expected version string in
`tests/manifest-config.test.ts` (the enforcing test is itself a lock site).

## Verify gate (run ALL before calling any change done)

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build          # mirrors unpacked build to output/chrome-mv3
git diff --check
```

- `tsx` is fetched by `npx` (not a devDependency); an npx prompt/offline
  failure is an environment issue, not a red suite.
- A "done" report from any agent (including your own earlier turn) is an
  unverified claim — rerun the gate before merge/push.
- Runtime QA only counts on: rebuilt `output/chrome-mv3` + Jason's Chrome
  `Default` profile + opening DLens via the real extension action or in-page
  launcher on a real Threads page. A direct
  `chrome-extension://…/sidepanel.html` tab or temp profile is NOT proof.
- If runtime contradicts source, suspect a stale bundle first: check the built
  manifest version and grep the bundle for expected `data-*` markers.

## PR expectations (Codex and any implementing agent)

- Run the full verify gate BEFORE opening the PR; paste results into the PR
  description. A separate reviewer re-runs the gate — descriptions are never
  accepted as proof.
- Merging/pushing to `main` always requires the user's approval first.
- Stay inside the agreed slice; scope creep is a rejection reason on its own.

## Mode contracts (current; history and rationale in the archive)

- **Shared workspace shell**: Topic, Product, and PR Evidence use
  `tokens.material.workspaceGlass` across the popup canvas, masthead, rail,
  and main frame; Archive keeps the non-blurred material variant. The visual
  hierarchy is one translucent white-green shell, restrained teal / amber /
  violet auras, mode-specific gradient fields, and contrast-safe near-white
  reading cards. Translucency belongs to the shell and selected hero/attention
  surfaces; do not stack blur on ordinary rows. Fine edges, inset highlights,
  and layered shadows provide card depth. Warm ink, serif voice, and mode
  accents carry the editorial identity.
- **Attention lighting**: Light Beam is semantic, not ambient decoration. It
  marks generation or a high-value actionable reading. One whole surface owns
  one perimeter beam; never put separate beams on its title, button, or nested
  panel, and never run a sweep underneath text. Product-reading generation uses
  the 16px searching orb plus the moving perimeter; ready state is static and
  quieter. Every animated state must freeze cleanly under
  `prefers-reduced-motion`, and every beam/card must remain inside its parent
  border box at narrow widths. Implement through `AttentionSurface` and the
  token/motion registry, not ad-hoc gradients or keyframes.
- **Topic Audit** keeps one stable Atlas canvas through
  `none / running / ready / stale / failed`, preserves the last Atlas during
  regeneration, and must not present memo-derived `Pn/6` as live progress.
  On popup reopen, `topic/audit/get` may reconcile evidence only after the
  complete Topic/session inventory hydrates; it must not run Atlas generation
  or replace published memos/reports/episodes, and a running audit wins the
  shared mutation queue. A failed-only source remains retryable crawl work. As
  of 0.3.50 the topic page renders ONE source list (atlas
  `SourceRow` grammar with gist titles + manifest actions; uncrawled signals
  are `PendingSignalRow` entries in the same card) — do not reintroduce a
  second 源清單-style manifest section. The P6 final-report prose is
  budget-fixed (~1500 chars, independent of source count); audit stage output
  ceilings live in `entrypoints/background.ts` (final 6000 / audience 3200 /
  others 2200). Google topic-audit envelope requests are schema-free
  (0.3.51): `responseJsonSchema` sends gemini-3.1-flash-lite into runaway
  constrained decoding (MAX_TOKENS at any ceiling) — never re-add it there;
  shape is guarded by `parseAuditPromptEnvelopeResult` + one repair retry
  (locked in `tests/provider-runtime.test.ts`). P3 v4 may publish optional evidence-bound displayHints.narrativeLanes[].beats
  (setup/tension/outcome, ≤48 chars each) plus trajectory new/carried. Legacy lanes
  remain valid; the UI never derives missing beats from prose. The P3 narrative
  icon producer whitelist is exactly `heart | users | message-circle`; the parser
  drops other model values, while legacy stored/unknown strings safely render with
  the `message-circle` fallback (including inherited object-key names).
- **Product** mode is insight / evidence / task-first. ProductSignalAnalyzer
  v21 returns judgment axes plus one optional `product_reading`; `try` and
  `watch` require a complete reading, while noise / park /
  `insufficient_data` remain compact and unlit. The first opened actionable
  card must show that persisted reading immediately. Do not restore the legacy
  proposal rows, a second Product reading provider call, or a duplicated
  “expand deep reading” surface.
- **Product Reading provenance**: analysis and its projected SignalReading are
  published atomically. Current UI/export projection requires matching signal,
  ProductContext, analyzer prompt, source-packet, content, refs, and timestamp
  identity; stale/manual/legacy readings are history, not the current card.
  Support refs must resolve to captured root/reply text and `text_grounded`
  evidence notes. Never claim that a video, animation, repository, or linked
  page was inspected when only the Threads text was captured.
- **Product Action UI**: the four mutually exclusive navigation buckets are
  `try / noise / insufficient / watch`; non-noise `park` belongs under watch.
  An actionable stage renders exactly one complete-reading card and one
  copyable Agent brief. The whole-folder packet export remains Action-owned;
  Saved Signals is lifecycle intake only. Do not reintroduce a review-action
  group or selected-brief shelf that the current Product UI does not render.
  Backend clusters are support data, never the user-facing abstraction.
  Product rail contract (0.4.1 signal-filter merge):
  `getModeRailPages("product") === ["signals", "collect"]` (guarded by
  `tests/product-routing.test.ts`). The former `saved-signals` /
  `classification` / `actionable-filter` routes — and the never-reachable
  `inbox` / `casebook` entries — are gone; intake, category and action are
  filters inside the one `signals` page (`data-signals-filter`). A persisted
  tab naming a retired route resolves to the mode home instead of throwing
  (`resolveEffectivePopupPage`); do not reintroduce a second product route.
- **PR Evidence** V1: one active campaign per session; criteria fixed at
  `c1..c6` (labels editable, count not); Collect never runs AI; match output
  is `✓ / blank` only; CSV (UTF-8 BOM) is the primary output. Non-goals: no
  social listening, no true reach, no EAV, no XLSX, no in-app spreadsheet.
- **PR Narrative read** (0.3.47): Stage A per-chunk post readings + Stage B
  synthesis. Prose validation is two-tier — hard corpus-delta/aggregate
  language rejects; bare change verbs and bare recency words soft-flag and
  get exactly ONE semantic repair/adjudication call per stage call (rewrite
  if it asserts over-time or cross-post change, keep if it only reports the
  single post's own content). Validation failures must name ref, author,
  URL, sentence, and matched fragment. Stage calls, chunk labels, repair
  attempts, and HTTP attempts land in the QA trace (`pr-narrative.*` steps,
  `direct-llm.<provider>.pr-narrative.*` labels). Do not add retry loops
  beyond the single repair pass.
- **Signal Packet** export is `v3`; keep new JSONL fields additive.
- Every animation sits behind a `prefers-reduced-motion` guard.

## What is intentionally NOT in this repo

Direct Supabase access; account/auth flows; full analyst workspace;
multi-source inbox (Dcard/IG/PTT/YouTube); Weekly Intelligence Brief; topic
auto-suggestion — all Phase 2 or later. Do not start them from a handoff note.
