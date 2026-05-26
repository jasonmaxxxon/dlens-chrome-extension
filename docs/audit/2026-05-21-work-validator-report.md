# Work Topic — Pass 7: Citation Validator

**日期：** 2026-05-21
**Stage：** P7 / 6+1（mechanical validation，only-flag）
**Input：** P0-P6（主要核對 P6 final report 對 P0 evidence）
**狀態：** 完成。發現 1 個 numerical error（須修）+ 2 個 unverified precise figures + 4 個 thin-evidence flags + 3 個 generalization flags

---

## Stage Contract

### Purpose
機械檢查 final report 的引用完整性。**只 flag 不重寫**——不把 unsupported claim 改寫成漂亮話，只標出來讓人類 / 上游 pass 決定。

### Checks
1. 每個 claim 有沒有 signal id citation
2. 有沒有引用不存在的 evidence（reply 不存在 / likes 數錯 / 引述與 P0 不符）
3. 數值算術是否正確
4. 哪些 claim 的 evidence 太薄（n=1 / top-3-only）
5. 哪些地方像 unsupported generalization
6. 哪些 negative claim 的 scope 被誇大（「零出現」是對全文還是對 captured evidence）

### Severity
- **[FAIL]** — 與 P0 矛盾 / 算術錯誤，必須修才能 citable
- **[WEAK]** — claim 成立但 evidence 比措辭薄，須降調或補資料
- **[SCOPE]** — claim 真確但 scope 應限定，措辭過寬
- **[OK-checked]** — 核對通過，記錄以證明已驗

---

## 1. Citation 核對通過（[OK-checked]）

逐條對照 P0，以下 P6 引用全部正確：

| P6 claim | P0 來源 | 核對 |
|----------|---------|------|
| S13.OP 16-20k + 40 個碩士申請 | S13.OP | ✓ 數字、引述一致 |
| S14.OP「辛苦左咁多年」「粗口」+ OP 4000 likes | S14.OP | ✓ |
| S12.R1 醫生 2900 likes + 三件事（飽和/內地護士/credential） | S12.R1 | ✓ 引述「(我係醫生)」「政府準備招聘更多內地護士」一致 |
| S12 OP 1500 / R1 2900「接近兩倍」 | S12 | ✓ 2900/1500 = 1.93x |
| S7 三條 reply 1600+964+673 | S7.R1/R2/R3 | ✓ sum = 3237 一致 |
| S10 R1 2200 + R2 1400 vs OP 788 | S10 | ✓ |
| S11.OP 渣打 4 年炒 8000 + Meta 8000 | S11.OP | ✓「未來4年...接近8,000人」「Meta...裁員8,000人」 |
| S5.R1 開業 50-70 萬 + 利潤 12-15% + Keeta 抽 28-30% | S5.R1 | ✓ 三個數字全部一致 |
| S13.R1「高級興趣班」309 likes | S13.R1 mfmf8611 | ✓ |
| S14.R1「Permanent head Damage」281 likes | S14.R1 dennis._.n | ✓ |
| S9.R1 結尾「最重要個職位規管...係咪？」為疑問句 | S9.R1 | ✓ 確為問號結尾 |
| S6.R2「老豆老母比嘅幾千萬碎銀」2 likes | S6.R2 kokorotrading | ✓ |
| S8 排除 R1(pinned) + R2(OP 自轉) | S8 | ✓ P6 §5 正確排除 |

**Top reply author 重複性檢查：** 逐一核對 15 篇全部 top reply authors（mprispa003 / manddddys / lau02051984 / kaka_inca / bizmarket.hk / kokorotrading / unknownduck_duck / winniefatpoon__ / jacko.488 / mkm2bby / kelvinfun2022 / diu_lookwhat7ar / vialaviida / hoyin.eth / sebastianium / edwardyftse / c_stevieg / mfmf8611 / e_is_missing_again / dennis._.n / liviakwan121），**無任何 author 跨 thread 重複**。P6 §6 第 4 點 claim 成立（在 top-3 reply 範圍內）。

---

## 2. [FAIL] — Numerical error ~~必須修~~ [已修 2026-05-21]

> **狀態更新：** P6 §3 已修——「約 1560」→「約 1950（n=4）」，「約 232」補標 n=9，並加入兩批統一的 unknown 處理法說明（不把 queued/unknown 當 0）。下方保留原 finding 作紀錄。

### 2.1 P6 §3「5/21 batch 平均 OP likes 約 1560」算術錯誤

**P6 §3 表格** 列「5/21 batch 平均 OP likes 約 1560」。

核對 P0：5/21 batch = S11-S15。OP likes：S11=400、S12=1500、S13=1900、S14=4000、S15=unknown(queued)。

- 若**排除 S15**（與 5/8 batch 排除 S7-unknown 的方法一致）：(400+1500+1900+4000)/4 = **1950**，不是 1560
- 1560 的來源是 **(400+1500+1900+4000+0)/5 = 1560**——即把 S15 當 0 likes 計入

