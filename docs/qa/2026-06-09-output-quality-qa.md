# DLens QA — Flow 1–16：流程 / 驗收標準 / Bug Log

> Last updated: 2026-06-11
> 統一格式：每條 `目標 → 步驟 → ✅好的長相（可打勾）→ ❌出包訊號 → 記什麼 → 🔬Run結果`。
> 分工：**Flow 1–6（互動）= Codex**；**Flow 9–16（輸出品質）= Claude**；7–8 互動補充，誰先到誰跑。
> 前置：Chrome 載入 `output/chrome-mv3` v`0.1.30`、Threads 登入、Ingest URL `http://127.0.0.1:8000`、只測 Threads 頁面上的 in-page UI（不是 debug side panel）。

## Run 摘要

| Run | 執行 | 結果 |
|-----|------|------|
| **Run 1** (2026-06-09, Codex) | Flow 1–6 | 1 ✅(含遲滯) · 2 ◑(缺真二窗) · 3 ✅ · 4 —(未跑) · 5 ◑(產品缺口) · 6 ❌ → **B-01** · 另記 **B-02 / B-03** |
| **Run 1b** (2026-06-09, Codex) | Flow 4 + 7–16 partial | 4 ◑(backend DB 500 阻塞 LLM) · 7 ✅ · 8 ◑ · 9–10 ❌ → **B-04 / B-05** · 11 ◑ · 12–13 ◑ · 14 ◑(resize 工具限制) · 15–16 —(無 analyses 阻塞) |
| **Run 2** (2026-06-09, Codex / Chrome `jason@brandonproject` profile session) | Flow 1–16 | 1 ✅(啟用遲滯仍在) · 2 ✅(真二窗) · 3 ◑(active collect 擋切頁) · 4 ✅/◑(真 LLM 成功；backend job error surface 漏) · 5 ✅/◑(backend down 有明確錯誤；no-key 未改 profile) · 6 ❌ → **B-01 confirmed** · 7 ✅ · 8 ◑ · 9–10 ❌ → **B-06** · 11 ✅/◑ · 12–14 ◑ · 15 ◑/❌ → **B-07** · 16 ◑/blocked → **B-08** |
| **Run 3 preflight** (2026-06-10, Codex / DevTools + Chrome profile check) | Tool/session gate + code trace | **未算作 Flow 1–16 新樣本**。DevTools 第一個目標是 local mockup，已排除；改開 Threads 兩次都只見登入頁。Chrome `Default` profile 確認是 `jason@brandonproject.co`，且 profile root `Cookies` 內有 Threads/Instagram cookies；但目前自動化可見 context 仍未進 feed，Computer Use 也讀不到 Chrome state，所以無法做真 hover/collect。已補 §4 deep trace，將 B-01/B-04/B-06/B-07/B-08 收斂到具體 code path / 下一步 fix。 |
| **Run 4 preflight** (2026-06-10, Codex / `qa-runtime-probe`) | Reproducible gate | **未算作 Flow 1–16 新樣本**。新增 `scripts/qa-runtime-probe.mjs`，同一 profile/tab/build 條件下產生兩份 JSON：backend down = `fetch failed`，backend up = `200 {"status":"idle"}`；profile 固定 `jason@brandonproject.co`、build `DLens v3` `0.1.30`、Chrome tabs 仍只有 mockup + Threads tabs。此 run 把後續 Flow 4/5 的 backend preflight 變成可重跑證據。 |
| **Run 5 code-path audit** (2026-06-10, Codex / DevTools + `qa-code-path-audit`) | Live gate + code evidence | **未算作 Flow 1–16 新樣本**。DevTools 再開 Threads 仍是 login modal；`qa-code-path-audit` 產生 4 fail / 1 warn：B-01/B-04/B-06/B-07 fail，B-08 warn。B-08 已校正為「review/export workspace 被 existing-reading gate 擋住；first-reading disclosure 存在但分散在 Saved/selection path」，不是絕對無 path。 |
| **Run 6 automation boundary** (2026-06-10, Codex / process + CDP probe) | Tool boundary evidence | **未算作 Flow 1–16 新樣本**。`qa-runtime-probe` 新增 process/CDP inspection：DevTools MCP 的 Chrome 使用獨立 `~/.cache/chrome-devtools-mcp/chrome-profile`、`--remote-debugging-pipe`、`--disable-extensions`；使用者真正 Chrome 同時存在但無 remote debugging pipe/port。常見 CDP ports `9222/9223/9224/9333/9444/9515` 全部不可連；Computer Use 仍 `-10005 timeoutReached`。結論：目前 DevTools 能量測自己的 isolated context，不能操作已載入 DLens + 已登入 Threads 的使用者 profile。 |
| **Run 7 storage log audit** (2026-06-10, Codex / `qa-storage-probe`) | Read-only storage evidence | **未算作 Flow 1–16 新樣本**。新增 `scripts/qa-storage-probe.mjs`，解析 DLens extension LevelDB write-ahead `.log`（不解 compressed `.ldb`，不寫 storage）。目前 `activeSessionId=session_ywskiblc_mp6p013z`，active session 是 product `ai discussion`，`11 items`（`10 succeeded / 1 saved`），tab UI `selectionMode=false`；同時存在一個名稱為 `Product workspace` 但 `mode=topic` 的舊 session，這是 Product/Topic 命名混淆與 B-05 storage trace 的重要線索。 |
| **Run 8 B-01 control fix** (2026-06-10, Codex / TDD + code-path audit) | Focused fix evidence | **未算作 Flow 1–16 新樣本**。新增 `threads-content.test.ts` regression，先看見 B-01 紅燈，再把 `entrypoints/threads.content.ts:onClick()` 的 `preventDefault/stopPropagation` 移到 `card + descriptor` guard 後。Run8 `qa-code-path-audit` 顯示 B-01 `pass`（`preventLine=399`、`descriptorGuardLine=395`），相關測試 `154/154` pass，完整 test glob `619/619` pass。仍需用 Jason 真實 Chrome profile 重跑 Flow 1/2/3/6，確認非 card navigation 放行且真 post collect 不退化。 |
| **Run 9 post-build automation gate** (2026-06-10, Codex / Chrome DevTools + Computer Use) | Tool boundary evidence | **未算作 Flow 1–16 新樣本**。`npm run build` 成功並 mirror 到 `output/chrome-mv3`；`qa-runtime-probe` 再確認 `Default` profile = `jason@brandonproject.co`、使用者 Chrome 有 3 個 Threads tabs、但 user Chrome 無 CDP pipe/port。Computer Use 對 `Google Chrome` / `com.google.Chrome` / `/Applications/Google Chrome.app` 全部 `-10005 timeoutReached`。Chrome DevTools snapshot 仍是 isolated Threads login modal（`Say more with Threads`），不是已登入 feed / DLens runtime。 |
| **Run 10 B-06 display fix** (2026-06-10, Codex / TDD + code-path audit) | Focused fix evidence | **未算作 Flow 1–16 新樣本**。新增 Product UI raw-label regression，先看見 `collected posts` / `mobile share extension` / `mixed` / `TRY experiment` / `relevance 5/5` 紅燈，再把 Product display layer 接上中文 label helpers。Run10 `qa-code-path-audit` 顯示 B-06 `pass`（rawDisplayHits=[]），相關測試 `89/89` pass，完整 test glob `619/619` pass，build pass。仍需在真 Product analyses UI 裡回歸 Run2 兩條實際 signal。 |
| **Run 11 B-07 exclusion-card fix** (2026-06-10, Codex / TDD + code-path audit) | Focused fix evidence | **未算作 Flow 1–16 新樣本**。新增 Product UI noise/park regression，先看見 noise/park 仍出現 `marginalia-experiment` / `可借用 workflow` / `TASK ›` 紅燈，再把 ActionableItemCard 加上 `isExcludedActionSignal()` 與 `data-exclusion-card="true"` 分支。Run11 `qa-code-path-audit` 顯示 B-07 `pass`（exclusion guard/card/copy present），相關測試 `94/94` pass、完整 test glob `620/620` pass、`npm run build` pass 並 mirror 到 `output/chrome-mv3`。仍需在真 Product Action 裡回歸 Run2 的 `kilobtye_67`。 |
| **Run 12 live profile probe** (2026-06-10, Codex / Chrome `Default` = `jason@brandonproject.co`) | Real Chrome tab + stale-extension evidence | **部分算作 live evidence；不算新版 Flow 1–16 回歸**。Chrome backend 成功 claim 使用者現有 `(4) Home • Threads` tab，feed 已登入且 DLens in-page UI 開啟，不是 isolated DevTools login profile。Product Action noise filter 仍顯示 `可借用 workflow` / `TASK` / `Keep as observation`，但這代表 Chrome 尚未 reload 剛 build 的 unpacked extension（stale loaded bundle），不可判定 Run11 code fix 失敗。Threads reload 後曾短暫顯示 Product `0 signals / 0 analyses`，同時 storage probe 仍顯示 active product `ai discussion` 有 `11 items`，第二次 reload/reopen 恢復 `2 signals · 2 analyses` → **B-05 transient confirmed**。console 持續刷 `/worker/status` backend unavailable → B-03/B-04 error-surface evidence。 |
| **Run 13 B-04 error-surface fix** (2026-06-10, Codex / TDD + code-path audit) | Focused fix evidence | **未算作 Flow 1–16 新樣本**。新增 backend error UI regression：Product 有 analyses 但 `/worker/status` 失敗時，不可再顯示 `AI enabled / ✓ 已就緒`，要顯示 `Backend 離線` 與中文可行動錯誤。`useProcessingCoordinator` 現在回傳 `workerError`；Product readiness/header 顯示中文 backend error；`product/analyze-signals` response 加 `failures[]`，帶 `signalId/itemId/sourceUrl/error/errorKind`，UI 顯示第一筆失敗摘要。Run13 `qa-code-path-audit` 顯示 0 fail / 1 warn（只剩 B-08），targeted QA suite `142/142` pass、完整 test glob `622/622` pass、`npm run build` pass 並 mirror 到 `output/chrome-mv3`。仍需 reload Jason profile extension 後 live 回歸 backend down / job failed / no-key 三條。 |
| **Run 14 QA trace instrumentation** (2026-06-10, Codex / trace hooks) | DevTools timing scaffold | **未算作 Flow 1–16 新樣本**。新增 gated QA trace：DevTools console 執行 `sessionStorage.__DLENS_QA_TRACE__="1"`，或 URL 帶 `?dlensQaTrace=1` / `#dlensQaTrace=1` 後，content/popup/coordinator 會把 hover、overlay render、collect click/save、collect-mode toggle、Topic/Product hydration、Product analyze、worker status/refresh/error/backoff 全部寫入 `window.__DLENS_QA_TRACE__` 並 `console.debug("[DLens QA] ...")`。Root 會帶 `data-dlens-qa-trace-version="run14-url-trace-v1"`，用來確認 Chrome 已 reload 到新版 bundle。這是為 4–5 次完整 live run 準備的 view-time / message-boundary 證據；一般使用者預設無輸出。Focused trace tests `8/8` pass、typecheck pass、完整 test glob `626/626` pass、code-path audit `0 fail / 1 warn`、`npm run build` pass 並 mirror 到 `output/chrome-mv3`。 |
| **Run 15 live marker gate** (2026-06-10, Codex / Chrome `Default` = `jason@brandonproject.co`) | Version gate | **未算作 Flow 1–16 新樣本**。Chrome backend 成功 claim Jason profile 的 `(4) Home • Threads` feed；DLens root 與 overlay 都存在，但 root attributes 只有 `id="__dlens_extension_v0_root__"` / `data-dlens-control="true"`，`data-dlens-qa-trace-version` = `null`。結論：Chrome 仍在跑 stale content script；live Flow 1–16 必須等 unpacked extension 從 `output/chrome-mv3` reload，且 marker 讀到 `run14-url-trace-v1` 才能算新版回歸。 |
| **Run 16 B-05 hydration fix** (2026-06-10, Codex / TDD + code-path audit) | Focused fix evidence | **未算作 Flow 1–16 新樣本**。針對 Product startup false-empty：先新增 regression，確認 `isHydrating=true` 仍會顯示 `No result`、`0 signals / 0 analyses`、`尚未有 AI 分析結果`；修正後 `useInPageCollectorAppState` 追蹤 `isHydratingProductSignals`，`ProductSignalView` 在 hydration 未完成且未有資料時顯示 `data-product-hydrating="true"` / `讀取中`，不再把未讀完呈現成空結果。這修掉 B-05 的 UI false-empty；真 session/storage drift 仍需新版 live trace 驗證。Focused Product test `58/58` pass、typecheck pass、完整 test glob `627/627` pass、code-path audit `0 fail / 1 warn`、`npm run build` pass 並 mirror 到 `output/chrome-mv3`。 |
| **Run 17 marker repeat + trace summary tooling** (2026-06-10, Codex / Chrome `Default` = `jason@brandonproject.co`) | Gate + tooling | **未算作 Flow 1–16 新樣本**。再次 claim Jason profile 的 `(4) Home • Threads` feed，DLens root/overlay 仍存在但 `data-dlens-qa-trace-version=null`，確認仍是 stale content script，不能跑新版 Flow。新增 `scripts/qa-trace-summary.mjs`，可把每條 Flow 的 `window.__DLENS_QA_TRACE__` raw JSON 轉成 latency pair 表、event counts、slowest gaps、missing end events；smoke run 已產生 JSON + Markdown，示例可算出 collect toggle、hover overlay、collect save、Product hydration latency。 |
| **Run 18 live regression** (2026-06-10, Codex / Chrome `Default` = `jason@brandonproject.co`) | Flow 1–16 live partial | **算作新版 live 樣本**。確認 Jason profile marker `run14-url-trace-v1` 後重跑。1 ◑：hover/keyboard save OK，但 panel `加入產品訊號` no-op → **B-09**；2 ◑：Supabase focus drift 未分裂，但 `chrome://extensions` 不能 claim，不算完整二窗；3 ❌：Topic↔Product 後 Product session 漂成 `0 signals / 0 analyses` 且 latest tab UI `activeSessionId=null` → **B-05 confirmed**；4 ✅/◑：真 backend + LLM 成功，click→queue response `9.3s`、crawl `33.2s`、約 `68s` 後 `1 analyses` 可見；5 ◑：backend down 後按分析有人話錯誤，passive Action route 仍暫顯 `AI enabled`；6 ✅/◑：Profile navigation 300ms 內成功、overlay hidden，cursor 仍 crosshair；7 ✅/◑：重複 post 顯示 `Saved`、count 不增，但 hover nested time link 產生 `No snippet` → **B-10**；8 ◑：Topic `work` 15 rows scroll OK，切換約 2.4s、仍無 ≥30 樣本；9–16 ◑/blocked：B-05 讓 Product output/export 入口漂成空，只能完成空/error surface DOM scan（raw hits 0、export controls 0、overflow 為受控外層 scroll/字型微差）。Evidence：`docs/qa/assets/2026-06-10/run18/`。 |
| **Run 19 launcher host fix** (2026-06-10, Codex / TDD + Jason profile gate) | Focused fix evidence | **未算作 Flow 1–16 新樣本**。Jason profile reload 後 marker 已是 `run14-url-trace-v1`，但 launcher 點擊/鍵盤/DOM click 都不開 popup，storage `popupOpen=false`；root 是 document 底部 0-height host，fixed launcher 肉眼可見但 hit-test 不穩。修正：`#__dlens_extension_v0_root__` 改成 fixed viewport host、`pointer-events:none`，launcher/popup/浮層 opt back into `pointer-events:auto`。Regression `threads-content.test.ts` 先紅後綠，`6/6` pass，typecheck pass，build pass 並 mirror。 |
| **Run 20 Flow 9–16 live regression** (2026-06-10, Codex / Chrome `Default` = `jason@brandonproject.co`) | Flow 9–16 | **算作新版 live 樣本**。入口 gate 通過：root fixed host + marker `run14-url-trace-v1`，launcher 可開 popup。Product startup 先顯示 `9 signals / 0 analyses`，5s 內 repair/hydrate 成 `9 signals / 0 analyses` 並可按分析；按「分析收件匣」後有 `分析中` loading，約 15s 內完成 `9 signals · 9 analyses`。9 ✅：Saved/Classification/Action raw token scan 0 hits；10 ◑：錯誤無 raw，但仍有英文 chrome `Agent Brief` / `AI enabled` / `TASK ›` → **B-11**；11 ✅：空/待處理/完成狀態都有中文引導；12–13 ✅/◑：長文以受控 ellipsis / `展開全文` 處理，無按鈕重疊，水平 overflow 都是 deliberate truncation；14 ◑：仍無可靠窄 viewport tool；15 ✅/◑：B-07 live passed，noise cards 不再 action framing，evidence text 可回到原文，但未做 clear-cache 多次重跑；16 ❌：已有 `9 analyses` 仍沒有 reading/export/copy 入口 → **B-08 live confirmed**。Evidence：`docs/qa/assets/2026-06-10/run20/`。 |

