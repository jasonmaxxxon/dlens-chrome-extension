# DLens Design System

Last updated: 2026-04-06

## 1. Purpose

DLens is an editorial analysis tool inside a compact browser-extension shell.

It is not a dashboard, not a generic SaaS app, and not an IDE-like devtool. The design target is:

- fast first read
- evidence-first navigation
- high trust without visual heaviness
- desktop-tool discipline without losing reading comfort

This design system is a decision matrix for agents and implementers. It is not a moodboard.

Primary external reference library:

- [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md/tree/main)

Reference files used for the current matrix:

- [Apple DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/apple/DESIGN.md)
- [Notion DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/notion/DESIGN.md)
- [Airtable DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/airtable/DESIGN.md)
- [Raycast DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/raycast/DESIGN.md)
- [Linear DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/linear.app/DESIGN.md)
- [PostHog DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/posthog/DESIGN.md)

## 2. Global Invariants

These rules apply to every UI surface, regardless of borrowed reference.

### 2.1 Product Identity

- White or near-white canvas
- Dark text hierarchy
- Accent color is semantic, not decorative
- Evidence must read more strongly than chrome
- Reading order matters more than decorative card count
- The popup must still feel like a precise desktop utility

### 2.2 Never Change Without Intentional Re-design

- `Post A` / `Post B` semantic color mapping
- base typography scale
- radius scale
- shadow scale
- motion timing
- evidence-first cluster reading order
- compare hero -> section rail -> cluster dock flow

### 2.3 What DLens Is Not

- not generic glassmorphism
- not dark cyber / neon UI
- not dashboard-first analytics software
- not a marketing landing page compressed into a popup
- not a literal macOS clone
- not a doc editor with weak focal hierarchy

## 3. Source Division Matrix

| Surface | Primary | Secondary | Why This Pairing |
|---|---|---|---|
| Popup shell | Raycast | Apple | Raycast gives compact utility chrome; Apple keeps it calm instead of flashy |
| Compare hero | Apple | Notion | Apple gives restraint and hierarchy; Notion softens it into an editorial reading surface |
| Cluster dock | Airtable | Linear | Airtable gives modular evidence structure; Linear gives disciplined dense controls and states |
| Casebook / Technique | Notion | PostHog | Notion gives notebook calm; PostHog adds insight-card energy only where needed |
| Metric chips / Status | Linear | Airtable | Linear gives crisp compact semantics; Airtable adds structured color grouping without dashboard noise |

## 4. Borrowing Priority Rules

Primary reference decides:

- layout
- spacing rhythm
- hierarchy
- component massing
- surface attitude

Secondary reference decides:

- micro-patterns
- chip and badge finish
- divider treatment
- hover/active subtlety
- annotation tone

If two references conflict:

1. preserve DLens global invariants
2. preserve the primary reference's layout logic
3. borrow the secondary only at micro-pattern level
4. if still unclear, choose the calmer and more evidence-forward option

## 5. What We Borrow / What We Don't

### 5.1 Raycast

Borrow:

- compact utility-shell discipline
- crisp control sizing
- desktop-native restraint

Do not borrow:

- dark launcher dominance
- gradient-heavy chrome
- command-palette mood in content areas

### 5.2 Apple

Borrow:

- headline restraint
- section pacing
- strong typographic confidence
- low-noise action treatment

Do not borrow:

- cinematic product-marketing scale
- oversized whitespace that reduces popup efficiency
- object-showcase composition logic

### 5.3 Notion

Borrow:

- reading comfort
- notebook calm
- soft dividers and quiet annotation behavior

Do not borrow:

- generic doc-app flatness
- low-contrast hierarchy
- indistinct cards with weak anchor points

### 5.4 Airtable

Borrow:

- modular information grouping
- structured card logic
- compact field/value legibility

Do not borrow:

- spreadsheet/database metaphor as the dominant UI
- rainbow colorfulness
- data grid behavior inside Compare reading flows

