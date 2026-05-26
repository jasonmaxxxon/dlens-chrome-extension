# DLens Topic Audit — Pipeline Prompt + Minimal Schema Spec

**日期：** 2026-05-22
**來源：** 從 `work`（2026-05-21）+ `love`（2026-05-22）兩輪手跑 pipeline 的 stage discipline 反推。**不從 northstar 抽**。
**狀態：** spec v1，可交付給 Codex / 後端實作
**對照 traces：** `docs/audit/2026-05-21-work-pass{0-7}-*` + `docs/audit/2026-05-22-love-pass{0-7}-*`

---

## 0. 設計原則（不可違反）

這套 pipeline 的存在理由是：**從碎片化留言裡讀出語言生態的形狀，而不是摘要內容**。摘要任何 LLM 都做得到；DLens 的差異化在「指認哪些位置有語言、哪些沒有、哪些張力被默許、哪些被撤回信用」。

四條鐵律（全部從兩輪實跑驗證過）：

1. **Structured evidence, free reading, evidence-bound synthesis。** 只有 evidence 層上 schema；判讀層全部自由 prose。
2. **Probe ≠ Finding。** prompt 寫「要檢查什麼」，不寫「應該看到什麼」。（見 §2，最重要）
3. **每個 claim 必須 cite signal id；gap 必須寫成 gap，不能寫成 absence。**
4. **Pass 可壓縮不可偷跳。** evidence 薄就短寫並標明，不硬湊型態。

**反 slop 的保證不是 schema，是這四條 + 兩個 validator。** 兩輪實跑的結論：自由判讀沒有產生 hallucinated source，validator 抓到的失誤集中在數字錯（work §3 的 1560）和 scope 過寬（love B.1 的「被證實」），這兩類都是 mechanical 可抓的——證明分工有效。

---

## 1. Minimal Schema（4 個 type，不要長成 taxonomy）

```ts
// ---- Evidence layer：唯一上 schema 的層，純事實，deterministic ----
interface TopReply {
  author: string;
  text: string;          // 全文，不剪、不省粗口
  likes: number | null;  // 不可得用 null，不要用 0 充當
}

interface EvidencePacket {
  signalId: string;
  shortCode: string;        // S1, S2... 後續所有 pass 一律用這個引用
  sourceUrl: string;
  capturedAt: string;       // ISO；topic 採集時間，非原帖時間
  status: 'succeeded' | 'queued' | 'failed';
  opText: string;           // root post 全文
  opLikes: number | null;
  commentCount: number | null;
  topReplies: TopReply[];   // 已排除 OP 自我 echo / 自我接話
  aiArtifacts?: {           // 既有 AI gist/tags，僅供 provenance，pipeline 不繼承
    gist?: string;
    tags?: string[];
  };
  gaps: string[];           // 機械事實：哪些欄位不可得（visual 不可得 / queued 無留言 / OP text 被截斷）
  notes: string[];          // 純機械註記，不含判讀
}

// ---- Interpretation 層：全部自由 prose，不存 enum ----
interface SignalReading {        // P1 專用
  shortCode: string;
  reading: string;               // 一段 prose：OP 在做什麼動作 + reply 對 OP 做什麼動作
  evidenceRefs: string[];        // ["S3.OP", "S3.R1"]
  watchNotes: string[];          // hook，不是結論
}

interface LensMemo {             // P2-P5 共用的薄持久化單位
  stageName: string;             // "lexicon" | "narrative" | "audience" | "absence"
  prose: string;                 // markdown，自由判讀。NOT JSON taxonomy
  evidenceRefs: string[];        // 每個主要 claim 至少一個 ref
  caveats: string[];             // evidence thin / sample-level / data-gap 等自我標記
  coverage?: string;             // "9/9" | "8/9，S2 不可得" 等
}

// ---- Output 層 ----
interface TopicAuditReport {     // P6
  topicName: string;
  generatedFrom: string[];       // 引用了哪些 LensMemo / SignalReading
  coveragePerSection: Record<string, string>;
  sections: {
    overall: string;             // 7 節，全部 prose
    lexicon: string;
    scaleOrTime: string;
    narratives: string;
    audience: string;
    absence: string;             // 含 evidence-strength 分級
    editorial: string;           // 必須 prose，必須指認語言生態形狀
  };
  limitations: string[];
}

interface CrossTopicCalibration {  // P8，只有 ≥2 topic 才產
  topicsCompared: string[];
  decompositions: Array<{
    findingFromTopic: string;      // e.g. "work: 無 future tense"
    perTopicResult: Record<string, string>;
    verdict: 'topic-specific' | 'platform-affordance' | 'cultural-pattern' | 'undetermined';
    strength: 'strong' | 'medium' | 'weak-inference';
    caveats: string[];
  }>;
}
```

