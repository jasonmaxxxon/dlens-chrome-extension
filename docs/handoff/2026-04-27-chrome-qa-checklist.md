# Chrome QA Checklist — Phase B P0

_For Codex execution. All paths must be walked in a real loaded Chrome extension._

## Pre-flight

```bash
cd /Users/tung/Desktop/dlens-product-latest
npm run build
```

Load `output/chrome-mv3` as unpacked extension in `chrome://extensions`.  
Open extension popup. Confirm title shows **DLens v3**.

---

## Path 1 — Settings: Product profile + context import

**Goal:** confirm ProductContext can be compiled and previewed.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Settings | Settings page loads, no crash |
| 2 | Switch to **Product mode** tab in Settings | Product profile fields appear: name, category, audience, productPromise |
| 3 | Fill in all 4 fields | No error |
| 4 | Paste text into the context textarea (any short product description) | char counter updates, stays under 60000 |
| 5 | Click **儲存** | Settings saved, no error toast |
| 6 | Reopen Settings | Fields retain values (not wiped) |
| 7 | Reopen Settings → scroll to 系統理解 section | Shows compiled ProductContext fields: `productPromise`, `targetAudience`, `coreWorkflows`, etc. NOT "尚未編譯" |
| 8 | Confirm `ProductProfile` stamp = green in Product signal pages | At least one of the product signal pages shows green Stamp for ProductProfile |

**Failure modes to watch:**
- 系統理解 still shows "尚未編譯" after save → `product/compile-context` handler not firing or storage key mismatch
- Fields wipe on reopen → `normalizeProductProfileDraft` not preserving fields

---

## Path 2 — Mode switching

**Goal:** Topic ↔ Product switch works cleanly with no UI bleed.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Extension opens in Topic mode | Left rail shows Topic nav icons; no product pages visible |
| 2 | Go to Settings → switch session mode to **Product** | Mode changes |
| 3 | Close popup, reopen | Extension opens in Product mode (mode persisted) |
| 4 | Confirm rail shows Product nav: Collect / Classification / Actionable Filter | Topic-specific icons (Casebook, Compare, Library) not visible |
| 5 | Switch back to Topic in Settings | Topic nav restored |
| 6 | Switch to Product without an active folder | No crash; Product nav loads |

**Failure modes to watch:**
- Rail shows wrong icons after switch
- Crash on mode switch with no active folder
- Settings page has wrong ALLOWED_PAGES for the mode (should be `["collect","classification","actionable-filter"]` for product)

---

## Path 3 — Collect in Product mode

**Goal:** a Threads post saved in Product mode lands in Product signal inbox.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to any Threads post URL in Chrome | Page loads |
| 2 | Open extension (Product mode) → Collect tab | Save button visible |
| 3 | Save the post | Success state; signal appears |
| 4 | Open Classification or Actionable Filter page | The saved signal appears in the list |
| 5 | Signal card shows: title/URL, no analysis yet | `分析中` or "尚未分析" state — NOT an error |

**Failure modes to watch:**
- Save silently fails → signal never appears
- Signal appears in Topic Inbox instead of Product view

---

## Path 4 — Product signal analysis

**Goal:** analyzing a saved signal produces real output cards.

Pre-condition: API key configured in Settings, ProductContext compiled (Path 1 done), at least one signal saved (Path 3 done).

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Classification page | Signal list visible; `ProductContext` stamp shows green |
| 2 | Click **分析** on a signal | Loading state shown; no crash |
| 3 | Wait for analysis to complete | Signal card updates with: `signalType`, `signalSubtype`, relevance `1-5`, `verdict` badge |
| 4 | Expand card | `whyRelevant` text shown; `evidenceRefs` block shows cited reply IDs or "(no evidence)" |
| 5 | Open Actionable Filter page | Same signal appears with `verdict` grouping (try / watch / park / insufficient_data) |
| 6 | If verdict = `try`: | `agentTaskSpec` block visible with paste-ready task prompt |
| 7 | If verdict ≠ `try`: | No `agentTaskSpec` block shown |
| 8 | Open Improvement Suggestions page | Signal appears; `experimentHint` visible if present |