### 5.5 Linear

Borrow:

- compact status language
- disciplined density
- chip and rail semantics

Do not borrow:

- issue-tracker harshness as the main tone
- purple-heavy brand carryover
- over-minimal flatness that weakens evidence blocks

### 5.6 PostHog

Borrow:

- insight-card annotation energy
- "this is worth noticing" treatment

Do not borrow:

- dashboard dominance
- analytics panel clutter
- playful mascot/product-brand personality

## 6. Tokens

Global tokens remain the source of truth in [src/ui/tokens.ts](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/tokens.ts).

### 6.1 Color Roles

- `canvas`, `surface`, `elevated`
- `ink`, `subInk`, `softInk`
- accent A / accent B
- semantic success / warning / failure
- neutral evidence backgrounds
- technique accent rail colors

### 6.2 Typography Roles

- hero headline
- section label
- card title
- body
- caption
- micro

### 6.3 Radius / Shadow / Motion

Use one global scale only. Surface-specific borrowing must not create a second visual system.

## 7. Surface Rules

### 7.1 Popup Shell

Files:

- [src/ui/InPageCollectorApp.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/InPageCollectorApp.tsx)
- [src/ui/components.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/components.tsx)
- [src/ui/tokens.ts](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/tokens.ts)

Do:

- feel like a precise desktop tool
- keep shell styling quieter than content styling
- separate container from page background clearly

Don't:

- use shell chrome as the main focal area
- over-tint the container
- blur or shadow so much that content feels soft or vague

### 7.2 Compare Hero

File:

- [src/ui/CompareView.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CompareView.tsx)

Do:

- lead with one high-signal headline
- keep relation framing to one line
- keep stance/alignment in one compact row
- demote risk to supporting context

Don't:

- put expandable evidence blocks in the hero
- stack multiple competing summary cards
- make the hero louder than the selected cluster dock

### 7.3 Cluster Dock

File:

- [src/ui/CompareView.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CompareView.tsx)

Do:

- make selected cluster the main decision surface
- show top evidence here, not in the hero
- keep evidence first, then stance/meta, then related-cluster hint

Don't:

- treat evidence as footer trivia
- make related-cluster hints compete with actual evidence
- turn this into a dashboard tile grid

### 7.4 Casebook / Technique

File:

- [src/ui/TechniqueView.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/TechniqueView.tsx)

Do:

- feel like a notebook or reading strip
- support slower reading after fast compare
- use horizontal card rhythm intentionally

Don't:

- look like a settings list
- collapse into generic analytics cards
- bury evidence under decorative technique copy

### 7.5 Metric Chips / Status

Files:

- [src/ui/components.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/components.tsx)
- [src/ui/ProcessingStrip.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/ProcessingStrip.tsx)
- relevant status atoms inside [src/ui/CompareView.tsx](/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/CompareView.tsx)

Do:

- stay compact and usually single-line
- prioritize scan speed
- use semantic color sparingly and consistently

Don't:

- let chips wrap into noisy multi-line clouds unless unavoidable
- use high-saturation fills as decoration
- make status louder than evidence

## 8. Component Mapping

| Component | Surface | Rule |
|---|---|---|
| popup container | Popup shell | Raycast-first |
| tab/header chrome | Popup shell | Raycast-first |
| compare headline block | Compare hero | Apple-first |
| stance row | Compare hero | Apple + Notion |
| selected cluster detail | Cluster dock | Airtable-first |
| evidence cards | Cluster dock | Airtable + Notion |
| technique carousel | Casebook / Technique | Notion-first |
| metric chips | Metric chips / Status | Linear-first |
| processing strip | Metric chips / Status | Linear + Airtable |

## 9. Per-Surface Do / Don't

### Popup shell

Do:

- compact controls
- clean segmented navigation
- quiet borders

Don't:

- make the shell feel "premium" at the expense of clarity

