# Work Topic — Pass 1: Per-Signal Free Readings

**日期：** 2026-05-21
**Stage：** P1 / 6（first interpretive pass，per-signal）
**Input：** `docs/audit/2026-05-21-work-pass0-evidence.md`
**狀態：** 15/15 readings 完成（S15 為 OP-only）

---

## Stage Contract

### Purpose
為每個 EvidencePacket 做一段獨立的 prose reading。**這層是 audit pipeline 中第一個有判讀的 stage**，但僅限 per-signal——不做 cross-signal cluster、不命名 narrative、不寫 lexicon、不打 enum。

### Input
P0 的 15 個 EvidencePacket，使用 `S#.OP / S#.R1-R3` 引用。

### Output（本文件）
每篇一個 reading block，含：
- **prose reading** — 一段自由判讀，read this signal as a literary object。重點放在 OP 想說什麼、reply 做什麼動作、兩者間的張力、什麼沒說出來
- **evidenceRefs** — 本段引用了哪些 `S#.OP/R`
- **watchNotes** — 值得帶到 P2-P5 的觀察 flag（不是結論，是 hooks）

### What this pass does NOT do
- 不做 cross-signal cluster / 不命名 narrative
- 不抽 lexicon（P2 才做）
- 不命名 audience reaction 模式（P4 才做）
- 不寫缺席聲音（P5 才做）
- 不為任何 reading 打 sentiment / consensus / tag enum
- 不引用 Codex 2026-05-21 northstar，避免 framework 污染

### Discipline
每段 reading 至少回答兩個問題：
1. **OP 在這篇做什麼動作？**（不是「OP 講了什麼」，是「OP 為什麼這樣講」）
2. **Reply 對 OP 做了什麼動作？**（共鳴 / 反駁 / 升級 / 漂移 / 漠視 / 重 framing）

長度不固定。OP 一句話的訊號允許短，OP 長篇的訊號允許長。

---

## Readings

---

### S1 — 90後初入職場 vs Gen Z

OP 用「90尾／而家先開始入職場」這個自我定位開場，接著明確聲明「唔係求咩解決辦法 只係想🤧下」——這句很關鍵：OP 主動禁止 advice，只想 venting。但 R1（`S1.R1`）做的恰好違反 OP 的禁止：「90尾你都係GenZ, 好快融入啦」——把 OP 主張的代際隔閡消解成「你自己人啦」，連身份分類都重新分配。R2（`S1.R2`）「say on god?」（1 likes）是無關 meme 跟風。OP 11 likes、留言 5 條，整體訊號流量極低，幾乎是 dead thread——這篇值得留意的不是內容共鳴強度，而是 **OP 預先 disqualify advice 但 reply 仍然強行 reassure** 這個互動結構。OP 拒絕的不只是建議，是被分類本身的權力被別人拿走。

- **evidenceRefs:** `S1.OP`, `S1.R1`, `S1.R2`
- **watchNotes:**
  - OP 自我定位「90尾」vs reply 重新分類「你都係GenZ」的命名張力
  - OP 明說「只係想🤧下」但 reply 仍 advise——advice-prohibition violation pattern
  - 全 audit 中互動體量最低（11/5），可作為低流量訊號的 baseline

---

### S2 — 25 歲第一日返工想辭職

OP 列舉的恐懼非常具體：「訊息量多到個腦爆塞」、「驚開口同同事溝通」、「驚自己做錯」、「驚俾人覺得我『露晒餡』」（`S2.OP`）。「以前做 Temp 嗰陣明明好活潑、好敢同人溝通」這個對照非常重要——OP 認為自己在非正式身份時是 functional 的，是「正式員工」這個身份本身觸發 paralysis。問題不是工作內容，是身份要求帶來的 exposure。R1 manddddys（64 likes，`S2.R1`）做的是 reframing「老員工都會做錯」+ 容錯率反推「假如接受唔到新員工做錯，間公司容錯率都幾低」。R2 master.atse.10（43 likes，`S2.R2`）給出更怪的建議：「帶住一個反正預咗死既心態」——用 nihilism 當免疫力。兩條 reply 共同特徵是**不質疑 OP 的恐懼是否合理，只給 emotional permission 繼續恐懼**。沒有任何一條 reply 主張 OP 應該離開或留下，等於 reply 把抉擇還給 OP，自己只負責陪伴。OP 235 likes vs reply 64/43，是 OP-led 共鳴。

