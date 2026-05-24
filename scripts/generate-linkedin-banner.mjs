import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const width = 1584;
const height = 396;
const outPath = path.resolve("docs/growth/hirelix-linkedin-banner-2026-05-24.png");

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const title = "Hirelix";
const headline = "Evidence-backed technical shortlists";
const subhead = "AI sourcing for technical recruiters";
const proof = "Role brief -> ranked profiles -> fit evidence -> outreach context";

const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#F8FAFC"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF"/>
  <path d="M0 0H${width}V${height}H0V0Z" fill="#F8FAFC"/>
  <path d="M1130 -80C1300 -20 1450 75 1590 205V396H760C868 226 988 22 1130 -80Z" fill="#DBEAFE"/>
  <path d="M1310 24C1415 66 1512 132 1584 210V396H1005C1084 244 1185 86 1310 24Z" fill="#E0F2FE"/>
  <path d="M870 328C995 250 1125 220 1255 238C1368 254 1474 309 1584 390V396H860C858 371 861 348 870 328Z" fill="#D1FAE5"/>
  <rect x="430" y="74" width="72" height="72" rx="18" fill="#2563EB"/>
  <path d="M450 100C450 93.9249 454.925 89 461 89H477C483.075 89 488 93.9249 488 100V113C488 119.075 483.075 124 477 124H461C454.925 124 450 119.075 450 113V100Z" fill="white" opacity="0.92"/>
  <path d="M492 127C492 120.925 496.925 116 503 116H516C522.075 116 527 120.925 527 127V140C527 146.075 522.075 151 516 151H503C496.925 151 492 146.075 492 140V127Z" fill="white" opacity="0.74"/>
  <circle cx="509" cy="99" r="10" fill="white" opacity="0.52"/>
  <circle cx="464" cy="142" r="10" fill="white" opacity="0.52"/>
  <path d="M477 106L500 124" stroke="white" stroke-width="5" stroke-linecap="round" opacity="0.60"/>
  <text x="530" y="118" fill="#0F172A" font-family="Inter, Arial, Helvetica, sans-serif" font-size="46" font-weight="800" letter-spacing="0">${escapeXml(title)}</text>
  <text x="430" y="206" fill="#0F172A" font-family="Inter, Arial, Helvetica, sans-serif" font-size="44" font-weight="760" letter-spacing="0">${escapeXml(headline)}</text>
  <text x="430" y="264" fill="#334155" font-family="Inter, Arial, Helvetica, sans-serif" font-size="28" font-weight="560" letter-spacing="0">${escapeXml(subhead)}</text>
  <rect x="430" y="300" width="785" height="42" rx="21" fill="#EFF6FF"/>
  <text x="456" y="328" fill="#1D4ED8" font-family="Inter, Arial, Helvetica, sans-serif" font-size="21" font-weight="650" letter-spacing="0">${escapeXml(proof)}</text>
  <circle cx="1298" cy="137" r="54" fill="#2563EB" opacity="0.92"/>
  <circle cx="1397" cy="217" r="36" fill="#10B981" opacity="0.88"/>
  <circle cx="1206" cy="246" r="24" fill="#F59E0B" opacity="0.88"/>
  <path d="M1298 137C1332 160 1365 187 1397 217" stroke="#0F172A" stroke-width="7" stroke-linecap="round" opacity="0.18"/>
  <path d="M1206 246C1268 211 1332 202 1397 217" stroke="#0F172A" stroke-width="7" stroke-linecap="round" opacity="0.18"/>
</svg>`;

await fs.mkdir(path.dirname(outPath), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(outPath);
console.log(outPath);
