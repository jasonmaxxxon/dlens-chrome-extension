# DLens Error-Free Storage Integrity 修正計畫

> **執行要求：** 使用 `superpowers:subagent-driven-development` 逐 Task 執行。每個 Task 只守一個 invariant，先寫會失敗的回歸測試，再寫最小修正；每項完成、review 乾淨後獨立提交。

**目標：** 修掉四個已證實會造成永久等待、資料覆寫、幻影成功或幽靈衍生資料的錯誤，不加入 relevance gate、provider semaphore、IndexedDB 搬遷或其他產品能力。

**起點：** `d5d08e2d7e4ddd7b1e09f2dfcd26f372d51824be`（0.3.47）

**Baseline：** `1213 tests / 1208 pass / 0 fail / 5 skip`；typecheck、boundary guard、storage seam guard 全綠。

**技術棧：** TypeScript、WXT MV3 background worker、Chrome `storage.local`、Node test runner。

---

## 全域邊界

- 本輪只改 extension repo，不改 `dlens-ingest-core`。
- 不改 message contract、storage key、UI copy、DOM、provider prompt、topic relevance 語義或 bundle 載入架構。
- Topic report/episode history 與 saved comparisons 的 signal 刪除政策未定，明確不 cascade。
- `signal-tags` 由 `itemId` 擁有；只有 backing item 已無任何 signal reference 並被移除時才刪。
- Snapshot 修正只保證「durable write 成功後才發布 cache/broadcast」，不宣稱多 key transaction 已具 rollback。
- Request timeout 必須保留 caller cancellation；不得用 timeout signal 覆蓋既有 `RequestInit.signal`。
- Topic audit queue 必須在前一項 rejection 後仍可繼續，且 aggregate publication/clear 不得 nested enqueue 造成 deadlock。
- 每個 Task 的 commit prefix 固定為 `bug fix:`；不 bump version，版本整合留到使用者批准合併時處理。

## 每 Task 驗證

```bash
npm run typecheck
git diff --check
```

另跑 Task 指定的 targeted tests。只有測試先在舊實作上呈現預期 RED，才可改 production code。

---

## Task 1：限制 ingest client request 時間

**Invariant：** 每個 backend fetch 都有明確上限；caller 主動取消仍原樣生效；慢速 advanced metrics 不被 control-plane 的短 timeout 誤殺。

**Files：**

- Modify: `src/ingest/client.ts`
- Modify: `tests/ingest-client.test.ts`
- Possibly modify: `tests/backend-llm-trace.test.ts`
- Include in this commit: `docs/superpowers/plans/2026-07-17-error-free-storage-integrity.md`

**Test first：**

- [ ] 用永不 resolve、只監聽 `signal.abort` 的 fetch stub，證明普通 backend request 在短測試 timeout 後 reject；舊碼應保持 pending，測試先 RED。
- [ ] 鎖定 timeout error 是可辨識訊息，包含 endpoint/path 與 timeout 毫秒，不可只回模糊的「backend unavailable」。
- [ ] 鎖定 caller signal 與 timeout signal 是組合關係：caller 先 abort 時立即停止，不能等待內部 timer。
- [ ] 鎖定 timeout/caller abort 都會產生 terminal `backend.request` error trace，且不重複 terminal event。
- [ ] 鎖定 `/health` 保留 3 秒預設；advanced metrics 使用顯著較長的明確上限；其他 control/data requests 使用共同 bounded default。

**Implementation shape：**

- 在 `fetchJson` 建立單一 timeout controller，將它與 `init.signal` 組合；完成後移除 listener、清 timer。
- 為測試提供窄的 `ingestClientTestables` 或等價 seam，不把 private transport 變成一般 production API。
- timeout 與 caller abort 要保留不同原因；HTTP 非 2xx contract 不變。
- 不增加 retry。

**Targeted verification：**

```bash
npx tsx --test tests/ingest-client.test.ts tests/backend-llm-trace.test.ts
npm run typecheck
git diff --check
```

**Commit：** `bug fix: bound ingest client requests`

---

## Task 2：序列化 Topic audit storage mutations

**Invariant：** 同一 worker 內所有 Topic audit map read-modify-write 共用一條 recoverable queue；並發 save 不覆蓋其他 topic，save/clear 的最後結果服從呼叫順序。

**Files：**

- Modify: `src/state/topic-audit-storage.ts`
- Modify: `src/state/topic-audit-handlers.ts`
- Modify: `tests/topic-audit-storage.test.ts`
- Modify: `tests/topic-audit-handlers.test.ts`

**Test first：**

- [ ] 建立可控制 `get/set` interleaving 的 storage double；兩個 evidence save 同時從空 map 開始時，舊碼最後只剩一個 topic，先得到 RED。
- [ ] 覆蓋 evidence、memos、report、episodes、cross-topic calibration 的 mutation 都走共同序列化 seam。
- [ ] 並發 `save(topic-a)` 後 `clear(topic-a)`，最終四個 audit map 都沒有 `topic-a`；反向順序則最後保留 save。
- [ ] clear 只移除指定 topic，保留其他 topic；不碰 synthesis、topic signal readings、calibration。
- [ ] 一次 storage rejection 不會 poison queue；下一個 mutation 仍可成功。
- [ ] report+episodes publication 仍以一次 multi-key `set` 發布，不能拆成可觀察的 mixed revision。

**Implementation shape：**

