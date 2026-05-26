# Claude Design Brief v2 — Topic Mode Redesign

**日期：** 2026-05-22
**v1 失敗了，這是 v2。** 看完這份再開工。
**v1 brief：** `2026-05-22-topic-mode-redesign-claude-design-brief.md`（保留作對照）
**v1 失敗的 3 張 mockup：** Claude Design 把 warm-paper 推成 newspaper 編輯版型——左側 accent strip + hairline 邊框 + dot bar consensus + flat 純色 pill CTA + monospace meta。**整體看起來像 2024 brutalist editorial，不是 2027 SaaS。**

---

## 0. 一句話定調

> **這是一個 modern 2027 SaaS panel，外觀帶 warm-paper 性格——但底層 chrome 是 lightweight / layered / rounded / elevated，不是 newspaper layout。**

warm-paper 是**調色盤 + 偶爾的 serif display**，**不是版型隱喻**。Linear / Vercel dashboard / Arc / Raycast 的 chrome，加上溫暖底色與選擇性 serif headlines——那個感覺。

---

## 1. Design Tokens（必須遵守，這次給死）

### 1.1 Corner Radius（圓角是「輕盈感」最直接的訊號）
```
xs   8px   chips、small pills、icon buttons
sm   12px  inputs、secondary buttons
md   16px  card content、drawer panels
lg   20px  primary surfaces（topic cards、narrative lanes、report meta bar）
xl   24px  report 全頁主欄
full 999px status dots、avatars
```

### 1.2 Elevation（用 shadow + tint 做層次，**不用 hairline 邊框**）
```
warm-shadow base: rgba(82, 72, 52, 0.xx)  ← 暖灰咖啡而非純黑

0: flat              — 只用於 disabled / inactive
1: resting card      box-shadow: 0 1px 2px rgba(82,72,52,0.04), 0 1px 1px rgba(82,72,52,0.03)
2: hover / active    box-shadow: 0 4px 12px rgba(82,72,52,0.06), 0 2px 4px rgba(82,72,52,0.04)
3: floating          box-shadow: 0 8px 24px rgba(82,72,52,0.08), 0 4px 8px rgba(82,72,52,0.06)
                     用於 drawer、modal、CTA hover
```
**Hover transition：** `transform: translateY(-1px)` + 升一級 elevation，180ms ease-out。

### 1.3 Surface Tints（用 tint 分層，不用 border）
```
bg base                #faf9f5   warm paper
surface raised         #ffffff   card 在 bg 上
surface tinted soft    #f5efe0   narrative lane 卡片背景（比 bg 暖一點點）
surface accent soft    rgba(54, 90, 70, 0.05)   active/selected 狀態
surface accent strong  rgba(54, 90, 70, 0.10)   chip hover
divider (very sparing) rgba(82, 72, 52, 0.08)   只有 shadow 無法分隔時才用，且絕對不疊 box
```

### 1.4 Color Palette
```
ink primary       #2A2823   warm near-black（標題、正文）
ink soft          #5C574E   warm gray-brown（meta、副資訊）
ink muted         #8B8478   placeholder、disabled label

accent forest     #365A46   brand + primary CTA
accent ember      #B57438   warning / coverage badge（暖橘，不要紅）
accent sage       #6B8E7D   muted success
accent rose       #B96A6A   error，稀少使用
```

### 1.5 Button Language（這次必須有差異）
```
PRIMARY（如「開啟審查報告」、「生成報告」）
  background: linear-gradient(180deg, #3D5E47 0%, #2F4D38 100%)
  text: #ffffff
  radius: 14px
  padding: 12px 20px
  box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset,
              0 4px 12px rgba(54,90,70,0.24),
              0 1px 2px rgba(54,90,70,0.16)
  hover: lift -1px + 更亮的 gradient (3% lighter top stop) + shadow 升級
  ← 必須有 depth + inner highlight + raised shadow

SECONDARY（如「重新生成」、「查看原文」）
  background: rgba(54, 90, 70, 0.06)
  text: #365A46
  radius: 14px
  border: none
  hover: bg → rgba(54, 90, 70, 0.10)，subtle lift

TERTIARY / LINK
  text only + 0.5px underline on hover
  color: #365A46

ICON BUTTON
  36×36，radius 12px，ghost bg，hover → surface tinted soft
```

