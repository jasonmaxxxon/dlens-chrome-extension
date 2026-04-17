# DLens Design System — Decision Matrix

> **Identity**: Editorial analysis tool with desktop utility discipline.
> Not a dashboard. Not a system preferences panel. A research brief you actually want to read.
>
> **Source method**: Per-surface borrowing — each UI surface pulls from the reference
> system best suited to its job, then all references are resolved into DLens's own tokens.
> Source material: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)

---

## 1. Source Division

Each DLens surface maps to a primary and secondary design reference.
The primary reference governs structure and spacing; the secondary
contributes specific flourishes (shadows, typography details, interaction patterns).

| DLens Surface | Primary Reference | Secondary Reference | Why This Pairing |
|---|---|---|---|
| **Popup shell** (sidepanel chrome, nav tabs, settings) | **Raycast** — desktop utility chrome | Apple — cinematic pacing for section rhythm | The sidepanel IS the app window. It needs to feel like a native desktop tool, not a web page. Raycast's multi-layer shadow system and macOS-native inset highlights give the shell physical credibility. |
| **Compare hero** (brief headline, verdict, stance summary) | **Apple** — cinematic spacing & single-accent discipline | Notion — warm reading surface, whisper borders | The hero is the one moment of editorial drama. Apple's tight headline tracking and generous whitespace create billboard impact. Notion's warm neutrals prevent it from feeling cold or corporate. |
| **Cluster dock** (bubble map, cluster list, selection state) | **Airtable** — structured data emphasis | Linear — precision micro-hierarchy, luminance-step elevation | The dock is a data instrument. Airtable's semantic tokens and structured grid patterns handle the tabular aspects. Linear's weight-510 signature and near-invisible borders give the selection states surgical precision. |
| **Casebook / Technique page** (evidence cards, reading flow, technique carousel) | **Notion** — editorial reading surface | PostHog — content-first density, warm editorial feel | These are long-form reading surfaces. Notion's whisper borders, warm neutrals, and multi-layer sub-0.05 shadows create a page-like reading experience. PostHog's content density keeps the evidence list scannable without feeling like a feed. |
| **Metric chips / Status rail** (engagement numbers, readiness badges, processing strip) | **Linear** — precision data display | Airtable — blue-tinted shadows, semantic theme tokens | Numbers need engineering precision. Linear's tabular-nums, tight weight steps (400→510→590), and achromatic hierarchy make metrics instantly scannable. Airtable's `--theme_*` token pattern keeps semantic states consistent. |

### Base Language

The two systems that contribute most broadly are **Apple** (pacing, single-accent discipline, headline typography) and **Notion** (reading surfaces, whisper borders, warm neutrals). Every surface starts with this base and layers on its specific reference.

### What We Don't Borrow

| Source | What We Skip | Why |
|---|---|---|
| Raycast | Dark mode, near-black canvas, red accent | DLens is a light-mode reading tool. We borrow Raycast's *shadow craftsmanship*, not its palette. |
| Linear | Dark-mode-first palette, brand indigo-violet | Same reason. We adapt Linear's *weight system and precision* to light surfaces. |
| Apple | Full-width cinematic sections, product photography | Sidepanel is 320–440px wide. No room for Apple's viewport-as-canvas approach. |
| Notion | Custom NotionInter font, warm parchment canvas | We use Inter (no custom variant). Our canvas is cool neutral, not Notion-warm. |
| Airtable | Haas font family, positive letter-spacing on body | Positive tracking hurts CJK readability. We use Inter with normal/negative tracking. |

---

## 2. Color Palette

### Canvas & Surfaces

| Token | Value | Source Logic |
|---|---|---|
| `canvas` | `#f0f1f3` | Cool paper-white. Not sterile white (Apple), not warm parchment (Notion). A neutral ground that lets card surfaces contrast cleanly. |
| `canvasSubtle` | `#e8e9ec` | Border/separator tone. One step darker — derived from the canvas. |
| `surface` | `#ffffff` | Card backgrounds. White-on-cool-grey = clear card boundary without needing shadow. (Notion pattern: white cards on tinted canvas.) |
| `surfaceSunken` | `#e4e5e8` | Recessed containers — bubble map field, section rail. (Atlassian sunken tier.) |
| `surfaceRaised` | `#ffffff` + shadow | Focal card — brief hero, selected cluster. ONE per view maximum. |

### Text Hierarchy