**Failure modes to watch:**
- Analysis call fires twice (in-flight guard should block)
- `agentTaskSpec` appears for non-`try` verdicts
- Evidence refs show IDs that weren't in the thread (invalid ref filtering should strip these)

---

## Path 5 — Error + empty states

**Goal:** all degraded states show honest copy, not blank screens.

| Scenario | Expected copy / behavior |
|----------|--------------------------|
| No signals saved (Product mode) | "Product mode 收件匣沒有 signal。先在 Collect 儲存一篇 Threads post。" |
| ProductProfile incomplete (missing name/category/audience) | Warning stamp + "先完成 Settings → Product profile" message |
| ProductContext not compiled (contextText + contextFiles empty) | "先到 Settings 匯入 README / AGENTS / 產品文件，讓 ProductContext 可編譯。" |
| No API key | `aiProviderReady = false` → analyze button disabled; no crash |
| Analysis returns error from provider | Error state on signal card; retry affordance visible |
| Analysis already in-flight | Clicking analyze again does NOT fire second LLM call |

---

## Pass criteria

All 5 paths complete with no crashes, no blank screens, and no fake/hardcoded data visible in analysis results.

Record any failures as issues in the handoff doc with:
- Path number and step
- Actual vs. expected behavior
- Relevant file + line if identifiable

## Files most likely to need fixes

- `src/ui/SettingsView.tsx` — product profile save / context compile flow
- `src/ui/ProductSignalViews.tsx` — readiness guard logic, card rendering
- `src/ui/useTopicState.ts` — mode switch, product inbox state
- `entrypoints/background.ts` — `product/analyze-signals`, `product/get-context` handlers
- `src/compare/product-context.ts` — `isProductContextSourceReady` guard

---

## QA findings — 2026-04-27 HKT

### Path 1 — Settings: Product profile + context import

- **Step 2 / expected ProductProfile fields**
  - Expected: product profile fields include `name`, `category`, `audience`, `productPromise`.
  - Actual: Chrome UI exposes `產品名稱`, `類別`, `目標受眾`; no editable `productPromise` field. `productPromise` appears only in compiled ProductContext preview.
  - Impact: checklist expectation is ahead of the current UI contract or the UI is missing one ProductProfile field.

- **Step 4 / context textarea editability**
  - Expected: paste text into context textarea and char counter updates.
  - Actual: context area is populated by file import and appears read-only in the current UI; README import works, but arbitrary paste into the product document area is not available from the visible control state.
  - Impact: manual product-context entry path cannot be verified as written.

- **Step 5 / Save after API keys**
  - Expected: Save either compiles ProductContext and shows the compiled preview, or shows a visible provider/config error.
  - Actual before fix: `settings/set-product-profile` saved settings, launched ProductContext compile fire-and-forget, and returned immediately. The UI could fetch `product/get-context` before compile completed and stay at `系統理解尚未編譯`; provider errors were only logged to console.
  - Root cause: ProductContext compilation was not part of the observable Settings save response.
  - Fix applied: `settings/set-product-profile` now awaits `compileProductContextIfReady()` and returns `productContext` plus `productContextError`; Settings displays an explicit saving/success/error status and updates the ProductContext preview from the save response.
  - Relevant files: `entrypoints/background.ts`, `src/state/messages.ts`, `src/ui/useInPageCollectorAppState.ts`, `src/ui/SettingsView.tsx`, `src/ui/InPageCollectorPopup.tsx`, `tests/views.test.tsx`.
  - Chrome follow-up before user approval: after rebuilding/reloading `output/chrome-mv3`, Product Settings loaded with the existing masked Google key and compiled ProductContext preview visible. A later approved follow-up re-clicked `Save settings`; see the section below.

### Path 3 — Collect in Product mode