- **evidenceRefs:** `S2.OP`, `S2.R1`, `S2.R2`
- **watchNotes:**
  - 「Temp 身份 functional vs 正式員工身份 paralysis」的自我落差描述
  - 「露晒餡」是 OP 自選詞，值得 P2 lexicon 留意
  - Reply 給的不是解法是 emotional permission——P4 audience pass 可能要有這類「不選邊只陪伴」的反應型態描述

---

### S3 — 薪水小偷行動升級

OP 在「未轉到工」的等待期把日常小動作（多斟水、多去廁所）命名為「薪水小偷行動升級」（`S3.OP`）。最值得讀的不是動作本身，是 **OP 為這個動作創造 vocabulary 的動作**——「薪水小偷」是 OP 自鑄的身份標籤，把被動拖延轉成主動 rebellion script。R1 lau02051984（`S3.R1`）做的是 over-justification 喜劇：「飲多啲水加速排毒兼運動，連屋企電費都慳埋」——把微反抗包裝成 self-improvement 來掩護。R2 keungson_mo（`S3.R2`）「去廁所記得去耐啲」——直接升級為 operational protocol。這個留言文化是共謀：沒有人質疑這是否合理、是否傷害自己/同事，只接力擴展技術細節。OP 81 likes、留言 11 條，互動體量中等，但戲謔密度高。這篇的 reader 動作不是反駁也不是升級論述，是**接力擴寫 OP 創造的 vocabulary**。

- **evidenceRefs:** `S3.OP`, `S3.R1`, `S3.R2`
- **watchNotes:**
  - OP 自鑄 vocabulary（「薪水小偷行動升級」）+ reply 接力擴寫
  - 「未轉到工」這個 transitional 身份是 frame 前提
  - Reply 從共鳴升級為 protocol（去廁所要去耐啲）——共謀型互動

---

### S4 — 外國返工 vs 香港 share screen

OP 一句設定「有時我都好慶幸我喺外國返工」+ 一個 visual punchline「香港開會 share screen 遇到呢啲情況真係好難解釋」+ Spoiler 圖（資料源不可得）。Reply 全部指向廁所/排泄主題（R1「大便唔臭原因係咪你鼻塞？」、R2「網絡上已經冇你在意既人啦？😂💩」），可以反推 Spoiler 圖大概率是廁所相關截圖。OP 424 likes 比 reply 高（59/21），但這篇的讀法跟其他訊號不同——**OP 提供的不是論點而是情境設定**，文本主軸是 visual gag，「外國返工」這句設定只是 punchline 的鋪墊。把這篇放進 work topic 是合理的（OP 確實提到工作場景），但留言區的對話實際上沒有討論工作、外國 vs 香港、share-screen 文化或任何 OP 設定的議題，全部漂移到 visual content 本身。Reading 上的特殊性是：**這是 15 篇裡 OP 設定的 topic frame 與 reply 實際討論 topic 不一致的訊號**，且因 visual 不可得，這個錯位無法完全評估。

- **evidenceRefs:** `S4.OP`, `S4.R1`, `S4.R2`
- **watchNotes:**
  - OP frame vs reply 實際討論的 topic 錯位
  - Visual content（Spoiler）不可得，限制本篇所有後續 pass 的引用範圍
  - 即使 OP-likes 高，互動實質與 work topic 主題關聯薄
  - P5 absence pass 處理「不可得 evidence」這類 visual gap 時可作 case

