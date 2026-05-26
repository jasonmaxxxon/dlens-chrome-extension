# Work Topic — Pass 0: Evidence Packet

**日期：** 2026-05-21
**Stage：** P0 / 6（Evidence layer，deterministic）
**來源：** Chrome extension LevelDB `dlens:v0:global-state` → session `work` → items
**狀態：** 15 items（14 succeeded + 1 queued），UI 顯示 16 的差異未補

---

## Stage Contract

### Purpose
為後續 P1–P5 + Validator 提供**穩定、可重現、純事實**的 evidence layer。

### Input
`/tmp/dlens-work-items.json`（從 Chrome extension storage 抽出的原始 dump）。

### Output（本文件）
15 個 EvidencePacket block，每個 block 內欄位純事實，零判讀。

### Fields per packet
- `signalId` — DLens 內部 item id（用於後續 cross-pass citation）
- `S#` — 本 audit 內的短碼（S1–S15），所有後續 pass 必須用這個碼引用
- `sourceUrl` — Threads 原文 URL
- `capturedAt` — 用戶把訊號加入 work session 的時間（ISO，UTC）
- `status` — `succeeded` / `queued`
- `opText` — root post 全文（從 commentsPreview 中 author == OP handle 的條目抽，或 snippet 為備援）
- `opLikes` — root post 的 likes count（OP 留言條目的 likes 欄位）
- `commentCount` — Threads 回報的留言總數（≠ `topReplies` 數量）
- `topReplies[]` — 最多 3 條 commentsPreview，每條 `{ author, text, likes }`
- `notes` — 純機械註記（資料缺失、OP likes 不可得、queued 狀態），**不寫判讀**

### What this file is NOT
- 不分配 tag、theme、narrative
- 不評估 sentiment、consensus、stance
- 不剪裁原文、不省略粗口、不翻譯
- 不解讀 likes 數的意義
- 不標記 outlier、boundary、off-topic
- 不從 reply text 推 OP 立場

所有解讀動作從 P1 開始。

### Citation convention
本 audit 中所有後續引用一律用 `S#` 短碼（不用 signalId）。引用單條 top reply 用 `S#.R1 / R2 / R3`，引用 OP 用 `S#.OP`。

---

## EvidencePackets

---

### S1
- **signalId:** `item_dp985g8p_moweyatc`
- **sourceUrl:** https://www.threads.net/@youdonothavetoknowme85/post/DYBIm9Zkoos
- **capturedAt:** 2026-05-08T04:26:58.752Z
- **status:** succeeded
- **opText:**
  > 90後初入職場日記（1）
  > 你冇聽錯 我作為90尾 而家先開始入職場
  > 原因唔解釋啦
  > 同班Gen Z同期同事 其實都好關照我
  > 但唔知點解 就係融入唔到
  > 唔係求咩解決辦法 只係想🤧下
- **opLikes:** 11
- **commentCount:** 5
- **topReplies:**
  - R1 — `mprispa003`（1 likes）: 「90尾你都係GenZ, 好快融入啦」
  - R2 — `diuneion9ac`（1 likes）: 「say on god?」
- **notes:** commentsPreview 第一條為 OP 自身（已抽為 opText）；只剩 2 條 reply

---

### S2
- **signalId:** `item_tj0xf4sa_moweycyp`
- **sourceUrl:** https://www.threads.net/@fk_pk_1919/post/DYCPPONkrhk
- **capturedAt:** 2026-05-08T04:27:01.537Z
- **status:** succeeded
- **opText:**
  > 真係好想辭職... 🫠
  > 琴日第一日正式返工，明明簽約嗰陣仲好有鬥志，但一入到去發現訊息量多到個腦爆塞。
  > 以前做 Temp 嗰陣明明好活潑、好敢同人溝通，點知一做正式員工，見到咩都要學、每個人教嘅方法又唔同，個人突然間變到好自卑，連開口同同事溝通都驚驚青青。
  > 好驚自己做錯，又好驚俾人覺得我『露晒餡』。25歲人先嚟懷疑人生，係咪我太弱？真係好想即刻走人... 😭