### Compare hero

Do:

- one read, one conclusion, one next step

Don't:

- ask the user to read multiple card stacks before reaching clusters

### Cluster dock

Do:

- reward click/selection with evidence density

Don't:

- spend the vertical space on explanation chrome

### Casebook / Technique

Do:

- feel like saved interpretation notes

Don't:

- feel like a feature showcase

### Metric chips / Status

Do:

- read in under one second

Don't:

- require inspection to understand state

## 10. Agent Cheatsheet

- Building popup chrome? Think Raycast.
- Tightening a headline block? Think Apple.
- Making reading calmer? Think Notion.
- Structuring evidence modules? Think Airtable.
- Designing chips, rails, or status pills? Think Linear.
- Adding "worth noticing" annotations? Think PostHog, but only lightly.
- If it starts looking like a dashboard, pull back.
- If it starts looking like generic docs, add hierarchy.
- If it starts looking like marketing, compress it.

## 11. Before / After Examples

These examples are behavioral, not pixel-perfect mocks.

### 11.1 Compare Hero

Before:

- headline
- top evidence card stack
- author stance card A
- author stance card B
- alignment explanations
- risk warning card

After:

- headline
- one-line relation framing
- compact stance/alignment row
- subtle risk chips
- section rail immediately below

Interpretation:

- the hero tells the user what to read next
- the hero does not try to prove the case itself

### 11.2 Cluster Detail

Before:

- title
- generic summary
- meta strip
- evidence feels secondary

After:

- title
- thesis
- top evidence inside the dock
- remaining audience evidence
- support metrics
- compact author/meta strip

Interpretation:

- selection should increase evidence density, not explanatory chrome

### 11.3 Technique / Evidence

Before:

- vertical stack of neutral text blocks

After:

- horizontal notebook-style card strip
- each technique distinguished by a restrained accent rail
- scroll hint communicates there is more to read

Interpretation:

- this page should feel like deeper reading notes, not another compare dashboard

### 11.4 Metric Chips

Before:

- wrapped chips over two rows
- each chip carries extra padding and visual mass

After:

- one-line compact row
- icon badge + short value
- `1k+` shorthand for large numbers

Interpretation:

- metrics support the reading flow; they should not create their own layout problem

## 12. Approved Reference Previews

Local previews inside this repo:

- [docs/preview-macos-cards.html](/Users/tung/Desktop/dlens-chrome-extension-v0/docs/preview-macos-cards.html)
- [docs/preview-macos-selective-merge.html](/Users/tung/Desktop/dlens-chrome-extension-v0/docs/preview-macos-selective-merge.html)
- [docs/preview-v3-research-informed.html](/Users/tung/Desktop/dlens-chrome-extension-v0/docs/preview-v3-research-informed.html)

Usage rule:

- local previews are validation aids, not direct implementation targets
- if a local preview conflicts with this design system, this document wins
- if a borrowed external reference conflicts with DLens global invariants, DLens wins

## 13. Implementation Review Checklist

Before shipping any UI change:

- Does the surface still match its assigned primary source?
- Did the secondary source stay at micro-pattern level?
- Are global invariants still intact?
- Is evidence still easier to read than chrome?
- Did the surface become more dashboard-like than analysis-like?
- Did the change introduce a second shadow/radius/type scale?
- Did the A/B semantic color mapping remain stable?
- If the hero changed, is the cluster dock still the true reading center?
- If Technique changed, does it still feel like slower reading rather than another control panel?

## 14. Handoff Note For Future Sessions

If the next session is implementation-focused:

- read this file first
- then read [docs/product/2026-04-03-compare-frontend-brief.md](/Users/tung/Desktop/dlens-chrome-extension-v0/docs/product/2026-04-03-compare-frontend-brief.md)
- then inspect the exact target file being edited

This document defines the visual decision hierarchy. It does not replace implementation-specific acceptance criteria.