---

### S5 — 茶飲店 franchise 問題

這是 15 篇中唯一明確的 information-seeking post：OP 問 franchise 茶飲店扣完成本剩多少？是否已供過於求？OP 帶有預設（「以家已經供過於求、氾濫左」）但仍開放求證（`S5.OP`）。R1 bizmarket.hk（42 likes，`S5.R1`）回應的體量遠超 OP——415 字結構化拆解：加盟費、開業 50-70 萬、人工 16-18k、Keeta 抽 28-30%、利潤 12-15%、冬天跌 15-20%。最關鍵的是 R1 直接反駁 OP 的「供過於求」前提：「廢水而家開始變剛性需求咁 無話氾唔氾濫」——R1 是業界 insider，用「廢水」當市場機會描述。R2 rrlee（4 likes，`S5.R2`）給冷酷格言「唔好諗每個月賺幾多？先諗每個月可以蝕幾多」。OP 23 likes vs R1 42 likes——這是少數 reply 體量與背書都超過 OP 的訊號（連同 S10、S12）。Reading 上特殊：**OP 帶悲觀預設但 reply 主導者反駁這個預設**，是 15 篇中為數不多的「reply 不同意 OP 前提」訊號。

- **evidenceRefs:** `S5.OP`, `S5.R1`, `S5.R2`
- **watchNotes:**
  - 唯一資訊求問型 OP，且 OP 預設與 R1 結論相反
  - R1 用「廢水」當市場機會（vs S10 用「廢水」當職場貶值物）——同詞反向用法
  - R1 體量遠超 OP，但 likes 比例溫和（42 vs 23）——讀者沒完全 endorse R1 的反駁
  - 業界 insider 自報身份（與 S9.R1、S12.R1、S13.R2 同類）

---

### S6 — 80 後咖啡豆創業 Bentley

OP 列舉成就：80 後創業七年、Bentley、葵興工廈 → 尖沙咀甲級寫字樓、啟德天璽、西沙 Sierra Sea 連天台單位（`S6.OP`）。然後切到勵志口吻「即使學歷不高，只要用心做事…記住夢想同目標係有分別，目標唔一定達到，但夢裏一定什麼都有」。**最後一句「夢裏一定什麼都有」自帶 self-undercut**——OP 把標準勵志套路寫到極限然後自己拆穿，所以這篇是 sincere 還是 ironic 在文本層面 ambiguous。R1（`S6.R1`，OP 自我回覆「早啲瞓，足夠休息好重要」，4 likes）維持 motivational poster 語調，等於 OP 自己用 reply 強化 sincere 解讀。R2 kokorotrading（2 likes，`S6.R2`）「加埋老豆老母比嘅幾千萬碎銀 終於辛辛苦苦做到以上嘅野」——讀者選擇諷刺 reading，懷疑這不是白手起家。OP 63 likes、留言 9 條——表面上 OP 受歡迎但互動稀薄，跟其他 5/8 batch 訊號比共鳴強度偏低。Reading 上特殊：**OP 自帶 ambiguity（sincere vs ironic）+ 兩條 reply 分別 endorse 兩種 reading**——R1（OP 自己）強化 sincere，R2 揭穿。

- **evidenceRefs:** `S6.OP`, `S6.R1`, `S6.R2`
- **watchNotes:**
  - OP 結尾自我拆穿（「夢裏一定什麼都有」）——sincere/ironic ambiguity
  - R1 是 OP 自我回覆——P4 處理時要區分 OP 自我回覆 vs 外部 reader
  - R2 質疑「資金來源」而非質疑「努力是否有效」——攻擊角度
  - 互動稀薄（9 留言）vs 其他 5/8 訊號平均

---

### S7 — 基層單親女拆穿

