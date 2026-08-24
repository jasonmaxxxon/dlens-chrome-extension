# Topic Audit Reconciliation and Failed-Crawl Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Reopen a Topic with current crawl inventory, retain an older Atlas as stale without rerunning it, and keep all-failed sources retryable.

**Architecture:** The shared topic/audit/get read boundary compares stored evidence with a complete current Topic/session inventory. A changed input deterministically rebuilds evidence only; memos, report, and episodes remain untouched. The conditional write shares the audit mutation queue so it cannot overwrite an Atlas that began while reconciliation was reading. The Topic viewmodel also classifies failed sources as crawlable.

**Tech Stack:** TypeScript, node:test, vite-node, Chrome extension storage.

## Global Constraints

- Use node_modules/.bin/vite-node --script for focused tests; do not invoke pnpm exec, install packages, or change lockfiles.
- topic/audit/get must not call a model provider, runAuditPipeline, or overwrite memos, reports, or episodes.
- Skip reconciliation while an audit run is running.
- Infer model identity from persisted report/memos before calculating inputHash; unknown is a last fallback.
- Preserve unrelated worktree changes.

---

### Task 1: Regression-test current evidence reconciliation

**Files:**

- Modify: tests/topic-audit-handlers.test.ts

**Interfaces:**

- Consumes: handleTopicAuditMessage(storage, { message: { type: "topic/audit/get", topicId }, sessions }).
- Produces: refreshed auditEvidence only; existing auditMemos, auditReport, auditEpisodes stay equal.

- [x] **Step 1: Add the failing handler test after audit-run coverage**

~~~ts
test("topic audit get reconciles newly completed source evidence without rerunning or replacing the published audit", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", requestId: "seed-published-audit", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => makeEnvelope(stageName),
    model: "mock:model"
  });
  const evidenceBefore = await loadTopicAuditEvidence(storage, "topic-1");
  const memosBefore = await loadTopicAuditMemos(storage, "topic-1");
  const reportBefore = await loadTopicAuditReport(storage, "topic-1");
  const episodesBefore = await loadTopicAuditEpisodes(storage, "topic-1");

  const unchanged = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/get", topicId: "topic-1" }, sessions: [makeSession()]
  });
  assert.deepEqual(unchanged.auditEvidence, evidenceBefore);

  await saveTopic(storage, { ...makeTopic(), signalIds: ["signal-1", "signal-2", "signal-3"] });
  await storage.set({ "dlens:v1:signals": [makeSignal("signal-1", "item-1"), makeSignal("signal-2", "item-2"), makeSignal("signal-3", "item-3")] });
  const baseSession = makeSession();
  const currentSession = { ...baseSession, items: [...baseSession.items, makeItem("item-3", "op3", "第三篇成功採集貼文", "第三篇留言")] };
  let generationCalls = 0;
  const response = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/get", topicId: "topic-1" },
    sessions: [currentSession],
    generateEnvelope: async () => { generationCalls += 1; throw new Error("get 不可自動執行審查"); }
  });

  assert.deepEqual(response.auditEvidence?.map((packet) => packet.signalId), ["signal-1", "signal-2", "signal-3"]);
  assert.notEqual(response.auditEvidence?.[0]?.inputHash, evidenceBefore[0]?.inputHash);
  assert.deepEqual(response.auditMemos, memosBefore);
  assert.deepEqual(response.auditReport, reportBefore);
  assert.deepEqual(response.auditEpisodes, episodesBefore);
  assert.equal(generationCalls, 0);
  assert.deepEqual(response.auditValidatorFlags, []);
});
~~~

- [x] **Step 2: Verify RED**

Run: node_modules/.bin/vite-node --script tests/topic-audit-handlers.test.ts

Expected: three-source assertion fails because get returns only old evidence.

### Task 2: Reconcile only deterministic evidence at the get boundary

**Files:**

- Modify: src/state/topic-audit-handlers.ts:145-292,1436-1460
- Modify: src/state/topic-audit-storage.ts:225-258

**Interfaces:**

- Consumes: persisted artifacts, loadTopicById(topicId), options.sessions, current signals, persisted model, and the audit mutation queue.
- Produces: rebuilt EvidencePacket[] only for a complete changed input; never writes over a running audit.

- [x] **Step 1: Add narrow reconciliation and conditional-save helpers**

