import React from "react";
import { C, ease, prog, tw } from "../lib";
import { T } from "../timeline";
import { Chip, I, Label, Mark, Status } from "../ui";
import { BUBBLE_TEXT, ChipContent } from "./Hook";
import { REFINE_TEXT } from "./Shell";

const appear = (frame: number, at: number, dy = 14) => {
  const p = prog(frame, at, at + 16);
  return { opacity: p, transform: `translateY(${(1 - p) * dy}px)` };
};

const Step: React.FC<{ frame: number; y: number; start: number; done: number; label: string; detail?: string }> = ({ frame, y, start, done, label, detail }) => {
  if (frame < start) return null;
  const working = frame < done;
  return (
    <div style={{ position: "absolute", left: 0, top: y, width: 580, ...appear(frame, start, 10) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Status frame={frame} start={start} done={done} />
        <span style={{ fontSize: 19, fontWeight: 560, color: working ? C.ink : "#3d4b44" }}>{label}</span>
        {working ? <Shimmer frame={frame} /> : null}
      </div>
      {detail ? <div style={{ fontSize: 15, color: C.muted, margin: "6px 0 0 32px", ...appear(frame, start + 8, 6) }}>{detail}</div> : null}
    </div>
  );
};

const Shimmer: React.FC<{ frame: number }> = ({ frame }) => (
  <span style={{ display: "flex", gap: 4, marginLeft: 4 }}>
    {[0, 1, 2].map((i) => (
      <span key={i} style={{ width: 5, height: 5, borderRadius: 5, background: C.green, opacity: 0.25 + 0.75 * Math.max(0, Math.sin((frame - i * 4) / 4.5)) }} />
    ))}
  </span>
);

const Pills: React.FC<{ frame: number; y: number; at: number; items: string[] }> = ({ frame, y, at, items }) => (
  <div style={{ position: "absolute", left: 32, top: y, display: "flex", gap: 7 }}>
    {items.map((d, i) => (
      <div key={d} style={appear(frame, at + i * 6, 8)}>
        <Chip size={13}>
          <I.globe size={12} color={C.soft} /> {d}
        </Chip>
      </div>
    ))}
  </div>
);

export const Bubble: React.FC<{ children: React.ReactNode; top: number; height: number; width?: number; style?: React.CSSProperties }> = ({ children, top, height, width = 400, style }) => (
  <div style={{ position: "absolute", right: 0, top, width, height, background: "rgb(238,243,238)", border: "1px solid #d5e1d6", borderRadius: 14, ...style }}>{children}</div>
);

/** Conversation column, window-local (320, 120), clipped above the composer. */
export const Conversation: React.FC<{ frame: number }> = ({ frame }) => {
  const scroll = tw(frame, 425, 450, 0, 150, ease.inOut) + tw(frame, 472, 530, 0, 170, ease.inOut);
  const brief = prog(frame, T.step1 + 10, T.step1 + 30);
  const briefChips = ["Go or Rust backend", "Distributed systems", "PostgreSQL at scale", "Remote · US"];
  return (
    <div style={{ position: "absolute", left: 320, top: 106, width: 580, height: 676, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 14 - scroll, width: 580, height: 1200 }}>
        {frame >= T.morphEnd ? (
          <Bubble top={0} height={118}>
            <div style={{ position: "absolute", left: 16, top: 16, width: 368, height: 52, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10 }}>
              <ChipContent opacity={1} />
            </div>
            <div style={{ position: "absolute", left: 18, bottom: 22, fontSize: 17, color: C.ink }}>{BUBBLE_TEXT}</div>
          </Bubble>
        ) : null}
        {frame >= T.step1 - 12 ? (
          <div style={{ position: "absolute", left: 0, top: 138, display: "flex", gap: 10, alignItems: "center", ...appear(frame, T.step1 - 12, 8) }}>
            <Mark size={22} /> <span style={{ fontSize: 17, fontWeight: 650, color: C.ink }}>Hirelix</span>
          </div>
        ) : null}
        <Step frame={frame} y={180} start={T.step1} done={T.step1Done} label="Understanding the role" />
        {frame >= T.step1 + 10 ? (
          <div style={{ position: "absolute", left: 32, top: 216, width: 548, height: 140, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", boxSizing: "border-box", opacity: brief, transform: `translateY(${(1 - brief) * 10}px)` }}>
            <Label style={{ fontSize: 11 }}>Role brief</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {briefChips.map((c, i) => (
                <div key={c} style={appear(frame, T.step1 + 16 + i * 4, 6)}>
                  <Chip tone="green" size={14}>{c}</Chip>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 14, ...appear(frame, T.step1 + 34, 6) }}>Open question: is payments background required?</div>
          </div>
        ) : null}
        <Step frame={frame} y={378} start={T.step2} done={T.step2Done} label="Researching public information" />
        {frame >= T.step2 ? <Pills frame={frame} y={414} at={T.pages} items={["github.com", "engineering blog", "conference talk", "personal site"]} /> : null}
        <Step frame={frame} y={466} start={T.step3} done={T.step3Done} label="Identifying candidates" detail="Building profiles from the sources found" />
        <Step frame={frame} y={540} start={T.step4} done={T.step4Done} label="Comparing experience" detail="Checked against the must-haves in the brief" />
        {frame >= T.summary ? (
          <div style={{ position: "absolute", left: 0, top: 616, width: 560, fontSize: 17, lineHeight: 1.55, color: C.ink, ...appear(frame, T.summary, 8) }}>
            Four sample candidates are on the shortlist, each linked to the public sources behind the match.
          </div>
        ) : null}
        {frame >= T.sendRefine + 2 ? (
          <Bubble top={712} height={60} width={460} style={appear(frame, T.sendRefine + 2, 12)}>
            <div style={{ position: "absolute", left: 18, top: 18, fontSize: 17, color: C.ink, whiteSpace: "nowrap" }}>{REFINE_TEXT}</div>
          </Bubble>
        ) : null}
        <Step frame={frame} y={800} start={T.step5} done={T.step5Done} label="Re-checking sources for payments work" />
        {frame >= T.step5 ? <Pills frame={frame} y={836} at={T.step5 + 4} items={["engineering blog", "conference talk", "github.com"]} /> : null}
        <Step frame={frame} y={886} start={T.step6} done={T.step6Done} label="Re-ranking the shortlist" />
        {frame >= T.reply ? (
          <div style={{ position: "absolute", left: 0, top: 932, width: 560, fontSize: 17, lineHeight: 1.55, color: C.ink, ...appear(frame, T.reply, 8) }}>
            Priya and Sofia move up: both have shipped payments systems. Marcus has billing integrations only.
          </div>
        ) : null}
      </div>
    </div>
  );
};
