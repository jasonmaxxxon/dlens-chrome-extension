# HANDOFF

## From machine
NewJeans-Comeback (NewJeans Comeback)

## Time (HKT)
2026-11-14 23:03:41 HKT

## Branch
`feature/blocks-v1`

## Note from Max
0.5.95 閱讀頁改成分頁式白底版面（概覽／分歧／做法／問題／連結／原文按內容出現，分歧兩個主張並排、留言全闊 14px，純統計開關，原文加話題篩選）；gate 全綠 1296/0 fail，216 個版面狀態 0 出界；下一步：同步 combo 資料夾後真機 QA，舊 capture 未接新閱讀頁

## Working tree at handoff (`git status --short`, 2 entries)
```
 M HANDOFF.md
?? docs/archive/HANDOFF.md.bak-20261114
```

## Last 5 commits (before this handoff)
- 57eb024 feature: version 0.5.95 (0.5.95-wheel) for the tabbed reader (Your Name, 2026-11-14 23:03)
- 24bc9c9 feature: tabbed white reader with a counted headline, one topic in focus and readable split sides (Your Name, 2026-11-14 23:01)
- 5fcf783 handoff: 0.5.94 已修緊湊輪圖與比例分母、移除重複數字及外圈，prompt v7 收緊做法與分歧；1289 tests、0 fail，已同步 Jason combo；下一步 reload、刷新 Threads、驗收 v7 真帖解讀 (Your Name, 2026-11-13 16:54)
- ba11ed5 bug fix: 釐清輪圖比例並收緊觀眾解讀規則 (Your Name, 2026-11-13 16:53)
- 7976709 handoff: 修正 Jason Chrome 實際載入路徑；既有 combo 原地同步 0.5.93 並比對一致；下一步：Jason 再按 DLens reload 確認版本及側欄，後續 build 須同步 combo (Your Name, 2026-11-13 16:16)

## Next steps

- **目前版本：`0.5.95`／`0.5.95-wheel`，分支 `feature/blocks-v1`；inline reading prompt 仍然係 v7；實作 commit `24bc9c9`，版本 commit `57eb024`。** 使用者揀咗 Google Variant B 做視覺方向，睇完真資料版 mockup（B2）之後要求：唔要暖色要白色、分歧頁字太細要重諗、之後直接喺擴充功能做、唔可以再有 render 出界、其他類型嘅帖要用同一套邏輯。
- **0.5.95 閱讀頁（有 blocks 嘅 capture）：** `src/ui/ReaderWheel.tsx` 整個重寫做分頁式白底版面，`src/viewmodel/reader-wheel.ts` 加咗 `readerTabs`、`withoutAi`、`readerOverview`、`readerRaw`，刪咗 `observationRefs`、`dotsBySector`、`dotSides`、`wheelSelection`。
  - 成個閱讀放喺一張白底紙上；入口係分頁：概覽 → 有內容先出現嘅 分歧／做法／問題／連結 → 原文。帖子類型決定邊個入口排第一（求助帖開問題，資源帖開連結或做法），其餘開概覽。
  - 概覽：一句由數字計出嘅標題（高讚 ≠ 多數／集中一個話題／冇分話題）→ AI 一句總結（標 AI）→ 輪 → 話題 pills → 一張選中話題嘅卡。獲讚百分比只喺讚數總數可核實（`model.totals.likes` 同 `sector.likeTotal` 都有）先寫入標題；輪中心永遠只讀留言佔比。卡底「睇晒呢個話題」會開原文並保留該話題篩選。
  - 分歧：兩個主張並排成兩張有色卡（藍／琥珀，15px 粗體，理由 14px），揀中一邊，嗰邊嘅留言喺下面用成個闊度、14px 顯示。留言唔再塞入窄欄。
  - 純統計開關：收起 AI 總結、話題名、分歧、做法；冇 AI 字句就冇呢個開關。
  - 原文：全部／各話題／作者回應／留名／連結 篩選。長留言（超過 `wheel.clampChars` 或者行數）先收起，可以原地「展開全文」。
  - blocks 全部被略去（`mode === "empty"`）嘅帖而家都會用呢個閱讀頁（話題同原文仲喺度），唔再只得一句提示。**冇 blocks 嘅舊 capture 仍然用舊四格閱讀**（四個測試檔釘住舊版，今次冇郁）。
  - 用呢個閱讀頁時，頂部原帖只顯示兩行，全文同圖片要㩒「全文」先出（`CollectionBrowser.tsx` 嘅 `compactSource`）。
  - 配色用返現有冷白 tokens，冇加暖色；分歧兩邊用 `accent`／`warning` 兩組現有色。「深入解讀」卡留喺原位，冇做固定底欄，亦冇追問助手。
- **出界防護（三層）：** ① `tests/reader-wheel.test.ts`「no sector can leave the drawing」：最大半徑＋向外移＋描邊都喺 viewBox 內；② `tests/reader-wheel-view.test.tsx`「nothing in the reader can push past its box」：單行文字只可以喺可橫向捲動嘅 strip（`data-scroll-x`）或者 `data-bounded` 入面；③ 本機 headless Chrome：`~/developer/dlens-ui-redesign-review/harness/fable/check-reader.mjs`（要 4179 server；先跑 `build-wheel.mjs`）用真 capture 同特登整爆版面嘅假帖，36 個狀態 × 300／320／360／400／480／600px 共 216 個，0 個出界、0 個重複留言、最細字 11px。截圖喺 `shots/reader-tabs/`。改閱讀頁版面之後要再跑呢個 script。
- **驗證：** full gate 全綠（1296 tests／1291 pass／5 skip／0 fail；typecheck、兩類邊界、storage seam、build、bundle guard、diff check）。**未做真機 QA，未用真模型輸出驗證**：harness 入面帖 A 嘅 AI 字句係示範。
- **NewJeans-Comeback 安裝未同步：** repo `output/chrome-mv3` 已經係 `0.5.95-wheel`，但 Jason Chrome 載入嘅 `~/developer/dlens-combo-0.5.90/` 仲係 0.5.94。要使用者自己跑：`rsync -ac --delete ~/developer/dlens-ui-redesign/output/chrome-mv3/ ~/developer/dlens-combo-0.5.90/`，然後喺 `chrome://extensions` reload、刷新 Threads、重開側欄。
- **下一步：** ① 真機睇 0.5.95：討論帖、求助帖、資源帖各一篇，特別睇分歧頁同窄側欄；② 睇真模型 v7 嘅話題名（6 字內）喺 pills 入面嘅樣；③ 舊 capture（冇 blocks）接入新閱讀頁要先處理 `collection-browser.test.tsx`、`f123-qa-fixes.test.tsx`、`task-c-reading-ui.test.tsx` 對舊版嘅斷言；④ 「定位原帖」頁內跳轉同高亮未做，而家係開返留言連結。
- 設計參考（本機，唔喺 git）：Google 原 mockup `~/developer/dlens-ui-redesign-review/concepts/2026-11-14-google-variant-b-sidebar.html`；真資料版 B2 `harness/fable/free/variant-b2.html`。

- **以下係 0.5.94 嗰輪嘅記錄（由另一個 agent 寫）：**
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
