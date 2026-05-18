# Signal Reading Review — 前後端接縫契約

- Date: 2026-05-18
- Status: **implemented contract** — 前端(Codex)與後端(Claude)並行實作的接縫文件
- Worktree: `dlens-product-latest`(branch `codex/signal-verdict-layout`)— 唯一 source of truth
- 前端另有 UI / design mockup zip;前端照 mockup + 本契約實作

## 目的

Agent Brief 頁的 `review → compose` 流程:先逐則審視 model reading,把「收錄」的 reading
組成可貼給 agent 的 brief。本層是**資料層與 UI 的接縫**,前後端不可在沒有此契約下並行,
否則兩半的 review-state 形狀會兜不起來。此文件把接縫定死。

## 1. 三層結構(已確立,僅記錄)

```
Saved Signal   原始素材庫        存 Threads post
Signal Reading 模型判讀庫        存可追溯 reading record（b 軌已完成）
Agent Brief    輸出層            把「已收錄」reading 組成可貼給 agent 的文字
```

## 2. SignalReading record — 新增 reviewState

`SignalReading`(`src/compare/signal-reading-storage.ts`)在現有欄位上新增一個欄位:

```ts
export type SignalReadingReviewState = "pending" | "filed" | "deferred" | "rejected";
// 中文對應：待 review / 收錄 / 待看 / 退回

export interface SignalReading {
  // ...現有欄位（signalId / cacheKey / ... / model / sourceRefs / sourcePacket / feedbackEvents）
  reviewState: SignalReadingReviewState;
}
```

規則:

- 新 reading 由 `product/synthesize-signal-reading` 生成時,`reviewState = "pending"`。
- `reviewState` 是「當前真相」的快取欄位;`feedbackEvents` 是 append-only 歷史。
- 不變式:`reviewState` 永遠等於最近一筆 `filed/deferred/rejected` 事件的 type,
  若無任何 review 事件則為 `"pending"`。handler 是唯一寫入者,兩者原子性同步。
- legacy record(本契約前的舊 record)沒有此欄位 → `normalizeSignalReading` 預設補 `"pending"`。

## 3. feedbackEvents 詞彙(UI affordance 已定 → 現可定義)

把 b 軌的佔位型別 `SignalReadingFeedbackEvent = Record<string, unknown>` 換成正式型別:

```ts
export type SignalReadingFeedbackType =
  | "filed"          // 收錄此判讀
  | "deferred"       // 待看
  | "rejected"       // 退回
  | "added_to_brief";// 被組進一份 Agent Brief

export interface SignalReadingFeedbackEvent {
  type: SignalReadingFeedbackType;
  at: string;        // ISO timestamp
  note?: string;     // 可選自由文字（v1 通常省略）
}
```

規則:

- review 決定(`filed` / `deferred` / `rejected`)同時做兩件事:append 一筆事件 + 設定 `reviewState`。
- review-decision 的 event type 與其導致的 `reviewState` **一一對應**(同名)。
- `added_to_brief` 是 usage 事件,**不改變** `reviewState`,只記錄。
- v1 不做退回 reason 的固定 enum;`退回` 只送 `rejected`,reason picker 是 v1.1。
- legacy feedbackEvents 一律是 `[]`(b 軌就是這樣存),無舊資料相容問題。

## 4. Messages

```ts
// 新增
| { type: "product/review-signal-reading";
    cacheKey: string;
    decision: "filed" | "deferred" | "rejected";
    note?: string }
| { type: "product/list-signal-readings" }

// 不變
| { type: "product/synthesize-signal-reading"; signalId: string; sessionId: string; force?: boolean }
```

- `product/review-signal-reading` → handler append 事件 + 設 `reviewState`,回 `{ signalReading: SignalReading }`(更新後的 record)。
- `product/list-signal-readings` → 回 `{ signalReadings: SignalReading[] }`(全部 reading)。
  前端**必須**用當前 saved signals 的 `signalId` 篩掉無關 reading,避免跨 session 的 corpus
  混進這一頁;每個 signal 取 `generatedAt` 最新一筆顯示。
- §1 列的是 **signal row**,每 row 顯示其 latest/current `SignalReading` 狀態 —— 用戶心智是
  「審這則訊號」;但 review action 仍用 `cacheKey`,因為被收錄的是特定版本的 reading。
- review 目標用 `cacheKey` 不是 `signalId` — 一個 signal 可有多筆 reading record(不同版本/packet),review 針對特定那筆。
- `force: true` 只用於重新生成 stale / legacy reading;handler 必須略過同 cacheKey 的舊 cache hit 並寫入新 record。

## 5. Brief compose — 共用純模組(品質閘門)

