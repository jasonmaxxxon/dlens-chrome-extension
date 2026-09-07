# AGENTS.md — DLens Product Contracts

本檔是所有 agent 共用的**產品模式與證據契約 owner**。流程、完整 gate、五處版本鎖、工作邊界與 Jason Default 真實 Chrome 驗收都由根 [CLAUDE.md](CLAUDE.md) 維護，先讀該檔；不在此維護第二份流程規則。

## What this repo is

Mode-aware MV3 Chrome extension：收集 Threads，整理本機資料，執行 Topic／Product／PR Evidence 流程。本機 storage 擁有使用者狀態與 LLM keys；選用私人 backend `../dlens-ingest-core`（預設 `http://127.0.0.1:8000`）擁有 crawl jobs 與 canonical clustering read models。Extension 不直接連 Supabase，不把使用者 LLM keys 傳給 backend。

[README](README.md) 提供版本與使用者入口；[架構地圖](docs/architecture/dlens-current-architecture-map.md) 對應 owner/test；[固定 shared context](docs/memory/latest-shared-context.md) 記錄接手進度。2026H1 契約歷史保留在 [archive](docs/archive/agents-history-2026H1.md)，本次整理前全文在[有日期的快照](docs/archive/2026-09-07-authority-consolidation/AGENTS.md)。

已批准需求與現行 code/tests 不一致時，標明實作落差或文件過期；不要把既有 bug 當成推翻契約的理由。更新本檔只為契約改變，不追加 release 日記。

## Boundary contract

完整處理規則見 [CLAUDE.md Boundaries](CLAUDE.md#boundaries)；以下保留接縫明文以供跨 repo 文件及 guard 查核：

- Views: no `sendExtensionMessage`, no `chrome.*`, no storage, no `Date.now` / `Math.random` / `performance.now`.
- ViewModels: no `chrome.*` / `fetch` / DOM / `File` / `Blob` / `FormData` / React.
- Needed side effects belong to controller / hook / app shell. Never add `TODO(boundary-bypass)`.
- `npm run boundary:guard` enforces both walls with zero allowlisted violations.

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
  Product rail contract:
  `getModeRailPages("product") === ["saved-signals", "actionable-filter",
  "collect"]` (guarded by `tests/product-routing.test.ts`).
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
