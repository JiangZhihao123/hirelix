import React from "react";
import { C, FONT, prog, typed } from "../lib";
import { T } from "../timeline";
import { I, Mark, shadow } from "../ui";

export const WIN = { x: 160, y: 90, w: 1600, h: 900 };
export const SIDEBAR_W = 280;

/** App chrome mirroring the real Hirelix workspace: sidebar, title row, composer. */
export const Sidebar: React.FC = () => {
  const nav = [
    { icon: I.pencil, label: "New conversation" },
    { icon: I.user, label: "Candidates & CVs" },
    { icon: I.case, label: "Roles & JDs" },
    { icon: I.send, label: "Recommendations" },
    { icon: I.bell, label: "Reminders" },
  ];
  return (
    <div style={{ position: "absolute", left: 0, top: 44, width: SIDEBAR_W, bottom: 0, background: "#f5f6ef", borderRight: `1px solid ${C.lineSoft}` }}>
      <div style={{ position: "absolute", left: 28, top: 30, display: "flex", alignItems: "center", gap: 10 }}>
        <Mark size={30} />
        <span style={{ fontSize: 26, fontWeight: 680, letterSpacing: -1.2, color: C.ink }}>Hirelix</span>
      </div>
      <div style={{ position: "absolute", left: 18, right: 18, top: 104, display: "flex", flexDirection: "column", gap: 4 }}>
        {nav.map((n) => (
          <div key={n.label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 12px", fontSize: 17, color: "#33423b" }}>
            <n.icon size={19} color="#4a574f" /> {n.label}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 18, right: 18, top: 396, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 22 }}>
        <div style={{ fontSize: 14, color: C.muted, padding: "0 12px 12px" }}>Recent conversations</div>
        <div style={{ background: "#e6ece3", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 15, fontWeight: 560, color: C.ink }}>Senior Backend Engineer</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>Halden Pay · Today</div>
        </div>
        <div style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 15, color: "#4a574f" }}>Data Engineer</div>
          <div style={{ fontSize: 13, color: C.soft, marginTop: 3 }}>Halden Pay · Aug</div>
        </div>
      </div>
    </div>
  );
};

export const TitleBar: React.FC = () => (
  <>
    <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: 44, background: "#f1f2ea", borderBottom: `1px solid ${C.lineSoft}` }}>
      <div style={{ position: "absolute", left: 20, top: 16, display: "flex", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 12, height: 12, borderRadius: 12, background: "#dcdfd4" }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: "50%", top: 9, transform: "translateX(-50%)", width: 360, height: 26, borderRadius: 7, background: "#e6e8de", fontSize: 13, color: C.muted, display: "grid", placeItems: "center" }}>
        hirelix.online/app
      </div>
    </div>
    <div style={{ position: "absolute", left: SIDEBAR_W, right: 0, top: 44, height: 62, borderBottom: `1px solid ${C.lineSoft}`, display: "flex", alignItems: "center", padding: "0 40px" }}>
      <span style={{ fontSize: 18, fontWeight: 600, color: C.ink }}>Senior Backend Engineer</span>
      <span style={{ fontSize: 16, color: C.muted, marginLeft: 12 }}>Halden Pay</span>
      <span style={{ marginLeft: "auto", color: C.soft }}>
        <I.pencil size={18} />
      </span>
    </div>
  </>
);

export const REFINE_TEXT = "Prioritize candidates with payments experience.";

export const Composer: React.FC<{ frame: number }> = ({ frame }) => {
  const typing = frame >= T.typeRefine && frame < T.sendRefine + 2;
  const text = typing ? typed(REFINE_TEXT, frame, T.typeRefine, T.typeRefineEnd) : "";
  const focus = prog(frame, T.typeRefine - 12, T.typeRefine) * (1 - prog(frame, T.sendRefine + 6, T.sendRefine + 20));
  const ring = prog(frame, T.sendRefine, T.sendRefine + 18);
  return (
    <div
      style={{
        position: "absolute",
        left: 320,
        top: 790,
        width: 580,
        height: 92,
        background: "#fff",
        borderRadius: 14,
        border: `1px solid ${focus > 0.5 ? "#9bb5a6" : "#cfd3c8"}`,
        boxShadow: `0 0 0 ${focus * 4}px rgba(32,88,70,0.10), ${shadow.card}`,
      }}
    >
      <div style={{ position: "absolute", left: 20, top: 16, fontSize: 17, color: text ? C.ink : C.soft, whiteSpace: "nowrap" }}>
        {text || "Ask, paste a JD, or share a conversation note…"}
        {typing && Math.floor(frame / 8) % 2 === 0 ? (
          <span style={{ display: "inline-block", width: 2, height: 20, background: C.green, marginLeft: 2, verticalAlign: -4 }} />
        ) : null}
      </div>
      <div style={{ position: "absolute", left: 18, bottom: 14, display: "flex", gap: 22, fontSize: 14, color: C.muted }}>
        {[
          { i: I.clip, t: "Add files" },
          { i: I.case, t: "Link role" },
          { i: I.user, t: "Link candidate" },
        ].map((a) => (
          <span key={a.t} style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <a.i size={15} /> {a.t}
          </span>
        ))}
      </div>
      <div style={{ position: "absolute", right: 14, bottom: 12, width: 40, height: 40 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 40, border: `2px solid ${C.green}`, transform: `scale(${1 + ring * 0.8})`, opacity: frame >= T.sendRefine ? 1 - ring : 0 }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: 40, background: text.length > 3 ? C.green : "#a9b8ad", display: "grid", placeItems: "center" }}>
          <I.arrowUp size={19} color="#fff" stroke={2.4} />
        </div>
      </div>
    </div>
  );
};

export const WindowFrame: React.FC<{ children: React.ReactNode; opacity?: number; scale?: number }> = ({ children, opacity = 1, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: WIN.x,
      top: WIN.y,
      width: WIN.w,
      height: WIN.h,
      borderRadius: 20,
      background: C.paper,
      boxShadow: shadow.window,
      overflow: "hidden",
      opacity,
      transform: `scale(${scale})`,
      fontFamily: FONT,
    }}
  >
    {children}
  </div>
);
