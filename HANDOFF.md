# HANDOFF

## From machine
NewJeans-Comeback (NewJeans Comeback)

## Time (HKT)
2026-11-04 16:50:36 HKT

## Branch
`proto/20261104-1650`

## Note from Max
PR #85 改為 0.5.0，留己看類留言唔再做群組名稱；下一步 lam 先試 ingest #15（捲動覆蓋率），再做 #85 實機 QA

## Working tree at handoff (`git status --short`, 1 entries)
```
?? HANDOFF.md
```

## Last 5 commits (before this handoff)
- 2229935 bug fix: bookmark replies never name a group; release 0.5.0 (Jason, 2026-11-04 16:49)
- 57b99c0 bug fix: verified unanswered questions, deep takeaways, keyword frames and cheap reading identity (Jason, 2026-11-04 15:21)
- 5bca3fd bug fix: use eligible audience comments and verified cluster labels (Lam Hin wang, 2026-11-03 23:06)
- feb29e4 bug fix: release 0.4.7 with one crawl job per post and safe orphan cleanup (#82) (jasonmaxxxon, 2026-10-22 22:28)
- 94be6d4 bug fix: release 0.4.6 with grounded audience sides, openable refs and honest coverage (#81) (jasonmaxxxon, 2026-10-16 17:49)

## Next steps
- 在 lam 先試 ingest-core #15（`fix/main-scroll-coverage` @ `3b49748`，已經 rebase 到 main `a13fa3a`）：
  1. 合併入 lam 的 live branch（之前是 `test/pr11-plus-domfix`），然後重啟 API 同 worker。
  2. 爬一兩篇大帖，例如 bankdoghk `DfFVji0GQ2M`、zuck。對比 Threads 顯示嘅回覆數同 `crawl_meta` 嘅 harvest 數字，確認收到八成以上留言。
  3. 過咗先合併 #15 入 main。
- 擴充 #85 而家係 0.5.0（`2229935`）。lam 上面：`handoff --pull`，或者 `git fetch && git checkout fix/task-c-eligibility-labels-2026-11`，然後 `npm ci && npm run build`，重新載入 `output/chrome-mv3`。
- 用 Jason `Default` profile 同真 Threads 頁做實機 QA，全部用 #14 之後「新抓」嘅帖子：
  1. 「大家問咩」：未有人回覆、而且留言卡回覆數係 0 嘅提問，顯示「N 未回／樣本內未見回覆」。有回覆數但冇抓到回覆嘅，仍然係「未能確認」。
  2. 「留己看／收藏」呢類留言唔會做群組名稱或者代表留言，但仍然計入則數。
  3. 話題頁「講法」：同一關鍵詞嘅帖子合成一組；the、覺得呢類虛詞唔會成組；「重複用語」會出現。
  4. 舊 capture 嘅「大家點睇」顯示「分群資料未完整 · 未能確認則數。」，群組按大小排序。
  5. 深度閱讀：舊結果顯示過時，重跑之後 takeaway 會進入話題閱讀。
  6. 效能：已存帖子多嘅時候，Threads 頁捲動或者存帖唔卡。用 DevTools Performance 睇 content script 有冇 long task。
  7. 補驗之前未見到嘅三項：(a) 淨係「?」或者淨係網址嘅留言唔當提問；(b) 側欄 ReaderReply 嘅 footer 有「留位／收藏」「簡短回應」標記；(c) 側欄同 service worker console 冇 DLens 錯誤。
- 合併次序：#15 喺 lam 試過先合；#85 QA 過咗先合（#14 已合）。
- 「重新抓取」入口：另一個 session 做緊，會開新 PR。
