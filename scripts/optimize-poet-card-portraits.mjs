/**
 * Downscale large poet portraits in public/poets/ for fast voice cards.
 * Run: node scripts/optimize-poet-card-portraits.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const poetsDir = path.join(process.cwd(), "public/poets");

/** Source files (under public/poets/) that were shipped as multi‑MB PNGs. */
const SOURCES = [
  "eliot.png",
  "frost.png",
  "ghalib.png",
  "gibran.png",
  "kipling.png",
  "lao.png",
  "rilke.png",
  "ryokan.png",
  "tagore.png",
];

const WIDTH = 560;
const HEIGHT = 700;

async function main() {
  for (const file of SOURCES) {
    const inputPath = path.join(poetsDir, file);
    const stem = path.parse(file).name;
    const outputPath = path.join(poetsDir, `${stem}.jpg`);

    try {
      await fs.access(inputPath);
    } catch {
      console.warn(`skip (missing): ${file}`);
      continue;
    }

    await sharp(inputPath)
      .rotate()
      .resize(WIDTH, HEIGHT, { fit: "cover", position: "top" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(outputPath);

    const before = (await fs.stat(inputPath)).size;
    const after = (await fs.stat(outputPath)).size;
    await fs.unlink(inputPath);
    console.log(`${file} → ${stem}.jpg  (${(before / 1e6).toFixed(2)} MB → ${(after / 1e3).toFixed(0)} KB)`);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
