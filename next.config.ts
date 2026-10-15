import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactCompiler: true,
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "sharp", "exceljs"],
  // OAuth callbacks carry one-time credentials in their query string.
  logging: {
    incomingRequests: { ignore: [/^\/api\/auth\/callback\//, /^\/recommendation\//] },
  },
  outputFileTracingIncludes: {
    // Sharp loads libvips dynamically; tracing its JS entry alone omits the
    // shared library from Vercel functions.
    "/api/workspace/**": ["./node_modules/@img/sharp-libvips-*/lib/**/*", "./src/lib/workspace/skills/*.md", "./node_modules/pdfjs-dist/cmaps/**/*", "./node_modules/pdfjs-dist/standard_fonts/**/*", "./node_modules/pdfjs-dist/wasm/**/*"],
    "/api/workspace/deliverables/*/export": ["./src/assets/fonts/*"],
    "/api/workspace/deliverables/*/package": ["./src/assets/fonts/*"],
    "/recommendation/*/package": ["./src/assets/fonts/*"],
  },
  async redirects() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "www.hirelix.online" }],
      destination: "https://hirelix.online/:path*",
      permanent: true,
    }];
  },
  async headers() {
    return [
      ...["/app/:path*", "/api/:path*", "/ops/:path*", "/invite/:path*", "/go/:path*", "/o/:path*"].map(source => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      })),
      { source: "/recommendation/:path*", headers: [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ] }];
  },
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
