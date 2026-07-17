import { test, expect } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("landing page loads and shows title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Find Me Some Jobs");
  });

  test("landing page has navigation elements", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").getByRole("link", { name: /about/i })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: /pricing/i })).toBeVisible();
  });

  test("privacy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /privacy/i })).toBeVisible();
  });

  test("pricing page loads", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: /package/i })).toBeVisible();
  });

  test("about page loads", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: /about/i })).toBeVisible();
  });

  test("auth modal opens from sign in button", async ({ page }) => {
    await page.goto("/");
    const signInButton = page.getByRole("button", { name: /sign.?in/i });
    if (await signInButton.isVisible()) {
      await signInButton.click();
      await expect(page.getByText(/welcome back/i)).toBeVisible();
    }
  });

  test("unauthenticated dashboard redirects", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL("/dashboard");
  });
});
