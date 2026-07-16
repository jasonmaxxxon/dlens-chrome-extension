# DLens UI 維護性與 Runtime 效能重構計畫

> **執行要求：** 實作時使用 `superpowers:subagent-driven-development`（建議）逐 task 執行，或使用 `superpowers:executing-plans`。每個 task 只守一個 invariant，完成後即提交，任何一個 task 都可安全停下。

**目標：** 在不改變 0.3.47 現有 display、互動語義、資料契約與輪詢頻率的前提下，移除確定無效的源碼、把超長 UI 檔拆成可維護邊界，並用可量測的小步優化縮小無效 render、hover 熱路徑與關閉 popup 時的運算。

**架構原則：** 「拆檔」、「刪 dead source」、「runtime 加速」是三種不同工作。純搬移只改 source organization；已被 Rollup tree-shake 的 dead source 只降低維護負擔；真正加速必須改變 browser 實際做的工作，例如事件去重、相等值不 setState、關閉時不建 view model、窄而穩定的 props，以及最終的 state ownership 下移。

**技術棧：** React、TypeScript、WXT/Vite MV3 extension、Node test runner、JSDOM、Chrome Default profile、真實 Threads 頁面。

---

## 1. 已驗證現況

### 1.1 Source 結構

| Surface | 行數／形狀 | 判斷 |
|---|---:|---|
| `src/ui/ProductSignalViews.tsx` | 4,183 行 | 最高拆分優先；多個清楚的 route/presentation seam |
| `src/ui/TopicDetailView.tsx` | 3,641 行；主 component 約 1,564 行 | 高維護風險；但 audit/state 邊界多，應在 Product 後拆 |
| `src/ui/useInPageCollectorAppState.ts` | 3,228 行；約 43 個 state、23 個 effect、178 個 return members | 最高 runtime coupling；不能把「抽成多個 custom hooks」誤當成效能改善 |
| `src/ui/CompareView.tsx` | 3,172 行 | 有已證實的 live dead state，也有仍保留但入口不清楚的 Technique contract |
| `src/ui/components.tsx` | 2,112 行；44 個 exports | 雖長但多為獨立 primitives、fan-in 高；先清死碼，不優先大拆 |
| `src/ui/PrEvidenceViews.tsx` | 2,093 行 | 需等真實 8 篇 campaign gate 後才拆 |
| `src/ui/topic-audit-components.tsx` | 1,628 行 | 有一批已退役、已被 tree-shake 的 Newsroom/detail 元件 |

### 1.2 Runtime 與 bundle baseline

- Root 只直接 render 兩個 full-model child：`InPageCollectorOverlays` 與 `InPageCollectorPopup`。
- 全 runtime 共五個 `app={app}` 傳遞點；「五個 surface 全部直接訂閱 root」不是精確描述，而且 conditional route 未 mount 時不會 render。
- `useInPageCollectorAppState` 每次 root state 改變會重新建立 178-member app object；是否造成昂貴 child render，取決於該 child 是否 mounted、props 是否穩定，以及是否有 memo boundary。
- `output/chrome-mv3/content-scripts/threads.js`：
  - raw：906,988 bytes（885.73 KiB）
  - Node `gzipSync(level: 9)`：253,459 bytes
  - Brotli：201,965 bytes
  - SHA-256：`a44ac91497ce5bb25008db36f4fcb104184707c22c84083f89a66a0cc59ff11b`
- 整個 build：1,496,305 bytes（1.50 MB／1.427 MiB）。
- Content script 是單一 WXT IIFE；一般 TSX 拆檔不會自動減少 download、parse 或 execute 成本，普通 `React.lazy` 也不會自然產生可延後載入的 route chunk。
- 真實 hover trace：同一張 card 連續 20 次 `mousemove`，目前會出現 20 次 `content.overlay.render`，但只有 1 次 card-change。
- Idle `/worker/status` cadence 是 12 秒，即每分鐘最多 5 次；目前每次內容相同的 response 仍會建立新的 `backendWorkUiState` object。
- Popup 關閉時，`InPageCollectorPopup` 仍會先建立 Product／Topic view model，之後才 `return null`。

### 1.3 Dead source 的精確含義

以下符號已確認沒有 production caller，而且不在 shipped bundle：

- `src/ui/components.tsx`
  - 移除：`statusTheme`、`hudLabel`、`formatElapsed`、`PageButton`
  - 保留但取消 export：`ModeRailButton`
- `src/ui/topic-audit-components.tsx`
  - 移除：`ReactionPatternDetailPanel`、`NewsroomLane`、`NewsroomLadder`、`NewsroomUncertainty`、`NarrativeLaneDetailPanel`
  - 一併移除只服務上述元件的 private helpers/types，包括 `ReactionEvidenceList`、`NewsroomRole`、`NEWSROOM_ROLE_META`、`newsroomRoleForLane`
  - `buildNewsroomLadder` 沒有 production caller，但有一個 test caller；若移除 helper，必須同步移除那個孤立測試
  - 保留但取消 export：`Dot`、`ReactionCoverageStrip`
  - 不得刪 `src/viewmodel/narrative-lane-detail.ts`；現行 Topic drawer 仍使用它
