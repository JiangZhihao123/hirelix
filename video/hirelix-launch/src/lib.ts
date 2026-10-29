import { Easing, interpolate } from "remotion";

/** Brand tokens, taken from the Hirelix landing page (src/app/(landing)/landing.css). */
export const C = {
  bg: "#f8f8f2",
  paper: "#fffefa",
  panel: "#fbfbf6",
  ink: "#1e302b",
  green: "#205846",
  greenDeep: "#173e32",
  muted: "#65716a",
  soft: "#8a958d",
  line: "#dedfd6",
  lineSoft: "#e8e9e1",
  wash: "#f0f2e9",
  tint: "#e4edce",
  tintGreen: "#dfe9e1",
  sage: "#bbc6b6",
};

export const FONT = "'Inter', system-ui, sans-serif";

/** 120 BPM: one beat is 15 frames at 30fps. Key actions land on this grid. */
export const BEAT = 15;
export const FPS = 30;
export const DURATION = 1050;

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  outSoft: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  cam: Easing.bezier(0.7, 0, 0.2, 1),
  in: Easing.bezier(0.55, 0, 0.9, 0.4),
  linear: (t: number) => t,
};

/** Clamped tween between two frames. */
export function tw(
  frame: number,
  f0: number,
  f1: number,
  a = 0,
  b = 1,
  e: (t: number) => number = ease.out,
) {
  return interpolate(frame, [f0, f1], [a, b], {
    easing: e,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** 0 → 1 progress between two frames. */
export const prog = (frame: number, f0: number, f1: number, e = ease.out) =>
  tw(frame, f0, f1, 0, 1, e);

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export type Rect = { x: number; y: number; w: number; h: number };

export const mixRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
  w: mix(a.w, b.w, t),
  h: mix(a.h, b.h, t),
});

export type CamKey = {
  f: number;
  /** zoom */
  z: number;
  /** world point that should sit at screen point (sx, sy) */
  wx: number;
  wy: number;
  sx?: number;
  sy?: number;
};

/**
 * Piecewise camera. Between keys the camera eases with a smooth in-out curve;
 * position is interpolated in screen-translation space so pans stay level.
 */
export function camera(frame: number, keys: CamKey[], e = ease.cam) {
  const toT = (k: CamKey) => ({
    z: k.z,
    tx: (k.sx ?? 960) - k.wx * k.z,
    ty: (k.sy ?? 540) - k.wy * k.z,
  });
  if (frame <= keys[0].f) return toT(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame <= b.f) {
      const t = e((frame - a.f) / (b.f - a.f));
      const A = toT(a);
      const B = toT(b);
      // Interpolate zoom geometrically so push-ins feel linear to the eye.
      const z = A.z * Math.pow(B.z / A.z, t);
      // Keep the interpolated focus point consistent with the zoom.
      const wxA = ((a.sx ?? 960) - A.tx) / A.z;
      const wyA = ((a.sy ?? 540) - A.ty) / A.z;
      const wxB = ((b.sx ?? 960) - B.tx) / B.z;
      const wyB = ((b.sy ?? 540) - B.ty) / B.z;
      const sx = mix(a.sx ?? 960, b.sx ?? 960, t);
      const sy = mix(a.sy ?? 540, b.sy ?? 540, t);
      const wx = mix(wxA, wxB, t);
      const wy = mix(wyA, wyB, t);
      return { z, tx: sx - wx * z, ty: sy - wy * z };
    }
  }
  return toT(keys[keys.length - 1]);
}

export const camTransform = (c: { z: number; tx: number; ty: number }) =>
  `translate(${c.tx}px, ${c.ty}px) scale(${c.z})`;

/** Deterministic typewriter: characters revealed between f0 and f1. */
export function typed(text: string, frame: number, f0: number, f1: number) {
  const n = Math.round(tw(frame, f0, f1, 0, text.length, ease.linear));
  return text.slice(0, n);
}
