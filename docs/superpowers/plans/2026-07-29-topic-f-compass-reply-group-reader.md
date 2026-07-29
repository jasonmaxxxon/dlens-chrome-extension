# Topic F Compass Reply Group Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one standalone interactive HTML mockup that preserves the current 民情羅盤 and opens a truthful reply-group deep reader from its bubbles and distribution rows.

**Architecture:** Keep the current four-pattern Atlas reference as the parent surface. A single local data object drives bubble selection, distribution selection, and a right-side drawer; only `行業悲觀與結構性焦慮` has a full evidence fixture, while the other patterns use bounded previews. All content, styles, and interactions remain inside one reference-only HTML file.

**Tech Stack:** Semantic HTML, CSS custom properties, inline SVG, vanilla JavaScript, Python Playwright for browser QA.

## Global Constraints

- Create only `docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html` plus QA screenshots under `output/playwright/`.
- Do not modify D, E, production source, package files, prompts, storage, manifest, or existing dirty files.
- Use the current four-pattern labels, counts, shares, and compass positions.
- Use only existing validated work-topic quotes and findings for the expanded fixture.
- Mark source quote, model interpretation, counterevidence, and missing context as different content types.
- Do not invent external factual claims, a complete parent tree, cross-audit group continuity, rankings, or a time slider.
- Keep the drawer single-column; no analysis tabs, second dashboard rail, or equal-weight card grid.
- Support 320px, 390px, 768px, and 1280px without horizontal overflow.
- Bubble and row selection must be keyboard-operable; Escape closes; focus enters and returns; controls are at least 44px.
- Respect `prefers-reduced-motion`.

---

### Task 1: Build the Compass and Deep-reader Artifact

**Files:**
- Create: `docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html`
- Reference: `docs/mockups/2026-07-18-atlas-l0-refit-C-refined.html`
- Reference: `docs/mockups/2026-07-28-topic-E-evidence-reader-hierarchy.html`
- Reference: `docs/superpowers/specs/2026-07-29-topic-f-compass-reply-group-reader-design.md`

**Interfaces:**
- Consumes: `PATTERNS`, keyed by `doom`, `pragmatic`, `moral`, and `satire`.
- Produces: DOM hooks `data-compass-bubble`, `data-distribution-row`, `data-reader-drawer`, `data-reader-kind`, `data-context-state`, and `data-sample-limits`.
- Produces: JavaScript functions `selectPattern(id, trigger)`, `openReader(trigger)`, `closeReader()`, and `renderReader(pattern)`.

- [ ] **Step 1: Verify the target is new**

Run:

```bash
test ! -e docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html
```

Expected: exit code `0`.

- [ ] **Step 2: Create the standalone semantic shell**

Use `apply_patch` to create a complete HTML document with:

```html
<main class="workspace" data-od-id="workspace">
  <header class="workspace-head">…</header>
  <section class="compass-card" aria-labelledby="compass-title" data-od-id="compass">
    <svg class="compass" viewBox="0 0 640 400" role="group">…</svg>
    <div class="distribution" role="list">…</div>
  </section>
</main>
<div class="scrim" data-reader-scrim hidden></div>
<aside class="reader" data-reader-drawer aria-modal="true" role="dialog" hidden>…</aside>
```

Define the existing four-pattern fixture exactly:

```js
const PATTERNS = [
  { id: "doom", label: "行業悲觀與結構性焦慮", count: 24, share: 31, x: 150, y: 300, r: 40, kind: "full" },
  { id: "pragmatic", label: "實用主義求職策略", count: 21, share: 27, x: 470, y: 275, r: 37, kind: "preview" },
  { id: "moral", label: "道德審判與階級歸因", count: 19, share: 24, x: 200, y: 215, r: 35, kind: "preview" },
  { id: "satire", label: "職場戲謔與表演性解構", count: 14, share: 18, x: 255, y: 105, r: 31, kind: "preview" }
];
```

Use the existing DLens glass-white, warm-ink, sage Topic accent, opaque reading rows, serif quote, sans chrome, and mono ref grammar. Do not introduce a second palette.

- [ ] **Step 3: Add the full evidence fixture**

The `doom` reader must contain:

```text
核心判讀
這組回覆把個別失業、低薪與轉行焦慮，重讀成跨行業的結構性收縮；「飽和」和「算帳」成為共同語言，但並非每個行業都接受同一種悲觀判斷。

共同 frame
個別困境被提升為行業問題。[S12.OP] [S13.OP]

跨 sector 的「飽和」
「以家已經供過於求、氾濫左」[S5.OP]
「keeta 又飽和」[S12.OP]
「千祈唔好讀護士，現在已經飽和」[S12.R1]

反例
「廢水而家開始變剛性需求咁 無話氾唔氾濫」[S5.R1]

算帳成為共同 reasoning
17k、1000 蚊、50–70 萬、15%、8000 人。[S10.OP] [S5.R1] [S11.OP]

同一 thread 的延伸
「全民整水喉？」[S11.OP]
「睇緊點考水電A牌」[S11.R1]
「結果整水喉都冇得做」[S11.R2]
```

Show `S11.R1` and `S11.R2` as sibling replies under the OP. Do not draw an arrow between them.

Add:

```text
父層回覆未能還原；以下留言按獨立文字閱讀，模型不補寫其對話對象。
```

for an evidence row whose parent is unavailable.

- [ ] **Step 4: Add tone, discourse, context, and limits**

Render one compact language section:

```text
詞彙：飽和、供過於求、算帳、整水喉
語氣／姿態：冷嘲、風險計算、結構性悲觀
discourse reading：個體與制度之間的中間層語言在本次 captured sample 中薄弱
```