- **Step 3 / save post into product signal inbox**
  - Expected: saving the Threads post in Product mode shows success state and the signal appears in Product pages.
  - Actual before rebuild/reload: clicking the product save action invalidated the extension context and rendered the crash fallback: `DLens hit a render error. Extension context invalidated. Open the page console or reload the tab.` No signal appeared afterward.
  - Impact: Product analysis paths cannot be completed until product save is verified stable after extension reload.

### Path 4 — Product signal analysis

- **Precondition blocked**
  - Expected: at least one saved product signal and compiled ProductContext.
  - Actual: ProductContext now appears compiled, but there are still `0 signals / 0 analyses` after the failed save attempt.
  - Impact: signal analysis cards, `agentTaskSpec`, and evidence rendering remain unverified in Chrome for this run.

### Side-panel observation

- Opening Chrome's extension action shows the legacy side panel body `DLens v0.1 Debug Panel` even though the Chrome extension title is `DLens v3`.
- Impact: Chrome QA must not treat the side panel as the Product mode workspace. The current Product mode workspace is the content-script overlay on Threads.

### Local verification after fix

- `npm run typecheck` passed.
- `npx tsx --test tests/product-context.test.ts tests/settings-save-messages.test.ts tests/views.test.tsx` passed.
- `npx tsx --test tests/*.test.ts tests/*.test.tsx` passed with `284/284` tests.
- `npm run build` passed and mirrored the unpacked extension to `output/chrome-mv3`.

### Chrome follow-up after rebuild/reload — 2026-04-27 HKT

- **Pre-flight**
  - Ran `npm run build` again in `/Users/tung/Desktop/dlens-product-latest`; build passed and mirrored to `output/chrome-mv3`.
  - Reloaded the unpacked Chrome extension from `chrome://extensions`.
  - Confirmed Chrome extension title is `DLens v3`; extension id observed as `hihgplinfhopjpjonkcdbbmkoklombkj`.
  - Backend `/worker/status` at `http://127.0.0.1:8000` returned `{"status":"idle"}`.

- **Path 1 / Settings follow-up**
  - Actual: Settings reopened in Product mode with existing masked Google key, ProductProfile values, and compiled ProductContext preview visible.
  - Actual: product document import UI now shows compact loaded-file cards such as `README.md 已載入 ... Loaded`; it no longer exposes the large imported README text area in the normal state.
  - Result: this matches the preferred UX for imported product documents, but the checklist's original "paste text into textarea" expectation is now outdated.
  - Remaining issue: Product mode option copy still says `啟用 Topic 流程並加上 Judgment`, which is stale for the current ProductSignalAnalyzer flow.
  - Relevant file: `src/ui/SettingsView.tsx:199` to `src/ui/SettingsView.tsx:201`.

- **Path 2 / Mode switching partial**
  - Actual: Current persisted Product mode shows the Product rail: Collect / Classification / Actionable Filter / Improvement Suggestions plus Settings.
  - Actual: Topic-specific Library / Casebook / Inbox / Compare pages are not visible in the Product rail.
  - Result: Product ALLOWED_PAGES routing appears correct in Chrome for the currently active Product session.
  - Follow-up: Chrome was found in Topic mode while the active session/folder label still read `Product workspace`. Selecting Product and clicking `Save settings` restored the Product rail.
  - Failure/UX issue: mode switch state can be visually confusing because the folder/session name may still say `Product workspace` while the session mode radio and rail are Topic.
  - Relevant file: `src/ui/InPageCollectorPopup.tsx:20` to `src/ui/InPageCollectorPopup.tsx:23`.

- **Path 3 / Collect in Product mode follow-up**
  - Actual: Product workspace showed `2 signals / 0 analyses` after reload.
  - Actual: Collect page rendered a real Threads preview and the save action showed `已加入產品訊號`, meaning the current page/item was already represented as a Product signal.
  - Failure: opening Classification / Actionable Filter did not show a saved signal card with title/URL/no-analysis state. The product signal pages only showed aggregate readiness plus an empty analysis state.
  - Impact: saved Product signals exist, but users cannot inspect the pre-analysis signal list from the Product pages.
  - Relevant file: `src/ui/ProductSignalViews.tsx:361` to `src/ui/ProductSignalViews.tsx:403`.

