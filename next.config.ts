import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  outputFileTracingIncludes: {
    "/api/workspace/deliverables/*/export": ["./src/assets/fonts/*"],
  },
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
