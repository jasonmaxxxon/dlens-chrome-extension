# HANDOFF

## From machine
NewJeans-Comeback (NewJeans Comeback)

## Time (HKT)
2026-11-16 13:03:15 HKT

## Branch
`feature/blocks-v1`

## Note from Max
0.5.96-ink：閱讀頁換成 A 墨線質地加一點透明感（紙頂話題色淡光、入口列黏頂後變毛玻璃、選中扇區柔光），入口改用 UI SDK Tabs（方向鍵、滑動墨線、面板由選中方向進入），圖示沿用 lucide；gate 全綠 1292/0 fail，216 個版面狀態 0 出界；下一步：同步 combo 資料夾後真機 QA，睇淡光同黏頂毛玻璃，舊 capture 未接新閱讀頁

## Working tree at handoff (`git status --short`, 2 entries)
```
 M HANDOFF.md
?? docs/archive/HANDOFF.md.bak-20261116
```

## Last 5 commits (before this handoff)
- 694859f feature: ink-line reader texture with a little transparency and UI SDK tabs, version 0.5.96 (0.5.96-ink) (Your Name, 2026-11-16 13:00)
- 12e98ba handoff: 0.5.95 閱讀頁改成分頁式白底版面（概覽／分歧／做法／問題／連結／原文按內容出現，分歧兩個主張並排、留言全闊 14px，純統計開關，原文加話題篩選）；gate 全綠 1296/0 fail，216 個版面狀態 0 出界；下一步：同步 combo 資料夾後真機 QA，舊 capture 未接新閱讀頁 (Your Name, 2026-11-14 23:03)
- 57eb024 feature: version 0.5.95 (0.5.95-wheel) for the tabbed reader (Your Name, 2026-11-14 23:03)
- 24bc9c9 feature: tabbed white reader with a counted headline, one topic in focus and readable split sides (Your Name, 2026-11-14 23:01)
- 5fcf783 handoff: 0.5.94 已修緊湊輪圖與比例分母、移除重複數字及外圈，prompt v7 收緊做法與分歧；1289 tests、0 fail，已同步 Jason combo；下一步 reload、刷新 Threads、驗收 v7 真帖解讀 (Your Name, 2026-11-13 16:54)

## Next steps

- **目前版本：`0.5.96`／`0.5.96-ink`，分支 `feature/blocks-v1`；inline reading prompt 仍然係 v7。** 使用者喺三種質地 mockup（本機 `~/developer/dlens-ui-redesign-review/harness/fable/free/variant-b3.html`）揀咗 A 墨線，原話：「a，跟著加入一點透明感，你也可以到一些ui 動態/icon libary 找一些來enhance ux，如果是 vercel ui sdk 應該會有很大幫助」。
- **0.5.96 只換閱讀頁質地**（`src/ui/ReaderWheel.tsx`、`tokens.ts` 嘅 `panel.wheel`、`tokens-intent.md`；版面、資料規則、viewmodel 冇變）：
  - **墨線：** 冇底色軌道、實心色塊、卡中卡。入口／話題／原文篩選／綜合·純統計全部係文字，揀中嘅變深加一條線。分歧兩邊中間一條髮絲線，各自頂一條色線（藍／琥珀），揀中嗰邊色線拉滿、字變深；嗰邊嘅留言左邊有同色引線。輪變細環，中心數字放大。「由留言數同讚數計出」由 kicker 文字搬去 `title`（mockup A 冇呢行字）。
  - **透明感只喺三處：** ① 紙頂話題色淡光（sheet 自己嘅 background layer，`wheel.haze`）；② 入口列 sticky 喺 shell header 下面（`CollectionWorkspaceShell` 提供 `--dlens-sticky-top`），平時透明，黏頂後先變毛玻璃（`wheel.glass`；用 `container-type: scroll-state` 加 `@container scroll-state(stuck: top)`，唔支援嘅 Chrome 會一直係毛玻璃）；③ 選中扇區同色柔光（`wheel.glow`）。
  - **圖示：** 沿用已有嘅 `lucide-react`（讚、回覆、AI、展開、開原留言、箭嘴），冇加新 icon 庫。
  - **UI SDK（vercel-labs/ui）：** 佢係冇樣式嘅行為庫（鍵盤、焦點、ARIA），唔係動態或 icon 庫。今次只用咗 `@ui-sdk/react/tabs`（連 `@ui-sdk/core`，兩個都釘死 `0.1.0-beta.3`）取代手寫 tablist：方向鍵／Home／End 喺入口之間移動；`TabsIndicator` 量度選中入口，墨線滑過去；面板憑 `data-activation-direction` 由揀嗰邊滑入。話題 pills、原文篩選、分歧兩邊仲係 `aria-pressed` 按鈕。
  - **動態限制（改之前要知）：** `src/ui/motion.ts` 嘅 shell 規則用 `!important` 將側欄入面所有 transition 鎖死做 opacity＋transform、`panel.motion.base`、standard easing。所以喺閱讀頁寫 width／left／filter 嘅 transition 或者 spring easing 係唔會生效；今次全部只用位移同透明度。入口內嘅新選擇（話題、分歧邊、原文篩選）用 `@starting-style` 輕微上升；入口啱啱到嗰一格用 `data-wheel-arriving` 擋住，唔會同面板滑入疊埋一齊郁。
  - **一入一出：** 入：`@ui-sdk/react`、`@ui-sdk/core`、淡光／毛玻璃／柔光 tokens。出：灰色軌道加白色滑塊（兩條）、實心藍／米色主張卡、白卡入面嘅灰卡、輪心白碟同陰影、6px 讚數條、閱讀頁入面嘅 `PostTypeTag` 膠囊、手寫 tablist；tokens 刪咗 `hubRadius`、`barHeight`、`leadBar`。
