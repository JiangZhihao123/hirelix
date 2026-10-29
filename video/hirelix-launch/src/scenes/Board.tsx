import React from "react";
import { C, FONT, Rect, ease, mix, mixRect, prog } from "../lib";
import { T } from "../timeline";
import { I, shadow } from "../ui";
import { shapeGeom } from "../brandGeom";

type Item = { text: string; meta: string };
type Section = { title: string; icon: (p: { size?: number; color?: string }) => React.ReactElement; items: Item[]; a: Rect; b: Rect; order: number };

export const SECTIONS: Section[] = [
  {
    title: "Client preferences",
    icon: I.sliders,
    items: [
      { text: "Payments depth is a must", meta: "Intake call · Sep 12" },
      { text: "Builders who have owned on-call", meta: "Intake call · Sep 12" },
    ],
    a: { x: 120, y: 336, w: 410, h: 168 },
    b: { x: 120, y: 268, w: 480, h: 168 },
    order: 1,
  },
  {
    title: "Saved candidate notes",
    icon: I.note,
    items: [
      { text: "Priya Nair: open to a move in Q1", meta: "Call note · Oct 2" },
      { text: "Sofia Lindqvist: prefers async teams", meta: "Call note · Oct 4" },
    ],
    a: { x: 556, y: 384, w: 410, h: 168 },
    b: { x: 120, y: 448, w: 480, h: 168 },
    order: 2,
  },
  {
    title: "Previous feedback",
    icon: I.chat,
    items: [
      { text: "“Strong, but no payments depth.”", meta: "Client on Marcus Bell · Oct 3" },
      { text: "“More profiles like Priya.”", meta: "Client on shortlist · Oct 6" },
    ],
    a: { x: 992, y: 336, w: 410, h: 168 },
    b: { x: 120, y: 628, w: 480, h: 168 },
    order: 3,
  },
  {
    title: "Past searches",
    icon: I.history,
    items: [
      { text: "Senior Backend Engineer", meta: "Shortlist · Oct 1" },
      { text: "Data Engineer", meta: "Placed · Aug 14" },
    ],
    a: { x: 1428, y: 300, w: 372, h: 434 },
    b: { x: 120, y: 808, w: 480, h: 168 },
    order: 0,
  },
];

const enterAt = (s: Section) => T.board + s.order * 8;
const converge = (s: Section, frame: number) => prog(frame, T.converge + s.order * 3, T.convergeEnd + s.order * 2, ease.cam);
export const collapseT = (i: number, frame: number) => prog(frame, T.collapse + i * 3, T.collapseEnd - 6 + i * 3, ease.cam);

export const sectionRect = (i: number, frame: number) => mixRect(SECTIONS[i].a, SECTIONS[i].b, converge(SECTIONS[i], frame));

/** Where the world-A thumbnail sits inside the Past searches card (screen px). */
export function thumbRect(frame: number): Rect {
  const s = SECTIONS[3];
  const r = sectionRect(3, frame);
  const t = converge(s, frame);
  const lift = (1 - prog(frame, enterAt(s), enterAt(s) + 22)) * 40;
  const a = { x: r.x + 24, y: r.y + 60 + lift, w: 324, h: 182.25 };
  const b = { x: r.x + r.w - 24 - 128, y: r.y + 54, w: 128, h: 72 };
  return mixRect(a, b, t);
}

/** Screen-y of the first item in section i, used by citation connectors. */
export const itemAnchor = (i: number, k: number, frame: number) => {
  const r = sectionRect(i, frame);
  return { x: r.x + r.w, y: r.y + 66 + k * 52 + 12 };
};

export const BoardCard: React.FC<{ frame: number; i: number }> = ({ frame, i }) => {
  const s = SECTIONS[i];
  const at = enterAt(s);
  if (frame < at) return null;
  const enter = prog(frame, at, at + 22);
  const t = converge(s, frame);
  const r = sectionRect(i, frame);
  const c = collapseT(i, frame);
  const content = 1 - prog(frame, T.collapse - 4 + i * 2, T.collapse + 8 + i * 2);
  const g = shapeGeom(i, frame);
  const box = {
    x: mix(r.x, g.cx - g.w / 2, c),
    y: mix(r.y, g.cy - g.w / 2, c),
    w: mix(r.w, g.w, c),
    h: mix(r.h, g.w, c),
  };
  const fill = prog(frame, T.collapse + 4 + i * 3, T.collapseEnd - 8 + i * 3);
  const radii = g.radii.map((v) => `${mix(16, v, c)}px`).join(" ");
  const isPast = i === 3;
  const itemsY = isPast ? mix(262, 50, t) : 50;
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderRadius: radii,
        background: fill > 0 ? `rgba(${mix(255, 32, fill)},${mix(254, 88, fill)},${mix(250, 70, fill)},${mix(1, g.alpha, fill)})` : C.paper,
        border: `1px solid rgba(222,223,214,${1 - fill})`,
        boxShadow: c < 0.6 ? shadow.card : "none",
        opacity: enter,
        transform: `translateY(${(1 - enter) * 40}px) rotate(${(i === 3 ? 0 : (1 - enter) * (i % 2 ? 2 : -2)) + g.rot * c}deg)`,
        overflow: "hidden",
        fontFamily: FONT,
        boxSizing: "border-box",
      }}
    >
      <div style={{ position: "absolute", left: 24, top: 0, width: r.w - 48, height: r.h, opacity: content }}>
        <div style={{ position: "absolute", left: 0, top: 20, display: "flex", gap: 10, alignItems: "center", fontSize: 16, fontWeight: 650, color: C.green }}>
          <s.icon size={18} color={C.green} /> {s.title}
        </div>
        {s.items.map((it, k) => {
          const p = prog(frame, at + 8 + k * 5, at + 24 + k * 5);
          return (
            <div key={k} style={{ position: "absolute", left: 0, top: itemsY + 10 + k * 52, opacity: p, transform: `translateY(${(1 - p) * 8}px)` }}>
              <div style={{ fontSize: 19, fontWeight: 520, color: C.ink, whiteSpace: "nowrap" }}>{it.text}</div>
              <div style={{ fontSize: 14, color: C.muted, marginTop: 3 }}>{it.meta}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
