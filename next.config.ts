import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactCompiler: true,
  outputFileTracingIncludes: {
    "/api/workspace/deliverables/*/export": ["./src/assets/fonts/*"],
  },
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
