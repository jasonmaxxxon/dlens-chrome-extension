# Product Attention Surface Fix Design

## Goal

Correct the Product mode attention visuals so the beam illuminates the whole
meaningful surface, not a small text-shaped pill. Restore the depth, rounded
geometry, and information hierarchy already used by the Product inbox.

This is a visual ownership fix to the existing AI Attention System. It does not
change verdict policy, recommendation data, model prompts, storage, Product
Import, or release version.

## Product principle

Attention belongs to a complete user-meaningful region:

```text
AI is generating       -> moving light across the whole generation panel
recommendation ready   -> static light across the whole recommendation card
ordinary action button -> normal rounded button; no independent beam
neutral information    -> no beam
```

The beam must never wrap only a title, label, icon, or button text. Those
content-level wrappers caused the narrow rectangle and curved left edge seen in
the current build.

## Surface ownership

### Generating

In Product mode, the moving beam wraps the complete panel that owns the active
AI operation:

- signal analysis: the full analysis-status panel;
- deep reading: the full deep-reading operation panel.

The busy button inside the panel keeps its dark rounded treatment, bright 20px
Searching Orb, busy text, disabled state, and `aria-busy`. It does not own a
second beam.

Only the active operation surface animates. Success, error, idle, crawling,
queue, hydration, retry wait, and passive counters render no moving beam.

### Actionable recommendation

Each valid `try` application suggestion receives one static attention treatment
on the complete “可能用法 · 待驗證” card. The title is ordinary card content and
must not carry its own beam or curved accent.

`watch`, non-noise `park`, `noise`, and `insufficient_data` cards remain
neutral. “加入行動簡報” is a normal rounded CTA with existing hover/focus
feedback; it must not contain a beam around its label.

## Visual material

The repaired surfaces reuse the Product inbox language instead of introducing a
new card system:

- large shared card radius (`cardLg`);
- the existing atlas paper/glass gradient;
- the existing atlas card shadow and subtle border;
- clipped, full-surface light at the outer card boundary;
- adequate inset spacing so the beam never touches text.

The application suggestion card restores hierarchy without adding more prose:

1. a compact header row for “可能用法 · 待驗證” and capability status;
2. separated content blocks for source pattern, fit reason, and small test;
3. a quieter verification/evidence area;
4. the Agent handoff as a distinct footer row.

Spacing, subtle dividers, background tone, and type weight create the hierarchy.
No decorative curve, nested pill beam, or flat uninterrupted text stack remains.

## Shared primitive boundary

Introduce or adapt a block-level attention surface primitive that owns the outer
element and its clipping. `SearchingOrb` remains the single orb primitive.

Content-level `AttentionBeam` use is removed from Product buttons and headings.
The implementation must not change a `span` inside a button into a block element
or produce invalid nested interactive markup.

The shared motion registry remains the only keyframe owner. Under
`prefers-reduced-motion: reduce`, generating surfaces show a static illuminated
edge and the orb is static. Text remains the primary status signal.

## Automated acceptance

- Analysis generation places `data-attention-beam="generating"` on the complete
  analysis-status surface, not inside the analysis button label.
- Deep-reading generation places the generating marker on the complete
  deep-reading surface, with no nested beam in its button.
- A valid `try` suggestion places the actionable marker on the complete
  application card; its heading has no nested marker.
- “加入行動簡報” contains no attention-beam marker.
- Watch, park, noise, and insufficient cards do not render actionable light.
- Component/render tests lock the full-surface ownership and prevent nested
  attention markers.
- Existing motion-owner, typecheck, boundary, seam, full test, build, bundle,
  and `git diff --check` gates pass.

## Real Chrome acceptance

Using the real loaded extension and a real Threads page:

- the generating light fills the whole analysis or deep-reading panel and
  visually matches the approved searching-orb mockup;
- no small illuminated rectangle or curved stripe appears around button text or
  “可能用法 · 待驗證”;
- the complete application card has rounded glass depth, gradient, shadow, and
  a restrained static illuminated edge;
- the CTA remains clearly clickable without becoming a second competing light;
- narrow popup layout, hover, keyboard focus, pager transitions, success, error,
  and reduced-motion states remain usable.

Static tests and a direct extension URL do not count as this runtime proof.