| **Run 21 code patch round** (2026-06-10, Claude Code) | B-02/03/05/08/09/10/11 全部落地 code fix | **未算作 Flow 1–16 新樣本（純 code 輪）**。B-09 popup save 兩通道加 `popup.collect.save.request/response` trace（hit-test root cause 已由 Run19 host fix 解）；B-05 加 active-session 寫入防護（sessions 存在時 null/dangling pointer 不落 storage）+ topic↔product 跨 worker 重啟 regression；B-08 actionable view 加 first-reading CTA（analyses>0 且 readings=0）；B-11 四個英文 chrome token 改繁中 + ban regression；B-10 `findCardCandidate` 加 post-root promotion（深度 8 用盡的 fragment 晉升到包圍 article）；B-03 idle poll 改 12s 心跳（passive 偵測 backend down 的 root cause 是 idle 時完全停 poll）；B-02 selection toggle 改 tab-only write + cached read + server timing log。Full glob `641/641`、typecheck、build + mirror、audit B-08 `hasVisibleFirstRunCta: true`。**全部待 Run 22 live 回歸**（checklist 見 §4.10）。 |
| **Run 22 live regression（partial）** (2026-06-10, Codex / Chrome `Default` = `jason@brandonproject.co` + Claude Code 收尾) | §4.10 checklist partial + 2 個新 root cause | **算作新版 live 樣本（未收尾）**。**B-05 找到第二個 root cause 並 live 修復**：`useTopicState` orphan 清理把「上一個 Product folder 的 signals」誤判成現任 folder 孤兒而刪除，且 `session/set-mode` 永遠 fallback 到第一個同 mode session——修後 Topic↔Product 切換 ×3 + page reload，2 signals 全程留在正確 Product folder ✅。**B-09 ✅**：panel `加入產品訊號` 在新 host 下產生 `已加入` toast、signals 入列（`b09-panel-save.json` before/after）。**B-08 ✅（主路徑）**：Action route `analyses>0/readings=0` 顯示 CTA → `判讀中…` → review workspace 接手；export/copy 收尾未驗。**B-03 ✅（機制）**：trace 顯示 idle `next-poll {delayMs:12000}` 連續心跳、backend down 全數被 `popup.worker.status.error` 接住；stamp 切換的 checklist 條目未走完。**B-10 ❌**：post detail 的 time link hover 仍 `No snippet`——detail 頁貼文**沒有 article wrapper**（`b10-hover.json` `articles:[]`），Run21 promotion 只認 article → 同日 refix `1a2f33e`（fallback 到 `div[data-pressable-container]`，article 優先保住 feed 行為）。**B-02 ◑**：3× toggle 功能正常但 wallMs ~6.7–7.2s 為自動化含 overhead 量測、`response:null`，in-page toggle pair 未捕捉，遲滯未定案。**B-11 ✅（目視）**：run22 snapshots 出現 `已存訊號/分析完成/尚無結果`。**新 B-12**：backend job 帶明確 `last_error`（Playwright binary 缺失，attempt 2/3 重試中）但前端只顯示 `抓取中/等待 backend 完成` → 同日 fix `1a2f33e`。Backend 側：Supabase `select 1` OK（tenant/user 非阻塞）；真 blocker 是 private backend 缺 Playwright chromium binary，`.venv/bin/python -m playwright install chromium` 補齊後兩筆 `/capture-target` 真 crawl 成功（`comment_count=4/12`），UI 即時 `分析完成`、`2 signals · 2 analyses`，無 storage/UI 分裂。**未收尾**：Flow 9–16 的 reading review/file、Signal Packet/行動簡報 export、Classification 全掃、copy/export 輸出檢查。Evidence：`docs/qa/assets/2026-06-10/run22/`。 |
| **Run 23 live recheck（partial）** (2026-06-11, Codex / Chrome `Default` = `jason@brandonproject.co`) | §4.11 checklist B-10/B-12 + gate | **算作新版 live 樣本（未收尾）**。使用 Jason profile 手動 reload `output/chrome-mv3` 後，root marker `run14-url-trace-v1`、fixed viewport host、Product Action `2 signals · 2 analyses` + reading/packet workspace 可見。**B-10 ✅**：post detail 頁 hover time link `1d`，preview 回到 `se_ranking` 貼文並含 `Can AI content actually be good?` snippet，`hasNoSnippet=false`。**B-12 ✅**：真 reply collect 後暫時移走 Playwright headless shell cache 製造 crawl retry error；Saved 等待區顯示 `抓取中（重試中）` + `backend 回報錯誤：BrowserType.launch...`，不再是無限 `等待 backend 完成`。測後 Playwright cache 已還原、reply composer 為空；B-12 測試 signal 仍留在 Product folder，因 GUI 刪除會跳確認，依危險動作規則已按 Cancel。**未收尾**：B-02 in-page timing、B-03 stamp 目視、Flow 8 計數矛盾、Flow 9–16 export/copy 與 Classification 全掃。Evidence：`docs/qa/assets/2026-06-11/run23/`。 |
| **Run 24 backend restart + B-13 fix** (2026-06-11, Codex / Chrome `Default` = `jason@brandonproject.co`) | B-03 recovery + B-12 clear path + stamp bug fix | **算作新版 live 樣本（未收尾）**。重啟 private backend 後，Product UI 由 `Backend 離線` 回到 `分析完成 / ✓ 已就緒`，B-03 recovery stamp 目視通過。B-12 測試殘留 job 未被 passive health poll 自動 drain；手按 `重新分析` 後 backend 收到 `/worker/drain`，attempt 3 成功 crawl `comment_count=11`，UI 變 `3 signals · 3 analyses` 且 pending card 消失。過程中發現 **B-13**：backend healthy 時，舊 `analysisError` 仍讓 header stamp 顯示 `Backend 離線`；修成 backendError 才顯示 `Backend 離線`、analysisError 顯示 `部分失敗`，reload `output/chrome-mv3` 後 live 確認無錯誤 stamp、無 Playwright stale error。Flow 9–16 export/copy 與 Classification 全掃仍未跑。Evidence：`docs/qa/assets/2026-06-11/run24/`。 |

Open bugs（Run 24 後）：**B-02 (P2, 遲滯量測未定案——run22 wallMs 含自動化 overhead，需 in-page toggle pair)**。Fixed / live passed：**B-01 · B-03（idle 心跳 + recovery stamp 目視通過）· B-04（backend down + job last_error surface 皆有 live evidence；no-key 未重跑）· B-05（兩個 root cause：Run21 寫入防護 + Run22 orphan 清理誤刪，切換 ×3 + reload 通過）· B-06 · B-07 · B-08（主路徑；export/copy 收尾未驗）· B-09（panel save `已加入`）· B-10（detail time-link hover recheck 通過）· B-11（四 token 目視通過）· B-12（retrying job error 可見；manual drain 清除通過）· B-13（analysisError 不再誤標 Backend 離線）· Run19 launcher host**。仍需收尾：B-02 量測、Flow 8 計數矛盾、Flow 9–16 reading review/file + export/copy + Classification 全掃。

Run 2 evidence：`docs/qa/assets/2026-06-09/run2/` + Chrome DevTools console + backend terminal / `/worker/status`。Run 2 沒切 profile；沿用已登入 Threads 並載入 DLens v0.1.30 的 Chrome session。
Run 3 evidence：`docs/qa/assets/2026-06-10-devtools-baseline.snapshot.txt`、`docs/qa/assets/2026-06-10-threads-devtools-baseline.snapshot.txt`、`docs/qa/assets/2026-06-10-threads-devtools-repeat.snapshot.txt`、Chrome Preferences profile mapping（`Default` = `jason@brandonproject.co`）、profile root `Cookies` preflight（Default 有 `.threads.com` / `.instagram.com` rows，但 DevTools/visible automation context 仍落登入 modal）。
Run 4 evidence：`scripts/qa-runtime-probe.mjs`、`docs/qa/assets/2026-06-10/run4/preflight.json`、`docs/qa/assets/2026-06-10/run4/preflight-backend-up.json`。
Run 5 evidence：`scripts/qa-code-path-audit.mjs`、`docs/qa/assets/2026-06-10/run5/preflight.json`、`docs/qa/assets/2026-06-10/run5/threads-preflight.snapshot.txt`、`docs/qa/assets/2026-06-10/run5/code-path-audit.json`、targeted QA suite `136/136` pass。
Run 6 evidence：`docs/qa/assets/2026-06-10/run6/preflight.json`。
Run 7 evidence：`scripts/qa-storage-probe.mjs`、`docs/qa/assets/2026-06-10/run7/storage-probe.json`。
Run 8 evidence：`docs/qa/assets/2026-06-10/run8/code-path-audit-after-b01.json`、`tests/threads-content.test.ts` regression、targeted QA suite `154/154` pass、full test glob `619/619` pass。
Run 9 evidence：`docs/qa/assets/2026-06-10/run9/preflight-after-build.json`、`docs/qa/assets/2026-06-10/run9/devtools-current.snapshot.txt`、`npm run build` pass。
Run 10 evidence：`docs/qa/assets/2026-06-10/run10/code-path-audit-after-b06.json`、`tests/views.test.tsx` Product raw-label regression、targeted QA suite `89/89` pass、full test glob `619/619` pass、`npm run build` pass。
Run 11 evidence：`docs/qa/assets/2026-06-10/run11/code-path-audit-after-b07.json`、`tests/views.test.tsx` noise/park exclusion regression、targeted QA suite `94/94` pass、full test glob `620/620` pass、`npm run build` pass（`output/chrome-mv3/manifest.json` timestamp `2026-06-10 01:00:35 HKT`）。
Run 12 evidence：`docs/qa/assets/2026-06-10/run12/live-profile-probe.json`、`run12/storage-after-thread-reload.json`、`run12/dead-launcher-second-reload.json`、`run12/noise-filter-stale-recovered.json`、`run12/noise-filter-stale-recovered.png`。
Run 13 evidence：`docs/qa/assets/2026-06-10/run13/code-path-audit-after-b04.json`、`tests/processing-errors.test.ts` backend UI message regression、`tests/views.test.tsx` Product backend error regression、targeted QA suite `142/142` pass、full test glob `622/622` pass、`npm run build` pass（`output/chrome-mv3/manifest.json` timestamp `2026-06-10 01:16:26 HKT`）。
Run 14 evidence：`src/ui/qa-trace.ts`、`tests/qa-trace.test.ts`、content events in `entrypoints/threads.content.ts`、popup/analyze/hydration events in `src/ui/useInPageCollectorAppState.ts` / `src/ui/useTopicState.ts`、worker events in `src/ui/useProcessingCoordinator.ts`、DOM marker `data-dlens-qa-trace-version="run14-url-trace-v1"`、`docs/qa/assets/2026-06-10/run14/code-path-audit-after-hydration-trace.json`、focused trace tests `8/8` pass、typecheck pass、full test glob `626/626` pass、`npm run build` pass（`output/chrome-mv3/manifest.json` timestamp `2026-06-10 01:37:13 HKT`）。
Run 15 evidence：`docs/qa/assets/2026-06-10/run15/live-marker-gate.json`、`docs/qa/assets/2026-06-10/run15/preflight-before-live-rerun.json`。
Run 16 evidence：`tests/views.test.tsx` Product hydration regression、`docs/qa/assets/2026-06-10/run16/code-path-audit-after-b05-hydration.json`、focused Product view test `58/58` pass、typecheck pass、full test glob `627/627` pass、`npm run build` pass（`output/chrome-mv3/manifest.json` timestamp `2026-06-10 01:40:15 HKT`）。
Run 17 evidence：`docs/qa/assets/2026-06-10/run17/live-marker-gate-repeat.json`、`scripts/qa-trace-summary.mjs`、`docs/qa/assets/2026-06-10/run17/trace-summary-smoke-input.json`、`docs/qa/assets/2026-06-10/run17/trace-summary-smoke.json`、`docs/qa/assets/2026-06-10/run17/trace-summary-smoke.md`。
Run 18 evidence：`docs/qa/assets/2026-06-10/run18/`。核心檔：`jason-profile-marker-after-reload.json`、`flow1-after-collect.json`、`flow1-after-keyboard-save.json`、`flow3-after-product-back-topic.json`、`flow4-after-click-analyze-12s.json`、`flow4-after-crawl-success-ui.json`、`flow5-backend-down-analyze-click.json`、`flow6-profile-nav-click-2.json`、`flow8-topic-switch-scroll-2.json`、`flow9-product-drift-after-wait.json`、`storage-after-product-drift.json`、`trace-summary-flow4.md`、`trace-summary-before-drift-reload.md`。
Run 19 evidence：`docs/qa/assets/2026-06-10/run19/storage-after-launcher-noop.json`、`tests/threads-content.test.ts` root host regression、typecheck pass、`npm run build` pass。
Run 20 evidence：`docs/qa/assets/2026-06-10/run20/flow9-16-live-evidence.json`、`docs/qa/assets/2026-06-10/run20/flow9-16-saved-signals.png`、`docs/qa/assets/2026-06-10/run20/storage-before-flow9-16.json`。
Run 21 evidence：`tests/background-behavior.test.ts`（toggle tab-only write、topic↔product worker-restart、null-pointer guard）、`tests/use-in-page-collector-app-state.test.ts`（save trace contract）、`tests/views.test.tsx`（first-reading CTA + english-chrome ban）、`tests/targeting.test.ts`（post-root promotion contract）、`tests/processing-state.test.ts`（idle heartbeat）、full test glob `641/641` pass、typecheck pass、`npm run build` + mirror pass、`qa-code-path-audit` B-08 `hasVisibleFirstRunCta: true`。
Run 22 evidence：`docs/qa/assets/2026-06-10/run22/`。核心檔：`b05-after-second-fix-switch.json`、`b05-after-second-fix-page-reload.json`、`b05-storage-probe.json`、`b09-panel-save.json`（after 含 `已加入`）、`b10-hover.json`（`articles:[]` = detail 頁無 article wrapper）、`b02-toggle-latency-retry.json`、`b02-trace-tail.json`（idle `next-poll 12000` 心跳 + `worker.status.error` 連續接住）、`backend-job-se-ranking-missing-playwright.json`／`backend-job-maxfei22-missing-playwright.json`（B-12：job `last_error` 明確但 UI 只顯示抓取中）、`flow9-16-ui-after-crawl-success.json`（`2 signals · 2 analyses`、`分析完成`）、`flow9-16-first-reading-after-click.json`（B-08 CTA → 判讀中…）。Code 收尾 commits：`6dcf046`（B-05 第二 root cause：folder-scoped orphan cleanup + set-mode 尊重指定 session）、`1a2f33e`（B-10 detail-page pressable fallback + B-12 readiness 帶 `lastError`、卡片顯示 `抓取中（重試中）`+ 錯誤開頭）。Full glob `647/647` pass、typecheck pass、build + mirror pass。
Run 23 evidence：`docs/qa/assets/2026-06-11/run23/`。核心檔：`run23-gate-after-extension-reload.json`（Jason profile marker / root fixed host gate）、`b10-detail-post-hover.json`（detail time-link hover `hasNoSnippet=false`、snippet present）、`b12-real-reply-after-save.json`（真 reply 入 Product pending）、`b12-ui-after-job-error.json`（`hasRetrying=true`、`hasBackendErrorDetail=true`、`hasBrowserLaunchError=true`、`hasWaitingOnly=false`）、`b12-reply-draft-clear-check.json`（誤入 reply composer 的測試文字已清空）。Playwright cache 測後已還原；B-12 測試 signal 仍留在 Product folder，因刪除需 GUI confirm，已取消。
Run 24 evidence：`docs/qa/assets/2026-06-11/run24/`。核心檔：`b03-backend-restart-stamp-cleared.json`（backend 重啟後 offline stamp 清除）、`b12-manual-drain-crawl-success.json`（手按 `重新分析` 觸發 `/worker/drain`，attempt 3 crawl 成功，UI `3 signals · 3 analyses`）、`b13-before-stamp-fix-stale-backend-offline.json`（backend healthy 但 analysisError 誤標 `Backend 離線`）、`b13-after-stamp-fix-live.json`（reload 新 bundle 後無 offline stamp / 無 stale Playwright error）。Regression：`tests/views.test.tsx` 先紅後綠；驗證 `npm run typecheck` pass、full glob `647/647` pass、`npm run build` pass 並 mirror。

