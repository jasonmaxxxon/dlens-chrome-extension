# HANDOFF

## From machine
NewJeans-Comeback (NewJeans Comeback)

## Time (HKT)
2026-11-11 16:02:09 HKT

## Branch
`feature/blocks-v1`

## Note from Max
blocks-v1 資料層同合約對齊完成（含 #83-#86 同側欄 phase 0-5），gate 全綠 1233/0 fail；閱讀頁視覺被否決，下一步按 HANDOFF 用 dir-C reading-first 重做並做真機 QA

## Working tree at handoff (`git status --short`, 1 entries)
```
?? HANDOFF.md
```

## Last 5 commits (before this handoff)
- 48673d8 fix: align blocks renderers with the blocks-v1 backend contract (Your Name, 2026-11-11 08:44)
- e65bc97 feature: render analysis.blocks in the post reader with evidence links (Your Name, 2026-11-10 23:07)
- 75fc4aa removal: retired side panel tokens and copy (Your Name, 2026-11-05 13:22)
- c2f2a96 feature: menu connection health, settings and workspace cards (Your Name, 2026-11-05 12:25)
- fb9f0e9 feature: reader hierarchy for clusters, eligibility and re-crawl (Your Name, 2026-11-05 12:10)

## Next steps

- 等 Max 確認新版 UI 方向。建議：由 `feature/blocks-v1` 開新分支，直接寫 code（唔再出靜態 mockup），dir-C 視覺語言全殼 + reading-first 閱讀頁；用 review harness 影真 component 截圖俾 Max 睇。
- 閱讀頁（`src/ui/AnalysisBlocks.tsx`、`src/viewmodel/analysis-blocks.ts`）：
  - 頂部一句用 AI 已生成嘅 `reading.gist`（`src/compare/inline-reading.ts`，而家冇任何畫面顯示）；冇 AI key 先用模板句。
  - 每項 2 行、每項最多 1 個「原留言」連結；GitHub 項目名本身做連結，唔另起一行 URL。
  - 跨 block 按 `comment_id` 去重：同一則留言唔好喺工具清單、熱門留言、大家點睇各出一次。
  - primary block 展開，secondary 收成一行；雜訊只出數字放最底。
  - 問答狀態畫面上收做 3 種（有答／未答／睇唔到回覆），資料層保留 5 種。
- 已知小問題（未修）：
  - 原帖提問冇 permalink 時，fallback 會將 threads.net 改寫成 threads.com（`src/viewmodel/analysis-blocks.ts:86`）；後端確認要原樣用。
  - 匯出成功狀態靠比對「已複製」字串（`src/ui/AnalysisBlocks.tsx:106`）。
- 真機 QA 未做：Max 要 load 呢個分支嘅 `output/chrome-mv3`（唔係 combo 0.5.90），對 `@good_job_ai/Dfin6FzikPW` 同一篇討論帖撳「重新抓取留言」，先會有真 `blocks`。到而家所有閱讀頁設計都只用過示範資料。
- 需要後端（另一條線）：工具簡介（GitHub 補料）、分群名（`label` 永遠 null）、帖子類型手動更正 API。前端唔好自己發明欄位。
- Verify gate（全部要綠）：`npm run typecheck && npm run boundary:guard && npm run storage:seam-guard && npx tsx --test tests/*.test.ts tests/*.test.tsx && npm run build && npm run bundle:guard && git diff --check`。2026-11-11 喺 `48673d8` 實跑：1233 tests / 1228 pass / 5 skip / 0 fail。
- 永遠唔好跑 `npm run qa:harness:fixture`（會打 live pipeline）。
- 規格、截圖、mockup、交接包喺 NewJeans-Comeback 本機 `~/developer/dlens-ui-redesign-review/`（唔喺 git，另一部機冇）。