~~~ts
const model = auditReport?.model
  ?? auditMemos?.lensMemos.at(-1)?.model
  ?? auditMemos?.signalReadings.at(-1)?.model
  ?? "unknown";
const topic = await loadTopicById(storageArea, topicId);
const session = topic ? options.sessions.find((entry) => entry.id === topic.sessionId) : undefined;
if (!topic || !session || auditRunStatus?.state === "running") return auditEvidence;
const signals = await loadSignals(storageArea, session.id);
if (!hasCompleteTopicEvidenceInventory(topic, signals, session)) return auditEvidence;
const inputHash = buildInputHash(topic, signals, new Map(session.items.map((item) => [item.id, item])), model);
if (auditEvidence.length > 0 && auditEvidence.every((packet) => packet.inputHash === inputHash)) return auditEvidence;
const packets = await buildEvidence(storageArea, session, topic, "audit_" + inputHash.replace(/^topic-audit:/, ""), inputHash);
return await saveTopicAuditEvidenceUnlessRunActive(storageArea, topic.id, packets) ? packets : auditEvidence;
~~~

- [x] **Step 2: Call it from topic/audit/get and lock the partial/race cases with tests**

Return the reconciled auditEvidence and keep auditMemos, auditReport, auditEpisodes, auditRunStatus untouched.

- [x] **Step 3: Verify GREEN**

Run: node_modules/.bin/vite-node --script tests/topic-audit-handlers.test.ts

Expected: three packets return after the inventory change, source hash changes, stored Atlas stays unchanged, and generator calls remain zero.

### Task 3: Preserve retry for an all-failed source

**Files:**

- Modify: tests/topic-detail-viewmodel.test.ts
- Modify: src/viewmodel/topic-detail.ts:976-982

**Interfaces:**

- Consumes: buildTopicDetailViewModel with one succeeded and one failed source.
- Produces: sourceSession.kind === "needs_crawl" and failed === 1.

- [x] **Step 1: Add and correct the viewmodel fixture**

It includes buildSessionItem(packet.itemId, "succeeded") and buildSessionItem("failed-item", "failed"), so only failed is crawlable.

- [x] **Step 2: Verify RED**

Run: node_modules/.bin/vite-node --script tests/topic-detail-viewmodel.test.ts

Observed: sourceSession.kind is ready_to_generate rather than needs_crawl because crawlableCount omits failed.

- [x] **Step 3: Make the one-line correction**

~~~ts
crawlableCount: analysisCounts.saved + analysisCounts.missing + analysisCounts.failed,
~~~

- [x] **Step 4: Verify GREEN**

Run: node_modules/.bin/vite-node --script tests/topic-detail-viewmodel.test.ts

Expected: all viewmodel tests pass.

### Task 4: Integrate, publish, and inspect in Chrome

**Files:**

- Modify: src/state/topic-audit-handlers.ts
- Modify: src/state/topic-audit-storage.ts
- Modify: src/viewmodel/topic-detail.ts
- Modify: tests/topic-audit-handlers.test.ts
- Modify: tests/topic-detail-viewmodel.test.ts

- [x] **Step 1: Run focused tests, typecheck, and production build**

Run: node_modules/.bin/vite-node --script tests/topic-audit-handlers.test.ts; node_modules/.bin/vite-node --script tests/topic-detail-viewmodel.test.ts; node_modules/.bin/tsc --noEmit; node scripts/build-extension.mjs

Observed: handler 43/43, viewmodel 13/13, typecheck, and production build all exit 0. The remaining 150 vite-node test files passed; topic-audit-cache used Node transform-types because vite-node cannot resolve that test's variable dynamic import.

- [x] **Step 2: Reload the development extension and reopen the 失業 Topic**

Observed on a real Threads page: the backend recovered to reachable/idle, the current Topic inventory reconciled from 19 to 20, and a separate failed source surfaced as `重試 1 篇`. The older Atlas remained stale and reopening did not generate an Atlas.

- [ ] **Step 3: Stage only task-owned files**

~~~bash
git add src/state/topic-audit-handlers.ts src/viewmodel/topic-detail.ts tests/topic-audit-handlers.test.ts tests/topic-detail-viewmodel.test.ts docs/superpowers/plans/2026-08-24-topic-failed-crawl-retry.md
git commit -m "fix: reconcile topic crawl evidence"
~~~

Do not stage unrelated mockups, screenshots, or earlier plans.