**兩個問題：**
1. 數字錯（正確值 1950）
2. **方法不一致**：5/8 batch 平均 232 是排除 S7（unknown），但 5/21 batch 1560 把 S15（queued）當 0 計入。同一張表用兩種 unknown 處理法

**影響評估：** 方向性結論（5/21 batch traction 高一個數量級）不受影響——232 → 1950 仍是 ~8.4x。但**具體數字 1560 必須改為 1950，且方法須統一**（建議兩批都排除 unknown，並標 n=9 / n=4）。

**修法（不在此重寫，只指出）：** P6 §3 表格「約 1560」→「約 1950（n=4，排除 S15 queued）」；「約 232」應補標「n=9，排除 S7 likes 不可得」。

---

## 3. [WEAK] — Unverified precise figures

### 3.1「S9.R1 519 字」未經實際計數
P3 / P4 / P6 多處稱 `S9.R1` 為「519 字」。**這個精確字數從未被實際計算**——P0 只記錄 R1 全文，沒有 char count。R1 確實是長篇（明顯超過其他 reply），但「519」是被沿用的未驗證精確數。
**建議：** 改為「長篇（約 500 字級）」或實際 count。不可宣稱精確數。

### 3.2「S5.R1 415 字」未經實際計數
同 3.1。P1 / P2 / P3 稱 `S5.R1`「415 字」，未實際計數。
**建議：** 改為「約 400 字級」或實際 count。

> 注：3.1 + 3.2 都不影響任何結論（兩條 reply 確實是 outlier 長度），但精確數字是 fabricated precision，違反 evidence-bound 原則。

---

## 4. [WEAK] — Thin evidence（claim 成立但 evidence 比措辭薄）

### 4.1 P6 §6 + §7「成功敘事是 active suppression（系統性）」rests on n=1
「active suppression 不是 passive absence」是 P5/P6 的強 claim，但**完全 rest on `S6` 單一訊號**（+ `S6.R2` 單一 reply）。從 1 個 success signal 推論「這個生態系統性撤銷成功敘事的信用」是 n=1 generalization。
**現狀：** P6 §7 用「系統性地缺乏」「一講出口就被解讀為偽裝或繼承」這種 pattern 語氣。
**建議降調：** claim 應限定為「唯一出現的成功敘事（S6）被 self-undercut + reader 諷刺」，不宣稱系統性 pattern。標 [中] 不是 [強]。P5 §6.2 原標 [強]——validator 認為應降為 [中]（n=1）。

### 4.2 P6 §7「說自己輸可信，說自己贏可疑」asymmetry claim
這個 aphorism rest on：(a) `S6` 成功被質疑（n=1）；(b) P4 §2.4「沒有 reader 質疑 OP 悲觀 self-report」（top-3-reply-level negative）。兩個 leg 都薄——(a) 是 n=1，(b) 是 absence-of-counterexample。
**建議：** 保留為 observation 但標明 evidence 基礎（n=1 success + top-3 absence），不宜作為 report 的 headline 命題。

### 4.3 P6 §6「中間層缺席」第 4 leg（reader pool 不成 community）的 scope
P6 §6 / §7 用「連讀者群本身都不結成 community」支撐 structural absence。此 claim 已在 §1 核對為真——**但僅限 top-3 reply**。全 comment thread（S10 有 230 留言、S12 有 201 留言）裡是否有重複 commenter，本 sample 無資料。
**現狀：** P5 已 hook、P6 §附錄限制 4 已標。Validator 確認 P6 措辭（「top reply authors 完全沒重複」）正確，但 §7 prose「連讀者群本身都不結成 community」**略過了 top-3 限制**，讀起來像對全 reader pool 的斷言。
**建議：** §7 該句須補「（就 top reply 可見範圍）」。

### 4.4 P6 §3 平均 likes 的 S7 排除未標示
§3「5/8 平均 232」排除了 `S7`（OP likes 不可得），但表格未標示這個排除。讀者會以為是 10 篇全計。
**建議：** 標 n=9。（與 2.1 的方法統一一併修。）

---

## 5. [SCOPE] — Negative claim 的範圍須限定

### 5.1「希望」零出現 — scope 限於 captured evidence
P6 §2 + §7「『希望』這個詞...一次都沒有出現」。核對 P0：captured 的 OP snippets + top-3 replies 中確實無「希望」。**但 P0 的 opText 對部分訊號是 snippet（如 S7 被截斷、S4 有不可得 Spoiler、S5.R1 等長 reply 是節錄判斷），且 top-3 reply 不是全 thread。**
**裁定：** claim 對 captured evidence 為真，但不能宣稱「整個 discourse 零出現」。
**建議：** 措辭改為「在 captured 的 OP 與 top reply 中零出現」。

### 5.2「集體 / 制度 vocabulary 零出現」— 同 5.1
P2 §6.2 + P6 §6「工會 / 罷工 / 修法零出現」。同樣限於 captured evidence（snippets + top-3）。方向性強（converging across passes），但 scope 須限定。
**建議：** 保留結論，措辭限定到 captured evidence。

