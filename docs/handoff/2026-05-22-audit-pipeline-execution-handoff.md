# DLens Topic Audit Pipeline — Execution Handoff (for Codex)

**日期：** 2026-05-22
**Spec：** `docs/handoff/2026-05-22-audit-pipeline-prompt-spec.md`（讀完再開工）
**Golden traces：** `docs/audit/2026-05-21-work-pass{0-7}-*` + `docs/audit/2026-05-22-love-pass{0-7}-*`
**性質：** implementation boundary 指引——不擴產品理念，spec 已涵蓋。本份只講「在現有 codebase 哪裡開刀、哪裡不准碰」。

---

## 0. Branch + scope

- branch：`codex/topic-audit-pipeline`，base：當前 `main`
- 先跑 `npm run typecheck` + 現有 tests 確認 baseline
- scope：**只做後端 / 資料層 + prompt builders + validator**。UI 不在這刀（見 §6 三刀順序）

---

## 1. 不准碰 / 只保留的現有功能

| 現有 | 處置 | 理由 |
|------|------|------|
| `src/compare/topic-signal-reading.ts`（`stance enum + reading + audience_signal`） | **保留不改、不重用** | 語義是 per-signal classifier，與新 free-prose pipeline 不同。硬改會破壞現有 `topic/generate-signal-reading` |
| `dlens:v1:topic-signal-readings` storage key | 保留不動 | 同上 |
| topic `synthesis` 欄位 + `topic/synthesis/generate`、`topic/synthesis/clear` handler | **保留不動，另開新 audit 概念** | 現有 synthesis 是單發合成，audit 是多 pass pipeline，語義不同 |
| `dlens:v1:signals` / `signal-tags` / `topics` | 唯讀消費（P0 從這裡 + global-state items 組 EvidencePacket） | audit 不寫回這些 |

**鐵律：audit pipeline 是新增物，不是把舊 per-signal reading 改造成 P1-P6。**

---

## 2. 新檔案 + storage keys

### 新檔案
```
src/compare/topic-audit.ts            // EvidencePacket / SignalReading / LensMemo / TopicAuditReport types + builders
src/compare/topic-audit-prompts.ts    // P1-P8 prompt builders（每個 stage 一個 module-level fn）
src/compare/topic-audit-validator.ts  // P7 single-topic + cross-topic validator
src/state/topic-audit-storage.ts      // 讀寫 audit artifacts
```
（沿用現有 `src/compare/` + `src/state/` 分層，與 `folder-synthesis.ts` / `folder-synthesis-storage.ts` 同模式。）

### 新 storage keys（v1 命名一致）
```
dlens:v1:topic-audit-evidence      // EvidencePacket[] per topic
dlens:v1:topic-audit-memos         // SignalReading[] + LensMemo[] per topic（trace 持久化）
dlens:v1:topic-audit-reports       // TopicAuditReport per topic
dlens:v1:cross-topic-calibrations  // CrossTopicCalibration（P8，≥2 topic）
```

---

## 3. P0 EvidencePacket builder（point 2 — OP 自我接話不能丟）

`topReplies` 排除 OP self-echo 是對的，但**不能丟棄**——love S2 是一篇 10 點長 thread，主要論證在 OP 自我接話裡。改成 role-tagged fragments：

```ts
interface ReplyFragment {
  author: string;
  text: string;
  likes: number | null;
  role: "op_continuation" | "audience" | "placeholder"; // placeholder = pinned 無作者欄
}

interface EvidencePacket {
  // ...spec §1 欄位...
  opText: string;                  // root post 全文
  replyFragments: ReplyFragment[]; // 全部保留，role-tagged
  // 衍生 view（builder 提供，不另存）：
  //   topReplies()       = replyFragments.filter(role === "audience")
  //   opContinuations()  = replyFragments.filter(role === "op_continuation")
}
```

