# Audit Pipeline — Slice 3 Execution Handoff (UI mirror to MV3)

**日期：** 2026-05-23
**前置：** Slice 1 + 2 已完成並 push 到 `origin/codex/topic-audit-pipeline`
**Prototype（視覺 + 結構 source of truth）：** `local design-v3-functional-additions.zip` → `topic-redesign/`（user 已 approve）
**Spec：** `2026-05-22-audit-pipeline-prompt-spec.md`、`2026-05-22-topic-mode-redesign-claude-design-brief-v2.md`

> **Slice 3 = 把 prototype 鏡像進真實 MV3 extension code**。結構 + 視覺語言要 match prototype；後端 contract 已就位（slice 2 的 `topic/audit/*` messages）。**不重做 prompt 設計、不重做後端**。

---

## 0. Branch + scope

- branch 不變：`codex/topic-audit-pipeline`，繼續第三個 commit（s1+s2 已 commit）
- 開工前 `npm run typecheck` + 全測綠
- **只做 topic mode UI**。Product mode / Compare / PR Evidence 完全不碰

---

## 1. Prototype → MV3 component 對應表

| Prototype（`/tmp/dlens-design-v2/topic-redesign/`） | MV3（`src/ui/`） | 動作 |
|---|---|---|
| `popup-app.jsx` § TopicsListView + TopicCard | `TopicsListView.tsx`（新檔） | **新增** |
| `popup-app.jsx` § TopicDetailView + 4 blocks | `TopicDetailView.tsx`（既有，1528 行） | **重寫**——保留 PR evidence 模式相關區塊，重做 topic mode 那部分 |
| `popup-app.jsx` § OverviewHeader + ValidatorChip + RunningCTA | 收進 `TopicDetailView.tsx` 內 | 新 sub-component |
| `popup-app.jsx` § ThemeChip + NarrativeLane + SourceRow | 收進 `TopicDetailView.tsx` 或 `src/ui/topic-audit-components.tsx` | 新 sub-component |
| `popup-app.jsx` § SignalDrawer | `SignalDrawer.tsx`（新檔） | **新增** |
| `popup-app.jsx` § CollectView + UntriagedRow | `CollectView.tsx`（既有，rewrite 加 triage） | **擴寫**——保留現有 capture 邏輯，加未分流 list + multi-select |
| `popup-app.jsx` § Shell + LeftRail + Header | 對到既有 `InPageCollectorPopup.tsx` / `controller.tsx` | **調整 rail 為 3 項，視覺 polish** |
| `Audit Report.html` | `AuditReportView.tsx`（新檔，獨立全頁路由） | **新增** |
| `fixtures.js`（demo 資料） | 不 port——MV3 用真實 storage（slice 1+2） | **丟棄** |

**設計原則：** prototype 的 inline `style={}` 改成 token-based。所有顏色、shadow、radius 改用擴充後的 `src/ui/tokens.ts`（見 §3）。**不允許在 TSX 內 hardcode hex code**。

---

## 2. 路由 / IA 變更（`state/processing-state.ts` + `state/types.ts`）

### 2.1 ALLOWED_PAGES 更新
topic mode 從現在的多項收到 3 項：
```ts
ALLOWED_PAGES.topic = ['collect', 'topics', 'settings']  // 移除 inbox / library / casebook / compare
```
- **不刪除** `inbox/library/casebook/compare` page enum 與 view 檔——其他 mode（product/pr-evidence）可能還用
- 只是 topic mode 不再 allow 路由到這些 page

### 2.2 新 page enum
```ts
type PopupPage = ... | 'topics' | 'topic-detail' | 'audit-report'  // 後兩個是子頁
```
- `topics` = 議題 list（rail entry）
- `topic-detail` = 子頁（從 list 點入）
- `audit-report` = **獨立全頁路由**（不在 popup 800×600 內，開新 tab）

### 2.3 Audit Report 怎麼開
prototype 用 `window.open('Audit Report.html?t=...')`——MV3 對應：
```ts
chrome.tabs.create({ url: chrome.runtime.getURL('audit-report.html?topicId=...') })
```
- 在 `entrypoints/` 加 `audit-report.html` + `audit-report.tsx` entry（wxt 約定）
- 該 page mount `<AuditReportView topicId={...} />`，從 URL param 取 topicId
- 報告 page 讀同一個 `chrome.storage.local`（slice 1 的 storage keys）