- **測試：** `tests/reader-wheel-view.test.tsx` 加咗「entries are real tabs」；UI SDK 喺 jsdom 要 `pretendToBeVisual`、`MouseEvent`／`KeyboardEvent`／`getComputedStyle`／rAF 呢幾個 global 同一個 `getAnimations` stub（都喺該檔嘅 `mounted` 入面）。**版本鎖其實有第六處：** `tests/collection-workspace-shell.test.tsx` 嘅 `/DLens 0.5.96/`。
- **驗證：** full gate 全綠（1297 tests／1292 pass／5 skip／0 fail；typecheck、兩類邊界、storage seam、build、bundle guard、diff check）。`check-reader.mjs` 216 個狀態 0 出界（script 今次改咗兩處：輪圖改用 `[data-wheel-plot] svg` 搵，之前「第一個 svg」會揀中 icon，令輪圖出界檢查變成空過；輪心文字改同環嘅內徑比）。`harness/fable/probe-motion.mjs` 喺 headless Chrome 開住動態量到：墨線約 180ms 滑到位、面板由左或右入、黏頂後毛玻璃由 0 變 1、方向鍵／Home／End 都得；真滑鼠點擊唔會留焦點環（`probe-focus.mjs`）。截圖喺 `shots/reader-tabs/` 同 `shots/reader-ink/`。**未做真機 QA，未用真模型輸出驗證。**
- **體積：** side panel chunk 由 669,717 變 724,382 bytes（raw）；content script 冇變。`bundle:guard` 只量 content script。
- **NewJeans-Comeback 安裝未同步：** repo `output/chrome-mv3` 已經係 `0.5.96-ink`，Jason Chrome 載入嘅 `~/developer/dlens-combo-0.5.90/` 仲係舊版。要使用者自己跑：`rsync -ac --delete ~/developer/dlens-ui-redesign/output/chrome-mv3/ ~/developer/dlens-combo-0.5.90/`，然後喺 `chrome://extensions` reload、刷新 Threads、重開側欄。
- **下一步：** ① 真機睇 0.5.96：淡光會唔會太搶、入口列喺真側欄捲動時有冇黐住同變毛玻璃、窄側欄入口橫向捲動；② UI SDK 仲係 beta，升版前睇 changelog 再跑 `reader-wheel-view` 測試；③ 舊 capture（冇 blocks）接入新閱讀頁要先處理 `collection-browser.test.tsx`、`f123-qa-fixes.test.tsx`、`task-c-reading-ui.test.tsx` 對舊版嘅斷言；④ 「定位原帖」頁內跳轉同高亮未做。

- **以下係 0.5.95 嗰輪嘅記錄（質地已被 0.5.96 取代，版面同資料規則仍然有效）：**
- **版本 `0.5.95`／`0.5.95-wheel`，分支 `feature/blocks-v1`；inline reading prompt 仍然係 v7；實作 commit `24bc9c9`，版本 commit `57eb024`。** 使用者揀咗 Google Variant B 做視覺方向，睇完真資料版 mockup（B2）之後要求：唔要暖色要白色、分歧頁字太細要重諗、之後直接喺擴充功能做、唔可以再有 render 出界、其他類型嘅帖要用同一套邏輯。
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