OP 完整披露一套人設經營技術：藝術背景、歐洲經歷、拍賣行、亞協/西九/gallery、提供「智性對話/情緒價值」、「諗好 style 去 match 個 vibe，產生幻象令佢以為我高質」（`S7.OP`）。OP 列舉自己如何主動經營「高質」幻象，然後說「直到最近 gathering，我係全檯」（文本在資料源被截斷於此）。這個帖最重要的特徵是 **OP 自己做了元披露——披露自己的人設經營技術，再描述被識破的場合**——這比起單純訴苦複雜得多，OP 同時是受害者與技藝者。Reply 三條一致反方向，且 likes 體量巨大：R1 unknownduck_duck（1600 likes，`S7.R1`）「你講嘢唔分場合，上唔到大枱」；R2 winniefatpoon__（964 likes，`S7.R2`）以同 background 做 ibank 的 insider 身份主張「冇咩必要主動講出嚟」、「在意個班應該一早已經遠離咗你」；R3 jacko.488（673 likes，`S7.R3`）「你太放大自己個出身，現實根本冇咁多觀眾」。三條 reply 共 3237 likes，方向一致：問題不在 OP 的階級結構觀察，而在 OP 的場合判斷與 over-disclosure。OP 想說的論點是「同一大學、學院仍然有結構性區別」（`S7.OP` 開頭兩段），但 reply 把它讀成「你不會做人」——**論點被重 frame，沒有任何 reply 接住 OP 想討論的階級結構**。OP likes 不可得，無法量化雙方比例，但 reply likes 三條合計遠超大多數其他 OP。

- **evidenceRefs:** `S7.OP`, `S7.R1`, `S7.R2`, `S7.R3`
- **watchNotes:**
  - OP 元披露（披露自己經營幻象的技術 + 描述被識破）——複合動作
  - 三條 top reply 方向一致 + 體量巨大（3237 合計 likes）
  - OP 的「階級結構」論點被 reply 重 frame 為「社交失態」——topic-shift
  - R2 自報同 background insider 身份用以 disqualify OP
  - OP text 在資料源被截斷，下游不能假設沒寫的部分
  - OP likes 不可得，雙方比例不可量化

---

### S8 — 薪俸稅冷知識

OP 用「冷知識」框架包裝 grievance：香港只有約 200 萬人交薪俸稅，佔人口三分之一，「所以大家要覺得自己返工交稅係件好偉大嘅事，養起無數大媽同長者」（`S8.OP`）。語氣偽中立，實質是給打工納稅人 moral status——把日常的工作焦慮轉譯成「我在養社會」這個 ennoblement frame。R1（38 likes，`S8.R1`）是 pinned comment（平台 placeholder author，不是 organic reply）：「冷知識：每2個交稅嘅人，都可以幫社會養起一個全職主婦。 不過佢哋就唔會去你屋企做家務。」——延伸 OP 框架，把全職主婦加進被供養名單，並加一句調侃。R2（38 likes，`S8.R2`）是 OP 自我轉貼 R1（同樣內容、同樣 38 likes）——這是 OP amplification 動作，不是 organic engagement。OP 193 likes、留言 29 條，互動體量中等。**這篇是 OP-driven、reply 不增加新觀點只擴展被供養人類別的訊號**。沒有任何 top reply 質疑 OP 的數字或道德框架。

- **evidenceRefs:** `S8.OP`, `S8.R1`, `S8.R2`
- **watchNotes:**
  - OP 把 grievance 轉成 moral status（「養起」框架）
  - Pinned comment 機制可能影響 top reply 排序——R1 不是 organic top
  - OP 自我轉貼 pinned 是 amplification，不是 reply
  - 沒有質疑數字準確性的反方 reply（OP 自己說「不足一般」即「不足一半」）

---

### S9 — 反外勞 / 後生仔做遮醜布