---

## 0. 通用基準：什麼算「好」
任一條沒過就記 bug：
- **無機器殘渣**：不出現 `undefined`/`null`/`NaN`/`[object Object]`/enum 原值（`insufficient_data`…）/prompt 碎片/JSON 殘骸。
- **語言一致**：對使用者統一繁體中文，不中英混雜、不簡繁混雜。
- **錯誤是人話**：可行動的中文，技術細節只進 console。
- **不破版**：任何內容長度 / 視窗寬度下不溢出、不裁字、不出非預期橫向卷軸。
- **不騙人**：只根據原 post、引用對得上、verdict 與證據一致。
- **可重現**：同輸入重跑結果穩定。

## 1. 嚴重度
| 級別 | 定義 |
|------|------|
| **P0** | 阻斷 / 誤導性錯誤 / 資料外洩（捏造原文、key 漏到 UI 或匯出、輸出區崩） |
| **P1** | 主要功能明顯壞（導航被卡、enum 原值外漏、長文撐破卡片、verdict 與證據矛盾） |
| **P2** | 小瑕疵不影響理解（遲滯、間距/時間格式不一致、缺 error surface） |
| **P3** | nit / 主觀（用字、對齊可更好） |

---

## 2. Flow 1–16

### 互動（Codex）

**Flow 1 — Hover → Collect** `🔬Run1: ✅`
- 目標：基本 hover overlay + collect 寫入 + UI 即時反映。
- 步驟：進 collect mode → hover 一篇 post → 移到另一篇 → 點 collect → 看 panel。
- ✅ 好的長相：overlay 準確框住 hover 卡、換 post <150ms 跟上、collect 後 item 立即入 folder、無 console error、無 storage/UI 分裂。
- ❌ 出包：overlay 框錯/飄移、collect 後 panel 不更新、卡頓。
- 記：主觀延遲、toast 文案、console。
- 🔬 Run 1（Codex）：**通過**。hover 換 post overlay/panel `~80ms` 跟上；collect 後 panel 立即「已儲存 / 已加入主題」，無分裂。**但** collect mode *開啟*同步有 `1–2s` 遲滯 → **B-02**。
- 🔬 Run 2（Codex）：**通過但 B-02 仍在**。Topic collect mode 點擊後 `250ms` 仍顯示 `收集模式：關閉`，約 `1.0–1.5s` 後才變 `Collect mode live`；hover 從 `burger66_leo` 換到 `instagram` 約 `120ms` overlay/panel 一致，collect 後 `250ms` 內顯示 `Saved / 已加入主題`。證據：`run2/flow1-hover-collect-result.jpg`。

**Flow 2 — 多 window 分裂（驗 0.1.30 sender-tab 修復）** `🔬Run1: ◑`
- 目標：focused tab ≠ Threads sender tab 時，collect 狀態仍綁正確 tab。
- 步驟：Threads tab 進 collect mode → 讓**另一個 Chrome window**變 focused → 回 Threads hover/collect。
- ✅ 好的長相：不論誰 focused，overlay + crosshair + panel collect 狀態都綁 Threads sender tab、不分裂。
- ❌ 出包：「overlay 開+crosshair 但 panel 顯示收集關閉」這種分裂；selection 落到錯 tab。
- 記：哪個 window focused、三者狀態。
- 🔬 Run 1（Codex）：**部分**。同 window 切到 `chrome://extensions` 再回 Threads → crosshair/overlay/panel 一致、collect 仍可用。**未做真正的第二個 Chrome window** → 待補（這才是原始分裂情境的最強版本）。
- 🔬 Run 2（Codex）：**通過**。Threads 進 collect mode → 開第二個 Chrome window `chrome://extensions/` 並 focus → 回 Threads hover/collect；panel 仍 `收集模式：開啟`，overlay/crosshair/panel 一致，collect 後 `350ms` 顯示 `Saved / 已加入主題`。未重現 0.1.30 sender-tab 分裂。證據：`run2/flow2-multi-window-result.jpg`。

**Flow 3 — 切 topic folder（route + activeSession drift）** `🔬Run1: ✅`
- 目標：folder 切換不漂移、route 不 bounce、collect target 正確。
- 步驟：開 Topic folder A collect → 切 Product folder B → 切回 A。
- ✅ 好的長相：切換即時、route 穩不彈、collect target = 當前 folder、切回後 item 仍在對的 folder。
- ❌ 出包：route 跳走又彈回、save 到錯 folder、target drift。
- 記：各步驟 active folder、target、route。
- 🔬 Run 1（Codex）：**通過**。Topic→Product→Topic 無 route bounce；Product collect target 正確進 Product inbox，未 drift 回 `work` folder。
- 🔬 Run 2（Codex）：**部分通過**。Product idle collect 與 active collect 均可把 `kilobtye_67` 寫進 Product Saved Signals，Saved 從 `1` 變 `2`，未再重現 Run1b 的 Product `3 → 0 signals` 分裂（**B-05 Run2 未重現，保留觀察**）。但 collect mode active 時，點 Product/Topic workspace tab 及 Threads Profile 會被 selection click handler 攔截，造成 route/切頁失敗 → 和 **B-01** 同因果鏈。

**Flow 4 — 按分析（⚠️ 真實 LLM / API key，花錢）** `🔬Run1: — / Run1b: ◑`
- 目標：分析觸發後的 loading / 遲緩 / 結果 render。
- 步驟：Product folder collect 幾篇 → 按分析 → 看 loading → 等結果。
- ✅ 好的長相：有 skeleton/loading、分析時 UI 不凍、結果即時 render、無「storage 有結果但畫面沒動」。
- ❌ 出包：完全無 loading（像當掉）、UI 凍結、結果不顯示。
- 記：loading 形式、主觀耗時、結果是否 render。
- 🔬 Run 1（Codex）：**未執行** —— 會打真實 LLM / 用 API key，未獲明確確認前不按。
- 🔬 Run 1b（Codex）：**部分執行**。使用者已授權真實 LLM；Product collect 後按「分析收件匣」。backend down 時按鈕即時進 `分析中`、約 `~1.5s` 退回，無 UI 凍結/無限 spinner，但直接顯示 raw 英文/HTTP 錯誤。啟動 `dlens-ingest-core` 後 `/worker/status` 為 `idle`，重跑卡在 `/capture-target` 500；backend log 為 Supabase/Postgres tenant/user 不存在，未進到 LLM 結果 render。錯誤顯示 → **B-04**。
- 🔬 Run 2（Codex）：**真 LLM 成功 + error path 漏洞確認**。Supabase project resume 後 DB 可連，第一次按分析送 `/capture-target` 成功但 backend job 因 Playwright browser missing 失敗；UI 顯示 `抓取中 / 等待 backend 完成 ThreadReadModel` 並停住，沒有把 job `last_error` surface 到 Product UI → **B-04**。安裝 `python -m playwright install chromium` 後重跑 drain，約 `30s` 變 `1 signals · 1 analyses`；第二條 `kilobtye_67` 從 pending 到 `2 signals · 2 analyses` 約 `45s`。loading 有 `分析中 / 抓取中 / 可分析`，UI 不凍、結果即時 render；但沒有 skeleton，且 `已加入隊列：ai discussion` toast 會殘留一段時間。
- 🔬 Run 13（Codex）：**code/control fix 完成，live 待回歸**。Product backend status error 現在進 `backendError`，header/readiness 不再在 backend down 時顯示 `AI enabled / ✓ 已就緒`；`product/analyze-signals` response 帶 `failures[]`，可把 backend item `lastErrorKind/lastError` 或 analyzer error 對回 `signalId/itemId/sourceUrl`。仍需 reload Jason profile extension 後重跑 backend down、backend job failed、no-key 三條。

**Flow 5 — Fallback / 錯誤顯示** `🔬Run1: ◑`
- 目標：沒 key / backend 不可用時 graceful、明確報錯而非靜默或無限 spinner。
- 步驟：(a) 沒設 AI key 按分析；(b) Ingest URL 改壞 → 開 folder / 觸發 backend 動作。
- ✅ 好的長相：明確中文錯誤 / fallback 文案、不無限轉圈；render crash 由 runtime-guard 紅卡接住（"DLens hit a render error."）；**主流程能讓使用者得知 backend 死了**。
- ❌ 出包：靜默失敗、無限 loading、overlay 整個消失、或**根本無從得知 backend 不可用**。
- 記：錯誤文案 / 缺口位置。
- 🔬 Run 1（Codex）：**部分 + 產品缺口** → **B-03**。壞 Ingest URL 開 Topic folder → 無 visible error，也無無限 spinner（沒崩，好的一面）；**但**主 Settings 無 backend health/error surface、folder 內無 backend refresh/start 入口、report button disabled。backend health 目前主要在 debug side panel，**不在主 extension flow** → 使用者無法在主流程察覺 backend 不可用。
- 🔬 Run 2（Codex）：**backend down 主要路徑通過；no-key 未改 profile**。關掉 backend 後按 Product `重新分析`：`500ms` 進 `分析中`，約 `2s` 主 UI 顯示 `Optional ingest backend unavailable at http://127.0.0.1:8000/capture-target... Failed to fetch`，button 恢復，沒有無限 spinner。缺口：錯誤仍是英文/raw 技術訊息，且 backend job 內部失敗（Playwright missing）不會 surface。未清除使用者 AI key，因此沒有跑 no-key 分支。
- 🔬 Run 12（Codex）：**真 Jason profile 重現 console-only health failure**。Chrome backend 成功 claim 已登入 Threads tab；Product UI 當時仍顯示 `AI enabled / ✓ 已就緒`，但 console 持續刷 `Optional ingest backend unavailable.../worker/status`，說明 backend health failure 沒有主 UI surface。
- 🔬 Run 13（Codex）：**Product 主流程 code fix 完成，B-03 仍部分 open**。Product mode 會顯示 `Backend 離線` 與中文錯誤；但 Topic/PR/Settings 的主流程 backend health affordance 仍未完整驗收，所以 B-03 不關閉。

