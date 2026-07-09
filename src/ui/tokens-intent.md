# tokens-intent.md — why the tokens are what they are

> **This is NOT a design spec.** Design values (colors, sizes, curves) live in
> exactly one place: `src/ui/tokens.ts`. This file is guard-enforced value-free
> (`tests/tokens-intent-guard.test.ts` fails on any hex/rgb/px/ms literal) and
> explains WHY the values are what they are and WHEN to use which. If this file
> and `tokens.ts` disagree, `tokens.ts` plus the newest shipped marquee surface
> win. Update this file in the same PR as the token change it explains. Hard cap
> ~150 lines — replace, don't append.
> 中文註解：這是「立法理由書」，不是第二套規格。值只在 tokens.ts；這裡只寫意圖。

## The one-sentence language

DLens is an editorial reader inside a native-feeling macOS utility shell — a
researcher's field notebook that happens to be an app, **not** a dashboard that
happens to contain text. Every visual decision below serves that sentence.

## The metaphor, unpacked

- **Paper, not screen.** `color.canvas` / `color.surface` / `color.elevated`
  are three warmths of the same paper stock. New surfaces pick one of these
  three; inventing a fourth warmth is how palettes fork.
- **Ink, not gray.** Text is ink at three pressures — `color.ink` (reading),
  `color.subInk` (supporting), `color.softInk` (ambient). Never pure black or
  pure white; both puncture the paper illusion. "Muted" is achieved by ink
  pressure, not by opacity tricks on random colors.
- **Accents are a researcher's annotations ON the paper, never the paper
  itself.** One accent per workspace mode via `getModeTheme` (indigo archive,
  sage topic, fusion D vermillion product, rose pr-evidence). Product's warmer
  accent was chosen from the mockup gate on 2026-07-06 to make signal work feel
  decisive without borrowing PR Evidence's wine tone. Two mode accents on one
  surface means the surface doesn't know what it is — split it or pick one.
- **The shell is borrowed from macOS utility; the content stays editorial.**
  Elevation and motion may feel native; reading surfaces must feel printed.

## Per-family intent

### color
- Edges are quiet: `color.line` separates, `color.cardEdge` barely exists —
  card definition comes from shadow, not from border weight. If a card needs a
  strong border to read as a card, the elevation tier is wrong, not the border.
- Interaction washes, hover edges, and status borders live in named color roles
  so view files never bake opacity decisions into component-local literals.
- Inverse foreground and overlay roles are only for text, icons, and sheen on
  filled accent panels; paper cards still use ink-on-paper roles.
- Status colors (`color.success`, `color.queued`, `color.failed`,
  `color.running`) are natural dyes — sage, ochre, wine, indigo — deliberately
  below traffic-light saturation. Alarm is expressed by copy and placement,
  not by shouting pigment.
- Status washes and failed border roles cover low-emphasis status panels and
  danger edges without view-local opacity choices.
- `glassBg` / `glassBorder` are legacy aliases and `effect.glassBlur` is
  intentionally disabled. Do not revive glassmorphism; the paper is opaque.

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
  Topic-style soft paper card that all modes now share. `radius.round` is
  reserved for status dots — not for pills, not for avatars or buttons.
- Shadows are matte paper lifted off a desk: a lit-from-above inset highlight,
  a tight contact shadow, a wide ambient (`shadow.card` → `shadow.shell` →
  `shadow.raised`, `shadow.popup` for the floating workspace). Colored glow is
  allowed only under accent CTAs (`shadow.topicCta`, `shadow.accentButton`).
- Hover shadows remain part of that same elevation ladder; component files
  choose the named tier instead of composing new blur stacks inline.
- Prefer "definition by shadow" (`color.cardEdge` + a shadow tier) over strong
  borders — see the color section; the two rules are the same rule.

### motion
- **Motion confirms, never entertains.** The vocabulary is three semantic
  presets: `motion.preset.buttonPress` (tactile ack), `motion.preset.cardLift`
  (soft settle on hover/focus), `motion.preset.surfaceFade` (content arrival).
  New components compose these; new one-off transitions need a reason a preset
  can't cover.
- Springs overshoot subtly and only for direct-manipulation feedback. Ambient
  loops (`motion.keyframes.shimmer`, `motion.keyframes.pulse`) mean "work is
  happening", never decoration.
- Every animation sits behind a `prefers-reduced-motion` guard (repo contract).

### spacing
- Rhythm is owned by containers, not children: section gaps come from tokens
  like `spacing.resultSectionGap` / `spacing.resultCardGap` on a flex-gap
  parent. Per-child margins are how vertical rhythm died before — the Result
  spacing contract exists because of it.

### Atlas surface（2026-07-09 修憲；同日玻璃修正）
- Signal Atlas is one dense Audit evidence surface, not a new workspace grammar.
- Its exceptions earn space only when they expose real denominators and real
  quotes, not decoration or empty emphasis.
- `color.signal` highlights evidence edges; it does not replace mode accents.
- Glass needs all three together: near-white warm ground (`color.atlasCanvas`),
  colour washes BEHIND the panels (`color.atlasAura*` — blur needs something to
  diffuse), and large-radius negative-spread low-opacity shadows
  (`shadow.atlasGlass` / `atlasCard`). Hard mid-distance shadows and a paper
  ground behind glass were the two 2026-07-09 faults — never reintroduce.
- `effect.atlasBlur` + `color.atlasPaper` stay scoped to the atlas canvas, one
  detail drawer, and hover popovers; outside the canvas is opaque paper.
- 民情羅盤 is L0's protagonist: bubbles positioned by LLM-read valence/mode,
  sized by comment count. Pattern count floats with the actual reading — never
  force four quadrant clusters; same-quadrant crowding is a valid outcome. If
  any pattern lacks scalars, fall back to the axis-free field so the axes
  never claim unearned meaning.
- The compass legend row is a pattern's only L0 text; the card wall it
  replaced stays removed (no surface restates another surface's data).
- Motion stays tokenized and behind `prefers-reduced-motion`.

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
   why this file is value-free and why `tokens.ts` is the only law.
   `color.signal` is a scoped evidence-highlight accent added into the same
   token source for Audit atlas; it coexists with, and never replaces, the
   per-mode accent returned by `getModeTheme`. `color-literal-guard` remains
   the condition that keeps it from forking into a parallel palette.
4. **Traffic-light alarm colors** — saturated red/green/yellow status.
5. **English placeholder copy** in Chinese-first product surfaces.
6. **Pure white cards / pure black text / cold grays** — they break the paper.
7. **Glassmorphism revival** — translucency stacks remain banned by default.
   Atlas glass is allowed only through `effect.atlasBlur` + `color.atlasPaper`
   on the atlas hero, the single detail drawer, and hover popovers. Reading
   cards and list rows stay opaque paper; shared `effect.glassBlur` stays
   disabled.
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
