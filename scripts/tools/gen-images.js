/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "..", "public");
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
    <rect width="1200" height="630" fill="#F8FAFC"/>
    <path d="M760 0H1200V630H510C610 455 690 250 760 0Z" fill="#DBEAFE"/>
    <path d="M900 70C1010 115 1106 185 1200 280V630H680C725 430 800 210 900 70Z" fill="#E0F2FE"/>
    <path d="M640 528C780 410 928 370 1080 410C1124 422 1163 440 1200 465V630H610C602 587 612 553 640 528Z" fill="#D1FAE5"/>
    <rect x="72" y="64" width="72" height="72" rx="18" fill="#2563EB"/>
    <path d="M92 91C92 84.9249 96.9249 80 103 80H119C125.075 80 130 84.9249 130 91V104C130 110.075 125.075 115 119 115H103C96.9249 115 92 110.075 92 104V91Z" fill="white" opacity="0.92"/>
    <path d="M134 118C134 111.925 138.925 107 145 107H158C164.075 107 169 111.925 169 118V131C169 137.075 164.075 142 158 142H145C138.925 142 134 137.075 134 131V118Z" fill="white" opacity="0.74"/>
    <circle cx="151" cy="90" r="10" fill="white" opacity="0.52"/>
    <circle cx="106" cy="133" r="10" fill="white" opacity="0.52"/>
    <path d="M119 97L142 115" stroke="white" stroke-width="5" stroke-linecap="round" opacity="0.60"/>
    <text x="168" y="112" font-family="Inter, system-ui, sans-serif" font-size="46" font-weight="800" fill="#0F172A">Hirelix</text>
    <text x="72" y="258" font-family="Inter, system-ui, sans-serif" font-size="62" font-weight="800" fill="#0F172A">Evidence-backed</text>
    <text x="72" y="336" font-family="Inter, system-ui, sans-serif" font-size="62" font-weight="800" fill="#2563EB">technical shortlists</text>
    <text x="72" y="410" font-family="Inter, system-ui, sans-serif" font-size="34" font-weight="650" fill="#334155">AI sourcing for technical recruiters</text>
    <rect x="72" y="462" width="690" height="48" rx="24" fill="#EFF6FF"/>
    <text x="102" y="494" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="650" fill="#1D4ED8">Role brief -&gt; ranked profiles -&gt; fit evidence -&gt; outreach context</text>
    <text x="72" y="570" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="600" fill="#64748B">hirelix.online</text>
  </svg>`);
  await sharp(ogSvg).resize(1200, 630).png().toFile(path.join(publicDir, "og-image.png"));

  console.log("All images generated!");
}

gen().catch((e) => console.error(e));