- **Path 4 / Product signal analysis follow-up**
  - Failure: Classification page showed `2 signals`, `0 analyses`, `AI key`, `ProductProfile`, and `ProductContext`, then said `已準備分析。按下分析收件匣後...`.
  - Failure: processing strip showed `0 / 2 ready`, but `分析收件匣` was still enabled.
  - Failure: clicking `分析收件匣` produced no visible loading state, no visible error, and no new analysis card.
  - Root cause from source check: `ReadinessPanel.canAnalyze` only checks signals/API/profile/context; it does not check whether backing items are crawl/analysis ready.
  - Background behavior: `product/analyze-signals` skips signals whose saved item is not ready or lacks assembled capture content, then returns the existing analysis list. With not-ready signals this can look like a silent no-op.
  - Product workflow gap: Product mode hides Library/process controls, so there is no clear Product-mode UI action to queue/process the saved signals from `0 / 2 ready` to ready.
  - Impact: `signalType`, `verdict`, `agentTaskSpec`, `experimentHint`, and evidence drill-down cards remain unverified in Chrome for this run.
  - Relevant files:
    - `src/ui/ProductSignalViews.tsx:231` to `src/ui/ProductSignalViews.tsx:265`
    - `entrypoints/background.ts:400` to `entrypoints/background.ts:448`
    - `src/ui/InPageCollectorFolderControls.tsx:9` to `src/ui/InPageCollectorFolderControls.tsx:62`
    - `src/ui/InPageCollectorPopup.tsx:123` to `src/ui/InPageCollectorPopup.tsx:146`

- **Path 5 / Error + empty states follow-up**
  - Actual: empty analysis state is honest that it only shows real storage data and will not render fake classifications or fake numbers.
  - Failure: the readiness copy is misleading when signals are not crawl-ready. It says `已準備分析` even while the processing strip says `0 / 2 ready`.
  - Failure: the secondary `重新整理分析` action in the empty-state card is enabled based only on `isAnalyzing`, so it can also trigger the same silent no-op path.
  - Relevant file: `src/ui/ProductSignalViews.tsx:64` to `src/ui/ProductSignalViews.tsx:88`, and `src/ui/ProductSignalViews.tsx:397` to `src/ui/ProductSignalViews.tsx:400`.

### Recommended fix order from QA

1. **Fix Product readiness guard first.** Product signal pages must distinguish `saved signal exists` from `ready for ProductSignalAnalyzer`. The analyze button should be disabled or should trigger the processing path when backing captures are not ready.
2. **Expose a Product-mode process path.** Either add a compact `處理訊號` action in the Product workspace strip, or make `分析收件匣` queue/process not-ready signals before analysis.
3. **Render pre-analysis signal rows.** Classification / Actionable pages should show saved signals with title/source and `尚未分析` / `等待處理` state, not only aggregate counts.
4. **Fix stale Product mode copy.** Replace `啟用 Topic 流程並加上 Judgment` with ProductSignalAnalyzer-oriented wording.
5. **Then rerun Path 4.** Only after signals can reach ready state from Product mode should Chrome QA verify real `agentTaskSpec`, `experimentHint`, and cited reply drill-down cards.

### Approved Settings save / Gemini compile follow-up — 2026-04-27 HKT

- **Path 1 / Step 5**
  - Action: with Product mode selected and Google provider/key present, clicked `Save settings` in Chrome.
  - Actual: Settings displayed `Settings 已儲存，ProductContext 已編譯。`
  - Actual: ProductContext preview refreshed in-place; `Workflows` and `Constraints` text changed after the save, confirming the compile result was observable in the UI.
  - Result: Settings save + ProductContext compile path is now verified in Chrome after user-approved Gemini transmission.

