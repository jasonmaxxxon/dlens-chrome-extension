# DLens Popup Workspace Redesign

Last updated: 2026-04-06
Status: Approved design spec before implementation

## 1. Scope

This spec defines the popup-wide UI redesign for the Chrome extension.

It covers:

- popup shell
- mode/navigation model
- Compare first-screen reading flow
- Library / Collect / Settings realignment
- shared visual language
- component responsibility map

It does not change:

- backend contracts
- compare semantics
- cluster logic
- evidence ranking
- reply-tree assumptions
- background network ownership

This is a redesign of the popup workspace, not a redesign of the analysis model.

## 2. Inputs And Constraints

Primary repo references:

- `docs/product/2026-04-06-dlens-design-system.md`
- `docs/product/2026-04-03-compare-frontend-brief.md`
- `AGENTS.md`

External reference matrix already approved in repo docs:

- Raycast for popup shell discipline
- Apple for hero hierarchy and restraint
- Notion for reading calm
- Airtable for modular evidence structure
- Linear for rails, chips, and state treatment
- PostHog only for light annotation energy

Core product identity that must survive the redesign:

- extension-first utility shell
- evidence-first reading
- white or near-white canvas
- dark text hierarchy
- `Post A` / `Post B` semantic mapping stays stable
- Compare remains the main reading surface

## 3. Product Model

The popup is a single workspace, not four equal tabs.

The workflow is:

- `Collect` = capture gate
- `Library` = preparation desk
- `Compare` = reading surface
- `Settings` = utility drawer

Cross-mode rule:

`Shared language, different jobs.`

Implementation reminder:

`Library should always bias toward returning the user to Compare; Collect should bias toward quick exit; Settings should bias toward disappearance.`

## 4. Shell Rules

The popup shell uses a Compare-first workspace model.

Approved shell rule:

`Use smart entry to choose the initial workspace mode, then preserve user control until the popup closes.`

### 4.1 Primary mode model

- Primary modes are only `Compare / Library / Collect`
- These are mode switches, not a toolbar and not a feature pile-up area
- `Library` must remain one jump away from `Compare`
- `Settings` stays outside the primary mode rail

### 4.2 Smart entry behavior

For this spec, `near-ready` has a strict meaning tied to the current state model in `src/state/processing-state.ts`.

`near-ready` means:

- an item whose readiness is `analyzing`

`near-ready` does not mean:

- `saved`
- `queued`
- `crawling`
- a speculative pair candidate inferred only from folder or topic context

When the popup opens:

- if at least 2 items are ready, enter `Compare`
- else if work is in progress or near-ready material exists, enter `Library`
- else enter `Collect`

After initial entry:

- user-selected mode must persist for the lifetime of that popup session
- background state updates may refresh content but may not seize mode control

### 4.3 Processing separation

- processing state is always independent from the mode rail
- processing context must not be expressed through active mode styling
- the mode rail cannot carry system-status meaning

## 5. Compare First-Screen Reading Flow

Compare first-screen content must answer only three questions:

1. Is this pair worth reading right now?
2. Which audience difference should be read first?
3. Should the user continue into clusters or return to Library?

### 5.1 First-screen order

The Compare reading sequence is:

1. hero conclusion
2. compact stance/alignment row
3. readiness / fallback bridge when needed
4. section rail
5. selected cluster dock

### 5.2 Hero rule

Hard rule:

`Hero directs; dock proves.`

The hero contains:

- one high-signal headline
- one-line relation framing
- compact Post A / Post B stance and alignment row
- subtle risk chips only

The hero must not contain:

- top evidence blocks
- multiple competing summary cards
- dashboard-like status panels

### 5.3 Selected cluster dock rule

The selected cluster dock is the first high-density content zone and the main decision surface.

Its reading order is:

1. cluster title
2. thesis
3. top evidence
4. remaining evidence
5. support metrics
6. compact meta row

Top evidence belongs here, not in the hero.

### 5.4 Compare unavailable bridge

When Compare is unavailable, the UI must keep the Compare reading language rather than switching to a different empty-state interface.

Hard rule:

`When Compare is unavailable, preserve the Compare reading language but suspend false navigation promises.`

Bridge form:

- same hero syntax
- one-line explanation
- one main action

Main action:

- stable primary action is `Go to Library`

Visibility rule:

- this bridge is a Compare-mode state, not a replacement for smart-entry landing
- in the default flow, smart entry should still send the user to `Library` when no compare-ready pair exists
- the bridge is primarily for users who manually switch into `Compare` before a pair is ready

The bridge must not become:

- a system dashboard
- a metrics panel
- a large status explainer

### 5.5 Section rail behavior

- the section rail is a reading guide, not a second tab system
- it appears in full only when Compare is truly available
- when Compare is unavailable, it must be weakened or suspended

## 6. Library / Collect / Settings Rules

### 6.1 Library

Library is the primary fallback mode and the preparation desk for Compare.

Its first-screen priorities are:

- readiness context
- ready or near-ready materials
- in-progress materials
- actions that move the user toward Compare

Library must avoid reverting to folder-first IA.

Rule:

- folders may remain as organizing aids
- folders must not outrank the preparation logic of `ready / near-ready / in-progress`

State mapping for Library:

- `ready` = compare-ready material
- `near-ready` = `analyzing`
- `in-progress` = `queued` or `crawling`
- `saved` remains pending inventory, not preparation priority

Preparation cards must show compare affordance, not just item inventory.

### 6.2 Collect

Collect is a low-friction capture station, not an analysis page.

Its first-screen priorities are:

- current preview
- save state
- destination folder
- minimal engagement context

Collect should intentionally contrast with Compare:

- Compare = dense reading center
- Collect = quick single-card decision surface

### 6.3 Settings

