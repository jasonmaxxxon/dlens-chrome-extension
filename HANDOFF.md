# HANDOFF

## From machine
NewJeans-Comeback (NewJeans Comeback)

## Time (HKT)
2026-11-12 17:34:31 HKT

## Branch
`feature/blocks-v1`

## Note from Max
閱讀頁按真資料重排（答案磚、單薄區塊收一行、留言只出一次）並換 dir-C 冷色，gate 全綠 1275/0 fail；下一步：真機 QA、原帖頂部同收藏列表重排

## Working tree at handoff (`git status --short`, 1 entries)
```
 M HANDOFF.md
```

## Last 5 commits (before this handoff)
- d216ac3 feature: calmer blocks reader with one answer tile and cool panel palette (Your Name, 2026-11-12 17:34)
- f559dad fix: no repeated summary quote in tools, hide zero reply counts (Your Name, 2026-11-12 10:31)
- 07ef081 fix: keep top comments and suppress duplicate quotes inside tools (Your Name, 2026-11-11 18:02)
- 22fad7f feature: reading-first blocks reader with blocks revision 2 fields (Your Name, 2026-11-11 17:37)
- da896b1 handoff: blocks-v1 資料層同合約對齊完成（含 #83-#86 同側欄 phase 0-5），gate 全綠 1233/0 fail；閱讀頁視覺被否決，下一步按 HANDOFF 用 dir-C reading-first 重做並做真機 QA (Your Name, 2026-11-11 16:02)

## Next steps

- 2026-11-12：閱讀頁（blocks 模式）已重排並換 dir-C 冷色 token，gate 全綠（1275 tests / 1270 pass / 5 skip / 0 fail）。未做真機 QA：Max 要 reload 呢個分支嘅 `output/chrome-mv3` 睇 `@dafake_phoenix` 同 `@good_job_ai` 兩篇。
- 今次規則（`src/ui/AnalysisBlocks.tsx`、`src/viewmodel/analysis-blocks.ts`）：
  - 答案磚＝一句主句＋第一個展開區塊；其餘展開區塊各一磚；單薄區塊收成一行（`blockOpensFirst`：冇人答嘅提問、得一個連結得一人提）。次序同 priority 冇改。
  - 後端 label 如果係留言開頭（`label_source: representative_comment` 而且留言以 label 開頭），唔再當標題，改顯示「約 N 則類似留言」＋該留言一次（`quoteLabel`）。
  - 來源連結＝作者 handle（`aria-label`「睇原留言 @x」），冇再逐行「睇原留言 ↗」；0 讚唔顯示；第二句 lead（sub）唔再畫。
  - 留名類留言（舊稱「標記」）只係一行數字，唔可以展開。
- 未做（下一步，按次序）：
  - 閱讀頁頂部原帖區（`src/ui/CollectionBrowser.tsx`）仲佔約 300px：作者行同互動數合併、短文唔出「全文」。`tests/collection-browser.test.tsx:363` 釘住 6 行 clamp 同「全文」掣，要一齊改。
  - 收藏列表卡同頂欄未重排，只係跟 token 轉咗色；`list_summary` 未接（要 Max 批，受保護 function 輸出唔可以變）。
  - 深入解讀卡、話題 chips、詳情未動。
  - 真資料：呢部機讀唔到 lam 嘅 DB／API（Claude Code 權限擋咗 production read），今次只用 Max 三張真機截圖做 fixture（review 目錄 `harness/fable/real-fixture.ts`）。要真 `GET /captures/{id}` JSON 先可以核對 53 則熱門留言、label 等真實形狀。
- 截圖：`~/developer/dlens-ui-redesign-review/shots/fable/v2/`（26 張，400＋360；全部冇溢出、冇 raw enum、冇 token 外洩）。重影：`node ~/developer/dlens-ui-redesign-review/harness/fable/build.mjs && node ~/developer/dlens-ui-redesign-review/harness/fable/shoot.mjs <phase> <screens>`（要 4179 server 開住）。
- 需要後端（另一條線）：帖子類型手動更正 API；label 而家係留言頭 24 字，唔係名。前端唔好自己發明欄位。
- Verify gate（全部要綠）：`npm run typecheck && npm run boundary:guard && npm run storage:seam-guard && npx tsx --test tests/*.test.ts tests/*.test.tsx && npm run build && npm run bundle:guard && git diff --check`。
- 永遠唔好跑 `npm run qa:harness:fixture`（會打 live pipeline）。
- 規格、截圖、mockup、交接包喺 NewJeans-Comeback 本機 `~/developer/dlens-ui-redesign-review/`（唔喺 git，另一部機冇）。