**明確禁止的 schema 形態**（兩輪實跑證明會產生 slop）：
- `audienceConsensus: 'agree' | 'split' | 'reject'`
- `narrativeType: enum`
- `sentimentArchetype: enum`
- 任何 per-signal 的 `themeTags` 主導 report（tags 只能做 UI 掃描入口，不進 report 主體）

理由：兩輪裡最有價值的發現（love「reader 校正 OP 的 ideology」、work「成功敘事是 active suppression 不是 passive absence」）**都不可能由固定 enum 產生**——它們是 emergent，schema 化會直接殺掉。

---

## 2. Probe vs Finding（全 pipeline 最重要的一節）

`love` 的存在證明了：**work 看起來像洞察的東西，大部分是 work 哀悼性格的 overfit。** 若把 work 的 trace 直接寫進 prompt，會把以下當成通用 audit 發現——這是嚴重錯誤。

### ✅ 可以寫進 prompt 的固定 PROBE（要檢查什麼）
- 個人問題有沒有被轉成集體 / 制度問題？（中間層 probe）
- discourse 是否停在 individual ↔ structure 兩極而缺中間層？
- OP 提出的命題，reader 是接住、反駁、校正框架、還是漂移？
- 有沒有 escape / 出路被提出？被誰、用什麼關閉或辯護？
- 哪些被討論的角色從不發聲（object-never-subject）？
- 同一個詞有沒有反向用法？哪些詞 OP-coined、哪些 reader-coined？
- 正面 / 樂觀敘事出現時，被擁抱還是被撤回信用？
- 戲謔 register 出現時，能不能切換到 prescriptive register？

### ❌ 絕對不可預設的 FINDING（應該看到什麼）
- ❌「沒有 future tense / 缺少希望」——work 有，love 無此缺席
- ❌「沒有 prescription / 只有否定命令」——love 有正向 prescription
- ❌「正面敘事會被壓制」——love 的正面敘事被擁抱
- ❌「reader 不辯論 / 同方向共鳴」——love 有真辯論
- ❌「議題是哀悼型」——love 是辯論型
- ❌「算帳 / 量化是 default mode」——跨 work+love 成立，但**仍標 [中]**，未證明是文化通則（待第 3 個非經濟 topic）

**規則：上面每一個 finding 都必須由當前 topic 的 evidence 重新長出，prompt 不得植入。** 唯一接近「可預期」的是「中間層真空」——但即使它，single-topic pass 也只能說「本 topic 內觀察到」，platform-level 斷言保留給 P8。

---

## 3. Pipeline Stages

`P0–P7 = single-topic audit`（每個 topic 獨立跑）
`P8 = optional cross-topic calibration`（≥2 topic 才跑）

每個 stage 給出：input / output type / system prompt 核心 / 壓縮規則。

---

### P0 — Evidence Packet（deterministic，無 LLM 或極少 LLM）

