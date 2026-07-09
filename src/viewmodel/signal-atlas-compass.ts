import type { ReactionPattern } from "../compare/topic-audit";

export interface CompassBubble {
  id: string;
  label: string;
  nComments: number;
  counterCount: number;
  x: number;
  y: number;
  r: number;
}

export interface SignalAtlasCompassLayout {
  /** compass = every pattern carries LLM-read valence/mode; field = at least one lacks them (pre-0.3.20 audits) */
  kind: "compass" | "field";
  width: number;
  height: number;
  bubbles: CompassBubble[];
}

const COMPASS_WIDTH = 360;
const COMPASS_HEIGHT = 320;
const FIELD_HEIGHT = 172;
const RADIUS_MIN = 13;
const RADIUS_MAX = 32;
const EDGE_PADDING = 10;
const LABEL_CLEARANCE = 22;
const SEPARATION_GAP = 6;
const RELAX_ITERATIONS = 48;

function radiusFor(nComments: number, maxComments: number): number {
  const ratio = Math.sqrt(Math.max(0, nComments)) / Math.sqrt(Math.max(1, maxComments));
  return RADIUS_MIN + ratio * (RADIUS_MAX - RADIUS_MIN);
}

function clampBubble(bubble: CompassBubble, width: number, height: number): void {
  bubble.x = Math.max(bubble.r + EDGE_PADDING, Math.min(width - bubble.r - EDGE_PADDING, bubble.x));
  bubble.y = Math.max(bubble.r + EDGE_PADDING, Math.min(height - bubble.r - LABEL_CLEARANCE, bubble.y));
}

/** Deterministic pairwise relaxation — no randomness, same input always yields the same layout. */
function separateBubbles(bubbles: CompassBubble[], width: number, height: number): void {
  for (let iteration = 0; iteration < RELAX_ITERATIONS; iteration += 1) {
    let moved = false;
    for (let i = 0; i < bubbles.length; i += 1) {
      for (let j = i + 1; j < bubbles.length; j += 1) {
        const a = bubbles[i]!;
        const b = bubbles[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = a.r + b.r + SEPARATION_GAP;
        if (distance >= minDistance) {
          continue;
        }
        // Overlapping identical centres: push apart along a fixed axis so the result stays deterministic.
        const ux = distance > 0.0001 ? dx / distance : 1;
        const uy = distance > 0.0001 ? dy / distance : 0;
        const push = (minDistance - distance) / 2;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        clampBubble(a, width, height);
        clampBubble(b, width, height);
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
}

export function layoutSignalAtlasCompass(patterns: ReadonlyArray<ReactionPattern>): SignalAtlasCompassLayout {
  const maxComments = Math.max(1, ...patterns.map((pattern) => pattern.nComments));
  const hasCompassScalars = patterns.length > 0
    && patterns.every((pattern) => Number.isFinite(pattern.valence) && Number.isFinite(pattern.mode));

  if (hasCompassScalars) {
    const width = COMPASS_WIDTH;
    const height = COMPASS_HEIGHT;
    const centerX = width / 2;
    const centerY = height / 2;
    const reachX = width / 2 - RADIUS_MAX - EDGE_PADDING;
    const reachY = height / 2 - RADIUS_MAX - LABEL_CLEARANCE;
    const bubbles = patterns.map((pattern) => {
      const bubble: CompassBubble = {
        id: pattern.id,
        label: pattern.label,
        nComments: pattern.nComments,
        counterCount: pattern.counterRefs.length,
        x: centerX + (pattern.valence ?? 0) * reachX,
        y: centerY - (pattern.mode ?? 0) * reachY,
        r: radiusFor(pattern.nComments, maxComments)
      };
      clampBubble(bubble, width, height);
      return bubble;
    });
    separateBubbles(bubbles, width, height);
    return { kind: "compass", width, height, bubbles };
  }

  const width = COMPASS_WIDTH;
  const height = FIELD_HEIGHT;
  const slot = width / Math.max(1, patterns.length);
  const bubbles = patterns.map((pattern, index) => {
    const bubble: CompassBubble = {
      id: pattern.id,
      label: pattern.label,
      nComments: pattern.nComments,
      counterCount: pattern.counterRefs.length,
      x: slot * (index + 0.5),
      y: index % 2 === 0 ? 62 : 96,
      r: radiusFor(pattern.nComments, maxComments)
    };
    clampBubble(bubble, width, height);
    return bubble;
  });
  separateBubbles(bubbles, width, height);
  return { kind: "field", width, height, bubbles };
}
