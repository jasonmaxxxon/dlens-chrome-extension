# Two-Page Evidence-First Product Plan

Last updated: 2026-04-04

This note restores the current two-page product direction after the Compare iterations on 2026-04-02 through 2026-04-04.

The purpose is not to add more analysis into the same popup page. The purpose is to stop Compare from becoming a dense wall of cards and labels, while preserving the original DLens intent:

- help users identify dangerous, guiding, or stance-bearing discussion patterns
- keep evidence visible and grounded
- avoid fake precision
- let useful discourse tactics become reusable analyst objects later

This is an evidence-first plan, not an ideology-classifier plan.

---

## Current Acceptance Notes (2026-04-06)

The current two-page shape is directionally correct, but three concrete gaps are now visible in the live UI:

### 1. Near-duplicate clusters are still splitting

Examples like:

- `航班調整影響`
- `香港快運航班調整`

should often read like the same discussion object to a human.

If they render as separate clusters, that is primarily a **backend quality problem**, not a Compare presentation problem.

The likely fixes belong in `dlens-ingest-core`:

- better evidence ranking
- better small-cluster merge
- better related-cluster / cluster-pairing signals

The extension may soften the display, but it should not pretend to solve semantic cluster merge in the UI.

### 2. Audience evidence metrics should become icon-first

The current evidence cards should use a shared extension-side compact metrics row.

The preferred presentation is:

- one compact row
- four small icons
- likes / comments / reposts / forwards

This is an **extension presentation task** and should apply to:

- selected-cluster evidence cards
- deeper-reading evidence rows
- later saved casebook entries when evidence is shown inline

Status:

- implemented in Compare selected-cluster cards
- implemented in `Technique / Evidence`
- still available for future casebook-card inline reuse

### 3. Technique / Evidence needs Chinese card presentation

The current placeholder technique rows were structurally useful, but the English-only presentation was not the right product language.

The next safe step is not "more theory". It is:

- Chinese-friendly technique cards
- one short label
- one short explanation
- optional why-this-matters line
- evidence-bound reading

The product should feel like an analyst notebook, not a theory dump.

Status:

- Chinese-first technique cards are now the intended default shape
- English aliases remain secondary metadata only

### 4. Library should evolve toward a saved cluster / technique casebook

The current saved-reading shell is promising because it already moves beyond "saved posts".

The preferred evolution is:

- save evidence
- save cluster reading
- save technique card
- save user note

Near-term extension shape:

- keep `Library` as the top-level tab
- split internally into `Posts / Casebook`
- keep post staging and casebook reading as separate sub-views

That makes Library more like a reusable discourse casebook.

It should not become:

- a long AI report archive
- a fake-academic memo store
- a hard-classification vault

---

## Core Product Rule

The current product should not try to answer:

- "Is this definitely AI?"
- "Is this definitely astroturfing?"
- "Is this definitely propaganda?"

The current product should answer:

- "What is the dominant narrative here?"
- "What are the strongest audience reactions?"
- "What discussion techniques or rhetorical patterns might be present?"
- "What evidence supports that reading?"

Internal theory can be rich. User-facing claims must stay sparse and grounded.

---

## Why A Two-Page Model

The current Compare page is trying to carry too many jobs at once:

- post-level compare
- discussion-level cluster navigation
- evidence reading
- interpretive labels
- engagement support
- comments browsing

That creates two problems:

1. the page feels dense even when the content is useful
2. the most grounded object (evidence) gets buried under navigation and support panels

The fix is not to add more containers. The fix is to split responsibilities.

---

## Page 1: Compare

### Purpose

`Compare` is the fast decision-entry page.

It should answer, in order:

1. what relationship these two posts have
2. what the dominant audience narratives are
3. where the strongest evidence lives

It is not the page for deep tactic reading, academic framing, or long explanations.

### Primary jobs

- compare two ready posts
- show the shortest honest summary
- show the dominant clusters or most significant visible clusters
- surface top evidence early
- let the user jump into the relevant cluster quickly