- 現行測試明確要求 Newsroom markers 不出現在 UI；這些 absence-contract tests 要保留。

這批刪除的主要收益是 source hygiene、review 範圍、typecheck/build 負擔與減少誤導；不得宣稱 browser display 因此變快。

---

## 2. 工作軌道與優先序

| 軌道 | 改什麼 | 使用者可感知速度 | 維護收益 | 風險 |
|---|---|---:|---:|---:|
| A. Guard + dead source | 補 recursive guard、刪已退役宣告、縮小 export surface | 幾乎沒有 | 高 | 低 |
| B. Hot-path optimization | hover 去重、相同 worker state 不更新、closed popup 不 projection | 有，且可直接量 | 中 | 低至中 |
| C. Mechanical split | 只搬 presentation code，facade/re-export 不變 | 中性 | 很高 | 低至中 |
| D. Render isolation | narrow stable model、memo、state ownership 下移 | 最高 | 高 | 高 |
| E. Loader PoC | 輕量 launcher + 獨立 workspace resource | 可能改善首次注入 | 中 | 很高 |

執行順序：

```text
0.3.47 closeout
      ↓
Baseline → Guards → Dead-source cleanup
                         ↓
              Low-risk runtime wins
                         ↓
              Mechanical file split
                         ↓
            Narrow models / ownership
                         ↓
          Optional loader PoC（另分支）
```

為何不是先拆大 hook：如果多個 domain hook 仍全部由 `InPageCollectorApp` 呼叫，root 還是會因任何 domain state 改變而重跑；它只改善 source organization，不會縮小 render radius。真正效能邊界是「誰擁有 state」與「昂貴 subtree 收到的 props 是否窄且穩定」。

---

## 3. 全域 constraints 與停止條件

- 先完成 0.3.47 的 release/live acceptance；本計畫的 production change 目標版本為 0.3.48。
- 實作使用隔離 worktree；保留目前 main 上所有 unrelated untracked Playwright assets 與 `.bak`。
- 現有 shipped UI 是 visual baseline；不改 copy、DOM 順序、React keys、`data-*` markers、tokens、motion semantics、popup 尺寸或 route 行為。
- 不改 storage keys、background message contracts、request reconcile、worker poll cadence、Topic/PR producer semantics。
- Compare Technique pipeline 暫時保留。它的 UI entry 不清楚，但 controller/storage/docs contract 尚在；另開產品決策 task 判斷「恢復入口」或「整條移除」。
- PR Stage A/B、validator、semantic repair、trace/provider code 在 8 篇 campaign gate 前不碰。
- 每個 task 若 targeted test、full gate、bundle budget 或 live invariant 任一失敗，停止在該 task，不把下一個 task 疊上去。
- 純 dead-source commit：連續 build 已證明 deterministic 後，runtime artifact hash 應完全相同；若不同，停止並檢查被刪 code 是否其實 reachable。
- 純搬移 commit：不強求 bundle hash 完全相同，因 module ordering/minification 可能改變；改用行為測試、DOM contracts、chunk 數與 size budget驗收。
- 不在第一輪直接啟用全 repo `noUnusedLocals/noUnusedParameters`；先逐 surface 清理，避免 test-only exports、WXT entrypoints 與 intentional registry 產生噪音。
- 不先引入 `knip`。現有 TypeScript、AST/`rg`、bundle marker 與 import graph 足以完成第一輪；只有剩餘疑點很多時才獨立評估。

---

## 4. 統一驗收門檻

### 4.1 每個 commit

```bash
npm run typecheck
git diff --check
```

再跑該 task 列出的 targeted tests。