- §2 BRIEF COMPOSE **只吃 `reviewState === "filed"` 的 reading**。
- 現有 `buildAgentBrief` 是 `ProductSignalViews.tsx` 裡的 UI helper。**不要**前端過濾一次、
  後端再過濾一次。改成新增純模組 `src/compare/signal-reading-brief.ts`:
  - `selectFiledReadings(readings)` —— filed-only filter,**filter 只存在這一處**。
  - `composeReadingBrief(readings, analysesBySignalId, currentPromptVersion)` —— 從 filed readings
    組 brief 的純函式,可測,UI(§2 預覽)與任何 handler 共用。
- brief section 以 `reading.reading`(模型判讀)為主體,結構化 metadata(判斷 / relevance / 分類 /
  sourceRefs)為附。輸出 markdown 細節由此模組決定。
- 後端**不動** `ProductSignalViews.tsx` 的舊 `buildAgentBrief` —— §2 改用新模組是前端工作。

## 6. Staleness 訊號(統一一個)

```ts
export interface SignalReadingStaleness {
  stale: boolean;
  reasons: ("prompt_version" | "missing_provenance")[];
}
export function signalReadingStaleness(
  reading: SignalReading,
  currentPromptVersion: string
): SignalReadingStaleness;
```

- `prompt_version`:`reading.promptVersion !== currentPromptVersion`(reading 用舊 prompt 生成)。
- `missing_provenance`:`reading.model === ""` 或 `reading.sourcePacket.assembledContent === ""`
  (legacy record,b 軌之前生成,無來源)。
- UI 用**同一個**「建議重新生成」banner 處理 `stale === true`,可列出 reasons。
- **Stale filed reading 進 brief**:v1 **允許** stale 的 filed reading 進 brief(不因過期就擋);
  但 `composeReadingBrief` 與 §2 preview **必須**逐則標示「判讀版本過期 / 缺來源」,由用戶決定是否先重新生成。
- 不在 v1 範圍:product-context 改變導致的 staleness — 由 cacheKey miss 自然觸發重新生成,不另做訊號。

## 7. 分工

### 後端(Claude)

- `signal-reading-storage.ts`:`SignalReadingReviewState`、正式 `SignalReadingFeedbackEvent`、
  `SignalReading.reviewState`;`normalizeSignalReading` 補 `reviewState` 預設 `"pending"` + 驗證 feedbackEvents。
- `listSignalReadings(storage)` + `latestReadingBySignalId(readings)`。
- `appendSignalReadingReview(storage, cacheKey, decision, note?)` — append 事件 + 設 reviewState,回更新後 record。
- `signalReadingStaleness(reading, currentPromptVersion)`。
- `background.ts`:`product/review-signal-reading`、`product/list-signal-readings` handler;
  `synthesize-signal-reading` 新 record 帶 `reviewState: "pending"`。
- 新增純模組 `src/compare/signal-reading-brief.ts`:`selectFiledReadings` +
  `composeReadingBrief`(含 stale 標示)。不動 `ProductSignalViews.tsx` 的舊 `buildAgentBrief`。
- 測試。

### 前端(Codex)

- §1 READING REVIEW:列 signal,每個顯示最新 reading + `reviewState` chip + staleness banner;
  `收錄 / 待看 / 退回` 按鈕 → `product/review-signal-reading`。
- §2 BRIEF COMPOSE:只顯示 `reviewState==="filed"` 的 reading;輸出格式選擇器;預覽。
  brief 用 `signal-reading-brief.ts` 的 `composeReadingBrief` 組,不要自己再過濾一次。
- §1 列 signal row,用當前 saved signals 的 `signalId` 篩 `list-signal-readings` 的結果。
- 正名:`收錄此判讀` / `已收錄` / `待看` / `退回`;**移除「保留」**(與 signal verdict 的「保留觀察」語義對撞)。
- 頁面文案明講一次 corpus:「收錄後會進入本地判讀庫,可用於 Brief 與之後的相似案例回查」。
- staleness banner 消費 `signalReadingStaleness()` 的回傳。
- layout 照 zip mockup;active review card 內保留 compact Marginalia signal strip(`verdict` / `referenceType` / `relevance`),避免 reading workflow 丟失原 Product signal 判斷密度。

### 接縫(雙方都對著這個寫)

第 2–6 節的 type、message、`signalReadingStaleness` 簽名、filed-only 規則 —— 即接縫本身。

## 8. Backward compatibility

- 無 migration。`normalizeSignalReading` 在讀取時補 legacy 預設(`reviewState: "pending"`、
  `feedbackEvents: []`)。
- legacy reading(無 provenance)= `missing_provenance` staleness → UI 顯示「建議重新生成」,
  不假裝它有完整來源。

## 9. 不在本契約範圍

feedback 品質標籤固定 enum(太泛 / 證據不足 / 方向錯)、`added_to_brief` 的寫入時機與 wiring、
embedding / semantic search、MCP、watch agent、tracing dashboard。`added_to_brief` 的 **type** 已定義
(forward-compat),但何時寫入留待 v1.1。
