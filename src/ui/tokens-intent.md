# tokens-intent.md — why the tokens are what they are

> **This is NOT a design spec.** Values live only in `src/ui/tokens.ts`; this
> guard-enforced, value-free file explains why and when to use them. If they
> disagree, tokens plus the newest shipped marquee surface win. Replace rather
> than append, and update this file with the token change it explains.
> 中文註解：這是「立法理由書」，不是第二套規格。值只在 tokens.ts；這裡只寫意圖。

## The one-sentence language

DLens is an editorial reading voice on one shared glass workspace — a research
instrument, **not** a dashboard that happens to contain text.

## The metaphor, unpacked（2026-07-10 修憲：暖紙退役）

- **One glass ground, not paper stock.** The warm-cream paper family was
  retired 2026-07-10 at the user's direction; Topic / Product / PR must read
  as one product. `color.canvas` / `color.surface` / `color.elevated` are
  three depths of one glass-white ground, derived from the
  `material.workspaceGlass` canvas stops so opaque cards and the translucent
  shell read as the same material. Inventing a fourth ground forks the palette.
- **Ink, not gray.** Text is ink at three pressures — `color.ink` (reading),
  `color.subInk` (supporting), `color.softInk` (ambient). Warm ink on the cool
  ground IS the editorial voice that survives the paper retirement. Never pure
  black text; "muted" comes from ink pressure, not opacity tricks.
- **Accents are a researcher's annotations ON the glass, never the glass
  itself.** One accent per workspace mode via `getModeTheme` (indigo archive,
  sage topic, steel-blue product, rose pr-evidence). Product returned to its
  original steel blue on 2026-07-14 (2026-07-06 vermillion retired); the three
  top-tab modes now read sage Topic, steel-blue Product, rose-red PR — PR the
  sole red. Two accents on one surface means it doesn't know what it is — split.
- **Mode identity comes from accent + content, never a different material.**
  Shell, rail, cards, and chips stay identical; only theme and data change.

## Per-family intent

### color
- Edges are quiet: `color.line` separates, `color.cardEdge` barely exists —
  card definition comes from shadow, not from border weight. If a card needs a
  strong border to read as a card, the elevation tier is wrong, not the border.
- Interaction washes, hover edges, and status borders live in named color roles
  so view files never bake opacity decisions into component-local literals.
- Inverse foreground and overlay roles are only for text, icons, and sheen on
  filled accent panels; reading cards still use ink-on-ground roles.
- Status colors (`color.success`, `color.queued`, `color.failed`,
  `color.running`) are natural dyes — sage, ochre, wine, indigo — deliberately
  below traffic-light saturation. Alarm is expressed by copy and placement,
  not by shouting pigment.
- Status washes and failed borders cover quiet panels and danger edges without
  view-local opacity choices.
- `glassBg` / `glassBorder` are legacy aliases; ordinary reading cards keep
  `effect.glassBlur` disabled and shell glass uses `material.workspaceGlass`.

### type (`textStyles`)
- **Weight carries hierarchy, size stays close.** 400 body, 500 field labels,
  600 caption, 700 titles, 800+ display. If you need emphasis, step weight
  before stepping size.
- Three voices: serif (`font.serifCjk` first) is the voice of the material —
  headlines (`textStyles.h2`) and pull quotes (`textStyles.quote`) only. Sans
  is the voice of the tool. Mono (`textStyles.mono`, `textStyles.metric`) is
  the voice of the data — IDs, counts, ledger numbers, always tabular.
- `textStyles.label` is the only uppercase in the system — structural
  wayfinding kickers. Uppercase anywhere else reads as dashboard chrome.
- Product copy is Chinese-first; English appears as data (names, IDs), not as
  placeholder prose.

### radius & shadow
- Two card tiers only: `radius.card` for inner panels, `radius.cardLg` for the
  Topic-style soft card that all modes now share. `radius.round` is for status
  dots only. Selectable options (mode toggles, packet-format cards) are the **raised tile「浮磚」**: `radius.card` + `shadow.card` on `color.atlasPaper`, selected → `color.product`.
