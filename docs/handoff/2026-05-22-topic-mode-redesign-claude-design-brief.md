# Claude Design Brief — Topic Mode Redesign (v3)

**日期：** 2026-05-22
**目標：** 重新設計整個 topic mode，把「議題審查報告」變成核心。沿用 v2 warm-paper 視覺系統，重排 IA。
**視覺系統來源：** `dlens claude design frontend/`（shell.jsx / views-topic.jsx / theme-layer.jsx）——**繼承不重畫**
**內容 fixtures（真實，不要 lorem ipsum）：**
- 源清單 + OP/留言：`docs/audit/2026-05-21-work-pass0-evidence.md`、`docs/audit/2026-05-22-love-pass0-evidence.md`
- 報告 7 節內容：`docs/audit/2026-05-21-work-audit-final.md`、`docs/audit/2026-05-22-love-audit-final.md`
- 資料品質 flags：`docs/audit/2026-05-21-work-validator-report.md`

---

## 0. 設計哲學（一句話）

**popup = 掃描 / triage，全頁 = 深讀。** 兩個 surface 分工清楚：popup 讓人快速看一個議題收了什麼、長什麼形狀；報告是研究式長文，展開成全頁讀 + 匯出。

---

## 1. 視覺系統（繼承 v2，不要動）

- 800×600 popup，warm-paper（`#faf9f5` bg）、Noto Serif TC headings、左 64px rail + 56px header + 內容 736×544
- 全頁報告 surface 用同一套 palette / type / 紙感，但寬度放開（max ~880px 文欄，置中，留白）
- theme-layer 的 palette/density/voice 微調保留

---

## 2. IA（新，3 tab）

```
rail：採集 / 議題 / 設定   ← 只有三個
                                （砍掉 收件匣、脈絡、top-level 比較）

議題 (Topics list)
  └→ Topic Detail（popup 內）
        └→ 議題審查報告（全頁/新分頁）   ← 新核心
        └→ Signal Detail（drawer，單篇判讀從清單移出）
```

**明確移除（不要設計這些）：** 收件匣、脈絡、top-level 比較、Topic Detail 的「補充描述」「研究問題」兩個 textarea。

---

## 3. Surface A：Popup（800×600，掃描/triage）

### 3.1 議題 list
- topic 卡片：名稱（Noto Serif TC）+ 三個 stat chip（X 訊號 / Y 已分析 / 報告狀態：未生成・已生成・生成中）
- 用 work（15 訊號）+ love（9 訊號）當兩張真實卡片

### 3.2 Topic Detail（popup 內，這是重做重點）
由上到下四塊：
1. **總覽 header**：議題名 + 計數（訊號/已分析/報告狀態）+「生成議題審查報告」主 CTA（已生成則變「開啟報告 →」+「重新生成」）
2. **Theme chips（4-8 個 broad）**：粗粒度主題，不是現在那種 60+ 個一次性 tag。
   - work fixtures 範例：`職場焦慮` `學歷貶值` `AI 取代` `求職市場` `外勞政策` `世代差異`
   - love fixtures 範例：`交友軟體` `擇偶價值觀` `兩性對立` `情緒/認命` `單身自由`
3. **Narrative lanes（3-5 條）**：每條一句話 + 訊號數 + consensus 小標記。比 tag cloud 有用得多。
   - work fixtures：`投入不再兌現`(S7/S13/S14) `每條出路同步自證偽`(S5/S12/S15) `經營體面/隱藏實情`(S2/S7/S12) `把矛頭指向系統但不指方向`(S8/S9/S11)
   - love fixtures：`戀愛被當成市場/算術`(S2/S3/S7) `價值對撞:理想vs市場現實`(S3/S4/S7) `平台作為敵人+退場`(S1/S9) `正面敘事被擁抱`(S6)
4. **Dense source list**：每篇一行——標題/gist（一句）+ 2-3 個 broad tag + status pill + actions（`查看原文 ↗`、`打開判讀`）。
   - **絕對不要**把長判讀塞進 list（現在的醜就是這樣來的）。判讀進 drawer。
   - 用 work/love pass0 的真實 OP 內容當每一行（粵語原文）

