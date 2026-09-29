# DLens 收藏／工作區導航 — 0.4.3 交接

狀態：**2026-09-29 已依使用者要求恢復，完成實作、獨立 review、全套 gate 與主要真 Chrome 驗收，已更新原安裝。** 本檔沿用原暫停交接入口。

## 目前版本

- 分支：`codex/collect-recall-focus`；工作目錄：`~/developer/worktrees/dlens-v4-focus`。
- Source、full build、PR-only build、原安裝目錄及 Chrome 詳細頁均為 **0.4.3**。
- 原安裝目錄：`~/Downloads/dlens-v4-beta-0.4.1-chrome-mv3`；ID `cblkjhpcmfcgmdbbdgobpkpdbbgdkhfe` 保留。
- 本次僅本機 commit；未 merge/push main。

## 完成內容

- 收藏／工作區兩個主入口；全域收藏跨 session 唯讀投影，保留每一工作區關係；搜尋、縮圖及同面板全寬原文閱讀器。
- facade 保存 query、reader、工作區返回 context，以及列表／每篇 reader／session+route+topic 的捲動位置。popup 是唯一捲動 owner；圖片延遲載入以 ResizeObserver/load 還原，使用者操作即停止追舊位置。
- 工作區次要選單重新命名／刪除使用 explicit sessionId，刪除具名確認。pending/error 跨關閉重開保留，防止重送；失敗只顯示一個提示。
- Topic 無結果時不顯示空 Atlas；舊 Atlas、失敗資訊、重試保留。批量選帖移除重複提示與整段粗體。
- PR-only 只顯示 PR 工作區／用途／設定；清除舊 ModeRail 狀態。
- 翻譯工具列清理只作用於新 descriptor 與舊 snippet 顯示，不改寫 captured 原文或舊資料。

## 最終驗證

- root 全 suite：**1535 tests / 1530 pass / 5 既有 skip / 0 fail**。
- typecheck、View/VM boundary、storage seam、full build、PR-only build、diff check 全通過。
- 五處版本同步 0.4.3，沒有新增依賴或更新依賴版本。
- 獨立 review：278/278 相關 tests；PR-only settings 與管理 pending 兩個獨立 probe 各 1/1。兩項 P2 已修正，無剩餘確定 blocker。
- 原安裝13檔與 full build 的 SHA-256 一致；ZIP完整性通過。

## 真 Chrome 證據

Jason 原 Chrome 設定檔，真實 Threads 頁內 launcher；沒有把 sidepanel 當驗收。

- 更新前 Topic 12／Product 5；更新後17則原收藏與3個原工作區仍在。
- 工作區重新命名成功寫入後已恢復原名；刪除確認取消後資料保留。
- 作者搜尋、切 tab 返回保留 query；列表開原文再返回保留視覺位置。
- 長文及成功載入圖片的 reader：設定返回、關閉重開保留同篇及捲動位置，前後截圖已保存。
- 全域採集成功保存公開 `@brewbytes.ai` 帖文至 Archive，並返回原 Topic collect 頁／「2026 fg 搵工」主題，採集模式已關閉。
- 驗收新增 **Archive 工作區與1則公開測試收藏**；現在共18則，原Topic12／Product5不變。
- 舊Atlas已載入並保留，原有整合階段失敗與重試入口可見；本次未點擊生成。

## 證據、備份與下載

位於 `~/developer/reviews/dlens-0.4.3-2026-09-29/`：

- `verification.md`：完整結果與限制；`tests.log` 等最終gate logs。
- `independent-review.md`、`implementation-report.md`。
- `043-collection.png`、`043-workspaces.png`、`043-live-saved-reader.png`。
- `043-list-scrolled-{before,after}.png`、`043-image-reader-scroll-{before,after}.png`。
- `backup-chrome-mv3-0.4.2/`：更新前13檔程式備份，沒有直接讀写Chrome storage。
- `dlens-0.4.3-chrome-mv3.zip`、`installed-sha256.json`。

## 已知限制及下一項

1. 實機新存帖的 descriptor 末尾仍可能夾帶 Threads 的「No replies yet／Reply to …」文案。這是單帖 DOM 擷取邊界的後續修正，未改寫本次已保存內容。
2. 部分舊圖片CDN網址失效，fallback已驗證；新存帖圖片能載入。沒有替使用者全面重新抓取。
3. 現有Topic無未分流來源，批量選帖本次由自動化測試覆蓋，未新增議題作手動驗收。PR-only由實際variant DOM tests及production build驗證，未取代目前full安裝。
4. Scroll記憶限同一頁面的popup生命期；整個Threads或extension reload不保存位置。
5. 未授權 main merge/push；若進一步整合，先沿本分支review。

原計畫：`docs/superpowers/plans/2026-09-21-mockup-navigation.md`。原mockup：`~/developer/reviews/dlens-claude-review-2026-09-18/gallery.html`。
