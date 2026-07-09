# DLens Topic Audit — Comment Shard Reading 分層蒸餾 Plan

**日期：** 2026-07-08
**狀態：** spec v1，可交付 Codex lane 實作（worktree → PR → verify gate → squash-merge）
**性質：** LLM path + storage artifact + analysis data flow 改動 → **architecture map 必須同 PR 更新**（DoD 已明訂）。
**對照現況檔：**
- [`src/compare/topic-audit-prompts.ts`](../../src/compare/topic-audit-prompts.ts) — P1-P8 prompt builders（P7 為 dead code，見下）
- [`src/state/topic-audit-handlers.ts`](../../src/state/topic-audit-handlers.ts) — 實跑 pipeline
- [`src/compare/topic-audit.ts`](../../src/compare/topic-audit.ts) — `ReplyFragment` / `EvidencePacket` / `LensMemo` 型別
- [`src/state/captured-post.ts`](../../src/state/captured-post.ts) — `CapturedPostFragment`（identity 欄位的資料源）
- [`src/state/topic-audit-storage.ts`](../../src/state/topic-audit-storage.ts) — storage keys + `TopicAuditMemoBundle`
- [`src/compare/topic-synthesis.ts`](../../src/compare/topic-synthesis.ts) — deterministic keyword lens（**不在本 plan 動它**）
- 前身設計：[`docs/handoff/2026-05-22-audit-pipeline-prompt-spec.md`](2026-05-22-audit-pipeline-prompt-spec.md)

---

## 0. 問題定調（用真實母數，不是猜的）

### 0.1 母數實測（2026-07-07 backend DB, `crawl_results` n=119）
- `raw_comments`：p50=23、p90=105、p95=186、**max=232**；`discussion_replies` max=230。
- `raw_comments ≥ 100`：14 筆；`≥ 200`：6 筆；**`≥ 500`：0 筆**。
- 近期 2026-07（17 筆）：max raw 221 / max discussion 163。

**結論：既不是採集層被 top-N 餓死，也未見 1000 留言級別。** 一篇 post 上限約 230 條。

### 0.2 真正的痛點是 topic-level 累積，不是單 post
Extension 這一層**沒有任何 top-N 截斷**：[`buildReplyFragments`](../../src/compare/topic-audit.ts) 把 `discussionReplies` 全部 push，[`renderPacket`](../../src/compare/topic-audit-prompts.ts) 把 fragment 全部渲進 prompt。目前 **P2 / P4 / P5 / P6 各自用 `renderPackets` 把所有 post 的全部留言重 render 一次**。一個 topic 5 篇 post × 最多 230 ≈ 每個 pass ~1000+ 行留言，跑 4 次。這才是 context 壓力來源。

### 0.3 為什麼「本地 compute frequency」不能當群眾反應模式
[`cluster-summary.ts` `estimateSupportCount`](../../src/analysis/cluster-summary.ts) = `cluster.size_share × sourceCommentCount` 四捨五入，**沒有讀任何留言**。拿它當「reaction pattern 出現 N 次」是假精度，正是 P7 validator 要抓的 fabricated 母數。群眾反應模式必須由 LLM 真讀留言後、evidence-bound 地算出。

### 0.4 現況校正（規劃前必須知道）
- **多層白紙機制仍在用**：[`runAuditPipeline`](../../src/state/topic-audit-handlers.ts) 實跑 P1 冷讀（每 ready signal）→ P2 lexicon → P3 narrative → P4 audience → P5 absence → P6 final，逐 stage 存檔、`inputHash` 可 resume。**不用重建，只需在 P1 底下插一層。**
- **P7 是 dead code**：`buildP7ValidatorPrompt` 只在 prompts.ts 定義 + 一個 test 引用，handler **沒有 import**。P6 之後跑的是 [`validateTopicAuditDraft`](../../src/compare/topic-audit-validator.ts)——一個 synchronous **local** 函式，不是 LLM。任何「real P7 critic」都是要新 wire 的，不是現成的。
- **`buildInputHash` 已把所有 prompt version join 進 cache key**（[handlers.ts](../../src/state/topic-audit-handlers.ts) 內 `Object.values(TOPIC_AUDIT_PROMPT_VERSIONS).join("|")`）。**新增 / bump 任何 prompt version 會自動 bust cache**——這是 phase 間安全換代的機制，實作時靠它，不要手寫 migration。

