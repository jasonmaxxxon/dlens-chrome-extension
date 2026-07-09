# Threads Extraction / Crawler Code Audit

日期：2026-06-16
Scope baseline：`dlens-product-latest` `8478de0`，以及本機 read-only backend checkout `/Users/tung/Desktop/dlens-ingest-core`
狀態：C0 audit draft，未改 runtime 行為

## Executive Summary

Threads extraction 不是單一 extractor，而是一條鏈：

1. Extension content script 在 Threads DOM 上偵測卡片，建立 `TargetDescriptor`。
2. Background/storage 把 descriptor 存入 local sessions/signals。
3. Backend adapter 把 URL 排入 crawl。
4. Backend Playwright fetcher 進入 Threads、scroll、必要時 drill 到 reply pages、解析 DOM/HTML、寫 artifact，最後 normalize 成 read model。

目前程式裡有一些真的重要的保護：click-save 只會在 descriptor 成功建立後才攔截點擊、content-side selection mode 有 guard、backend crawl 有 budget/cap、auth state 是外部檔案、advanced author-profile hover 沒有進入 default metric extractor。這些都不是可以隨便「整理掉」的東西。

主要風險有兩層。

第一層是資料正確性：系統可能顯示「成功收集」，但實際上收錯 post、author 缺失、body 來自 nested/quoted post、engagement 來自 page-wide fallback、reply 被 flatten 成 top-level comment、或 OP/reply/repost 身份被 heuristic 合併。

第二層是操作安全：backend crawler 含有高觸碰度 browser 行為。這些行為可能是目前 crawl 能 work 的原因，但也是最容易讓帳號看起來像自動化的部分。這裡不能用一般 refactor 心態處理。

建議：這份 audit 必須是 preservation-first。不要先減 crawler 行為、刪 legacy path、或重寫 selector。先用 fixture replay 鎖住現況，再決定哪一個 invariant 可以安全修改。

## What Was Audited

Product extension：

- `entrypoints/threads.content.ts`
- `src/targeting/threads.ts`
- `src/targeting/navigation-reset.ts`
- `tests/targeting.test.ts`
- `tests/threads-content.test.ts`

Backend ingest crawler：

- `/Users/tung/Desktop/dlens-ingest-core/src/dlens_ingest_core/crawlers/threads/adapter.py`
- `/Users/tung/Desktop/dlens-ingest-core/src/dlens_ingest_core/crawlers/threads/fetcher_runtime.py`
- `/Users/tung/Desktop/dlens-ingest-core/src/dlens_ingest_core/crawlers/threads/vendor/fetcher.py`
- `/Users/tung/Desktop/dlens-ingest-core/src/dlens_ingest_core/crawlers/threads/vendor/parser.py`
- `/Users/tung/Desktop/dlens-ingest-core/src/dlens_ingest_core/crawlers/threads/vendor/scroll_utils.py`
- `/Users/tung/Desktop/dlens-ingest-core/src/dlens_ingest_core/normalize.py`
- `/Users/tung/Desktop/dlens-ingest-core/tests/crawlers/test_threads_adapter.py`

這次 C0 不包含：

- 跑 live Threads crawler。
- 登入 Threads 或重新產生 auth。
- 改 Playwright launch flags。
- 刪除看似 legacy 的 code。
- Product UI redesign。

## Safety Rule For This Area

Crawler 是少數「很難得才 work」的基礎設施。某段程式看起來多餘，不代表它真的多餘；它可能剛好是目前能避開 Threads DOM 變動、session 問題、或 reply lazy-load 的原因。

所以這個區域的規則應該是：

- C0 audit 只讀，不碰 runtime。
- 任何 crawler interaction 行為改動，都先從 saved artifact / fixture 開始。
- 任何 live verification 都要明確、一次性、owner-approved。
- 「看起來比較不像自動化」不等於更安全，因為破壞 session/crawl recovery 也會增加人工重試成本。
- 「code cleaner」不是刪除行為的理由；要先有 call-path proof 或 fixture proof。

## Current Extraction Chain

### Extension Detection Path

`threads.content.ts` 安裝 global `mousemove`、`click`、`keydown` listeners。當 `selectionMode` 啟用時，hover card 會經過：

- `findCardCandidate(target)` in `src/targeting/threads.ts`
- `buildTargetDescriptor(card)`
- `publishHoveredDescriptor(card, descriptor)`
- `selection/hovered` message to background
- popup save 使用的 live hover descriptor channel

click-save 的目前設計是保守的：click handler 只有在找到 candidate card 且成功建立 descriptor 後，才會 `preventDefault()` / `stopPropagation()`。這是合理的，因為 extension 是掛在 Threads 原生 UI 上，不應在沒有確定 target 時攔截使用者點擊。

### Backend Crawl Path

