import React from "react";
import { C, FONT, Rect, ease, mixRect, prog, tw, typed } from "../lib";
import { T } from "../timeline";
import { Chip, I, KineticLine, Label, MaskText, shadow } from "../ui";

/** World rects shared with the conversation so the morph lands pixel-exact. */
export const JD_CARD: Rect = { x: 1040, y: 250, w: 600, h: 440 };
export const STRIP: Rect = { x: 1040, y: 714, w: 600, h: 76 };
export const BUBBLE1: Rect = { x: 660, y: 210, w: 400, h: 118 };
export const CHIP1: Rect = { x: 676, y: 226, w: 368, h: 52 };

export const HookHeadline: React.FC<{ frame: number }> = ({ frame }) => (
  <div style={{ position: "absolute", left: 146, top: 286 }}>
    <KineticLine
      frame={frame}
      text="One JD."
      inAt={T.oneJD}
      outAt={T.hookOut}
      stagger={5}
      style={{ fontSize: 172, fontWeight: 620, letterSpacing: -7.5, color: C.ink, lineHeight: 1.04 }}
    />
    <div style={{ height: 34 }} />
    <KineticLine
      frame={frame}
      text="Your search is underway."
      inAt={T.underway}
      outAt={T.hookOut + 3}
      stagger={3}
      style={{ fontSize: 66, fontWeight: 560, letterSpacing: -2.4, color: C.green, lineHeight: 1.1, paddingLeft: 6 }}
    />
  </div>
);