---

## 1. 設計原則

1. **Reuse 現成 P1-P6，只在 P1 底下插 P0.5。** 不重造 topic schema。
2. **Raw 留言只在最底層出現一次。** P0.5 shard read 之上，所有 pass 只吃「蒸餾摘要 + 被引用原句」，不再看 raw 全量。這是最重要的 context / 成本 / 品質槓桿。
3. **欄位最小增量。** 一次只加一個 artifact（`CommentShardReading`）+ `ReplyFragment` 補 identity。**不**一次加 `reaction_patterns[]` / `narrative_lines[]` / `key_highlights[]` / `coverage` 四組 schema（那是「填欄位」陷阱）。
4. **Evidence-bound 是 traceability 與去重的根。** `commentId` 讓跨 shard / 跨 post 的 n 能 dedup 加總，而不是各層各自估。
5. **shard 只報 shard-local 觀察，不准宣稱 topic-level pattern。** 升級成 pattern 是 merge 步的事。

---

## 2. Phase 1 — 契約補齊 + P6 止血 ✅ 已落地（2026-07-08 驗證）

> **狀態：DONE。** `ReplyFragment` 已補 optional identity 欄位（`commentId/sourceId/parentId/replyCount/timeToken`，additive、舊資料讀成 undefined/null）；`buildP6FinalReportPrompt` 已改吃 `renderCitedFragments`（OP + cited comments digest），不再 `renderPackets` 全量。下述原文保留作 rationale 記錄，實作者可跳過本節。

> ⚠️ 排序修正：你原本 first cut 寫「P2/P4/P5/P6 不再吃 raw」。實作時 trace 發現 **P2 lexicon 要 word-level 讀 raw、P4 audience / P5 absence 的工作本質就是讀留言池**——在 shard 層存在前 trim 它們會餓死判讀。**Phase 1 只能安全搬 P6**（editor synthesis，本該從 memos 綜合而非重讀 raw）。P2/P4/P5 的 raw 移除是 **Phase 2** 的事（等 shard 蒸餾存在後才有東西可吃）。P3 narrative 本來就不 render packets，無需動。

### 2.1 `ReplyFragment` 補 identity（純 passthrough）
[`topic-audit.ts`](../../src/compare/topic-audit.ts) `ReplyFragment` 目前只有 `ref/author/text/likes/role`。補：
```ts
export interface ReplyFragment {
  ref: string;
  commentId: string | null;      // 新
  sourceId: string | null;       // 新
  parentId: string | null;       // 新
  replyCount: number | null;     // 新
  timeToken: string | null;      // 新
  author: string;
  text: string;
  likes: number | null;
  role: ReplyFragmentRole;
}
```
資料源已齊：[`CapturedPostFragment`](../../src/state/captured-post.ts) 已帶 `id / sourceId / parentId / replyCount / timeToken`。只需在 `buildReplyFragments`（[topic-audit.ts](../../src/compare/topic-audit.ts)）push 時多帶欄位。**無新增上游 plumbing、無 backend 改動。**
- `EvidencePacket` 雖然是 storage artifact，但 topic-audit keys 目前**不在** [`storage-schema.ts`](../../src/state/storage-schema.ts) migration registry 內；registry 現時只管 global/product context。Phase 1 不應順手擴大 storage migration 範圍。這次只做 additive optional fields + backward compatibility：舊 evidence 可缺 identity 欄位；新產生 packets 在來源缺值時填 `null`。

### 2.2 P6 改吃 digest，不重讀 raw
[`buildP6FinalReportPrompt`](../../src/compare/topic-audit-prompts.ts) 目前 `renderPackets(evidence)`（全量）。改成：OP 行 + `renderSignalReadings` + `renderLensMemos` + **只有被前面 memo `evidenceRefs` cite 到的 fragment 原句**。新增一個 `renderCitedFragments(packets, citedRefSet)` helper。
- Bump `TOPIC_AUDIT_PROMPT_VERSIONS.p6` → cache 自動 bust。