### 1.6 Typography
```
DISPLAY (serif，極少用)
  font: "Noto Serif TC", serif
  sizes: 32 / 40 / 48 px
  uses: topic name、report § titles、hero number
  ← 不要把 serif 用在 nav / breadcrumbs / chip / meta

BODY (sans，主力)
  font: Inter / Geist / -apple-system, system-ui
  sizes: 14 / 16 / 18 px
  line-height: 1.6
  weights: 400 regular、500 medium、600 semibold

META / LABEL
  font: same sans
  sizes: 11 / 12 / 13 px
  letter-spacing: 0.01em
  color: ink soft

MONOSPACE — only for code / structured data / signal IDs（S2.OP / S7.R1）
  font: ui-monospace, JetBrains Mono
  ← v1 把 "topic / work · 採集 5/8" 寫成 mono 是錯的，那是 meta 不是 code
```

### 1.7 Spacing Scale
```
4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64
卡片之間最少 12-16px；section 之間 24-32px；section title 與內容之間 16-20px
```

---

## 2. 紅線：v1 出現的、絕對不要再出現的 2024 patterns

| ❌ Don't | ✅ Do |
|---|---|
| 卡片左邊 vertical accent strip（綠條） | 整張卡靠 elevation + 圓角分層；accent 改用左上角小 badge 或 hover ring |
| 1px hairline border 當主要 chrome | shadow + tint 分層；border 只在 shadow 無解時用且 < 8% opacity |
| Dot bar consensus（`●●●●○`） | 橫向 soft gradient bar、或 tinted tag「強共識 / 共鳴 / 分歧」 |
| Flat 純色 pill primary CTA | gradient + inner highlight + raised shadow，明顯比 secondary 重 |
| Type-only outline chip | soft-filled pill（淡 tinted bg），hover 加深 tint + micro 縮放 |
| Monospace 用在 nav / meta / breadcrumb | sans body 配 small caps tracking；mono 只留給 signal id 與 code |
| 「VOL.1 NO.03 · TOPIC」雜誌刊號 masthead | 簡單 brand mark + 議題 mode pill；不要 cosplay 雜誌 |
| Source list 用 table row 堆疊 | feed item with hover lift + tint variation by status |
| Narrative lanes 緊貼著疊 + box outline | 每條 lane 是 soft-tinted card，間距 12-16px，無 border |
| 全部 surface 都是純白 + 純底色 | 用 tint scale 做出 3 層 depth（base / raised / tinted） |

---

## 3. 視覺 reference（描述風格，不用上網查）

想像這幾種感覺**混在一起**：

- **Linear inspector panel**：右側 detail drawer 的 rounded、layered、soft-shadow，hover 有 micro-interaction
- **Vercel dashboard（2026 改版後）**：warm gray、subtle elevation、card 之間有透氣感、primary CTA 帶 gradient depth
- **Arc Browser sidebar**：每個 group 是 soft-tinted rounded container，不靠線靠 tint
- **Raycast settings**：chip / pill 的 soft-fill 質感、按鈕的層次

加上：
- **少量** Notion / Things 3 的 warm cream 底色性格
- **選擇性** Noto Serif TC display 在 hero moments（議題名、報告 §7 標題）

**不是：**
- ❌ IA Writer / Are.na（太 editorial）
- ❌ Substack / Medium（太 reading-app）
- ❌ Stripe Atlas / Linear 早期 brutalist（太硬線條）

---

## 4. IA & Surfaces（從 v1 沿用，未變）

```
rail：採集 / 議題 / 設定   ← 只有三個

議題 (Topics list)
  └→ Topic Detail（popup 內）
        └→ 議題審查報告（全頁/新分頁）   ← 新核心，深讀
        └→ Signal Detail（drawer）
```

**Popup = 800×600 掃描/triage；全頁 = 報告深讀 + 匯出。**

---

## 5. Per-View 視覺處置（IA 結構不變，這節只講「怎麼看起來」）

### 5.1 議題 list（Surface A，popup）
每個 topic 一張 raised card（elevation 1，hover → 2）：
- **左上：** 議題名（Noto Serif TC display，32px，`ink primary`）+ 一個 mode pill「topic」(soft-fill chip)
- **右上：** primary CTA「開啟審查報告」（已生成）或「生成報告」（未生成），有 gradient + raised shadow
- **下方 stat row：** 用大字數字 + 小 label 並排，**不是 table 也不是 strip**——像 Vercel dashboard 的 metric row
  - 例：`15` 訊號 ／ `14/15` 已分析 ／ status dot + 「報告 已生成」
- **無 border、無 vertical strip。** 卡片整體 radius `lg` (20px)，hover lift -1px

頁頂 section header：「議題」display + 副標 + 右上角 active count——不要 masthead。

