import React from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { C, CamKey, FONT, camTransform, camera, ease, mix, mixRect, prog } from "./lib";
import { T } from "./timeline";
import { KineticLine } from "./ui";
import { HookHeadline, HookStrip, JDCard } from "./scenes/Hook";
import { Composer, Sidebar, TitleBar, WIN, WindowFrame } from "./scenes/Shell";
import { Conversation } from "./scenes/Conversation";
import { Pane } from "./scenes/Pane";
import { BoardCard, SECTIONS, thumbRect } from "./scenes/Board";
import { ClientHeadlines, TaskPanel, Threads } from "./scenes/Client";
import { BrandHeadlines, Lockup } from "./scenes/Brand";

// Load the same Inter Variable file the website ships before any frame is captured.
const fontHandle = delayRender("Inter Variable");
const inter = new FontFace("Inter", `url(${staticFile("fonts/InterVariable.woff2")}) format("woff2")`, { weight: "100 900" });
inter
  .load()
  .then((f) => {
    document.fonts.add(f);
    continueRender(fontHandle);
  })
  .catch((err) => {
    console.error(err);
    continueRender(fontHandle);
  });

/** Pose used whenever a headline shares the frame with the product window. */
const TITLE_POSE = { z: 0.74, wx: 960, wy: 540, sx: 1250, sy: 548 };

const CAM_A: CamKey[] = [
  { f: 0, z: 1.0, wx: 1340, wy: 560, sx: 1340, sy: 560 },
  { f: 64, z: 1.07, wx: 1340, wy: 560, sx: 1340, sy: 560 },
  { f: 112, z: 1.13, wx: 1340, wy: 680, sx: 1340, sy: 670 },
  { f: 154, z: 1.0, wx: 960, wy: 540 },
  { f: 176, z: 1.0, wx: 960, wy: 540 },
  { f: 214, z: 1.24, wx: 800, wy: 500 },
  { f: 236, z: 1.24, wx: 800, wy: 500 },
  { f: 268, z: 1.16, wx: 1400, wy: 560 },
  { f: 318, z: 1.2, wx: 1410, wy: 600 },
  { f: 348, ...TITLE_POSE },
  { f: 400, ...TITLE_POSE },
  { f: 428, z: 1.26, wx: 800, wy: 700 },
  { f: 452, z: 1.28, wx: 810, wy: 690 },
  { f: 486, z: 1.1, wx: 1060, wy: 560 },
  { f: 530, z: 1.12, wx: 1080, wy: 560 },
  { f: 556, ...TITLE_POSE },
];

/** Scenes 1–3 live in one continuous world under one camera. */
const WorldA: React.FC<{ frame: number }> = ({ frame }) => {
  const win = prog(frame, T.morph, T.morphEnd - 6, ease.outSoft);
  return (
    <>
      {frame >= T.morph - 4 ? (
        <WindowFrame opacity={win} scale={1.035 - 0.035 * win}>
          <TitleBar />
          <Sidebar />
          <Conversation frame={frame} />
          <Pane frame={frame} />
          <Composer frame={frame} />
        </WindowFrame>
      ) : null}
      <JDCard frame={frame} />
      <HookStrip frame={frame} />
    </>
  );
};

const SideTitle: React.FC<{ frame: number; lines: [string, string]; inAt: number; outAt: number }> = ({ frame, lines, inAt, outAt }) => {
  if (frame < inAt - 2 || frame > outAt + 24) return null;
  const style = { fontSize: 74, fontWeight: 610, letterSpacing: -3, lineHeight: 1.08, color: C.ink };
  return (
    <div style={{ position: "absolute", left: 104, top: 404, fontFamily: FONT }}>
      <KineticLine frame={frame} text={lines[0]} inAt={inAt} outAt={outAt} style={style} />
      <KineticLine frame={frame} text={lines[1]} inAt={inAt + 6} outAt={outAt + 2} style={{ ...style, color: C.green }} />
    </div>
  );
};

export const Film: React.FC = () => {
  const frame = useCurrentFrame();

  // World A camera, then the hand-off that shrinks the whole search into a
  // "Past searches" thumbnail inside the client workspace.
  let worldA: React.CSSProperties | null = null;
  if (frame < T.collapse + 12) {
    const cam = camera(frame, CAM_A);
    if (frame < T.toClient) {
      worldA = { transform: camTransform(cam) };
    } else {
      const pose = camera(T.toClient, CAM_A);
      const from = { x: pose.tx + WIN.x * pose.z, y: pose.ty + WIN.y * pose.z, w: WIN.w * pose.z, h: WIN.h * pose.z };
      const t = prog(frame, T.toClient, T.toClientEnd, ease.cam);
      const r = mixRect(from, thumbRect(frame), t);
      const z = r.w / WIN.w;
      const fade = 1 - prog(frame, T.collapse - 6, T.collapse + 4);
      worldA = { transform: `translate(${r.x - WIN.x * z}px, ${r.y - WIN.y * z}px) scale(${z})`, opacity: fade };
    }
  }

  const disclaimer = prog(frame, T.morphEnd, T.morphEnd + 20) * (1 - prog(frame, T.collapse - 10, T.collapse + 6));

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.ink, overflow: "hidden" }}>
      <Audio src={staticFile("audio/score.wav")} />
      <Backdrop frame={frame} />

      {frame < T.hookOut + 30 ? <HookHeadline frame={frame} /> : null}

      {frame >= T.board && frame < T.collapse - 4 ? SECTIONS.map((_, i) => <BoardCard key={i} frame={frame} i={i} />) : null}

      {worldA ? (
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", ...worldA }}>
          <WorldA frame={frame} />
        </div>
      ) : null}

      <SideTitle frame={frame} lines={["AI does", "the sourcing."]} inAt={T.sourcingTitle} outAt={T.sourcingOut} />
      <SideTitle frame={frame} lines={["Your feedback.", "Its next move."]} inAt={T.feedbackTitle} outAt={T.feedbackOut} />

      {frame >= T.board - 4 && frame < T.collapse + 30 ? (
        <>
          <ClientHeadlines frame={frame} />
          <TaskPanel frame={frame} />
          <Threads frame={frame} />
        </>
      ) : null}

      {/* During the collapse the four context cards sit above the closing task panel. */}
      {frame >= T.collapse - 4 ? SECTIONS.map((_, i) => <BoardCard key={i} frame={frame} i={i} />) : null}

      <BrandHeadlines frame={frame} />
      <Lockup frame={frame} />

      <div style={{ position: "absolute", left: 40, bottom: 26, fontSize: 14, color: C.soft, opacity: disclaimer, letterSpacing: 0.2 }}>
        Illustrative product animation · Fictional candidates and client
      </div>
    </AbsoluteFill>
  );
};

/** A barely-there paper grid that drifts with the story; keeps large fields from feeling empty. */
const Backdrop: React.FC<{ frame: number }> = ({ frame }) => {
  const drift = mix(0, -60, frame / 1050);
  const op = 0.5 * (1 - prog(frame, T.lockup - 30, T.lockup + 10));
  return (
    <div
      style={{
        position: "absolute",
        inset: -100,
        backgroundImage: `linear-gradient(${C.lineSoft} 1px, transparent 1px), linear-gradient(90deg, ${C.lineSoft} 1px, transparent 1px)`,
        backgroundSize: "120px 120px",
        transform: `translate(${drift}px, ${drift * 0.5}px)`,
        opacity: op,
        maskImage: "radial-gradient(ellipse at 50% 45%, black 20%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse at 50% 45%, black 20%, transparent 75%)",
      }}
    />
  );
};