### 2.3 Phase 1 DoD
- `npm run typecheck` / `boundary:guard` / `storage:seam-guard` / `npx tsx --test tests/*.test.ts tests/*.test.tsx` / `npm run build` / `git diff --check` 全綠。
- 不新增 `storage-schema.ts` migration；補 evidence packet / prompt fixture，確認新 packet 有 identity、舊 packet 缺 identity 仍可被 downstream prompt 使用。
- 更新既有 audit prompt / evidence 相關 test 的 fixture 形狀。
- **不需要 version lock 五處**（無新 user-visible surface；純內部）。
- Commit prefix：`refactor`（或 `feature` 若視為能力擴充）；one-in-one-out：P6 raw render 移除即「out」，note 在 message。

---

## 3. Phase 2 — CommentShardReading（真正的分流層，P2/P4/P5 在此止血）

### 3.1 新 artifact（最小欄位）
在 [`topic-audit.ts`](../../src/compare/topic-audit.ts) 新增：
```ts
export interface ShardPatternCandidate {
  label: string;          // 白紙讀出的反應型態，用議題原文語言
  gist: string;           // 一句定義
  dynamicImplication: string; // 這個反應對 topic momentum / conflict dynamic 的意義
  supportRefs: string[];  // 本 shard 內支持此型態的 ref
  counterRefs: string[];  // 反例 ref
  representativeRefs: string[]; // 最能令 pattern 變 intelligible 的代表留言 ref
  counterRepresentativeRefs: string[]; // 最能限制 claim 的反例留言 ref
  nInShard: number;       // 本 shard 命中數（禁止宣稱 topic-level）
  uncertainty: string;    // 語境讀不準的標註
}

export interface CommentShardReading {
  auditRunId: string;
  inputHash: string;
  topicId: string;
  signalId: string;       // 屬於哪篇 post
  shortCode: string;      // S#
  shardIndex: number;     // 0-based
  shardCount: number;     // 該 post 總 shard 數
  commentRefsInShard: string[];   // coverage 母數：本 shard 覆蓋哪些 ref
  patternCandidates: ShardPatternCandidate[];
  lexiconCandidates: string[];    // 餵 P2 的詞層候選
  promptVersion: string;
  model: string;
  generatedAt: string;
}
```

D1 UI winner（`docs/mockups/2026-07-08-reaction-panel-D1-summary.md`）已鎖定方向：**Evidence Drawer + compact coverage strip**。所以 Phase 2 merge 產物要服務「有用資訊」面板，而不是把 Dense Counts 的所有數字都變 schema。Topic-level merge 至少要可 derive：

```ts
export interface ReactionCoverage {
  postCount: number;
  capturedCommentCount: number;
  readCommentCount: number;
  usableAudienceCommentCount: number;
}

export interface ReactionPattern {
  label: string;                 // 議題原文語言
  dynamicImplication: string;    // 對 topic dynamics 的短判讀，不是裝飾文案
  nComments: number;             // commentId dedup 後支持留言數
  nAuthors: number;              // 支持留言的 distinct author count
  coverageDenominator: number;   // 通常 = usableAudienceCommentCount
  supportRefs: string[];
  counterRefs: string[];
  representativeRefs: string[];  // UI 從 EvidencePacket 取 text/commentId
  counterRepresentativeRefs: string[];
}
```

Phase 2 先不要把 `likeSum` / `confidenceTier` 變成必需欄位；它們屬於 Phase 3 refine。bar percentage 由 `nComments / coverageDenominator` derive。

**2026-07-08 UI-first slice landed（data producer still pending）：** `ReactionCoverage` / `ReactionPattern` 型別已進 [`topic-audit.ts`](../../src/compare/topic-audit.ts)，`parseAuditPromptEnvelopeResponse` 已保留 camel/snake case 的 `reactionCoverage` / `reactionPatterns` 並過濾未知 evidence refs；[`topic-detail.ts`](../../src/viewmodel/topic-detail.ts) 會把 hints 暴露到 VM；[`TopicDetailView.tsx`](../../src/ui/TopicDetailView.tsx) 已 render `Evidence Drawer + compact coverage strip`；[`AuditReportView.tsx`](../../src/ui/AuditReportView.tsx) 在有 structured reaction 時以 panel 取代 §5 audience prose。剩下未完成的是 `CommentShardReading` artifact、P0.5 prompt、post/topic merge 與 P2/P4/P5 raw-removal。