「+ 建立新議題」是 ghost button，dashed soft outline 8% opacity + radius `md`，hover → tinted。

### 5.2 Topic Detail（Surface A，popup）
從上到下四塊，**每塊之間 24-32px 透氣**：

1. **Overview header card**（elevation 2，radius `lg`）
   - 議題名 display + mode pill
   - stat row（同議題 list 的處理）
   - 右上一組按鈕：PRIMARY「開啟審查報告」+ SECONDARY「重新生成」並排，**視覺重量差異明顯**
   - 報告 meta（覆蓋率 / 生成時間）放底部，small caps meta type

2. **Theme chips section**（soft-tinted background area，無 box）
   - section label「主題」+ 計數 small pill
   - 4-8 個 broad theme chip——soft-fill pill（accent forest 5% tint bg + forest text），hover → 10% tint + micro 縮放
   - chips 間距 8px，wrap to 2 lines OK

3. **Narrative lanes section**（這節最重要的重做）
   - section label「敘事線」+ 計數
   - 每條 lane 是**獨立 soft-tinted card**（surface tinted soft bg，radius `md`，**無 border**，elevation 1）
   - lane 結構：
     - 左側：lane number 用 small caps `N1` 或 serif numeral 32px
     - 中間：標題（serif 18-20px）+ 一句說明（sans 14px ink soft）+ 訊號 ID chips（mono small，`S7` / `S13` 用 soft-fill）
     - 右側：**共識強度用 horizontal soft gradient bar**（0-100% 漸層填充，warm tinted）+ 文字 label「強共識 / 共鳴 / 分歧 / 反駁」——**不要 dot bar**
   - lanes 之間 gap 12-16px，hover lift

4. **Source list section**
   - section label「源清單」+ 計數
   - 每篇是 **feed item**（非 table row）：raised card elevation 1，padding 16px，radius `md`，hover lift to elevation 2
   - 內容：標題（serif 16px，1 行 ellipsis）+ gist 一句（sans 14px ink soft）+ chip row（status pill + 2-3 個 broad tag soft-fill）+ 右側 action group（`查看原文 ↗`、`打開判讀` ghost text buttons）
   - status pill 用 tint variation：已分析 = sage tint、queued = ember tint、failed = rose tint
   - **判讀本身不在 list 裡**，點「打開判讀」開 drawer

### 5.3 Signal Detail（Surface A，drawer 從右滑入）
- Drawer：右側 70% 寬，elevation 3，radius `md` on left edge，bg `#ffffff`，從右滑入 280ms cubic-bezier(0.4, 0, 0.2, 1)
- 頭部：signal id mono pill「S2」+ author handle + close icon button
- 正文：
  - **OP 全文 block**：soft-tinted card（cream bg），radius `md`，serif body 16px，引用感但**不是 newspaper quote box**
  - meta row：likes + comments + date + 「於 Threads ↗」link
  - **Top Replies section** label
  - 每條 reply：分離的 raised card elevation 1，radius `md`，author + likes 在頭、文字在下，**不要 numbered N/R/OP 三色分標籤**——讓 author handle + role pill（OP / 觀眾）做區分
- 整個 drawer 用 surface tint scale 分 OP / replies，不靠線

### 5.4 採集 / 設定（Surface A）
維持 v2 既有 view 結構，**只**：
- 把 rail 從 6 項改 3 項
- 套用本份 design token（卡片 / button / chip 全換成 v2 處置）
- 移除無用欄位（補充描述、研究問題）

### 5.5 全頁審查報告（Surface B，新分頁）
- 整體 layout：左側 sticky section nav 240px + 主欄 max 720-800px 置中 + 右側 32px breathing
- 整體 bg：warm paper base
- **頂部 meta bar**：raised card 跨頂部，elevation 2，radius `xl`，含議題名 display + 覆蓋率 chip（含 ember tint 若有 gap）+ 生成時間 meta + 匯出 button group（primary 樣式）。**不要 newspaper masthead**
- **左側 section nav**：7 節 + 「資料品質」第 8 項。每項是 ghost button 樣式，當前 section 高亮成 surface accent soft，hover 加深 tint，**radius `sm`，無 border**
- **主欄 prose**：
  - § title：serif display 32px
  - 段落：sans 17px line-height 1.7 ink primary
  - 引用標記 `S7.OP` / `S12.R1`：inline 小 chip，soft-fill mono 12px，hover bloom + tooltip 顯示該 ref 的 OP 全文，click 跳到「源清單」section 並 highlight 對應條目
  - 區塊引言（§7 編輯判讀的長段）：左側 4px accent forest soft tint（**這是僅有允許的左 strip**，且必須是 §7 prose 引言才用，不是卡片裝飾）+ italic display style