Settings behaves like a utility drawer even if it is temporarily implemented as a page.

It should be:

- narrower in feeling
- lighter in section weight
- focused on runtime configuration
- free of hero framing, onboarding copy, or marketing tone

## 7. Shared Visual Language

This redesign does not introduce a second theme. It rewrites the existing token semantics into a tighter popup-wide language.

Guiding rule:

`Calm shell, disciplined rails, evidence-forward surfaces, and status that never competes with reading.`

### 7.1 Color semantics

- `canvas` stays near-white and quiet
- `surface` is the default content plane
- `elevated` is reserved for focus-changing surfaces
- `line` becomes a disciplined structural divider
- accent colors remain compare-specific semantics
- status colors remain local state hints only

Hard rule:

`Semantic color belongs to meaning, not decoration.`

Constraints:

- `accent A / accent B` are for compare semantics, not shell decoration
- status colors must never dominate a page
- processing, settings, and shell chrome must not borrow compare accent logic

### 7.2 Surface hierarchy

Use only three surface levels:

1. shell surface
2. content surface
3. focused surface

Focused surface is scarce.

Hard rule:

`Elevation is permission, not default.`

Only surfaces that change user focus or decision density may become focused/elevated.

### 7.3 Typography

Use one popup-wide type system:

- hero headline
- card title
- body
- caption
- micro

Section labels must be reduced, not just visually softened.

Rule:

- not every block gets a section label
- spacing and titles should do most hierarchy work

### 7.4 Chips and status

Chips and rails must be role-pure.

- mode rail = navigation only
- processing strip = system context only
- status chip = local state only

Chips should be:

- compact
- usually single-line
- semantically sparse
- visually lighter than evidence content

### 7.5 Motion

Motion only supports:

- workspace continuity between modes
- hover/selected control feedback
- gentle reading hints on scrollable surfaces

Motion must not exist to make the UI feel luxurious.

## 8. Component Responsibility Map

Rule:

`Each component should either orient, prepare, prove, capture, or configure — never two or three at once.`

Implementation check:

`If a component cannot be described by one verb, it is doing too much.`

### 8.1 Mode rail

Verb: orient

- contains only `Compare / Library / Collect`
- active state means only current mode
- active treatment must not imply processing or readiness state

### 8.2 Utility edge

Verb: configure-access

- lightweight shell-edge actions
- includes Settings access
- lower visual priority than the mode rail

### 8.3 Processing strip

Verb: orient-system

- separate from mode rail
- answers whether the user can move forward
- keeps summary grain intentionally small
- detailed breakdown stays in Library, not in the strip

### 8.4 Compare hero

Verb: orient

- headline
- relation framing
- compact stance/alignment row
- subtle risk chips

### 8.5 Section rail

Verb: guide

- guides reading inside Compare
- never acts like a competing tab system

### 8.6 Selected cluster dock

Verb: prove

- evidence-dense
- focus-changing
- highest content density in Compare

### 8.7 Library preparation cards

Verb: prepare

- show readiness and compare-next relationship
- bias actions toward entering Compare
- do not behave like generic inventory cells

### 8.8 Collect main card

Verb: capture

- single-card decision surface
- low friction
- minimal supporting context

### 8.9 Settings drawer

Verb: configure

- runtime configuration only
- light visual treatment
- should feel temporary and dismissible

### 8.10 Technique / Casebook reading strip

Verb: deepen

- supports slower reading after fast compare
- holds saved interpretation notes, technique cards, and representative evidence
- uses notebook-strip rhythm rather than dashboard-card rhythm
- must not compete with the selected cluster dock for first-screen authority

## 9. Token And Component Implementation Targets

The redesign should primarily touch:

- `src/ui/tokens.ts`
- `src/ui/components.tsx`
- `src/ui/InPageCollectorApp.tsx`
- `src/ui/ProcessingStrip.tsx`
- `src/ui/CollectView.tsx`
- `src/ui/LibraryView.tsx`
- `src/ui/CompareView.tsx`
- `src/ui/TechniqueView.tsx`
- `src/ui/SettingsView.tsx`

Expected implementation sequence:

1. rewrite shared tokens and shared atoms
2. rebuild shell and mode rail behavior
3. rebuild processing strip separation
4. redesign Compare first screen and selected dock
5. redesign Library as preparation desk
6. simplify Collect into single-card capture
7. restyle Settings to drawer logic without changing page-backed container mechanics in this pass
8. align Technique / Casebook with slower-reading notebook-strip behavior

## 10. Acceptance Checklist

Before implementation is considered correct, verify:

- popup reads as one workspace, not four equal tabs
- `Compare / Library / Collect` behave as pure mode switches
- processing remains visually and structurally separate from mode switching
- smart entry only selects the initial mode
- user mode control is preserved until popup close
- Library remains one jump away from Compare
- Compare hero directs without proving
- selected cluster dock remains the true reading center
- Compare unavailable uses bridge language, not dashboard empty state
- Compare unavailable bridge appears as a Compare-mode state, not as the default landing substitute for Library
- Library favors preparation logic over folder-first IA
- Collect is visibly simpler and faster than Compare
- Settings feels drawer-like even if page-backed
- Technique / Casebook has a distinct slower-reading role and does not compete with Compare first-screen hierarchy
- elevated surfaces are rare and responsibility-based
- semantic color stays attached to meaning, not decoration

## 11. Implementation Notes For The Next Session

This spec authorizes an implementation pass that changes:

- page entry shape
- primary/secondary navigation shape
- popup first-screen hierarchy
- shell/component hierarchy
- token and shared atom semantics

It does not authorize semantic invention. If a visual improvement requires backend truth, the implementation should expose a clearer placeholder or affordance rather than invent new analysis logic.
