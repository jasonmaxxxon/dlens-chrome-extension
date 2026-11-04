# HANDOFF

## From machine
NewJeans-Comeback (NewJeans Comeback)

## Time (HKT)
2026-11-04 15:22:59 HKT

## Branch
`proto/20261104-1522`

## Note from Max
修好 PR #85 五個中等問題（大家問咩、深度摘要、講法分組、舊資料標題、效能）；下一步 lam 實機 QA，之後先合 #14 再合 #85

## Working tree at handoff (`git status --short`, 1 entries)
```
?? HANDOFF.md
```

## Last 5 commits (before this handoff)
- 57b99c0 bug fix: verified unanswered questions, deep takeaways, keyword frames and cheap reading identity (Jason, 2026-11-04 15:21)
- 5bca3fd bug fix: use eligible audience comments and verified cluster labels (Lam Hin wang, 2026-11-03 23:06)
- feb29e4 bug fix: release 0.4.7 with one crawl job per post and safe orphan cleanup (#82) (jasonmaxxxon, 2026-10-22 22:28)
- 94be6d4 bug fix: release 0.4.6 with grounded audience sides, openable refs and honest coverage (#81) (jasonmaxxxon, 2026-10-16 17:49)
- 8fc38b5 feature: release 0.4.5 with the inline collect card and rebuilt side panel (#80) (jasonmaxxxon, 2026-10-15 13:56)

## Next steps
- 在 lam：`handoff --pull`，或者 `git fetch && git checkout fix/task-c-eligibility-labels-2026-11`（PR #85，已包含 57b99c0）。然後 `npm ci && npm run build`，重新載入 `output/chrome-mv3`。
- 用 Jason `Default` profile、真 Threads 頁做實機 QA。每一項都要用 #14 後端「新抓」的帖子：
  1. 「大家問咩」：未有人回覆、而且 Threads 留言卡回覆數係 0 嘅問題，應該顯示「N 未回／樣本內未見回覆」。有回覆數但冇抓到回覆嘅，仍然係「未能確認」。
  2. 話題頁「講法」：幾篇帖子有同一個關鍵詞時，應該合成一組（名稱好似「reset / 額度」）。the、覺得呢類虛詞唔會成組；「重複用語」會出現。
  3. 舊 capture：「大家點睇」標題應該係「分群資料未完整 · 未能確認則數。」，群組按大小排序。
  4. 深度閱讀：舊結果顯示過時。重跑之後，takeaway 應該會進入話題閱讀。
  5. 效能：Threads 頁有好多已存帖子時，捲動或者存帖都唔應該卡頓。用 DevTools Performance 睇 content script 有冇 long task。
- 合併次序：先合 ingest-core #14，再合 #85。合併 #85 之前，要將 0.4.8 改成未用過嘅版本號（#84 已經用 0.4.9），5 個 lock site 一齊改。
- 已知但未處理：10/21–11/03 期間作者欄空白嘅舊 capture，觀眾數量會大減；已成功嘅 capture 冇重抓入口（另案）。
