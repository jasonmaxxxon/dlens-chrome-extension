import type { ReactionPattern } from "../compare/topic-audit";

export interface CompassBubble {
  id: string;
  label: string;
  nComments: number;
  counterCount: number;
  x: number;
  y: number;
  r: number;
  /** LLM-read valence the bubble was placed from, before any layout nudge; null on field layouts. */
  valence: number | null;
  /** LLM-read mode the bubble was placed from, before any layout nudge; null on field layouts. */
  mode: number | null;
  /** Pixels between the drawn centre and the centre the scalars asked for. 0 when the bubble sits on its own reading. */
  nudgePx: number;
}

export interface SignalAtlasCompassLayout {
  /** compass = every pattern carries LLM-read valence/mode; field = at least one lacks them (pre-0.3.20 audits) */
  kind: "compass" | "field";
  width: number;
  height: number;
  bubbles: CompassBubble[];
  /** How many bubbles overlap relaxation pushed off their read coordinates. */
  nudgedCount: number;
}

// The compass is the L0 protagonist: generous whitespace, bubbles never crowd or kiss edges.
const COMPASS_WIDTH = 640;
const COMPASS_HEIGHT = 400;
const FIELD_HEIGHT = 248;
const RADIUS_MIN = 18;
const RADIUS_MAX = 40;
const EDGE_PADDING = 18;
const LABEL_CLEARANCE = 34;
const SEPARATION_GAP = 18;
const RELAX_ITERATIONS = 48;
/** Below a pixel the bubble still reads as sitting on its own coordinate; don't claim a nudge. */
const NUDGE_REPORT_PX = 1;

function radiusFor(nComments: number, maxComments: number): number {
  const ratio = Math.sqrt(Math.max(0, nComments)) / Math.sqrt(Math.max(1, maxComments));
  return RADIUS_MIN + ratio * (RADIUS_MAX - RADIUS_MIN);
}

function clampBubble(bubble: CompassBubble, width: number, height: number): void {
  bubble.x = Math.max(bubble.r + EDGE_PADDING, Math.min(width - bubble.r - EDGE_PADDING, bubble.x));
  bubble.y = Math.max(bubble.r + EDGE_PADDING, Math.min(height - bubble.r - LABEL_CLEARANCE, bubble.y));
}

/** Distance each bubble ended up from the centre its own scalars asked for. */
function recordNudges(bubbles: CompassBubble[], anchors: ReadonlyArray<{ x: number; y: number }>): number {
  let nudgedCount = 0;
  bubbles.forEach((bubble, index) => {
    const anchor = anchors[index];
    if (!anchor) {
      return;
    }
    bubble.nudgePx = Math.hypot(bubble.x - anchor.x, bubble.y - anchor.y);
    if (bubble.nudgePx >= NUDGE_REPORT_PX) {
      nudgedCount += 1;
    }
  });
  return nudgedCount;
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
        r: radiusFor(pattern.nComments, maxComments),
        valence: pattern.valence ?? null,
        mode: pattern.mode ?? null,
        nudgePx: 0
      };
      clampBubble(bubble, width, height);
      return bubble;
    });
    // Anchors are read after clamping: the edge guard is part of what the reading can ask for.
    const anchors = bubbles.map((bubble) => ({ x: bubble.x, y: bubble.y }));
    separateBubbles(bubbles, width, height);
    const nudgedCount = recordNudges(bubbles, anchors);
    return { kind: "compass", width, height, bubbles, nudgedCount };
  }

  const width = COMPASS_WIDTH;
  const height = FIELD_HEIGHT;
  const slot = width / Math.max(1, patterns.length);
  const bubbles = patterns.map((pattern, index) => {
    // Two staggered rows so horizontally adjacent labels never share a baseline.
    const bubble: CompassBubble = {
      id: pattern.id,
      label: pattern.label,
      nComments: pattern.nComments,
      counterCount: pattern.counterRefs.length,
      x: slot * (index + 0.5),
      y: index % 2 === 0 ? 78 : 168,
      r: radiusFor(pattern.nComments, maxComments),
      // Field slots are an arrangement, not a reading — there is no true coordinate to be nudged off.
      valence: null,
      mode: null,
      nudgePx: 0
    };
    clampBubble(bubble, width, height);
    return bubble;
  });
  separateBubbles(bubbles, width, height);
  return { kind: "field", width, height, bubbles, nudgedCount: 0 };
}

/**
 * Per-post reaction composition, counted from the patterns' evidence-bound refs
 * (real LLM assignments, not an estimate). Returns shortCode → counts aligned
 * with the incoming pattern order, so callers can colour by the same palette index.
 */
export function postReactionMixByShortCode(patterns: ReadonlyArray<ReactionPattern>): Map<string, number[]> {
  const mix = new Map<string, number[]>();
  patterns.forEach((pattern, patternIndex) => {
    const refs = new Set([...pattern.supportRefs, ...pattern.representativeRefs]);
    for (const ref of refs) {
      const dot = ref.indexOf(".");
      if (dot <= 0) {
        continue;
      }
      const shortCode = ref.slice(0, dot);
      const counts = mix.get(shortCode) ?? new Array<number>(patterns.length).fill(0);
      counts[patternIndex] = (counts[patternIndex] ?? 0) + 1;
      mix.set(shortCode, counts);
    }
  });
  return mix;
}