`ThreadsCrawlerAdapter.crawl()` 只接受含 `/post/` 的 URL，然後呼叫 `fetch_threads_post()`。

`fetch_threads_post()` 建立 temporary output directory，再以 headless 模式呼叫 vendor `run_fetcher_test()`。vendor crawler 目前會：

- 載入 auth storage state。
- 開 target post。
- 抽 initial metrics。
- scroll-harvest comment cards，直到 cap、budget、coverage 或 plateau 條件停止。
- 回到頁頂並 capture final HTML。
- 選 drill candidates。
- 進入 selected reply/detail pages。
- 在 drill pages 點擊 `view replies` 類控制項。
- 寫出 JSON/HTML artifacts。

backend 再把 artifacts normalize 成 canonical post/comments 和 read model。

## Findings

### F1: Page-Wide Engagement Fallback 可能誤配 metrics

Severity：High for data correctness，Low for account safety

`resolveEngagement()` in `src/targeting/threads.ts` 會先從 selected card 讀 engagement；如果 post target 沒有 views/followers，會 fallback 掃 `document.body.innerText`。

這個 fallback 可以理解，因為 Threads 經常把 counts render 在 card 外。但它也建立了一條明確的 false-positive path：profile panel、recommendation unit、quoted post、或附近 page chrome 都可能把數字「捐」給目前選中的 post。

Impact：

- 「successful collect」可以保存錯 views/follower metrics。
- Product / PR evidence 可能展示看似有信心、但來源其實不是該 post 的數字。

Safe next step：

- 先不要移除 fallback。
- 補 fixture replay：card-level counts 缺失，但 body-level counts 有 unrelated numbers。
- descriptor trace 要標記 metric source：`card`、`page_fallback`、`missing`。

### F2: Permalink / Author Selection 是 heuristic，尚未被 nested Threads 證明

Severity：High for wrong-post capture

`extractPermalink()` 先選 time-token link，再 fallback 到 candidate 內最後一個 `/post/` link。`extractAuthorHint()` 有 repost-aware skip path，但 repost/header 判斷本質上仍是 heuristic。

這正是 OP/reply/repost/quoted-post 身份容易混掉的地方：

- nested quote 可能提供另一個 `/post/` link。
- reply detail page 可能含多個 post-like cards。
- localized repost labels 不一定符合英文文字檢查。
- 第一個 visible author anchor 可能是 reposting user，不是 original author。

Impact：

- Saved URL 可能指向 child/quote，而不是使用者看到的那張卡。
- Saved author 可能缺失，或變成 reposting account。
- parent chain / target type 在 backend crawl 前已經錯。

Safe next step：

- 建 saved DOM fixtures：OP post、reply、repost、quoted post、reply-with-quote。
- 對 fixture replay `findCardCandidate()` / `buildTargetDescriptor()`。
- 在改 selector 前先加 expected `targetType`、`postUrl`、`authorHint`、`bodyText` assertions。

### F3: Backend parser 假設 DOM order 等於 main post + comments

Severity：High for crawler correctness

`vendor/parser.py` 會解析 `div[data-pressable-container="true"]`，把 `posts[0]` 當 main post，`posts[1:]` 當 comments。這個假設對現代 Threads 頁面很脆弱，因為 recommendation units、quoted posts、repost wrappers、pinned UI、reply expansion 都可能在真實 thread 之前或中間插入 post-like cards。

Impact：

- Main post 可能變成 recommendation 或 nested card。
- Comments 可能混入 OP / quote / repost cards。
- Reply rows 可能被 flatten 成 top-level comments。

Safe next step：

- parser 先不要改。
- 用既有 successful crawl 的 raw HTML output 補 artifact replay tests。
- 把 parser output 跟 newer structured `threads_comments.json` / `threads_comment_edges.json` 比對。

### F4: Comment de-dupe by `(user, text)` 會合併不同 replies

Severity：Medium

`extract_data_from_html()` 用 `(user, text)` 合併 comments。這是合理的初版策略，但對 repeated short replies、重複 emoji/text replies、同作者在不同 branch 留相同文字，並不安全。

Impact：

- comment count 可能低估。
- reply branches 可能失去重複留言。
- duplicate row 上的 engagement 可能被合併或丟失。

Safe next step：

- 暫時保留現有 merge behavior。
- 補 replay case：同 user 在不同 reply branch 留相同 text。
- 未來若有 URL/id/position/parent signals，優先用更穩定 key，但要 fixture proof 後再改。

### F5: Backend drill 行為高觸碰，需要 action budget contract

Severity：High for account safety

vendor fetcher 預設最多開五個 drill pages（`DL_MAX_DRILL_TABS` default `5`），並在每個 drill page 對 `view replies` 類 buttons 做兩輪 click，每輪最多六次。換句話說，一個 drill target 最多可能有十二次 expand-click，再加 scrolling。