OP 用粗口開場（「仆你街，洗唔洗俾埋個屎忽你吊丫，都On9嘅」，`S9.OP`），對某張 CTgoodjobs 圖片（原內容不可得）做憤怒回應。論點兩條：(a) 僱主「咁你咪去請新移民囉」（反諷僱主拿低薪要求年輕人時的虛偽）；(b)「啲人最鍾意攞現代嘅後生仔做遮醜布」——指控結構性卸責。Hashtag 列表「#年輕也是有罪 #將心比己啦唔該 #你哋啲仔女都受緊 #所以咪無人生bb囉 #又要馬兒好又要馬兒不吃草」**把職場議題接到生育議題**——OP 隱含主張：低薪職場是少子化原因。R1 mkm2bby（114 likes，`S9.R1`）給 519 字結構分析：對比新加坡外勞政策、地盤鋁模生產力對比（「一個印尼佬一個人就托咗上去；人哋一個頂你四個人」）、外勞工資 1/3-1/4、政府監管缺位、社會福利規管。R1 不反駁 OP，而是把 OP 的怒氣 **升級成 policy 論述**——同方向但體量與精細度遠超。R2 kelvinfun2022（56 likes，`S9.R2`）反向收斂「繞好大個圈其實三個字 減人工」+ 隱晦「某學者早講左做左防疫就會咁，原因都唔講得咁多了」。OP 268 likes、R1 114 likes——OP 帶情緒、R1 給結構、R2 給簡化結論，**三層接力同方向**。

- **evidenceRefs:** `S9.OP`, `S9.R1`, `S9.R2`
- **watchNotes:**
  - 三層論述接力：OP 情緒 + Hashtag 接生育 + R1 結構分析 + R2 三字結論
  - R1 是 reply 升級 OP 的明顯案例（vs S11.R2 的二階推論）
  - OP 引用的 CTgoodjobs 原帖內容不可得
  - R2 的「防疫」影射內容不可考——下游不能補完
  - OP 連結職場與少子化的 hashtag——P5 absence 處理生育議題缺席時要對照

---

### S10 — 17k 月光試用期請食糖水

OP 把困境結構化呈現：17k 月光族，公司潛規則要請 30 人糖水，OP 自己算「起碼要成 1000 蚊」，但「500 平時都好難攞到出嚟」（`S10.OP`）。然後加一句自我鎖死：「本身自己又唔係叻，如果轉第二份工又未必會好似而家呢度咁穩定」——這句把出路關上：**不能不請（潛規則）、不能負擔（月光）、不能跳槽（自我懷疑）**。OP 不只訴苦，而是把三條 escape 一條條 disqualify。R1 diu_lookwhat7ar（2200 likes，`S10.R1`）「得17k 仲要請，叫佢地食屎啦。升職就話啫，過試用請條毛」——粗口 + **結構性駁斥「為什麼這個習慣應該存在」**，質疑潛規則本身的合理性。R2 vialaviida（1400 likes，`S10.R2`）給 pragmatic 妥協「請咗算9數」+ 風險評估「呢啲文化嘅公司啲人都好撚小氣記仇，如果你短期內唔想轉工，就請咗大家飲嘢算9數」。OP 788 likes，R1 2200、R2 1400——兩條 reply likes 都遠超 OP。**Reply 內部存在張力：R1 拒絕請（attack the rule），R2 建議請（survive the rule），OP 自己沒在文本裡選邊**。讀者面對的是兩種不同 survival logic 並列。

- **evidenceRefs:** `S10.OP`, `S10.R1`, `S10.R2`
- **watchNotes:**
  - OP 自我鎖死三條（不能不請 / 不能負擔 / 不能跳槽）+ self-discount（「自己又唔係叻」）
  - Reply 內部分裂：拒絕規則 vs 接受規則——P4 audience pass 重點案例
  - 兩條 reply likes 雙雙超過 OP（2200 / 1400 vs 788）
  - 留言量 230，是 15 篇最高
  - OP 沒選邊，讀者面對兩種 survival logic 並列