### First-screen structure

The first screen should stay limited to three major zones:

1. `Compare hero`
2. `Audience navigator`
3. `Selected cluster dock`

Everything else is below the fold or visually demoted.

### Compare hero

Should contain:

- one-line headline
- lightweight relation framing
  - for example: `Post A pushes the mainstream grievance; Post B adds a narrower counter-reading`
- 2-3 strongest evidence quotes
- section rail:
  - `Clusters`
  - `Engagement`
  - `Comments`

Should not contain:

- long memo-style prose
- academic references
- overconfident ideological naming

### Audience navigator

Should contain:

- A/B bubble maps
- visible cluster count phrased positively:
  - `Showing 3 most significant clusters`
  - `Showing 1 dominant cluster`
- hover preview
- click-to-lock selection
- jump to selected-cluster dock

Should not contain:

- verbose methodological explanations
- backend raw cluster counts as primary narrative

### Selected cluster dock

Should contain:

- cluster title
- one-line thesis
- compact support strip
- audience evidence list
- compact meta row:
  - author stance
  - audience direction
  - related cluster hint

Should not contain:

- three separate mini-cards for stance / alignment / related cluster
- long fallback prose blocks

### Supporting sections below the fold

- `Engagement`
- `Comments`

These are support/reference surfaces, not the main story.

They should stay:

- collapsed or visually demoted
- lighter than the first-screen zones

---

## Page 2: Technique / Evidence

### Purpose

`Technique / Evidence` is the deeper reading page.

This page exists because the original DLens goal is not just to compare posts. It is to help a user recognize:

- guiding discussion techniques
- rhetoric with stance or pressure effects
- potentially manipulative framing
- reusable discourse patterns

The key difference from Compare:

- `Compare` says what is happening at a high level
- `Technique / Evidence` says how the discussion is being constructed

### Primary jobs

- show tactic-like readings of clusters
- define those readings in human language
- bind every interpretation to evidence
- let users save evidence or tactics to a later notebook/casebook

### Safe content for this page

This page may show:

- technique badges
  - `Deflection`
  - `Fear framing`
  - `Normalization`
  - `Echo`
  - `Narrative shift`
- short definitions
- multiple-angle readings
- strongest evidence
- why that evidence supports the reading

### Unsafe content for this page

This page should not show:

- "This is definitely AI"
- "This is definitely a troll farm"
- "This cluster is objectively propaganda"
- academic citation theater as front-stage product language
- long pseudo-scholarly reports

### Best output shape

The page should feel like an analyst notebook, not a dashboard.

A useful block looks like:

- `Technique badge`
- `Short meaning`
- `Evidence`
- `Why this matters`
- `Save to library`

---

## Library Evolution

### Current truth

`Library` is already interesting because it is a human curation layer, not just storage.

That is closer to the old DLens vault idea than the old long-form reports were.

### Correct near-term direction

The next useful version of Library is not "more folders".

It is:

- saved evidence
- saved technique readings
- saved cluster observations
- saved response/discourse patterns

In other words, Library should gradually become a `casebook`, not just a saved-post tray.

### Candidate saved objects

Safe save targets:

- evidence quote
- cluster thesis
- technique badge
- user note
- compare insight summary

Unsafe save targets:

- unsupported hard classifications
- long AI-generated theory text
- ideology labels with weak evidence grounding

---

## What Requires Backend

These improvements cannot be honestly solved in the extension alone.

### 1. Better evidence ranking

Needed for:

- stronger top evidence
- more representative cluster reading
- less brittle compare hero

Backend should rank for:

- interaction
- representativeness
- reply-generating value

### 2. Small-cluster merge

Needed for:

- cleaner bubble maps
- less suppression
- more believable dominant-cluster views

### 3. Reply-tree / branch structure

Needed for:

- branch emergence
- narrative shift
- head vs tail dynamics
- stronger suspicious-coordination heuristics

