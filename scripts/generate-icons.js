const sharp = require("sharp");
const path = require("path");

function makeSvg(size) {
  const fontSize = Math.round(size * 0.32);
  const rx = Math.round(size * 0.15);
  const spacing = Math.round(size * 0.02);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#000000" rx="${rx}"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
    font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-weight="800"
    font-size="${fontSize}" fill="#ffffff" letter-spacing="${spacing}">SOON</text>
</svg>`;
}

async function generate() {
  const outDir = path.join(__dirname, "..", "public");
  const configs = [
    { name: "apple-touch-icon.png", size: 180 },
    { name: "icon-192.png", size: 192 },
    { name: "icon-512.png", size: 512 },
    { name: "icon-maskable-512.png", size: 512 },
  ];
  for (const c of configs) {
    const svg = Buffer.from(makeSvg(c.size));
    await sharp(svg).png().toFile(path.join(outDir, c.name));
    console.log("Created", c.name, `(${c.size}x${c.size})`);
  }
  console.log("Done!");
}

generate().catch(console.error);
