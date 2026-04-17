# Compare Working Plan

Last updated: 2026-04-03

This note turns the current compare discussion into an execution-oriented working plan.

Boundary note: this plan keeps `dlens-chrome-extension-v0` focused on UI, read-model consumption, and extension-side summaries. It does not move production crawler or clustering runtime into this repo. Any item that needs canonical clustering, reply-tree analysis, or better evidence ranking is called out explicitly as backend-dependent work.

## Core Goal

Make Compare a trustworthy decision entry point before turning it into a larger intelligence system.

That means the near-term product should help a user:

- understand what these two posts are broadly about
- see the strongest audience evidence quickly
- navigate between summary, clusters, engagement, and comments without getting lost
- avoid false-precision labels that look smarter than the underlying data

The goal is not to maximize UI density. The goal is to make the current compare object honest, navigable, and useful.

## Working Assumptions

- The current product object is still primarily `post compare`, not a full `issue intelligence` workspace.
- `Compare Brief`, `Audience Navigator`, `Selected Cluster Detail`, `Engagement`, and `Comments` currently mix post-level and discussion-level objects in one page.
- That mixing is acceptable for now as long as the transitions between those layers are made explicit.
- Better backend cluster quality will raise the product ceiling, but the extension still has meaningful UX and trust work it can do immediately.

---

## Immediate Extension Work

These items should be implemented in `dlens-chrome-extension-v0` without waiting for ingest-core changes.

### 1. Evidence becomes more visible earlier

Current problem:

- evidence is currently the most grounded part of Compare but remains too deep in the page

Immediate work:

- surface 2-3 strongest evidence quotes higher in the Compare page
- keep selected-cluster evidence as the detailed drill-down layer
- preserve current click-to-open evidence cards to keep detail panels clean

Success criteria:

- a user can see meaningful audience proof before fully exploring all cluster detail

### 2. Navigator becomes a real entry point

Current problem:

- bubble maps look like an exploratory control, but they still behave too much like isolated widgets
- users can click a bubble but do not yet get enough location and hierarchy feedback

Immediate work:

- bubble click should scroll to the corresponding selected-cluster section and apply a short visual highlight
- Compare should expose section anchors or quick links for:
  - Brief
  - Clusters
  - Engagement
  - Comments
- hover should remain preview-only
- click should remain the only selection lock

Success criteria:

- users can jump directly from top-level cluster navigation to grounded evidence without manual scanning
- the page feels like a workspace, not a long static report

### 3. Lower the visual weight of false-precision labels

Current problem:

- labels like `Oppose`, `Mixed`, and `Momentum: Developing` still read as more authoritative than they are

Immediate work:

- audience alignment should become a lower-weight badge with a short explanation
- add tooltip or compact helper copy describing what the alignment axis actually means
- momentum should stay available but be visually demoted below raw engagement
- remove any copy that implies hard classification if the underlying signal is only heuristic

Success criteria:

- users are less likely to over-trust soft inference labels

### 4. Replace suspicious count language with positive display language

Current problem:

- copy like `+46 low-signal clusters hidden` foregrounds what the UI is suppressing and creates distrust

Immediate work:

- navigator headline should prefer:
  - `Showing 2 most significant clusters`
  - `Showing 5 most significant clusters`
- hidden-count copy should move to a lower-priority supporting line
- raw backend cluster count should not drive the main narrative

Success criteria:

- the UI describes what is being shown, not what is being withheld

### 5. Improve Compare Brief as an honest reading layer

Current problem:

- the current brief explains differences, but it still does not answer the user's first question:
  - "How should I think about this?"

Immediate work:

- split compare brief into two levels:
  - instant read: headline + simple relation framing
  - analyst read: claim contrast / emotion contrast / risk signals / evidence
- ensure author stance is a real summary, not a raw text clip
- keep current brief grounded in existing compare payload rather than introducing new unverified labels

Success criteria:

- the first screen gives orientation, not just analysis density

### 6. Improve trust around local API keys

Current problem:

- password-manager behavior around API key fields makes the extension feel unsafe

Immediate work:

- use password-style input handling for API keys
- reduce browser password-manager confusion where possible
- make local-storage / direct-to-provider behavior explicit in settings copy

Success criteria:

- key entry feels intentional, not like a random web form

### 7. Improve loading and state honesty

Current problem:

- processing states still feel too abrupt or too empty

Immediate work:

- add stronger waiting surfaces for compare loading
- make crawl / analyze / brief-generation phases readable
- prefer honest animated placeholders over precise fake ETA

Success criteria:

- users can tell whether the system is busy, waiting, or ready without guessing

---

## Backend-Dependent Work

These items require changes in `dlens-ingest-core` to materially improve compare quality. The extension should not try to fake these in its own display layer.

### 1. Better evidence ranking

Current backend ceiling:

- evidence quality is still too dependent on simplified ranking

Needed backend work:

- select evidence using more than one dimension
- balance:
  - high interaction
  - cluster representativeness
  - discussion-turning or reply-generating value

Why this matters:

- the extension can only present evidence well if the backend gives it a trustworthy pool

### 2. Small-cluster merge and dominant-topic cleanup

Current backend ceiling:

- some posts still produce too many tiny clusters for the actual scale of discussion

Needed backend work:

- post-pass merge of very small nearby clusters
- stronger single-dominant-cluster fallback when the discussion is actually narrow

Why this matters:

- otherwise the extension must suppress too much and appears to be hiding output

### 3. Reply-tree in normalized and analysis payloads