Label the last two rows `模型從本批文字推導`.

Render the external-context state:

```text
尚未附加已核實外部來源。這次判讀只使用已捕捉的 Threads 文字。
可加入：官方原始文件、直接報道、分析／倡議、使用者備註、來源衝突狀態。
```

Render the reversal condition:

```text
如果更多獨立 thread 出現具體可行的中層回應，或 insider 反例在多個 sector 重現，便會削弱目前判讀。
```

Use a native `<details data-sample-limits>` for assignment count, unique-comment boundary, unresolved parent context, and model-derived tone/discourse.

- [ ] **Step 5: Implement selection, drawer, and focus behaviour**

Implement:

```js
function selectPattern(id, trigger) {
  selectedId = id;
  lastTrigger = trigger || document.querySelector(`[data-compass-bubble="${id}"]`);
  syncSelection();
  renderReader(PATTERNS.find((pattern) => pattern.id === id));
  openReader(lastTrigger);
}

function openReader(trigger) {
  lastTrigger = trigger || lastTrigger;
  drawer.hidden = false;
  scrim.hidden = false;
  requestAnimationFrame(() => document.documentElement.dataset.readerOpen = "true");
  drawerTitle.focus();
}

function closeReader() {
  delete document.documentElement.dataset.readerOpen;
  window.setTimeout(() => {
    drawer.hidden = true;
    scrim.hidden = true;
    lastTrigger?.focus();
  }, reduceMotion.matches ? 0 : 180);
}
```

Add click handlers to bubbles and rows, Enter/Space support for SVG bubble groups, Escape close, scrim close, close button, `aria-pressed`, and selected-state synchronization.

For preview patterns, render only label, count, existing Atlas description, and:

```text
這個 reference fixture 未附可解析 evidence refs；不以模型背景補寫詳細理由。
```

- [ ] **Step 6: Run static contract checks**

Run:

```bash
rg -n "行業悲觀與結構性焦慮|實用主義求職策略|道德審判與階級歸因|職場戲謔與表演性解構|共同 frame|S5\\.R1|S11\\.R2|父層回覆未能還原|尚未附加已核實外部來源|data-sample-limits|prefers-reduced-motion" docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html
```

Expected: every required contract appears.

Run:

```bash
rg -n "voice-03|NarrativeClaim\\.rationale|counterRefs|四次讀數|同批論調內排名|政府已證實|新聞證實" docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html
```

Expected: no matches, exit code `1`.

Run:

```bash
git diff --check -- docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html
```

Expected: no output.

### Task 2: Browser Verification and Review Artifacts

**Files:**
- Verify: `docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html`
- Create: `output/playwright/2026-07-29-topic-F-compass-reader-desktop.png`
- Create: `output/playwright/2026-07-29-topic-F-compass-reader-narrow.png`

**Interfaces:**
- Consumes: DOM hooks from Task 1.
- Produces: screenshots and measured QA results for overflow, target size, selection, focus, and drawer state.

- [ ] **Step 1: Start a bounded local server**

Run from the repo root:

```bash
python3 -m http.server 4173
```

Expected: server listens on `http://127.0.0.1:4173`.

- [ ] **Step 2: Verify desktop interaction**

Open:

```text
http://127.0.0.1:4173/docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html
```

At `1280×1100`, verify:

```js
document.documentElement.scrollWidth === document.documentElement.clientWidth
document.querySelector('[data-reader-drawer]').hidden === false
document.querySelector('[data-reader-kind]').dataset.readerKind === 'full'
document.querySelector('[data-context-state]').textContent.includes('尚未附加已核實外部來源')
Math.min(...[...document.querySelectorAll('button,[role="button"]')].map((node) => node.getBoundingClientRect().height)) >= 44
```

Click `data-distribution-row="pragmatic"` and verify the reader shows the bounded-preview notice. Click `doom` and verify `S5.R1` and `S11.R2` return.

- [ ] **Step 3: Verify keyboard and focus**

Verify:

- Space or Enter on a bubble opens the matching reader.
- Focus moves to the reader title.
- Escape closes the reader.
- Focus returns to the triggering bubble or row.
- Native sample limits opens with keyboard.

- [ ] **Step 4: Verify responsive layouts**

At `390×844` and `320×720`, verify:

```js
document.documentElement.scrollWidth === document.documentElement.clientWidth
getComputedStyle(document.querySelector('[data-reader-drawer]')).width === `${window.innerWidth}px`
```

Confirm the drawer is full-width and the compass remains behind it rather than compressing beside it.

- [ ] **Step 5: Save screenshots**

Save:

```text
output/playwright/2026-07-29-topic-F-compass-reader-desktop.png
output/playwright/2026-07-29-topic-F-compass-reader-narrow.png
```

- [ ] **Step 6: Final scope check**

Run:

```bash
git status --short -- \
  docs/superpowers/plans/2026-07-29-topic-f-compass-reply-group-reader.md \
  docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html \
  output/playwright/2026-07-29-topic-F-compass-reader-desktop.png \
  output/playwright/2026-07-29-topic-F-compass-reader-narrow.png
```

Expected: only the plan, mockup, and two QA screenshots are listed. Pre-existing dirty files remain untouched.

- [ ] **Step 7: Commit the verified artifact**

Run:

```bash
git add -- \
  docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html
git commit -m "docs: add compass reply group reader mockup" -- \
  docs/mockups/2026-07-29-topic-F-compass-reply-group-reader.html
```

Expected: one commit containing only the standalone mockup. QA screenshots remain local review evidence.
