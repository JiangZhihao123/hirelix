import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactCompiler: true,
  // OAuth callbacks carry one-time credentials in their query string.
  logging: {
    incomingRequests: { ignore: [/^\/api\/auth\/callback\//] },
  },
  outputFileTracingIncludes: {
    "/api/workspace/deliverables/*/export": ["./src/assets/fonts/*"],
  },
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
