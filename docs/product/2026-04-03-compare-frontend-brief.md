# Compare Frontend Brief

Last updated: 2026-04-03

This brief is for the next Compare UI simplification pass.

It is intentionally presentation-only. It does not redefine clustering, evidence ranking, or backend contracts.

## Goal

Make Compare feel lighter, more navigable, and more obviously useful without changing the underlying data logic.

Success means:

- the first screen has 2-3 clear focal points, not 8 competing cards
- the user can understand the relationship between the two posts quickly
- the navigator feels like an entry point, not a decorative widget
- evidence remains the most grounded object in the UI
- secondary sections stop competing with the main compare story

## Current Problem

The current Compare page has enough information, but the presentation still over-compresses it:

- too many containers use the same card language
- too many labels and small headings compete for attention
- `Selected Cluster` is still fragmented into sub-cards
- `Engagement` and `Comments` are visually too close to primary content
- bubble maps still do not create a strong enough visual hierarchy

The result is a page that reads like a dense report, not a guided analysis surface.

## Design Direction

Keep:

- pure white background
- very light glass surfaces
- compact editorial tone
- A/B compare framing
- bubble map as pseudo-network navigator

Change:

- reduce card count
- increase whitespace between major zones
- group more content into a few larger panels
- give bubbles stronger major/minor contrast through size and tone
- demote secondary sections

The page should feel closer to an editorial workspace than a dashboard.

## What Claude Should Change

### 1. Reframe Compare into three major visual zones

The first screen should be organized as:

1. `Compare hero`
2. `Audience navigator board`
3. `Selected cluster dock`

Lower-priority sections should sit below that fold:

- engagement
- comments
- extra evidence or support material

Do not treat every subsection as a separate primary card.

### 2. Reduce card proliferation

Current anti-pattern:

- card inside card inside card
- `AUTHOR STANCE`, `AUDIENCE ALIGNMENT`, and `RELATED CLUSTER` each become isolated mini-cards

Target pattern:

- one large selected-cluster dock
- internal rows or strips inside the dock
- fewer borders, fewer repeated rounded rectangles

`AUTHOR STANCE`, `AUDIENCE ALIGNMENT`, and `RELATED CLUSTER` should become compact internal sections or tabs inside the selected-cluster dock, not independent floating cards.

### 3. Simplify the selected cluster dock

The selected-cluster area should use this reading order:

1. cluster title
2. thesis
3. support strip
4. evidence list
5. compact meta row:
   - author stance
   - audience alignment
   - related cluster

Visual guidance:

- keep the evidence list as the largest content block
- keep support metrics small and scannable
- make meta content compact and secondary
- do not let the dock turn back into a stack of equal-weight cards

### 4. Make bubble maps feel like real visual navigation

Bubble maps should communicate hierarchy before interaction.

Requirements:

- dominant cluster must be obviously larger
- secondary clusters must be clearly smaller
- minor clusters should read like background context, not equal peers
- hover state should add a preview halo
- selected state should add a stronger ring or glow than hover

Color direction:

- Post A keeps one indigo-led scale
- Post B keeps one amber-led scale
- each side should use tone steps, not many unrelated colors
- minor nodes should fade toward neutral

Do not place verbose labels inside the bubbles.
Use hover preview for names and share.

### 5. Increase asymmetry handling without breaking compare

When one side has fewer visible clusters:

- do not leave a mostly empty board
- enlarge the dominant node
- pack secondary nodes more intentionally

When one side has many visible clusters:

- make the main one clearly dominant
- keep minor nodes small and subdued
- preserve compare legibility rather than symmetry at all costs

The goal is not perfect bilateral symmetry.
The goal is readable compare structure.

### 6. Lower text density across the first screen

The first screen should not read like a memo.

Reduce:

- repeated headings
- long helper copy
- large blocks of explanatory prose

Prefer:

- one-line summaries
- compact helper copy
- tooltips for definitional text
- icon strips instead of sentence-like metric labels

`Audience alignment` should remain visibly secondary.
It is support copy, not a headline claim.

### 7. Demote engagement and comments

`Engagement` and `Comments` are important, but they should not visually fight the top compare story.

Presentation direction:

- collapsed or semi-collapsed by default
- lighter panel treatment
- less border emphasis
- summary-first presentation

They should feel like supporting reference zones.

### 8. Preserve strong interaction cues

The page should make clear that:

- bubble click changes the current investigation focus
- top evidence is actionable and grounded
- anchors are available for quick movement

Visual cues should help the user understand:

- what is selected
- what just changed
- where the page expects them to look next

## What Claude Must Not Change

Do not change:

- cluster merge logic
- evidence ranking logic
- compare brief wire shape
- backend contracts
- reply-tree assumptions
- alignment calculation logic
- cluster suppression rules
- network ownership or background messaging

This pass is presentation-only.

If a needed improvement depends on backend truth, leave a clear UI placeholder or visual affordance but do not invent new semantics.

## Suggested UI Tactics

These are good tactics for this pass:

- use larger panels with internal rows instead of many small cards
- rely on whitespace before relying on more borders
- reserve strongest visual treatment for:
  - compare hero
  - navigator board
  - selected-cluster dock
- use subtle separators for internal sections
- use motion only for hover, selection, and anchor-jump confirmation
- keep transitions short and quiet

## Visual Hierarchy Rules

### Primary

- compare hero
- navigator board
- selected-cluster dock

### Secondary

- top evidence strip
- support metrics
- author stance / alignment / related cluster meta

### Tertiary

- engagement
- comments
- helper copy

If a tertiary section feels as loud as a primary section, the pass is not done.

## Acceptance Checklist

This pass is successful when:

- the first screen no longer feels card-heavy
- selected cluster content reads as one dock, not four mini-cards
- bubble hierarchy is obvious without reading labels
- the user can identify the main compare story before scrolling
- engagement and comments feel secondary
- the page keeps the current trust improvements:
  - evidence-first
  - readable-proxy alignment
  - positive cluster display copy
  - jump navigation

## Handoff Note

This brief is paired with:

- [2026-04-03-compare-working-plan.md](/Users/tung/Desktop/dlens-chrome-extension-v0/docs/product/2026-04-03-compare-working-plan.md)
- [2026-04-02-compare-methodology.md](/Users/tung/Desktop/dlens-chrome-extension-v0/docs/product/2026-04-02-compare-methodology.md)

Use this brief when doing the next presentation pass in `CompareView`, `tokens.ts`, and shared UI atoms.
