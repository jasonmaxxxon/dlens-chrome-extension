---
name: dlens-extension-qa
description: 驗證 DLens extension 的 Topic、Product、PR、收集、storage 或 UI 變更，整理 source、build 與真實 Chrome 的驗收證據。只讀審查時不修改產品或發布。
---

# DLens Extension QA

從當次 checkout 的 `git rev-parse --show-toplevel` 解析 repo 根，先核對 branch／HEAD／dirty state。保留無關修改，不沿用固定 Desktop 路徑或前次 build。

## 契約入口

- [CLAUDE.md](../../../CLAUDE.md#verify-gate) 是**完整 gate** owner，包含 boundary、storage seam、migration fixtures、full tests、build、bundle、QA trace fixture 與 diff check；直接讀該段執行，不維護第二份 command 清單。
- [Version lock](../../../CLAUDE.md#version-lock) 定義五處版本鎖；build manifest 另行核對。
- [Runtime QA](../../../CLAUDE.md#runtime-qa) 定義 Jason Default、真實 Threads 與實際 extension action／in-page launcher 的驗收。Source、manifest 或歷史 fixture 通過都不能代替它。
- [AGENTS Mode contracts](../../../AGENTS.md#mode-contracts-current-history-and-rationale-in-the-archive) 是 Topic／Product／PR 有效契約；[架構地圖](../../../docs/architecture/dlens-current-architecture-map.md) 提供 owner/test。只讀本次涉及的模式與路徑。

## 執行與回報

1. 根據改動 trace 真正的 route、display、storage 及 message 路徑，選既有 targeted tests。不要只憑 types／路由 enum 判定 UI 可達；不要從 historical plans 恢復舊流程。
2. 依 CLAUDE 的 gate 與本次授權驗證；純文件工作可用該段限定的 docs/links/fixture 檢查，產品發布整合仍跑完整 gate。
3. 需要可見 QA 時，核對真正載入的 unpacked path 與新 build，reload extension 和 Threads tab，再操作實際入口。直接 sidepanel URL、臨時／自動化 profile 只作診斷。
4. 回報 revision、實際指令、artifact 路徑、結果及未測範圍。分列 source tests、build、真實 Chrome、worker/runtime 與產品使用結果。`/health` 只代表 process 存活；沒有 queue/result 證據不能說 worker 正常。

沒有真實 UI 或外部環境時，完成可做的 source 檢查並保留「未驗證」，不生成假的 runtime 成功記錄。Skill 被發現／載入與流程真正執行是不同證據。
