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

DLens is an editorial reading voice on one shared glass workspace — a
researcher's instrument that happens to be an app, **not** a dashboard that
happens to contain text. Every visual decision below serves that sentence.

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
  sage topic, fusion D vermillion product, rose pr-evidence). Product's warmer
  accent was chosen from the mockup gate on 2026-07-06 to make signal work feel
  decisive without borrowing PR Evidence's wine tone. Two mode accents on one
  surface means the surface doesn't know what it is — split it or pick one.
- **Mode identity comes from accent + content, never from a different
  material.** The shell, rail, cards, and chips are identical across modes;
  only `getModeTheme` and the data change.

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
- Status washes and failed border roles cover low-emphasis status panels and
  danger edges without view-local opacity choices.
- `glassBg` / `glassBorder` are legacy aliases and `effect.glassBlur` remains
  disabled for ordinary reading cards. Shared shell glass uses the single
  `material.workspaceGlass` family instead of reviving component-local blur.

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
  Topic-style soft card that all modes now share. `radius.round` is
  reserved for status dots — not for pills, not for avatars or buttons.
- Shadows are panes lifted off the glass ground: a lit-from-above inset
  highlight, a tight contact shadow, a wide ambient (`shadow.card` →
  `shadow.shell` → `shadow.raised`, `shadow.popup` for the floating
  workspace). Colored glow is allowed only under accent CTAs
  (`shadow.topicCta`, `shadow.accentButton`).
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

### Shared glass shell + Atlas surface（2026-07-10 修憲）
- Variant D glass is now the shared Topic / Product / PR shell grammar. The
  popup canvas owns the aura field; masthead, rail, main frame, marquee heroes,
  one detail drawer, and hover popovers may use `material.workspaceGlass`.
- Signal Atlas remains one dense Audit evidence surface inside that grammar;
  its exceptions earn space only by exposing real denominators and real quotes.
- `color.signal` highlights evidence edges; it does not replace mode accents.
- Glass needs all three together: a near-white ground, colour washes behind the
  panels, and large-radius negative-spread low-opacity shadows. Existing
  `color.atlas*`, `shadow.atlas*`, and `effect.atlasBlur` names remain
  compatibility aliases while callers move to `material.workspaceGlass`.
- Dense lists, tables, evidence rows, form controls, and long reading cards
  stay OPAQUE — on the glass-white surface family, without blur — preventing
  glass-on-glass layering and protecting contrast.
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