Current backend ceiling:

- the extension still lacks formal reply-structure context

Needed backend work:

- carry parent/child discussion structure through normalized payload
- let analysis output expose branch emergence and discussion turns more explicitly

Why this matters:

- rare insight, timeline shift, and stronger evidence selection all depend on reply structure

### 4. Better cluster pairing inputs

Current backend ceiling:

- extension-side cluster relatedness is still a heuristic hint

Needed backend work:

- either improve pairing hints in backend output
- or emit enough relationship metadata that the extension can make better related-cluster displays

Why this matters:

- without better pairing, compare remains partly rank-driven even when the UI gets better

### 5. Stronger summary grounding signals

Current backend ceiling:

- summary surfaces are still limited by the shape and consistency of cluster outputs

Needed backend work:

- cleaner cluster thesis signals
- stronger canonical evidence attribution
- better cluster-level semantic consistency

Why this matters:

- extension-side AI summaries can become more honest when backend cluster objects are less noisy

---

## New Feature Proposals

These are valid product features, but they should be treated as additions rather than bug fixes.

### 1. Soft compare reaction

Feature:

- add a lightweight user reaction near the top of Compare without pretending the system already does canonical issue matching

Examples:

- `Seems related`
- `Feels different`
- `Need more evidence`

Why:

- gives the compare page explicit user context
- collects lightweight signal without forcing premature classification

Dependency:

- extension-only at first

Important constraint:

- avoid a hard `Same issue / Different issue / Unsure` gate until the product object and backend pairing quality are more mature

### 2. Decision Card

Feature:

- convert the brief into a compact action-oriented decision surface

Suggested shape:

- risk level
- dominant audience mood
- suggested operator stance
- 2-3 recommended actions or cautions

Why:

- this is the first clear bridge from analysis to operator decision-making

Dependency:

- should come after summary honesty and evidence trust are stronger

### 3. Response draft generation

Feature:

- generate 2-3 response styles from the current compare brief using the user's configured provider

Why:

- shifts the tool from analysis-only toward action support

Dependency:

- should not ship before compare object quality is more stable

### 4. Exportable report

Feature:

- export a compare session as a PDF or structured summary

Why:

- directly useful for analysts, PR, policy, and reporting workflows

Dependency:

- should come after Compare structure stabilizes

### 5. Lightweight save/bookmark for compares

Feature:

- save a compare result, key evidence, or selected cluster state

Why:

- useful only once there is a clear downstream destination or review workflow

Dependency:

- should remain lightweight until the product has a stronger object than raw post compare

### 6. Rare insight / alert rail

Feature:

- surface unusual shifts or outliers separately from the main compare brief

Examples:

- branch emergence
- timeline shift
- small-but-high-engagement outlier cluster

Dependency:

- strongly backend-dependent if it is meant to be trustworthy

---

## Deferred Architecture Path

These are longer-term direction choices, not current implementation tasks.

### 1. Move from `post compare` toward `issue candidate`

Current truth:

- the current product is still primarily a post-level comparison console with discussion signals

Deferred architecture direction:

- eventually promote the product object toward something like:
  - issue candidate
  - discussion candidate
  - related-post cluster workspace

Why defer:

- the current extension can still create value by making post compare trustworthy
- forcing a full object migration too early would create churn without enough grounded backend support

### 2. Separate post-level and discussion-level layers more clearly

Current truth:

- Compare currently mixes:
  - post-level objects: post headers, engagement, age
  - discussion-level objects: clusters, evidence, audience mood

Deferred architecture direction:

- introduce clearer layer transitions or separate surfaces once the product object matures

Why defer:

- the immediate product need is usability and trust, not full object refactoring

### 3. Avoid expanding extension-side analysis into backend-runtime territory

Current truth:

- `src/analysis/*` and `src/compare/*` include useful shaping logic and ports, but they are not the production clustering engine

Deferred architecture rule:

- do not let the extension slowly become a second backend analysis runtime
- keep canonical clustering, evidence generation, and reply-aware analysis in ingest-core

Why defer:

- this is a boundary rule for future decisions, not a feature to implement now

### 4. Evolve Compare into one step inside a larger triage workspace

Current truth:

- Compare is the strongest current surface

Deferred architecture direction:

- in the future, Compare should likely sit inside a larger triage workflow:
  - collect
  - stage
  - compare
  - decide
  - export / respond / save

Why defer:

- current effort should focus on making Compare honest and useful before making it one module inside a larger intelligence workspace

---

## Recommended Order Of Execution

### Near-term extension sequence

1. Evidence raised earlier in Compare
2. Navigator jump + section anchors
3. False-precision label downgrade
4. Positive cluster-count language
5. Better author stance + two-layer compare brief
6. API key trust fixes
7. Better loading and state surfaces

### Backend sequence

1. Better evidence ranking
2. Small-cluster merge
3. Reply-tree in payload
4. Stronger pairing hints

### Feature sequence

1. Soft compare reaction
2. Decision Card prototype
3. Response draft
4. Export report
5. Bookmark/save

## Decision Rule

If a change can be described as:

- making the current compare page more navigable
- making evidence more visible
- making labels less misleading
- making the UI more honest about what it knows

then it belongs in immediate extension work.

If a change requires:

- better cluster formation
- better evidence ranking
- reply structure
- canonical discussion relationships

then it belongs in backend-dependent work.

If a change introduces:

- a new operator action
- a new report/export path
- a new workflow object

then it is a new feature proposal and should not be hidden inside a trust-fix sprint.