| Token | Value | Source Logic |
|---|---|---|
| `textPrimary` | `#1a1a2e` | Deep blue-black. Not pure black (too harsh), not warm-black (Notion's `rgba(0,0,0,0.95)`). Stripe's `#061b31` range adapted lighter for sidepanel reading. |
| `textSecondary` | `#555770` | Body copy, descriptions. Notion's warm-gray territory (`#615d59`) cooled to match our canvas. |
| `textTertiary` | `#8b8da3` | Labels, metadata. Linear's `#8a8f98` range — precision-muted. |
| `textDisabled` | `#b4b6c4` | Disabled, placeholders. |

### Post Identity (Structural Color)

| Token | Value | Role |
|---|---|---|
| `accentA` | `#4338ca` | Post A — deep indigo. Serious, analytical. |
| `accentAMid` | `#6366f1` | Post A hover state. |
| `accentASurface` | `#eef2ff` | Post A tinted background — **opaque**, not rgba. (Stripe pattern: opaque tints composite cleaner.) |
| `accentABorder` | `#c7d2fe` | Post A surface border. |
| `accentB` | `#c2410c` | Post B — burnt orange. Editorial gravitas, not warning-yellow. |
| `accentBMid` | `#ea580c` | Post B hover state. |
| `accentBSurface` | `#fff7ed` | Post B tinted background — opaque. |
| `accentBBorder` | `#fed7aa` | Post B surface border. |

### Analysis & Status

| Token | Value |
|---|---|
| `teal` | `#0d9488` |
| `tealSurface` | `#f0fdfa` |
| `positive` / `positiveSurface` | `#059669` / `#ecfdf5` |
| `negative` / `negativeSurface` | `#dc2626` / `#fef2f2` |
| `warning` / `warningSurface` | `#d97706` / `#fffbeb` |

### Technique Palette

Rose `#e11d48` · Amber `#d97706` · Teal `#0f766e` · Blue `#2563eb` · Violet `#7c3aed`

### Shadow Tiers

| Tier | Value | Borrowed From | Use |
|---|---|---|---|
| **None** | — | Atlassian | Default. Most cards = flat + border. |
| **Raised** | `0 1px 3px rgba(23,23,37,0.06), 0 1px 1px rgba(23,23,37,0.08), 0 0 1px rgba(23,23,37,0.16)` | Notion multi-layer (adapted from `rgba(0,0,0,0.04)` card shadow) + Raycast inset discipline | Focal card only — brief hero, selected cluster detail. |
| **Overlay** | `0 4px 8px -2px rgba(23,23,37,0.10), 0 16px 24px -4px rgba(23,23,37,0.10), 0 0 1px rgba(23,23,37,0.18)` | Notion deep shadow (5-layer, adapted to 3-layer for performance) | Tooltips, popup, floating elements. |
| **Shell** | `0 18px 52px rgba(15,23,42,0.14), 0 0 0 1px rgba(255,255,255,0.9)` | Raycast multi-layer window shadow | The sidepanel popup container itself. |

---

## 3. Typography

### Font Stack
- **Primary**: `Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
- **Monospace**: `'SF Mono', 'Fira Code', monospace`
- **OpenType**: `"cv01", "ss03"` (Linear's geometric alternates) — cleaner 'a' and refined letterforms.
- **Numeric**: `font-variant-numeric: tabular-nums` on ALL metric displays (Stripe/Linear pattern).

### Type Scale

| Role | Size | Weight | Line-Height | Tracking | Surface | Source Logic |
|---|---|---|---|---|---|---|
| Brief Headline | 18px | 800 | 1.30 | -0.02em | Compare hero | Apple: tight tracking creates billboard impact. 800 weight = the one bold moment. |
| Panel Title | 17px | 800 | 1.30 | -0.01em | Cluster dock, technique view | Apple: compressed authority at panel level. |
| Card Title | 15px | 700 | 1.35 | normal | Evidence cards, post headers | Notion: card title weight 700 at body-adjacent size. |
| Body | 13px | 400 | 1.55 | normal | Casebook, evidence text | Notion: reading rhythm with generous line-height. 13px for sidepanel density. |
| Body Emphasis | 13px | 700 | 1.55 | normal | Author names, strong labels | Notion: weight-based emphasis, not size-based. |
| Small | 12px | 400–600 | 1.50 | normal | Comments, metrics, stance cells | Linear: precision at small size, weight 510→600 range adapted. |
| Label | 11px | 600–700 | 1.40 | 0.04em | Section headers (uppercase), badges | Airtable: positive tracking on structural labels only. |
| Caption | 10px | 600–700 | 1.40 | 0.04–0.06em | Technique hints, metadata | Linear: micro-hierarchy at caption level. |

### Typography Principles
1. **Weight-driven, not size-driven** (Notion pattern): In 440px, keep to 5–6 font sizes max. Differentiate via weight steps 400→600→700→800.
2. **Tabular-nums everywhere** (Stripe/Linear): Engagement metrics, cluster percentages, support counts — columns must align.
3. **Negative tracking at headline only** (Apple): Brief headline gets -0.02em. Body stays normal — tight tracking fragments CJK characters.
4. **Uppercase only for structural labels** (Linear): "AUDIENCE EVIDENCE", "POST A" = uppercase + letter-spacing. Body text never uppercases.
5. **Max weight is 800**: No `bold`/900. Reserve 800 for brief headline only.

---

## 4. Per-Surface Component Rules

### 4.1 Popup Shell ← Raycast + Apple

The sidepanel container, navigation tabs, and settings chrome.

- **Shadow**: Shell shadow (Raycast multi-layer window chrome)
- **Background**: `glassBg: rgba(255,255,255,0.98)` with `backdrop-filter: blur(18px) saturate(120%)` — glass morphism is for the *shell only*, never internal cards.
- **Border**: `glassBorder: rgba(15,23,42,0.11)` — Raycast's `rgba(255,255,255,0.06)` inverted for light mode.
- **Tab bar**: Segmented control (not capsule tabs). Active = `accentA` bg + white text. Inactive = transparent + `textSecondary`. (Adapted from M3 segmented button, not macOS capsule.)
- **Section rhythm**: 16px section gap within views (Apple's "let each moment breathe" — scaled to sidepanel proportions).

**Do**: Apply glass blur to the outermost container. Use Raycast's multi-layer shadow for the popup.
**Don't**: Use glass/blur on any internal card or panel. Don't use macOS capsule tabs.

### 4.2 Compare Hero ← Apple + Notion

The brief headline, verdict statement, and stance summary at the top of CompareView.

- **Card**: Raised shadow — the ONE card per view that gets elevation. 16px radius (the premium radius). 20px padding.
- **Headline**: 18px / weight 800 / -0.02em tracking / `textPrimary`. Apple's billboard compression.
- **Body**: 13px / weight 400 / line-height 1.6 / `textSecondary`. Notion's reading rhythm.
- **Stance cells**: Side-by-side — left `accentASurface` bg + 3px `accentA` left border, right `accentBSurface` bg + 3px `accentB` left border.
- **Whisper border**: 1px `canvasSubtle` between hero sections. Notion's ultra-thin dividers.
- **Whitespace**: 24px gap below hero before cluster dock. Apple-scale breathing room.

**Do**: Give the hero raised shadow. Use tight headline tracking. Let it breathe with 24px gap.
**Don't**: Use shadow on any other card in CompareView. Don't exceed 3px accent border-left.

### 4.3 Cluster Dock ← Airtable + Linear

Bubble map, cluster list, and cluster detail panel.

- **Bubble map field**: Sunken surface (`surfaceSunken`) + 1px `canvasSubtle` border. 12px radius.
- **Bubble sizing**: Dynamic from `sizeShare` (24–58px diameter). Border: 2px solid accent. Fill: accent tinted. Label: 11px weight 800 centered.
- **Selected bubble**: 4px focus ring in accent-surface color + glow shadow. (Linear's luminance-step selection.)
- **Cluster list**: Flat cards with 1px borders. No shadow. (Airtable card pattern: `1px solid #e0e2e6`.)
- **Metrics inside cluster**: Ant Design Card.Grid — equal-width cells, 1px border between cells, value 16px weight 800 `tabular-nums`, label 10px weight 600 uppercase `textTertiary`.
- **Selection state**: Border shifts to accent color + subtle background tint. Linear's `rgba(255,255,255,0.02)` hover adapted to light mode as 4% opacity overlay (M3 state layer).

**Do**: Use Card.Grid for metrics. Apply M3 state layers (4% opacity) for hover. Use `tabular-nums`.
**Don't**: Give cluster cards shadow. Don't use heavy selection backgrounds — tint only.

### 4.4 Casebook / Technique Page ← Notion + PostHog

Evidence cards, technique carousel, reading flow surfaces.

- **Evidence card**: Flat white + 1px whisper border (`canvasSubtle`). 8px radius. Notion's card pattern.
  - Author: 12px weight 700 `textSecondary`.
  - Text: 13px weight 400 `textPrimary`, line-height 1.6. Notion's reading rhythm.
  - Hover: 4% opacity state layer + border shifts to `accentABorder` or `accentBBorder`.
  - Expand toggle: 11px weight 700 `accentA` — ghost button style.
- **Technique carousel**: Horizontal scroll with scroll-snap. Cards get 3px left accent bar (from TECHNIQUE_ACCENTS palette). Notion's whisper-border cards with PostHog's content-first density.
- **Reading density**: 10–12px card padding for evidence (PostHog tight). 16px for technique cards (Notion comfortable).
- **Progressive disclosure**: Show summary first (title + thesis + 3 metrics), expand for full evidence. Notion's "blank canvas that gets out of your way."

**Do**: Use whisper borders. Keep evidence cards flat and tight. Let reading rhythm (line-height 1.55–1.6) carry the experience.
**Don't**: Add shadows to evidence cards. Don't center-align evidence text. Don't use heavy card backgrounds.

### 4.5 Metric Chips / Status Rail ← Linear + Airtable

Engagement numbers, readiness badges, processing strip, status indicators.

- **Metric chip**: Background `neutralSurface` / rounded 999px (pill). Value: weight 700 `tabular-nums`. Label: weight 600 `textTertiary`.
- **Engagement table**: Ant Design Card.Grid. Container: flat card. Header: tinted `#fafbfc`, 11px weight 700 `textTertiary`. Data: `tabular-nums` weight 700. Winner = `positive`. Loser = `negative`. Cells separated by 1px `canvasSubtle` borders.
- **Status badges**: 2px 8px padding, 999px radius, 11px weight 700. Semantic surfaces: `positiveSurface`/`negativeSurface`/`warningSurface`. (Airtable `--theme_*` semantic pattern.)
- **Processing strip**: Label 10px weight 700 `textTertiary` uppercase + 0.04em tracking. Progress uses `accentA` for active, `canvasSubtle` for remaining.

**Do**: Use `tabular-nums` on every number. Use semantic color tokens for status. Apply Linear's precision weight steps.
**Don't**: Use decorative colors on metrics. Don't use font-size variation to emphasize numbers — use weight.

---

## 5. Elevation Model

| Level | Treatment | Max Per View | Source |
|---|---|---|---|
| Sunken | `surfaceSunken` bg + 1px border | Unlimited | Atlassian sunken tier |
| Flat (default) | `surface` bg + 1px `canvasSubtle` border | Unlimited | Notion whisper-border cards |
| Raised (focal) | `surface` bg + raised shadow + transparent border | **1** | Apple single-accent discipline: one hero, one shadow |
| Overlay | `surface` bg + overlay shadow | As needed | Notion deep shadow (adapted) |
| Shell | Glass bg + blur + shell shadow | **1** (the popup) | Raycast window chrome |

**Elevation philosophy**: In a 440px sidepanel, shadow overuse = visual noise. The Atlassian flat-by-default model + Apple's single-accent discipline = most cards are quiet, one card demands attention. When nothing is selected, no card has shadow. When a cluster is selected, only its detail panel earns raised.

---

## 6. Layout & Spacing

### Grid
- Max width: 440px (sidepanel constraint).
- Primary: single column, full-width cards.
- Dual-column: post headers `1fr 1fr`, cluster maps `1fr 1fr`, stance cells `1fr 1fr`.
- Metric grid: `repeat(3, 1fr)` for KPI cells.

### Spacing Scale (8px base)

| Token | Value | Use |
|---|---|---|
| `xs` | 4px | Icon gaps, micro-adjustments |
| `sm` | 8px | Intra-component gaps, pill padding |
| `md` | 12px | Card internal sections, evidence padding |
| `lg` | 16px | Card padding, section gaps within views |
| `xl` | 20px | Brief hero padding (Apple breathing room) |
| `section` | 24px | Section-to-section in compare view |
| `page` | 32px | Page-level separation |

### Border Radius Scale

| Token | Value | Use | Source |
|---|---|---|---|
| `sm` | 8px | Buttons, inputs, evidence cards, metric cells | Working radius — Airtable's 12px adapted tighter for sidepanel |
| `md` | 12px | Cards, panels, containers | Structural radius — M3's 12dp card radius |
| `lg` | 16px | Brief hero only | Premium radius — Apple's generous curves for the one hero |
| `pill` | 999px | Status badges, alignment pills, bubble buttons | Full round — universal |

---

## 7. Motion

| Token | Value | Source |
|---|---|---|
| `transition` | `all 180ms cubic-bezier(0.4, 0, 0.2, 1)` | M3 standard easing |
| `transitionFast` | `all 100ms cubic-bezier(0.4, 0, 0.2, 1)` | M3 accelerated — hover/selection feedback |
| `interactiveTransition` | `background-color, border-color, color, box-shadow, opacity, transform` at 180ms | Explicit property list — avoids animating layout properties |

---

## 8. Interaction Patterns

### M3 State Layers (Borrowed from Material Design 3)
All interactive cards/buttons use a pseudo-element overlay for hover/focus:
- **Hover**: 4% opacity `textPrimary` overlay
- **Focus**: 8% opacity `textPrimary` overlay
- **Pressed**: 12% opacity `textPrimary` overlay

This replaces per-component hover color definitions with a consistent system.

### Selection (Linear Luminance-Step)
- Unselected: flat card, 1px `canvasSubtle` border
- Hovered: state layer + border shifts to accent
- Selected: accent-tinted background (opaque surface token) + accent border + NO shadow (shadow is reserved for the hero)

---

## 9. Do's and Don'ts — Per Surface

### Popup Shell
- **Do**: Glass blur on outermost container. Multi-layer Raycast shadow. Segmented control for nav.
- **Don't**: Glass blur on internal cards. macOS capsule tabs. Heavy nav chrome.

### Compare Hero
- **Do**: Raised shadow. Tight headline tracking. 24px breathing gap below.
- **Don't**: Shadow on any other CompareView card. Headline weight < 800. More than one raised card.

### Cluster Dock
- **Do**: Sunken bubble map field. Card.Grid metrics. 4% state layers. `tabular-nums`.
- **Don't**: Shadow on cluster cards. Heavy selection backgrounds. Size-driven metric emphasis.

### Casebook / Technique Page
- **Do**: Whisper borders. Flat evidence cards. Reading line-height 1.55–1.6. Progressive disclosure.
- **Don't**: Shadows on evidence cards. Center-aligned text. Heavy card backgrounds.

### Metric Chips / Status Rail
- **Do**: `tabular-nums` everywhere. Semantic status colors. Pill badges. Weight-driven emphasis.
- **Don't**: Decorative metric colors. Size-based number emphasis. Non-tabular number display.

---

## 10. Agent Prompt Guide

### Quick Token Reference
```
Canvas:    #f0f1f3     Surface:   #ffffff     Sunken:    #e4e5e8
Text:      #1a1a2e / #555770 / #8b8da3 / #b4b6c4
Post A:    #4338ca / #eef2ff / #c7d2fe
Post B:    #c2410c / #fff7ed / #fed7aa
Teal:      #0d9488 / #f0fdfa
Radius:    8px (sm) / 12px (md) / 16px (lg) / 999px (pill)
Grid:      8px base, 16px card padding, 24px section gap
Shadow:    none (default) / raised (1 per view) / overlay (floating) / shell (popup)
```

### Surface → Reference Cheatsheet
```
Building popup chrome?     → Think Raycast: multi-layer shadow, glass container
Building compare hero?     → Think Apple: tight headline, generous whitespace, ONE shadow
Building cluster/data?     → Think Airtable + Linear: Card.Grid, tabular-nums, precision weights
Building reading surface?  → Think Notion: whisper borders, warm rhythm, flat cards
Building metrics/status?   → Think Linear: weight steps, monospace nums, achromatic hierarchy
```

### Example Prompts
- **Compare Brief hero**: "Raised shadow, 16px radius, 20px padding. Headline: 18px Inter weight 800, tracking -0.02em, color #1a1a2e. Body: 13px weight 400, line-height 1.6, color #555770. Below: two stance cells — left #eef2ff bg + 3px #4338ca left border, right #fff7ed bg + 3px #c2410c left border."
- **Cluster bubble map**: "Sunken bg #e4e5e8, 12px radius, 1px #e8e9ec border. Bubbles: 2px solid accent border, tinted fill, 11px weight 800 centered label. Selected: 4px focus ring in accent-surface + glow."
- **Evidence card**: "Flat white, 1px #e8e9ec border, 8px radius. Author: 12px weight 700 #555770. Text: 13px weight 400 #1a1a2e, line-height 1.6. Hover: 4% opacity overlay + border → #c7d2fe."
- **Metric grid**: "Card.Grid: container 1px #e8e9ec border, 8px radius. Cells: equal-width, 1px borders between. Value: 16px weight 800 tabular-nums. Label: 10px weight 600 uppercase #8b8da3."