- **資料品質區（§8）**：可摺疊，預設摺起。展開顯示 validator flags 列表，每條 flag 用 severity color（FAIL = rose、WEAK = ember、SCOPE = sage）small chip + 描述
- **生成中狀態（progressive reveal）**：
  - 每個 § 是獨立 card 從上往下逐 stage 完成
  - 未完成的 § 顯示 skeleton（不是 spinner）——標題在、內容是 3-4 行 soft-tinted shimmer rectangles
  - 已完成 § 從 skeleton 320ms 淡入 + slide-up 8px
  - 左側 nav 同步點亮 stage 進度（已完成 = solid dot ink primary，進行中 = pulsing accent forest，未開始 = soft muted）

### 5.6 通用 micro-interactions（要做出來）
- 所有 card hover：lift -1px + shadow 升一級，180ms ease-out
- chip hover：tint bloom 1.02× scale，120ms ease-out
- primary CTA hover：top stop 變亮 3% + shadow 升級 + 2px lift，180ms
- section nav active：tint bg + 左側 2px 高亮 bar 從上滑入，220ms ease-in-out
- drawer 開啟：280ms cubic-bezier(0.4, 0, 0.2, 1)，bg overlay 從 0 fade to rgba(0,0,0,0.04)

---

## 6. Fixtures（真實內容，不要 lorem ipsum）

- 源清單 + OP/留言：`docs/audit/2026-05-21-work-pass0-evidence.md`、`docs/audit/2026-05-22-love-pass0-evidence.md`
- 報告 7 節：`docs/audit/2026-05-21-work-audit-final.md`、`docs/audit/2026-05-22-love-audit-final.md`
- validator flags：`docs/audit/2026-05-21-work-validator-report.md`

**用 work（15 訊號）+ love（9 訊號）當議題 list 的兩張卡片。** 直接用粵語原文，不要翻譯不要改寫。

---

## 7. 紅線總表（再講一次，給設計者）

絕對不要：
- ❌ 左 vertical accent strip on cards（§5.5 引言塊例外）
- ❌ 1px hairline border 當主視覺
- ❌ Dot bar 共識指示
- ❌ Flat 純色 pill primary CTA
- ❌ Monospace 用在 nav / meta / breadcrumb
- ❌ 「VOL.1 NO.03 · TOPIC」雜誌 masthead
- ❌ Source list 做成 table
- ❌ Lorem ipsum
- ❌ Lane 緊貼著疊 + box outline
- ❌ 把 serif 用在 chip / button / nav

絕對要：
- ✅ Radius `lg` (20px) on primary surfaces，無 hairline
- ✅ Elevation 分 3 層做 depth
- ✅ Primary CTA 必須有 gradient + inner highlight + raised shadow，**視覺重量明顯超過 secondary**
- ✅ Soft-fill chip（不是 outline）
- ✅ Hover lift on cards（-1px transform + shadow 升級）
- ✅ Sans body + 選擇性 serif display（hero moments only）
- ✅ §5.5 報告全頁的 progressive reveal（skeleton → fade-up）
- ✅ Citation chip `S7.OP` inline + tooltip + click 跳源清單

---

## 8. 交付

在 `dlens claude design frontend/` 既有 prototype 上：
- 改 `shell.jsx`：rail 3 項
- 重做 `views-topic.jsx`：議題 list + Topic Detail（4 塊，依本份 §5 處置）+ Signal drawer
- 新增 `views-audit-report.jsx`：全頁報告（依 §5.5）
- 新增 / 改 `theme-layer.jsx`：暴露本份 §1 的 design token（radius / elevation / color / type）讓所有 view 引用
- `fixtures.jsx`：塞 work + love 的真實 EvidencePacket 源清單 + 兩份報告 7 節內容 + validator flags
- 全部 view 可點擊串起來

---

## 9. 後端對應（context，不用設計）

- source list ← `EvidencePacket[]`
- Signal drawer 判讀 ← `SignalReading`
- theme chips / narrative lanes ← `TopicAuditReport.sections.lexicon/narratives` + P3 `displayHints`
- 報告 7 節 ← `TopicAuditReport.sections`
- 資料品質 ← P7 validator flags
- 生成進度 ← slice 2 的 stage-by-stage `topic/audit/run`