- **opLikes:** 235
- **commentCount:** 20
- **topReplies:**
  - R1 — `manddddys`（64 likes）: 「唔好驚做錯野，有時老員工都會做錯，假如接受唔到新員工做錯，間公司容錯率都幾低，做錯野之後能學習番就好啦，錯唔代表無意義，唔洗太大壓力😌」
  - R2 — `master.atse.10`（43 likes）: 「認真講句，橫掂都想辭職，難得嚟到嚟個場，帶住一個反正預咗死既心態，盡量學佢哋既嘢，最終，可能會引發到您既小宇宙潛能。（心態輕鬆咗，學嘢自然會容易啲）。放心，您並不孤單，嚟度既網友都會默默支持您，隨時都願意聆聽您既心事分享」
- **notes:** —

---

### S3
- **signalId:** `item_dojw8zng_moweyihh`
- **sourceUrl:** https://www.threads.net/@hello9upper/post/DYBBi77AWJp
- **capturedAt:** 2026-05-08T04:27:08.692Z
- **status:** succeeded
- **opText:**
  > 未轉到工
  > 決定將薪水小偷行動升級😠
  > Extra 斟水x2 次 去廁所x2次 平衡番自己
- **opLikes:** 81
- **commentCount:** 11
- **topReplies:**
  - R1 — `lau02051984`（5 likes）: 「飲多啲水就可以去洗手間多D，又可以加速排毒兼做多咗運動，連屋企電費都慳埋，因為唔駛煲水，一舉三得」
  - R2 — `keungson_mo`（5 likes）: 「去廁所記得去耐啲」
- **notes:** —

---

### S4
- **signalId:** `item_4qgzrkul_moweyqwn`
- **sourceUrl:** https://www.threads.net/@eatssential.ca.yyz/post/DYDLAQ0EpUp
- **capturedAt:** 2026-05-08T04:27:19.606Z
- **status:** succeeded
- **opText:**
  > 有時我都好慶幸我喺外國返工，
  > 如果唔係，喺香港開會share screen
  > 遇到呢啲情況真係好難解釋
  > Spoiler
- **opLikes:** 424
- **commentCount:** 13
- **topReplies:**
  - R1 — `kaka_inca`（59 likes）: 「大便唔臭原因係咪你鼻塞？」
  - R2 — `sophiawong0418`（21 likes）: 「網絡上已經冇你在意既人啦？😂💩」
- **notes:** OP 的 Spoiler 內容（圖片）不可得；reply 內容指向廁所/排泄相關，但圖片本身未抽

---

### S5
- **signalId:** `item_eboaw2fh_mowez20u`
- **sourceUrl:** https://www.threads.net/@smallpotatololo/post/DYBifAGEcpA
- **capturedAt:** 2026-05-08T04:27:34.014Z
- **status:** succeeded
- **opText:**
  > 有無人開過、經營過茶飲店？
  > franchise 返黎做個d，
  > 其實扣埋租金/水電/材料/人工，
  > 每個月大概有幾多錢賺？
  > 定其實以家已經供過於求、氾濫左，
  > 唔應該再考慮？
- **opLikes:** 23
- **commentCount:** 16
- **topReplies:**
  - R1 — `bizmarket.hk`（42 likes）: 「Franchise多數先收一筆加盟費e.g 3/5年 1x萬啦\n之後跟佢地裝修 買設備。連埋3按1上 開業成本大約50-70萬（睇大細）\n營運開支：租金（唔知你邊區）人工（如果200呎左右一般用2-2.5個人，全職16000-18000，兼職55-60/hr 連埋mpf大約$45000左右人工開支） 材料（營業額25-30%） 水電（當開11:00-22:00 電就3-4000，商場鋪好d 因為冷氣商場既 不過舊錢就落左冷管到） franchise既話一般收營業額3-5% 睇邊個brand，外賣平台Keeta抽28-30%\n扣哂所有開支 一般利潤會係營業額12-15%\n冬天有機會跌15-20%生意\n供過於求又未必 睇你產品，點解大家都做奶茶 你有人排隊 我無。\n廢水而家開始變剛性需求咁 無話氾唔氾濫。覺得自己產品好咪試下\n溫馨提示：要做既最好搵50k租樓下，同埋頂手鋪再翻新。慳裝修同出牌。\n有野唔明再dm我問」
  - R2 — `rrlee`（4 likes）: 「唔好諗每個月賺幾多？先諗每個月可以蝕幾多。」
