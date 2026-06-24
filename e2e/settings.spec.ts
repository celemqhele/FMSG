import { test, expect } from "@playwright/test";

test.describe("Settings page", () => {
  test("settings page redirects when not logged in", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL("/");
  });
});