---

## 3. Tokens 擴充（`src/ui/tokens.ts`）

現有 `tokens.ts` 用 **indigo accent**（`#1a2e4f`），prototype 用 **sage-forest accent**（`#3f5a3b`）。Topic mode 已決定走 sage（user approved）。

### 3.1 加 topic-mode 子 palette
不破壞既有 indigo（product mode 等可能還用）：
```ts
tokens.topicAccent = {
  primary:     '#3f5a3b',           // sage forest
  primaryDeep: '#324a30',
  primaryGlow: 'rgba(63,90,59,0.16)',
  tintSage:    '#e6ede2',
  tintSageHi:  '#dde7d6',
  warm:        '#a06a17',            // amber (running / warn)
  tintAmber:   '#fbe9c8',
  burnt:       '#b85a18',
  fail:        '#a8462e',            // failed state red
  failBg:      '#fbe2d4',
}
```

### 3.2 加共用 radius / shadow scale
```ts
tokens.radius = {
  xs: 8, sm: 12, button: 12, chip: 14, card: 16, cardLg: 20, xl: 24, pill: 999,
}
tokens.shadow = {
  card:      '0 1px 2px rgba(27,26,23,0.04), 0 4px 14px -4px rgba(27,26,23,0.07)',
  cardHover: '0 1px 2px rgba(27,26,23,0.05), 0 8px 22px -6px rgba(27,26,23,0.10)',
  drawer:    '0 12px 32px -8px rgba(27,26,23,0.14)',
  cta:       '0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 12px rgba(63,90,59,0.24), 0 1px 2px rgba(63,90,59,0.16)',
}
tokens.font = {
  serif: '"Noto Serif TC", "PingFang TC", "Songti TC", serif',
  sans:  '"Noto Sans TC", -apple-system, system-ui, sans-serif',
  mono:  '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
}
```

### 3.3 surface 命名對齊
prototype 的 `surface1 / surface2 / surface3 / tintSage / tintWarm` 對到 tokens.ts 的 `elevated / surface / contextSurface` 等——做一張 mapping 表寫進註解，不重複定義。

---

## 4. View-by-view 實作指引

### 4.1 `TopicsListView.tsx`（新）
照 prototype `TopicsListView` + `TopicCard`：
- 5 種 reportStatus：`none / running / ready / failed / stale`，每種對應的 status pill 樣式（見 prototype `statusMap`）
- 卡片：radius 20px、無 border、`SH.card` elevation、hover lift -1px + `SH.cardHover`
- Stat row：訊號數 / 已分析 / queued（big sans + small label）
- 「+ 建立新議題」ghost button（dashed soft outline）導去 `CollectView`

### 4.2 `TopicDetailView.tsx`（重寫 topic mode 部分）
4 個 block：
1. **OverviewHeader**：議題名 serif display + stat row + 主 CTA + ValidatorChip footer
2. **ThemeChips section**（hide 若 empty）：soft-fill chip，hover 加深 tint，click → filter 源清單
3. **NarrativeLanes section**（hide 若 empty）：soft-tinted card per lane + 訊號 ID chips + **horizontal soft gradient bar**（共識強度）+ click filter
4. **Source list**（hide 若 empty）：feed item with hover lift，每篇 status pill + 2-3 broad tag + 點開 SignalDrawer

State-aware：
- `failed` → 顯示「主題與敘事尚未產出 · 從 P{n} 續跑」灰卡，CTA「↻ 從 P{n} 續跑」+ failedReason footer
- `stale` → themes / lanes 帶 hint「基於舊版報告」+ CTA「重生報告」/「先看舊版 ↗」
- `running` → header 顯示 RunningCTA stage progress