---

### S11 — AI 裁員 渣打 Meta 馬雲

OP 用六條 numbered 點寫成一篇短時評（`S11.OP`）：(1) 自我交代「尋晚 kelly 鬧得我好岩」當開場；(2) 馬雲 9 年前預言 + 馬斯克 + AI 取代而失業；(3) 黃仁勳「藍領有著數」+ OP 自帶 punchline「唔通叫華爾街、中環班 banker 除埋套西裝，全民整水喉？」；(4) 渣打 CEO 講明 AI 取代「低價值人力資源」未來 4 年炒 8000；(5) 滙豐 CEO 客氣版；(6) Meta 全球裁員 8000，新加坡凌晨 4 點派信。Point 6 收結「馬斯克預言金錢將會消失，能源將會成為貨幣。但佢無講一樣嘢：你屋企唔係開發電廠」——**OP 把預言家論述拉回個體實況**，自帶 anti-utopia 反諷。R1 hoyin.eth（38 likes，`S11.R1`）「睇緊點考水電A牌」——順 OP 的「全民整水喉」punchline 跟風但沒升級。R2 sebastianium（32 likes，`S11.R2`）給惡性循環推論：「你被炒，改行去整水喉，但一方面個個被炒嘅都走去整水喉，競爭激烈，另一方面越來越多人冇收入，屋都冇得住，冇水喉俾你整…結果整水喉都冇得做」——把 OP 列舉的事件 **接成因果鏈/feedback loop**，是 second-order analysis。OP 400 likes、reply 體量低（38/32），整篇是 OP 主導+R2 補論證。

- **evidenceRefs:** `S11.OP`, `S11.R1`, `S11.R2`
- **watchNotes:**
  - OP 是 15 篇中最 structured 的（6 點 numbered + 自帶 punchline）
  - R2 是明顯的 second-order 推論（feedback loop），不只共鳴
  - R1 跟風 punchline 但沒升級——P4 區分「升級型 reply」vs「跟風型 reply」
  - OP 用具體 corporate 數字（8000、15%、4 年）——data-driven OP

---

### S12 — 失業 keeta 供樓讀護士

OP 三句話壓縮極多 layers：「失業好痛苦，keeta又飽和，層樓都唔知點供，唔敢同老婆講...而家去讀護士好唔好...」（`S12.OP`）。這 35 個字裡擠了五件事：(a) 失業現狀；(b) 平台勞工選項（keeta）也飽和；(c) 供樓壓力；(d) 婚姻層面的隱瞞（「唔敢同老婆講」）；(e) 轉行護士的提問。「唔敢同老婆講」這個自我披露很關鍵——把職場困境同時定性為 **配偶溝通失敗**。R1 edwardyftse（2900 likes，全 audit 最高 reply，`S12.R1`）做三件事：「千祈唔好讀護士」勸阻 + 「現在已經飽和」事實補充 + 「政府準備招聘更多內地護士來港」政策資訊 + **自報「(我係醫生)」credential**。R2 c_stevieg（383 likes，`S12.R2`）給技術性補刀「去讀護士即係要繼續再失業多兩年（假設你係讀 EN）」。OP 1500 likes、R1 2900 likes——R1 接近 OP 兩倍。OP 想求出路，留言區用更高 credential **把出路也關上**——R1 不是同情，是 expertise-based disqualification。整體 reading：OP 提供五件事一句話，reply 用權威把這句話裡僅剩的 forward option（讀護士）也否定。

- **evidenceRefs:** `S12.OP`, `S12.R1`, `S12.R2`
- **watchNotes:**
  - OP 35 字壓縮五件事——extreme compression OP
  - 「唔敢同老婆講」把工作困境定性為婚姻溝通失敗
  - R1 自報醫生身份——credential deployment（同 S9.R1、S13.R2）
  - R1 likes（2900）是全 audit 最高 reply，且為 OP 兩倍
  - Reply 動作不是同情是 disqualification

