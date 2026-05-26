# Love Topic — Pass 0: Evidence Packet

**日期：** 2026-05-22
**Stage：** P0 / 6（Evidence layer，deterministic）
**來源：** Chrome extension LevelDB（`hihgplinfhopjpjonkcdbbmkoklombkj`）→ `dlens:v1:topics`(love) + `dlens:v1:signals` + `dlens:v0:global-state`(items) + `dlens:v1:signal-tags`
**狀態：** 9 items（全部 succeeded）
**對照目的：** 與 `2026-05-21-work-*` audit 對照，測試「中間層缺席 / future-tense 缺席」是 work 議題特性還是 Threads platform affordance

---

## Stage Contract（沿用 work pipeline）

### Purpose
為 P1-P5 + Validator 提供穩定、可重現、純事實的 evidence layer。零判讀。

### 資料模型說明（與 work 不同，須記錄）
Love 是 **v1 schema** 的 topic（`dlens:v1:topics` 中 `name=love`，9 signalIds，status=pending，synthesis=null）。資料分散在四個 key：
- `dlens:v1:topics` → love topic 的 signalIds 清單
- `dlens:v1:signals` → 輕量 signal record（id / itemId / topicId / capturedAt）
- `dlens:v0:global-state` → 實際 capture item（OP 文本 + commentsPreview），love items 與 work items 混存於同一 session（`session_4g6mmfp0`）靠 topicId 區分
- `dlens:v1:signal-tags` → 既有 AI gist + tags（by itemId）

抽取已驗證：9/9 signalIds 全部 resolve 到 item 且 itemFound=true。

### Fields per packet
- `signalId` / `S#` — 短碼 S1-S9，後續 pass 一律用 `S#`
- `sourceUrl` / `capturedAt`（加入 love topic 的時間）/ `status`
- `opText` — root post 全文（取 commentsPreview 中 OP 自我 echo 條目，比 snippet 完整）
- `opLikes` — OP post 的 likes（= OP 自我 echo 條目的 likes）
- `commentCount` — Threads 回報留言總數
- `topReplies[]` — **排除 OP 自我 echo / 自我接話後**的 audience reply，每條 `{author, text, likes}`
- `aiGist` / `aiTags` — 既有 AI 產物（標明來源，非本 pass 判讀）
- `notes` — 純機械註記

### What this file is NOT
不分配新 tag / theme / narrative；不評估 sentiment / stance；不剪原文、不省粗口；不解讀 likes 意義；不從 reply 推 OP 立場。AI gist/tags 是既有 artifact，**列出僅供 provenance，不代表本 pipeline 採信**——P1+ 自己重讀，不繼承 AI 判讀。

### Citation convention
`S#.OP` = OP；`S#.R1/R2` = audience reply（已排除 OP 自我接話）。

---

## ⚠ Data-quality 警示（P1+ 必讀）

Love 的 `commentsPreview` **大量被 OP 自我 echo / 自我接話佔據**，audience reply 證據比 work 薄：

- **S2**：commentsPreview 三條**全部是 OP（hfsn_____rmnmn）自己**——OP 把一篇 10 點長文分成多條自我接話，top-3 preview 完全沒有 audience reply
- **S9**：3 條中 2 條是 OP（ccccc12713）自我接話（含「我又唔同意喎」），只有 1 條 audience reply
- 其餘 S1/S3/S4/S5/S6/S7/S8：第 1 條是 OP 自我 echo（= opText 來源），第 2-3 條才是 audience reply

**後果：** 可用 audience reply 總數遠少於 work（work 14 篇 × ~2 ≈ 27 條；love 估計僅 ~14 條，且 S2 為 0 條）。**P4 audience pass 對 love 的覆蓋會顯著弱於 work**——這本身是要記錄的 platform/sample 事實，不是缺陷掩蓋。

---

## EvidencePackets

---

### S1
- **signalId:** `signal_7tse11xy_mpgfrcl0` / **itemId:** `item_dfb9z07t_mpgfrcgc`
- **sourceUrl:** https://www.threads.net/@mandychow311/post/DYAFFNtkmfc
- **capturedAt:** 2026-05-22T04:44:57.588Z ・ **status:** succeeded
- **opText:**
  > 想知玩 app swipe 完 match 中又唔講野，人哋覆你又唔回應嘅人咩心態
  > （原帖日期 06/05/2026）
