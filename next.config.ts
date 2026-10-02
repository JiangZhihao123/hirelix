import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactCompiler: true,
  // OAuth callbacks carry one-time credentials in their query string.
  logging: {
    incomingRequests: { ignore: [/^\/api\/auth\/callback\//, /^\/recommendation\//] },
  },
  outputFileTracingIncludes: {
    "/api/workspace/deliverables/*/export": ["./src/assets/fonts/*"],
  },
  async headers() {
    return [{ source: "/recommendation/:path*", headers: [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ] }];
  },
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
