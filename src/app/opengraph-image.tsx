import { ImageResponse } from "next/og";

export const alt = "Hirelix — Your personal AI agent for headhunting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#f8f8f2",
        padding: "65px 85px",
        display: "flex",
        flexDirection: "column",
        color: "#1e302b",
      }}
    >
      <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
        hirelix.
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 75,
          fontSize: 64,
          letterSpacing: -3,
          lineHeight: 1.1,
        }}
      >
        <span>Your personal AI agent</span>
        <span style={{ color: "#48664b" }}>for headhunting.</span>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 36,
          fontSize: 24,
          color: "#65716a",
        }}
      >
        Your candidates. Your context. From one role to the next.
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          color: "#205846",
          fontSize: 18,
        }}
      >
        hirelix.online
      </div>
    </div>,
    size,
  );
}