---

### S13 — 大家唔好再讀碩士啦

OP 一句命令式「大家唔好再讀碩士啦」+ 一個資料點：本公司請 asso admin 16-20k 港元，收到 40+ 碩士申請（`S13.OP`）。短帖極簡 OP，論證形式 = 命令 + 個人經驗 anecdotal evidence。R1 mfmf8611（309 likes，`S13.R1`）「讀master容易過讀degree，一向係高級興趣班，除了個別專業學位」——**reader 創造 reframe「高級興趣班」**，把學位去神聖化為 hobby class。R2 e_is_missing_again（243 likes，`S13.R2`）以 employer 視角補充：taught master「交學費就讀到，其實只係唔夠一年嘅興趣班」+ actionable conclusion「請人最重要都係睇佢工作、學習態度，近年請兩三個由 asso 讀上 MU degree 嘅阿妹，工作能力和態度好過好多有 master degree 嘅人好多，依家見到 master degree 嘅 candidate 通常都唔會考慮」——R2 揭露 anti-master degree 招聘 bias。OP 1900 likes，R1 309、R2 243——OP 主導，reply 不反駁只強化。**Top 3 reply 內沒有為 master degree 辯護的反方聲音**。Reading 上特殊：OP 是命令句但 reply 不感冒命令本身，只接力提供更多事實／重 framing 詞彙。

- **evidenceRefs:** `S13.OP`, `S13.R1`, `S13.R2`
- **watchNotes:**
  - 「高級興趣班」是 reader-coined reframe（vs S14 的「Permanent head Damage」也是 reader-coined）
  - R2 自報 employer 身份且揭露招聘 bias——insider credential
  - Top 3 reply 無反方，但這不一定代表沒有反方留言，可能只是不在 top 3
  - OP 命令式（「大家唔好再讀」）但 reply 不感冒命令，只擴展論證

---

### S14 — PhD 朋友食飯粗口

極致 minimalist OP，四句話：「我有個朋友終於完成 phd 學位，同佢食食下飯，問佢:『辛苦左咁多年，有咩想講？』 佢話:『粗口。』 我靜左。」（`S14.OP`）——OP 連這個朋友是誰、粗口的內容、PhD 領域、為什麼辛苦都沒寫。**OP 用最少 literary content 換到 4000 likes，是全 audit 最高 OP likes**。但 commentCount 只有 11，likes/commentCount ratio 異常高——讀者大量按讚但沒留言參與。R1 dennis._.n（281 likes，`S14.R1`）「Permanent head Damage 你估簡單呀，沒有讀書就沒有傷害…..」——抓 PhD 縮寫的雙關 + 倒裝 self-consolation。R2 liviakwan121（150 likes，`S14.R2`）給具體痛點「對住同一樣嘢幾年，仲要唔一定做到 positive result」——**揭露 OP 沒展開的 PhD 具體痛點**。Reading 上特殊：OP 四句白描 + R1/R2 補出讀者自己腦補的論述。這是 **OP 提供 trigger、reader 自己補完意義** 的訊號——OP 越省略 reader 共鳴越大。

- **evidenceRefs:** `S14.OP`, `S14.R1`, `S14.R2`
- **watchNotes:**
  - 極端 minimalist OP + 全 audit 最高 OP likes（4000）+ 異常低 commentCount（11）
  - likes/comment ratio 異常——靜默按讚 pattern
  - 「Permanent head Damage」是 reader-coined 詞（同 S13 的「高級興趣班」）
  - R2 揭露 OP 沒寫的具體 PhD 痛點——reader 自己補完意義
  - OP 是中介者敘事（轉述朋友），不是親歷者——間接性 framing

---

### S15 — 殯儀館看更 30k 老母講笑

