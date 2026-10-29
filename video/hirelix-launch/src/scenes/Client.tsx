import React from "react";
import { C, FONT, ease, mix, prog } from "../lib";
import { T } from "../timeline";
import { Avatar, Chip, I, KineticLine, Label, Mark, MaskText, Status, shadow } from "../ui";
import { itemAnchor } from "./Board";
import { CLIENT } from "../data";

const P = { x: 680, y: 268, w: 1120, h: 708 };
const COL1 = 32;
const CITES = [
  { from: [0, 0] as const, quote: "Payments depth is a must", src: "Client preference · Sep 12" },
  { from: [1, 0] as const, quote: "Priya Nair: open to a move in Q1", src: "Saved note · Oct 2" },
  { from: [2, 0] as const, quote: "“Strong, but no payments depth.”", src: "Client feedback · Oct 3" },
];
const citeY = (k: number) => 300 + k * 62;

const appear = (frame: number, at: number, dy = 12) => {
  const p = prog(frame, at, at + 16);
  return { opacity: p, transform: `translateY(${(1 - p) * dy}px)` };
};

export const ClientHeadlines: React.FC<{ frame: number }> = ({ frame }) => {
  const label = prog(frame, T.board, T.board + 18) * (1 - prog(frame, T.collapse - 6, T.collapse + 6));
  return (
    <div style={{ position: "absolute", left: 120, top: 92, fontFamily: FONT }}>
      <div style={{ opacity: label, display: "flex", gap: 12, alignItems: "center" }}>
        <Label style={{ color: C.green, fontSize: 14 }}>Client workspace</Label>
        <span style={{ width: 4, height: 4, borderRadius: 4, background: C.sage }} />
        <Label style={{ fontSize: 14 }}>{CLIENT}</Label>
      </div>
      <div style={{ position: "relative", marginTop: 18, height: 100 }}>
        <div style={{ position: "absolute", left: -4, top: 0 }}>
          <KineticLine frame={frame} text="Every search builds on the last." inAt={T.buildsTitle} outAt={T.buildsOut} stagger={3} style={{ fontSize: 80, fontWeight: 600, letterSpacing: -3.2, color: C.ink, lineHeight: 1.08 }} />
        </div>
        <div style={{ position: "absolute", left: -4, top: 0 }}>
          <KineticLine
            frame={frame}
            text="One partner. Across every role."
            inAt={T.partnerTitle}
            outAt={T.partnerOut}
            stagger={3}
            style={{ fontSize: 80, fontWeight: 600, letterSpacing: -3.2, color: C.ink, lineHeight: 1.08 }}
            wordStyle={(i) => (i < 2 ? { color: C.green } : undefined)}
          />
        </div>
      </div>
    </div>
  );
};

/** Bezier threads from the client context into the citations of the new task. */
export const Threads: React.FC<{ frame: number }> = ({ frame }) => {
  const out = 1 - prog(frame, T.collapse - 8, T.collapse + 4);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: out }}>
      {CITES.map((c, k) => {
        const at = T.cite + 6 + k * 8;
        const p = prog(frame, at, at + 20, ease.inOut);
        if (p <= 0) return null;
        const a = itemAnchor(c.from[0], c.from[1], frame);
        const bx = P.x + COL1;
        const by = P.y + citeY(k) + 25;
        const d = `M ${a.x} ${a.y} C ${a.x + 50} ${a.y}, ${bx - 50} ${by}, ${bx} ${by}`;
        return (
          <g key={k}>
            <path d={d} fill="none" stroke={C.green} strokeWidth={2} strokeLinecap="round" pathLength={1} strokeDasharray={`${p} 1`} opacity={0.75} />
            <circle cx={a.x} cy={a.y} r={5} fill={C.green} opacity={prog(frame, at - 4, at + 4)} />
          </g>
        );
      })}
    </svg>
  );
};