- **opLikes:** 16 ・ **commentCount:** 5
- **topReplies（audience）:**
  - R1 — `cheong1983`（1）: 「已退 apps」
  - R2 — `michaelli15`（0）: 「人夾人 5 好玩交友 app」
- **aiGist:** 作者對於交友軟體上配對後卻不回應的冷淡互動現象感到困惑與無奈。
- **aiTags:** 交友軟體 / 配對文化 / 社交焦慮 / 網路互動
- **notes:** 低互動（5 留言）。R1 是 OP 自我 echo 已抽為 opText

---

### S2
- **signalId:** `signal_cosinc3v_mpgfs4ut` / **itemId:** `item_ud1jj5dz_mpgfs4pd`
- **sourceUrl:** https://www.threads.net/@hfsn_____rmnmn/post/DXH0r3GE0on
- **capturedAt:** 2026-05-22T04:45:34.229Z ・ **status:** succeeded
- **opText（10 點長文，完整保留）:**
  > 作為一個溝仔無數嘅靚女姐姐，我想講一個極度具爭議性嘅溝仔觀點：靚女唔應該上 App 識男仔，唔靚嘅先應該玩 App。如果靚女自問有 7 至 9 分，玩交友 App 係自貶身價。
  > 1）向下唔甘心，雖然 1-5 分嘅男仔會瘋狂湧向自己，但唔會考慮。
  > 2）向上競爭大，top 5% 條件嘅男人，佢哋可以選擇嘅係 1 至 10 分嘅所有女人，靚女好容易跌入相當被動嘅競爭池。
  > 3）演算法存在惡意，App 設計係為咗留住用戶。7-9 分女仔會被配對「高質素但唔打算定落嚟」嘅男仔，令靚女覺得好多選擇，但最後渣男佔九成。
  > 4）有個靚仔機師同我講，佢全盛時期喺 App 無敵狀態，晚晚 full booking…如果佢有海量女人可以揀，點會為一個普通靚女停落嚟？
  > 5）喺 App 上，男仔一分鐘睇 50 個 Profile，你係佢嘅 1/50，男人大腦進入「挑剔模式」，產生「靚女無限供應」假象。
  > 6）7 至 9 分靚女應盡量喺現實生活裏面，尋找可以排第一嘅地方，令自己喺細範圍顯示優勢。
  > 7）靚唔靚係相對的…放我入 10 個港姐冠軍隔離我就黯淡無光；放我入立法會我就係驚世美女。
  > 8）現實空間成為全場最靚，男人大腦進入「驚艷模式」而唔係「挑剔模式」。
  > 9）唔太吸引嘅人應善用交友 App，因為愈 niche 嘅 market 愈容易喺網上搵到同好（裸跑舉牌 vs 連登出 post 的比喻）。
  > 10）知道好多人反對，會舉靚女 App 成功例子；但都唔能否認好多女仔搵唔到，呢度講緊係機會率同性價比。
  > （原帖日期 15/04/2026）
- **opLikes:** 1800 ・ **commentCount:** 63
- **topReplies（audience）:** ⚠ **無**——commentsPreview 三條全部是 OP 自我接話（point 7-10 的續文，likes 1800/550/550）
- **aiGist:** 這篇討論關於靚女是否應該使用交友軟體，並探討不同社交場域對擇偶效率與品質的影響。
- **aiTags:** 交友軟體 / 兩性關係 / 擇偶策略 / 社交場域 / 市場定位
- **notes:** **audience reply 在 top-3 preview 中為 0**；OP 自評「極度具爭議性」並預期反對（point 10）。下游對 S2 的 audience 分析只能標明「不可得」

---

### S3
- **signalId:** `signal_87eah83h_mpgft2uw` / **itemId:** `item_ndu4kuov_mpgft2hd`
- **sourceUrl:** https://www.threads.net/@uhc_nerakuhc/post/DYKfZ6YE6Si
- **capturedAt:** 2026-05-22T04:46:18.296Z ・ **status:** succeeded
- **opText:**
  > 玩 app 玩到我懷疑人生🥹 點解啲人開 chat 第一句寫到好似見工咁「熱愛運動、旅遊、閱讀，工作穩定，有車有樓。」 大佬呀，你係咪搞錯咗？ 我係想知你有咩興趣，唔係想知你身家有幾多。 下次不如直接寫埋「月薪幾多，幾時供完樓」啦 慳返大家時間
