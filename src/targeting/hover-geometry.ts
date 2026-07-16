// Hover geometry helpers and the injectable frame controller used by the
// Threads content script. The controller owns scheduling and dedupe; callers
// inject the one selected-card rect read performed by each processed frame.

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

export interface HoverFrameCandidate<Card, Strength extends string> {
  root: Card | null;
  strength: Strength | null;
}

export interface HoverFrameControllerOptions<
  Target,
  Card,
  Strength extends string,
  Rect extends HoverRectInput
> {
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  resolveCandidate(target: Target): HoverFrameCandidate<Card, Strength>;
  getCardId(card: Card): string;
  readRect(card: Card): Rect;
  publish(card: Card | null, strength: Strength | null, rect: Rect | null): void;
}

export interface HoverFrameController<Target> {
  enqueue(target: Target): void;
  cancel(): void;
}

/**
 * Coalesces pointer bursts, measures only the selected card, suppresses stable
 * geometry, and owns lifecycle cancellation. `cancel()` also publishes the
 * hidden state through the same dedupe path, so navigation/selection teardown
 * cannot leave a stale overlay or let an old frame consume a restarted target.
 */
export function createHoverFrameController<
  Target,
  Card,
  Strength extends string,
  Rect extends HoverRectInput
>(
  options: HoverFrameControllerOptions<Target, Card, Strength, Rect>
): HoverFrameController<Target> {
  let pendingTarget: Target | undefined;
  let hasPendingTarget = false;
  let frameHandle: number | null = null;
  let frameGeneration = 0;
  let lastPublishedCard: Card | null | undefined;
  let lastPublishedFingerprint: string | null = null;

  const publishCandidate = (candidate: HoverFrameCandidate<Card, Strength>) => {
    const card = candidate.root;
    const cardId = card ? options.getCardId(card) : null;
    const rect = card ? options.readRect(card) : null;
    if (
      lastPublishedCard === card &&
      !shouldPublishHover(lastPublishedFingerprint, cardId, candidate.strength, rect)
    ) {
      return;
    }
    options.publish(card, candidate.strength, rect);
    lastPublishedCard = card;
    lastPublishedFingerprint = hoverFingerprint(cardId, candidate.strength, rect);
  };

  return {
    enqueue(target) {
      pendingTarget = target;
      hasPendingTarget = true;
      if (frameHandle !== null) {
        return;
      }

      const scheduledGeneration = frameGeneration;
      frameHandle = options.requestFrame(() => {
        if (scheduledGeneration !== frameGeneration) {
          return;
        }
        frameHandle = null;
        if (!hasPendingTarget) {
          return;
        }
        const targetToProcess = pendingTarget as Target;
        pendingTarget = undefined;
        hasPendingTarget = false;
        publishCandidate(options.resolveCandidate(targetToProcess));
      });
    },
    cancel() {
      const handleToCancel = frameHandle;
      frameGeneration += 1;
      pendingTarget = undefined;
      hasPendingTarget = false;
      frameHandle = null;
      if (handleToCancel !== null) {
        options.cancelFrame(handleToCancel);
      }
      publishCandidate({ root: null, strength: null });
    }
  };
}
