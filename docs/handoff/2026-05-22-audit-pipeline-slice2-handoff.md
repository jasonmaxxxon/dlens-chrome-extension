# Audit Pipeline — Slice 2 Execution Handoff (background messages)

**日期：** 2026-05-22
**前置：** Slice 1 已完成（worktree `/Users/tung/Desktop/dlens-topic-audit-pipeline`，branch `codex/topic-audit-pipeline`）
**Spec：** `2026-05-22-audit-pipeline-prompt-spec.md` §3 §7
**Slice 1 handoff：** `2026-05-22-audit-pipeline-execution-handoff.md`

---

## 0. 前置條件（必須先做）

- **先 commit slice 1 的 8 個 audit 檔**——slice 2 的 message handler 要 import slice-1 的 storage/prompt/builder，base 必須穩定（不能 import untracked 檔）
- branch 不變：`codex/topic-audit-pipeline`，base `origin/main`（已確認 4 ahead / 0 behind，乾淨）
- 開工前 `npm run typecheck` + tests 綠

---

## 1. Scope（只做 message 層，不碰 UI）

把 slice-1 的資料層接進 `entrypoints/background.ts` 的 message routing。**不做 UI**（第三刀）。

不准碰：
- `topic/synthesis/*`、`folder/synthesis/*` handler（保留不動）
- `topic/generate-signal-reading`、`topic/list-signal-readings`、`signal/list-tags` handler
- slice-1 的 4 個產品檔（只 import，不改）

---

## 2. 新增 message types（`src/state/messages.ts`）

加進 `ExtensionMessage` union（沿用現有 `{ type: "..."; ... }` 形態，namespace `topic/audit/*`，與 `topic/synthesis/*` 平行）：

```ts
| { type: "topic/audit/build-evidence"; sessionId: string; topicId: string }
| { type: "topic/audit/run"; sessionId: string; topicId: string; fromStage?: AuditStageName }
| { type: "topic/audit/get"; topicId: string }
| { type: "topic/audit/validate"; topicId: string }
| { type: "topic/audit/clear"; topicId: string }
| { type: "cross-topic/calibrate"; topicIds: string[] }
```

對應 `ExtensionResponse` 增補欄位（沿用現有 `{ ok: true; tabId; ... }` 形態）：
```ts
auditEvidence?: EvidencePacket[];
auditReport?: TopicAuditReport | null;
auditMemos?: LensMemo[];          // 含 SignalReading + LensMemo trace
auditValidatorFlags?: ValidatorFlag[];
crossTopicCalibration?: CrossTopicCalibration | null;
```

`AuditStageName` / 這些 type 全部 import 自 slice-1 的 `src/compare/topic-audit.ts`，**不在 messages.ts 重新定義**。

---

## 3. Handler dispatch（`entrypoints/background.ts`）

加在 topic handler 群附近（與 `case "topic/synthesis/generate":` 同層 switch）。沿用現有模式：`resolveTabId(sender)` → `loadSnapshot(tabId)` 取 session → `loadTopics/loadSignals(chrome.storage.local, sessionId)` → 動作 → `sendResponse({ ok: true, tabId, ... } satisfies ExtensionResponse)`。

### `topic/audit/build-evidence`（P0，deterministic，無 LLM）
```
1. loadSnapshot → 找 session → 找 topic（topicId）
2. loadSignals + 既有 signal-tags（listSignalTags）
3. join：topic.signalIds → signal → itemId → session.items（含 commentsPreview）
4. 呼叫 slice-1 的 buildEvidencePackets(...)（role-tagged fragments / null-safe / gaps）
5. saveAuditEvidence(chrome.storage.local, topicId, packets)
6. sendResponse({ ok, tabId, auditEvidence })
```