### 3.3 Signal Detail（drawer 從右滑入）
單篇深讀：OP 全文 + top replies（含 likes）+ 該篇的 free reading（從 P1 signal-readings 抽真實一段）+ 該篇 broad tags。

### 3.4 採集 / 設定
維持 v2 既有設計，**只把 rail 從 6 項改 3 項**。設定移除無用欄位。

---

## 4. Surface B：全頁報告（新核心，重點設計）

點 Topic Detail 的「生成報告」→ 全頁/新分頁開啟。

### 4.1 結構
- **左側 section nav（sticky）**：7 節錨點——整體判讀 / 共同用字 / 風向 / 敘事 / 觀眾反應 / 缺席聲音 / 編輯判讀
- **主欄（max ~880px）**：報告 prose，warm-paper 紙感、serif 標題、舒適行距。**直接用 work-audit-final.md 的真實 7 節內容排版**
- **頂部 meta bar**：議題名 + 覆蓋率（如「15/15」「9/9，S2 不可得」）+ 生成時間 + 匯出鈕
- **citation 呈現**：內文的 `S7.OP` / `S12.R1` 做成可 hover/點的 ref，回跳源清單（像學術引用上標）
- **資料品質區（subtle）**：validator flags 收在一個可展開的「資料品質」note，不搶主文（用 work-validator-report 的真實 flags 當範例：覆蓋率、evidence-strength 分級、gap≠absence）

### 4.2 生成中狀態（重要）
報告是 6 個 LLM pass 串跑（P1-P6），很長。要設計 **stage 進度**：
- 逐 stage 點亮：讀訊號 → 詞彙 → 敘事 → 觀眾反應 → 缺席 → 編輯合成
- 每個 stage 完成可先顯示該節（progressive reveal），不要全部 spinner 等到底

### 4.3 §7 編輯判讀的排版
這是報告的 payoff（最長、最重要的 prose）。給它最好的排版——可能大字、引言式留白。用 work-audit-final §7 那段真實內容（「…它能說清楚每一種輸法，卻沒有詞、沒有人、沒有時態去說『我們可以一起怎樣』…」）當設計樣本。

---

## 5. What NOT to do（紅線）

- 不要設計 收件匣 / 脈絡 / top-level 比較
- 不要在 source list 裡塞長判讀（判讀進 drawer / 全頁報告）
- 不要用 60+ 個一次性 fine tag；首屏只放 4-8 個 broad theme
- 不要 lorem ipsum——**所有內容用 work/love 的真實粵語 fixtures**
- 不要把 7 節報告硬塞進 800×600 popup（報告是全頁）
- 不要重畫 warm-paper 視覺系統（繼承 v2）
- 不要設計 enum 式的 audience tag UI（報告是 prose；audience 反應是文字敘述不是 chip）

---

## 6. 交付

在 `dlens claude design frontend/` 既有 prototype 上：
- 改 `shell.jsx`：rail 3 項
- 重做 `views-topic.jsx`：議題 list + Topic Detail（4 塊）+ Signal drawer
- 新增 `views-audit-report.jsx`：全頁報告（section nav + 7 節 + meta bar + 生成進度 + 資料品質 note）
- `fixtures.jsx`：塞 work + love 的真實 EvidencePacket 源清單 + 兩份報告 7 節內容 + validator flags
- 全部 view 可點擊串起來（議題 list → detail → 報告 → 源 ref 回跳）

---

## 7. 與後端的對應（給設計者的 context，不用設計）

設計出來的東西對應已定的 schema（slice 1 已實作）：
- source list ← `EvidencePacket[]`
- Signal drawer 判讀 ← `SignalReading`
- theme chips / narrative lanes ← report 的 §2/§4（首屏靠 P3 `displayHints`）
- 全頁報告 7 節 ← `TopicAuditReport.sections`
- 資料品質 note ← P7 validator flags
- 生成進度 ← `topic/audit/run` 的 stage-by-stage（slice 2）

設計只需照 fixtures 排，後端 contract 已經對齊。