### 5.3「擴張 vocabulary 集中在唯一被質疑訊號」— 措辭精確度
P2 §6.4 + P6 §2「整個 audit 的擴張詞集中在唯一被質疑的訊號（S6）」。核對：S6 確是唯一含「夢想/努力/奮鬥」的訊號。但「上車/翻身/升職」這類詞是**全部缺席**（連 S6 都沒有），不是「集中在 S6」。
**裁定：** claim 須拆兩半——(a)「夢想/努力/奮鬥」集中在 S6（真）；(b)「上車/翻身/升職/機會/前景」全部缺席（真，且連 S6 也無）。P6 現措辭把兩者混為「擴張詞集中在 S6」，略不精確。
**建議：** 區分「出現但被質疑的擴張詞（S6 的夢想/努力）」vs「完全缺席的擴張詞（上車/翻身等）」。

---

## 6. Evidence-gap 確認（S4 / S9 / S15）

P0 標記的三處 evidence-gap，核對 P6 是否正確處理：

| Gap | P6 處理 | 裁定 |
|-----|---------|------|
| S15 queued 無 reply | §5 標「覆蓋 14/15」、§6 [中] 級不涵蓋 S15、附錄限制 3 明列 | ✓ 正確 |
| S4 Spoiler 圖不可得 | §6 outlier 標「drift 是 reader-driven 還是 visual-driven 不可判定」 | ✓ 正確 |
| S9 CTgoodjobs 原帖不可得 | P6 未在 final 提及原帖內容——未做 unsupported 補完 | ✓ 正確（無 fabrication） |

**無 fabricated evidence**：P6 沒有引用任何 P0 不存在的 reply、沒有編造 likes 數、沒有補完不可得的 visual / 原帖內容。

---

## 7. [WEAK] — §5 audience「≥1000 likes 全屬動作型」的支撐括號

P6 §5「所有 ≥1000 likes 的 reply 都屬於 reframe / disqualify / actionable / coined 詞四類：S7 的集體 reframe（1600+964+673）...」

核對：實際 ≥1000 的 reply 只有 4 條——`S7.R1`(1600)、`S10.R1`(2200)、`S10.R2`(1400)、`S12.R1`(2900)。`S7.R2`(964) 與 `S7.R3`(673) **<1000**。
**裁定：** 主 claim（4 條 ≥1000 全是動作型）為真。但支撐括號「（1600+964+673）」把 <1000 的 R2/R3 列在「≥1000」claim 下，造成混淆。
**建議：** 括號應只列 `S7.R1`(1600)，或改述為「S7 reframe 的 top reply 1600」。

---

## 8. 總裁定

### 必須修才能 citable（[FAIL]）
1. ~~**§3「1560」→「1950」**，並統一 unknown 處理方法（兩批都排除 unknown，標 n）~~ **[已修 2026-05-21]** — P6 §3 已改為 232(n=9) / 1950(n=4)，加入統一 unknown 處理法說明

### 須降調 / 限定（[WEAK] / [SCOPE]，不阻 citable 但影響可信度）
2. §6.2「active suppression 系統性」降為 [中]（n=1）——3.1 + 4.1
3. §7「說自己輸可信說自己贏可疑」標明 n=1 + top-3 基礎——4.2
4. §7「讀者群不結成 community」補「就 top reply 可見範圍」——4.3
5. 「519 字」「415 字」改為「約 X 字級」或實際 count——3.1 + 3.2
6. 「希望零出現」「集體 vocabulary 零出現」限定到 captured evidence——5.1 + 5.2
7. 「擴張詞集中在 S6」拆為「出現但被質疑」vs「完全缺席」兩類——5.3
8. §5 ≥1000 likes 括號移除 <1000 的 964/673——7

### 結構性肯定
- **無 fabricated evidence**——所有引用的 reply / likes / 引述都在 P0 中存在且一致（§1 全表 + §6）
- **核心結論（消失的中間層）的四層 converging evidence 全部核對通過**，且 platform-affordance alternative explanation 已保留——這個 finding 在修正上述項目後 citable
- **evidence-strength 分級在 P5 嚴格、在 P6 §6 沿用**——主要 leak 在 P6 §7 prose（編輯閱讀為了流暢度弱化了 hedge），這是 §7 的固有張力（prose 要 readable vs claim 要 hedged），上述 4.1-4.3 + 5.x 是針對這個 leak

### Pipeline 健康度
這套 free-reading pipeline 的**最大失誤是一個算術錯誤（1560）**，不是判讀錯誤——所有判讀層的 claim 都有 evidence 支撐，沒有 hallucinated source。失誤類型集中在 (a) 沿用未驗證精確數（字數），(b) prose 層為流暢度弱化 hedge。**這兩類都是 mechanical 可抓的**，證明「structured evidence + free reading + citation validator」的分工有效：自由判讀沒有產生 slop，validator 抓到的是數字與 scope，不是虛構。

---

## Pipeline 完成

P0 evidence → P1 readings → P2 lexicon → P3 narrative → P4 audience → P5 absence → P6 final → **P7 validator（此份）**。

全部 8 份檔案在 `docs/audit/2026-05-21-work-*`。下一步由人類決定：是否依 §8 修正清單回修 P6，或直接拿這套 trace 反推 prompt / minimal schema。
