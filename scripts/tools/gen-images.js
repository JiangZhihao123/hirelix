/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
const svg = fs.readFileSync(path.join(publicDir, "logo.svg"));

async function gen() {
  // Favicon sizes
  await sharp(svg).resize(32, 32).png().toFile(path.join(publicDir, "favicon-32x32.png"));
  await sharp(svg).resize(16, 16).png().toFile(path.join(publicDir, "favicon-16x16.png"));
  await sharp(svg).resize(180, 180).png().toFile(path.join(publicDir, "apple-touch-icon.png"));
  await sharp(svg).resize(192, 192).png().toFile(path.join(publicDir, "android-chrome-192x192.png"));
  await sharp(svg).resize(512, 512).png().toFile(path.join(publicDir, "logo-512.png"));

  // OG image 1200x630
  const ogSvg = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#0a0a0a"/>
    <rect x="50" y="50" width="64" height="64" rx="16" fill="#2563EB"/>
    <text x="130" y="95" font-family="system-ui, sans-serif" font-size="40" font-weight="bold" fill="white">Hirelix</text>
    <text x="50" y="250" font-family="system-ui, sans-serif" font-size="56" font-weight="bold" fill="white">From Job Description to</text>
    <text x="50" y="320" font-family="system-ui, sans-serif" font-size="56" font-weight="bold" fill="#2563EB">Qualified Candidates</text>
    <text x="50" y="390" font-family="system-ui, sans-serif" font-size="56" font-weight="bold" fill="white">in 5 Minutes</text>
    <text x="50" y="470" font-family="system-ui, sans-serif" font-size="24" fill="#888888">AI-powered recruiting agent · 270M+ profiles · Personalized outreach</text>
    <text x="50" y="580" font-family="system-ui, sans-serif" font-size="20" fill="#555555">hirelix.online</text>
  </svg>`);
  await sharp(ogSvg).resize(1200, 630).png().toFile(path.join(publicDir, "og-image.png"));

  console.log("All images generated!");
}

gen().catch((e) => console.error(e));