**Flow 6 — SPA 換頁 reset / 導航** `🔬Run1: ❌`
- 目標：Threads SPA 換頁時 overlay/selection 正確 reset；collect mode 不擋導航。
- 步驟：collect mode 開著 → hover 一篇 post → 點 Threads 左側 `Profile` 換頁；另試 preview 的 `Open` / panel「在 Threads 開啟」。
- ✅ 好的長相：換頁成功、換頁後 overlay 清掉/reset、open action 正確路由。
- ❌ 出包：點擊被攔、無法換頁、overlay 黏舊 card `display:block` 不清、open 無路由。
- 記：點哪裡、overlay 殘留秒數、有無換頁。
- 🔬 Run 1（Codex）：**出包** → **B-01**。collect mode 開著、hover 後點 `Profile` **無法換頁**，overlay 被清掉或停留；preview `Open` / panel「在 Threads 開啟」**也沒路由**，overlay 仍 `display:block` 黏舊 card **>5s**。建議優先查 **collect mode click interception / open action path**。
- 🔬 Run 2（Codex）：**出包確認** → **B-01 confirmed**。Product collect mode active 時點 Threads 左側 `Profile`（link rect 約 `x=15,y=285,w=200,h=34`），`300ms / 1s / 2.5s / 5s / 8s` 後 URL 仍 `https://www.threads.com/`，panel 仍 `Collect mode live / Selection active`。code pointer：`entrypoints/threads.content.ts:383-393` 在確認有 card 前已 `preventDefault()` / `stopPropagation()`，所以點非 card 導航也會被吞。
- 🔬 Run 8（Codex）：**code/control fix 完成，live 待回歸**。`onClick()` 現在先 `findCardCandidate()`、確認 `card`、再讀 `descriptor`；只有 `descriptor` 存在時才 `preventDefault()` / `stopPropagation()`。Automated regression `threads-content.test.ts` 先紅後綠；Run8 code-path audit 顯示 B-01 pass。仍需在 Jason `Default` profile 的已登入 Threads feed 重跑：Profile navigation、workspace tab switch、真 post collect 三條。

### 互動補充（7–8）

**Flow 7 — 重複 collect / 去重** `🔬Run1b: ✅`
- 目標：同篇不重複入庫。
- 步驟：同一篇 collect 兩次（或 collect→重整→再 collect）。
- ✅ 好的長相：第二次有明確回饋（已收錄/不重複），folder 內不出現兩筆同 post。
- ❌ 出包：靜默重複入庫、或第二次無回饋。
- 記：item 數、toast。
- 🔬 Run 1b（Codex）：**通過**。已收過的 Product signal 顯示 `已儲存` / disabled `已加入產品訊號`；再點同一篇沒有重複增加，Product Saved Signals 當下維持 `3 saved / 3 signals`。
- 🔬 Run 2（Codex）：**通過**。已收 `turtle_coffee_lab` 在 Product Collect 顯示 disabled `已加入產品訊號`，再 hover/collect 不增加；新收 `kilobtye_67` 後 Product Saved Signals 從 `1 saved` 變 `2 saved`，沒有 duplicate。

**Flow 8 — 大量 item 效能** `🔬Run1b: ◑`
- 目標：item 多時不卡。
- 步驟：folder 塞 ≥30 篇 → scroll / 切 folder / 開分析。
- ✅ 好的長相：scroll 順、切換 <300ms 體感、有 skeleton 不白屏。
- ❌ 出包：scroll 掉幀、切換凍結、一次 render 塞爆。
- 記：item 數、主觀延遲、console 長任務警告。
- 🔬 Run 1b（Codex）：**部分**。沒有 ≥30 item folder；以 Topic `work`（約 15 source rows）+ Product 3 signals 代測。Product→Topic 切換 console 顯示 `popupDurationMs ~1052ms`，Topic→Product `~974ms`，體感約 1s；scroll 無白屏/崩潰。未達 ≥30 item 標準，仍待大資料夾補跑。
- 🔬 Run 2（Codex）：**部分**。仍沒有 ≥30 item folder；Product `2 signals / 2 analyses` 下切 Product 子頁、scroll、Action detail 展開均無白屏/崩潰。workspace switch console 有 `~154–1081ms` 波動；大資料夾效能未完成。

### 輸出 — 用字（Claude）

**Flow 9 — 文案自然度 / 無殘渣** `🔬Run1b: ❌`
- 目標：分析輸出通順、無機器殘渣。
- 步驟：對 3–5 篇不同 post 跑分析，逐欄看 summary / whyRelevant / reason / verdict label。
- ✅ 好的長相：通順繁中；verdict / signalType / signalSubtype / contentType 都有人類可讀中文 label；無 §0 殘渣。
- ❌ 出包：`insufficient_data`/`noise` 等原值外漏、英文 fallback（`AI judgment disabled`）、`undefined`、prompt 片段。
- 記：哪一欄 + 原始字串截圖。
- 🔬 Run 1b（Codex）：**未能產生分析輸出**（backend 500 阻塞），但 Product 主頁可見 raw `500 Internal Server Error: Internal Server Error`，屬 §0 殘渣/非人話錯誤 → **B-04**。另外同輪曾確認 Product `3 signals`，切 Topic 再回 Product 後變 `0 signals`，畫面仍有 `已加入產品訊號` toast/狀態殘留 → **B-05**。
- 🔬 Run 2（Codex）：**出包** → **B-06**。已產生 2 analyses；主內容摘要大致自然，但多處 display mapping 漏網：Classification 顯示 `collected posts`、`mixed`、`discussion_starter`、`ecommerce platform selection`、`user sentiment reflection`；Action detail 顯示 `相關度 relevance 1/5`、`子型 user sentiment reflection`、`→ Keep as observation`。這是 enum/raw label 外漏，符合 §1 P1。
- 🔬 Run 10（Codex）：**code/control fix 完成，live 待回歸**。Product UI 現在將 content type 顯示為 `內容片段 / 討論開場 / 混合內容`，已知 subtype 顯示為中文（例：`mobile_share_extension → 行動分享入口`、`user_sentiment_reflection → 使用者情緒回饋`、`ecommerce_platform_selection → 電商平台選型`），未知 subtype 顯示 `未分類訊號` 而非原字串；action cue 改為 `排入小實驗 / 保留觀察`；relevance 改為 `相關度 N/5`。Component regression 與 Run10 code audit 已綠；仍需在 Jason profile 真 UI 用 Run2 data 回歸。

**Flow 10 — 標籤 / 錯誤訊息一致性** `🔬Run1b: ❌`
- 目標：同概念同詞、錯誤是人話。
- 步驟：掃所有標籤（verdict chips / filter / 狀態）+ 觸發錯誤（接 Flow 5/15）。
- ✅ 好的長相：同概念全站同一中文詞；錯誤可行動、無 stack trace 外漏。
- ❌ 出包：同概念多種叫法、錯誤是 `Error: …` 原文或紅字 stack。
- 記：不一致詞對照、錯誤截圖。
- 🔬 Run 1b（Codex）：**出包**。Saved / Classification / Action 都殘留 `500 Internal Server Error: Internal Server Error`；Saved 另出現 `Error: Signal not found`。console 持續刷 `Optional ingest backend unavailable at http://127.0.0.1:8000/worker/status... Failed to fetch`。主 UI 應只顯示可行動中文，技術細節留 console → **B-04**。
- 🔬 Run 2（Codex）：**出包但較 Run1b 改善**。backend down 時 Product 主 UI 有明確錯誤且不 spinner，但文案仍是 raw 英文 URL/error；backend 恢復並重新分析後錯誤可被清掉。輸出 label 一致性仍壞：同一頁混 `噪音 / 前提不符`（中文）與 `user sentiment reflection` / `discussion_starter`（raw）。

**Flow 11 — 空狀態** `🔬Run1b: ◑`
- 目標：空狀態有引導不尷尬。
- 步驟：空 folder / 無 signal folder / 分析前 / 分析後無結果。
- ✅ 好的長相：每個空狀態有明確中文引導、留白合理。
- ❌ 出包：純空白、顯示 0/undefined、卡 loading。
- 記：哪個空狀態 + 截圖。
- 🔬 Run 1b（Codex）：**部分**。Product empty state 有中文引導：`收件匣沒有 signal。先在 Collect 儲存一篇 Threads post。`；分類/行動有 `尚未有 AI 分析結果...不會顯示假分類、假數字或示範案例`，方向正確。但同畫面混入 raw backend/storage error，且 Product 從 3 signals 漂成 0 signals，空狀態可信度受損 → **B-04 / B-05**。
- 🔬 Run 2（Codex）：**部分通過**。Action 預設 filter `值得嘗試 0` 顯示 `目前沒有 verdict=try 的訊號。先看保留觀察或資料不足。`，不是空白；Product pending/ready 狀態都有引導。no-key 空狀態未測，因未清除 profile 內 API key。

### 輸出 — 排版（Claude）

**Flow 12 — 長內容截斷** `🔬Run1b: ◑`
- 目標：超長內容不破版。
- 步驟：分析超長 post（含超長無空白字串）+ 看超長 summary。
- ✅ 好的長相：超過 N 行有 `…`/「展開全文」且可展開；卡片高度受控、不溢出。
- ❌ 出包：文字溢出 / 被硬裁 / 無展開 / 撐出橫向卷軸。
- 記：post 連結 + 截斷處與展開後截圖。
- 🔬 Run 1b（Codex）：**部分**。未能產生長 summary/analysis（backend 500）；現有 Product Saved/Classification/Action empty/error surface DOM overflow count = `0`。Topic `work` source rows scroll 未見白屏/破版，但未涵蓋超長 AI output。
- 🔬 Run 2（Codex）：**部分通過**。`kilobtye_67` 長 post 在 Saved/Classification 以 `…` 截斷並有 `▾ 展開全文`，沒有可見破版；Action evidence detail 的長留言也在卡內流動。DOM 偵測到 `SPAN scrollWidth > clientWidth`，但該處是 `text-overflow: ellipsis` 類型的受控截斷，不當作破版。

**Flow 13 — 混排 / 數字對齊** `🔬Run1b: ◑`
- 目標：混排不破、數字對齊。
- 步驟：挑含 中英+emoji+長URL+#hashtag+@mention 的 post；看 metrics（讚/留言/瀏覽）。
- ✅ 好的長相：長 URL/字串會 break 不撐破；emoji 不頂歪行高；metrics 對齊一致、縮寫（1.2k）統一。
- ❌ 出包：長 URL 撐爆、數字欄錯位、emoji 破行高。
- 記：哪種字元 + 截圖。
- 🔬 Run 1b（Codex）：**部分**。Feed 內含中英/emoji/數字的已收 Product posts；Product empty/error surfaces 沒偵測到水平 overflow。因無 analyses，未驗到 AI 結果卡中的混排與 metrics 對齊。
- 🔬 Run 2（Codex）：**部分通過**。Shopify/Medusa/React/emoji/港式中文混排未見視覺錯位；metrics/日期可讀。copy 層仍有英文 raw labels（見 **B-06**），但那是文案 mapping，不是排版 overflow。

**Flow 14 — 窄寬 reflow** `🔬Run1b: ◑`
- 目標：不同寬度排版不亂。
- 步驟：side panel 拉最窄；視窗 resize（含很窄）。
- ✅ 好的長相：reflow 不重疊/不裁切、按鈕仍可點、filter chips 換行整齊。
- ❌ 出包：元素重疊、按鈕被擠出、文字被切、chips 亂跳。
- 記：寬度像素 + 截圖。
- 🔬 Run 1b（Codex）：**工具限制下部分**。Computer Use 對 Chrome `get_app_state` 連續 timeout（`-10005 timeoutReached`），無法用 Computer Use 拉 side panel；AppleScript resize 可還原 Chrome window bounds，但 Chrome plugin 綁定 tab viewport 仍回報 `2160×1167`，所以不算真正窄寬驗收。現有寬 viewport 沒偵測到重疊/水平 overflow；窄 viewport 待補跑。
- 🔬 Run 2（Codex）：**工具限制仍在**。Computer Use 只能列出 Chrome app，沒有可用 `get_app_state/click`；AppleScript 把 Chrome front window 從 `{0,88,1440,900}` 改 `{0,88,900,900}` 後，Chrome automation 仍回報 `window.innerWidth=2160`、`innerHeight=1167`，無法構成窄寬驗收。寬 viewport 觀察無重疊；窄寬仍需人工或另一個可控 viewport 工具補跑。

### 輸出 — 內容正確性（Claude）

**Flow 15 — 不捏造 + 引用 + verdict 一致 + 重跑穩定** `🔬Run1b: —`
- 目標：輸出可信、引用對得上、結論自洽且穩定。
- 步驟：對熟悉內容的 post 跑分析，逐句核對 summary/evidence；點 evidence ref 看跳對；同篇連跑 2–3 次（含 clear cache）；看 verdict 與 reason/evidence 是否同向。
- ✅ 好的長相：無原文沒有的引用/數字（呼應 `5788152` remove fabricated evidence）；ref 點了對回原段落；verdict 與證據同向；同 prompt version 重跑結論穩定。
- ❌ 出包：捏造引用/數字、ref 對不上/跳錯、verdict 與理由矛盾、重跑大幅跳動。
- 記：捏造句 vs 原文、ref 連結、各次 verdict 對照。
- 🔬 Run 1b（Codex）：**未能執行**。Product analysis 被 backend `/capture-target` 500 阻塞，無 verdict/evidence/ref 可核對；不可用 deterministic 假輸出代替驗收。
- 🔬 Run 2（Codex）：**部分通過 + 一個內容語義出包**。`turtle_coffee_lab` 的 e5/e7/e8 證據能回到原文：Shopify 維護成本、Medusa/self-hosting/Stripe、React/Medusa 前端選型，summary/verdict `保留觀察` 基本自洽。`kilobtye_67` 被判 `噪音 / 前提不符` 合理，但 Action detail 同時把它包成 `可借用 workflow`、`→ Keep as observation`、`TASK › 尚未有可派發任務`，造成「明明是噪音卻像 action pattern」的語義衝突 → **B-07**。未做 2–3 次 clear-cache 重跑穩定性，避免擾動使用者 profile/storage。
- 🔬 Run 11（Codex）：**code/control fix 完成，live 待回歸**。noise/park 現在進 `data-exclusion-card="true"`，標題為 `不納入行動清單`，只顯示 `排除原因`、參考類型/帶走判斷、子型、證據數與原文摘錄；不再出現 `可借用 workflow`、`TASK ›`、`排入小實驗 / 保留觀察` 這類 action framing。Component regression 與 Run11 code audit 已綠；仍需在 Jason profile 真 UI 用 `kilobtye_67` 回歸。

### 輸出 — 匯出（Claude）

**Flow 16 — HTML export + batch 複製** `🔬Run1b: —`
- 目標：匯出物排版自洽、複製可用、不漏敏感。
- 步驟：跑 HTML signal packet export；batch export 複製到剪貼簿，貼純文字 + Notion/doc。
- ✅ 好的長相：HTML 卡片 grid 自洽、樣式內聯、可離線開；複製文字有結構、換行正確、貼別處讀得通；含來源連結/時間 provenance。
- ❌ 出包：匯出破版/樣式掉光/亂碼；複製是無結構一坨或 `[object Object]`；**洩漏 API key / 內部欄位（P0）**。
- 記：匯出檔 + 貼上結果截圖。
- 🔬 Run 1b（Codex）：**未能執行**。Product Action 無 analyses / filed readings，未出現可驗的 export/batch copy 內容；不覆寫 clipboard 來做空跑。
- 🔬 Run 2（Codex）：**blocked / UX gap** → **B-08**。已有 `2 signals · 2 analyses`，但 Saved/Classification/Action 當下沒有找到 `PACKET EXPORT`、`匯出 HTML Reading`、`複製 Agent Brief` 等可見入口。Run5 code trace 校正：並非完全沒有 first-reading path；`SignalReadingDisclosure` / `深度判讀` 存在於 Saved/selection path（`src/ui/ProductSignalViews.tsx:2208-2276, 2570, 2707`）。真正問題是 Review/Export workspace 只有 `scopedSignalReadings.length > 0` 才 render（`src/ui/ProductSignalViews.tsx:3781-3792, 3889-3902`），使用者在 0 reading 狀態下不容易發現「先生成 reading → 再進 export」的路徑。

