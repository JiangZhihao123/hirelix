import { test, expect } from "@playwright/test";

test.describe("Authentication Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app");
  });

  test("should show login form when not authenticated", async ({ page }) => {
    // Should show sign-in page with logo
    await expect(page.getByRole("heading", { name: "Sign in to keep moving" })).toBeVisible();
    await expect(page.getByText("Use Google to continue into the next shortlist flow.")).toBeVisible();
  });

  test("should display Google OAuth button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
  });

  test("should only expose Google sign in on the product auth gate", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue with email" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Use password instead" })).toHaveCount(0);
    await expect(page.getByPlaceholder("Password")).toHaveCount(0);
  });

  test("should not expose sign up UI", async ({ page }) => {
    await expect(page.getByText("No account?")).toHaveCount(0);
    await expect(page.getByText("Already have an account?")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create Account" })).toHaveCount(0);
    await expect(page.getByPlaceholder(/Create a password/i)).toHaveCount(0);
  });

  test("should have Back to homepage link", async ({ page }) => {
    const backLink = page.getByRole("link", { name: /Back to homepage/i });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/");
  });

  test("should stay on the auth gate until Google sign in starts", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Sign in to keep moving" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeEnabled();
  });
});