- **opLikes:** 23 ・ **commentCount:** 18
- **topReplies（audience）:**
  - R1 — `i_m_hungry_lala`（7）: 「咁好過三幾個月先發現佢無業仲可能欠債😂」
  - R2 — `_crystalfer`（5）: 「大勢所趨，因為其他 users 唔係咁睇」
- **aiGist:** 網友抱怨交友軟體上的自我介紹過於功利化，將擇偶變成像面試般的資產審核。
- **aiTags:** 交友軟體 / 擇偶條件 / 物化關係 / 兩性價值觀
- **notes:** R1 與 R2 都**不接 OP 的批判，反而為「功利化」辯護**（R1 防詐、R2 大勢所趨）

---

### S4
- **signalId:** `signal_escthjmd_mpgfuscq` / **itemId:** `item_yckqmo4j_mpgfukz3`
- **sourceUrl:** https://www.threads.net/@cest.le.bliss.hk_counselling/post/DJa_1UhzM5z
- **capturedAt:** 2026-05-22T04:47:37.994Z ・ **status:** succeeded
- **opText:**
  > 其實女士明唔明，你地想搵既對象，知書識禮、有學識品味又好、事業有成又好，係唔會係交友 App 出現😮‍💨 玩交友 App、交友活動只會遇到一種人，就係「我好需要需要另一半」既人⋯⋯ Put yourself in his shoes，我地一齊諗下我地想要既對象會係邊度出現？
- **opLikes:** 773 ・ **commentCount:** 77
- **topReplies（audience）:**
  - R1 — `karrie.in.london`（130）: 「Er..... 事實又唔係你講到咁差嘅！…心態決定行為！你個心想搵一個咩人，你就會吸到啲咩人返嚟…我同老公係喺交友 app 識嘅…我算幾幸福喺交友 app 度識到個知書識禮、有學識品味又好、事業有成又好嘅男人。」
  - R2 — `arrtthhur`（119）: 「你講錯曬，係好多有學識，事業有成用交友 app 搵食🤣，重要有老婆同女友」
- **aiGist:** 作者認為高質量的理想對象通常不會出現在交友軟體上，因為該平台多為急於尋求伴侶的人群。
- **aiTags:** 交友軟體 / 擇偶標準 / 兩性關係 / 社交心態
- **notes:** 帳號帶 `_counselling`（疑似 counselling 業者）。R1 + R2 **都直接反駁 OP**（R1 用個人成功反例、R2 用「有家室者也在用」反例）——這是 love 中明顯的 OP 被反駁 case

---

### S5
- **signalId:** `signal_3naac5da_mpgm7kx7` / **itemId:** `item_r6slakv6_mpgm7kqz`
- **sourceUrl:** https://www.threads.net/@wontchangeidtililivemylife/post/DYn71-3Gc-9
- **capturedAt:** 2026-05-22T07:45:32.587Z ・ **status:** succeeded
- **opText:**
  > 奉勸女孩子們特別掛住 ex / 沉 crush / 恨拖拍嗰排，臨瞓前都係墊塊 m 巾吧，可能第二朝起身你會多謝琴晚嘅自己的
- **opLikes:** 994 ・ **commentCount:** 3
- **topReplies（audience）:**
  - R1 — `whc620_`（0）: 「留友看^_^」
  - R2 — `melodyyy130._`（0）: 「留友😂😂😂😂」
- **aiGist:** 作者幽默建議在深夜情緒氾濫想念前任或暗戀對象時，預先墊好衛生棉以防隔天生理期報到。
- **aiTags:** 情感焦慮 / 深夜情緒 / 生理期 / 戀愛腦 / 自我調侃
- **notes:** OP likes 高（994）但 commentCount 極低（3），且 2 條 reply 都是「留友」（bookmark 用，零內容）——**高讚低評論 + 留言無實質**，類似 work S14 的 minimalist-resonance pattern

---

### S6
- **signalId:** `signal_jvtrb5ya_mpgmebvl` / **itemId:** `item_iyhqlmy9_mpgme8rk`
- **sourceUrl:** https://www.threads.net/@no_responsesss/post/DYm0fO1khC4
- **capturedAt:** 2026-05-22T07:50:47.457Z ・ **status:** succeeded
- **opText:**
  > 男朋友收工早過我，所以永遠都係佢接我。琴日公司早放！偷偷地去接佢收工，佢見到我嗰陣個樣勁開心😆 彈下彈下咁跑過黎🥰 買左佢最鍾意嘅野食野飲俾佢，佢一見到就嘩嘩聲。原來接人收工仲開心過俾人接😚
