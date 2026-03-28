import { test, expect } from "@playwright/test";

test.describe("Authentication Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app");
  });

  test("should show login form when not authenticated", async ({ page }) => {
    // Should show sign-in page with logo
    await expect(page.getByRole("heading", { name: "Sign in to keep moving" })).toBeVisible();
    await expect(page.getByText("Use Google, email, or password to continue into the next shortlist flow.")).toBeVisible();
  });

  test("should display Google OAuth button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
  });

  test("should display email OTP form and allow switching to password login", async ({ page }) => {
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use password instead" })).toBeVisible();

    await page.getByRole("button", { name: "Use password instead" }).click();

    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with password" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use email code instead" })).toBeVisible();
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

  test("should not submit form with empty fields", async ({ page }) => {
    // Try submit with empty fields — form should use native validation
    await page.getByRole("button", { name: "Continue with email" }).click();
    // Should still be on the auth page
    await expect(page.getByRole("heading", { name: "Sign in to keep moving" })).toBeVisible();
  });
});
