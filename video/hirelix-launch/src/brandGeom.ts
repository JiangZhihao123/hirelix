import { ease, mix, prog } from "./lib";
import { T } from "./timeline";

/**
 * The Hirelix mark is four 11×11 shapes on a 32-unit grid, rotated -8°.
 * Each is expressed as a box with corner radii so a UI card can morph into it.
 * Order matches the four client-context sections.
 */
export const MARK_SHAPES = [
  { x: 3, y: 3, r: [2, 2, 2, 2], alpha: 1 }, // client preferences
  { x: 18, y: 3, r: [5.5, 5.5, 5.5, 5.5], alpha: 0.5 }, // saved notes
  { x: 3, y: 18, r: [2, 2, 2, 2], alpha: 0.5 }, // previous feedback
  { x: 18, y: 18, r: [2, 2, 7, 2], alpha: 1 }, // past searches
];

export const LOCKUP = { markX: 730, y: 430, size: 132, wordX: 830 };

/** Mark centre, size (px for 32 units) and rotation (deg) over time. */
export function markGeom(frame: number) {
  const a = prog(frame, T.markUp, T.markUp + 26, ease.cam);
  const b = prog(frame, T.headOut + 6, T.headOut + 32, ease.cam);
  const cx = mix(mix(960, 960, a), LOCKUP.markX, b);
  const cy = mix(mix(500, 238, a), LOCKUP.y, b);
  const size = mix(mix(290, 100, a), LOCKUP.size, b);
  return { cx, cy, size, rot: -8 };
}

/** Screen geometry of shape i (centre, width, rotation, radii in px). */
export function shapeGeom(i: number, frame: number) {
  const g = markGeom(frame);
  const k = g.size / 32;
  const s = MARK_SHAPES[i];
  const lx = (s.x + 5.5 - 16) * k;
  const ly = (s.y + 5.5 - 16) * k;
  const th = (g.rot * Math.PI) / 180;
  return {
    cx: g.cx + lx * Math.cos(th) - ly * Math.sin(th),
    cy: g.cy + lx * Math.sin(th) + ly * Math.cos(th),
    w: 11 * k,
    rot: g.rot,
    radii: s.r.map((r) => r * k),
    alpha: s.alpha,
  };
}