- 以一個 module-level `topicAuditMutationQueue` 與 `enqueueTopicAuditMutation` 包住所有 map mutation。
- 將實際 RMW 寫成不 enqueue 的 private helpers；aggregate publication 與 clear 只在最外層 enqueue 一次，避免 nested deadlock。
- 把 handler 內的 local `deleteMapEntry` 移到 storage owner，提供一個序列化 clear API。
- read-only loaders 不入 queue。

**Targeted verification：**

```bash
npx tsx --test tests/topic-audit-storage.test.ts tests/topic-audit-handlers.test.ts
npm run typecheck
npm run storage:seam-guard
git diff --check
```

**Commit：** `bug fix: serialize topic audit storage mutations`

---

## Task 3：durable write 後才發布 snapshot cache

**Invariant：** snapshot/global write 若失敗，in-memory cache、tab cache、broadcast 與後續 read 都不得看見未落盤的新狀態；成功 write 才一次發布。

**Files：**

- Modify: `entrypoints/background.ts`
- Modify: `tests/background-behavior.test.ts`

**Test first：**

- [ ] 對完整 snapshot path 注入 `storage.set` rejection：dispatch 應失敗、沒有 `state/updated` broadcast、後續 cached read 仍回舊 snapshot；舊碼會讀到幻影新狀態，先 RED。
- [ ] 對 `persistGlobalStateOnly` path 做同樣驗證，避免只修其中一條路。
- [ ] 成功路徑仍只寫一次、broadcast 一次，cache 與 disk 都是新狀態。
- [ ] `lastSaveSnapshotStorageMs` 只在成功 write 後發布，不把失敗 write 當成功 latency。

**Implementation shape：**

- `persistGlobalStateOnly`：normalize/timestamp → await durable write → 更新 `globalStateCache` 與 latency/log。
- `persistSnapshot`：await durable write → `cacheSnapshot` → 更新 latency → broadcast → slow log。
- 不改 `mutateSnapshot` lock、payload shape 或 no-write path。
- 不加入跨 key rollback；測試與說明只鎖 publication ordering。

**Targeted verification：**

```bash
npx tsx --test tests/background-behavior.test.ts
npm run typecheck
npm run storage:seam-guard
git diff --check
```

**Commit：** `bug fix: publish snapshot cache after durable write`

---

## Task 4：移除 signal 直接擁有的衍生記錄

**Invariant：** signal 刪除後，所有以該 `signalId` 直接擁有的讀取/回饋記錄消失；共享 backing item 與其 item-owned tags 只在最後一個 reference 消失時刪；未定政策資料保持不動。

**Files：**

- Modify: `src/compare/signal-reading-storage.ts`
- Modify: `src/compare/product-agent-task-feedback.ts`
- Modify: `src/compare/topic-signal-reading-storage.ts`
- Modify: `src/compare/signal-tags-storage.ts`
- Modify: `src/state/session-signal-seam.ts`
- Modify: `entrypoints/background.ts`
- Modify targeted storage tests, `tests/session-signal-seam.test.ts`, `tests/topic-handlers.test.ts`, and `tests/background-behavior.test.ts`

**Test first：**

- [ ] 各 storage owner 新增 delete-by-owner regression：刪 `signal-a` 後只保留其他 signal 的 SignalReading、ProductAgentTaskFeedback、TopicSignalReading。
- [ ] `deleteSignalStorageRecords` 一次清 signal、folder synthesis 及上述三個 signal-owned families；舊碼會留下 derived rows，先 RED。
- [ ] 兩個 signals 共用同一 `itemId`：刪第一個時保留 session item 與 signal tags。
- [ ] 刪最後 reference：移除 session item，並只在此時刪該 `itemId` 的 signal tags。
- [ ] 現有 product signal analysis deletion 保持一次且成功；其他 signal 的 analysis 不受影響。
- [ ] 明確 assertion：Topic audit evidence/memos/reports/episodes、saved analyses/comparisons 不因 signal delete 被刪。

**Implementation shape：**

- delete helper 由各 storage module 擁有，做窄的 read/filter/write，保留其他 owner records。
- `session-signal-seam` 統一呼叫 signal-owned delete helpers，讓 background 與 topic handler 不會分叉。
- `applySignalDeletionToGlobalState` 繼續決定 backing item 是否 orphan；background 只在 `removedItemId` 非 null 時刪 item-owned tags。
- 不掃 report prose、不重寫 audit history、不猜 saved comparison retention policy。

**Targeted verification：**

```bash
npx tsx --test tests/signal-reading.test.ts tests/product-agent-task-feedback.test.ts tests/topic-signal-reading-storage.test.ts tests/signal-tags-storage.test.ts tests/session-signal-seam.test.ts tests/topic-handlers.test.ts tests/background-behavior.test.ts
npm run typecheck
npm run storage:seam-guard
git diff --check
```

**Commit：** `bug fix: remove directly owned signal records`

---

## Task 5：整體驗證與 branch review

這一步不新增 production 行為、不另開 commit。

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
npm run bundle:guard
git diff --check
```

- [ ] 確認四個 commits 可獨立理解，沒有混入未追蹤 main artifacts。
- [ ] 由 fresh reviewer 檢查整個 `d5d08e2..HEAD`，只接受 correctness、regression、scope 與 missing-test finding。
- [ ] 確認 branch clean；不自行 merge/push/reload Chrome。
- [ ] 按 `superpowers:finishing-a-development-branch` 向使用者提供整合選項。