- role 判定：`author === OP handle` → `op_continuation`；無作者欄 → `placeholder`；其餘 `audience`
- P1-P6 預設用 `topReplies()`（audience），但 **opContinuations 必須可取用**——P1 讀 S2 這種長 thread 時要看得到 OP 的完整論證
- queued / unknown 欄位用 `null`，**禁止當 0**（work validator §2.1 FAIL）
- 既有 AI gist/tags 進 `aiArtifacts`，pipeline 不繼承
- gap 進 `gaps[]`（visual 不可得 / OP text 截斷 / queued 無留言）

> **資料來源（spec point 7）：** P0 ingestion 走 extension storage API（讀 `dlens:v1:topics`/`signals`/`signal-tags` + global-state items，join by itemId）。**不准把 Snappy SSTable / LevelDB 直讀寫進產品 code**——那只是研究階段抽 trace 的工具。可留一個 explicit debug/export route 產 EvidencePacket[] 給測試用。

---

## 4. Cache key + chunking（point 3 — P1 不假設單一 call）

### Cache key
```
auditCacheKey = hash(topicId + sortedSignalIds + perItem(updatedAt|status) + promptVersion + stageName)
```
任一 item 的 `updatedAt`/`status` 變、或 promptVersion bump，該 stage 之後全部失效重算。

### Chunking
- **P1 per-signal（或 chunked）**：每篇 signal 獨立 / 分批 call，產 `SignalReading`。Topic 之後可能 > 15 篇，不能假設一次塞完
- **P2-P6 aggregate**：吃全部 SignalReading + 前面 LensMemo。若 signal 數大到 context 爆，P2-P6 允許 map-reduce（先分塊抽，再合）——但 v1 先做簡單版（≤ ~30 篇直接塞），chunking 留 TODO hook
- 每個 stage 輸出存 `topic-audit-memos`，下一 stage 讀回（chain-of-evidence accumulation）

---

## 5. Prompt builders（P1-P8）+ P1 cold-read（user 的 friction 點）

每個 stage 一個 builder fn，prompt 內容照 spec §3。**唯一相對 spec 的調整：P1 改成 cold-read 開頭。**

### P1 cold-read（fold 進 P1，不新增 stage，prompt 總數仍 8）
P1 prompt 結構：
```
1. 先丟純 evidence：OP 全文 + likes + audience replies（+ 需要時 opContinuations）
2. 開放問：「你看到什麼？這篇在發生什麼？」——最大摩擦，零框架先行
3. 然後才（作為 optional lens，非必填欄位）：「如果有用，也可考慮：OP 在做什麼動作？reply 對 OP 做什麼動作？」
4. 紀律照 spec P1：只引 S#.OP/R#、不繼承 AI tags、不 cluster、不打 enum
```
理由：第一次接觸 evidence 要 cold read 製造摩擦，結構化 lens 放在後面，避免一開始就被框架綁死。這是整條 pipeline「永遠有一 part 自由撰寫」的保證。

### Prompt-version 管理
每個 stage 各自 `PROMPT_VERSION`（沿用現有 `TOPIC_SIGNAL_READING_PROMPT_VERSION = "v1"` 模式），進 cache key。

### Forbidden-findings guard（spec §2）
P5/P6 builder 內**不可植入** spec §2 的 6 個禁止 finding（無 future tense / 無 prescription / 壓制樂觀 / 不辯論 / 哀悼型 / 量化是文化通則）。這要做成測試斷言（§8）。

---

## 6. 三刀 implementation order（point 6 — 先後端不先 UI）

**第一刀（本 PR）：資料層 + pipeline**
- `topic-audit.ts` types + EvidencePacket builder（role-tagged fragments）
- `topic-audit-storage.ts`（4 個 key 讀寫 + cache key）
- `topic-audit-prompts.ts`（P1-P8 builders + parsers）
- `topic-audit-validator.ts`（P7 + cross-topic）
- tests（§8）

**第二刀（下個 PR）：background messages**
- 新 message types（§7）接進 `entrypoints/background.ts` 的 routing（沿用現有 `case "topic/..."` 模式）

