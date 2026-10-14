import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";

const pdfRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

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
