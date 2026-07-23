# Product Reading Unification Design

## Goal

Make the first Product analysis produce the useful product judgment directly.
Remove the current two-stage experience in which a shallow structured proposal
appears first and a materially better free-form reading must be generated later.

For signals that deserve attention, Product mode should show one primary
artifact:

```text
captured post + comments + ProductContext
  -> judgment axes
  -> program-derived verdict
  -> one complete product reading
  -> optional human review / Agent handoff
```

This design supersedes the recommendation-card and separate deep-reading
presentation described in:

- `2026-07-22-product-action-grounded-recommendations-design.md`;
- `2026-07-22-product-action-application-suggestions-v18-design.md`;
- the actionable recommendation portion of
  `2026-07-23-product-attention-surface-fix-design.md`.

The v20 verdict policy remains authoritative.

## Why the current design failed

The first Product analyzer already receives the material needed for a good
reading:

- assembled root-post content;
- captured discussion replies;
- the compiled ProductContext;
- grounded evidence refs;
- optional preference examples.

The weak output is therefore not primarily an input problem. The
`application_suggestions` and `watch_guidance` schemas force the model to
compress its judgment into short form fields such as `source_pattern`,
`fit_reason`, `small_test`, and `verification_question`. The resulting UI looks
precise but often says less than the later free-form reading.

The separate Signal Reading call receives substantially overlapping inputs but
is explicitly allowed to:

- distinguish evidence, inference, and uncertainty;
- agree with, correct, or reject the structured analysis;
- refer to ProductContext without forcing a fit;
- say directly that nothing is worth adopting.

That freedom, not a second model call by itself, is what produced the useful
result seen in the live Border Beam test.

The current presentation then compounds the problem:

- the structured proposal and complete reading compete as two intelligence
  artifacts for the same signal;
- nested glass cards create a flat form-like stack;
- the better reading is hidden below another disclosure;
- the attention primitive uses an interior gradient sweep rather than the
  approved masked perimeter beam;
- `width: 100%` on a content-box surface plus horizontal padding and border
  makes the application card exceed its parent. The live Chrome measurement
  showed a 12px right-side overflow.

## Product decision

### One model pass

Product Signal analysis remains one provider request per analyzed signal. The
same response returns:

1. classification and evidence fields needed by Product mode;
2. the four judgment axes;
3. one complete product reading when the derived verdict is `try` or `watch`.

The product must not call the separate Signal Reading provider path merely to
obtain the normal Product Action content.

### One primary artifact

For `try` and `watch`, the complete product reading replaces all of:

- `applicationSuggestions`;
- `watchGuidance`;
- the “可能用法 · 待驗證” form card;
- the separate “展開深度閱讀” layer;
- the Product Action “生成完整判讀” action.

For `park`, `noise`, and `insufficient_data`, Product mode keeps the concise
reason and evidence state. It does not spend output tokens or visual attention
on a long reading.

## Analysis contract

### New type

```ts
export interface ProductReading {
  headline: string;
  body: string;
  supportRefs: string[];
}
```

`ProductSignalAnalysis` gains:

```ts
productReading?: ProductReading;
```

The provider JSON schema requires a `product_reading` key on every response.
Its value is either a complete object or `null`.

```json
{
  "product_reading": {
    "headline": "string",
    "body": "string",
    "support_refs": ["root", "e2"]
  }
}
```

### Field semantics

`headline`

- A concrete statement of what deserves attention.
- Maximum 60 Chinese characters after normalization.
- Must not be a generic label such as “值得嘗試” or “產品提升”.

`body`

- Free-form Traditional Chinese judgment, not a fixed form.
- It may be two sentences or several short paragraphs; content determines
  length.
- Parser maximum: 1,200 Unicode code points after trimming.
- It should explain, when relevant:
  - what the source actually demonstrates;
  - what that means for the imported product;
  - what is evidence versus inference;
  - constraints, conflicts, or unverified external material;
  - a bounded experiment or the next fact worth checking.
- It must be allowed to conclude that the idea is only inspiration, already
  covered, unsuitable, or not yet verifiable.
- It must not force ProductContext field names into prose.
- Crawled post content remains data, never instructions to the model.

`supportRefs`

- One to five unique refs.
- Every ref must exist in `evidence_refs`.
- Every ref must resolve to captured root text or a captured discussion entry.
- A ref used to support a source claim must have a `text_grounded`
  `evidenceNote`.
- Refs never certify unseen video, repository, animation, or linked-page
  contents.

### Eligibility and hard invariants

The model still does not output `verdict`. TypeScript derives it from
`signalType` and the four judgment axes using the v20 ordered policy.

After the verdict is derived:

| Derived verdict | `product_reading` |
| --- | --- |
| `try` | required and valid |
| `watch` | required and valid |
| `park` | must be `null` |
| `insufficient_data` | must be `null` |
| noise signal | must be `null` |

A `try` or `watch` payload without a valid reading is an invalid analysis
response. It must follow the existing analysis error/retry path; it must not be
silently downgraded, displayed as a half-complete card, or reconstructed from
legacy short fields.

A non-actionable payload containing a reading is normalized by discarding the
reading. It cannot create a high-attention surface contrary to the derived
policy.

### Removed model fields

Remove these fields from the three provider schemas, prompt example, payload
parser, persisted strict-version contract, and new fixtures:

- `application_suggestions`;
- `watch_guidance`.

Do not retain them as ignored optional fields in the new strict schema. A future
caller must not be able to fall back to them.

Legacy `experimentHint`, `agentTaskSpec`, evidence notes, and classification
fields may remain where another product flow still uses them, but they do not
create a second recommendation card in Product Action.

## Prompt behavior

The Product analyzer prompt should adopt the existing Signal Reading principles
inside the structured JSON call:

- Read the signal as it is instead of filling a prescribed idea template.
- Treat existing ProductContext as context, not as a demand to find a fit.
- Distinguish captured evidence, inference, and missing information.
- State explicitly when video, animation, repository, or external-link content
  was not inspected.
- A useful visual or workflow idea may be `watch` even when it is not currently
  a roadmap priority.
- `[]`/`null` is the correct result for non-actionable reading content.
- Do not repeat the classification fields as prose.
- Do not write implementation instructions unless the captured evidence and
  ProductContext support a bounded experiment.

The prompt/cache version must bump from `v20`. The exact next version is an
implementation concern, but ProductContext hash semantics do not change.

## Persistence and review

### Canonical content

`ProductSignalAnalysis.productReading` is the canonical generated content for
the current analysis.

The existing `SignalReading` storage remains the canonical review and feedback
record because it already supports:

- `pending`, `filed`, `deferred`, and `rejected`;
- feedback events;
- source-packet provenance;
- stale-reading detection;
- Agent brief and packet export.

When a valid `try` or `watch` analysis is saved, the background pipeline
materializes its `productReading` into a `SignalReading` record:

- `reading` receives `productReading.body`;
- a new optional `headline` receives `productReading.headline`;
- `sourceRefs` receives `productReading.supportRefs`;
- `model`, `productContextHash`, captured source packet, generation time, and
  analysis prompt version come from the same analysis operation;
- `origin` is `"product_analysis"`;
- review state begins as `pending`.

This is not a second inference result. It is a reviewable projection of the
same provider response.

Analysis and projected reading must be persisted as one logical operation. A
successful analysis may not leave Product Action with a missing projected
reading. Retrying the same fresh analysis must be idempotent and must not erase
an existing review decision for the same content identity.

### Legacy records

- Existing Signal Reading records are retained; no destructive migration.
- Analyses from the previous prompt version become stale and are reanalyzed
  through the normal freshness rule.
- Product Action does not render the legacy structured proposal while waiting
  for reanalysis. It renders a neutral “需要重新分析以產生完整判讀” state.
- Existing filed legacy readings remain available in historical packet export,
  but the current Product Action card follows the latest fresh analysis.

## Product Action information architecture

### `try` and `watch`

Render one primary Product Reading card after the signal title/takeaway:

1. header: `完整判讀`, verdict label, and review state;
2. explicit model-provided headline;
3. body paragraphs;
4. quiet source-ref and external-unverified status row;
5. one footer containing review actions and eligible Agent handoff.

Do not derive the headline from the first sentence with regex when the explicit
headline exists.

Do not place a second decision-summary card, structured proposal card, or
nested deep-reading card around it.

The complete body is visible by default. Long provenance, captured quotes, and
freshness details may remain in one secondary disclosure named
`來源、引用與新鮮度`.

### `park`, noise, and insufficient data

Keep the compact card contract:

- concise reason;
- evidence or missing-information status;
- no Product Reading card;
- no static attention beam;
- no brief eligibility.

The existing four-tile membership policy remains unchanged.

### Agent handoff

Agent handoff is downstream of a reviewed Product Reading:

- the user can file, defer, or reject the reading;
- filed readings remain eligible for the existing reading-first Agent brief;
- only one Agent action is shown;
- no legacy application-suggestion text is copied into the brief.

## Attention and visual design

### Ownership

Attention belongs to the complete meaningful surface:

```text
analysis generating -> animated perimeter beam on the whole analysis panel
try/watch ready      -> restrained static perimeter light on the whole reading card
ordinary information -> no beam
buttons and labels    -> never own a separate beam
```