- Shadows are panes lifted off the glass ground: a lit-from-above inset
  highlight, a tight contact shadow, a wide ambient (`shadow.card` →
  `shadow.shell` → `shadow.raised`, `shadow.popup` for the floating
  workspace). Colored glow is allowed only under accent CTAs
  (`shadow.topicCta`, `shadow.accentButton`).
- Hover shadows use the same ladder; components choose a named tier, never a
  new inline blur stack. Prefer shadow definition over strong borders.

### motion
- **Motion confirms, never entertains.** Use `motion.preset.buttonPress` for tactile ack,
  `motion.preset.cardLift` for hover/focus, and `motion.preset.surfaceFade` for arrival.
- Springs acknowledge direct manipulation; popup opening keeps its shell
  cascade. On every route, the first top-level card may soft-pop. Later
  top-level rounded cards use `motion.presence.cardDelayMs`,
  `motion.presence.cardOpacityFrom`, `motion.presence.cardRisePx`,
  `motion.presence.cardDurationMs`, and `motion.presence.cardStaggerMs`; they
  never scale or overshoot. The scroll viewport remains native, nested cards
  inherit their parent entrance, dense rows stay quiet, and causal state motion
  wins over unfinished presence.
- Bottom rebound belongs only to a genuinely scrollable workspace at its real
  end; only its inner track moves. Hover lift is reserved for active surfaces.
- Ambient shimmer/pulse means work is happening, never decoration. 深入解讀先顯示背景與理解，術語、爭論和證據逐層摺疊；紫色只標示解讀入口，每點保留原留言出處。
- 觀眾反應以話題列表進入閱讀頁，研究問題可即場修改；話題解讀只在點擊後執行，逐點保留來源。In 收藏 / 工作區, rows arrive on a capped stagger, glide to their new place on sort, fold away on search, images fade in once; one underline and one sort knob slide.
- Every animation sits behind a `prefers-reduced-motion` guard. The inline collect wheel preserves its accepted gesture, spring, charge and landing sequence; reduced motion removes travel and celebration. A saved audience post keeps one quiet line with its destination, first peek and estimated wait; the existing entries appear only when opened. Results arrive in 收藏 as a recent-reading strip, with crawl arcs and unread dots until either reader opens them. Off-screen completion gives one quiet return glow. 個人應用保持一行摘要；收藏整理與活動追蹤沿用原卡。 Model-written words appear only from the user's own key, stay one line each, and every method or side points at a real reply; shares stay the backend's numbers. 展開證據 shows replies in Threads' own shape, tinted initials standing in for avatars, a quiet thread line joining a question to its reply. The save button carries the crawl state the way the mockup does — a turning arc while crawling, a dim ring while queued, a dot for a result that arrived unseen — and the disclosed card enters once and lets its results fade up once. Spam and off-topic clusters stay visible but grey and last, never the headline. 證據只喺收藏統一閱讀頁，預設顯示少量留言，每組獨立展開；帖下卡以側欄睇全部交接帖子與角度，個人應用卡保持一行。 In the side panel the 觀眾反應 workspace reads as an index, not a report: 話題 chips, an amber 未分流 count for posts still to sort by hand, then 發現 cards whose sentences are templates filled with counts and marked 無 AI, then plain 講法 rows — no strip or progress bars — with the post in view on a faint wash of the mode colour. Settings put AI first, one provider at a time, and every group saves where it stands. While the crawl runs, the card keeps its shipped-reply peek and an honest estimated wait. The audience wheel fans recent workspace topics into its own annular band; tangent labels and counts lead into one save-and-assign gesture. Other topics replace the card’s topic slot with a full chip picker; its later action leaves the post unsorted. Reduced motion keeps the ring static, and only a visible ring expands the viewport clamp.