### 3.2 Storage：folding 進現有 bundle，不開新 key
[`TopicAuditMemoBundle`](../../src/state/topic-audit-storage.ts) 加 `shardReadings?: CommentShardReading[]`。**理由：** 復用現成 save/load/resume + `inputHash` keying，**不新增 storage seam**（`storage:seam-guard` 無新 allowlist）。不要開 `dlens:v1:topic-audit-shard-readings` 新 key。

### 3.3 P0.5 插點 + 條件式 shard
在 handler `runAuditPipeline` 內、evidence build 之後、P1 之前插 P0.5：
- **shard 政策**：以近似 token/char budget 切（target ~120 條或 ~N 字，先到先切）。`≤ budget → 1 shard`。依 0.1 母數，**p50/p90 post 都是 1 shard，只有 ~6-14/119 的 tail 需要 2 shard**——所以 shard 層每 topic 通常只多 0-3 個 call，不是 Codex 早期估的「50 calls」。
- **prompt**：新增 `buildP0_5ShardReadingPrompt(packet, shardFragments)`——白紙讀（延用 P1「先不要套框架」紀律），輸出 `ShardPatternCandidate[]` + `lexiconCandidates` + `commentRefsInShard`，**每個 candidate 的 ref 必須 inline 標註**（沿用 P1 的 `[S#.R#]` 規矩）。
- **model routing**：P0.5 用便宜 model、merge/final 用強 model。routing 靠 `generateEnvelope(stageName, prompt)` 的 `stageName`（app shell 決定），handler 保持 model-agnostic。
- 新增 `TOPIC_AUDIT_PROMPT_VERSIONS.p0_5`；因 `buildInputHash` join 全部 version，加這個 key 自動 bust cache。

### 3.4 shard → post 的 n 合併（歸屬 merge，不歸屬 shard）
P1（現在改成 shard→post 的 merge 角色，或新增一個 post-merge 子步）：
- 依 `commentId` **dedup** 跨 shard 的 candidate（同一留言不重覆計）。
- 同義 candidate 合併，`nInShard` 加總成 post-level n。
- 產出的 post-level 反應觀察寫進既有 `SignalReading.reading`（prose）+ `evidenceRefs`（含真實 commentId）。**shard 不准自己升級成 pattern。**

### 3.5 P2 / P4 / P5 改吃蒸餾
- **P2 lexicon**：改吃各 shard 的 `lexiconCandidates` 匯總 + 被 cite 原句，不再 `renderPackets` 全量。
- **P4 audience**：改吃 post-level 反應觀察（3.4 的 merge 結果）+ 被 cite 原句；跨 post 再 merge（依 commentId dedup）成 topic-level `n`。這是「群眾反應模式」真正長出來的地方。**P4 現在是 `reactionPatterns` 的 producer**：envelope 必須輸出 `displayHints.reactionCoverage` + `displayHints.reactionPatterns`（欄位契約見 `topic-audit.ts` `ReactionPattern`；parser 會丟缺必填欄位或 refs 全invalid 的 pattern，所以 prompt 要明令每個 pattern 附真實 refs）。⚠️ 實作 gotcha：現有共用 `ENVELOPE_SCHEMA` 常數**沒有**宣告 reaction 欄位（刻意的——其他 pass 不該被引誘生產它）；P4 producer prompt 要帶自己的 extended schema block，別改共用常數。`nComments` 必須來自 shard merge 的 commentId dedup 實數，`coverageDenominator` = 實際被讀的 audience comment 數（不是 Threads 上報總數）。
- **P5 absence**：改吃 shard `commentRefsInShard` coverage（可算 captured/covered 母數）+ readings/memos，不再 render raw。
- 三者各自 bump prompt version。

P4 的輸出必須通過「有用資訊」gate：每個 topic-level pattern 要同時回答「是什麼反應」「頻率有幾大」「代表留言令它如何成立」「反例如何限制 claim」「這對 topic momentum / conflict dynamic 代表什麼」。只輸出 label + n 不合格；只輸出 quote 沒有 denominator 也不合格。

