# Topic Detail export view — text density / structure TODOs

Date: 2026-06-22
Source: Jason reload 0.3.0 後第一手使用 feedback（real-Chrome reload path / topic = `topic_hdmtslkx_mowf6grp`「work」議題）
Status: planned — 尚未開 slice / 尚未派 Codex
Surface: Topic Detail 導出頁（toolbar = 複製引用 / 下載 Markdown / 下載 JSONL / 列印 PDF）
Baseline: 0.3.0（main @ `4ebb5b6`）
Pattern reference: Visual Reset A 已完成 Topic Detail audit rhythm（PR #63: SurfaceCard / SectionHeader framing + sage accent rail）— 但 **§-section 內 narrative 內文 render 是 raw LLM paragraph，Visual Reset A 沒動過**

## Why

PR #69 後 reload 0.3.0，發現 Topic Detail 8 個 § section 的長文內容仍是 raw 段落輸出 + 結構 bug：

- 內容 wall-of-text，缺視覺節奏
- §1 / §7 重複輸出
- §3 漏 placeholder
- numbered list 沒解析成 `<ol>`
- TOC 不區分 empty section
- inline source 引用沒跳轉 anchor

## Concrete issues（按優先序）

### P0 — 看起來像 bug，不像設計

**1. §1 整體 與 §7 編輯 verbatim 重複**

兩段都 render 同一份「1. 整體判讀…2. 共同用字…3. 風向/時間…4. Narrative Clusters…5. Audience Reaction…6. 缺席聲音/Outliers…7. Editorial Reading…」7 點 numbered list。

- 假設先排查：VM derivation collision（兩個欄位都映到同一個 narrative blob？）
- 若是 derivation bug → 進 `src/viewmodel/topic-detail.ts`
- 若是 render template 拉同一個 field → 進 `src/ui/TopicDetailView.tsx` 拆 §1 vs §7 的 source field

**2. §3 時間「尚未生成」漏 placeholder**

純字串 "尚未生成" leak 到 user view。

修法二選一：
- (a) empty section 整段隱藏 + TOC 連動隱藏（cleaner）
- (b) render proper empty-state card（"等待 N 則訊號累積後生成" 之類，更透明）

**3. Numbered list 沒換行**

`§1` / `§7` 內 `1. ... 2. ... 3. ... 4. ...` 全擠成一段。需要：

- 把 `\d+\.` 前綴解析成 `<ol>` semantic list
- 或至少 line-break + numbered prefix 視覺化

### P1 — 內容密度 / 視覺節奏

**4. §-section 長段落 wall-of-text**

§2 詞群 / §4 敘事 / §5 受眾 / §6 缺席 都是 60–100+ 字單段 Chinese 段落，無視覺切點。

候選改法（reuse 既有 primitives，不開新 token）：
- **第一句 callout**：每節第一個句點前的 topic sentence 改用 emphasis 或 italic-serif（reuse `QuoteBlock` 風格但 inline）
- **關鍵詞 chip strip**：把段落內的「請假」「供一世」「負債」「失業」「亞洲式」等被引號標出的詞 hoist 成頂部 chip 列（讀者一眼掃 keyword）
- **內聯 pull quote**：把高張力句（如「亞洲人個腦到底諗乜？？」）抽成 `QuoteBlock` 視覺分塊

**5. §8 資料品質 fallback 英文字串**

"No validator flags" 應該改成：
- StatusDot 綠點 + 中文「資料品質檢查通過」
- 或 i18n 對齊 — 整頁中英混雜本身也是個小 bug

### P2 — Affordance / 導航

**6. TOC 不區分 empty section**

左 sticky TOC 顯示 §1–§8 一致樣式，§3 沒內容也沒視覺暗示（dim / strikethrough / 隱藏）。

**7. Inline `S2` / `S3` 引用沒連動 Sources 卡**

§-section 內文寫「S2 揭示了…」「S3 則將…」、底下 Sources 區有 `S2.0P` / `S3.0P` 卡，目前兩端沒 anchor link。

修法：inline `S2` / `S3` 變成 anchor hash link，跳到對應 Sources 卡。

## Out of scope（不可順便動）

- Visual Reset A marquee 區段 — Topic 的 SurfaceCard / SectionHeader / sage accent rail 已 locked by PR #63，不要回頭改 framing
- Topic VM 結構 derivation pipeline（除非 §1/§7 duplicate 真的是 VM bug，才允許 minimal fix）
- Backend / classifier / signal storage seam
- Token / shadow / palette 新增 — `src/ui/tokens.ts` 仍是 single source

## Suggested slice 順序（給未來派 Codex 用）

1. **Slice A (P0 三件)**: §1/§7 dedupe + §3 empty handling + numbered list 解析。屬於「修 bug + 修 placeholder leak」，diff 應該小、容易 ship、user 看得到改變
2. **Slice B (P1 視覺節奏)**: keyword chip + QuoteBlock pull quote + 第一句強調 + §8 StatusDot。靠 reuse 既有 primitives，無 token 新增
3. **Slice C (P2 affordance)**: TOC empty-state 標記 + inline S\d anchor link

每 slice 各自一 PR，承襲 Codex worktree 流。

## Pointer index

- Topic Detail render entry: [TopicDetailView.tsx](src/ui/TopicDetailView.tsx)
- Topic VM: [topic-detail.ts](src/viewmodel/topic-detail.ts)
- Shared primitives 可 reuse: `SurfaceCard` / `SectionHeader` / `QuoteBlock` / `StatusDot` / `EvidenceRow` in [components.tsx](src/ui/components.tsx)
- Design contract: [tokens.ts](src/ui/tokens.ts)
- PR #63（Topic audit rhythm 基線）: https://github.com/jasonmaxxxon/dlens-chrome-extension/pull/63
- 0.3.0 release note: [2026-06-18-0.3.0-release-note.md](docs/handoff/2026-06-18-0.3.0-release-note.md)