**第三刀（之後）：Topic report page**
- report 第二頁渲染 `TopicAuditReport`
- narrative lanes / theme tags 首屏（見 §9）
- UI 重做等資料 contract 穩了再上

---

## 7. Message types（第二刀，先定義不先接）

```
topic/audit/build-evidence    -> EvidencePacket[]（P0）
topic/audit/run               -> 跑 P1-P6，回 TopicAuditReport（可帶 stage 進度）
topic/audit/get               -> 取已存 report + memos
topic/audit/validate          -> P7 flags
topic/audit/clear             -> 清 audit artifacts（不碰 synthesis）
cross-topic/calibrate         -> P8（input: topicIds[]）
```
命名與現有 `topic/synthesis/*` 平行，但**獨立 namespace `topic/audit/*`**，不混入 synthesis。

---

## 8. Fixtures + 測試清單（point 5 — 不做 full prose exact match）

### Fixtures
- `work` / `love` 的 P0 evidence（從 `/tmp/dlens-{work,love}-items.json` 或重抽）當 input fixture
- work/love 的 pass trace 當 **north-star reference**（人讀對照用），**不做文字 exact match**

### 測試（測 contract / constraint，不測 prose 內容）
1. **P0 normalization**：role-tagging 正確（OP self-echo → op_continuation；love S2 三條都標 op_continuation；pinned → placeholder）；queued/unknown → null 不是 0
2. **EvidencePacket roundtrip**：storage 寫讀一致
3. **Cache key**：item updatedAt/status/promptVersion 變 → key 變；不變 → 命中
4. **Prompt constraints**：P1 prompt 含 cold-read 開放問句、不含 AI gist；P5/P6 prompt **不含** spec §2 的 6 個禁止 finding（grep 斷言）
5. **Citation validator flags**：餵已知有問題的 fake report（缺 signal id / likes 數不符 / queued 當 0 / n=1 撐 pattern / 「零出現」無 scope）→ validator 必須各自 flag
6. **Coverage / gap rules**：餵 queued-only signal → SignalReading evidenceRefs 僅 S#.OP；audience 不可得 → memo caveat 標 data-gap 不標 absence
7. **Cross-topic validator**：餵「platform affordance 被證實」這種過強措辭 → flag 須降調

---

## 9. Narrative lanes / display（point 4 — 不從 prose 硬 parse）

- v1 **只做 report 第二頁**（渲染 `TopicAuditReport` 7 節 prose）
- Topic 首屏 narrative lanes：**不從 P3 prose regex parse**。若首屏要 lanes，讓 P3 builder 額外吐一個很薄的 optional `displayHints`：
```ts
interface LensMemo {
  // ...
  displayHints?: { laneLabels?: string[] }; // P3 可選輸出，UI 掃描用，非 report 主 schema
}
```
- `displayHints` 是 UI 便利品，**不可反向變成 report 主結構**（不可讓它長成 narrativeType enum）。第一版可不做，留 hook

---

## 10. Definition of done（第一刀）

- [ ] `topic-audit.ts` 4 types + EvidencePacket builder（role-tagged fragments，null-safe）
- [ ] `topic-audit-storage.ts` 4 keys + cache key
- [ ] `topic-audit-prompts.ts` P1-P8 builders（P1 cold-read 開頭）+ parsers，各自 PROMPT_VERSION
- [ ] `topic-audit-validator.ts` P7 + cross-topic，only-flag
- [ ] §8 全部測試綠
- [ ] `npm run typecheck` 綠、現有 tests 不退化
- [ ] 完全沒碰 `topic-signal-reading.ts` / `topic-signal-readings` key / `synthesis` handler
- [ ] 無任何 LevelDB/Snappy 直讀進產品 code（debug route 除外）

---

## 附：留作後續（非本刀）
- 第 3 個非經濟 topic（驗證量化 cognitive mode 是否文化模式）——spec §7
- P2-P6 的 map-reduce chunking（topic 篇數大時）——§4 TODO hook
- Topic 首屏 lanes（依賴 displayHints）——§9