- **opLikes:** 2300 ・ **commentCount:** 50
- **topReplies（audience）:**
  - R1 — `chan_kwok_pong`（474）: 「今日之事，復證一理：贈禮者之怡悅，實勝於受贈之人🤣 願祝二君，執子之手，與子偕老。『互接收工』，共話溫馨，白首不離🤜🫷」
  - R2 — `ssshhhaaannn4`（188）: 「對方有回應，就係幸福」
- **aiGist:** 發文者分享偷偷去接男友下班並準備驚喜，體驗到比被接送更快樂的甜蜜心情。
- **aiTags:** 情侶日常 / 甜蜜互動 / 驚喜接送 / 戀愛儀式感
- **notes:** OP likes 2300 是 9 篇最高。**唯一純正面 / 甜蜜敘事**。R2 author 為 `ssshhhaaannn4`，「對方有回應」對照 OP handle `no_responsesss`（無回應）形成 ironic 對位

---

### S7
- **signalId:** `signal_nddn3z22_mpgmeduy` / **itemId:** `item_f99pstr7_mpgmedmi`
- **sourceUrl:** https://www.threads.net/@ytteb0214/post/DYnhwFDE8NX
- **capturedAt:** 2026-05-22T07:50:50.026Z ・ **status:** succeeded
- **opText:**
  > 要認命。有個男朋友拍長拖，點知係草食男，長期獨守空房，懶懶閒。之後識到個有上進心男朋友，由散工變穩定月入 6 萬，但賭到月月清袋。之後識咗個由萬 9 人工變 10 幾萬人工，之後就出軌離開我。嗯，我知道我係要認命。
- **opLikes:** 419 ・ **commentCount:** 106
- **topReplies（audience）:**
  - R1 — `mathkinger`（190）: 「唔係你要認命，係你遇到嘅人都有自己課題。你其實一直都係陪人由低谷行到高處嘅人，只係未遇到一個成功後都仲珍惜你嘅人…而且你講得出自己經歷，其實已經比好多人清醒。」
  - R2 — `luffy_623`（63）: 「點解你用收入去衡量一個男士的價值？這不是因為你膚淺，而是太受資本影響（香港女性的通病）」
- **aiGist:** 作者回顧三段截然不同的感情經歷，感嘆無論對方是草食男、上進賭徒還是事業有成者，最終都以失敗告終，認為自己只能認命。
- **aiTags:** 感情經歷 / 擇偶標準 / 情感挫折 / 人生無奈
- **notes:** commentCount 106 是 9 篇最高。R1 reframe（唔係認命係未遇啱）+ R2 直接質疑 OP 的價值框架（用收入衡量）——**兩條 reply 方向不同**：R1 安慰、R2 批判。OP 用收入軌跡（6 萬 / 萬 9→10 幾萬）描述三任男友

---

### S8
- **signalId:** `signal_og18r4ax_mpgmf0a8` / **itemId:** `item_f81c3b8h_mpgmeztv`
- **sourceUrl:** https://www.threads.net/@tin.waiii/post/DYoYuAAFoKl
- **capturedAt:** 2026-05-22T07:51:19.088Z ・ **status:** succeeded
- **opText:**
  > 媽咪上個星期同我講叫我拍拖。點解？我話拍拖只可以玩一條 JJ，唔拍拖可以玩十條 JJ
- **opLikes:** 274 ・ **commentCount:** 17
- **topReplies（audience）:**
  - R1 — `bobos.corner`（14）: 「拍拖會比男人左右，唔拍拖就左右都係男人」
  - R2 — `tinhung_`（7）: 「師兄好忙」
- **aiGist:** 發文者以幽默直白的方式表達比起穩定交往，更傾向享受單身自由的感情態度。
- **aiTags:** 感情觀 / 單身主義 / 兩性關係 / 個人選擇
- **notes:** 粗俗幽默 + 性別曖昧（「玩十條 JJ」+ R1「左右都係男人」+ R2「師兄」暗示 OP 為男同志或調侃）。母親作為訊息中介出現（對照 work S15 母親遞送殯儀館看更）

---

