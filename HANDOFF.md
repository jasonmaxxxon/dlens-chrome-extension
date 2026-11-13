# HANDOFF

## From machine
NewJeans-Comeback (NewJeans Comeback)

## Time (HKT)
2026-11-13 15:18:47 HKT

## Branch
`feature/blocks-v1`

## Note from Max
升版本到 0.5.92（版本名 0.5.92-wheel），方便分辨輪閱讀頁 build；gate 全綠 1276/0 fail；下一步：Max 喺 Chrome 載入 output/chrome-mv3 做真機 QA、睇真模型有冇回 refs

## Working tree at handoff (`git status --short`, 1 entries)
```
 M HANDOFF.md
```

## Last 5 commits (before this handoff)
- e3013a8 feature: version 0.5.92 (0.5.92-wheel) for the wheel reader build (Your Name, 2026-11-13 15:18)
- 77a1ba7 handoff: AI 閱讀改成每句帶留言出處（prompt v6：gist_refs 同做法／分歧 refs），輪閱讀頁用嚟畫白點，gate 全綠 1276/0 fail；下一步：Max 真機 QA 並睇真模型有冇回 refs、舊分析接輪 (Your Name, 2026-11-13 15:09)
- 0ea2cb1 feature: AI reading cites the comments behind each sentence (Your Name, 2026-11-13 15:09)
- 75f3b00 handoff: 閱讀頁換成輪閱讀頁（觀察→理據→原文三層，用真抓取資料核對），gate 全綠 1273/0 fail；下一步：真機 QA、AI 句子帶出處（要批 API 額度）、舊分析接輪 (Your Name, 2026-11-13 15:02)
- 6c55f41 feature: wheel reader with observations, evidence and raw material (Your Name, 2026-11-13 15:01)

## Next steps

- 版本：呢個分支而家係 `0.5.92`，版本名 `0.5.92-wheel`（`chrome://extensions` 顯示版本名，側欄 ⋯ 選單顯示「DLens 0.5.92」）。Chrome 要載入 `~/developer/dlens-ui-redesign/output/chrome-mv3`；reload 後仍見 0.5.91 即係 Chrome 載緊另一個資料夾。

- 2026-11-13：閱讀頁（blocks 模式）換成「輪閱讀頁」，commit `6c55f41`；AI 閱讀帶出處喺下一個 feature commit。三層：觀察（一句結論）→ 理據（輪顯示理據落喺邊個話題，下面係留言）→ 原文（全部留言、連結、作者回應、留名）。gate 全綠（1276 tests / 1271 pass / 5 skip / 0 fail）。未做真機 QA。
- 檔案：
  - `src/viewmodel/reader-wheel.ts`：`buildReaderWheel`（扇區、觀察、出處 id）、`observationRefs`、`dotsBySector`、`wheelGeometry`、`wheelSelection`。觀眾同作者回應用 `readCommentEligibility`，唔好寫第二套規則。
  - `src/ui/ReaderWheel.tsx`：畫面。數值全部喺 `tokens.panel.wheel`，文案喺 `i18n.ts` 嘅 `wheel.*`。
  - `tests/reader-wheel.test.ts`、`tests/reader-wheel-view.test.tsx`。
- 規則：
  - 扇區闊＝留言佔比，長＝讚數佔比（開方），色用現有 `panel.data`。
  - 觀察次序固定：反應、分歧、話題、做法、連結、問題。帖子類型只決定預設開邊句（求助開問題，資源開連結），唔換版面。
  - 反應係計數句，唔使 AI；反應同話題唔畫白點，其餘觀察每則出處一粒白點。
  - 連結夠料（多過一個、或一個多過一人提、或係 repo）先升做觀察，否則係原文 chip，唔會兩邊都出。
  - 頁頂已經印「N 則留言 · 讀咗 N」，輪只畫覆蓋環，唔再印數字。
  - 舊分析（冇 blocks）仍然用舊四格閱讀，未接輪。
- 未做（按次序）：
  - 真機 QA：Max reload 呢個分支嘅 `output/chrome-mv3`，睇 `@dafake_phoenix`（有 blocks）同一篇資源帖。
  - AI 句子帶出處：已做（prompt v6）。`gist_refs` 同每個做法／分歧邊嘅 `refs` 經 `parseInlineReadingResponse` 驗證，`reader-wheel.ts` 用嚟畫白點；gist 有出處先升做「反應」句，冇就留喺計數句下面並標「未連留言出處」。**未用真模型驗證**：呢部機冇 provider key，只測咗解析、儲存同畫面。Max reload 之後開一篇帖，睇模型有冇回 refs、白點落得啱唔啱。版本升咗，舊 v5 閱讀會喺開帖時重新生成（用 API 額度）。
  - 舊分析接輪：`buildReaderWheel` 對冇 blocks 嘅 capture 都出到模型，只係 `CollectionAudienceReading.tsx` 未掛。
  - 閱讀頁頂部原帖區（`src/ui/CollectionBrowser.tsx`）仲佔約 300px；收藏列表卡未重排；列表細輪要後端喺 `list_summary` 加每群佔比（另一條線）。
  - 「覆蓋：未知」同「尚未有已存 AI 閱讀」兩行仲喺輪下面，屬舊頁元素，未整理。
- 視覺核對：真資料 harness 喺 `~/developer/dlens-ui-redesign-review/harness/fable/`（`build-wheel.mjs`、`shoot-wheel.mjs`、`harness-wheel.tsx`，用 `real-analyses/` 兩份真 JSON 餵真 component；要 4179 server 開住）。截圖喺 `shots/fable/wheel/`（30 張，400＋360，冇溢出、冇重複留言、冇 raw enum）。真留言只留本機，唔好 commit。
- 規格同原型：`~/developer/dlens-ui-redesign-review/wheel-spec/SPEC.md`、`w4.html`、`w4.js`、`rose.js`。
- Verify gate（全部要綠）：`npm run typecheck && npm run boundary:guard && npm run storage:seam-guard && npx tsx --test tests/*.test.ts tests/*.test.tsx && npm run build && npm run bundle:guard && git diff --check`。
- 永遠唔好跑 `npm run qa:harness:fixture`（會打 live pipeline）。
- 規格、截圖、mockup、交接包喺 NewJeans-Comeback 本機 `~/developer/dlens-ui-redesign-review/`（唔喺 git，另一部機冇）。
