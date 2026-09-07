# DLens Extension — Workflow Rules

本檔是 repo 的**流程 owner**：閱讀順序、驗收、版本鎖、工作邊界及協作。產品模式契約由 [AGENTS.md](AGENTS.md) 維護；不要在 skills、handoff 或 README 再複製一份完整規則。

## Reading order and authority

1. 先讀本檔，再讀 [README](README.md) 的版本及工作狀態。
2. 按變更模式讀 [AGENTS.md](AGENTS.md#mode-contracts-current-history-and-rationale-in-the-archive)；按資料流讀[架構地圖](docs/architecture/dlens-current-architecture-map.md)。
3. 接手進度讀[固定 shared context](docs/memory/latest-shared-context.md)。歷史依[決策索引](docs/architecture/product-decision-index.md) 查找，不把舊 plans 當待辦重新執行。

對應 commit 的 code/tests 證明實作；build、載入中的 Chrome、worker queue/result 各有獨立證據。已批准需求不因現有 bug 自動失效。衝突要標明「實作落差／規格過期／待產品決定」，不要用一條文件排名掩蓋它。

設計數值 owner 是 `src/ui/tokens.ts`，value-free 意圖 owner 是 `src/ui/tokens-intent.md`，motion registry 是 `src/ui/motion.ts`。有日期的 spec/mockup 可保留為 reference 或已選決策，不能新增另一份 live palette／font scale。

## Verify gate

程式改動與發布整合必須在目前 checkout 完成下列完整 gate，記錄 command、commit 及結果：

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npm run storage:migrate-fixtures
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
npm run bundle:guard
npm run qa:harness:fixture
git diff --check
```

- `tsx` 由 `npx` 取得，不是 devDependency；離線或下載失敗屬環境問題，不能寫成 suite assertion failure。
- 純文件／skill 修改可按影響跑既有 docs/boundary/fixture 與 links 檢查；併入程式發布時仍跑完整 gate。不為字數、日期或同義改寫新增測試。
- `qa:harness:fixture` 重播已提交歷史 trace，不是今天的 backend／LLM／Chrome 成功證據；QA fixture 留原路徑。
- 任何 agent 的「完成」只是待核實聲明。合併／發布驗收依目前 diff 與新結果，不沿用前一個 checkout 的綠燈。
- Build 會同步到 `output/chrome-mv3`；bundle guard 超額時先找本批可移除的重複或失效碼，不直接提高門檻。

## Version lock

使用者可見的 `main` 更新同步**五處**，除非使用者明確要求不升版：

1. `package.json`
2. `package-lock.json`
3. `wxt.config.ts` 的 `manifest.version`
4. `src/ui/version.ts` 的 `BUILD_VERSION`
5. `tests/manifest-config.test.ts` 的 expected version literal

`tests/components.test.tsx` 從 `BUILD_VERSION` 推導，並非第六個版本鎖。Build 後再核對 `output/chrome-mv3/manifest.json`。日常交接更新 README 與固定 shared context；AGENTS 只在模式契約改變時更新，`current-state.md` 保留歷史導引。

## Runtime QA

使用者可見 QA 只接受：目前 checkout 重建的 `output/chrome-mv3`、Jason 的 Chrome `Default` profile、真實 Threads 頁，以及實際 extension action／in-page launcher。核對 Chrome 真正載入的 unpacked path；reload extension 後亦 reload Threads tab。

直接開 `chrome-extension://…/sidepanel.html`、臨時或自動化 profile 只能診斷，不能冒充使用者驗收。Manifest／mtime 只能證明 build；操作流程、可見狀態、copy 全文及路由必須在真實入口驗證。若 runtime 與 source 不同，先查 built manifest、目標 bundle markers 及載入路徑。

`/health` 只判 API liveness；worker 工作結果必須對照 `/worker/status`、queue 與 result。回報分清 source tests、build、真實 Chrome、worker/runtime、產品使用結果；未驗證就保留未驗證。

## Design and UI changes

- 延續 tokens/intent 的設計責任。**One-in-one-out**：新增 surface、copy 或 dependency 時，必須移除相當份量的重複或過時內容，並在 commit 說明新增與移除；不要以字數當產品品質。
- Repo commit prefix 只使用 `bug fix` / `feature` / `removal` / `refactor`，描述實際行為；commit message 與文件標題不使用 `pass` / `polish` / `round` / `tune`。
- `src/ui/InPageCollectorApp.tsx` hard cap：400 lines；一頁同一契約欄位只顯示一次。
- Clickable element 必須揭示真實 derived data。尚無資料時不要加無作用的展示按鈕。
- Every animation keeps a `prefers-reduced-motion` guard。
- 視覺方向改變先用 dated mockup 讓使用者選擇；機械修正沿用已批准 tokens 與元件，不另開整套設計流程。Mockup 為 reference，實作值回到 tokens。

## Boundaries

Views 不擁有 messaging、storage、`Date.now`／`Math.random`／`performance.now` 或 chrome APIs。ViewModels 不擁有 chrome、fetch、DOM、File／Blob／FormData 或 React。副作用移到 controller／hook／app shell；不加 `TODO(boundary-bypass)`。Guards 必須維持零 allowlisted violations。

## Collaboration and scope

先核對實際 repo、HEAD、dirty state、worktree 與 unpacked path；保留無關 dirty/untracked 工作。派工有明確檔案 owner、契約與驗收，使用當次 harness 支援的 tools/model schema。外部個人 protocol 可補充操作，但不能覆蓋本 repo 契約，也不能硬套舊 Desktop 路徑、模型代號或權限假設。

合併或 push 到 main 必須有使用者明確授權；本次已取得的授權不需重複詢問。發布依當次既有使用者授權及工具權限；歷史 roadmap 不是永久授權。保持已批准 slice；發現額外需求先保存到決策索引，不能自行開始另一產品流程。