### `topic/audit/run`（P1-P6，LLM；P7 validator 順帶）
```
1. 取 providerConfig（同 signal-tags handler：providerConfig.provider, providerConfig.apiKey）
2. 載 evidence（沒有就先 build-evidence）
3. 依 stage 順序跑 P1→P6：
   - 每個 stage 先算 cache key（slice-1 提供），命中就讀 cache 跳過
   - P1 per-signal/chunked；P2-P6 aggregate（吃前面 LensMemo）
   - 每完成一個 stage 立刻 saveAuditMemo(...)（leverage slice-1 cache：中途失敗可從 fromStage 續跑）
4. P6 完成 → saveAuditReport(...)
5. 順帶跑 P7 single-topic validator → 存 flags
6. sendResponse({ ok, tabId, auditReport, auditMemos, auditValidatorFlags })
```
**重點：stage-by-stage 持久化** —— 6 個 LLM call 很長，逐 stage 存 LensMemo + 用 cache key，避免一個 call 爆掉全部重來。`fromStage` 參數讓 UI / 重試從中斷處續跑。

### `topic/audit/get` / `validate` / `clear`
- get：讀 report + memos 回傳
- validate：對已存 report 跑 P7，回 flags（不重生 report）
- clear：清 `topic-audit-*`（**不碰 synthesis**）

### `cross-topic/calibrate`（P8，≥2 topic）
```
1. 載入 topicIds[] 各自的 audit report + absence memo（沒有的 topic 報錯）
2. 跑 P8 prompt builder → CrossTopicCalibration
3. 跑 cross-topic validator（overclaim 檢查：platform/culture 斷言須 hedge）
4. saveCrossTopicCalibration + sendResponse
```

---

## 4. 不要做的

- ❌ 不在 run handler 裡硬塞 UI 進度條邏輯——進度靠「stage-by-stage 存 memo + UI 之後 poll get」即可（第三刀處理 UI poll）
- ❌ 不把 `topic/audit/run` 做成單一不可中斷的巨型 await（要 stage-by-stage 持久化）
- ❌ 不改 provider.ts 的既有 call signature（audit prompts 走既有 provider 介面）
- ❌ 不碰 synthesis / signal-reading / signal-tags handler

---

## 5. 測試（沿用 `tests/product-routing.test.ts` 的 routing 測試模式）

1. **Routing**：6 個新 message type 都 dispatch 到對的 handler，回傳 shape 正確（mock chrome.storage + mock provider）
2. **build-evidence**：給 mock topic+signals+items → 回 EvidencePacket[]，role-tagging 正確、gap 標記正確
3. **run（mock provider）**：P1-P6 依序呼叫，每 stage 存 memo；中途某 stage throw → 已完成的 memo 有存、可從 fromStage 續跑
4. **cache 命中**：同 input 再 run → 不重呼叫 provider（cache key 命中）
5. **get/validate/clear**：roundtrip；clear 不影響 `topic-synthesis` / `signal-readings` storage（明確斷言這些 key 沒被動）
6. **cross-topic/calibrate**：< 2 topic → 報錯；≥ 2 → 回 calibration + validator flags
7. **provider 失敗隔離**：單一 signal 的 P1 失敗不應炸掉整個 run（參考 signal-tags handler 的 try/catch-per-item 模式）

**不測 prose 內容**（同 slice 1，只測 contract / routing / persistence / cache）。

---

## 6. Definition of done（slice 2）

- [ ] `messages.ts` 6 個 type + ExtensionResponse 欄位（type 全 import slice-1）
- [ ] `background.ts` 6 個 handler，stage-by-stage 持久化 + cache 命中 + per-signal 失敗隔離
- [ ] 測試 7 項綠
- [ ] `npm run typecheck` 綠、現有 tests 不退化
- [ ] 完全沒碰 synthesis / signal-reading / signal-tags handler（grep 斷言 + diff review）
- [ ] UI 完全沒動（第三刀）

---

## 附：第三刀預告（不在本刀）
Topic report page：CTA 觸發 `topic/audit/run` → poll `topic/audit/get` 顯示 stage 進度 → 渲染 `TopicAuditReport` 7 節 + validator flags。narrative lanes 首屏靠 P3 `displayHints`（slice-1 optional 欄位）。與 v2 UI 整合。
