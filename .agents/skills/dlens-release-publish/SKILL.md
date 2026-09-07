---
name: dlens-release-publish
description: 準備或發布 DLens 使用者可見版本，核對版本鎖、驗收、交接文件與目標 Git branch。適用明確 release／push 請求；一般編輯或只讀審查不授權發布。
---

# DLens Release Publish

以當次 checkout 的 `git rev-parse --show-toplevel` 為根。先查 branch、HEAD、remote 與 dirty state，確認要求的 release 範圍及既有授權；保留無關修改，不從歷史 roadmap 推導發布權限。

## 權威入口

- [CLAUDE Version lock](../../../CLAUDE.md#version-lock)：五處 source version lock 及 built manifest 核對；`tests/components.test.tsx` 從 `BUILD_VERSION` 推導，不是第六鎖。
- [CLAUDE Verify gate](../../../CLAUDE.md#verify-gate)：完整 gate，直接依該段執行；不在 skill 維護刪減版。
- [CLAUDE Runtime QA](../../../CLAUDE.md#runtime-qa)：Jason Default＋真實 Threads＋實際 action／launcher，並核對 unpacked path、reload extension／Threads。Manifest／mtime 是 build 證據，不能稱為 visible QA。
- [AGENTS](../../../AGENTS.md)：模式契約；[shared context](../../../docs/memory/latest-shared-context.md)：目前進度與未驗證邊界。

## 發布流程

1. 按 Version lock 同步 intended version，更新 [README](../../../README.md) 與固定 shared context。AGENTS 僅在負重契約改變時修改；不再更新歷史 `current-state.md`，不追加重複發布日記。
2. 執行完整 gate；核對 `output/chrome-mv3/manifest.json` 與 source version、所需 bundle markers。需要真實 UI 的發布按 Runtime QA 驗收；未做的部分明記未驗證。
3. 只對使用者要求的 branch 執行已授權 push／merge；先確認 remote 當前 ref 與 fast-forward 關係，不以 force-push 消除衝突。只讀 review 到此仍然只讀。
4. 發布後核對 remote ref，回報實際 commit／branch／version。分清本機準備完成、build 完成、已 push、main 已更新與真實 Chrome 驗收；不能把其中一項當全部成功。

遇到 gate 失敗、版本不同步、remote 衝突或權限未涵蓋的發布動作，保留具體證據並處理授權範圍內的問題。未達成的條件保留為未完成，不把「已列出失敗」當成 release 已完成。
