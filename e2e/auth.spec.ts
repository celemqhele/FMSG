import { test, expect } from "@playwright/test";

test.describe("Auth flow", () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "TestPass123!";

  test("sign up form shows validation", async ({ page }) => {
    await page.goto("/");

    // Click sign up
    const signUpBtn = page.getByRole("button", { name: /sign.?up/i });
    if (await signUpBtn.isVisible()) {
      await signUpBtn.click();
    }

    // Should see the sign up form
    await expect(page.getByText(/create account/i)).toBeVisible();
  });

  test("protected routes redirect unauthenticated users", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/");

    await page.goto("/settings");
    await expect(page).toHaveURL("/");

    await page.goto("/upgrade");
    await expect(page).toHaveURL("/");
  });

  test("privacy page is accessible without login", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /privacy policy/i })).toBeVisible();
  });

  test("terms page is accessible without login", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /terms of service/i })).toBeVisible();
  });
});