這可能是目前能回收 reply chain 的必要手段。但它也是 crawler 裡最像自動化操作的部分。

Impact：

- 如果 timing/frequency 不對，bot classification 風險提高。
- 任何「小 refactor」都可能意外增加 action count。

Safe next step：

- 這份 audit 不改 drill defaults。
- manifest 補 action budget summary：
  - pages opened
  - wheel events
  - expand clicks
  - drill candidates attempted
  - elapsed seconds
  - stop reason
- 未來任何增加 action budget 的變動，都應該 test fail，除非明確批准。

### F6: Author profile hover 存在，而且必須保持 explicit opt-in

Severity：High for account safety if accidentally enabled

`fetch_advanced_metrics()` 會呼叫 `extract_metrics(... include_profile_metrics=True)`，而 `_extract_author_profile_metrics()` 會 hover author links 去讀 follower counts。現有測試已經確認 default metric extraction 會 skip author-profile hover，只有 requested 時才會 hover。

這個 boundary 是正確的。真正風險是未來有人為了「提高 follower count coverage」，不小心把 normal crawler route 接到 advanced metrics。

Impact：

- hover profiles 比讀 static DOM 更像可見的人機互動。
- bot-detection risk 可能提高。

Safe next step：

- 保留現有 tests。
- 補 crawler policy test：`run_fetcher_test()` 不得要求 `include_profile_metrics=True`。
- 文件明確標記 advanced profile hover 是 opt-in only。

### F7: 大 wheel scroll 和 automation flags 是 operationally sensitive

Severity：Medium to High

fetcher 以 `--disable-blink-features=AutomationControlled` launch Chromium，並用大幅 wheel scroll（`DL_SCROLL_WHEEL_PX` default `3600`）加 wait interval / hard caps。這些設定看起來不像一般產品程式，但可能是目前 crawler 能 work 的 operational knobs。

Impact：

- 移除 flags 可能破壞 auth/crawl 行為。
- 增加 scroll aggressiveness 可能提高 detection risk。
- 降低 waits 可能讓 coverage 下降，且 action frequency 上升。

Safe next step：

- 把這些當 locked operational knobs，不當 cleanup target。
- 每次 crawl manifest 都記錄實際 values。
- env overrides 先用 fixture/unit tests 驗，不先 live browsing。

### F8: Adapter 忽略 `capture_hints`

Severity：Medium

`ThreadsCrawlerAdapter.crawl()` 直接 `del capture_hints`。也就是 backend 只驗 URL 是否含 `/post/`，不會比對 extension 提供的 author、text、timestamp、target type、source label。

Impact：

- 如果 extension 收錯 URL，backend 仍可能對錯 post 回傳 successful crawl。
- author/body drift 不會被 cross-check 捕捉。

Safe next step：

- 先不要讓 hint mismatch 變 blocking；Threads page 本身 noisy。
- 先加 non-blocking mismatch telemetry：
  - URL canonical mismatch
  - author mismatch
  - body prefix mismatch
  - target type mismatch
- 只有在 fixture/live variance 量過後，才考慮把 mismatch 升級成 blocking。

### F9: Legacy fetch paths / archive snapshot 看似冗餘，但不能先刪

Severity：Medium for maintenance，Low immediate runtime risk

`vendor/fetcher.py` 還保留 `fetch_page_html()`、`fetch_thread()`、`capture_archive_snapshot()` 這些比較像舊路徑的函式。current adapter runtime 是 `fetch_threads_post()` -> `run_fetcher_test()`，所以它們看起來不在 active ingestion path。

但 `capture_archive_snapshot()` 會 collect 大量 HTML/DOM snapshot，可能包含 target post 外的 page content。如果舊路徑被重新啟用，storage/privacy surface 會變大。

Impact：

- 多餘 code 讓 crawler 變難 audit。
- archive paths 可能寫入過寬 page data。
- 盲刪可能破壞 undocumented fallback。

Safe next step：

- 標成 `legacy-candidate`，不是 `dead`。
- 用 `rg` 加 tests 證明 production call path。
- 如果要刪，先為 active `run_fetcher_test()` output contract 加 characterization test。

### F10: Product / Backend 有多套獨立 DOM heuristics

Severity：Medium

目前至少有三層 extraction：

- extension `src/targeting/threads.ts`
- backend vendor structured harvest logic
- backend BeautifulSoup parser line heuristics

它們各自存在不是錯，因為 runtime environment 不同。但風險是 drift：某一層把卡片視為 reply，另一層把它視為 OP；兩邊都 return non-empty output，表面上都成功。

Impact：

- extension saved descriptor 和 backend crawled read model 可能指向不同語義物件。
- 單層 tests 會 pass，但 end-to-end capture 仍錯。

Safe next step：