---

## 3. Bug Log

> 截圖存 `docs/qa/assets/2026-06-09/`，檔名 = Bug ID。

| ID | Flow | 嚴重度 | 類別 | 症狀 | 重現步驟 | 預期 vs 實際 | 證據 | 狀態 |
|----|------|--------|------|------|----------|--------------|------|------|
| **B-01** | 3/6 | **P1** | 互動/導航 | collect mode 開著時點擊被攔，Threads 換頁失敗 + workspace tab / open path 易被 selection mode 吃掉 | collect mode 開 → hover 一篇 post → 點 Threads 左側 `Profile`；另在 active collect 時切 Product/Topic | 預期：非 post 點擊可正常導航 / 切頁，overlay reset；Run2 實際：URL 8s 不變、panel 仍 active；Run18 新版 live：Profile click 300ms 內到 `@bibobibobiuuuu`，overlay `none`，但 cursor 仍 crosshair；workspace/Product drift 另歸 B-05 | `run2/flow6-profile-click-5000ms.jpg` · `run8/code-path-audit-after-b01.json` · `run18/flow6-profile-nav-click-2.json` | fixed in code · Profile live passed · workspace drift moved to B-05 |
| **B-02** | 1/4 | **P2** | 效能 | 開啟 collect mode 時同步遲滯 ~1–1.5s，Product/Topic workspace switch 偶爾 ~1s | 按下開啟 collect mode，觀察 panel/overlay 同步；切 Topic/Product | 預期 <300ms；實際 collect start 約 1s 以上（hover 換 post 120ms 正常） | Codex Run 1/2 · console workspace switch timing | fixed in code (candidate) · Run21：toggle 改 tab-only storage write（不重寫全量 global blob）+ cached mode read + server timing log · Run22：3× toggle 功能正常但 wallMs ~6.7–7.2s 為自動化含 overhead 量測（`response:null`），in-page toggle pair 未捕捉，**遲滯未定案** |
| **B-03** | 5 | **P2** | 產品缺口 | 主 extension flow backend health/error surface 不完整；passive route 偵測仍可 stale | Ingest URL 改壞或停 backend → 開 Product Action / Saved；再按分析 | 預期：主流程能看出 backend 不可用；Run18 實際：backend 停掉 12s 後 Action route 仍顯示 `AI enabled / 已就緒`，按 `重新分析` 後才切到 `Backend 離線` 與中文可行動訊息；Run24 實際：backend 重啟後 Product UI 自動清除 offline stamp，回到 `分析完成 / ✓ 已就緒` | `run18/flow5-backend-down-ui.json` · `run18/flow5-backend-down-analyze-click.json` · `run24/b03-backend-restart-stamp-cleared.json` | **fixed · live passed (Run24)**：Run21 root cause 是 idle 時 coordinator 完全停 poll；改 12s 心跳。Run22 trace 證實 idle `next-poll {delayMs:12000}`；Run24 補 recovery stamp 目視，重啟 backend 後 offline stamp 清除 |
| **B-04** | 4/5/9/10/11 | **P1** | 錯誤顯示 | Product analysis error surface 不完整：raw backend/storage error 進主 UI；backend job `last_error` 不進 UI；錯誤恢復需要再按分析才清 | Product collect → backend down 或 backend job fail（Playwright missing）→ 按「重新分析」→ 切 Saved / Classification / Action | 預期：主 UI 是可行動繁中錯誤，job failure 可見且可 retry；Run13 code fix 後 Product header/readiness 顯示 `Backend 離線` + 中文錯誤，`product/analyze-signals` response 帶 `failures[]`（`signalId/itemId/sourceUrl/error/errorKind`）；Run23 B-12 recheck 證實 retrying job `last_error` 會進 pending card | `run2/flow4-locator-90000ms.jpg` · Run12 console/log · `run13/code-path-audit-after-b04.json` · `run23/b12-ui-after-job-error.json` · tests `622/622` | fixed · live passed for backend down + job last_error surface；no-key 分支未重跑 |
| **B-05** | 3/4/7/9/11 | **P1** | Product startup false-empty / session drift | Product Saved Signals 有可見完成分析後，切 Topic `work` 再回 Product 變 `0 signals / 0 analyses`，但畫面同時顯示 `已完成 1 條產品訊號分析`；latest tab UI `activeSessionId=null` | Product collect/analyze 1 篇 → Product Saved `1 signals · 1 analyses` → 切 Topic `work` → 回 Product → reload `#dlensQaTrace=1` | 預期：回 Product 後仍對齊 product session；Run18 實際：2.5s wait + reload 後仍 `0 signals / 0 analyses`；Run20 startup 先顯 `9 signals / 0 analyses`，5s 內 repair/hydrate，並完成 `9 analyses` | `run18/flow4-after-crawl-success-ui.json` · `run18/flow9-product-drift-after-wait.json` · `run20/flow9-16-live-evidence.json` | **fixed · live passed (Run22)** · 兩個 root cause：①Run21 寫入防護（sessions 存在時 null/dangling active-session pointer 不落 storage，自動回退 cache pointer → 第一個 session）②Run22 `useTopicState` orphan 清理把上一個 Product folder 的 signals 誤判成現任 folder 孤兒而刪除 + `session/set-mode` 永遠 fallback 第一個同 mode session → 改 folder-scoped 清理 + 尊重指定 sessionId（`6dcf046`）· live：Topic↔Product ×3 + reload，2 signals 全程留在正確 folder |
| **B-06** | 9/10/13 | **P1** | 輸出/label mapping | Product 輸出外漏 enum/raw 英文 label：`collected posts`、`mixed`、`discussion_starter`、`ecommerce platform selection`、`user sentiment reflection`、`relevance`、`→ Keep as observation` | 產生 Product analyses → 看 Classification / Action detail | 預期：全部使用者可讀中文 label；Run2 實際：raw enum / 英文 action copy 混入主 UI；Run20 `9 analyses` Saved/Classification/Action raw token scan = 0 | Run2 DOM evidence · `run10/code-path-audit-after-b06.json` · `run20/flow9-16-live-evidence.json` | fixed · live passed |
| **B-07** | 15 | **P1** | 輸出/語義一致 | `噪音 / 前提不符` analysis 在 Action detail 仍被包成 `可借用 workflow`、`→ Keep as observation`、`TASK`，像可採用 action pattern | `kilobtye_67` 產生分析 → Action → `噪音 / 前提不符 1` | 預期：noise/premise-mismatch 只說明為何排除，避免 actionable framing；Run20 噪音 filter 有 4 張 `data-exclusion-card="true"`，出現 `不納入行動清單 / 排除原因`，沒有 `TASK ›` / `可借用 workflow` | Run2 Action DOM text · `run11/code-path-audit-after-b07.json` · `run20/flow9-16-live-evidence.json` | fixed · live passed |
| **B-08** | 16 | **P2** | 匯出/IA | 已有 analyses 但 Review/Export workspace 被 existing `SignalReading` gate 擋住；first-reading action 存在但分散、不可發現 | Product `9 signals · 9 analyses` → Saved / Classification / Action / selected signal 搜尋 export/copy/reading controls | 預期：使用者可從分析結果清楚進入「生成 reading → review → export」；Run20 實際：`exportControls=[]`，點已分析 signal 後仍沒有 `深度判讀 / reading / Agent Brief / 匯出 / 複製` 控制 | code `src/ui/ProductSignalViews.tsx:2208-2276,2570,2707,3781-3792,3889-3902` · Run2 UI buttons · Run5 code-path audit · `run20/flow9-16-live-evidence.json` | fixed · **live passed 主路徑 (Run22)**：CTA 顯示 → 點擊 `判讀中…` → review workspace 接手（`flow9-16-first-reading-after-click.json`）· export/copy 控制與 Flow 16 收尾未驗 |
| **B-09** | 1 | **P1** | Collect click path | Product collect panel 的 `加入產品訊號` button 點擊後沒有 save，只有 content trace `pass-through no-card`；鍵盤 `S` 同一 hover target 可成功 save | Product Collect mode → hover second post → click panel `加入產品訊號` → 對照 count；再按 `S` | 預期：panel button 和 keyboard save 等價；Run18 實際：click 後 Product session items/count 不變，按 `S` 後 `signalCount` 增加並 toast `已加入產品訊號` | `run18/flow1-after-collect.json` · `run18/storage-after-flow1-collect-click.json` · `run18/flow1-after-keyboard-save.json` | **fixed · live passed (Run22)**：panel `加入產品訊號` 在 Run19 viewport host 下產生 `已加入` toast、signals 入列（`b09-panel-save.json` before/after）；root cause 確認為 host hit-test（與 launcher 同源），save path 本身無 bug |
| **B-10** | 1/7 | **P2** | Hover parser / nested target | hover nested/time link 時 preview 變成 `Saved 2 2h / No snippet`；soft card 曾把 author 抽成長內文 | Collect mode → hover post time link 或 soft inner card → 看 preview descriptor | 預期：無論 hover 到 card 內哪個可點子元素，都能回到同一 post descriptor；實際：nested target 造成 descriptor 缺 snippet，soft card author extraction 錯 | `run18/flow1-hover-two-posts.json` · `run18/flow7-duplicate-collect-4.json` · `run23/b10-detail-post-hover.json` | **fixed · live passed (Run23)**：Run21 promotion 只認 article，Run22 發現 post detail 無 article wrapper（`b10-hover.json` `articles:[]`）→ `1a2f33e` fallback 到 `div[data-pressable-container]`（article 優先，feed/quoted-post 行為不變）。Run23 detail time link hover `hasNoSnippet=false`、`hasSeRanking=true`、snippet present |
| **B-11** | 10 | **P2** | 文案一致性 | Product output 已修 raw enum，但仍混英文 UI chrome：`Agent Brief`、`AI enabled`、`TASK ›`、`Saved Signals` | Run20 `9 analyses` → Saved / Classification / Action 掃 UI labels | 預期：使用者-facing chrome 統一繁中；實際：功能可理解但語言混雜 | `run20/flow9-16-live-evidence.json` | fixed · **live passed 目視 (Run22)**：snapshots 出現 `已存訊號`／`分析完成`／`尚無結果`（`flow9-16-ui-after-crawl-success.json`）；殘留英文 chrome（`READING REVIEW`、`Product mode`、`Process All` 等）超出 Run20 四 token 範圍，待用戶定 |
| **B-12** | 4/5 | **P2** | 錯誤顯示 | backend job 重試中帶明確 `last_error`（如 Playwright binary 缺失，attempt 2/3），前端 pending card 只顯示 `抓取中／等待 backend 完成 ThreadReadModel`，使用者無從得知卡在哪 | backend 缺 Playwright binary（或任何 crawl 錯誤）→ Product collect → 看 Saved 等待區 pending card | 預期：retry 中的 job error 對使用者可見可行動；Run22 實際：job `last_error_kind=unexpected_runtime_error` + 完整 Playwright 錯誤在 backend，UI 零提示；Run23 實際：同類 Playwright missing error 顯示在 pending card；Run24 實際：backend 重啟後 passive health poll 未自動 drain 舊 retry job，手按 `重新分析` 後 attempt 3 crawl 成功，pending card 清除 | `run22/backend-job-se-ranking-missing-playwright.json` · `run22/flow9-16-ui-during-backend-retry-backoff.json` · `run23/b12-ui-after-job-error.json` · `run24/b12-manual-drain-crawl-success.json` | **fixed · live passed (Run24)**：`1a2f33e` 讓 readiness 帶 `item.lastError`，crawling/failed 卡片顯示 `抓取中（重試中）` + `backend 回報錯誤：`；Run24 補 clear path，manual drain 後 UI 到 `3 signals · 3 analyses`。Watch：passive health poll 只更新健康狀態，不會自動啟動舊 retry job |
| **B-13** | 4/5/10/11 | **P2** | 錯誤顯示 | backend healthy 時，舊 `analysisError` 仍讓 Product header stamp 顯示 `Backend 離線` | B-12 殘留 job 成功後，backend `/worker/status` 回 `idle`，但 tab error/analysisError 尚有舊 Playwright 錯誤 | 預期：只有 backendError 才顯示 `Backend 離線`；analysisError 應顯示部分分析失敗，不把系統健康誤報為離線。Run24 實際：backend healthy + `3 analyses` 時 header 仍顯示 `Backend 離線` | `run24/b13-before-stamp-fix-stale-backend-offline.json` · `tests/views.test.tsx` | **fixed · live passed (Run24)**：`ProductSignalView` stamp 拆分 backendError / analysisError；analysisError 顯示 `部分失敗`。Reload `output/chrome-mv3` 後 live：`分析完成 / ✓ 已就緒 / 3 signals · 3 analyses`，無 offline stamp、無 stale Playwright error（`b13-after-stamp-fix-live.json`） |

---

## 4. Run 3 Deep Trace

### 4.1 Runtime / tooling preflight

這輪不把「無法登入 feed」記成 DLens 產品 bug，也不把 debug/mockup side panel 當 extension 測試結果。

| 項目 | 結果 | 對 audit 的影響 |
|------|------|----------------|
| DevTools target | 第一個 snapshot 是 `DLens · 2027 Design Gallery` local mockup，不是 Threads extension runtime | 該 snapshot 只能證明工具選錯 target；不得拿來判斷 hover/collect |
| Threads target | DevTools 新開 `https://www.threads.com/` 後只看到 `Say more with Threads / Continue with Instagram Log in` | 代表這個 DevTools browser context 沒有可用 Threads session，不能跑 Flow 1/2/6 |
| Chrome profile | Chrome Preferences 顯示 `Default` profile 對應 `jason@brandonproject.co`；後續只用 `--profile-directory=Default` | 符合使用者指定 profile；不能再切去其他 Gmail / UCS profile |
| Web session | `Default/Cookies` 有 `.threads.com` / `.instagram.com` rows；但 DevTools Threads snapshot 兩次都停在 `Continue with Instagram Log in` modal | profile/cookie 存在不等於目前 automation context 可進 feed；需要先用 `Default` profile 打開已登入 feed，或讓 DevTools 連到那個已登入 window |
| Computer Use | `get_app_state(Google Chrome)` 回 `-10005 timeoutReached` | 窄寬 reflow / 真 UI drag 仍不能靠 Computer Use 可靠量測；需改用 Chrome automation 可控 viewport 或人工補圖 |
| Backend | private backend 可啟動；Run2 已確認 Supabase resume 後 `/capture-target` 與 LLM 能跑 | Run3 沒有新 feed target，所以不重打 LLM；backend 狀態不是本輪阻塞點 |

