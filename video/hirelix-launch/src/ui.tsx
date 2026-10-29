import React from "react";
import { C, FONT, ease, tw } from "./lib";

/* ---------- Icons (lucide-style strokes, matching the product UI) ---------- */

type IconProps = { size?: number; color?: string; stroke?: number };
const Svg: React.FC<IconProps & { children: React.ReactNode }> = ({
  size = 18,
  color = "currentColor",
  stroke = 1.8,
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, display: "block" }}
  >
    {children}
  </svg>
);

export const I = {
  pencil: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  ),
  user: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7.5 17a5 5 0 0 1 9 0" />
    </Svg>
  ),
  case: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </Svg>
  ),
  send: (p: IconProps) => (
    <Svg {...p}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </Svg>
  ),
  bell: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </Svg>
  ),
  clip: (p: IconProps) => (
    <Svg {...p}>
      <path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </Svg>
  ),
  arrowUp: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  ),
  arrowUpRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 17 17 7M7 7h10v10" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  ),
  globe: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Svg>
  ),
  file: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </Svg>
  ),
  pin: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </Svg>
  ),
  building: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" />
    </Svg>
  ),
  note: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 3h10l4 4v14H5Z" />
      <path d="M9 10h6M9 14h6M9 18h3" />
    </Svg>
  ),
  chat: (p: IconProps) => (
    <Svg {...p}>
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.2A8 8 0 1 1 21 12Z" />
    </Svg>
  ),
  history: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </Svg>
  ),
  sliders: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </Svg>
  ),
};

/* ---------- Brand mark (exact geometry of src/components/BrandMark.tsx) ---------- */

export const Mark: React.FC<{ size?: number; color?: string }> = ({
  size = 32,
  color = C.green,
}) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    fill={color}
    style={{ flexShrink: 0, display: "block" }}
  >
    <g transform="rotate(-8 16 16)">
      <rect x="3" y="3" width="11" height="11" rx="2" />
      <circle cx="23.5" cy="8.5" r="5.5" opacity=".5" />
      <rect x="3" y="18" width="11" height="11" rx="2" opacity=".5" />
      <path d="M20 18h7a2 2 0 0 1 2 2v2a7 7 0 0 1-7 7h-2a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
    </g>
  </svg>
);

/* ---------- Primitives ---------- */

export const shadow = {
  card: "0 1px 0 rgba(30,48,43,0.04), 0 18px 40px -22px rgba(27,64,45,0.28)",
  lift: "0 1px 0 rgba(30,48,43,0.05), 0 30px 70px -30px rgba(27,64,45,0.38)",
  window: "0 2px 0 rgba(30,48,43,0.03), 0 50px 120px -50px rgba(23,62,50,0.45), 0 0 0 1px rgba(30,48,43,0.06)",
};

export const Chip: React.FC<{
  children: React.ReactNode;
  tone?: "plain" | "green" | "tint" | "solid";
  size?: number;
  style?: React.CSSProperties;
}> = ({ children, tone = "plain", size = 15, style }) => {
  const tones = {
    plain: { background: C.paper, border: `1px solid ${C.line}`, color: "#4a574f" },
    green: { background: "#eef3ee", border: `1px solid #cfdccf`, color: C.green },
    tint: { background: C.tint, border: `1px solid #d3e0b4`, color: "#2f4a2a" },
    solid: { background: C.green, border: `1px solid ${C.green}`, color: "#fff" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: `${size * 0.36}px ${size * 0.72}px`,
        borderRadius: 6,
        fontSize: size,
        fontWeight: 500,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        ...tones,
        ...style,
      }}
    >
      {children}
    </span>
  );
};

export const Avatar: React.FC<{ initials: string; size?: number; tone?: number }> = ({
  initials,
  size = 44,
  tone = 0,
}) => {
  const tones = [
    ["#dfe9e1", "#205846"],
    ["#e8ecdf", "#4c5f3a"],
    ["#e4edce", "#3c5a2a"],
    ["#e9e7dd", "#5b5a45"],
  ][tone % 4];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        background: tones[0],
        color: tones[1],
        display: "grid",
        placeItems: "center",
        fontSize: size * 0.36,
        fontWeight: 650,
        letterSpacing: 0.3,
        flexShrink: 0,
        boxShadow: "inset 0 0 0 1px rgba(32,88,70,0.10)",
      }}
    >
      {initials}
    </div>
  );
};

/** Activity status glyph: a deterministic spinner that resolves into a check. */
export const Status: React.FC<{ frame: number; start: number; done: number; size?: number }> = ({
  frame,
  start,
  done,
  size = 20,
}) => {
  const p = tw(frame, done - 2, done + 8, 0, 1, ease.out);
  const rot = (frame - start) * 14;
  return (
    <div style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        style={{ position: "absolute", inset: 0, opacity: 1 - p, transform: `rotate(${rot}deg)` }}
      >
        <circle cx="10" cy="10" r="7.5" fill="none" stroke={C.line} strokeWidth="2" />
        <path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: size,
          background: C.green,
          display: "grid",
          placeItems: "center",
          opacity: p,
          transform: `scale(${0.6 + 0.4 * p})`,
        }}
      >
        <I.check size={size * 0.62} color="#fff" stroke={2.6} />
      </div>
    </div>
  );
};

/**
 * Text line revealed from behind a mask. `inAt` slides it up into view,
 * `outAt` (optional) slides it up and out.
 */
export const MaskText: React.FC<{
  frame: number;
  inAt: number;
  outAt?: number;
  dur?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  pad?: number;
}> = ({ frame, inAt, outAt, dur = 22, children, style, pad = 0.18 }) => {
  const pin = tw(frame, inAt, inAt + dur, 1, 0, ease.out);
  const pout = outAt === undefined ? 0 : tw(frame, outAt, outAt + 16, 0, 1, ease.in);
  const y = pin * 108 - pout * 108;
  return (
    <span
      style={{
        display: "inline-block",
        overflow: "hidden",
        verticalAlign: "top",
        paddingBottom: `${pad}em`,
        marginBottom: `-${pad}em`,
      }}
    >
      <span
        style={{
          display: "inline-block",
          transform: `translateY(${y}%)`,
          opacity: 1 - pout * 0.6,
          ...style,
        }}
      >
        {children}
      </span>
    </span>
  );
};

/** Headline whose words rise from a mask one after another. */
export const KineticLine: React.FC<{
  frame: number;
  text: string;
  inAt: number;
  outAt?: number;
  stagger?: number;
  style?: React.CSSProperties;
  wordStyle?: (i: number) => React.CSSProperties | undefined;
}> = ({ frame, text, inAt, outAt, stagger = 3, style, wordStyle }) => {
  const words = text.split(" ");
  return (
    <div style={{ fontFamily: FONT, whiteSpace: "nowrap", ...style }}>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <MaskText
            frame={frame}
            inAt={inAt + i * stagger}
            outAt={outAt === undefined ? undefined : outAt + i * 0.8}
            style={wordStyle?.(i)}
          >
            {w}
          </MaskText>
          {i < words.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </div>
  );
};

export const Label: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      fontSize: 12,
      fontWeight: 650,
      letterSpacing: 1.8,
      textTransform: "uppercase",
      color: C.soft,
      ...style,
    }}
  >
    {children}
  </div>
);