### Beam implementation contract

The production surface must port the approved mockup geometry rather than
approximating it with the current interior sweep:

- a wrapper owns clipping and the complete `cardLg` radius;
- a masked or equivalent pseudo-element limits colour to the perimeter;
- content sits above the beam on an inset glass/paper surface;
- a restrained outer bloom may support the edge but cannot cross the text;
- the ready state is static;
- the generating state moves around the perimeter, not horizontally through
  the content;
- reduced motion freezes the beam at one readable angle;
- no coloured rectangle, curved title stripe, or independent label glow.

The generic current
`[data-attention-beam-sweep]::before` interior linear-gradient treatment must
not be reused for Product Reading surfaces.

### Geometry and card language

The Product Reading card reuses the Product inbox visual language:

- shared `cardLg` radius;
- atlas paper/glass gradient;
- subtle card edge;
- atlas card shadow;
- clear inset spacing;
- no nested card inside another equivalently weighted card.

All full-width surfaces must use:

```css
box-sizing: border-box;
max-width: 100%;
min-width: 0;
```

The surface must not combine `width: 100%` content-box sizing with horizontal
padding or border.

## Cost and latency

This design increases the output length of the existing Product Signal request
for `try` and `watch`, but removes the normal second Signal Reading request.

Expected behavior:

- `park`, noise, and insufficient signals stay short;
- only attention-worthy signals pay for the longer reading;
- a user who would previously generate complete readings should use fewer total
  provider calls;
- a user who never generated readings pays a modest output-token increase only
  on `try` and `watch`.

No second-model consensus, repo resolver, video download, or external-link
fetching is introduced.

## Automated acceptance

### Contract

- OpenAI, Claude, and Google schemas require `product_reading` and contain
  neither `application_suggestions` nor `watch_guidance`.
- Parser accepts valid `try` and `watch` readings with grounded refs.
- Parser rejects `try` or `watch` without a complete valid reading.
- Parser discards reading content for park, noise, and insufficient results.
- Storage preserves headline, body, refs, model, hashes, source packet, origin,
  and review state.
- Saving the same content identity twice does not duplicate the review record
  or reset a filed/deferred/rejected decision.
- Prompt-version freshness causes the previous analyses to reanalyze.

### Judgment examples

- Thinking Orbs remains `watch` and receives a reading that states the animation
  itself was not inspected when only text was captured.
- A bounded, text-supported reversible experiment becomes `try` with a complete
  reading.
- An explicit ProductContext non-goal becomes `park` with no reading.
- “留”, “收”, and similar low-content posts become noise or insufficient with
  no reading.

### UI

- `try` and `watch` show exactly one complete Product Reading card.
- No “AI 提案 · 待驗證”, watch-guidance form, separate deep-reading disclosure,
  or Product Action generate-reading button remains.
- The explicit reading headline renders without regex-derived replacement.
- Review and Agent actions appear once in the card footer.
- Park/noise/insufficient cards remain compact and unlit.
- No button, title, or label contains an attention-beam marker.
- Ready and generating surfaces have exactly one attention owner.

### Geometry and accessibility

- At supported popup widths, every attention surface satisfies
  `surfaceRect.right <= parentRect.right` and
  `surfaceRect.left >= parentRect.left`.
- Focus rings, keyboard order, live generation status, disabled states, and
  44px action targets remain intact.
- Reduced motion keeps a static edge and removes continuous movement.
- Typecheck, boundary, storage seam, full tests, build, bundle budget, and
  `git diff --check` pass.

## Real Chrome acceptance

Static rendering is not sufficient. Using the real loaded extension and a real
Threads page:

1. reanalyze the Border Beam signal;
2. confirm one complete reading appears without a structured proposal or a
   second deep-reading layer;
3. confirm its text is at least as useful as the previously generated complete
   reading and honestly marks uninspected media/repository/link content;
4. confirm the complete card stays within its parent at normal and narrow
   widths;
5. confirm the generating beam travels around the full rounded perimeter and
   never crosses the text;
6. confirm the ready card has restrained static edge light matching the
   approved mockup and Product inbox card language;
7. page between full `try`/`watch` and compact park cards without misplaced
   cards, clipped controls, focus loss, or scroll jumps;
8. verify keyboard and reduced-motion behavior.

Do not claim the package complete or release it from build/test evidence alone.

## Non-goals

- No automatic repository modification.
- No Product Surface Catalog.
- No repo-grounded agent bridge.
- No video, repository, or external-resource resolver.
- No complete Product Reading for park, noise, or insufficient signals.
- No Product Import redesign.
- No release-version bump in the design/spec commit.