### S9
- **signalId:** `signal_ddigwa02_mpgmf6rj` / **itemId:** `item_s0s8ve4f_mpgmf6l2`
- **sourceUrl:** https://www.threads.net/@ccccc12713/post/DYmF8Fbke0Q
- **capturedAt:** 2026-05-22T07:51:27.487Z ・ **status:** succeeded
- **opText:**
  > 因為太悶走去用 app 識人，發現真係冇幾個正常，一係自卑到自大，一係 Kam 到約咗你但約會前幾日失蹤，一係幾好傾出嚟見面都唔錯以為終於識到個正常人啦，點知有老婆嘅😖 今日又 match 咗個，問我玩咗幾耐 gym，我話幾個月啫，又問我有冇跟 pt，我話冇，即刻就批評我實係做得唔啱或 hea 做，再搬 d 做 gym theory 嚟教我…（OP 詳述對方健身一年但身形不佳卻說教）…不過算，我當係「我必須非常努力才顯得毫不費力」，好灰想 del app😔
- **opLikes:** 291 ・ **commentCount:** 56
- **topReplies（audience）:**
  - R1 — `shatterednsober`（86）: 「見到『自卑到自大』呢句好有同感，App 入邊真係無個正常，認真嘅人真係會玩到好炆」
  - （另一條 commentsPreview 為 OP `ccccc12713` 自我接話「我又唔同意喎」25 likes，**排除**）
- **aiGist:** 作者分享在交友軟體上頻繁遇到奇葩對象，包括已婚人士與愛說教的健身新手，感嘆尋找正常對象之困難。
- **aiTags:** 交友軟體 / 約會經驗 / 健身教導魔人 / 感情挫折
- **notes:** 只有 1 條 audience reply（R1 共鳴）。OP 自我接話「我又唔同意喎」針對某條未進 preview 的 reply——暗示 thread 內有 OP 與 reader 的分歧，但該 reply 不可得

---

## Aggregate facts（純算術）

- **時間：** 全部 9 篇於 **2026-05-22 同一天**加入 love topic（04:44–07:51）。但**原帖日期橫跨 4-5 月**（S2 原帖 15/04、S1 原帖 06/05 等）——採集是單一 batch，原帖時間分散
- **平台：** 9/9 來自 threads.net
- **狀態：** 9/9 succeeded（但 love topic synthesis=null，尚未生成 audit）
- **OP likes 範圍：** 16（S1）– 2300（S6）；中位數約 291
- **commentCount 範圍：** 3（S5）– 106（S7）；中位數約 50
- **主題分佈（依 OP 文本，非判讀）：** 交友 app 相關 5 篇（S1/S2/S3/S4/S9）、感情經歷/態度 3 篇（S7/S8/S5）、情侶甜蜜 1 篇（S6）
- **可用 audience reply：** 約 14 條（扣 OP 自我 echo / 接話）；**S2 為 0 條**
- **AI gist/tags 已存在於全部 9 篇**（signal-tags），但本 pipeline 不繼承，P1+ 重讀

---

## 與 work topic 的結構差異（供對照，非判讀）

純事實層面，love vs work 的採集結構差異：

| 維度 | work | love |
|------|------|------|
| 訊號數 | 15（14 analyzed + 1 queued） | 9（全 succeeded） |
| schema | v0 global-state session items | v1 topics + signals + items |
| 採集 batch | 2 批（5/8 + 5/21） | 1 批（5/22 同日） |
| 原帖時間跨度 | 集中（多數 5 月） | 分散（4-5 月） |
| audience reply 密度 | ~27 條 | ~14 條（S2 為 0） |
| OP 自我接話佔 preview | 偶見（S6/S8） | 嚴重（S2 全部、S9 部分） |
| AI gist/tags | 有（work signal-tags） | 有（love signal-tags） |

**這些差異本身可能影響 audit 結論的可比性**——尤其 audience reply 密度差距，會讓 love 的 P4 結論天然較弱。下游 pass 須持續標明。

---

## Next pass

P1 — Per-signal Free Reading。每篇配一段 prose reading，引用 `S#.OP / S#.R#`，輸出 `2026-05-22-love-pass1-signal-readings.md`。

P1 不引用 work 的任何 pass、不引用 love 的 AI gist——獨立重讀，避免把 work 的 narrative 框架（投入不兌現 / 中間層缺席等）預先套到 love 上。對照分析留到全部 pass 跑完後的 cross-topic 階段。