- 不要立刻強制共用 parser。
- 先做 cross-layer fixture report：
  - extension descriptor
  - backend structured cards
  - backend parser comments
  - normalized read model
- 用 report 決定是否值得收斂 parser。

## Behavior That Should Be Preserved

這些不是 cleanup targets：

- click interception only after descriptor resolution。
- selection-mode guards around global listeners。
- SPA location-change reset。
- popup save 使用的 live hover descriptor path。
- backend auth file guard。
- `fetch_threads_post()` 的 temporary output directory。
- scroll / coverage / plateau hard caps。
- default skip of author-profile hover。
- 鎖 content-script sensitive invariants 的 tests。

## Likely Redundant Or Over-Broad Behaviors

這些需要 proof 才能刪或縮：

| Area | Candidate | Why It Looks Redundant | Why Not Delete Yet |
| --- | --- | --- | --- |
| Backend vendor | `fetch_page_html()` / `fetch_thread()` | Active adapter path 使用 `run_fetcher_test()` | 可能是 undocumented fallback 或 manual diagnostic path |
| Backend vendor | `capture_archive_snapshot()` | 不在 active normalized runtime path | 可能解釋舊 debugging artifacts；刪除前要有 call-path proof |
| Backend artifacts | raw HTML / raw cards outputs | Normalizer 主要吃 structured JSON | fixture replay 和 regression debugging 仍需要 |
| Extension metrics | page-wide body fallback | 可能誤配 counts | 也可能是 Threads views/followers 唯一可讀來源 |
| Backend drill clicks | two rounds of expand buttons | 高觸碰行為 | 可能是 reply-chain coverage 必要手段 |
| Cross-layer parser duplication | extension/backend/parser 都 parse Threads cards | maintenance drift | runtime environments 不同；強行統一可能同時破壞兩邊 |

## Test Gaps

現有 tests 有保護一些重要 invariants，但還沒有證明 end-to-end extraction contract。

缺口：

- Extension descriptor DOM fixture replay。
- Backend structured harvest DOM fixture replay。
- `vendor/parser.py` raw HTML fixture replay。
- OP / reply / repost / quoted post 的 cross-layer consistency report。
- Crawler action budget tests。
- Non-blocking capture-hint mismatch telemetry tests。
- Same user + same text + different branch 的 duplicate comment regression fixture。
- body-level page counts 和 card-level counts 衝突的 fixture。

## Proposed Audit Plan

### Phase A: Inventory Without Running Threads

Deliverables：

- Extension capture + backend crawl static call graph。
- 所有會改變 crawler 行為的 environment variables。
- emitted artifacts 清單，以及哪個 runtime 真正 consume。
- browser actions 清單：
  - navigation
  - scroll
  - hover
  - click
  - new page / drill page

Acceptance：

- 不跑 live crawler。
- 不改 auth file。
- 不改 runtime code。

### Phase B: Fixture Replay

優先使用既有 successful crawl artifacts。如果 fixtures 不夠，停下來問，不預設 live capture。

Deliverables：

- Extension descriptor fixture tests。
- Backend parser fixture tests。
- Cross-layer extraction report。
- Fixture labels：
  - OP post
  - direct reply
  - reply with nested quote
  - repost
  - quoted post
  - thread with expanded replies
  - post with visible unrelated profile/page counts

Acceptance：

- Tests 可以 offline 跑。
- 每個 fixture 都標 expected author、URL、target type、body prefix、engagement source，以及已知的 parent/reply relation。

### Phase C: Risk Register And Change Plan

只有 Phase B 完成後，才做：

- 依 correctness risk / account-safety risk 排序。
- 決定哪些行為 locked、gated、reduced、deleted。
- 寫一份 implementation plan；每個 PR 只碰一個 invariant。

Acceptance：

- 沒有 call-path proof，不寫 deletion plan。
- 沒有 owner-approved live QA plan，不改 crawler interaction。
- 沒有 fixture before/after output，不改 metric/parser 行為。

## Change Policy For Future Work

可以優先做：

- 加 read-only fixture tests。
- 加 action budget reporting 到 manifest。
- 加 non-blocking mismatch telemetry。
- 加 engagement extraction source labels。
- 補文件，明確 advanced author-profile hover 是 opt-in only。

應該延後的高風險變動：

- 改 scroll timing 或 wheel distance。
- 減少或增加 drill pages。
- 移除 automation launch flags。
- normal crawl 啟用 profile hover。
- 刪 legacy fetch paths。
- 重寫 parser/card selection logic。
- 讓 capture-hint mismatch 變 blocking。

## Recommended Next Artifact

如果這份 C0 audit 方向接受，下一份才寫 companion implementation plan：

`docs/handoff/2026-06-16-threads-extraction-crawler-audit-plan.md`

那份 plan 應該 fixture-first，而且不把 live crawl execution 放成 default step。
