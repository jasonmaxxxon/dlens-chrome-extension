# HANDOFF

## From machine
NewJeans-Comeback (NewJeans Comeback)

## Time (HKT)
2026-11-13 16:09:50 HKT

## Branch
`feature/blocks-v1`

## Note from Max
接手完成 0.5.93 wheel 驗證及統計補修；1279 tests、0 fail，build與守門全綠；下一步：Lam拉取 feature/blocks-v1、重建及真Chrome側欄QA，prompt v6湊欄位問題留待下一個slice

## Working tree at handoff (`git status --short`, 1 entries)
```
 M HANDOFF.md
```

## Last 5 commits (before this handoff)
- d6cd2d0 bug fix: show wheel totals only when membership and likes are known (Your Name, 2026-11-13 16:09)
- 3cdf3e6 feature: version 0.5.93 (0.5.93-wheel) for the reworked wheel reader (Your Name, 2026-11-13 15:56)
- ec10305 feature: wheel reader gives each observation its own job and sets split sides next to each other (Your Name, 2026-11-13 15:56)
- 1546cb2 handoff: 升版本到 0.5.92（版本名 0.5.92-wheel），方便分辨輪閱讀頁 build；gate 全綠 1276/0 fail；下一步：Max 喺 Chrome 載入 output/chrome-mv3 做真機 QA、睇真模型有冇回 refs (Your Name, 2026-11-13 15:18)
- e3013a8 feature: version 0.5.92 (0.5.92-wheel) for the wheel reader build (Your Name, 2026-11-13 15:18)

## Next steps

- **目前版本：`0.5.93`／`0.5.93-wheel`，分支 `feature/blocks-v1`。** Claude 已完成 UI commit `ec10305` 及版本 commit `3cdf3e6`；Codex 接手確認遠端仍在 `1546cb2`（0.5.92），補驗證，並以 `d6cd2d0` 修正兩項統計誤報後完成 handoff 推送。沒有合併或推送 main。
- **另一部 Mac 接手：** 若未有遠端追蹤分支，先執行 `git fetch origin refs/heads/feature/blocks-v1:refs/remotes/origin/feature/blocks-v1`，再執行 `handoff --pull feature/blocks-v1`；重建 `npm run build`。Chrome 載入該 checkout 的 `output/chrome-mv3`，重新載入後確認版本名 `0.5.93-wheel`。
- **本版已做：** AI 反應改作頁頂一次性摘要，不再有獨立反應選項及重複理據；一般討論預設開話題；分歧兩邊並排，實心／空心標記對應輪上引用點；滑鼠按扇區不取焦點，鍵盤焦點沿扇形描邊；當前觀察沒有證據的扇區不再是按鈕；移除「留言同讚數佔比相若」，話題改顯示留言數及可核實的讚數總和。
- **接手補修：** 比例差距只說「讚數佔比高於／低於留言佔比」，不推斷留言數絕對多寡；群組缺少、部分或矛盾的成員資料時，不能把局部讚數加總冒充完整總和。`reader-wheel.ts` 復用 `readClusterReadings` 完整性規則，群組成員或原始讚數不完整時 `likeTotal`／`topicLikes` 為 null，畫面省略完整總數列；真正已知的零讚仍顯示 0。回歸測試覆蓋缺成員、部分成員、完整成員、缺失讚數及已知零讚。
- **驗證：** Codex 重新執行 typecheck、View／ViewModel boundary、storage seam、全部 tests、build、bundle guard、diff check。最終 1,279 tests／1,274 pass／5 skip／0 fail，其他檢查全部通過；獨立 reviewer 的兩項新增總數測試亦通過。沒有執行 `qa:harness:fixture`，沒有呼叫付費模型。
- **視覺檢查範圍：** 本機 headless Chrome harness 用既有 capture JSON 與示意 AI reading，檢查話題／分歧／做法／資源帖，寬 360／400px，共 8 個畫面，無橫向溢出及重複引用。這不是實際安裝的 Chrome side panel 驗收。檔案在 NewJeans-Comeback 本機 `~/developer/dlens-ui-redesign-review/harness/fable/` 及 `shots/fable/wheel/`，沒有進 git，另一部機不會隨 pull 取得。
- **下一步先做真機 QA：** 在正常 Chrome profile 的真 Threads 頁，從 extension action 或已存帖卡片開 side panel；核對 0.5.93、摘要只顯示一次、分歧卡並排、滑鼠無矩形框、Tab／Enter／空白鍵仍可操作、話題數字與原留言相符。直接開 `chrome-extension://.../sidepanel.html` 不算實機驗收。
- **仍未處理的語意問題：** `INLINE_READING_PROMPT_VERSION` 仍是 v6，這版沒有修改模型生成規則。「提到節目」仍可能被模型寫成做法，「親切／尷尬」仍可能被寫成假分歧；有效 refs 只能確認來源存在，不能證明歸納成立。下一個 slice 才調整 prompt：gist 只寫整體反應；methods 沒有明確可執行建議就空陣列；split 必須針對同一問題互相牴觸，不同感受可共存；split.agree 只寫共同前提，沒有就留空。升 prompt 會令舊 reading 過期並可能在開帖時消耗 API 額度，須在該工作範圍確認。
- **來源導航的設計取捨：** 頁頂 gist 現只保留 grounded 標記，沒有獨立 refs 入口；原句仍可從話題／原文查看。若需要直接追查 gist 的特定依據，另做精簡來源入口，避免恢復重複反應理據列表。
- **既有後續工作，這版未動：** 舊分析沒有 blocks 時仍用舊四格閱讀；閱讀頁原帖區高度與底部舊元素未整理；收藏列表細輪需後端提供群組比例。不要由此交接擅自擴大範圍。
- **完整 verify gate：** `npm run typecheck && npm run boundary:guard && npm run storage:seam-guard && npx tsx --test tests/*.test.ts tests/*.test.tsx && npm run build && npm run bundle:guard && git diff --check`。永遠不要執行會打 live pipeline 的 `npm run qa:harness:fixture`。
