import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE_URL = "http://localhost:4173";
const OUTPUT_ROOT = path.resolve(process.cwd(), "screenshots", "app-flow");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function waitForHome(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="screen-home"]', { timeout: 60000 });
}

async function snap(page, outDir, fileName) {
  await page.screenshot({
    path: path.join(outDir, fileName),
    fullPage: true,
  });
}

async function captureFlow(page, outDir) {
  await waitForHome(page);
  await snap(page, outDir, "01-home-hero.png");

  // Mood flow (single mood example)
  await page.locator(".feeling-chip").first().click();
  await page.waitForSelector('[data-testid="screen-discovery"]');
  await snap(page, outDir, "02-mood-discovery-results.png");

  await page.locator(".voice-works-page__item").first().click();
  await page.waitForSelector('[data-testid="screen-poem"]');
  await snap(page, outDir, "03-poem-detail.png");

  await page.locator(".primary-action").click();
  await page.waitForSelector('[data-testid="screen-poem"]');
  await snap(page, outDir, "04-poem-detail-next-state.png");

  // Compass and one portal branch
  await page.getByRole("link", { name: /Emotional compass/i }).click();
  await page.waitForSelector('[data-testid="screen-compass"]');
  await snap(page, outDir, "05-compass.png");

  await page.locator(".portal-card").first().click();
  await page.waitForSelector('[data-testid="screen-discovery"]');
  await snap(page, outDir, "06-compass-discovery-results.png");

  // Voices and one poet branch
  await page.getByRole("link", { name: /Poet library/i }).click();
  await page.waitForSelector('[data-testid="screen-voices"]');
  await snap(page, outDir, "07-voices-list.png");

  await page.locator(".voice-card").first().click();
  await page.waitForSelector('[data-testid="screen-voice-detail"]');
  await snap(page, outDir, "08-voice-detail.png");

  await page.getByRole("button", { name: /View All/i }).click();
  await page.waitForSelector('[data-testid="screen-voice-works"]');
  await snap(page, outDir, "09-voice-works.png");

  // Collections and one collection branch
  await page.getByRole("link", { name: /Curated collections archive/i }).click();
  await page.waitForSelector('[data-testid="screen-collections"]');
  await snap(page, outDir, "10-collections-archive.png");

  await page.locator(".collections-archive-card").first().click();
  await page.waitForSelector('[data-testid="screen-collection-detail"]');
  await snap(page, outDir, "11-collection-detail.png");
}

async function main() {
  const desktopDir = path.join(OUTPUT_ROOT, "desktop");
  const mobileDir = path.join(OUTPUT_ROOT, "mobile");
  await ensureDir(desktopDir);
  await ensureDir(mobileDir);

  const browser = await chromium.launch({ headless: true });
  try {
    const desktopContext = await browser.newContext({
      viewport: { width: 1512, height: 982 },
      deviceScaleFactor: 1,
    });
    const desktopPage = await desktopContext.newPage();
    await captureFlow(desktopPage, desktopDir);
    await desktopContext.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const mobilePage = await mobileContext.newPage();
    await captureFlow(mobilePage, mobileDir);
    await mobileContext.close();
  } finally {
    await browser.close();
  }

  console.log(`Saved screenshots to ${OUTPUT_ROOT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