### spacing
- Mode tiles use the wheel’s icons on their mode accent wash. Reader topic chips scroll on one line; both reading lenses use one four-column bar and a compact type hierarchy, with default audience evidence. Topic creation takes an optional research question; literal overlap explains suggestions without AI. Saved-post rows put reading ahead of chrome: compact sans text, quiet meta, square images; a missing or expired image shows the post's first character on a deterministic author tint, never a blank hole. Workspace cards carry purpose and recent previews in that same fallback.
- Rhythm is owned by containers, not children: section gaps come from tokens
  like `spacing.resultSectionGap` / `spacing.resultCardGap` on a flex-gap
  parent; per-child margins break the Result spacing contract.
- The Atlas narrow layout stacks narrative beats into one uninterrupted reading column;
  `layout.workspacePopupHeight` stays shared so drawers resolve inside the frame.

### Shared glass shell + Atlas surface（2026-07-10 修憲）
- Variant D glass is now the shared Topic / Product / PR shell grammar. Atlas and
  Product keep the aura field; the side panel's 收藏 / 工作區 tabs sit on paper white
  with one slow sage mist under fine grain, so the fade never bands.
- Signal Atlas remains one dense Audit evidence surface inside that grammar;
  its exceptions earn space only by exposing real denominators and real quotes.
- `color.signal` highlights evidence edges; it does not replace mode accents.
- Glass needs all three together: a near-white ground, colour washes behind the
  panels, and large-radius negative-spread low-opacity shadows. Existing
  `color.atlas*`, `shadow.atlas*`, and `effect.atlasBlur` names remain
  compatibility aliases while callers move to `material.workspaceGlass`.
- Dense lists, tables, evidence rows, form controls, and long reading cards
  stay OPAQUE on the glass-white family — no glass-on-glass, protect contrast.
- Product action + inbox share the Atlas canvas grammar via `color.productCanvas` + `color.auraProductBlue` (steel-blue lean).
- 民情羅盤 is L0's protagonist: bubbles positioned by LLM-read valence/mode,
  sized by comment count. Pattern count floats with the actual reading — never
  force four quadrant clusters; same-quadrant crowding is valid. If a pattern
  lacks scalars, fall back to the axis-free field — axes never claim unearned
  meaning.
- The compass legend row is a pattern's only L0 text; the card wall it
  replaced stays removed (no surface restates another surface's data).

## What this language refuses（拒絕清單 — 歷史上真實被移除過的模式）

1. **Dashboard grammar** — KPI tiles, hero stat blocks, big-number flexing,
   progress theater stay banned. Audit atlas may show KPI/stat numbers only as
   a coverage ledger through `textStyles.metricDisplay`, where every number has
   a real denominator tied to the read-comment total. Denominator-free vanity
   metrics stay banned.
2. **Decorative affordances** — badges/expanders that restate data already
   visible. Substance over decoration (see repo CLAUDE.md): a click that
   reveals nothing new is a regression, not a zero.
3. **A second palette, font stack, or scale** — the 2026-04 three-spec fork is
   why this file is value-free and `tokens.ts` is the only law. `color.signal`
   stays a scoped Audit-atlas evidence accent inside that source, never a
   replacement for `getModeTheme` accents; `color-literal-guard` keeps it honest.
4. **Traffic-light alarm colors** — saturated red/green/yellow status.
5. **English placeholder copy** in Chinese-first product surfaces.
6. **Warm-cream paper surfaces / pure black text / cold blue-grays** — cream
   retired 2026-07-10; a second warmth or a cold gray scale forks the palette.
   White cards are now the ground; text stays warm ink, never pure black.
7. **Unscoped glassmorphism** — translucency stacks remain banned by default.
   Shared shell glass comes only from `material.workspaceGlass`; reading cards
   and list rows stay opaque, and `effect.glassBlur` stays disabled.
8. **All-caps chrome outside `textStyles.label`** — locked since the Compare
   label-casing decision.

## How agents use this file

- Before a UI change: read the family you're touching plus the refuse-list.
  Then imitate the newest shipped marquee surface (Topic detail, Compare hero,
  PR Evidence ledger) rather than inventing.
- Need a value that doesn't exist? Add the token to `tokens.ts` first (same
  PR), then add a line here ONLY if the intent isn't self-evident.
- Taste decisions stay with the user: 1–3 dated HTML variants in
  `docs/mockups/` (reference-only), user picks, implement against tokens.