- **notes:** R1 是長篇 detailed 經濟拆解，比 OP 短文體量大；保留全文不剪

---

### S6
- **signalId:** `item_el777kuy_mowez91t`
- **sourceUrl:** https://www.threads.net/@shingi_shiratori/post/DYCwY22H2TP
- **capturedAt:** 2026-05-08T04:27:43.121Z
- **status:** succeeded
- **opText:**
  > 我80後，創業做生意賣咖啡豆有七年了，由一個咖啡師到做生意，一架墨綠色Bentley continental GT，存款唔多，Office 由葵興工廈進駐尖沙咀甲級寫字樓，平平地住啟德天璽天方便返工，另外買入西沙 Sierra Sea 連天台單位方便星期六日休息。謙虛勉勵大家，即使學歷不高，只要用心做事，真誠待人，為夢想奮鬥，肯努力去試，真係乜字都夠膽打得出嚟，記住夢想同目標係有分別，目標唔一定達到，但夢裏一定什麼都有。
- **opLikes:** 63
- **commentCount:** 9
- **topReplies:**
  - R1 — `shingi_shiratori`（4 likes）: 「早啲瞓，足夠休息好重要」
  - R2 — `kokorotrading`（2 likes）: 「勁呀 我諗係有一句唔記得咗講,,我估係 加埋老豆老母比嘅幾千萬碎銀 終於辛辛苦苦做到以上嘅野」
- **notes:** R1 是 OP 自我回覆；R2 是讀者；OP 自我回覆 likes 高於外部 reply

---

### S7
- **signalId:** `item_wv0mgqd5_mowezacp`
- **sourceUrl:** https://www.threads.net/@hakodatedingdong/post/DYCY7BbCGcr
- **capturedAt:** 2026-05-08T04:27:44.808Z
- **status:** succeeded
- **opText:**
  > 當住成功人士面前拆穿自己係基層單親女
  > 雖然我哋黎自同一大學、學院、專業，但只要佢哋深入少少了解我，就感受到書香後代、同我呢種基層雜草本質上嘅區別。
  > - 我的確讀過吓藝術、去左陣歐洲、做過拍賣行，傾呢個領域嘅野係幾投契。或者咁，異性會約我去亞協/ 西九/ gallery，去啲氣氛較好嘅西餐/ 高級居酒屋/ 遊艇會食吓飯。
  > - 我扮演人設提供智性對話/ 情緒價值。每次見面我都會諗好style去match個vibe，產生幻象令佢以為我高質。
  > - 直到最近gathering，我係全檯
- **opLikes:** unknown
- **commentCount:** 94
- **topReplies:**
  - R1 — `unknownduck_duck`（1600 likes）: 「你講嘢唔分場合，上唔到大枱，唔怪得人」
  - R2 — `winniefatpoon__`（964 likes）: 「我同你差唔多background做ibank，身邊同事同date嘅人都係屋企做生意有學識、佢地讀ischool同留學個班。講真除非有人好奇問咁我會誠實回答，否則我覺得冇咩必要主動講出嚟。根本身世差距同經歷呢啲大家相處都會feel到，如果冇人提起姐係人地都唔在意呢啲嘢，在意個班應該一早已經遠離咗你，你係唔恰當嘅場合自爆大概先係你曖昧對象講個番說話嘅原因。」
  - R3 — `jacko.488`（673 likes）: 「唔關事，你kam個位純粹係你咁樣介紹自己 完全唔適合個場合，邊有人一班gathering自介會講呢啲野，你太放大自己個出身，現實根本冇咁多觀眾」
- **notes:** OP text 在資料源被截斷於「直到最近gathering，我係全檯」；commentsPreview 無 OP 自身條目，opLikes 不可得

---

