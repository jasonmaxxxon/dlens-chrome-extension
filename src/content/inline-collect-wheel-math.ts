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