export const TaskPanel: React.FC<{ frame: number }> = ({ frame }) => {
  const enter = prog(frame, T.task, T.task + 26, ease.out);
  const exit = prog(frame, T.collapse - 10, T.collapse + 10, ease.in);
  if (frame < T.task || exit >= 1) return null;
  const evalP = prog(frame, T.evalCard, T.evalCard + 20);
  const recP = prog(frame, T.recDoc, T.recDoc + 22);
  const lines = [
    { h: "Why Priya", t: "Built payout ledgers end to end; deep PostgreSQL work." },
    { h: "Against Halden Pay’s brief", t: "Payments depth ✓   Owned on-call ✓" },
    { h: "To confirm on the next call", t: "Current availability and compensation." },
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: P.x,
        top: P.y,
        width: P.w,
        height: P.h,
        background: C.paper,
        borderRadius: 20,
        boxShadow: shadow.window,
        opacity: enter * (1 - exit),
        transform: `translateX(${(1 - enter) * 80 + exit * 40}px) scale(${1 - exit * 0.03})`,
        fontFamily: FONT,
        overflow: "hidden",
      }}
    >
      <div style={{ height: 64, borderBottom: `1px solid ${C.lineSoft}`, display: "flex", alignItems: "center", padding: "0 32px", gap: 12 }}>
        <I.case size={19} color={C.green} />
        <span style={{ fontSize: 19, fontWeight: 620, color: C.ink }}>Staff Platform Engineer</span>
        <span style={{ fontSize: 16, color: C.muted }}>{CLIENT} · New role</span>
        <span style={{ marginLeft: "auto" }}>
          <Chip tone="green" size={13}>
            <Mark size={14} /> Using {CLIENT} context
          </Chip>
        </span>
      </div>
      {/* Column 1 · the conversation */}
      <div style={{ position: "absolute", left: COL1, top: 64, width: 500 }}>
        {frame >= T.taskBubble ? (
          <div style={{ position: "absolute", right: 0, top: 26, width: 420, height: 60, background: "rgb(238,243,238)", border: "1px solid #d5e1d6", borderRadius: 14, ...appear(frame, T.taskBubble) }}>
            <div style={{ position: "absolute", left: 18, top: 18, fontSize: 17, color: C.ink, whiteSpace: "nowrap" }}>New JD attached. Who should we look at first?</div>
          </div>
        ) : null}
        {frame >= T.cite - 10 ? (
          <div style={{ position: "absolute", left: 0, top: 112, display: "flex", gap: 10, alignItems: "center", ...appear(frame, T.cite - 10, 8) }}>
            <Mark size={22} /> <span style={{ fontSize: 17, fontWeight: 650, color: C.ink }}>Hirelix</span>
          </div>
        ) : null}
        {frame >= T.cite ? (
          <div style={{ position: "absolute", left: 0, top: 156, display: "flex", gap: 12, alignItems: "center", ...appear(frame, T.cite, 8) }}>
            <Status frame={frame} start={T.cite} done={T.cite + 40} />
            <span style={{ fontSize: 18, fontWeight: 560, color: C.ink }}>Applying what {CLIENT} has already told you</span>
          </div>
        ) : null}
        {CITES.map((c, k) => {
          const at = T.cite + 18 + k * 8;
          if (frame < at) return null;
          return (
            <div key={k} style={{ position: "absolute", left: 0, top: citeY(k) - 64, width: 500, height: 50, background: "#f6f8f1", border: `1px solid #dbe4d6`, borderRadius: 10, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", boxSizing: "border-box", ...appear(frame, at, 8) }}>
              <div style={{ width: 3, alignSelf: "stretch", margin: "10px 0", borderRadius: 2, background: C.green }} />
              <span style={{ fontSize: 16, fontWeight: 560, color: C.ink, whiteSpace: "nowrap" }}>{c.quote}</span>
              <span style={{ fontSize: 13, color: C.muted, marginLeft: "auto", whiteSpace: "nowrap" }}>{c.src}</span>
            </div>
          );
        })}
        {[
          { at: T.evalCard - 4, done: T.evalCard + 22, label: "Evaluating saved candidates" },
          { at: T.recDoc - 4, done: T.recDoc + 44, label: "Preparing the client recommendation" },
        ].map((s, k) =>
          frame >= s.at ? (
            <div key={k} style={{ position: "absolute", left: 0, top: 432 + k * 46, display: "flex", gap: 12, alignItems: "center", ...appear(frame, s.at, 8) }}>
              <Status frame={frame} start={s.at} done={s.done} />
              <span style={{ fontSize: 18, fontWeight: 560, color: C.ink }}>{s.label}</span>
            </div>
          ) : null,
        )}
      </div>
      {/* Column 2 · the work product */}
      <div style={{ position: "absolute", left: 572, top: 90, width: 516 }}>
        {frame >= T.evalCard ? (
          <div style={{ position: "absolute", left: 0, top: 0, width: 516, height: 196, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: shadow.card, opacity: evalP, transform: `translateY(${(1 - evalP) * 18}px)`, padding: 22, boxSizing: "border-box" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Avatar initials="PN" size={48} tone={2} />
              <div>
                <div style={{ fontSize: 21, fontWeight: 650, color: C.ink }}>Priya Nair</div>
                <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>From your saved candidates</div>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                { ok: true, t: "Payments depth", m: "matches the client’s must-have" },
                { ok: true, t: "Open to a move in Q1", m: "from your Oct 2 note" },
                { ok: false, t: "Availability", m: "still needs confirming" },
              ].map((r, k) => (
                <div key={k} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 15, ...appear(frame, T.evalCard + 8 + k * 5, 6) }}>
                  {r.ok ? <I.check size={15} color={C.green} stroke={2.6} /> : <span style={{ width: 15, height: 15, display: "grid", placeItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: 8, border: `2px solid ${C.soft}` }} /></span>}
                  <span style={{ fontWeight: 600, color: C.ink }}>{r.t}</span>
                  <span style={{ color: C.muted }}>· {r.m}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {frame >= T.recDoc ? (
          <div style={{ position: "absolute", left: 0, top: 216, width: 516, height: 336, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: shadow.lift, opacity: recP, transform: `translateY(${(1 - recP) * 24}px)`, padding: "22px 26px", boxSizing: "border-box" }}>
            <Label style={{ color: C.green, fontSize: 11 }}>Client recommendation · Draft</Label>
            <div style={{ fontSize: 23, fontWeight: 640, color: C.ink, letterSpacing: -0.5, marginTop: 10 }}>
              <MaskText frame={frame} inAt={T.recDoc + 6}>Priya Nair · Staff Platform Engineer</MaskText>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, ...appear(frame, T.recDoc + 10, 6) }}>
              <Chip size={13}><I.file size={13} color={C.green} /> CV · organized for {CLIENT}</Chip>
              <Chip size={13}>Summary</Chip>
            </div>
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 13 }}>
              {lines.map((l, k) => {
                const at = T.recDoc + 16 + k * 8;
                return (
                  <div key={k} style={appear(frame, at, 8)}>
                    <div style={{ fontSize: 14, fontWeight: 650, color: C.green }}>{l.h}</div>
                    <div style={{ fontSize: 16, color: "#33423b", marginTop: 3, whiteSpace: "nowrap" }}>{l.t}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export { mix };