### S8
- **signalId:** `item_f5m3h2uz_mowezv69`
- **sourceUrl:** https://www.threads.net/@just_for_justise/post/DYBr_UzjyQJ
- **capturedAt:** 2026-05-08T04:28:11.793Z
- **status:** succeeded
- **opText:**
  > 交稅冷知識：
  > 香港只有不足一般嘅人口要交薪俸稅。
  > 返工交稅嘅人，大概是200萬左右，喺香港人口嘅3分之一。
  > 所以大家要覺得自己返工交稅係件好偉大嘅事，養起無數大媽同長者
  > /
- **opLikes:** 193
- **commentCount:** 29
- **topReplies:**
  - R1 — `Pin icon`（38 likes）: 「冷知識：每2個交稅嘅人，都可以幫社會養起一個全職主婦。 不過佢哋就唔會去你屋企做家務。」
  - R2 — `just_for_justise`（38 likes，OP 自我回覆轉貼 R1）: 「冷知識：每2個交稅嘅人，都可以幫社會養起一個全職主婦。 不過佢哋就唔會去你屋企做家務。」
- **notes:** `Pin icon` 是平台 placeholder（pinned comment 沒有作者欄）；OP 把 pinned 內容自我轉貼了一次

---

### S9
- **signalId:** `item_v0y6i1qf_mowf02iu`
- **sourceUrl:** https://www.threads.net/@lok_channel/post/DYA8mufE4Xw
- **capturedAt:** 2026-05-08T04:28:21.318Z
- **status:** succeeded
- **opText:**
  > 仆你街，洗唔洗俾埋個屎忽你吊丫，都On9嘅
  > 咁你咪去請 新移民 囉
  > 唔使搵咁多藉口喎，講到好似好無可奈何咁
  > 而家啲人最鍾意攞現代嘅後生仔做遮醜布
  > 相片來源：
  > CTgoodjobs
  > #年輕也是有罪
  > #將心比己啦唔該
  > #你哋啲仔女都受緊
  > #所以咪無人生bb囉
  > #又要馬兒好又要馬兒不吃草
- **opLikes:** 268
- **commentCount:** 43
- **topReplies:**
  - R1 — `mkm2bby`（114 likes）: 「其實本身係個社會結構有問題，你又唔係學新加坡咁樣請晒啲外勞返嚟之後新加坡本地人只做高管管理叫人做嘢；如果唔係點解香港要請菲傭印傭要請30幾萬外傭？ 就係因為佢哋人工平香港人嘅三份一/ ¼價錢；但政府引入外勞本身就九唔搭八你本身用市價另外包保險其他虢礫緙嘞住宿；根本同香港人或者甚至貴香港人；但問題係出現喺度啦，就算價錢一模一樣 正常都係外地嗰啲勤力過香港；即係以前地盤好多尼泊爾或者印度人嗰啲。負責上了上板（真係舊同事係做嗰一瓣㗎）；你個鋁模；香港人可能要一錢日後甚至三四個人先托一塊板；但係你俾個印尼佬一個人就托咗上去；人哋一個頂你四個人；價錢上可能係香港人打八折（現實當中其實更低）；你係老細鍾意請咩人做嘢？ 咁問題係政府冇規劃好嘅位置；其實你請喱或者清潔，執垃圾最低層嗰啲全部外勞係冇問題；社會福利你要跟返；最重要個職位規管，你監管嗰啲人係咪全部請返晒本地香港人？」
  - R2 — `kelvinfun2022`（56 likes）: 「繞好大個圈其實三個字 "減人工" ， 某學者早講左做左防疫就會咁，原因都唔講得咁多了。」
- **notes:** OP 是對某張原帖（來源 CTgoodjobs）的引用回應，原帖本身內容不可得；OP 帶 hashtag block

---

### S10
- **signalId:** `item_0wryffxe_mowf0tve`
- **sourceUrl:** https://www.threads.net/@mstyleyam_6823/post/DYBhXfAmS_k
- **capturedAt:** 2026-05-08T04:28:56.762Z
- **status:** succeeded
- **opText:**
  > 職場新人難題
  > 話說就嚟過試用期
  > 公司潛規則係要請大家食糖水/飲廢水
  > 但人工得17k嘅我
  > 本身又要交租、家用、日常開支嗰啲
  > 基本上都係月光族嚟
  > 平時返工都已經帶飯
  > 而家同事成日有意無意都會講
  > 「你就嚟過試用喇喎，有咩表示？」
  > 作為一個死窮鬼都唔知點答
  > 因為公司都有廿幾30人
  > 計過條數要請嘅話起碼要成1000蚊
  > 但係唔好講1000，500平時都好難攞到出嚟
  > 本身自己又唔係叻，如果轉第二份工
  > 又未必會好似而家呢度咁穩定
  > 究竟我應該要點做好？
