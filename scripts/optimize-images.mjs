#!/usr/bin/env node
/**
 * Recompress the raster assets in public/ without changing their format,
 * dimensions or paths.
 *
 * Why re-encode in place instead of converting to WebP/AVIF:
 *   - public/manifest.json pins `"type": "image/png"` for the PWA icon set,
 *   - public/sw.js precaches specific .png paths,
 *   - ~48 code sites reference /icons/*.png directly.
 * Converting formats would mean touching all of those and risking the install
 * prompt on Android. Re-encoding gives most of the win for none of the risk.
 *
 * The source images were exported as unoptimized truecolor PNGs — a 512x512
 * icon has no business being 500KB. sharp re-encodes at maximum effort and
 * quantizes to a palette where that is lossless enough, typically cutting
 * 65-80% while keeping the alpha channel intact.
 *
 * Usage:
 *   node scripts/optimize-images.mjs            # rewrite files in place
 *   node scripts/optimize-images.mjs --check    # fail if anything is unoptimized
 *   node scripts/optimize-images.mjs --dry-run  # report savings, write nothing
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(process.cwd(), "public");
const RASTER = new Set([".png", ".jpg", ".jpeg"]);

// Files smaller than this are already fine; re-encoding them is noise.
const MIN_BYTES = 8 * 1024;
// Only rewrite when the saving is worth a new blob in git history.
const MIN_SAVING_RATIO = 0.1;

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const CHECK = args.has("--check");

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (RASTER.has(path.extname(entry.name).toLowerCase())) yield full;
  }
}

async function recompress(file, buffer) {
  const ext = path.extname(file).toLowerCase();
  const image = sharp(buffer);
  const meta = await image.metadata();

  if (ext === ".jpg" || ext === ".jpeg") {
    return image.jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();
  }

  // Palette quantization is the big win for flat/illustrated icons. sharp
  // keeps the alpha channel, so transparent icons stay transparent.
  return image
    .png({
      compressionLevel: 9,
      effort: 10,
      palette: true,
      quality: meta.hasAlpha ? 90 : 85,
    })
    .toBuffer();
}

const results = [];
let originalTotal = 0;
let optimizedTotal = 0;

for await (const file of walk(ROOT)) {
  const { size } = await stat(file);
  originalTotal += size;

  if (size < MIN_BYTES) {
    optimizedTotal += size;
    continue;
  }

  const buffer = await readFile(file);
  let output;
  try {
    output = await recompress(file, buffer);
  } catch (error) {
    console.warn(`  skipped ${path.relative(ROOT, file)}: ${error.message}`);
    optimizedTotal += size;
    continue;
  }

  const saving = 1 - output.length / size;
  if (output.length >= size || saving < MIN_SAVING_RATIO) {
    optimizedTotal += size;
    continue;
  }

  optimizedTotal += output.length;
  results.push({ file, before: size, after: output.length, saving });

  if (!DRY_RUN && !CHECK) await writeFile(file, output);
}

results.sort((a, b) => b.before - a.before);

const kb = (bytes) => `${Math.round(bytes / 1024)}KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)}MB`;

if (results.length === 0) {
  console.log(`public/ is already optimized (${mb(originalTotal)}).`);
  process.exit(0);
}

for (const { file, before, after, saving } of results.slice(0, 20)) {
  const name = path.relative(ROOT, file);
  console.log(`  ${name.padEnd(42)} ${kb(before).padStart(7)} -> ${kb(after).padStart(7)}  (-${Math.round(saving * 100)}%)`);
}
if (results.length > 20) console.log(`  ... and ${results.length - 20} more`);

console.log("");
console.log(`  files changed: ${results.length}`);
console.log(`  public/:       ${mb(originalTotal)} -> ${mb(optimizedTotal)}  (-${Math.round((1 - optimizedTotal / originalTotal) * 100)}%)`);

if (CHECK) {
  console.log("");
  console.log("Unoptimized images found. Run: node scripts/optimize-images.mjs");
  process.exit(1);
}

if (DRY_RUN) {
  console.log("");
  console.log("Dry run only. Nothing was written.");
}