- **Path 2 / Step 2-4**
  - Action: switched the active session from Topic back to Product and saved settings.
  - Actual: rail changed to Product pages: `採集`, `分類`, `可行性`, `改善`, plus Settings.
  - Actual: Topic-specific pages disappeared from the rail after save.
  - Result: Product mode routing works after save, but the stale Product-mode copy remains: `啟用 Topic 流程並加上 Judgment`.

### Product signal readiness fix follow-up — 2026-04-27 HKT

- **Fix implemented**
  - Added Product signal readiness mapping so Product pages distinguish `saved`, `crawling`, `ready`, `missing_content`, `failed`, and `missing_item` instead of treating every saved signal as analyzable.
  - `分析收件匣` now allows saved Product signals to start the crawl path, then reports the queued count instead of returning a silent no-op.
  - Pre-analysis Product signal rows now show an explicit readiness badge/copy such as `尚未抓取` and `按分析會先送出抓取請求。`
  - The empty/readiness copy now says when crawling is required or in progress; it no longer says `已準備分析` while the processing strip is `0 / 2 ready`.

- **Relevant files**
  - `src/compare/product-signal-analysis.ts`
  - `src/ui/product-signal-readiness.ts`
  - `src/ui/useTopicState.ts`
  - `src/ui/useInPageCollectorAppState.ts`
  - `src/ui/InPageCollectorPopup.tsx`
  - `src/ui/ProductSignalViews.tsx`
  - `src/state/messages.ts`
  - `entrypoints/background.ts`
  - `tests/product-signal-analysis.test.ts`
  - `tests/views.test.tsx`

- **Local verification**
  - `npm run typecheck` passed.
  - `npx tsx --test tests/*.test.ts tests/*.test.tsx` passed with `285/285` tests.
  - `npm run build` passed and mirrored the unpacked extension to `output/chrome-mv3`.

- **Chrome follow-up**
  - Rebuilt and reloaded `output/chrome-mv3` before this follow-up.
  - Classification page initially showed `2 signals / 0 analyses` and `0 / 2 ready`.
  - Actual: readiness copy showed `有 signal 尚未抓取。按分析收件匣會先送出抓取請求，完成後再分析。`
  - Actual: clicking `分析收件匣` entered loading state, then surfaced `已送出 2 條抓取，完成後請再按分析。`
  - Actual: processing strip changed to `Processing in progress` / `Capturing comments...`, and Product page copy changed to `抓取正在進行；完成後會自動嘗試分析，也可以稍後再按分析。`
  - Backend check: `http://127.0.0.1:8000/worker/status` responded while the local Python ingest API was running.
  - Result: Product-mode saved signals no longer silently no-op at `0 / 2 ready`; they can now initiate the crawl pipeline from the Product Classification page.

- **Still not fully verified**
  - Real ProductSignalAnalyzer cards (`signalType`, `verdict`, `agentTaskSpec`, `experimentHint`) are still pending crawl completion and a second analyze action once backing captures become ready.
  - If the UI remains on `Capturing comments...` while backend `/worker/status` is `idle`, the next investigation should inspect item `job_id` / `capture_id` polling state and backend read-model availability for the queued captures.

### Backend readiness follow-up — 2026-04-27 HKT

- **Observed issue**
  - After Product Classification queued 2 captures, backend `/worker/status` was `idle` while both latest Product captures remained `queued` / job `pending`.
  - Manual `/worker/drain` initially failed both jobs with `crawler_setup_error` because Playwright attempted to use an old checkout path for `playwright/driver/node`.

- **Runtime fix applied**
  - Restarted the local ingest API from the current backend checkout using the backend virtualenv.
  - Requeued the two failed jobs and triggered `/worker/drain` again.

- **Result**
  - Both captures are now backend-ready: `ingestion_status=succeeded`, job `succeeded`, backend analysis `succeeded`.
  - Comment counts observed: 74 and 16.
  - Chrome Product page updated to `2 / 2 ready` and re-enabled `分析收件匣`.

- **Next step**
  - ProductSignalAnalyzer cards are not generated yet. Click `分析收件匣` after backend readiness to run the extension-side ProductSignalAnalyzer LLM call.