下一輪要先通過這個 gate：Chrome `Default` profile 的 Threads feed 必須已登入，且 DevTools/Computer Use 目標頁標題必須是 Threads feed，不是 local mockup / debug page / login page。

### 4.2 Root-cause matrix

| Bug | 已觀察 runtime 症狀 | 目前 trace 到的 code path | 為什麼會壞 | 建議修法 / 控制變因 |
|-----|----------------------|---------------------------|------------|---------------------|
| **B-01 click interception** | collect mode active 後，點 Threads `Profile` 或 workspace tab 8s 內 URL 不變；overlay/navigation reset 沒機會跑 | Run2 bad path：`entrypoints/threads.content.ts:383-393` 在 guard 前攔截。Run8 fixed path：`preventDefault`/`stopPropagation` 已移到 `card + descriptor` guard 後 | 原因是 capture 階段吞掉所有非 control-surface click；Run8 已讓非 card / 無 descriptor click pass-through，避免 SPA route 被攔 | 已加 regression：`collect mode click interception only happens after a collectable card descriptor is resolved`。下一步 live 回歸：collect mode active + 點左 rail Profile、點 extension workspace tab、點實際 post card collect 三條 |
| **B-02 mode-start lag** | 開 collect mode 約 `1.0-1.5s` 才從 panel 同步到 content；hover 換 post `~120ms` 正常 | 未定位單一壞 line；可疑段是 popup start → background snapshot write/broadcast → content `state/get-active-tab`/remote start → panel re-render | hover path 已快，慢點集中在「啟用模式」的一次性跨 MV3 worker/storage/message 往返 | 加 `performance.mark()`：button click、background receive、snapshot saved、content `startSelectionMode()`、panel text changed。先別盲目調 debounce，因為 120ms hover 已合格 |
| **B-04 Product error surface** | backend down 會 raw English URL error；backend job internal fail（Playwright missing）時 UI 停 `抓取中`，不顯示 `last_error` | Run13 fixed path：`useProcessingCoordinator` 回傳 `workerError`；`ProductSignalView` 接 `backendError` 並顯示 `Backend 離線`；`product/analyze-signals` summary 加 `failures[]`（`signalId/itemId/sourceUrl/error/errorKind`）；raw response/catch error 改走 `getProcessingFailureUiMessage()` | 原因是 error 已在資料層與 console，但 Product readiness/header 沒有讀出，且 analyze catch 直接把 raw technical error 給使用者；Run13 已把 UI error 與 response detail 補上 | 已加 regression：backend down 時 Product 有 analyses 也不能顯示 `AI enabled / ✓ 已就緒`；第一筆 failed item/job 要有中文摘要。下一步 live 回歸：reload extension 後測 backend down、job failed、no AI key 三條 |
| **B-05 Product startup false-empty** | Product reload/切回時一度顯示 `0 signals / 0 analyses`，但 storage 仍有 active product session 與 items，第二次 reopen 恢復 | Run16 fixed UI path：`useInPageCollectorAppState` 追蹤 `isHydratingProductSignals`；`ProductSignalView` hydrating 時 render `data-product-hydrating="true"` / `讀取中`。Run14/16 trace path：`popup.topic.hydrate.*`、`popup.product.hydrate.*` | 原因分兩層：使用者可見的 false-empty 是 hydration 未完成被呈現成空資料；真 session/storage drift 尚未被新版 live trace 證實 | 已加 regression：hydrating 時不可出現 `No result` / `尚未有 AI 分析結果`。下一步 live 回歸：reload 後立刻開 Product，對照 hydration trace、storage probe、visible count |
| **B-06 raw labels** | Classification / Action 混出 `collected posts`、`mixed`、`discussion_starter`、`user sentiment reflection`、`relevance`、`Keep as observation` | Run2 bad path：schema enum 直接進 display layer。Run10 fixed path：`ProductSignalViews.tsx` 新增 content/subtype/relevance/action display helpers，rawDisplayHits=[] | 原因是 provider schema enum 被當成 UI copy；Run10 已把 UI 顯示和 storage enum 拆開，未知 subtype 顯示 `未分類訊號` | 已加 Product UI regression：raw `collected posts` / subtype / content type / English CTA / `relevance N/5` 不可出現。下一步 live 回歸：Run2 兩條 Product analyses 在 Classification / Action detail 中重掃 DOM text |
| **B-07 noise semantics** | `噪音 / 前提不符` item 仍出現 `可借用 workflow`、`TASK`、`Keep as observation`，使用者會以為可採用 | Run2 bad path：park/noise 走共用 action card。Run11 fixed path：`ProductSignalViews.tsx` 新增 `isExcludedActionSignal()`，noise/park 直接 render `data-exclusion-card="true"` | 原因是 verdict 是「排除/不相關」，但 UI slot 還套「行動 pattern」模板；Run11 已把 exclusion card 和 try/watch action card 分開 | 已加 Product UI regression：noise/park 不可出現 `可借用 workflow`、`TASK ›`、action cue。下一步 live 回歸：一篇 true try、一篇 observe、一篇 noise 同頁比較 |
| **B-08 export IA gate** | 已有 `2 signals · 2 analyses` 時，Run2 沒找到 Signal Packet export / Agent Brief copy 入口；Run5 確認 first-reading disclosure 存在但和 review/export workspace 分散 | `ProductSignalViews.tsx:2208-2276,2570,2707` 有 `SignalReadingDisclosure` / `深度判讀`；`ProductSignalViews.tsx:3781-3792,3889-3902` 只有 `scopedSignalReadings.length > 0` 才 render `SignalReadingReviewWorkspace` / export path | first-reading action 和 review/export affordance 不在同一條明顯路徑；0 reading 狀態下使用者不知道要先生成 reading，export workspace 也不出現 | 當 analyses 存在但 readings 為 0 時，在 Action/Saved analysis detail 或 empty review workspace 顯示明確 first-run CTA。補 Flow16 測：0 readings → create → review → export |

### 4.3 下一輪控制變因

1. **Auth gate**：先確認 Chrome `Default` profile 的 Threads feed 已登入；DevTools snapshot 必須看見 feed post，而不是登入頁。
2. **Window gate**：Flow 2 固定用兩個 Chrome windows：A = Threads feed，B = `chrome://extensions/`；記 focused window 和 sender tab。
3. **Backend gate**：每跑 Flow 4/5 前記 `/worker/status`、backend terminal error、Product UI copy；backend down / job failed / no-key 三種分開。
4. **Storage gate**：針對 B-05，在每次 folder switch 前後 dump Product session id、signal count、analysis count、`activeSessionId`，避免只說「漂移」。
5. **Output gate**：Flow 9–16 不只截圖，還要抽 DOM text，掃 raw enum / English fallback / overflow；每條 raw 字串對回 source line。

### 4.4 Run 14 Trace Protocol

Run14 開始，任何 live Flow 1–16 都必須先啟用 trace。automation 預設用 URL/hash gate，因為 Chrome backend 目前不能可靠寫入 Threads page 的 `sessionStorage`：

```text
https://www.threads.com/?dlensQaTrace=1
https://www.threads.com/#dlensQaTrace=1
```

頁面載入後，先在 DevTools console 確認這個 marker；若不是 `run14-url-trace-v1`，代表 Jason profile 仍載入舊 unpacked bundle，不能把結果當新版回歸：

```js
document.querySelector("#__dlens_extension_v0_root__")?.getAttribute("data-dlens-qa-trace-version");
```

手動 DevTools 也可以用 storage gate：

```js
sessionStorage.__DLENS_QA_TRACE__ = "1";
window.__DLENS_QA_TRACE__ = [];
window.__DLENS_QA_TRACE_SEQ__ = 0;
```

每個 Flow 結束後匯出：

```js
copy(JSON.stringify(window.__DLENS_QA_TRACE__ || [], null, 2));
```

把輸出存到 `docs/qa/assets/2026-06-10/runN/flowX-trace.json`，再產生 latency summary：

```bash
node scripts/qa-trace-summary.mjs \
  --trace docs/qa/assets/2026-06-10/runN/flowX-trace.json \
  --out docs/qa/assets/2026-06-10/runN/flowX-summary.json \
  --markdown docs/qa/assets/2026-06-10/runN/flowX-summary.md \
  --label runN-flowX
```

同輪再附：

```bash
node scripts/qa-storage-probe.mjs --out docs/qa/assets/2026-06-10/runN/storage-after-flowX.json
node scripts/qa-runtime-probe.mjs --out docs/qa/assets/2026-06-10/runN/runtime-after-flowX.json
```

Trace event 對應的診斷意義：

| Trace event | 用來量什麼 | 若慢 / 缺 event，優先查 |
|-------------|------------|-------------------------|
| `popup.collect.toggle.request` → `popup.collect.toggle.response` | 點「收集模式」到 background snapshot 回來的 round trip | background `selection/start-active-tab`、tab resolution、storage write/broadcast |
| `content.selection.start` | content script 真正進 selection mode 的時間 | sender-tab message path、content startup rehydrate |
| `content.hover.card-change` → `content.overlay.render` | hover 到 overlay 框出現的 view-time | `findCardCandidate`、overlay DOM write、SPA card geometry |
| `content.hover.intent-fired` → `content.hover.publish` | soft hover debounce + descriptor extraction | `HOVER_INTENT_DELAY_MS`、`buildTargetDescriptor`、post card parser |
| `content.collect.click.capture` → `content.collect.save.response` | 點 collect 到 save response 的完整 latency | live target channel、`session/save-current-preview`、snapshot lock、signal creation |
| `popup.topic.hydrate.request` → `popup.topic.hydrate.response` | topic/signal list hydration 是否晚於 Product render | `topic/list`、`signal/list`、active folder mode/session id |
| `popup.product.hydrate.request` → `popup.product.hydrate.response` | Product analyses/current/historical/readings hydration 是否晚於第一屏 | `product/list-signal-analyses`、signalIds gate、reading gate、B-05 transient split |
| `popup.product.analyze.request` → `popup.product.analyze.response` | Product 分析按下到 response / queue summary 的 latency | `product/analyze-signals`、backend queue/drain、provider call |
| `popup.worker.status.request` → `popup.worker.status.response` | `/worker/status` poll latency | backend health、worker route、network failure |
| `popup.worker.status.error` + `popup.worker.next-poll` | fallback/backoff 是否可見且 bounded | `getPollingDelayMs`、error mapping、Product header/readiness surface |
| `popup.worker.refresh.request` → `popup.worker.refresh.response` | backend 完成後刷新 session 的 latency | `session/refresh-all`、capture/job fetch、storage merge |

每次完整 run 的報告格式：

| Flow | Trace 檔 | console error/warn | storage delta | backend log | 結論 |
|------|----------|--------------------|---------------|-------------|------|
| 1 | `flow1-trace.json` | 摘要，不貼 raw spam | activeSession / signal count before-after | n/a | overlay latency、collect latency、UI 是否即時 |
| 2 | `flow2-trace.json` | sender-tab / focused-window 差異 | tab UI key before-after | n/a | 有無 state split |
| 4 | `flow4-trace.json` | analyze / worker status | item status + failures[] | `/capture-target`、worker drain、provider | loading / freeze / result render |
| 5 | `flow5-trace.json` | backend/no-key error | error field before-after | backend down / no-key | fallback 是否人話 |

### 4.5 Reproducible preflight probe

新增 `scripts/qa-runtime-probe.mjs`，用途是把每輪 QA 的入口條件變成可重跑 JSON，而不是口頭描述。

Run 4 執行：

```bash
node scripts/qa-runtime-probe.mjs --profile-directory Default --out docs/qa/assets/2026-06-10/run4/preflight.json
node scripts/qa-runtime-probe.mjs --profile-directory Default --out docs/qa/assets/2026-06-10/run4/preflight-backend-up.json
```

| Evidence | Backend | Profile | Tabs | Build | Code-path hints |
|----------|---------|---------|------|-------|-----------------|
| `run4/preflight.json` | `fetch failed` at `http://127.0.0.1:8000/worker/status` | `jason@brandonproject.co` / hosted domain `brandonproject.co` | mockup + two `https://www.threads.com/` tabs | `DLens v3` MV3 `0.1.30` | B-01 `preventDefault`/`stopPropagation`; B-06 raw `relevance`/`collected posts`/`Keep as observation` |
| `run4/preflight-backend-up.json` | `200 {"status":"idle"}` | same | same | same | same |

這個 probe 不做三件事：不讀 extension storage、不改 Chrome state、不送 `/capture-target`。它只回答「我是不是在正確 profile、正確 build、正確 backend 狀態、正確 browser target」這幾個 QA 前置問題。完整 Flow 1–16 還是必須在已登入 Threads feed 上跑。

### 4.6 Code-path audit probe

新增 `scripts/qa-code-path-audit.mjs`，用途是把已重現的 runtime bug 綁到可重跑的 line-level checks。這不是 live Chrome QA 的替代品；它是修 bug 前後的對照尺。

Run 5 執行：

```bash
node scripts/qa-code-path-audit.mjs --out docs/qa/assets/2026-06-10/run5/code-path-audit.json
node --check scripts/qa-code-path-audit.mjs
node --check scripts/qa-runtime-probe.mjs
npx tsx --test tests/product-routing.test.ts tests/inpage-collector-state-split.test.ts tests/components.test.tsx tests/views.test.tsx tests/product-signal-analysis.test.ts tests/product-signal-storage.test.ts tests/processing-state.test.ts
```

Run 5 結果：

| Check | 狀態 | 主要 evidence |
|-------|------|---------------|
| B-01 | fail | `entrypoints/threads.content.ts:383-431`；`preventDefault`/`stopPropagation` 在 `findCardCandidate`、`!card`、`!descriptor` guard 前 |
| B-04 | fail | UI 直接 render `response.error` / thrown `error.message`；background summary 不帶 failed item/job detail；storage 已有 `lastErrorKind/lastError` |
| B-06 | fail | raw display hits：`formatSubtype` 只換空格、`relevance {score}/5`、`analysis.contentType`、`collected posts`、`TRY experiment` / `Keep as observation` |
| B-07 | fail | `parkItems` 進 Action board，並共用 `Keep as observation`、`TASK ›`、`可借用 workflow` framing |
| B-08 | warn | `SignalReadingReviewWorkspace` 被 `scopedSignalReadings.length > 0` gate 擋住；但 `SignalReadingDisclosure` / `深度判讀` first-reading path 存在，問題是 IA 分散 |