### 4.2 每個 Wave

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npm run storage:migrate-fixtures
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
npm run bundle:guard
git diff --check
```

注意：新 test 檔放在 `tests/` 第一層，因現有 full-suite glob 不會自動執行 nested test。`tests/helpers/` 與 `tests/fixtures/` 只放共用 helper/fixture。

### 4.3 Runtime task 的 Chrome gate

在 Default Chrome profile reload `output/chrome-mv3`，使用真實 Threads 頁：

1. Product、Topic、Compare、PR、Library 主要 route 與 720/narrow width 沒有非預期視覺差異。
2. 觀察 60 秒 backend log，`/worker/status` 不超過 5 次。
3. 停止 backend，UI 顯示 `Backend unreachable`。
4. 重啟 backend，UI 自動恢復。
5. 20 次 workspace switch 的 median `overheadMs` 不比 baseline 增加 `max(25ms, 10%)`。

---

## Wave 0 — 鎖定 release boundary 與可重現 baseline

### Task 0.1：先完成 0.3.47 live acceptance

**Files:** 不改 production source。

**Invariant:** refactor 不能掩蓋「Chrome 是否真的載入 0.3.47」與現有 backend recovery 問題。

- [ ] 在 Chrome extensions reload DLens，確認 manifest/UI version 是 0.3.47。
- [ ] 真實 Threads 頁打開 popup，跑完整 60 秒 poll／backend stop／restart 驗收。
- [ ] 若 baseline 不綠，先修 baseline bug；本重構計畫暫停。
- [ ] 處理或明確接受現有 8 個 dead jobs；不要把它混進 UI refactor commit。
- [ ] 完成 0.3.47 push/tag/release closeout 後才建立本計畫 worktree。

### Task 0.2：記錄機器可讀 baseline

**Files:**

- Create: `docs/qa/assets/2026-07-16/ui-refactor-baseline.json`
- Create: `scripts/check-ui-bundle-budget.mjs`
- Create: `scripts/ui-bundle-budget.json`
- Modify: `package.json`

**Test first:** Create `tests/ui-bundle-budget-cli.test.ts`，使用臨時 fixture 驗證「低於 budget exit 0、任一 raw/gzip/brotli 超標 exit 1」。

**Baseline schema:**

```json
{
  "version": "0.3.47",
  "threads": {
    "rawBytes": 906988,
    "gzip9Bytes": 253459,
    "brotliBytes": 201965,
    "sha256": "a44ac91497ce5bb25008db36f4fcb104184707c22c84083f89a66a0cc59ff11b"
  },
  "buildBytes": 1496305,
  "idleWorkerStatusRequestsPerMinute": 5,
  "sameCardMousemoves": 20,
  "sameCardOverlayRenders": 20,
  "sameCardCardChanges": 1
}
```

**Guard implementation shape:**

```js
import { readFileSync } from "node:fs";
import { brotliCompressSync, gzipSync } from "node:zlib";

const limits = JSON.parse(readFileSync(new URL("./ui-bundle-budget.json", import.meta.url), "utf8"));
const source = readFileSync(new URL("../output/chrome-mv3/content-scripts/threads.js", import.meta.url));
const actual = {
  rawBytes: source.length,
  gzip9Bytes: gzipSync(source, { level: 9 }).length,
  brotliBytes: brotliCompressSync(source).length
};

