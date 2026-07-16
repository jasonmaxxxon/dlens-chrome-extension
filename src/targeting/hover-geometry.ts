// Pure hover-dedup helpers shared by the Threads content script. They take a
// rect, they never read one — the single getBoundingClientRect() read stays in
// the content script so we honour "at most one layout read per processed frame".

/** Minimal rect shape the hover fingerprint needs (a DOMRect satisfies it). */
export interface HoverRectInput {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

const HIDDEN_FINGERPRINT = "hidden";

/**
 * Stable fingerprint of one hover publish: card identity + strength + on-screen
 * geometry rounded to whole pixels. A null `cardId` (or missing rect) means "no
 * card" and collapses to a single hidden marker so repeated hides fingerprint
 * identically. An empty-string cardId is a real card without a permalink and
 * stays distinct from the hidden marker.
 */
export function hoverFingerprint(
  cardId: string | null,
  strength: string | null,
  rect: HoverRectInput | null
): string {
  if (cardId === null || rect === null) {
    return HIDDEN_FINGERPRINT;
  }
  const top = Math.round(rect.top);
  const left = Math.round(rect.left);
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  return `card:${cardId}|${strength ?? ""}|${top},${left},${width},${height}`;
}

/**
 * Whether a hover update is worth publishing: true only when the incoming
 * card/strength/geometry differs from the previously published fingerprint.
 * Same card + same strength + same normalized rect (and repeated hides) → false.
 */
export function shouldPublishHover(
  previousFingerprint: string | null,
  cardId: string | null,
  strength: string | null,
  rect: HoverRectInput | null
): boolean {
  return hoverFingerprint(cardId, strength, rect) !== previousFingerprint;
}