Targeted QA suite：`136/136` pass。涵蓋 Product routing、state split、components、views、product signal analysis/storage、processing state。這只證明既有 automated contracts 綠；不覆蓋 DevTools login/feed、real hover timing、Flow 4 真 LLM latency、或 Flow 16 實際匯出物。

### 4.7 Chrome automation boundary

Run 6 把「為什麼 DevTools 看不到真 extension runtime」拆清楚：

| Layer | Evidence | 結論 |
|-------|----------|------|
| DevTools MCP Chrome | `chrome.processes.processes[]` 顯示 `userDataDir=/Users/tung/.cache/chrome-devtools-mcp/chrome-profile`、`hasRemoteDebuggingPipe=true`、`hasDisableExtensions=true`、`hasEnableAutomation=true` | 這是工具自己的 isolated Chrome，不是使用者 `Default` profile；也沒有 DLens extension |
| User Chrome | 另一個 Chrome browser process 存在，`hasDisableExtensions=false`、`hasEnableAutomation=false`、`remoteDebuggingPort=null`、`hasRemoteDebuggingPipe=false` | 使用者 Chrome 可能是正確 extension/browser session，但目前沒有 CDP endpoint 可被 DevTools/Playwright 接入 |
| CDP ports | `9222/9223/9224/9333/9444/9515` 全部 `fetch failed` | 不能靠 `connectOverCDP` 接到使用者 Chrome |
| Computer Use | `get_app_state(Google Chrome)` 仍回 `-10005 timeoutReached` | 不能靠 Computer Use 點擊/截圖使用者 Chrome |
| Profile metadata | `profileInfo.user_name=jason@brandonproject.co`，profile root cookies 有 Threads/Instagram rows | profile 指向正確；問題是 automation context 和使用者 Chrome session 分離 |

Run 9 重試結果不變：Computer Use 三種 selector 全部 timeout；Chrome DevTools snapshot 儲存在 `run9/devtools-current.snapshot.txt`，內容仍是 Threads login modal（`Say more with Threads` / `Continue with Instagram Log in`），不是 Jason 已登入 feed，也沒有 DLens extension UI。這輪只確認 build 後 extension 目錄更新，不能算 Flow 1–16 live rerun。

後續要完成 live Flow 1–16，需要其中一個條件成立：

1. 使用者 Chrome 以 remote debugging port 重啟，讓 automation 能接入已載入 DLens 的 `Default` profile。
2. Chrome plugin / Computer Use 能取得使用者 Chrome 的 accessibility/screenshot/click 控制權。
3. 使用者在 DevTools MCP 的 isolated Chrome 重新登入 Threads 並載入 unpacked extension；但目前該 Chrome 有 `--disable-extensions`，所以這條不適合測 DLens extension。

### 4.7 Read-only storage log probe

新增 `scripts/qa-storage-probe.mjs`，用途是用 read-only 方式讀 DLens extension 的 Chrome Local Extension Settings write-ahead `.log`，補足 UI 無法操作時的 storage/state evidence。

Run 7 執行：

```bash
node scripts/qa-storage-probe.mjs --out docs/qa/assets/2026-06-10/run7/storage-probe.json
node --check scripts/qa-storage-probe.mjs
```

Scope 限制：

- 只解析 `.log` write batches，不解 compressed `.ldb` SSTables。
- 不等同完整 `chrome.storage.local` export。
- 不寫入、不刪除、不清 cache。
- 可用來追 `dlens:v0:global-state` / current `tab-ui` 的最近狀態，但不能單獨證明 v1 signals / analyses 完整性。

Run 7 結果：

| Field | Evidence |
|-------|----------|
| latest log keys | `dlens:v0:global-state`、`dlens:v0:tab-ui:203544464` |
| active session | `session_ywskiblc_mp6p013z` / `ai discussion` / `mode=product` / `11 items` |
| active item status mix | `10 succeeded`、`1 saved`；`10` items 有 `jobId/captureId/latestCapture`；`lastError=0` |
| latest Run2 collected items | `turtle_coffee_lab` succeeded（completed `2026-06-09T15:50:58.988Z`）；`kilobtye_67` succeeded（completed `2026-06-09T16:03:42.131Z`） |
| tab UI | `popupOpen=true`、`currentMainPage=saved-signals`、`popupPage=saved-signals`、`selectionMode=false`、`activeItemId=item_e1csglaw_mq6trnmc` |
| B-05 clue | 存在 `session_yc8do3rm_mp11oty3`：name=`Product workspace` 但 `mode=topic`、`7 items`；這會讓「Product workspace」文字和真 product mode session 混淆 |

B-05 目前判讀：Run12 已重現 transient split：Threads reload 後 Product UI 一度顯示 `0 signals / 0 analyses`，但 read-only storage 仍顯示 active product session `ai discussion` 有 `11 items`，第二次 reload/reopen 又恢復 `2 signals · 2 analyses`。這不像資料刪除，比較像 popup startup/read path 先讀到空 signal/analysis slice，再被後續 sync 修正。舊 `Product workspace` topic session 仍是命名混淆線索。下一次 live run 要在每次 reload/open/folder switch 前後同時記：visible folder label、`activeSessionId`、session `mode`、signal count、analysis count、tab UI key。

### 4.8 Run 18 Live Jason Profile Regression

Run 18 是新版 bundle marker confirmed 的 live run：Chrome plugin claim 使用者真實 Chrome tab `(4) Home • Threads`，profile 由 `Local State` 確認為 `Default / jason@brandonproject.co`，root marker 為 `run14-url-trace-v1`。Computer Use `get_app_state(Google Chrome)` 仍 `-10005 timeoutReached`，因此可用的真 profile 操作主要走 Chrome plugin 的 CUA/locator；這不是 DevTools isolated profile。

| Flow | 結論 | 主要 evidence |
|------|------|---------------|
| 1 | **部分通過 + B-09/B-10**。hover overlay 可跟上，keyboard `S` save 後 UI 即時增 count；但 panel `加入產品訊號` click no-op，soft/nested hover descriptor 仍會抽錯。collect toggle response 約 `0.95–1.17s`。 | `run18/flow1-hover-two-posts.json` · `run18/flow1-after-collect.json` · `run18/flow1-after-keyboard-save.json` |
| 2 | **部分通過**。切到 Supabase tab 再回 Threads，overlay/crosshair/panel 一致且 save 成功；`chrome://extensions` 因 Chrome plugin 不能 claim internal tab，未算完整二窗驗收。 | `run18/flow2-after-supabase-focus-return.json` · `run18/flow2-after-hover-save.json` |
| 3 | **失敗，B-05 confirmed**。Topic `work` collect 成功，但 Product→Topic/Topic→Product 後 active session 漂移；Product 回來後變 `0 signals / 0 analyses`，同時仍顯示完成 1 條分析。 | `run18/flow3-after-product-back-topic.json` · `run18/flow9-product-drift-after-wait.json` |
| 4 | **通過但樣本小**。backend up 後 fresh Product collect 1 篇；按分析後 `9.3s` 回 `queued:1`，backend crawl `33.2s`，約 `68s` 後 Product 顯示 `1 signals · 1 analyses`；Action route 即時 render，但該 signal verdict 是 `保留觀察`，無 try card。 | `run18/flow4-after-click-analyze-12s.json` · `run18/flow4-after-crawl-success-ui.json` · `run18/flow4-after-open-action-route.json` |
| 5 | **部分通過 + B-03 watch**。backend down 後 passive Action route 12s 仍顯示 `AI enabled / 已就緒`；按 `重新分析` 後 0.4s 內顯示 `Backend 離線`、中文可行動錯誤，無 raw stack、無 infinite spinner。no-key 未測，因會改 Jason profile 的真 API key。 | `run18/flow5-backend-down-ui.json` · `run18/flow5-backend-down-analyze-click.json` |
| 6 | **通過但 selection cursor 未 reset**。collect mode active 時點 Threads `Profile`，300ms 內 URL 到 `@bibobibobiuuuu`，overlay `none`，舊 B-01 導航攔截未重現；body cursor 仍 `crosshair`，可後續判斷是否要在 SPA route 後取消 selection mode。 | `run18/flow6-profile-nav-click-2.json` |
| 7 | **通過但 B-10**。同一 post 重複 save 顯示 `Saved`，Product count 不增；但 hover 到 time link 時 preview 變 `No snippet`，代表 nested target descriptor 還不穩。 | `run18/flow7-duplicate-collect-4.json` |
| 8 | **部分通過**。沒有 ≥30 folder；Topic `work` 約 15 source rows，scroll 無白屏，切 Topic / open work 各約 `2.4s`（含固定等待），仍偏慢；Topic header 顯示 `0 訊號 15/0 已分析` 是計數矛盾。 | `run18/flow8-topic-switch-scroll-2.json` |
| 9–10 | **部分 blocked**。Product output drift 後只有 empty/error surface 可掃；DOM raw hits = `0`，backend error 是中文可行動訊息。不能驗完整 Classification/Action label，因 B-05 讓分析列表漂成空。 | `run18/flow9-16-quality-scan-current-product.json` |
| 11 | **部分通過但可信度受 B-05 影響**。空狀態有中文引導，但同時出現 `0 signals / 0 analyses` 與 `已完成 1 條產品訊號分析`，使用者會被誤導。 | `run18/flow9-product-drift-after-wait.json` |
| 12–14 | **部分通過 / 工具受限**。寬 viewport 未見真 overflow；overflow scan 3 項都是受控外層 scroll 或字型高度微差。Computer Use 不能抓 Chrome state，所以仍未完成真窄寬 drag 驗收。 | `run18/flow9-16-quality-scan-current-product.json` |
| 15 | **blocked**。Flow 4 只得到 1 條 `保留觀察` analysis，且 B-05 後 Product list 漂空；未做 clear-cache / 2–3 次重跑，避免擾動 profile。 | `run18/flow4-after-open-action-route.json` |
| 16 | **blocked**。B-05 漂空後 export controls scan = `0`；既有 B-08 仍成立，未能完成 HTML export / batch copy。 | `run18/flow9-16-quality-scan-current-product.json` |

### 4.9 Run 20 Flow 9–16 Live Regression

Run 20 是 Run19 launcher host fix 後的 live run：Chrome plugin claim 使用者真實 Chrome tab `(4) Home • Threads`，profile 為 `Default / jason@brandonproject.co`，root marker `run14-url-trace-v1`，且 root style 已是 fixed viewport host（`pointer-events:none`），launcher/popup opt back into `pointer-events:auto`。backend `/worker/status` 為 `{"status":"idle"}`。

| Flow | 結論 | 主要 evidence |
|------|------|---------------|
| 9 | **通過**。Saved / Classification / Action DOM raw scan = `0`；未再出現 `collected posts`、`mixed`、`discussion_starter`、`user sentiment reflection`、`Keep as observation`、`undefined/null/NaN/[object Object]`。 | `run20/flow9-16-live-evidence.json` |
| 10 | **部分通過 + B-11**。錯誤無 raw stack / HTTP leak；但使用者-facing chrome 仍有 `Agent Brief`、`AI enabled`、`TASK ›`、`Saved Signals` 等英文 label。 | `run20/flow9-16-live-evidence.json` |
| 11 | **通過**。startup / empty / loading / completed 狀態有明確引導：`有 signal 尚未抓取`、`分析中`、`9 signals · 9 analyses`、`分析完成，查看哪些 signal 值得行動`。 | `run20/flow9-16-live-evidence.json` |
| 12 | **通過**。長內容在 list row 以 ellipsis 截斷；Classification 內容有 `▾ 展開全文`；未見非預期橫向卷軸。 | `run20/flow9-16-saved-signals.png` · `run20/flow9-16-live-evidence.json` |
| 13 | **通過但 watch**。中英日混排、emoji、長中文句、metric chips 未重疊；overflow scan 命中的都是 `text-overflow: ellipsis` 的受控 list row。 | `run20/flow9-16-live-evidence.json` |
| 14 | **未完整驗收**。Chrome connector viewport 固定 `2160px`，Computer Use 仍不可用，因此未能做真窄寬 drag/reflow。寬 viewport 無重疊。 | `run20/flow9-16-live-evidence.json` |
| 15 | **通過但未做穩定性重跑**。Action try cards 的 evidence ref 直接顯示原文和模型判讀；noise filter 4 張卡都是 `data-exclusion-card="true"`，沒有 action framing。未做 clear-cache / 2–3 次重跑，避免擾動 Jason profile。 | `run20/flow9-16-live-evidence.json` |
| 16 | **失敗，B-08 live confirmed**。已有 `9 signals · 9 analyses`，Saved list、已分析 signal click 後、Classification/Action 都沒有可見 `reading / 深度判讀 / export / copy / Agent Brief` 控制，`exportControls=[]`。 | `run20/flow9-16-live-evidence.json` |

### 4.10 Run 21 Code Patch Round（B-02/03/05/08/09/10/11）

Run 21 是純 code 輪（無 live）：把 Run 18/20 留下的 7 個 open bug 全部落地成 fix + regression。基線先鎖 commit `556c956`（Run8–19 fixes + QA tooling）與 `c4360c3`（QA doc + evidence），再逐 bug TDD（先紅後綠）。

