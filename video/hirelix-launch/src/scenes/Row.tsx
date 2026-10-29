import React from "react";
import { C, ease, mix, prog } from "../lib";
import { T } from "../timeline";
import { CANDIDATES, REORDERED_SLOT } from "../data";
import { Avatar, Chip, I, shadow } from "../ui";

export const ROW_H = 150;
const slotY = (s: number) => 76 + s * 164;

/** Row reorder after the refinement: staggered, eased, no overshoot. */
export const rowMove = (i: number, frame: number) =>
  prog(frame, T.reorder + i * 2, T.reorderEnd - 6 + i * 2, ease.inOut);

export const rowY = (i: number, frame: number) => mix(slotY(i), slotY(REORDERED_SLOT[i]), rowMove(i, frame));

export const CandidateRow: React.FC<{ frame: number; i: number }> = ({ frame, i }) => {
  const c = CANDIDATES[i];
  const shellAt = T.rows + i * 6;
  if (frame < shellAt) return null;
  const shell = prog(frame, shellAt, shellAt + 16);
  const fill = prog(frame, T.rows + 14 + i * 8, T.rows + 30 + i * 8);
  const why = prog(frame, 336 + i * 7, 352 + i * 7);
  const m = rowMove(i, frame);
  const lift = Math.sin(m * Math.PI);
  const up = REORDERED_SLOT[i] < i;
  const tagAt = T.scan + 6 + i * 7;
  const tag = prog(frame, tagAt, tagAt + 12);
  const swap = prog(frame, T.reorder + 10, T.reorder + 24);
  const rank = frame >= T.reorder + 16 ? REORDERED_SLOT[i] + 1 : i + 1;
  const highlight = c.payments.found ? prog(frame, T.reorder + 14, T.reorderEnd) : 0;
  const changed = c.whyAfter !== c.why;
  return (
    <div
      style={{
        position: "absolute",
        left: 20,
        top: rowY(i, frame),
        width: 590,
        height: ROW_H,
        background: "#fff",
        border: `1px solid ${highlight > 0.5 ? "#b9cfbf" : C.line}`,
        borderRadius: 14,
        boxShadow: lift > 0.02 ? `0 ${10 + 20 * lift}px ${30 + 30 * lift}px -${20 - 4 * lift}px rgba(27,64,45,${0.2 + 0.2 * lift})` : shadow.card,
        opacity: shell,
        transform: `translateY(${(1 - shell) * 18}px) translateX(${up ? -10 * lift : 6 * lift}px) scale(${1 + 0.012 * lift})`,
        zIndex: up ? 3 : 2,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: C.green, opacity: highlight }} />
      {fill < 1 ? (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - fill }}>
          <div style={{ position: "absolute", left: 22, top: 22, width: 48, height: 48, borderRadius: 48, background: "#eef0e8" }} />
          {[[84, 26, 180], [84, 56, 300], [84, 92, 420], [84, 118, 360]].map(([x, y, w], k) => (
            <div key={k} style={{ position: "absolute", left: x, top: y, width: w, height: 10, borderRadius: 5, background: "#eef0e8" }} />
          ))}
        </div>
      ) : null}
      <div style={{ position: "absolute", inset: 0, opacity: fill }}>
        <div style={{ position: "absolute", left: 22, top: 22 }}>
          <Avatar initials={c.initials} size={48} tone={i} />
        </div>
        <div style={{ position: "absolute", left: 84, top: 18, right: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 21, fontWeight: 650, color: C.ink, letterSpacing: -0.3 }}>{c.name}</span>
          <span style={{ fontSize: 12, color: C.soft, display: "flex", alignItems: "center", gap: 5, marginLeft: 4, opacity: 1 - tag }}>
            <I.globe size={12} /> {c.sources} public sources
          </span>
          <span style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, display: "grid", placeItems: "center", fontSize: 14, fontWeight: 650, color: rank <= 2 && frame > T.reorder ? C.green : C.muted, background: rank <= 2 && frame > T.reorder + 16 ? "#eef3ee" : "#fff" }}>{rank}</span>
        </div>
        <div style={{ position: "absolute", left: 84, top: 48, fontSize: 15, color: C.muted, whiteSpace: "nowrap" }}>{c.role}</div>
        <div style={{ position: "absolute", left: 84, top: 78, fontSize: 15, color: "#33423b", whiteSpace: "nowrap" }}>{c.experience}</div>
        <div style={{ position: "absolute", left: 84, top: 108, right: 18, fontSize: 15, color: C.green, display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap", opacity: why, transform: `translateX(${(1 - why) * -8}px)` }}>
          <I.check size={15} color={C.green} stroke={2.4} />
          <span style={{ fontWeight: 600 }}>Why they match:</span>
          <span style={{ position: "relative", color: "#3d4b44" }}>
            <span style={{ opacity: changed ? 1 - swap : 1 }}>{c.why}</span>
            {changed ? <span style={{ position: "absolute", left: 0, top: 0, opacity: swap }}>{c.whyAfter}</span> : null}
          </span>
        </div>
        {frame >= tagAt ? (
          <div style={{ position: "absolute", right: 60, top: 18, opacity: tag, transform: `translateY(${(1 - tag) * -6}px)` }}>
            <Chip tone={c.payments.found ? "green" : "plain"} size={12} style={{ color: c.payments.found ? C.green : C.soft }}>
              {c.payments.found ? <I.check size={11} color={C.green} stroke={2.6} /> : null}
              {c.payments.label}
            </Chip>
          </div>
        ) : null}
      </div>
    </div>
  );
};