### 4.3 `SignalDrawer.tsx`（新）
- 右側 drawer 70% 寬，`SH.drawer` elevation
- OP block（soft-tinted card）+ Top replies + 判讀（P1 free reading）+ 所屬主題
- **Reply role 處理**：`op_continuation` 用 deeper tint + amber `S#.OPC{n}` badge + italic + opacity 降 8%
- 若 audience reply = 0 + 有 OPC：底部 amber note「data-gap 不是 absence · long-tail commentCount = N」
- 從 slice 1 的 EvidencePacket.replyFragments 讀 role

### 4.4 `CollectView.tsx`（擴寫）
保留現有 capture entry，**加**未分流 triage：
- 「未分流」section：列出未入任何 topic 的 captured items
- 每行 checkbox + handle / time / snippet / 建議議題（從 signal-tags 既有 AI 出的 broad tag 抽 1-2 個）
- Sticky bottom action bar：「已選 N 篇 · 建立議題需要 ≥ 3」+「全選」+「建立議題」CTA
- 建立議題 → call 既有 `topic/create` message，把選中 itemIds 一次 push 進 signalIds

### 4.5 `AuditReportView.tsx`（新，獨立 entry）
照 `Audit Report.html` 的 7 節 + §8 validator + nav layout：
- 左側 sticky nav 240px：7 節 + 「資料品質」第 8 項
- 主欄 max 720-800px，serif § titles + sans body
- Citation `<span class="ref" data-ref="S7.OP">` 改成 React component，hover tooltip 顯示對應 OP，click → 跳源清單 anchor（同頁內，或 deep link 回 popup 的 drawer）
- 「複製引用」/「匯出 Markdown」按鈕（serialize sections + flags 成 markdown）
- 每節讀 `TopicAuditReport.sections.*`
- 資料品質 §8 讀 P7 validator flags（按 severity：FAIL=fail color、WEAK=amber、SCOPE=sage）
- 生成中 progressive reveal：未完成 section 顯示 skeleton shimmer（不是 spinner）

### 4.6 共用 sub-components
建議放 `src/ui/topic-audit-components.tsx`：
- `<PrimaryButton>` / `<GhostButton>`（用 tokens.shadow.cta）
- `<ValidatorChip v={ fail, weak, scope } topicId={} stale={?}>`
- `<NarrativeLane lane={} active={} onClick={}>`
- `<ThemeChip>` / `<SourceRow>`
- `<Dot>` / `<ChevronRight>` / `<ArrowUpRight>` icons

---

## 5. 資料 wiring（接 slice 2 messages）

新 `src/ui/useTopicAudit.ts` hook（或合進現有 useTopicState）：

```ts
useTopicAudit(topicId) {
  // 用 sendMessage wrappers
  buildEvidence: () => send({ type: 'topic/audit/build-evidence', sessionId, topicId })
  run: (fromStage?) => send({ type: 'topic/audit/run', sessionId, topicId, fromStage })
  get: () => send({ type: 'topic/audit/get', topicId })
  validate: () => send({ type: 'topic/audit/validate', topicId })
  clear: () => send({ type: 'topic/audit/clear', topicId })
  // running 時 poll get 每 2s 更新 stage
}
```

**Poll 策略：** topic 在 `running` 時，Topic Detail / Topics list 都應該 poll 一次 `get` 看 LensMemo 累積到哪個 stage，更新 UI。停 poll 條件：`reportStatus === 'ready' | 'failed'`。

**NarrativeLane / ThemeChip 資料來源：** 從 slice 1 的 `LensMemo.displayHints` 取（spec §5 要求 P3 builder 額外吐 `themeChips[]` + `narrativeLanes[]`）。**不從 prose parse**——若 displayHints 缺，UI 顯示「主題待 P3 完成」placeholder，不硬擠。

---

## 6. 不准碰的（守住第一、二刀的隔離）

- ❌ slice 1 的 `topic-audit.ts` / `topic-audit-prompts.ts` / `topic-audit-validator.ts` / `topic-audit-storage.ts`
- ❌ slice 2 的 `entrypoints/background.ts` 內 audit handler、`src/state/topic-audit-handlers.ts`
- ❌ `topic-signal-reading.ts` / `topic/synthesis/*` handler
- ❌ Product mode views（ProductSignalViews / PrEvidenceViews / Compare）
- ❌ `dlens:v0:global-state` / `signal-tags` storage