/** The pasted JD. Morphs into the attachment chip of the first message. */
export const JDCard: React.FC<{ frame: number }> = ({ frame }) => {
  const enter = prog(frame, T.cardIn, T.cardIn + 30, ease.out);
  const m = prog(frame, T.morph, T.morphEnd - 4, ease.inOut);
  const r = mixRect(JD_CARD, CHIP1, m);
  // Content shrinks with the card (uniform scale) and hands over to the chip late in the move.
  const full = 1 - prog(frame, T.morph + 18, T.morph + 28, ease.outSoft);
  const compact = prog(frame, T.morph + 20, T.morphEnd - 2, ease.out);
  const k = Math.min(r.w / JD_CARD.w, r.h / JD_CARD.h);
  const rot = (1 - enter) * -3.5 + (1 - m) * enter * -1.2;
  const lift = (1 - enter) * 70;
  if (frame >= T.morphEnd + 4) return null;
  const meta = [
    { icon: I.pin, text: "Remote · United States" },
    { icon: I.building, text: "Fintech · Series B" },
    { icon: I.case, text: "Full-time · Platform team" },
  ];
  const skills = ["Go", "Distributed systems", "PostgreSQL", "Event-driven APIs"];
  return (
    <div
      style={{
        position: "absolute",
        left: r.x,
        top: r.y,
        width: r.w,
        height: r.h,
        transform: `translateY(${lift}px) rotate(${rot}deg)`,
        opacity: enter,
        background: C.paper,
        border: `1px solid ${C.line}`,
        borderRadius: 18 - 8 * m,
        boxShadow: m < 0.9 ? shadow.lift : "none",
        overflow: "hidden",
        fontFamily: FONT,
      }}
    >
      <div style={{ position: "absolute", left: 40 * k, top: 36 * k, width: 520, opacity: full, transform: `scale(${k})`, transformOrigin: "0 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Label style={{ color: C.green }}>Job description</Label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: C.muted, fontSize: 16 }}>
            <I.building size={16} /> Halden Pay
          </div>
        </div>
        <div style={{ fontSize: 42, fontWeight: 620, letterSpacing: -1.4, color: C.ink, marginTop: 22, lineHeight: 1.12 }}>
          <MaskText frame={frame} inAt={T.cardIn + 10}>Senior Backend Engineer</MaskText>
        </div>
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          {meta.map((x, i) => {
            const p = prog(frame, T.cardIn + 16 + i * 4, T.cardIn + 34 + i * 4);
            return (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 20, color: "#3d4b44", opacity: p, transform: `translateX(${(1 - p) * -14}px)` }}>
                <x.icon size={19} color={C.green} /> {x.text}
              </div>
            );
          })}
        </div>
        <div style={{ height: 1, background: C.lineSoft, margin: "28px 0 22px", transform: `scaleX(${prog(frame, T.cardIn + 24, T.cardIn + 50)})`, transformOrigin: "left" }} />
        <Label>Must-haves</Label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          {skills.map((s, i) => {
            const p = prog(frame, T.cardIn + 32 + i * 4, T.cardIn + 50 + i * 4);
            return (
              <div key={s} style={{ opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
                <Chip tone="green" size={18}>{s}</Chip>
              </div>
            );
          })}
        </div>
      </div>
      <ChipContent opacity={compact} />
    </div>
  );
};

export const ChipContent: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", opacity, fontFamily: FONT }}>
    <div style={{ width: 30, height: 30, borderRadius: 7, background: C.tintGreen, display: "grid", placeItems: "center" }}>
      <I.file size={17} color={C.green} />
    </div>
    <div style={{ fontSize: 17, fontWeight: 560, color: C.ink, whiteSpace: "nowrap" }}>Senior Backend Engineer</div>
    <div style={{ fontSize: 14, color: C.muted, marginLeft: "auto", whiteSpace: "nowrap" }}>JD</div>
  </div>
);

export const BUBBLE_TEXT = "Find candidates for this role.";

/** The input strip under the JD card. Morphs into the message bubble. */
export const HookStrip: React.FC<{ frame: number }> = ({ frame }) => {
  const enter = prog(frame, T.cardIn + 30, T.cardIn + 52);
  const m = prog(frame, T.morph + 2, T.morphEnd - 2, ease.inOut);
  if (frame >= T.morphEnd + 4) return null;
  const r = mixRect(STRIP, BUBBLE1, m);
  const press = tw(frame, T.send - 3, T.send, 1, 0.9, ease.out) * 0 + (frame >= T.send - 3 && frame < T.send + 6 ? 0.92 : 1);
  const ring = prog(frame, T.send, T.send + 18);
  const sendOp = 1 - prog(frame, T.morph, T.morph + 10);
  return (
    <div
      style={{
        position: "absolute",
        left: r.x,
        top: r.y,
        width: r.w,
        height: r.h,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 24}px)`,
        background: m > 0 ? `rgba(238,243,238,${m})` : C.paper,
        border: `1px solid ${m > 0.5 ? "#d5e1d6" : C.line}`,
        borderRadius: 14,
        boxShadow: m < 0.5 ? shadow.card : "none",
        fontFamily: FONT,
      }}
    >
      <div style={{ position: "absolute", left: 24 - 6 * m, bottom: 26 - 4 * m, fontSize: 21 - 4 * m, color: C.ink, whiteSpace: "nowrap" }}>
        {typed(BUBBLE_TEXT, frame, T.typeStart, T.typeEnd)}
        {frame < T.send && frame >= T.typeStart - 8 && Math.floor(frame / 8) % 2 === 0 ? (
          <span style={{ display: "inline-block", width: 2, height: 24, background: C.green, marginLeft: 2, verticalAlign: -4 }} />
        ) : null}
      </div>
      <div style={{ position: "absolute", right: 14, top: 14, width: 48, height: 48, opacity: sendOp }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 48, border: `2px solid ${C.green}`, transform: `scale(${1 + ring * 0.8})`, opacity: frame >= T.send ? 1 - ring : 0 }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: 48, background: frame >= T.typeEnd ? C.green : C.sage, display: "grid", placeItems: "center", transform: `scale(${press})` }}>
          <I.arrowUp size={22} color="#fff" stroke={2.4} />
        </div>
      </div>
    </div>
  );
};
