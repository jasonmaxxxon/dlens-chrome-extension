# Product Action Verdict Intake Design

**Date:** 2026-07-20
**Status:** Approved for implementation
**Scope:** Product mode Saved Signals and Action routes in the MV3 popup

## Outcome

Product mode becomes a three-stage workflow with one owner per responsibility:

1. `採集` owns hover preview and collection.
2. `訊號` owns processing readiness, analysis start/retry, and source lifecycle management.
3. `行動` owns model reading, verdict navigation, review, and action-brief export.

The Saved Signals route remains the Product home. It is visually reduced to a compact intake instead of being merged into Collect, because persisted page, hydration, and route guards already depend on `saved-signals`.

## Saved Signals

The route keeps the existing readiness panel and replaces the reading wall with:

- a four-cell pipeline ledger: collected, ready to analyze or retry, processing, complete; persisted analysis errors with a ready source belong to the retryable cell;
- a default-collapsed management disclosure;
- one-line source rows containing only an identifier, processing state, and delete action;
- aggregate processing errors and the existing analyze/retry command.

The route removes verdict filter tabs, batch-selection checkboxes, inline readings, source-truth strips, exact quotations, and all export UI.

## Product Action

The existing single large stage card remains the primary reading surface. Above it, restore the 0.3.52 four-tile verdict selector as a navigation control:

| Bucket | Visible label | Membership |
| --- | --- | --- |
| `try` | 值得嘗試 | completed, non-noise `verdict: try` |
| `park` | 噪音 / 前提不符 | completed `verdict: park` or `signalType: noise` |
| `insufficient` | 資料不足 | completed, non-noise `verdict: insufficient_data` |
| `watch` | 保留觀察 | completed, non-noise `verdict: watch` |

The visual order stays `try → park → insufficient → watch`. Default selection prefers a non-empty actionable bucket (`try`, then `watch`) before a non-actionable bucket (`park`, then `insufficient`). Empty tiles remain visible but disabled.

Clicking a tile commits the bucket change. Hover only changes tint, border, elevation, and count scale. A shared colored plate slides behind the active tile. Keyboard Left/Right/Home/End moves between enabled tiles.

Within a bucket, the large card uses text-labelled previous/next buttons and an `n / total` status. Dots are removed. Each bucket remembers its last selected signal. The stage keeps directional entrance motion for visual tile order and previous/next movement, with the global reduced-motion safety net.

`try` and `watch` cards retain the full observation → takeaway → next-step sequence, source-truth icons, exact evidence quote, reading generation, and review. They also expose an `加入行動簡報` toggle.

`park` and `insufficient` use the same outer card geometry but show only the verdict-appropriate reason, source truth, and exact evidence. They do not expose next steps, reading generation, review, or brief selection. The old duplicate collapsed exclusion lanes are removed.

Signals exclusively owns analysis start and retry. Action owns reading, review, and export; when no analysis exists, Action keeps the four disabled verdict tiles and directs the user back to Signals instead of exposing a readiness recovery path or analysis control.

## Action Brief Export

Rename the Saved-owned export surface to `ProductActionBriefExport` and render it only after the Action stage in a collapsed shelf.

- Action-local selected IDs are driven by the active `try/watch` card toggle.
- Only completed non-noise `try/watch` signals can enter the selected action brief.
- The shelf shows a compact selected summary, original-first/decision-compact mode, and copy action.
- HTML/JSONL export remains explicitly scoped to the whole folder and has one Action-route owner.
- Reading generation is not duplicated inside export.
- Selection is pruned when the active session or available eligible signals change.
- Recovered analyses without backing signals cannot be selected or exported as an action brief.

## Motion, Responsive, and Accessibility

- Verdict tiles use native buttons inside a labelled tablist with `aria-selected` and `aria-controls`.
- Selected state is communicated by text, border, plate, and count, not color alone.
- Tile and paging targets are at least 44px high.
- Four columns collapse to a 2×2 grid below the existing Atlas narrow breakpoint.
- Plate motion uses token-owned durations/easing; the stage keeps token-owned keyframes.
- The existing global `prefers-reduced-motion` rule collapses all transitions and animation durations.

## Non-goals

- No change to Product analysis, evidence, reading, packet, or background message contracts.
- No route deletion or persisted-page migration.
- No restoration of the old multi-card Action wall or retired review workspace.
- No automatic selection of excluded or insufficient signals for an action brief.
