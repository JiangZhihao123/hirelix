import { join, sep } from "node:path";

// Next traces these assets explicitly in next.config.ts. Do not use
// require.resolve here: Turbopack replaces it with a numeric module identifier.
const pdfRoot = join(process.cwd(), "node_modules", "pdfjs-dist");

// CID fonts may rely on Adobe's predefined maps instead of an embedded ToUnicode.
// Both extraction and rendering need these assets, including in serverless builds.
export const pdfOptions = {
  cMapUrl: join(pdfRoot, "cmaps") + sep,
  cMapPacked: true,
  standardFontDataUrl: join(pdfRoot, "standard_fonts") + sep,
  wasmUrl: join(pdfRoot, "wasm") + sep,
  disableFontFace: true,
  useSystemFonts: true,
  maxImageSize: 16777216,
  isEvalSupported: false,
};