- **Input：** topic 的 signals + items + 留言 + 既有 AI tags
- **Output：** `EvidencePacket[]`
- **不是 LLM 判讀**——是資料整理。LLM 至多用於「判斷 commentsPreview 中哪條是 OP 自我 echo / 自我接話」（可由 author == OP handle 機械判定，LLM 僅備援）。
- **Discipline：**
  - 純事實，零判讀、零 tag 分配
  - `topReplies` 必須排除 OP 自我 echo / 自我接話（兩輪都遇到：work S6/S8、love S2 全部 / S9 部分）
  - 不可得欄位用 `null`，**queued / unknown 不可當 0**（work validator §2.1 的 FAIL 教訓）
  - 既有 AI gist/tags 放 `aiArtifacts`，標明 pipeline 不繼承
  - 所有 evidence-gap 進 `gaps[]`

> **⚠ 資料來源（point 7）：** 研究階段用 Snappy SSTable reader 直讀 Chrome LevelDB 是可接受的，但**產品不可依賴 LevelDB 內部格式**。正式實作走 extension background/storage API，或提供 explicit export/debug route 產出 `EvidencePacket[]`。LevelDB 直讀只能是 fallback / 研究工具。

---

### P1 — Per-Signal Free Reading

- **Input：** `EvidencePacket[]`
- **Output：** `SignalReading[]`
- **System prompt 核心：**
```
你在讀單一社群訊號（一個 OP post + 它的 top replies）。為每篇寫一段 prose reading。
必須回答兩個問題：
  1. OP 在做什麼「動作」？（不是「OP 講了什麼」，是「OP 為什麼這樣講」——求助/立論/訴苦/戲謔/元披露/issue prescription...）
  2. reply 對 OP 做了什麼「動作」？（共鳴/反駁/校正框架/升級/漂移/否決出路/bookmark/接力擴寫...）
紀律：
  - 只引用 S#.OP / S#.R#，不引用其他訊號（cross-signal 留到後面 pass）
  - 不繼承任何既有 AI gist/tags，重新讀
  - 不做 cluster、不命名 narrative、不抽 lexicon、不打任何 enum
  - watchNotes 是 hook 不是結論
長度隨 evidence 量浮動：OP 一句話允許短，OP 長文允許長。
```
- **壓縮規則：** queued / OP-only 訊號（如 work S15、love 無）只讀 OP，明確標 evidenceRefs 僅 `S#.OP`。

---

### P2 — Lexicon

- **Input：** P0 + P1 → **Output：** `LensMemo(stageName="lexicon")`
- **System prompt 核心：**
```
從所有訊號 + readings 自由歸納「詞彙層」觀察。focus 是 word/phrase level。
要做：反覆詞群（自由命名數量）/ OP-coined vs reader-coined / 同詞反向用法 / 句式模式 / register（code-mixing）/ 詞層缺席。
PROBE（檢查，不預設結果）：
  - 有沒有量化/算帳詞群？（不預設一定有）
  - 有沒有 future-positive 詞（希望/前景/承諾）？（兩個方向都要報：有或沒有）
  - 有沒有正向 prescription 詞（應該/建議），還是只有否定命令（唔好）？
  - 有沒有集體/制度 vocabulary？
紀律：
  - 詞層缺席只能說「在 captured evidence 中缺席」，不能說「discourse 缺席」
  - 不寫 narrative / audience / position-absence
  - frequency 不是重點，reframe 才是（reader-coined 詞、同詞反向）
```

---

### P3 — Narrative

- **Input：** P0+P1+P2 → **Output：** `LensMemo(stageName="narrative")`
- **System prompt 核心：**
```
從 readings + lexicon 自然長出敘事。自然幾條就幾條，不強制數量。
每條敘事 = story shape（setup → tension → outcome）+ evidence + 必須有 boundary/反例/inversion。
紀律：
  - 沒有反例的敘事不夠 robust，必須補或刪
  - 敘事是 story shape（事件結構），不是 proposition、不是 posture
  - 訊號可橫跨多條敘事，不分配「主屬」
  - 不命名 audience 模式、不寫 absence
  - 不繼承其他 topic 的 narrative 名稱（每個 topic 重新長）
```

---

### P4 — Audience Reaction

