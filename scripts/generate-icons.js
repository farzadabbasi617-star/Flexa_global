const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

function generateSVG(size) {
  const padding = Math.round(size * 0.15);
  const boltSize = size - padding * 2;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#0a0a0f"/>
    </linearGradient>
    <linearGradient id="bolt" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#a855f7"/>
      <stop offset="50%" style="stop-color:#00d4ff"/>
      <stop offset="100%" style="stop-color:#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="url(#bg)"/>
  <g transform="translate(${padding}, ${padding})">
    <text x="${boltSize/2}" y="${boltSize * 0.75}" font-family="Arial, sans-serif" font-size="${boltSize * 0.7}" font-weight="bold" fill="url(#bolt)" text-anchor="middle">⚡</text>
  </g>
</svg>`;
}

const iconsDir = path.join(__dirname, '..', 'public', 'icons');

for (const size of sizes) {
  const svg = generateSVG(size);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.svg`), svg);
  console.log(`Generated icon-${size}.svg`);
}

// We'll use SVG icons but manifest needs .png extension
// Create a simple redirect approach - copy SVGs as pngs won't work
// Instead, update manifest to use SVG
console.log('Done! Update manifest to use .svg extension');