for (const key of Object.keys(actual)) {
  if (actual[key] > limits.threads[key]) process.exitCode = 1;
}
```

Initial limits：raw 910,000、gzip9 256,000、brotli 203,000 bytes；另記錄總 JS/chunk/build bytes，不允許無解釋的新 runtime chunk。

- [ ] Fresh build 連續跑兩次，確認所有 artifacts 在同環境 deterministic。
- [ ] `package.json` 新增 `"bundle:guard": "node scripts/check-ui-bundle-budget.mjs"`。
- [ ] Run: `npx tsx --test tests/ui-bundle-budget-cli.test.ts`，預期 GREEN。
- [ ] Commit: `test: lock UI refactor bundle baseline`

---

## Wave 1 — 先修會被拆檔穿透的 guards

### Task 1.1：Color literal guard 改為 recursive

**Files:**

- Create: `tests/helpers/read-source-tree.ts`
- Create: `tests/fixtures/ui-color-literal/nested/BadView.tsx`
- Modify: `tests/color-literal-guard.test.ts`

**Test first:** 先新增 fixture assertion，證明現有第一層 `readdirSync` 漏掉 nested violation，預期 RED。

**Implementation shape:**

```ts
export function readSourceTree(root: URL): Array<{ relativePath: string; source: string }> {
  // Recursive walk; include .ts/.tsx; stable sort by relative path.
}
```

- [ ] Guard 掃描 `src/ui/**`，仍排除唯一 canonical `src/ui/tokens.ts`。
- [ ] Allowlist 使用相對於 repo 的完整 path，不用 basename。
- [ ] Run: `npx tsx --test tests/color-literal-guard.test.ts`，預期 GREEN。
- [ ] Commit: `bug fix: scan nested UI files for color literals`

### Task 1.2：Motion/source guards 改為 source family

**Files:**

- Create: `tests/helpers/read-ui-source-family.ts`
- Modify: `tests/motion-registry.test.ts`

**Family contract:**

```ts
const UI_SOURCE_FAMILIES = {
  LibraryView: ["src/ui/LibraryView.tsx", "src/ui/library"],
  ProductSignalViews: ["src/ui/ProductSignalViews.tsx", "src/ui/product"],
  CompareView: ["src/ui/CompareView.tsx", "src/ui/compare"],
  TopicDetailView: ["src/ui/TopicDetailView.tsx", "src/ui/topic"],
  PrEvidenceViews: ["src/ui/PrEvidenceViews.tsx", "src/ui/pr-evidence"]
} as const;
```

- [ ] Route-card/motion marker checks掃整個 family。
- [ ] Compare scroll contract 在 family 中定位 `openTechniqueView`，不再 source-slice 單一檔名。
- [ ] Test 加一個 nested family fixture，證明新 sibling 不能逃過 guard。
- [ ] Run: `npx tsx --test tests/motion-registry.test.ts`，預期 GREEN。
- [ ] Commit: `bug fix: make motion guards follow UI source families`

### Task 1.3：PR read-model boundary 覆蓋未來拆出的檔案

**Files:**

- Modify: `tests/pr-evidence-readmodel-boundary.test.ts`
- Reuse: `tests/helpers/read-ui-source-family.ts`

- [ ] `sendExtensionMessage`、`Date.now`、Blob/download、raw storage 等禁止項目掃整個 PR family。
- [ ] Facade 的 `viewModel/onCommand` 正向 contract 仍只鎖 `src/ui/PrEvidenceViews.tsx`。
- [ ] Add nested bad fixture，先 RED，再使 family guard GREEN。
- [ ] Run: `npx tsx --test tests/pr-evidence-readmodel-boundary.test.ts`。
- [ ] Commit: `bug fix: extend PR view boundary across split files`

### Task 1.4：Wave 1 full gate

- [ ] 跑統一 Wave gate。
- [ ] Build size/hash 應與 Wave 0 相同；這一 Wave 只改 tests/scripts。

---

## Wave 2 — 清 source-dead code，但不虛報效能

### Task 2.1：清 shared component kit 的確定 dead source

**Files:**

- Modify: `src/ui/components.tsx`
- Modify: `src/ui/topic-audit-components.tsx`
- Modify: `tests/topic-detail-view.test.tsx`

**Test first:** 在 `tests/components.test.tsx` 與 `tests/topic-detail-view.test.tsx` 加 source/API contract：public testables 與 live markers仍存在，退役 exports 不再出現在 module surface。避免寫 brittle 的完整 source snapshot。

- [ ] 移除前述四個 components helpers 與五個 Topic audit dead panels。
- [ ] 移除 `buildNewsroomLadder` 及其唯一孤立 test；保留所有「現行 UI 不出現 Newsroom」的測試。
- [ ] `ModeRailButton`、`Dot`、`ReactionCoverageStrip` 只取消 export，保留 live internal caller。
- [ ] `narrative-lane-detail.ts` 保留。
- [ ] Run:

```bash
npx tsx --test tests/components.test.tsx tests/topic-detail-view.test.tsx tests/views.test.tsx
```

- [ ] Fresh build 的所有 runtime artifact hash 與 task 前完全相同；否則停止。
- [ ] Commit: `removal: delete tree-shaken UI component families`

### Task 2.2：清 Compare 的 live dead state／handler

**Files:**

- Modify: `src/ui/CompareView.tsx`
- Modify: `tests/compare-view.test.tsx`
- Modify: `tests/motion-registry.test.ts`

**範圍：** 只移除已證明 getter/handler/ref 沒有 live consumer 的 `hoveredClusterKey`、`expandedEvidenceKeys`、`engagementExpanded`、`commentsExpanded`、對應 refs/handlers，以及 `supportExpanded` 的無效 setter/render。若 `highlightedClusterPanel` 只留下 timer 而沒有 visual consumer，先用 test 鎖定沒有 marker/style consumer，再移除 timer/state。

**不得順手刪：** `comparePage`、Technique reading storage/controller、`openTechniqueView` contract。入口的恢復或移除另開產品決策。

- [ ] 先寫 test，證明相關互動輸出/DOM 不依賴被移除 state。
- [ ] Run:

```bash
npx tsx --test \
  tests/compare-view.test.tsx \
  tests/compare-viewmodel.test.ts \
  tests/motion-registry.test.ts \
  tests/skeleton-loading.test.tsx \
  tests/pipeline-ui-ready.test.ts
```

- [ ] Run filtered `tsc --noUnusedLocals --noUnusedParameters`，確認 `CompareView.tsx` 沒有本 task 造成的 unused warning；不把 flags 寫入全 repo tsconfig。
- [ ] Commit: `removal: delete inert Compare render state`

### Task 2.3：其餘 dead islands 分 surface 盤點，不做大爆破

**Files:**

- Create: `docs/qa/assets/2026-07-16/ui-dead-source-inventory.md`

每個候選必須同時滿足：production caller 0、test caller 已理解、獨有 bundle marker 0、刪除後 typecheck/target tests green、deterministic artifact hash相同。Product 的 `inferWorkflowPattern`、`citationUseCase` 與 Topic 現行 drawer view-model 不得誤刪。

- [ ] 先只記錄 `symbol / callers / tests / marker / decision`，不在 inventory commit 刪 code。
- [ ] 每個 surface 的刪除另成一個 `removal:` commit。
- [ ] Commit: `docs: record verified UI dead-source inventory`

---

## Wave 3 — 先做低風險、真的會加速的工作

### Task 3.1：Hover 同 card/同 geometry 去重與 frame coalescing

**Files:**

- Create: `src/targeting/hover-geometry.ts`
- Create: `tests/hover-geometry.test.ts`
- Modify: `entrypoints/threads.content.ts`
- Modify: `src/ui/useInPageCollectorAppState.ts`

**Test first:**

```ts
test("same card and same rect publish only once", () => {
  const previous = hoverFingerprint(cardId, "strong", rect);
  assert.equal(shouldPublishHover(previous, cardId, "strong", rect), false);
});

test("same card with changed rect still publishes", () => {
  assert.equal(shouldPublishHover(previous, cardId, "strong", movedRect), true);
});
```

**Implementation invariant:**

- 每個 processed animation frame 最多讀一次 `getBoundingClientRect()`。
- 同 card + same strength + same normalized rect 不再 `renderOverlay`／dispatch `hoverRect`。
- mousemove burst 用單一 `requestAnimationFrame` coalesce；離開 card、切 card、scroll/layout 改 rect 仍更新。
- repeated hide 不重複 publish null。

**Acceptance:**

- [ ] Unit：1,000 次 same-card event 在穩定首 event 後 publish 0 次。
- [ ] Live：原本 20 moves → 20 render / 1 card-change；改後 20 moves → 1 render / 1 card-change。
- [ ] 換另一 card、scroll 後位置變化、selection cancel 都仍正確。
- [ ] Run: `npx tsx --test tests/hover-geometry.test.ts tests/use-in-page-collector-app-state.test.ts`。
- [ ] Commit: `performance: dedupe stable hover geometry updates`

### Task 3.2：相同 backend work state 不觸發 setState

**Files:**

- Modify: `src/state/processing-state.ts`
- Modify: `src/ui/useProcessingCoordinator.ts`
- Modify: `tests/processing-state.test.ts`
- Modify: `tests/controller-hook.test.tsx`

**Test first:** 新增 `sameBackendWorkUiState` 對所有 union kinds/fields 的 table test；在 coordinator harness 計數 React commits，五次內容相同 idle response 只允許第一次 state commit。

**Implementation shape:**

```ts
export function sameBackendWorkUiState(
  left: BackendWorkUiState | null,
  right: BackendWorkUiState | null
): boolean {
  if (left === right) return true;
  if (!left || !right || left.kind !== right.kind) return false;
  // exhaustive switch; compare every field of each discriminated-union member
}

setBackendWorkUiState((current) =>
  sameBackendWorkUiState(current, next) ? current : next
);
```

- [ ] Poll request數保持每分鐘最多 5，不改 cadence。
- [ ] 五個 identical idle responses：第一次後額外 workspace commit = 0。
- [ ] draining、failed、retry、expired、backend down/up transition 仍各自觸發一次 UI update。
- [ ] Run: `npx tsx --test tests/processing-state.test.ts tests/controller-hook.test.tsx tests/processing-strip.test.tsx`。
- [ ] Commit: `performance: preserve backend work state identity`

### Task 3.3：Popup closed/open boundary 前移

**Files:**

- Modify: `src/ui/InPageCollectorPopup.tsx`
- Modify: `tests/views.test.tsx`

**Test first:** 用 `Proxy` app model 記錄 property reads；`popupOpen=false` 時只允許讀 `popupOpen`，Product/Topic VM builder call count = 0。另寫 close→open characterization test，鎖定 switching state、scroll reset、PR upload ref 等重開語義。

**Implementation shape:**

```tsx
export function InPageCollectorPopup({ app }: { app: InPageCollectorAppModel }) {
  if (!app.popupOpen) return null;
  return <OpenInPageCollectorPopup app={app} />;
}

function OpenInPageCollectorPopup({ app }: { app: InPageCollectorAppModel }) {
  // current open-only projections, refs, effects and JSX live here
}
```

- [ ] Product VM 只在 Product route build。
- [ ] Topic VM 只在 `topic-detail`/實際 consumer route build，不因 `activeTopic` 單獨存在而 build。
- [ ] 若 characterization 顯示某個 local state 必須跨 close/open 保留，將那一個 state留在 outer facade；不保留整個 heavy subtree。
- [ ] Run: `npx tsx --test tests/views.test.tsx tests/pipeline-ui-ready.test.ts tests/motion-registry.test.ts`。
- [ ] Live：關閉 popup 時 projection/request = 0；重開 route、scroll、selection 行為正確。
- [ ] Commit: `performance: gate popup projections behind open state`

### Task 3.4：關閉 popup 時不讀 Technique，Topics projection memoize

**Files:**

- Modify: `src/ui/useInPageCollectorAppState.ts`
- Modify: `src/ui/TopicsListView.tsx`
- Modify: `tests/use-in-page-collector-app-state.test.ts`
- Modify: `tests/topics-list-view.test.tsx`

- [ ] `compare/get-technique-readings` effect 增加 `popupOpen && page === "library"` gate，dependency 含 `popupOpen`。
- [ ] `buildTopicSourceSummaries(topics, signals, sessionItems)` 用 `useMemo`，只在三個 input identity 改變時重跑。
- [ ] JSDOM harness 連續 unrelated parent rerender，builder call count維持 1；input identity 改變才變 2。
- [ ] Popup closed 時 Technique request count = 0；open Library 時 = 1。
- [ ] Run: `npx tsx --test tests/use-in-page-collector-app-state.test.ts tests/topics-list-view.test.tsx`。
- [ ] Commit 1: `performance: gate Technique reads behind open Library`
- [ ] Commit 2: `performance: memoize Topic source summaries`

### Task 3.5：Wave 3 full + Chrome gate

- [ ] 跑統一 Wave gate。
- [ ] 跑完整 Chrome gate，另記錄 hover、render count、workspace switch 與 bundle前後數字。

---

## Wave 4 — 純位置拆分，買維護性而不改 runtime ownership

### 共同 invariant

- 只搬 declarations/imports；不改 state owner、hook ordering、callback identity、DOM、copy、style 或 events。
- 原 facade 檔名與 public exports 保留：`productSignalViewTestables`、`compareViewTestables`、`topicDetailViewTestables`、`PrEvidenceView` 原名 re-export。
- 每個 commit 前後 targeted HTML/data markers 一致。
- 不新增 runtime chunk；每 task `threads.js` raw 增幅不超過 1 KiB，Wave 最終總 JS 不高於 Wave 0 baseline。任何增加都要解釋，不能把增幅當作「拆檔成本正常」。

### Task 4.1：Library 作為拆分 rehearsal

**Files:**

- Create: `src/ui/library/LibraryCards.tsx`
- Modify: `src/ui/LibraryView.tsx`

搬移 `SavedAnalysisCard`、`FolderSynthesisCard` 與只服務它們的 pure helpers；保留 route/state/commands 在 facade/main。

- [ ] Run: `npx tsx --test tests/library-view.test.tsx tests/views.test.tsx tests/skeleton-loading.test.tsx tests/motion-registry.test.ts`。
- [ ] Chrome：ready/pending/empty、saved analysis、folder synthesis、Process All、scroll bottom。
- [ ] Commit: `refactor: extract Library view cards`

### Task 4.2：Product 分四個 presentation modules

**Files:**

- Keep facade: `src/ui/ProductSignalViews.tsx`
- Create: `src/ui/product/ProductClassificationView.tsx`
- Create: `src/ui/product/ProductReadingView.tsx`
- Create: `src/ui/product/ProductSavedView.tsx`
- Create: `src/ui/product/ProductActionView.tsx`
- Create: `src/ui/product/product-view-shared.ts`，只放四個 presentation modules 共用的 pure types/helpers

每次只搬一個 route family，依序提交：

1. `refactor: extract Product classification view`
2. `refactor: extract Product reading view`
3. `refactor: extract Product saved view`
4. `refactor: extract Product action view`

每個 commit：

```bash
npx tsx --test \
  tests/views.test.tsx \
  tests/product-signal-viewmodel.test.ts \
  tests/motion-registry.test.ts \
  tests/skeleton-loading.test.tsx
```

Chrome contract：Saved、Classification、Reading、Action route；filter、expand、remove、copy/export；empty/waiting/ready/error。

### Task 4.3：Compare 只抽 presentation leaves

**Files:**

- Keep facade/state: `src/ui/CompareView.tsx`
- Create: `src/ui/compare/CompareResultPresentation.tsx`
- Create: `src/ui/compare/CompareEvidencePresentation.tsx`

- [ ] `CompareView.tsx` 保留 route/state/command/Technique ownership。
- [ ] 先搬 pure result/evidence leaves；不把 state「順便」搬入新檔。
- [ ] Run Compare targeted suite（同 Task 2.2）。
- [ ] Chrome：parallel/chapters/reading、cluster selector、support data、attach topic、back navigation。
- [ ] Commit 1: `refactor: extract Compare result presentation`
- [ ] Commit 2: `refactor: extract Compare evidence presentation`

### Task 4.4：Topic 分 audit 與 product detail presentation

**Files:**

- Keep facade/state: `src/ui/TopicDetailView.tsx`
- Create: `src/ui/topic/TopicAuditPresentation.tsx`
- Create: `src/ui/topic/TopicAtlasDetail.tsx`
- Create: `src/ui/topic/TopicProductDetail.tsx`

- [ ] 所有 state/effect 先留在 facade；新模組只接 typed props/view model。
- [ ] 依序搬 audit drawer/Atlas、再搬非 Atlas Topic detail。
- [ ] Run: `npx tsx --test tests/topic-detail-view.test.tsx tests/topic-detail-viewmodel.test.ts tests/motion-registry.test.ts tests/skeleton-loading.test.tsx tests/pipeline-ui-ready.test.ts`。
- [ ] Chrome：ready/running/stale/failed、drawer Escape、單帖 regenerate/delete、bulk analyze、backend stop/recover。
- [ ] Commit 1: `refactor: extract Topic audit presentation`
- [ ] Commit 2: `refactor: extract Topic detail presentation`

### Task 4.5：PR 只在 8 篇 campaign gate 後拆

**Precondition:** 真實 8 篇 trace 必須證明 sourceCount、Stage A chunks、Stage B、repair calls、HTTP attempts、persist/reopen 與 ref URL 全部符合 0.3.47 contract。

**先建立機器 gate：**

- Create: `scripts/qa-pr-narrative-trace.mjs`
- Create: `tests/qa-pr-narrative-trace-cli.test.ts`

輸出必須把四種數字分開，不能把 trace event 數統稱為 calls：

1. Stage logical calls：`stageAChunkCount + 1`
2. Semantic repair calls：每個 Stage A chunk／Stage B 最多一次
3. Logical total：`stageAChunkCount + 1 + repairCallCount`
4. HTTP attempts：每個 logical call 1–3 次，因 provider 最多 retry 2 次

Raw trace acceptance：

- `sourceCount === 8`
- `chunkRefs` 對 `P01…P08` 恰好完整覆蓋一次
- `run.complete.stageACallCount === run.start.stageAChunkCount`
- `stageBCallCount === 1`
- 每個 `*.repair.request` 最多一次
- `direct-llm.*.request` 依 requestId/label 分組後，每組 attempts ≤ 3
- 最終 response 全部成功，沒有 `run.error`
- persisted result 關閉／重開 popup 後仍存在，切 lens 不會自動重新生成
- support/counter ref 可打開正確原帖 URL
- `complete` 才算完整 UI gate；`insufficient_evidence` 是誠實且合法的 pipeline 結果，但不足以驗證 claim drawer 全路徑

- [ ] Run: `npx tsx --test tests/qa-pr-narrative-trace-cli.test.ts`。
- [ ] Commit: `feature: add PR narrative campaign trace gate`

**Files:**

- Keep facade: `src/ui/PrEvidenceViews.tsx`
- Create: `src/ui/pr-evidence/PrCampaignEditor.tsx`
- Create: `src/ui/pr-evidence/PrNarrativeLens.tsx`
- Create: `src/ui/pr-evidence/PrEvidenceLens.tsx`

- [ ] 若 campaign gate 未跑或不是完整成功，本 task 保持 blocked，但不阻擋 Product/Compare/Topic。
- [ ] 每個 module 一個 commit，跑所有 PR contract/read-model/narrative/storage/pipeline tests。
- [ ] 不修改 Stage A/B 或 validator 邏輯。

### Task 4.6：Wave 4 full + visual gate

- [ ] 跑統一 Wave gate。
- [ ] 主要 route 及 720/narrow screenshots 與 baseline 做人工/像素差異檢查；任何差異須能由 anti-aliasing 或 build noise 解釋。
- [ ] 重新量 bundle、switch median；不得把 hash 改變誤寫成性能退步或進步。

---

## Wave 5 — 真正縮小 render radius（最高風險）

### Task 5.1：先建立 render isolation tests

**Files:**

- Create: `tests/in-page-render-isolation.test.tsx`
- Modify: `tests/controller-hook.test.tsx`

使用 JSDOM + React `Profiler`/commit counters，鎖定：

- [ ] hover rect change 可 render Overlay，但不 render Popup workspace。
- [ ] identical worker status polls 不 render route body。
- [ ] popup closed 時 heavy subtree commit = 0。
- [ ] active route command callback identity 在 unrelated update 後保持一致。

先在現狀跑，預期至少 hover isolation test RED；不要先改 implementation。

### Task 5.2：建立 narrow model，不再向所有層傳 178-member app

**Files:**

- Create: `src/ui/in-page-models.ts`
- Modify: `src/ui/InPageCollectorApp.tsx`
- Modify: `src/ui/InPageCollectorOverlays.tsx`
- Modify: `src/ui/InPageCollectorPopup.tsx`
- Modify: `src/ui/InPageCollectorFolderControls.tsx`
- Modify: `src/ui/InPageCollectorResultWorkspace.tsx`

**Model shape:**

```ts
export type InPageOverlayModel = Pick<InPageCollectorAppModel,
  | "snapshot"
  | "hoverRect"
  | "cardDescriptor"
  | "onSavePreview"
  | "onOpenPopup"
>;

export type PopupShellModel = Pick<InPageCollectorAppModel,
  | "popupOpen"
  | "page"
  | "activeFolderMode"
  | "onNavigate"
  | "onSessionModeChange"
>;
```

實際 model 依 compiler 補齊 consumer 真正需要的欄位，但禁止先複製全部 178 members。

- [ ] Root 用 `useMemo` 投影 narrow models。
- [ ] Child 用 `memo`；所有 callback 必須先由測試證明 identity stable，逐一修 `useCallback`，不一次寫巨大 dependency list。
- [ ] 先只建立 render boundary，不移 state owner。
- [ ] Acceptance：hover update仍可令 root 重跑，但 Popup heavy subtree commit = 0。
- [ ] Commit 1: `refactor: project a narrow overlay model`
- [ ] Commit 2: `refactor: project a narrow popup shell model`

### Task 5.3：把高頻 hover ownership 下移 Overlay subtree

**Files:**

- Create: `src/ui/useCollectorHoverState.ts`
- Modify: `src/ui/InPageCollectorOverlays.tsx`
- Modify: `src/ui/useInPageCollectorAppState.ts`

- [ ] 將只服務 overlay 的 `hoverRect` event/listener、derived `flashStyle` 與 state 移入 Overlay subtree。
- [ ] Parent 只保留 selection/save 所需的穩定 commands與 snapshot slice。
- [ ] 所有 event listener mount/unmount、selection cancel、popup close semantics 由 test 鎖定。
- [ ] Acceptance：1,000 stable hover events後 workspace commit = 0；有效 rect/card change只 render Overlay。
- [ ] Commit: `performance: localize hover state to overlay subtree`

### Task 5.4：按 route 逐步下移 state ownership

順序：Product → Compare shell → Topic → PR（仍受 campaign gate 約束）。每次只移一個 owner；不把 3,228 行 hook一次拆完。

每個 state slice 的完成標準：

1. 原 owner/consumer/message contract列清楚。
2. 先有 render-count + behavior characterization test。
3. 移到最低共同 mounted ancestor。
4. Parent 只收窄 command或 immutable VM。
5. callback identity、poll cadence、storage reconcile不變。
6. Chrome route、close/open、backend down/up全綠。

建議 commit template：`performance: localize <domain> state to <surface>`。

這才是 Claude 所說「domain 拆分」真正會加速的版本；只抽 custom hook 檔案不算完成。

---

## Wave 6 — Optional loader PoC，不能混進主重構

目前 content script 是單一 IIFE。若要改善首次注入/parse，需另分支研究「輕量 launcher entry + 首次開 popup才載入獨立 extension workspace resource／iframe」，而不是只加 `React.lazy`。

**Adoption gate:**

- content-script gzip 至少下降 25%；低於此幅度不值得承擔 loader複雜度。
- 首次打開 popup p95 不退步，且沒有白屏/loading flicker。
- MV3 CSP、resource URL、message bridge、reload、backend recovery、所有 route display 全綠。
- 理論可延後約 87 KiB gzip只算上限，不算成果；以真實 trace為準。

未達 adoption gate，PoC 丟棄，不進 0.3.48。

---

## Wave 7 — 0.3.48 closeout

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `wxt.config.ts`
- Modify: `src/ui/version.ts`
- Modify: `tests/manifest-config.test.ts`
- Modify: `README.md`
- Modify in place: `docs/memory/latest-shared-context.md`

- [ ] 只記錄實際完成的 waves；純 dead-source刪除不得寫成 performance gain。
- [ ] 版本五處鎖為 0.3.48，build manifest同為 0.3.48。
- [ ] 跑完整統一 Wave gate。
- [ ] 跑真實 Chrome完整驗收；保存 poll/backend recovery、hover、render、bundle、workspace switch證據。
- [ ] 若 PR split 完成，附 8 篇 campaign trace gate；若未完成，明確保留為下一輪，不阻塞其他 UI重構 release。
- [ ] Commit: `release: lock 0.3.48 UI maintainability and runtime gains`

---

## 5. 最終成功定義

### 維護性

- 超長檔按使用者心智模型拆成 facade + route/presentation modules。
- public test/import contract不變；guard可遞迴掃描新子目錄。
- 已 tree-shake 的退役元件不再誤導人或 agent；export surface縮小。
- 每個 commit只改一個 invariant，review、rollback與並行修改範圍顯著變窄。

### Display/runtime

- 現行 UI display、route、copy、interaction與storage contract不變。
- 同一 card穩定 mousemove不再重畫/dispatch。
- identical worker responses不再建立新 UI state identity。
- popup closed不 build Product/Topic VM、不讀 Technique data。
- unrelated parent update不重跑 Topic source summary。
- 後續 narrow model/ownership工作以 React commits與 Chrome trace證明 render radius真的縮小。

### 誠實的性能敘事

- 「拆檔」報維護收益。
- 「刪已 tree-shake dead source」報 source/build hygiene。
- 「事件、state、projection、render isolation」才報 display/runtime收益。
- 「loader PoC」只有通過 25% gzip與首次打開 p95 gate後才報啟動收益。

這樣合併三條工作線的好處，是先把風險降下來，再拿低風險、可直接量到的速度收益，最後才動最高槓桿的 state ownership；不會為了追求一個模糊的「拆得更乾淨」而把 0.3.47 已驗證的 display與 polling contract一起重寫。
