# DLens Chrome Extension

DLens 是 MV3 Chrome extension，將手動收集的 Threads 內容整理成議題研究、Product 判讀與 PR 證據。資料夾、已存內容、判讀及使用者 API keys 保存在本機 extension storage；選用的私人 ingest backend 負責爬取與 canonical read models。

> 文件核對：2026-09-07，工作版本 `0.3.62`，分支 `codex/review-foundation`，起點 `c43e93e`／`0.3.60`；尚未合併／發布。完整九項工程 gate 通過（1,460 pass／5 skip），built manifest 同為 `0.3.62`；Jason 真實 Chrome 載入與操作仍未驗證。
> 過往發布與驗收敘述已[完整保存](docs/archive/2026-09-07-authority-consolidation/README.md)，不是本次 runtime 證據。
> Chrome Load unpacked 路徑：目前 checkout 的 `output/chrome-mv3`。

## 功能與限制

| 模式 | 用途 | 目前邊界 |
|---|---|---|
| Archive | 儲存與整理 Threads 原文 | 本機資料，capture 完整度受頁面及 backend 影響 |
| Topic | 訊號分流、Compare、Topic Audit／Atlas 與來源閱讀 | 保留上次 Atlas；來源更新後由使用者決定重新生成 |
| Product | 以 ProductContext 分析訊號，閱讀判斷並匯出 Agent brief／Signal Packet | Saved Signals 負責收件；Action 負責判讀與匯出 |
| PR Evidence | 手動收集 campaign 證據、六準則匹配、Narrative 與 CSV | 只讀已收集素材，不承諾全網 coverage、reach 或時間趨勢 |

ProductSignalAnalyzer v21 在首次分析同一個 model call 產生判斷 axes 與完整 `product_reading`；Action 顯示同一份持久化判讀及可複製 Agent brief。`try / noise / insufficient / watch` 為互斥導覽，non-noise `park` 歸 watch；whole-folder packet export 由 Action 擁有。完整模式契約見 [AGENTS.md](AGENTS.md#mode-contracts-current-history-and-rationale-in-the-archive)。

模型只能引用已捕獲文字。文字提到影片、網站或 repo 不代表已讀取其內容；舊版或 provenance 不符的 reading 不能冒充 current reading。店舖／服務業的獨立 context intake、手動唯讀 agent 查證流程仍是[未完成需求](docs/architecture/product-decision-index.md)，不是已交付能力。

本批修正：卡片、brief 與 packet 共用完整 current reading identity；brief 保留完整判讀、限制與來源。0.3.62 將完整判讀置頂、背景資料收合，狀態列改為單行摘要與可展開操作；排版待真實 Chrome 複驗。工作狀態分開 API 連線、worker 可觀察性、本機 AI 與資料刷新；查詢失敗不再冒充 idle。細節與未驗證範圍見[固定 shared context](docs/memory/latest-shared-context.md)。

Extension 不直接連 Supabase，也不把使用者 LLM keys 傳給 backend。`/health` 只表示 API process 存活；worker 工作狀態要看 `/worker/status` 及 queue/result。模型金鑰不是本機收集功能的前置條件。

## 本機啟動

在本 repo 根目錄執行：

```bash
npm ci
npm run build
```

在 Chrome extensions 頁啟用 Developer mode，Load unpacked 選擇本 checkout 的 `output/chrome-mv3`，再於真實 Threads 頁透過 extension action 或 in-page launcher 開啟 DLens。重新 build 後需要 reload extension 及既有 Threads tab。

需要爬取功能時，按私人 `dlens-ingest-core` checkout 的 `SETUP.md` 啟動 backend，Settings 的 `ingestBaseUrl` 預設為 `http://127.0.0.1:8000`。開發工具可由相鄰 `../dlens-ingest-core` 或 `DLENS_INGEST_CORE_DIR` 找到 backend；extension runtime 只使用 Settings URL。

另一台 Mac 的預備 kit 與安裝步驟見[第二台 Mac SOP](docs/setup/second-mac-30-minute-install.md)。30 分鐘是 owner 完成預備工作的估計，文件更新不代表新機安裝已實測。

## 驗證與接手入口

- [CLAUDE.md](CLAUDE.md)：流程 owner；完整 verify gate、五處版本鎖、工作邊界與 Jason Default 真實 Chrome 驗收。
- [AGENTS.md](AGENTS.md)：產品模式與證據契約 owner；只在契約改變時更新。
- [架構地圖](docs/architecture/dlens-current-architecture-map.md)：資料流、程式 owner、test/guard 與未驗證邊界。
- [固定 shared context](docs/memory/latest-shared-context.md)：最近交付、工作狀態與接手待辦。
- [決策與歷史索引](docs/architecture/product-decision-index.md)：有效決策、部分取代機制與未完成需求。
- [Code review checklist](docs/CODE_REVIEW.md)：按修改路徑使用的工程檢查。

歷史 TRACE fixture 留在原路徑供 CI 重播；通過 fixture 不表示今天 Chrome／backend／LLM 已驗證。每次回報分列 source tests、build、真實 Chrome、worker/runtime 與產品使用結果。
