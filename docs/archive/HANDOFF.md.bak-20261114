# HANDOFF

## From machine
NewJeans-Comeback (NewJeans Comeback)

## Time (HKT)
2026-11-13 16:54:12 HKT

## Branch
`feature/blocks-v1`

## Note from Max
0.5.94 已修緊湊輪圖與比例分母、移除重複數字及外圈，prompt v7 收緊做法與分歧；1289 tests、0 fail，已同步 Jason combo；下一步 reload、刷新 Threads、驗收 v7 真帖解讀

## Working tree at handoff (`git status --short`, 1 entries)
```
 M HANDOFF.md
```

## Last 5 commits (before this handoff)
- ba11ed5 bug fix: 釐清輪圖比例並收緊觀眾解讀規則 (Your Name, 2026-11-13 16:53)
- 7976709 handoff: 修正 Jason Chrome 實際載入路徑；既有 combo 原地同步 0.5.93 並比對一致；下一步：Jason 再按 DLens reload 確認版本及側欄，後續 build 須同步 combo (Your Name, 2026-11-13 16:16)
- a654524 handoff: 接手完成 0.5.93 wheel 驗證及統計補修；1279 tests、0 fail，build與守門全綠；下一步：Lam拉取 feature/blocks-v1、重建及真Chrome側欄QA，prompt v6湊欄位問題留待下一個slice (Your Name, 2026-11-13 16:09)
- d6cd2d0 bug fix: show wheel totals only when membership and likes are known (Your Name, 2026-11-13 16:09)
- 3cdf3e6 feature: version 0.5.93 (0.5.93-wheel) for the reworked wheel reader (Your Name, 2026-11-13 15:56)

## Next steps

- **目前版本：`0.5.94`／`0.5.94-wheel`，分支 `feature/blocks-v1`；inline reading prompt v7；實作 commit `ba11ed5`。** 使用者要求截圖中的圖表／數字／版面和 AI 歸納一起修正；這輪不是 Google mockup 的整套 UI 重做。
- **NewJeans-Comeback 實際安裝：** Jason（brandonproject.co）的 Chrome 使用 extension `kkneicpialmfdooklcjkbcabmkoogmad`，載入 `~/developer/dlens-combo-0.5.90/`。資料夾名稱保留舊版號。本機每次 build 後都必須同步 `rsync -ac --delete output/chrome-mv3/ ../dlens-combo-0.5.90/`，再在 Jason profile 對同一條目 reload。只更新 repo `output/chrome-mv3` 不會改 Chrome 正在載入的版本。不要用另一個 profile 或新增另一個 extension 條目作驗收。
- **本次安裝同步已完成：** 舊 combo 已備份至本機 `~/developer/dlens-ui-redesign-review/backup-combo-before-0594.eE9lRp/`；新 build 同步後 `diff -qr` 無差異，載入目錄 manifest 已是 `0.5.94-wheel`。仍須使用者在 Jason profile reload 擴充功能、刷新 Threads 並重開側欄；沒有代稱為真機 UI 或模型驗收。
- **圖表已改：** 輪圖限制最大寬度、保持中心文字實際字級；百分比只在中心一次顯示；移除與話題比例混淆的抓取覆蓋外圈及含糊的「讚92%」；圖例說清角度是分群留言佔比、長度是相對獲讚。抓取詳情仍由既有來源區交代。
- **數字已改：** `ReaderWheelModel.totals` 只在 `readClusterReadings` 證明整批成員／分母可比較時提供。原始讚數有缺值就不造整批讚數總和。可核實時用「11／13 則已讀留言 · 12／13 讚」交代分子與分母；不完整時只保留可核實的局部總數，不印假的完整分母。移除高低比例判語。「都有回覆」不等於問題已解決。
- **AI v7 已改：** gist 只寫有來源支持的整體反應，不逐一枚舉話題；群名依真樣本、中性概括，不把一則或異義群寫成一致批評；methods 必須是明確提出或實際執行的可照做行動，純提及節目／工具、感受或偏好不算；沒有就空陣列。分歧必須是同一問題的互斥立場，不能把親切與尷尬這類可共存感受當兩邊；agree 只寫共同前提，沒有留空。
- **新增 deterministic guards：** 同一代表留言不能製造兩邊；空白或格式等同的 claim 不形成分歧；find.method 只從保留的方法選取。格式比較保留 ASCII 符號（包括階乘 `n!`）與運算符，避免誤刪技術立場。JSON schema／舊 storage 格式保持相容。
- **驗證：** root full verify gate 及獨立覆核；最終 1,289 tests／1,284 pass／5 skip／0 fail，typecheck、兩類邊界、storage seam、build、bundle guard、diff check 全部通過；獨立 reviewer 的兩項修正測試亦通過。新增合成13則案例重現11/13=85%、12/13=92%，保護未知總數、真零讚、同作者不同留言、x>0/x<0、n!/n 等邊界。未呼叫付費模型，沒有執行會打 live pipeline 的 `qa:harness:fixture`。
- **視覺範圍：** 本機 headless Chrome 合成重現於320／360／400／600px；既有 capture JSON＋示意 AI reading 在360／400px檢查話題／分歧／做法／資源頁。中心文字維持原字級，無溢出／重複留言；滑鼠無矩形框，Tab／Enter仍可選話題。合成預覽 `~/developer/dlens-ui-redesign-review/concepts/wheel-fix-0594.html`，截圖 `shots/wheel-fix-0594/`，原始 capture harness `harness/fable/`；這些是本機參考，未進 git，也不是實際安裝側欄或真模型品質驗收。
- **下一步：** 在 Jason Chrome reload `0.5.94-wheel`，刷新原 Threads 頁並重開側欄，核對截圖同一帖子；v6 reading 將依既有 freshness/hash 流程過期，開帖時生成 v7 reading 會使用既有 provider/API 額度。重點驗收舊「批評代理商hea」等群名是否真能概括原句、沒有明確方法時做法入口消失、可共存感受不再造分歧。Prompt＋parser guards 不能保證所有語意正確，仍須看真模型輸出與來源。
- **另一部 Mac 接手：** `git fetch origin refs/heads/feature/blocks-v1:refs/remotes/origin/feature/blocks-v1`，再 `handoff --pull feature/blocks-v1`、`npm run build`；目標機用其既有 Chrome 條目載入路徑做同步，不要假定與 NewJeans 的 combo 路徑相同。真機 QA 必須在真 Threads 頁從 extension action 或收藏卡開 side panel，直接開 extension HTML 不算驗收。
- **既有設計取捨／未擴範圍：** gist 沒有獨立引用導航；舊分析沒有 blocks 仍用舊四格；原帖高度／收藏列表細輪／Google 全套版面另做。幾何本身85%扇區正常，本輪不重寫未觸發的pad=0全環或零share邊界。
- **Verify gate：** `npm run typecheck && npm run boundary:guard && npm run storage:seam-guard && npx tsx --test tests/*.test.ts tests/*.test.tsx && npm run build && npm run bundle:guard && git diff --check`。保留所有使用者資料，不移除 extension、不修改 Chrome profile 設定或讀取金鑰。