### 3.6 Phase 2 DoD
- 全 verify gate 綠 + shard/merge 的新 test（含「1 shard fast path」「2 shard dedup by commentId」兩個 golden case）。
- 更新 handler pipeline test 的 stage 順序斷言（現有 test 固定了 P1→…→final；插 P0.5 後要更新）。
- architecture map：`COMMENT_SHARD_READING` 🔴→🟢。
- one-in-one-out：P2/P4/P5 的 raw render 移除即「out」。

### 3.7 Phase 2 implementation slices（按 D1 winner 收窄）
1. **P2a schema + fixtures**：新增 `CommentShardReading` / `ReactionCoverage` / `ReactionPattern` 型別與 fixture；test 要證明 `dynamicImplication` 是必需輸出，`likeSum/confidenceTier` 不是 Phase 2 必需。**Partial landed：`ReactionCoverage` / `ReactionPattern` + UI fixtures 已完成；`CommentShardReading` 仍未完成。**
2. **P2b P0.5 prompt + parser**：新增 shard prompt，要求 `supportRefs/counterRefs/representativeRefs/counterRepresentativeRefs/dynamicImplication` 全部 evidence-bound；golden parser test 要拒絕無 ref 的 pattern。**Partial landed：現有 envelope parser 已保留 `reactionPatterns` 並 filter refs；P0.5 prompt/parser 仍未完成。**
3. **P2c post/topic merge**：依 `commentId` dedup，計 `nComments/nAuthors/coverageDenominator`，從 refs 回查 `EvidencePacket` 供 UI 顯示 text/commentId；test 覆蓋同一留言跨 shard 重覆出現只算一次。
4. **P2d P2/P4/P5 prompt switch**：三個 pass 改吃 shard distillate + cited quotes；P4 產出 topic-level `ReactionPattern`，P2/P5 不直接生成 UI schema。
5. **P2e UI display-model only**：`topic-detail.ts` derive reaction lanes/detail model；`TopicDetailView.tsx` 只 render winner direction（Evidence Drawer + compact coverage strip），並用 one-in-one-out 替換 P4 audience prose 顯示。**Landed as UI/display contract；等 P4 真正產出 topic-level `ReactionPattern` 後即會點亮。**

不要在 P2 做：real LLM P7、`likeSum/confidenceTier` 作必需欄位、第二套 reaction visual system、或完整 Phase 3 bar/confidence polish。

---

## 4. UI — 平行 Design track ✅ 已落地為產品 UI（2026-07-08 驗證，跳過 mockup）

> **狀態：DONE，且直接落產品版而非 mockup**（成立理由：reuse 現成 lane/panel 語法 = 同一 surface 的資料密度升級，屬 §4.0 的 carve-out，非新 visual system）。已落地：
> - `ReactionCoverage` / `ReactionPattern` 型別（`topic-audit.ts`）；
> - envelope parser 讀 `displayHints.reactionCoverage/reactionPatterns`，**丟掉缺 label/dynamicImplication/nComments/coverageDenominator 或全部 refs 都不在 allowedRefs 的 pattern**（anti-hallucination 已驗證：假 ref 會被 filter 成空 → 整個 pattern 被丟）；
> - Topic Detail「群眾反應」面板（coverage strip + `nComments/coverageDenominator` + `nAuthors` + `dynamicImplication`），`reactionPatterns.length > 0` 才 render，今天資料恆空不露空面板；
> - `buildReactionPatternDetail`（純 ViewModel，點開 pattern 從 `EvidencePacket` resolve 代表留言/反例，含 `missingRefs`）；
> - Audit Report §5：有 structured reaction 時取代 audience prose，否則 fallback 原 prose（one-in-one-out、無雙重 render）。
> **UI 已在等資料。剩餘工作只有 Phase 2 producer。** 下述原文保留作 rationale。

**核心校正：pipeline 的產出只有被展示才有價值，展示 backend 資料本身就是前端功能。所以 UI 不延後，它平行、而且反過來驅動 schema。**