**唯一允許動的 state 層：** `state/processing-state.ts` 的 `ALLOWED_PAGES`、`state/types.ts` 的 `PopupPage` 加新 page、`tokens.ts` §3 擴充。

---

## 7. 測試（沿用既有 testing-library-react 模式）

寫到 `tests/`：
- `topics-list-view.test.tsx` — 5 種 status 各自渲染、CTA 觸發正確 message
- `topic-detail-view.test.tsx`（既有檔擴寫）— 4 block 依資料條件顯示/隱藏、theme/lane filter、failed/stale state 正確 UI
- `signal-drawer.test.tsx` — OP/OPC role 視覺正確、audience=0 + OPC>0 顯示 data-gap note
- `audit-report-view.test.tsx` — 7 節 render、citation click 跳 anchor、validator flags 按 severity 排序、export markdown 內容包含 signal id
- `collect-view.test.tsx`（既有檔擴寫）— 多選邏輯、≥3 才能建議題、建議題 dispatch 正確 message
- `validator-chip.test.tsx` — 計數正確顯示、stale 半透明、click → open audit report

**不測 prose 內容**（同 slice 1+2 紀律）。

---

## 8. Definition of done（slice 3）

- [ ] 5 個新/重寫 view 落地：TopicsList / TopicDetail / SignalDrawer / CollectView（擴寫）/ AuditReportView
- [ ] `audit-report.html` + entry 在 `entrypoints/`，wxt config 加新 entry
- [ ] `tokens.ts` 擴充：`topicAccent` / `radius` / `shadow` / `font`，**TSX 內無 hardcode hex**
- [ ] `ALLOWED_PAGES.topic = ['collect', 'topics', 'settings']`
- [ ] `useTopicAudit` hook + poll running 邏輯
- [ ] 5 種 audit state 視覺差異化（含 failed 續跑 + stale 重生 + ValidatorChip）
- [ ] OP_continuation drawer 視覺處理（amber tint + badge）
- [ ] CollectView 多選建議題 flow（≥3 訊號）
- [ ] `npm run typecheck` 綠、`npm run build` 綠、現有 tests 不退化
- [ ] 新測試全綠
- [ ] **手動 QA**：build → reload Chrome extension → 在真實 Threads 收 3+ 訊號 → 建議題 → 跑報告 → 看 7 節 + validator + citation 點擊

---

## 9. 端到端驗證（DoD 之後）

slice 1+2+3 端到端跑通就是 PR 上 main 的時機：

1. ✅ 採集 3+ 篇 Threads OP
2. ✅ CollectView 多選 → 建議題
3. ✅ Topic Detail 「生成報告」→ background 跑 P0-P6 + P7 → stage 進度即時顯示
4. ✅ 全頁報告開啟，7 節 + §8 validator + citation 都可互動
5. ✅ 修改一篇訊號 → topic 變 stale → 「重生報告」可用
6. ✅ 強制斷網跑報告 → failed state + 「從 P{n} 續跑」可用

通過後 → PR 6 commits（4 prior + slice 1 + slice 2 + slice 3）→ main。

---

## 附：prototype 視覺細節速查（給 Codex）

- canvas: `#f7f4ec`、surface raised: `#fdfbf6`、tinted: `#fbf8ef`、deeper: `#f3eedf`
- sage primary: `#3f5a3b` / deep: `#324a30`
- amber warm: `#a06a17` / tint: `#fbe9c8`
- fail: `#a8462e` / tint: `#fbe2d4`
- 主要 radius: card 20px、button 12px、chip 14px
- 主要 shadow: `0 1px 2px rgba(27,26,23,0.04), 0 4px 14px -4px rgba(27,26,23,0.07)`
- Hover lift: `transform: translateY(-1px)` + shadow 升級，180ms ease-out
- Display headlines 用 Noto Serif TC weight 700-900；其餘 sans
- Mono **只用** 在 signal id（`S2.OP` `S5.R1`）、coverage 數字、code

更多請直接讀 `/tmp/dlens-design-v2/topic-redesign/popup-app.jsx`——它是視覺 source of truth。
