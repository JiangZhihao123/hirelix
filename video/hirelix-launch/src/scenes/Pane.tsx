import React from "react";
import { C, ease, mix, prog, tw } from "../lib";
import { T } from "../timeline";
import { CANDIDATES, PAGES, REORDERED_SLOT } from "../data";
import { Chip, I, shadow } from "../ui";
import { CandidateRow, ROW_H, rowY } from "./Row";

/** Window-local rect of the shortlist pane. */
export const PANE = { x: 940, y: 120, w: 630, h: 756 };

const PAGE_POS = [
  { x: 28, y: 92, r: -2 },
  { x: 318, y: 118, r: 1.6 },
  { x: 58, y: 318, r: 1.1 },
  { x: 330, y: 346, r: -1.4 },
  { x: 186, y: 540, r: 0.8 },
];

const Page: React.FC<{ frame: number; i: number }> = ({ frame, i }) => {
  const p = PAGES[i];
  const pos = PAGE_POS[i];
  const at = T.pages + i * 9;
  const enter = prog(frame, at, at + 18);
  const exit = prog(frame, 270 + i * 2, 290 + i * 2, ease.in);
  if (frame < at || exit >= 1) return null;
  const sweep = prog(frame, at + 12, at + 26, ease.inOut);
  return (
    <div
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: 280,
        height: 172,
        background: "#fff",
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        boxShadow: shadow.card,
        opacity: enter * (1 - exit),
        transform: `translateY(${(1 - enter) * 26 - exit * 12}px) rotate(${pos.r * (1 - exit)}deg) scale(${0.94 + 0.06 * enter - exit * 0.06})`,
        padding: "14px 16px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12, color: C.soft }}>
        <I.globe size={13} /> {p.domain}
      </div>
      <div style={{ fontSize: 15, fontWeight: 620, color: C.ink, marginTop: 8, whiteSpace: "nowrap" }}>{p.title}</div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {[0.92, 0.78, 0.86, 0.6].map((w, k) => (
          <div key={k} style={{ position: "relative", height: 7, width: `${w * 100}%`, borderRadius: 4, background: "#eceee6" }}>
            {k === 1 ? (
              <div style={{ position: "absolute", left: -3, top: -5, height: 17, width: `${sweep * 104}%`, borderRadius: 4, background: "rgba(186,210,157,0.55)" }} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Highlighted excerpt lifted off a page and carried into a candidate row. */
const Excerpt: React.FC<{ frame: number; i: number }> = ({ frame, i }) => {
  const p = PAGES[i];
  const pos = PAGE_POS[i];
  const at = T.pages + i * 9 + 24;
  const fly = prog(frame, 292 + i * 3, 316 + i * 3, ease.inOut);
  const pop = prog(frame, at, at + 12);
  const gone = prog(frame, 314 + i * 3, 322 + i * 3);
  if (frame < at || gone >= 1) return null;
  const sx = pos.x + 20;
  const sy = pos.y + 120;
  const tx = 104;
  const ty = rowY(p.to, frame) + 86;
  return (
    <div
      style={{
        position: "absolute",
        left: mix(sx, tx, fly),
        top: mix(sy, ty, fly) - Math.sin(fly * Math.PI) * 40,
        opacity: pop * (1 - gone),
        transform: `scale(${0.9 + 0.1 * pop - fly * 0.12})`,
        transformOrigin: "left center",
        zIndex: 5,
      }}
    >
      <Chip tone="tint" size={13} style={{ boxShadow: shadow.card }}>
        <I.check size={12} color={C.green} stroke={2.4} /> {p.excerpt}
      </Chip>
    </div>
  );
};

export const Pane: React.FC<{ frame: number }> = ({ frame }) => {
  const empty = 1 - prog(frame, T.pages - 10, T.pages + 4);
  const count = frame < T.rows ? 0 : Math.min(4, 1 + Math.floor((frame - T.rows) / 6));
  return (
    <div style={{ position: "absolute", left: PANE.x, top: PANE.y, width: PANE.w, height: PANE.h, background: C.panel, border: `1px solid ${C.lineSoft}`, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 60, borderBottom: `1px solid ${C.lineSoft}`, display: "flex", alignItems: "center", padding: "0 22px", gap: 12 }}>
        <span style={{ fontSize: 19, fontWeight: 650, color: C.ink }}>Shortlist</span>
        <span style={{ fontSize: 15, color: C.muted }}>{count > 0 ? `${count} candidates` : "Building…"}</span>
        <span style={{ marginLeft: "auto" }}>
          <Chip tone="tint" size={12}>Sample data</Chip>
        </span>
      </div>
      {empty > 0 ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 330, textAlign: "center", fontSize: 16, color: C.soft, opacity: empty }}>
          The shortlist builds here as the agent works.
        </div>
      ) : null}
      {PAGES.map((_, i) => (
        <Page key={i} frame={frame} i={i} />
      ))}
      {CANDIDATES.map((c, i) => (
        <CandidateRow key={c.name} frame={frame} i={i} />
      ))}
      {PAGES.map((_, i) => (
        <Excerpt key={i} frame={frame} i={i} />
      ))}
      <ScanLine frame={frame} />
    </div>
  );
};

/** A single sweep down the list while sources are re-checked for payments work. */
const ScanLine: React.FC<{ frame: number }> = ({ frame }) => {
  const p = tw(frame, T.scan, T.scan + 30, 0, 1, ease.inOut);
  if (frame < T.scan || frame > T.scan + 34) return null;
  const y = mix(70, 76 + 3 * 164 + ROW_H, p);
  return <div style={{ position: "absolute", left: 16, right: 16, top: y, height: 2, background: C.green, opacity: 0.5 * Math.sin(p * Math.PI), boxShadow: "0 0 18px 4px rgba(32,88,70,0.18)" }} />;
};

export { REORDERED_SLOT };
