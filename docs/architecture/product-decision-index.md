# DLens 決策與未完成需求索引

2026-09-07 整理，baseline `c43e93e`／`0.3.60`。此檔索引決策狀態，不自稱 runtime 證明或自動執行 backlog。有效產品契約由 [AGENTS.md](../../AGENTS.md) 維護。

## 有效決策與部分取代

| 決策／材料 | 狀態 | 保留與取代的範圍 |
|---|---|---|
| [Product reading unification](../superpowers/specs/2026-07-23-product-reading-unification-design.md) | selected；v21 已有實作 | 首次完整 reading、同次 call、atomic publication；使用根契約判定現行行為，舊 plan checkbox 不是未完成證據 |
| [Product verdict v20](../superpowers/specs/2026-07-23-product-verdict-policy-v20-design.md) | selected／partially superseded | axes-derived verdict 與 non-noise park→watch 保留；proposal／watch-guidance 的 output/UI 由 v21 reading 取代 |
| [7/20 verdict intake](../superpowers/specs/2026-07-20-product-action-verdict-intake-design.md) | partially superseded | Saved intake 與 Action 匯出 owner 保留；全部 park→noise、selected-brief shelf、第二次 reading 已取代 |
| [7/23 attention surface](../superpowers/specs/2026-07-23-product-attention-surface-fix-design.md) | partially superseded | 整張有效 surface 擁有一個 beam 保留；recommendation-card／deep-reading 的雙層呈現由完整 reading 取代 |
| [7/17 Topic session envelope](../superpowers/specs/2026-07-17-topic-session-envelope-resilience-design.md) | partially superseded | session／lease／reconcile 設計保留；強制 Google `responseJsonSchema` 分支被 `0.3.51` schema-free transport 取代 |
| [4/4 evidence-first plan](../product/2026-04-04-two-page-product-plan.md) | reference | 保留 evidence-first、避免 fake precision 的意圖；two-page 配置不是現在產品路由上限 |
| [Topic F reader design](../superpowers/specs/2026-07-29-topic-f-compass-reply-group-reader-design.md) | reference／selected design scope | 已選設計與 bounded preview 不等於全 reader、external context 或 cross-episode 功能已交付 |
| [PR Evidence V1 brief](../handoff/2026-05-06-pr-evidence-mode-v1-brief.md) | reference for Evidence lens | 六準則／CSV 工作保留；後來新增的 current-only Narrative 另由根契約維護 |

## 不讓重構吞掉的未完成需求

下列內容由 2026-09-07 審查記錄 `reviews/dlens-2026-09-07/documents.md` 的「願景重建」保存。該審查包含主 checkout 未追蹤的願景稿與過往使用者討論；本批沒有移動、刪除或默認納入那些原稿，也沒有把歷史意圖當新實作授權。

- **店舖／服務業 ProductContext — proposed，未完成。** Product 可以是一門生意，不必是一個 repo；需要 business-neutral context intake。既有 README／AGENTS／一般文字 import 可載入部分資訊，但不等於完整 shop/service 專用入口。原需求與舊 v19 三段 proposal 分開保留，不能因 proposal 被淘汰就刪除此需求。
- **手動唯讀 agent 查證 — selected direction，完整流程未驗證。** 先在 extension 做便宜 triage，挑選 try/watch，手動交給 Codex／Claude 讀 actual repo 或業務資料並下互斥 verdict；另行取得授權才實作。先跑通手動 loop，再評估 bridge；目前有 brief/export 不表示 agent adjudication 或 bridge 已交付。
- **逐項 claim 的證據強度 — proposed／reference。** 區分單則案例、同 thread 對話張力及跨獨立 thread／author 重現；每 claim 顯示自己使用的 threads/replies/authors，不借群組總數放大支持。後續需定義可驗收呈現，不能先聲稱每個既有 reading 都已達標。
- **外部 context 與連續 episode 閱讀 — reference。** 外部來源類型、採納及 evidence identity 仍需明確設計；既有 episode 儲存不等於完整 Episode Explorer 或可靠的 cross-episode claim delta。
- **多平台 inbox、Weekly Intelligence Brief、topic auto-suggestion — deferred。** 只保留方向，沒有本批啟動授權。

原主 checkout 的 `2026-07-22-product-action-current-page-truth-design.md` 與 related universal-context/useful-suggestions 草稿只作歷史來源名稱。ambient current-post scoping、v19 proposals 或第二次 deep-reading 機制不可重啟；本 repo 可追蹤的有效 owner/test 見[架構地圖](dlens-current-architecture-map.md)。

## 歷史保存

本次被精簡的 README、CLAUDE、AGENTS、current-state、shared context、架構圖、安裝 SOP 及兩個 repo skills 全文存於 [2026-09-07 快照目錄](../archive/2026-09-07-authority-consolidation/index.md)。快照內原有相對連結按原位置解讀；不要把快照當 active instructions。一般接手只讀固定 shared context，需要歷史理由才查 archive。
