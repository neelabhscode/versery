/**
 * Resize public collection + poet images for web delivery.
 * Collections: max 600px long edge @ q80 + companion -1x.webp @ 300px (for srcset 1x/2x).
 * Poets: max 200px long edge @ q85, single .webp.
 * Removes source .jpg/.jpeg after successful WebP write.
 */
import sharp from "sharp";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const collectionsDir = path.join(root, "public", "collections");
const poetsDir = path.join(root, "public", "poets");

const RASTER_EXT = /\.(jpe?g)$/i;

async function processCollectionFile(absPath, name) {
  const baseName = name.replace(RASTER_EXT, "");
  const outMain = path.join(collectionsDir, `${baseName}.webp`);
  const out1x = path.join(collectionsDir, `${baseName}-1x.webp`);

  const img = sharp(absPath).rotate();

  await img
    .clone()
    .resize({
      width: 600,
      height: 600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toFile(outMain);

  await sharp(absPath)
    .rotate()
    .resize({
      width: 300,
      height: 300,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toFile(out1x);

  await fs.remove(absPath);
  console.log(`  collections/${name} → ${baseName}.webp + ${baseName}-1x.webp`);
}

async function processPoetFile(absPath, name) {
  const baseName = name.replace(RASTER_EXT, "");
  const out = path.join(poetsDir, `${baseName}.webp`);

  await sharp(absPath)
    .rotate()
    .resize({
      width: 200,
      height: 200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toFile(out);

  await fs.remove(absPath);
  console.log(`  poets/${name} → ${baseName}.webp`);
}

async function main() {
  console.log("Optimizing public/collections and public/poets …\n");

  for (const dir of [collectionsDir, poetsDir]) {
    if (!(await fs.pathExists(dir))) {
      console.warn(`Missing directory: ${dir}`);
      continue;
    }
  }

  const collectionFiles = (await fs.readdir(collectionsDir)).filter((f) => RASTER_EXT.test(f));
  const poetFiles = (await fs.readdir(poetsDir)).filter((f) => RASTER_EXT.test(f));

  for (const name of collectionFiles) {
    await processCollectionFile(path.join(collectionsDir, name), name);
  }

  for (const name of poetFiles) {
    await processPoetFile(path.join(poetsDir, name), name);
  }

  console.log(`\nDone. ${collectionFiles.length} collection sources, ${poetFiles.length} poet sources processed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
