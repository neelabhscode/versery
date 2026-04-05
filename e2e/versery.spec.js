import { test, expect } from "@playwright/test";

test.describe("Versery smoke", () => {
  test("loads home and primary navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("screen-loading")).toBeHidden({ timeout: 60_000 });
    await expect(page.getByTestId("screen-home")).toBeVisible();

    await page.getByRole("link", { name: /Emotional compass/i }).click();
    await expect(page.getByTestId("screen-compass")).toBeVisible();

    await page.getByRole("link", { name: /Poet library/i }).click();
    await expect(page.getByTestId("screen-voices")).toBeVisible();

    await page.getByRole("link", { name: /Curated collections archive/i }).click();
    await expect(page.getByTestId("screen-collections")).toBeVisible();

    await page.getByRole("link", { name: /Home — daily poem/i }).click();
    await expect(page.getByTestId("screen-home")).toBeVisible();
  });

  test("deep navigation voice to poem and back", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("screen-home")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("link", { name: /Poet library/i }).click();
    await expect(page.getByTestId("screen-voices")).toBeVisible();
    await page.locator(".voice-card").first().click();
    await expect(page.getByTestId("screen-voice-detail")).toBeVisible();
    await page.locator(".voice-work").first().click();
    await expect(page.getByTestId("screen-poem")).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("screen-voice-detail")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("screen-voices")).toBeVisible();
  });
});