- **Input：** P0-P3 → **Output：** `LensMemo(stageName="audience")`
- **System prompt 核心：**
```
觀察 reader 對 OP 做了什麼動作。see-then-write：看到才寫，沒看到不寫。
可參考的動作清單（不是必填欄位，看到才用）：接住不選邊 / 共鳴 / 反駁 / 校正OP框架 / 升級為結構分析 / credential disqualification / 漂移 / bookmark跟風 / 為對立價值辯護 / 一致endorse...
紀律：
  - 排除 OP 自我回覆 / pinned placeholder / OP 自我轉貼——這些不是 audience reaction
  - 不從 likes 推「整個議題的共識」——top-3 reply 只代表 top-3
  - 每個型態標 n（幾個訊號支撐）；n=1~2 不可宣稱穩定 pattern
壓縮規則（重要）：若 audience evidence 薄（如 love：S2=0、S9=1），短寫，並把薄本身寫成事實。S2 audience 不可得 = data gap，不可寫成「沒人回應」。
```

---

### P5 — Absence（唯一允許推論，但 evidence-bound）

- **Input：** P0-P4 → **Output：** `LensMemo(stageName="absence")`
- **System prompt 核心：**
```
誰沒有出聲？什麼解法/立場/視角缺席？這是唯一允許推論性結論的 pass，但每個 claim 必須標 evidence-strength：
  [強] = present 強烈反襯 absent，接近可斷言
  [中] = 成立但可能 sample artifact（樣本小 / 只有 top-3 reply）
  [弱/推論] = 純推論，明確標 speculative
三種缺席強度不可混用：「不在 top-3」< 「不在本 sample」<「不在 discourse」。
本 pass 原則上不做「不在 discourse / reality」級斷言，除非有跨 topic 強 converging evidence——而那屬於 P8，不是這裡。
PROBE（固定檢查項，但結果不預設）：
  - 中間層 / collective scale 有沒有？個人問題有沒有被轉成集體問題？
  - 被討論角色裡誰從不發聲（object-never-subject）？
  - escape ramp 有沒有人辯護，還是只有人關閉？
紀律：
  - data gap（如 queued、OP 自我接話佔滿 preview）必須與真 absence 區分
  - 不可把單 topic 觀察寫成 platform/culture 斷言——那是 P8 的事
```

---

### P6 — Editor Synthesis（final report）

- **Input：** P0-P5 → **Output：** `TopicAuditReport`
- **固定的是 7 節結構，自由的是內容**（內容由 LensMemo 長出，不靠 schema 拼）：
  1. 整體判讀 2. 共同用字 3. 風向/時間（無時間序就明說不做 arc）4. narrative clusters 5. audience reaction 6. 缺席聲音/outliers（含分級）7. **editorial reading（必須 prose，必須指認語言生態形狀）**
- **System prompt 核心：**
```
寫最終 report，7 節固定，內容全部 prose。
§7 editorial reading 是 audit 的 payoff：
  - 必須 prose，不能 bullet
  - 必須指認「語言生態的形狀」——哪些位置有語言、哪些沒有、哪些被撤回信用、哪些連詞都沒長出
  - 如果你的 §7 可以套用在任何 topic 上，你就失敗了（anti-genericity）
  - 不可植入 §2 禁止的 finding——每個判讀從本 topic evidence 長出
紀律：
  - 每節標 coverage；資料不足明說
  - 不可宣稱 platform-level（最多「本 topic 內觀察到」）
  - editorial 為流暢度弱化 hedge 是已知張力——validator 會抓，但 §6 absence 的分級不可在 §7 被偷偷升級
```

---

### P7 — Single-Topic Validator（only-flag）