### 4.0 顯示載體已存在（不是從零建 UI）
- [`TopicDetailView.tsx`](../../src/ui/TopicDetailView.tsx) 已有 `NarrativeLane` + `NarrativeLaneDetailPanel`（lane + bar + `consensus` 語法），且 [`buildNarrativeLaneDetail`](../../src/viewmodel/narrative-lane-detail.ts) 已做到「點 lane → 帶出背後 `EvidencePacket`」的 evidence drill-down。
- 目前餵的是 `LensMemo.displayHints.narrativeLanes` 的 **LLM 估計 `consensus`（0-1）**。反應模式要做的，是把這個估計換成 **evidence-bound 的真實 n**，並讓 detail panel 多出「代表留言 + 反例」。
- **設計紀律：reuse 這個 lane/panel 語法，禁止新增第二套 visual system**（design contract）。這不是新 screen，是同一 surface 的資料密度升級。

### 4.1 D1 — Reaction / Audience panel mockup（**現在就做，平行 Phase 1/2**）
- 依 design contract：visual-direction 改動先出 1-3 個 dated variant（`docs/mockups/2026-07-08-…`），user 挑，winner 才對 [`tokens.ts`](../../src/ui/tokens.ts) 實作。範圍是**聚焦的 panel**（reuse lane grammar），不是整個 topic-detail 重畫。
- variant 探索的是「數字/密度處理」：pattern label 之外，露 n_comments？n_authors？like_sum？代表留言幾則？反例怎麼擺？
- **這步的真正作用是 back-pressure schema**：mockup 敲定要顯示哪些數字 → 那就是 `CommentShardReading` / reaction 欄位必須產出的東西。先設計顯示，再定欄位——避免舊 project「猜欄位再 overfitting」的循環。
- **D1 結論（2026-07-08）**：winner direction = `Evidence Drawer`，吸收 `Coverage First` 的 compact coverage strip；`Dense Counts` 只作 schema 壓力參考。見 `docs/mockups/2026-07-08-reaction-panel-D1-summary.md`。UI 必須回答「有用資訊」五問：pattern 是什麼、在已讀留言池出現幾多、哪些留言令它成立、哪些反例限制 claim、它對 topic dynamics 代表什麼。

### 4.2 UI 接線隨資料 phase 點亮（增量，不等 Phase 3）
- **UI/display contract 已先落地（2026-07-08）**：ViewModel（[`topic-detail.ts`](../../src/viewmodel/topic-detail.ts)，boundary-safe 純轉換）把 stored `reactionPatterns` → lane/detail model。Lane 顯示 `nComments / coverageDenominator` + `nAuthors`；detail panel 放 `dynamicImplication`、代表留言、反例、support/counter refs。View 只 render；[`AuditReportView.tsx`](../../src/ui/AuditReportView.tsx) 在有 structured reaction 時 one-in-one-out 取代 §5 audience prose。
- **Phase 2 資料一落地即可點亮真實面板**：剩下工作是 P0.5 / post-topic merge / P4 producer，讓真實 `ReactionPattern` 寫入 memo。這已不需要再等一輪 UI。
- **Phase 3 refine**：like_pct / confidence / bar 精緻化 + optional `likeSum` / `confidenceTier`。不要把它們變成 Phase 2 必需欄位。

### 4.3 約束（Codex / 任何 UI session 必守）
- **one-in-one-out：新反應面板取代 P4 audience 的 free-prose 顯示**（升級同一 field，不是加第二個）。改前先 grep `audience` / `audienceSignal` 在 `src/ui/` 的 render 點（現有於 [TopicDetailView.tsx](../../src/ui/TopicDetailView.tsx) 約 L2472），確認不會同一 contract field 一頁 render 兩次。
- **derive 在 ViewModel、render 在 View**：反應 display-model 的計算歸 `topic-detail.ts`（純、boundary-guarded）；View 不得碰 storage/messaging。每個 lane / 引言可點回真實留言（substance over decoration，沿用 `buildNarrativeLaneDetail`）。
- **`consensus` 語意變更要標**：從「LLM 0-1 估計」變「evidence-bound 真實 n（或 normalized share）」，下游別誤讀。
- **real LLM P7 critic**：有數字 claim 上 UI 後才 wire `buildP7ValidatorPrompt` 進 handler（防 overclaim / n=1 升級 / 引用不存在）。在 Phase 2 資料+UI 之前 wire 是 premature。

