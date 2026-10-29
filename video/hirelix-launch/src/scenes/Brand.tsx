import React from "react";
import { C, FONT, ease, prog } from "../lib";
import { T } from "../timeline";
import { I, KineticLine } from "../ui";
import { LOCKUP } from "../brandGeom";

export const BrandHeadlines: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < T.headA - 2 || frame > T.headOut + 24) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 388, textAlign: "center", fontFamily: FONT }}>
      <KineticLine frame={frame} text="Find candidates faster." inAt={T.headA} outAt={T.headOut} stagger={3} style={{ fontSize: 112, fontWeight: 620, letterSpacing: -5, color: C.ink, lineHeight: 1.05 }} />
      <div style={{ height: 26 }} />
      <KineticLine frame={frame} text="Keep the partner who knows your work." inAt={T.headB} outAt={T.headOut + 2} stagger={2.5} style={{ fontSize: 62, fontWeight: 560, letterSpacing: -2.4, color: C.green, lineHeight: 1.1 }} />
    </div>
  );
};

/** Wordmark, tagline and CTA. The mark itself is the four collapsed cards. */
export const Lockup: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < T.lockup) return null;
  const word = prog(frame, T.lockup + 4, T.lockup + 26, ease.out);
  const tag = prog(frame, T.lockup + 12, T.lockup + 30);
  const cta = prog(frame, T.lockup + 16, T.lockup + 34);
  const rule = prog(frame, T.lockup + 10, T.lockup + 36, ease.inOut);
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT }}>
      <div
        style={{
          position: "absolute",
          left: LOCKUP.wordX,
          top: LOCKUP.y - 92,
          height: 184,
          display: "flex",
          alignItems: "center",
          clipPath: `inset(-20% ${(1 - word) * 100}% -20% 0)`,
        }}
      >
        <span style={{ fontSize: 168, fontWeight: 680, letterSpacing: -8, color: C.ink, lineHeight: 1, transform: `translateX(${(1 - word) * -40}px)`, display: "inline-block" }}>Hirelix</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 560, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 760 * rule, height: 1, background: C.line }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 596, textAlign: "center", fontSize: 40, fontWeight: 520, letterSpacing: -1.2, color: C.green, opacity: tag, transform: `translateY(${(1 - tag) * 14}px)` }}>
        Your AI Recruiting Partner.
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 690, display: "flex", justifyContent: "center", opacity: cta, transform: `translateY(${(1 - cta) * 16}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "0 34px", height: 76, borderRadius: 10, background: C.green, color: "#fff", fontSize: 26, fontWeight: 560, boxShadow: "0 18px 40px -20px rgba(23,62,50,0.6)" }}>
          Start your free trial <I.arrowUpRight size={24} color="#fff" stroke={2.2} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 802, textAlign: "center", fontSize: 20, color: C.muted, letterSpacing: 0.2, opacity: cta }}>hirelix.online</div>
    </div>
  );
};