- **opLikes:** 788
- **commentCount:** 230
- **topReplies:**
  - R1 — `diu_lookwhat7ar`（2200 likes）: 「得17k 仲要請，叫佢地食屎啦。\n升職就話啫，過試用請條毛」
  - R2 — `vialaviida`（1400 likes）: 「好認真答你，如果一次半次，就爽爽快快請咗佢，通常呢啲文化嘅公司啲人都好撚小氣記仇，如果你短期內唔想轉工，就請咗大家飲嘢算9數」
- **notes:** R1 + R2 的 likes 均高於 OP，是這 15 篇中最明顯的「reply >> OP」現象之一

---

### S11
- **signalId:** `item_xvz1h2j4_mpf0rz9i`
- **sourceUrl:** https://www.threads.net/@allaboutmoney_hk/post/DYjXlqeESkg
- **capturedAt:** 2026-05-21T04:57:46.566Z
- **status:** succeeded
- **opText:**
  > 1. 尋晚kelly鬧得我好岩，人類總係要當頭棒喝先肯醒。
  > 2. 馬雲早於9年前預言人工智能出現，人類將來每星期只需工作3日，每日工作4小時，所以可以到處旅行。馬斯克上年預言，人類將來毋須工作，可以留係屋企種菜。旅行、種菜都係好聽嘅說話，潛台詞係：人類將被AI取代而失業。
  > 3. 黃仁勳更搞笑，話AI唔會令人類失業，因為AI基建要電工同水喉工，藍領有著數。唔通叫華爾街、中環班banker除埋套西裝，全民整水喉？
  > 4. 尋日，渣打CEO終於唔再單單打打，講明會用AI取代「低價值人力資源」（lower-value human capital），未來4年全球中後台炒15%員工，相當於接近8,000人。《彭博》形容，渣打係首批跨國銀行，講明會因為AI而炒人。滙豐CEO今日客氣少少，叫員工唔好抗拒AI，公司會再培訓大家。
  > 5. Meta亦因為大舉投資AI，今日開始全球裁員8,000人，新加坡嘅員工今日凌晨4點開始收大信封，之後輪到歐洲、美國。
  > 6. 馬斯克預言金錢將會消失，能源將會成為貨幣。但佢無講一樣嘢：你屋企唔係開發電廠。
  > /
- **opLikes:** 400
- **commentCount:** 36
- **topReplies:**
  - R1 — `hoyin.eth`（38 likes）: 「睇緊點考水電A牌」
  - R2 — `sebastianium`（32 likes）: 「你被炒，改行去整水喉，但一方面個個被炒嘅都走去整水喉，競爭激烈，另一方面越來越多人冇收入，屋都冇得住，冇水喉俾你整，或者有屋都冇錢請你嚟整水喉，結果整水喉都冇得做。總之人力需求減少，整體消費減少，支持唔到市場，導致更多人失業，惡性循環。」
- **notes:** OP 為時事評論貼文，6 條 numbered 點，比其他 OP 結構化；R2 給出 second-order 結構性推論

---

### S12
- **signalId:** `item_6i4hcby9_mpf0sl5b`
- **sourceUrl:** https://www.threads.net/@ivanwong_4673/post/DYj96pZEgMS
- **capturedAt:** 2026-05-21T04:58:14.927Z
- **status:** succeeded
- **opText:**
  > 失業好痛苦，keeta又飽和，層樓都唔知點供，唔敢同老婆講...而家去讀護士好唔好...
- **opLikes:** 1500
- **commentCount:** 201
- **topReplies:**
  - R1 — `edwardyftse`（2900 likes）: 「千祈唔好讀護士，現在已經飽和，政府準備招聘更多內地護士來港。\n(我係醫生）」
  - R2 — `c_stevieg`（383 likes）: 「去讀護士即係要繼續再失業多兩年\n（假設你係讀EN)」
