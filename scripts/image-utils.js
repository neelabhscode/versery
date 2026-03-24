import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath) {
  await fs.ensureDir(dirPath);
}

/**
 * Download image from URL and save to disk
 * @param {string} url - Image URL
 * @param {string} outputPath - Where to save the image
 * @returns {Promise<boolean>} - Success status
 */
export async function downloadImage(url, outputPath) {
  try {
    const response = await fetch(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      console.warn(`  ⚠️  Failed to fetch ${url}: ${response.status}`);
      return false;
    }

    const buffer = await response.buffer();
    await fs.writeFile(outputPath, buffer);
    return true;
  } catch (error) {
    console.warn(`  ⚠️  Error downloading from ${url}: ${error.message}`);
    return false;
  }
}

/**
 * Convert image to grayscale
 * @param {string} inputPath - Input image path
 * @param {string} outputPath - Output image path
 * @returns {Promise<boolean>} - Success status
 */
export async function makeGrayscale(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .grayscale()
      .toFile(outputPath);
    return true;
  } catch (error) {
    console.warn(`  ⚠️  Error converting ${inputPath} to grayscale: ${error.message}`);
    return false;
  }
}

/**
 * Resize image to specified dimensions
 * @param {string} inputPath - Input image path
 * @param {string} outputPath - Output image path
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @param {boolean} fit - Fit type (cover|contain)
 * @returns {Promise<boolean>} - Success status
 */
export async function resizeImage(inputPath, outputPath, width, height, fit = 'cover') {
  try {
    const transform = sharp(inputPath);

    if (fit === 'cover') {
      transform.resize(width, height, {
        fit: 'cover',
        position: 'center'
      });
    } else {
      transform.resize(width, height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      });
    }

    await transform.toFile(outputPath);
    return true;
  } catch (error) {
    console.warn(`  ⚠️  Error resizing ${inputPath}: ${error.message}`);
    return false;
  }
}

/**
 * Process and save poet image (grayscale + resize)
 * @param {string} imageUrl - Image URL to download
 * @param {string} poetId - Poet identifier
 * @returns {Promise<string|null>} - Path to saved image or null
 */
export async function processPoetImage(imageUrl, poetId) {
  const poetsDir = path.join(publicDir, 'poets');
  await ensureDir(poetsDir);

  const tempPath = path.join(poetsDir, `${poetId}_temp.jpg`);
  const outputPath = path.join(poetsDir, `${poetId}.jpg`);

  // Skip if already exists
  if (await fs.pathExists(outputPath)) {
    return outputPath;
  }

  // Download image
  const downloaded = await downloadImage(imageUrl, tempPath);
  if (!downloaded) {
    return null;
  }

  try {
    // Resize to 400x500 (4:5 aspect)
    await resizeImage(tempPath, outputPath, 400, 500);

    // Convert to grayscale
    const grayscalePath = path.join(poetsDir, `${poetId}_gs.jpg`);
    await makeGrayscale(outputPath, grayscalePath);

    // Replace original with grayscale
    await fs.remove(outputPath);
    await fs.rename(grayscalePath, outputPath);

    // Clean up temp
    await fs.remove(tempPath);

    return outputPath;
  } catch (error) {
    console.warn(`  ⚠️  Error processing poet image for ${poetId}: ${error.message}`);
    await fs.remove(tempPath).catch(() => {});
    return null;
  }
}

/**
 * Process and save collection image (resize only)
 * @param {string} imageUrl - Image URL to download
 * @param {string} collectionId - Collection identifier
 * @returns {Promise<string|null>} - Path to saved image or null
 */
export async function processCollectionImage(imageUrl, collectionId) {
  const collectionsDir = path.join(publicDir, 'collections');
  await ensureDir(collectionsDir);

  const tempPath = path.join(collectionsDir, `${collectionId}_temp.jpg`);
  const outputPath = path.join(collectionsDir, `${collectionId}.jpg`);

  // Skip if already exists
  if (await fs.pathExists(outputPath)) {
    return outputPath;
  }

  // Download image
  const downloaded = await downloadImage(imageUrl, tempPath);
  if (!downloaded) {
    return null;
  }

  try {
    // Resize to 1200x825 (16:11 aspect)
    await resizeImage(tempPath, outputPath, 1200, 825);

    // Clean up temp
    await fs.remove(tempPath);

    return outputPath;
  } catch (error) {
    console.warn(`  ⚠️  Error processing collection image for ${collectionId}: ${error.message}`);
    await fs.remove(tempPath).catch(() => {});
    return null;
  }
}

/**
 * Get file size in MB
 * @param {string} filePath - File path
 * @returns {Promise<number>} - Size in MB
 */
export async function getFileSizeInMB(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return (stats.size / (1024 * 1024)).toFixed(2);
  } catch {
    return 0;
  }
}

/**
 * Calculate total size of directory in MB
 * @param {string} dirPath - Directory path
 * @returns {Promise<number>} - Total size in MB
 */
export async function getDirSizeInMB(dirPath) {
  try {
    if (!await fs.pathExists(dirPath)) {
      return 0;
    }

    const files = await fs.readdir(dirPath);
    let totalSize = 0;

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }

    return (totalSize / (1024 * 1024)).toFixed(2);
  } catch {
    return 0;
  }
}
