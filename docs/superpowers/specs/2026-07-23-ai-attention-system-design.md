# AI Attention System Design

## Goal

Use one coherent visual grammar for moments that deserve user attention: active AI generation and ready-to-act recommendations.

## Boundary

This is an independent UX package from Verdict Policy. It may ship in the same release but must use separate commits, tests, and acceptance.

## Attention grammar

```text
dynamic beam + Searching Orb = AI is actively generating
static beam                  = a completed action is worth attention now
no beam                      = reading, observation, background work, or neutral state
```

The 20px light-theme Searching Orb is adapted from the approved `thinking-orbs` mockup. Dark buttons keep the bright orb for contrast. Existing Border Beam styling remains the visual source for the attention edge.

## Scope allow-list

Apply the generation state only to user-triggered AI work:

- Product signal analysis and deep reading;
- Topic judgment, keyword synthesis, and audit report generation;
- PR criteria, summary, and narrative generation;
- Compare analysis preview;
- Folder synthesis.

Explicitly exclude backend crawling, queue pending, hydration, retry waiting, storage synchronization, and passive processing counters.

## Shared primitives

Create shared UI primitives with one motion/keyframe owner:

```tsx
<SearchingOrb size={20} />
<AttentionBeam state="generating" | "actionable" | "none" />
```

The implementation may expose a small wrapper for busy button content, but must not duplicate orb markup or keyframes in each View.

Generating state:

- orb, moving beam, current busy text, disabled/busy button, and `aria-busy`;
- the current error and success states still terminate the animation.

Actionable state:

- static beam or accent edge;
- no orb and no continuous motion;
- reserved for try application suggestions and primary action CTAs.

Neutral state:

- watch guidance, park, insufficient, noise, crawl, queue, hydrate, and retry use no attention beam.

## Reduced motion and accessibility

Under `prefers-reduced-motion: reduce`, render a static orb and static beam. Text remains the primary status label. Motion is never the sole state indicator. Busy buttons remain keyboard- and screen-reader-readable.

## Acceptance

- Shared component tests cover generating, actionable, none, and reduced-motion hooks.
- Existing motion registry remains the single keyframe owner.
- Every allow-listed user-triggered AI action uses the shared primitive.
- Excluded background states do not render the orb.
- Bundle growth is measured; do not hide unexpected growth with an unlimited re-baseline.
- Real Chrome verifies idle -> generating -> success/error, dark-button contrast, reduced motion, narrow popup, and no simultaneous distracting beams.