唯一 queued 訊號，無留言、無 likes 資料，可讀內容只有 OP：「老母講笑咁俾我睇紅磡有殯儀館請看更 30k 一個月問我敢唔敢做 呢一刻我有種衝動 quit u 應徵。」（`S15.OP`）。三個 reading 點：(a) **訊息的中介者是母親**，不是 OP 自己發現職缺，而是母親「講笑咁」遞送——這個 framing 把工作機會包裝成親情玩笑；(b) 「敢唔敢做」這個措辭，OP 把母親的笑話 verbatim 接成自己的真實衝動——**笑話到認真的滑移**；(c) 「quit u 應徵」是 OP 當下的反應，「quit u」可能是 quit university 或 quit unit（現職）——下游 pass 不能假設方向。資料層面：OP 是 5/21 batch 最晚加入（07:38），比同日其他訊號晚約 3 小時，採集動作獨立於前 4 篇。Reading 上的最大限制是 OP-only——所有觀眾反應、共鳴強度、reply pattern 都不可得，這篇在 P2-P5 必須被當作「OP-only 證據」處理。

- **evidenceRefs:** `S15.OP`
- **watchNotes:**
  - 唯一 queued / OP-only 訊號——下游 pass 必須限制引用範圍
  - 母親作為訊息中介出現（vs S12 隱瞞老婆——關係軸：母 / 妻 / 同事不同層）
  - 「敢唔敢做」是母親的措辭被 OP 收編
  - 「quit u」縮寫意義 ambiguous（quit university / quit unit）——下游不能假設
  - 母親「講笑咁」的 framing 把 grim job market info 包裝成 family joke

---

## Cross-reading 機械觀察（不是判讀，是 P1 自然浮出的 pattern flag）

**這節只記錄寫 P1 時自然出現的 pattern flag，作為 P2-P5 的 candidate hooks。不在 P1 內做 cluster 或命名。**

- **OP-likes 與 reply-likes 比例異常的訊號：** S10（OP 788 / R1 2200 / R2 1400）、S12（OP 1500 / R1 2900）、S5（OP 23 / R1 42 體量遠超）——reply 在這幾篇比 OP 更被認可
- **OP 自帶 self-undercut / ambiguity：** S6（「夢裏一定什麼都有」）、S14（OP 為轉述者不是親歷者）
- **OP 自我鎖死出路：** S2（驚 + 想走但又驚太弱）、S10（不能不請 / 不能負擔 / 不能跳槽）、S12（失業 + 隱瞞老婆 + 護士也飽和）
- **Reader-coined reframe 詞：** S13「高級興趣班」、S14「Permanent head Damage」
- **Reply 自報 credential disqualification：** S9.R1（地盤經驗）、S12.R1（醫生）、S13.R2（employer）——值得在 P4 audience pass 命名一種反應型態
- **「請X而X未必接得住」結構：** S5（廢水變剛性需求 vs 供過於求）、S12（讀護士也飽和）、S15（quit u 去做殯儀館看更）——alternative-collapses pattern
- **OP 動作有「拒絕被分類 / 拒絕被建議」：** S1（明說「唔係求咩解決辦法」）、S7（OP 自己披露人設經營技術，reply 仍然 reframe）
- **OP frame 與 reply 討論主題錯位：** S4（外國 vs 香港 → 廁所笑話）、S7（階級結構 → 社交失態）
- **Visual / 引用原帖不可得：** S4（Spoiler 圖）、S9（CTgoodjobs 原帖）——下游引用限制

---

## Next pass

P2 — Lexicon Pass。輸入 P0 + P1，輸出 `2026-05-21-work-pass2-lexicon.md`。

P2 要做的是：哪些詞彙反覆出現？哪些詞彙明顯缺席？reader-coined 詞與 OP-coined 詞如何分佈？**P2 不寫 narrative、不命名 reaction、不做 absence 完整分析（這些分別在 P3/P4/P5）**。