- **Input：** P0-P6 → **Output：** validator report（flag list）
- **System prompt 核心：**
```
機械檢查，只 flag 不重寫成漂亮話。
查：
  1. 每個 claim 有沒有 signal id citation
  2. 引用是否存在（reply 是否真的存在、likes 數是否與 P0 一致、引述是否吻合）
  3. 數值算術（平均數的母數是否一致——queued/unknown 不可當 0）
  4. negative claim 的 scope（「零出現」是對 captured evidence 還是 discourse？）
  5. evidence thinness（n=1 撐起的 pattern？top-3-only 推到全 pool？）
  6. precise figures 是否真的算過（如「519 字」不可憑空）
severity：[FAIL]=矛盾/算術錯，必須修才 citable；[WEAK]=須降調；[SCOPE]=須限定範圍。
不抓判讀對錯，只抓 mechanical（引用/數字/scope/thinness）。
```

---

### P8 — Cross-Topic Calibration（optional，≥2 topic）

- **Input：** ≥2 個 topic 的 P5 + P6 → **Output：** `CrossTopicCalibration`
- **這是 single-topic 做不到、唯一能定位 topic-specific vs platform/culture 的階段。**
- **System prompt 核心：**
```
對照 2+ 個 topic 的 absence + final report。逐項拆解每個 topic 的「發現」：
  對每個發現，檢查它在其他 topic 成不成立：
    - 跨 topic 都成立 + 性質相反的 topic 也成立 → platform-affordance 或 cultural-pattern（強）
    - 只在某 topic 成立 → topic-specific（該 topic 議題性格，不可當通則）
    - 成立但成因分不清（如量化：兩個都碰經濟）→ undetermined，標明需要什麼樣的第 3 topic
verdict ∈ {topic-specific, platform-affordance, cultural-pattern, undetermined}
strength ∈ {strong, medium, weak-inference}
紀律：
  - platform/culture 斷言即使在這裡也要 hedge——2 個 topic 是「強烈 consistent with」不是「證實」（love validator 教訓）
  - 必須明說「需要什麼樣的額外 topic 才能再收窄」
```

---

## 4. 兩個 Validator（point 4）

| | single-topic validator (P7) | cross-topic validator |
|---|---|---|
| 範圍 | 一個 topic 的 P0-P6 | P8 的 cross-topic claim |
| 查 | 引用 / 數字 / scope / negative claim / evidence thinness | platform-affordance / culture-pattern claim 有無過度斷言 |
| 典型 catch | work §3 算術錯（1560→1950） | love B.1「被證實」→「strongly consistent with」 |
| 鐵律 | 只 flag 不重寫 | platform/culture 斷言必須 hedge 到 2-topic 能支撐的程度 |

---

## 5. 壓縮 vs 偷跳（point 6）

- **允許：** stage 自己判斷「本 pass evidence thin」→ 短寫 + 標明薄（love P4 audience 就是這樣）
- **禁止：** 跳過 stage、或為了型態完整硬湊（把 thin 寫成 rich）
- **鐵律：** data gap 寫成 gap，不寫成 absence（love S2 audience 不可得 ≠ 沒人回應）

---

## 6. 給實作者的建議順序

1. 先實作 `EvidencePacket` 的 ingestion（走 extension storage API，不依賴 LevelDB）——這是其餘一切的地基
2. P1-P6 是 6 個 LLM call，每個 call 看 evidence + 前面所有 LensMemo（chain-of-evidence accumulation）
3. P7 validator 可用 LLM 或半機械（citation 存在性 + 數字核對可純程式）
4. P8 只在用戶有 ≥2 topic 且主動觸發時跑
5. UI：Topic Detail 第一頁顯示 source list + theme tags（掃描入口）+ narrative lanes（從 P3 LensMemo 抽 name）+ 「生成審查報告」CTA；report 第二頁渲染 `TopicAuditReport`；P8 是獨立的「跨 topic 對照」功能

## 7. 留作後續（非 blocker）
- **第 3 個 topic**：只為驗證「量化 cognitive mode 是 HK 文化模式還是經濟議題巧合」。應選**非經濟** topic（興趣/寵物/飲食/旅遊）。對 prompt 架構不是 blocker——lexicon pass 本來就自由發現詞群，不預設算帳詞。
- 這個洞察若成立（DLens 能看出「整個社會把什麼都量化」）可能是很好的產品賣點，值得日後驗證。
```