- **notes:** R1 的 likes（2900）幾乎為 OP（1500）的兩倍，R1 author 自報醫生身份

---

### S13
- **signalId:** `item_30k7ic4a_mpf0stc1`
- **sourceUrl:** https://www.threads.net/@jerrylau31/post/DYkOAVTlJT8
- **capturedAt:** 2026-05-21T04:58:25.536Z
- **status:** succeeded
- **opText:**
  > 大家唔好再讀碩士啦。我公司出份adv請asso做admin, 人工係16-20k港元。收到超過40個申請有碩士學位..
- **opLikes:** 1900
- **commentCount:** 139
- **topReplies:**
  - R1 — `mfmf8611`（309 likes）: 「讀master容易過讀degree，一向係高級興趣班，除了個別專業學位」
  - R2 — `e_is_missing_again`（243 likes）: 「Taught master 交學費就讀到，其實只係唔夠一年嘅興趣班。\n請人最重要都係睇佢工作、學習態度，近年請兩三個由asso讀上MU degree嘅阿妹，工作能力和態度好過好多有master degree嘅人好多，依家見到master degree嘅candidate 通常都唔會考慮。」
- **notes:** R2 作者報告自身為 employer / 招聘者視角

---

### S14
- **signalId:** `item_i4ej724h_mpf0ta9w`
- **sourceUrl:** https://www.threads.net/@real_is_for_heaven/post/DYj88C4jw-x
- **capturedAt:** 2026-05-21T04:58:47.492Z
- **status:** succeeded
- **opText:**
  > 我有個朋友終於完成phd學位，同佢食食下飯，問佢:「辛苦左咁多年，有咩想講？」
  > 佢話:「粗口。」
  > 我靜左。
- **opLikes:** 4000
- **commentCount:** 11
- **topReplies:**
  - R1 — `dennis._.n`（281 likes）: 「Permanent head Damage 你估簡單呀，沒有讀書就沒有傷害…..」
  - R2 — `liviakwan121`（150 likes）: 「認真，讀master都癲，仲要PhD\n對住同一樣嘢幾年，仲要唔一定做到positive result」
- **notes:** OP likes（4000）是 15 篇中最高；commentCount（11）相對低，likes/comment ratio 異常高

---

### S15
- **signalId:** `item_2f70vjlb_mpf6j7h0`
- **sourceUrl:** https://www.threads.net/@byl2yu1_/post/DYkeiqTEgBb
- **capturedAt:** 2026-05-21T07:38:54.995Z
- **status:** queued
- **opText:**
  > 老母講笑咁俾我睇紅磡有殯儀館請看更30k一個月問我敢唔敢做 呢一刻我有種衝動quit u應徵。
- **opLikes:** unknown
- **commentCount:** unknown
- **topReplies:** —
- **notes:** queued 狀態，commentsPreview 為空，無 OP likes 資料；後續 pass 必須將 S15 作為「OP-only 證據」處理，不能對留言區做任何引用或推論

---

## Aggregate facts（純算術，非判讀）

- **時間分佈：** 5/8 batch 10 篇（S1–S10），5/21 batch 5 篇（S11–S15）
- **平台：** 15/15 來自 threads.net
- **分析狀態：** 14 succeeded + 1 queued
- **OP likes 範圍（14 篇有資料）：** 11 (S1) — 4000 (S14)；中位數 263
- **commentCount 範圍（14 篇有資料）：** 5 (S1) — 230 (S10)；中位數 22
- **「Reply likes > OP likes」現象（14 篇有資料中）：** S10（R1 2200 > OP 788）、S12（R1 2900 > OP 1500）— 共 2 篇
- **不可得欄位：** S7 opLikes、S15 全部留言相關欄位

---

## Next pass

P1 — Per-signal Free Reading。每個 EvidencePacket 配一段 prose reading（不填欄位、不打 tag），引用 `S#.OP / S#.R1 / S#.R2 / S#.R3`，輸出到 `2026-05-21-work-pass1-signal-readings.md`。

P1 的輸入只限本檔；不引用 Codex northstar，避免污染獨立判讀。