### 4.4 Version lock
UI surface 併入 main（= user-visible 改動）時觸發 **version lock 五處**（`package.json` / `package-lock.json` / `wxt.config.ts` `manifest.version` / `src/ui/version.ts` `BUILD_VERSION` / `tests/manifest-config.test.ts` 的 pinned 字串）。Phase 1/2 純內部無此需求。

---

## 5. 不要做的事（anti-scope）

- ❌ 不要一次加四組結構化 schema（Codex 第一版的 over-build）。
- ❌ 不要用 embedding / k-means 做**判讀**。只可做候選分流，而本 case max 232 條根本不需要，直接 shard 讀更準（語境）。
- ❌ 不要引入 RAPTOR 級 recursive clustering。你的「樹」就是現成 P1→P6，只欠 post 層 map step。
- ❌ 不要動 [`topic-synthesis.ts`](../../src/compare/topic-synthesis.ts)。它是另一條線（UI 的 deterministic keyword derive），保留，只在 map 標清楚它 ≠ 深讀。
- ❌ 不要開新 storage key 存 shard readings（folding 進 `TopicAuditMemoBundle`）。

---

## 6. Architecture map delta（Codex 在實作 PR 內套用）

現況 map（v0.8）mermaid **完全沒有 topic-audit / topic-synthesis 節點**，LLM 只有一條泛用 `🟡 direct LLM calls`。要補一個 **Analysis Products (topic mode)** 子圖：

| 節點 | 狀態 | 說明 |
|---|---|---|
| `TOPIC_SYNTHESIS` | 🟢 | deterministic keyword lens（`topic-synthesis.ts`），數 keyword 跨 post 出現，**不讀留言文本** |
| `TOPIC_AUDIT` | 🟢 | 多層 LLM（P1 冷讀 → P2-P6），local `validateTopicAuditDraft` 收尾；**P7 LLM 為 dead code** |
| `COMMENT_RESERVOIR` | 🟡 | raw comments / read-model 已有，`ReplyFragment` identity 已補；full shard/read/usable coverage 母數仍待 Phase 2 |
| `COMMENT_SHARD_READING` | 🔴（Phase 2 完成後 🟢） | 白紙分流蒸餾層，依賴 `ReplyFragment` identity |
| `REACTION_PATTERN_MODEL` | 🟡（UI/parser contract landed；producer pending） | `ReactionCoverage` / `ReactionPattern` display contract 已入 code；真實 n + `dynamicImplication` 仍依賴 shard readings / P4 merge |

Phase 1 完成即可先把前三個節點（現實狀態）補上 map；`COMMENT_SHARD_READING` / `REACTION_PATTERN_MODEL` 在 Phase 2 first version 翻色，Phase 3 只做 confidence / engagement polish。Track B 加一條 **B5** roadmap bullet 指向本 plan。

---

## 7. 交付順序（2026-07-08 更新：只剩一件事）

**已完成：** Phase 1（§2 ✅）、UI/display contract（§4 ✅）。map：`REACTION_PATTERN_MODEL` 🟡、`COMMENT_SHARD_READING` 🔴。

**剩餘 = Phase 2 producer，一個 PR（Codex lane）：**
`CommentShardReading` artifact + `TopicAuditMemoBundle.shardReadings` folding + `buildP0_5ShardReadingPrompt` + P0.5 插進 handler + post-level merge（commentId dedup）+ P2/P4/P5 改吃蒸餾 + **P4 產出 `displayHints.reactionCoverage/reactionPatterns`（§3.5 的 producer 契約）** + handler stage 順序 test 更新 + map 翻色（`COMMENT_SHARD_READING` 🔴→🟢、`REACTION_PATTERN_MODEL` 🟡→🟢）。

Producer 落地當日，Topic Detail「群眾反應」面板與 Audit Report §5 structured panel 直接點亮，**無需再做 UI**。version lock 五處隨這個 PR（它讓面板從恆空變可見 = user-visible 改動生效點）。之後才考慮 real LLM P7 critic（§4.3）。

每個 PR 的 DoD 見各 section；跨 PR 共通：verify gate 全綠、architecture map 同步、commit prefix 單一、one-in-one-out note 兩側。
