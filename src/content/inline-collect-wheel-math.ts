import { tokens } from "../ui/tokens";
/** Public lock aliases: design values have exactly one owner. */
export const COLLECT_WHEEL_LOCK = { ...tokens.collectWheel, spring: tokens.motion.collectWheel.spring } as const;
export type Point = {
  x: number;
  y: number;
};
export interface WheelGeometry {
  R: number;
  r0: number;
  S: number;
  c: number;
  dead: number;
}
export type GestureMode = "hold" | "flick" | "key";
export interface GestureCoordinates {
  origin: Point;
  pointer: Point;
  center: Point;
  mode: GestureMode | null;
}
export const tMid = (i: number) => -90 + i * 90;
export function buildWheelGeometry(): WheelGeometry {
  const R = COLLECT_WHEEL_LOCK.radius;
  const r0 = Math.round(R * COLLECT_WHEEL_LOCK.innerRatio);
  const S = 2 * (R + COLLECT_WHEEL_LOCK.canvasPadding);
  return { R, r0, S, c: S / 2, dead: Math.round(r0 * COLLECT_WHEEL_LOCK.deadRatio) };
}
export function sectorPath(c: number, rIn: number, rOut: number, a0: number, a1: number, gap: number): string {
  const rad = Math.PI / 180;
  const oPad = (gap / 2) / rOut / rad, iPad = (gap / 2) / rIn / rad;
  const P = (r: number, a: number) => [(c + r * Math.cos(a * rad)).toFixed(2), (c + r * Math.sin(a * rad)).toFixed(2)];
  const [x0, y0] = P(rOut, a0 + oPad), [x1, y1] = P(rOut, a1 - oPad), [x2, y2] = P(rIn, a1 - iPad), [x3, y3] = P(rIn, a0 + iPad);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0}A${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3}Z`;
}
export function idxFrom(dx: number, dy: number, dead = buildWheelGeometry().dead): number {
  if (Math.hypot(dx, dy) < dead) {
    return -1;
  }
  return Math.floor(((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 45 + 720) % 360) / 90);
}
/** v9 F01: only clamped hold / S changes its aiming origin. */
export function selectGesture(g: GestureCoordinates, opening = false): {
  dx: number;
  dy: number;
  index: number;
  jitter: boolean;
} {
  const dx = g.pointer.x - g.origin.x, dy = g.pointer.y - g.origin.y;
  const clamped = g.center.x !== g.origin.x || g.center.y !== g.origin.y;
  if (!clamped || g.mode === "flick") {
    return { dx, dy, index: idxFrom(dx, dy), jitter: false };
  }
  if (opening || Math.hypot(dx, dy) < COLLECT_WHEEL_LOCK.jitterPx) {
    return { dx: 0, dy: 0, index: -1, jitter: true };
  }
  const drawnDx = g.pointer.x - g.center.x, drawnDy = g.pointer.y - g.center.y;
  return { dx: drawnDx, dy: drawnDy, index: idxFrom(drawnDx, drawnDy), jitter: false };
}
export function releaseGesture(g: GestureCoordinates, selected: number, source: "pointer" | "key"): "commit" | "sticky" | "cancel" {
  if (selected >= 0) {
    return "commit";
  }
  const dead = buildWheelGeometry().dead;
  const nearPress = Math.hypot(g.pointer.x - g.origin.x, g.pointer.y - g.origin.y) < dead;
  const clamped = g.center.x !== g.origin.x || g.center.y !== g.origin.y;
  const nearDrawn = clamped && g.mode !== "flick" && Math.hypot(g.pointer.x - g.center.x, g.pointer.y - g.center.y) < dead;
  return source === "pointer" && (nearPress || nearDrawn) ? "sticky" : "cancel";
}

export interface TopicRingSegment {
  index: number; more: boolean; a0: number; a1: number;
  x: number; y: number; rotation: number; width: number; labelHeight: number;
}
/** Annular segments and tangent labels, relative to the drawn wheel centre. */
export function buildTopicRing(R: number, topicCount: number, more: boolean): TopicRingSegment[] {
  const n = Math.min(5, Math.max(0, topicCount));
  const t = tokens.collectWheel.topicRing;
  const span = n <= 3 ? t.smallSpan : t.largeSpan, start = -90 - span * n / 2;
  const rl = R + (t.innerOffset + t.outerOffset) / 2;
  return Array.from({ length: n }, (_, index) => {
    const a0 = start + index * span, a1 = a0 + span, mid = (a0 + a1) / 2;
    const a = mid * Math.PI / 180;
    return { index, more: more && index === n - 1, a0, a1, x: rl * Math.cos(a), y: rl * Math.sin(a), rotation: mid + 90,
      width: Math.round(2 * Math.PI * rl * span / 360) - t.labelInset, labelHeight: t.labelHeight };
  });
}
export function hitTopicRing(R: number, segments: readonly TopicRingSegment[], dx: number, dy: number): number | null {
  const t = tokens.collectWheel.topicRing, r = Math.hypot(dx, dy);
  if (r < R + t.hitInnerOffset || r > R + t.hitOuterOffset) return null;
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  // The physical gap is angular at the inner edge, so it stays empty across the band.
  const pad = t.gap / 2 / (R + t.innerOffset) * 180 / Math.PI;
  return segments.find(s => a >= s.a0 + pad && a < s.a1 - pad)?.index ?? null;
}
export function topicWheelText(pick: { name: string; more: boolean } | null) {
  return { title: "觀眾反應", sub: pick ? pick.more ? "放手揀話題" : `放入 ${pick.name}` : "入未分流" };
}
export function clampWheelCenter(point: Point, viewport: Point, R: number, segments: readonly TopicRingSegment[]): Point {
  const t = tokens.collectWheel.topicRing, pad = tokens.collectWheel.edgePadding;
  let left = R, right = R, top = R, bottom = R;
  for (const s of segments) {
    for (const angle of [s.a0, s.a1, Math.max(s.a0, Math.min(s.a1, -90))]) {
      const a = angle * Math.PI / 180, r = R + t.outerOffset + t.stroke / 2;
      left = Math.max(left, -r * Math.cos(a)); right = Math.max(right, r * Math.cos(a));
      top = Math.max(top, -r * Math.sin(a)); bottom = Math.max(bottom, r * Math.sin(a));
    }
    const a = s.rotation * Math.PI / 180;
    const hx = Math.abs(s.width / 2 * Math.cos(a)) + Math.abs(s.labelHeight / 2 * Math.sin(a));
    const hy = Math.abs(s.width / 2 * Math.sin(a)) + Math.abs(s.labelHeight / 2 * Math.cos(a));
    left = Math.max(left, hx - s.x); right = Math.max(right, hx + s.x);
    top = Math.max(top, hy - s.y); bottom = Math.max(bottom, hy + s.y);
  }
  const fit = (v: number, lo: number, hi: number, size: number) => lo <= hi ? Math.max(lo, Math.min(hi, v)) : size / 2;
  return { x: fit(point.x, left + pad, viewport.x - right - pad, viewport.x), y: fit(point.y, top + pad, viewport.y - bottom - pad, viewport.y) };
}
