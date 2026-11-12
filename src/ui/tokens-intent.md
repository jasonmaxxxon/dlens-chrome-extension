# tokens-intent.md — 設計值的用途

這份文件只說明意圖。所有設計值由 `src/ui/tokens.ts` 擁有；代碼與現行介面優先。
更新時替換過時內容，不累積另一套設計規格。Mockups 只作參考。

## 閱讀優先

DLens 以收藏與工作區進入閱讀。來源、原文與圖片先行，分析與診斷逐層展開。
Threads 頁面只保留每帖收藏按鈕、輪盤與帖下卡，工作區由 Chrome 側欄承載。
已退役的浮動工作區、Atlas、Compare 與舊 Product 頁面不保留專用設計值。

## 側欄地面與文字

- `tokens.panel` 取代側欄原有的玻璃、淡霧與紋理。這是側欄系統的替換；
  共享的 Threads 輪盤與帖下卡保留原有設計值與行為。
- `tokens.panel.bg` 是安靜的冷灰地面，`tokens.panel.surface` 以白色磚塊承載內容，
  `tokens.panel.surfaceSubtle` 與 `tokens.panel.surfaceSunken` 區分工具與內嵌資訊。
- `tokens.panel.ink`、`tokens.panel.ink2`、`tokens.panel.ink3` 依序承載正文、補充與中繼資料；
  `tokens.panel.ink4` 只用於裝飾、placeholder 與停用外觀，不承載必要資訊。
- `tokens.panel.accent` 表示連結、選取與主要操作；工作區身份只保留 `getModeTheme` 的小標記。
- `tokens.panel.success`、`tokens.panel.warning`、`tokens.panel.danger`、`tokens.panel.running`
  對應真實狀態，必須搭配文字，不能只靠顏色表達。
- `tokens.panel.focusRing` 只在鍵盤焦點顯示，和 hover、選取、工作狀態分開。

## 字體與層級

- 側欄沿用 `font.sans`，以 `tokens.panel.type` 統一標題、正文、輔助與中繼資料階層。
- 數字以表格數字對齊；相鄰層級用重量與節奏區分，不引入裝飾性大字或英文大寫標籤。
- 文案以繁體中文與廣東話為主，英文只承載實際名稱、識別碼與來源內容。
- Threads 頁面已有的字體與版面尺度不隨側欄替換而改動。

## 卡片與間距

- `tokens.panel.space` 擁有容器與內容節奏；子項不各自疊加外距。
- `tokens.panel.radius` 區分控制、內容卡與浮層；`tokens.panel.shadow` 表示實際層級。
- 收藏列以作者、原文、閱讀摘要與真實狀態呈現；缺圖時顯示作者 handle 的字首。
  閱讀摘要只佔一個欄位，最近讀完列表只交代作者與時間。
- 收藏篩選與閱讀頁話題 chips 保持單行橫向瀏覽；可捲動時用 `tokens.panel.scrollMask` 提示後續內容。
- 引用留言維持 Threads 小卡形狀，DLens 自己的歸納寫在卡外；群組用來源色標聯繫原句與比例。
- 閱讀區塊先給一個答案磚：一句主句，加第一個有內容的區塊。其後每個展開的區塊各佔一磚，
  內容單薄的區塊（沒有人回答的提問、只被提過一次的連結）收成一行，標記類留言只留一行數字。
- 閱讀區塊只用三層文字：主句、留言與名稱、安靜的中繼資料。同一則留言只出現一次；
  作者 handle 就是回到原留言的連結，不另設重複的文字連結。區塊小標沿用 `tokens.panel.blocks.label`。
- `畫面上` 條以穩定地面橫跨整個面板，內容不可透出。
- 深入解讀與話題解讀保持緊密入口、安靜出處與可展開詳情。

## 動態與工作回饋

- `tokens.panel.motion` 只確認操作、切換與真實進度；側欄以透明度和位移維持穩定閱讀。
- `tokens.panel.list.card` 讓原文標題、摘要與狀態共用穩定行框；骨架沿用相同幾何，不以高度動畫移動列表。
- 側欄的群組色（比例條、色點、引文色條、收藏摘要色標）統一用 `tokens.panel.data`，未歸入任何群組的部分用 `tokens.panel.dataRest`；
  沒有群組時不造色標。Threads 帖下卡保留 `tokens.collectCard.clusterColors`。
- 頁籤底線與排序滑塊延續既有移動關係，浮層從觸發點附近輕微進入。
- 輪盤保留接受過的手勢、彈性、充能與落點序列；帖下卡保留既有結果到達回饋。
- 抓取等待只顯示估計時間；超時以文字說明，不承諾後端完成時間。
- 所有 keyframes 由 `src/ui/motion.ts` 統一擁有。
  `prefers-reduced-motion` 停止非必要移動，工作狀態仍由靜態符號與文字可讀。

## AI 與證據

- PR AttentionBeam 只標示正在處理或可操作的按鈕；搜尋 orb 與工作提示在減少動態時保持靜態。
- 深入解讀只由使用者要求執行。先顯示背景與理解，再逐層展開術語、分歧與證據。
- 觀眾反應由話題列表進入；話題解讀逐點連到來源，研究問題可即場修改。
  非 AI 發現明確標示來源為固定模板與計數。
- 帖下卡交接側欄閱讀，完整證據只在閱讀頁顯示。留言組各自展開，避免重複資訊。
- AI 文字來自使用者自己的 key；做法與分歧必須有真實留言引用。
  比例沿用後端數字，垃圾與離題群組安靜地排在後面。
- Settings 先顯示 AI，每次只設定一個 provider，各組在原位儲存。

## 拒絕清單

- 無來源的 KPI、大數字與進度表演。
- 展開後只重述已顯示內容的標籤與按鈕。
- 側欄替換範圍以外的第二套調色盤、字體與尺度，或 view 自行添加設計值。
- 高飽和度狀態警報、英文 placeholder 與無限背景動畫。
- 無明確層級用途的模糊、透明度疊加、普通列光暈。
- 重新引入已移除頁面的浮動定位、固定 popup 高度與專用 aura。

## 修改方式

先追查現行使用者與最近已交付的介面，再決定是否需要保留 token。
缺少設計值時先加到 `src/ui/tokens.ts`；用途不明確時才補充本文件。
新的視覺方向仍先以 mockup 確立，再落實到唯一設計值來源。