| Bug | 修法 | 主要檔案 | Regression |
|-----|------|----------|------------|
| B-09 | Run19 viewport host 已解 hit-test root cause（Run18 `pass-through no-card` 證明 click 物理落在面板底下的頁面元素，非 handler bug；button 與鍵盤 `S` 本來就走同一條 `buildPreviewSaveMessage` save path）；Run21 補 `popup.collect.save.request/response` trace（`via: "button"/"keyboard"`），live 一看即知 handler 有無 fire | `src/ui/useInPageCollectorAppState.ts` | save trace contract（`tests/use-in-page-collector-app-state.test.ts`） |
| B-05 | `saveSnapshot`／`saveActiveSessionSnapshot` 經 `withPersistableActiveSessionId`：sessions 存在時 null/dangling pointer 不落 storage（回退順序：cache pointer → 第一個 session；無 sessions 時 null 合法）；`session/set-mode` console.info 帶 `activeSessionIdBefore/After` | `entrypoints/background.ts` | topic↔product 跨 worker 重啟序列 + null-pointer guard（`tests/background-behavior.test.ts`） |
| B-08 | actionable view 在 `analyses>0 && readings==0` 時 render `data-reading-first-run-cta`（按鈕「生成第一份深度判讀」→ synthesis 成功後 `upsertSignalReading` 讓 review/export workspace 自動接手，CTA 讓位） | `src/ui/ProductSignalViews.tsx`（`FirstReadingCta`） | CTA 顯示 + 有 reading 時讓位 workspace（`tests/views.test.tsx`） |
| B-11 | `Saved Signals→已存訊號`、`Agent Brief→行動簡報`（title／aria／複製按鈕）、`AI enabled→分析完成`、`No result→尚無結果`、`TASK ›→任務 ›`；brief markdown artifact 內容不動（給 coding agent 的工件） | `src/ui/ProductSignalViews.tsx` | english-chrome ban scan（`tests/views.test.tsx`） |
| B-10 | root cause：`findCardCandidate` 向上走限深 8，Threads 的 time link／avatar wrapper 離 article root 常超過 8 層，深度用盡時湊到 soft 分數的小 fragment 當選 → descriptor 從 fragment 抽（無 snippet／錯 author）。修：`promoteCandidateToPostRoot`（`closest("article")` 不限深，≥ 分數才晉升；article-like 候選不動，quoted-post 行為不變） | `src/targeting/threads.ts` | promotion source contract（`tests/targeting.test.ts`） |
| B-03 | root cause：idle + 無 inflight 時 `getPollingDelayMs` 回 `null` → coordinator 完全停 poll；`worker/get-status` 其實會打 ingest backend（`fetchWorkerStatus`），所以 backend 死掉 passive 永不知道、直到按分析。修：idle 改 12s 心跳，失敗 → `workerError` → `productBackendError` → `Backend 離線` 既有 pipeline 全通；`shouldRefreshProcessingFolder` 在 idle→idle 不觸發 refresh，心跳成本只有一個 localhost fetch | `src/state/processing-state.ts` | idle heartbeat 常數（`tests/processing-state.test.ts`） |
| B-02 | code 檢查定位 toggle 成本：2 次全量未快取 `loadSnapshot` + `saveSnapshot` 重寫全量 global blob（內容沒變）+ snapshot lock 競爭。修：mode 查詢改 `loadSnapshotCached`、寫入走 `saveOptions.tabOnly`（只寫 tab key，鎖與重讀保留防 lost-update）、handler 加 `durationMs/storageSetMs` console log。**~1s 是否消除待 live 量測** | `entrypoints/background.ts` | toggle 只寫 tab key + `selection/start-tab` mode 正確（`tests/background-behavior.test.ts`） |

驗證：full glob `641/641`（基線 633 + 8 個新 regression）、typecheck、`npm run build` + mirror `output/chrome-mv3`、`qa-code-path-audit` 的 B-08 檢查轉 `hasVisibleFirstRunCta: true`。

判定記錄（本輪不修、留檔）：
- Flow 6「SPA 換頁後 cursor 仍 crosshair」判為 **by-design**：selection mode 刻意跨頁保持、overlay 已 reset；要在 route change 取消 selection mode 是產品決策，不是 bug fix。
- B-11 殘留英文 chrome：`READING REVIEW`、`Product mode` kicker、`Process All / Processing... / Starting...`、verdict chips —— 超出 Run20 列的四 token 範圍，未動，待用戶定是否擴大。
- Flow 8 Topic header `0 訊號 15/0 已分析` 計數矛盾仍無 bug ID，下輪 live 一併查（可能與 B-05 同源）。

#### Run 22 live 回歸 checklist（需用戶 Chrome reload unpacked extension）

前置：reload `output/chrome-mv3`（Run15/17 教訓：stale bundle 會整輪白跑），確認 root marker `data-dlens-qa-trace-version` 存在，URL 帶 `#dlensQaTrace=1`。

1. **B-09**：Product collect → hover post → 點 panel `加入產品訊號` → trace 應出現 `popup.collect.save.request {via:"button"}` + `response {ok:true}`，count +1。若連 request 都沒有 → hit-test 仍壞，收 trace 回報。
2. **B-02**：toggle collect ×3 → `popup.collect.toggle.request→response` elapsedMs + background console `selection/start-active-tab {durationMs, storageSetMs}` → 目標 <300ms。
3. **B-03**：開 Product Action（idle 狀態）→ 停 backend → **不按分析**，≤12s 內 stamp 應變 `Backend 離線` → 重啟 backend → ≤15s 恢復。
4. **B-05**：Topic↔Product 往返 ×3 + reload → console `activeSessionIdBefore/After` 對齊、Product count 不歸零；storage probe `dlens:v1:active-session-id` 全程非 null。
5. **B-10**：hover post 的 time link → preview 應有 snippet；hover soft inner card → author 正確。
6. **B-08**：Action route（有 analyses、無 readings）→ 應見 `深度判讀 → 匯出` CTA → 按「生成第一份深度判讀」（**會打真 LLM，先確認**）→ review workspace 出現 → export/copy 控制可用（Flow 16 收尾）。
7. **B-11**：Saved/Action 視覺掃描：`已存訊號`、`行動簡報`、`分析完成`、`任務 ›` 到位；不再出現 `Saved Signals / Agent Brief / AI enabled / TASK ›`。

### 4.11 Run 22 Live Regression（partial）+ 同日 code 收尾

Run 22 由 live session（Codex / Jason profile）執行 §4.10 checklist，中途暫停；Claude Code 接手 code 收尾。結果已併入 Run 摘要與 Bug Log，這裡記方法論要點與剩餘 checklist。

**兩個新 root cause（都在 live 中發現）：**
1. **B-05 第二刀**：Run21 的寫入防護擋住了「null pointer 落 storage」，但 live 仍見 signal 消失——真兇是 `useTopicState` 的 orphan 清理（`findSignalsMissingBackingItems`）把「上一個 Product folder 的 signals」用「現任 folder 的 items」對照，切 folder/mode 時整批誤判成孤兒刪除；加上 `session/set-mode` 忽略 `message.sessionId`、永遠 fallback 第一個同 mode session。修：orphan 清理 folder-scoped（`signal.sessionId === activeFolder.id` 才納入）、set-mode 尊重指定 session（`6dcf046`）。教訓：**寫入層防護擋得住壞指標，擋不住「邏輯上合法的誤刪」**——兩層都要 regression。
2. **B-10 第二刀**：Run21 promotion 假設貼文都有 `article` wrapper；post detail 頁實測 `articles:[]`（`b10-hover.json`），promotion 永遠 bail。修：article 找不到時 fallback `div[data-pressable-container]`（article 優先，feed/quoted-post 行為不變，`1a2f33e`）。教訓：**feed 與 detail 是兩套 DOM，targeting 修復必須兩邊都驗**。

**Backend 側事實（非 extension bug）**：Supabase `select 1` OK；Flow 9–16 真 blocker 是 private backend 缺 Playwright chromium binary（`.venv/bin/python -m playwright install chromium` 補齊）。補齊後兩筆 `/capture-target` 真 crawl 成功（`comment_count=4/12`），UI 即時 `分析完成`、`2 signals · 2 analyses`。此事故同時暴露 **B-12**（job `last_error` 不進 UI，見 Bug Log）。

**Run 22 後驗證**：full glob `647/647`（641 + run22 期間 4 個 B-05 regression + 2 個 B-12）、typecheck、build + mirror `output/chrome-mv3`（含 `1a2f33e`）。

#### Run 23 收尾 checklist（需 reload `output/chrome-mv3` ≥ `1a2f33e`）

1. **B-10 recheck**：post **detail** 頁 hover time link → preview 有 snippet／author；feed quoted-post hover 不退化。
2. **B-12 recheck**：製造一筆會失敗的 crawl（停 backend worker 或壞 URL）→ Saved 等待區卡片應顯示 `抓取中（重試中）` + `backend 回報錯誤：…`，不再是無限 `等待 backend 完成`。
3. **B-02 量測補課**：用 in-page trace（`#dlensQaTrace=1` → `qa-trace-summary.mjs`）讀 `popup.collect.toggle.request→response` pair 與 background `selection/start-active-tab {durationMs}`，不要用自動化 wallMs；目標 <300ms。
4. **B-03 stamp 條目**：idle 停 backend → ≤12s stamp `Backend 離線`（機制已由 trace 證實，補目視）。
5. **Flow 9–16 收尾**：reading review/file（收錄/退回/待看）→ Signal Packet / 行動簡報 export/copy 輸出檢查 → Classification route 全掃。
6. **Flow 8 計數矛盾**：Topic header `0 訊號 15/0 已分析`——B-05 兩刀修完後重看是否仍在（疑同源）。
7. B-08 export/copy 控制收尾（review workspace 內 `匯出/複製` 實際輸出內容檢查）。

### 4.12 Run 23 Live Recheck（partial）

Run 23 接在 `1a2f33e` / `33fb646` / `9e12476` 之後，使用者已 reload `output/chrome-mv3`，Chrome window 為 `Google Chrome - Jason (brandonproject.co)`。入口 gate 通過：`run23-gate-after-extension-reload.json` 顯示 marker `run14-url-trace-v1`，root fixed viewport host，Product Action 已有 `2 signals · 2 analyses`、`§ 1 READING REVIEW`、`§ 2 PACKET EXPORT`。

| Item | 結論 | Evidence |
|------|------|----------|
| B-10 detail time-link hover | **通過**。在 `https://www.threads.com/@se_ranking/post/DZYf_mngRnt#dlensQaTrace=1` hover time anchor `1d`；preview 回到同一 post root，包含 `se_ranking` 與 `Can AI content actually be good?`，不再是 `No snippet`。 | `run23/b10-detail-pre-hover.json` · `run23/b10-detail-post-hover.json` |
| B-12 retrying job error surface | **通過**。真 reply collect 後，暫時移走 Playwright headless shell cache 製造 `BrowserType.launch: Executable doesn't exist...`；pending card 顯示 `抓取中（重試中）` + `backend 回報錯誤：...`，`hasWaitingOnly=false`。測後 cache 已還原。 | `run23/b12-real-reply-after-save.json` · `run23/b12-after-click-reanalyze.json` · `run23/b12-ui-after-job-error.json` |
| Cleanup state | **未刪測試 signal**。Product folder 留下一筆 B-12 測試 pending/retrying signal，因按 `移除此訊號` 會跳「確認刪除此 signal？」；依 §5 危險動作規則，已按 Cancel。誤入 Threads reply composer 的測試文字已清空。 | `run23/b12-pending-remove-buttons.json` · `run23/b12-reply-draft-clear-check.json` |
| Flow 9–16 | **未完成**。Run23 只目視確認 reading review + packet export workspace 可見；未點 export/copy，未做 Classification 全掃。原因：Chrome connector 在低階 click timeout 後不穩，且先停在 B-12 清理確認。 | `run23/run23-gate-after-extension-reload.json` · `run23/b12-ui-after-job-error.json` |

本輪文件/evidence 收尾後重新驗證：`npm run typecheck` pass、full glob `647/647` pass、`npm run build` pass 並 mirror 到 `output/chrome-mv3`（manifest timestamp `2026-06-11 10:51:18 HKT`，v`0.1.30`）。

Run 23 後剩餘 checklist：

1. B-02：用 in-page trace pair 量測 collect toggle，不再用 automation wall clock。
2. B-03：idle backend down 後 ≤12s stamp 目視補證。
3. Flow 8：重看 Topic header `0 訊號 15/0 已分析` 是否仍存在。
4. Flow 9–16：reading review file/退回/待看、Signal Packet / 行動簡報 export/copy、Classification route 全掃。

### 4.13 Run 24 Backend Restart / B-12 Clear / B-13 Stamp Fix

Run 24 接在 Run23 的 B-12 測試殘留狀態之後執行。Chrome window 仍為 `Google Chrome - Jason (brandonproject.co)`，Threads tab 仍帶 `#dlensQaTrace=1`，reload 後 root marker 為 `run14-url-trace-v1`。Private backend 以 `cd ~/Desktop/dlens-ingest-core && set -a; source .env; set +a && PYTHONPATH=src .venv/bin/python scripts/run_api.py` 啟動。

| Item | 結論 | Evidence |
|------|------|----------|
| B-03 recovery stamp | **通過**。backend 由 stopped → running 後，Product header 從 `Backend 離線` 清回 `分析完成 / ✓ 已就緒`，沒有手按分析也能反映健康恢復。 | `run24/b03-backend-restart-stamp-cleared.json` |
| B-12 pending retry clear | **通過，但不是 passive 自動 drain**。等候約 15s 後 UI 仍保留 `抓取中（重試中）`，backend log 只有 `/worker/status` / `/jobs` / `/captures`，沒有 `/worker/drain`。手按 `重新分析` 後 worker claim 舊 job attempt 3，crawl 成功 `comment_count=11`，UI 到 `3 signals · 3 analyses`，pending card 消失。 | `run24/b12-manual-drain-crawl-success.json` |
| B-13 stale offline stamp | **新發現 + 修復 + live passed**。B-12 清除後 backend `/worker/status` 為 `idle`，但 Product header 仍因 `analysisError` 顯示 `Backend 離線`。修成 backendError 才顯示 `Backend 離線`，analysisError 顯示 `部分失敗`；reload `output/chrome-mv3` 後 live 確認 `hasBackendOffline=false`、`hasBrowserLaunchError=false`、`3 signals · 3 analyses`。 | `run24/b13-before-stamp-fix-stale-backend-offline.json` · `run24/b13-after-stamp-fix-live.json` |

Run 24 後驗證：`tests/views.test.tsx` 先紅後綠；`npm run typecheck` pass；full glob `647/647` pass；`npm run build` pass 並 mirror 到 `output/chrome-mv3`。

剩餘 checklist：

1. B-02：用 in-page trace pair 量測 collect toggle，不再用 automation wall clock。
2. Flow 8：重看 Topic header `0 訊號 15/0 已分析` 是否仍存在。
3. Flow 9–16：reading review file/退回/待看、Signal Packet / 行動簡報 export/copy、Classification route 全掃。
4. Watch：backend down + inflight 時，文案仍可能同時說 `抓取正在進行` 與 `Backend 無法連線`；應改成「排隊中，等 backend 回來」這類狀態文案。
5. Watch：Packet Export header 目前用 `signals.length`，會把未分析 / 未 reading 的 pending signal 算進 `3 signals → packet`；Flow 16 要實際打開 export/copy 輸出驗證口徑。

## 5. 記錄規範
- **證據三件套**：截圖（出包當下）＋相關 console（`read_console_messages`，只截相關）＋必要時 network（`read_network_requests`，**遮蔽 API key**）。
- **重現步驟**要能讓另一 agent 冷啟動照做（含 folder mode、post 連結、視窗寬度）。
- **不確定也記**：標 P3 +「待確認」，別漏。
- **危險動作先停**：刪 item / 清 cache / 關 backend / 改 settings / 匯出含敏感資料 → 先問再做。Flow 4 真實 LLM 呼叫亦同。
- 每跑完一輪：更新頂部 `Last updated` + Run 摘要（pass 數 / open bug 數 / 最嚴重項）。