### 4. Suspicious behavior signals

If the product ever wants to hint at:

- coordination
- astroturf-like behavior
- unusually repetitive discourse

that must come from backend signals, not frontend guesswork.

### 5. Better cluster pairing

The extension can do a display-level related-cluster hint.

But real cross-post cluster pairing quality will eventually require backend help.

---

## What Extension Can Do Now

These are safe, useful, and compatible with the current repo boundary.

### Compare page

- continue slimming the first screen
- strengthen sticky rail / section navigation
- support evidence-to-cluster and cluster-to-evidence movement
- demote false-precision labels
- use more honest wording for heuristics

### Technique / Evidence page

- build the page shell
- add placeholder technique row UI
- add static, user-friendly technique definitions
- convert placeholder English rows into Chinese-first technique cards
- keep the deeper-reading page card-based and notebook-like, not report-like
- keep the row hidden when no signals exist yet

### Library

- allow saving evidence
- allow saving a technique badge with context
- allow user notes
- shape saved readings as a reusable cluster / technique casebook instead of a generic archive

All of those can begin in `chrome.storage.local` without backend schema changes.

---

## What Can Be Borrowed From Other Products

Borrow interaction patterns, not borrowed truth claims.

### Good references

- `Ground News`
  - for bias/angle badges and spectrum-like reading hints
- `AllSides`
  - for short "side A sees X / side B sees Y" framing
- `Bellingcat`
  - for evidence-first investigation style
- `Obsidian`
  - for notebook / casebook / saved-interpretation patterns
- `HKDSE 通識`
  - for multiple-angle reading with evidence, not one "correct answer"

### Wrong things to borrow

- sentiment dashboard overload
- KPI-heavy social listening boards
- overconfident stance labels
- academic paper tone in the user-facing UI

---

## What To Keep From Old DLens, And What To Reject

### Keep as internal analytic scaffolding

These ideas are useful if treated as internal lenses:

- discourse strategies / rhetorical tactics
- homogeneity or split signals
- head-vs-tail change detection
- framing-oriented readings
- multiple-angle interpretation prompts

### Reject as direct user-facing UI language

These are likely to create AI slop if shown directly:

- L0 / L1 / L2 / L3 naming
- sector labels as hard truth
- scholar citations in main output
- long pseudo-academic reports
- any strong claim that requires theory to sound persuasive

### Translation rule

If a concept needs academic jargon to be understandable, it should probably stay internal.

If a concept can be reduced to:

- `possible tactic`
- `possible reading`
- `discussion pattern`
- `why this matters`

then it may be safe for user-facing output.

---

## Product Doctrine

### Honest scope

DLens today is still primarily:

- a post-level comparison console
- with discussion-level evidence and cluster signals

It is not yet a full issue-intelligence system.

### Safe promise

DLens should help users:

- see the main narratives
- inspect the strongest evidence
- recognize possible rhetoric or manipulation patterns
- preserve useful discourse examples

### Unsafe promise

DLens should not yet promise:

- definitive bot detection
- definitive astroturf detection
- definitive ideology or propaganda labeling

---

## Recommended Next Sequence

### Immediate extension work

1. keep slimming Compare first screen
2. strengthen sticky section rail
3. add evidence-to-cluster reverse jump
4. create a Technique / Evidence page shell
5. support saved evidence and saved technique notes in Library

### Backend-dependent next step

1. evidence ranking upgrade
2. small-cluster merge
3. stronger related-cluster / cluster-pairing signals
4. reply-tree into normalized + analysis payload

### New feature layer after that

1. decision card
2. library as casebook
3. saved tactic notebook
4. exportable analyst snapshot

---

## Final Rule

Do not let old DLens theory disappear.

Do not let old DLens theory speak directly to users either.

The right move is:

- keep the theory as an internal lens
- translate only the grounded parts into compact user-facing signals
- always bind interpretation to visible evidence
