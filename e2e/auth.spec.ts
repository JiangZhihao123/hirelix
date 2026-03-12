import { test, expect } from "@playwright/test";

test.describe("Authentication Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app");
  });

  test("should show login form when not authenticated", async ({ page }) => {
    // Should show sign-in page with logo
    await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
    await expect(page.getByText("Use Google or email to get started")).toBeVisible();
  });

  test("should display Google OAuth button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
  });

  test("should display email/password form with proper fields", async ({ page }) => {
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByPlaceholder(/Password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("should toggle between login and signup mode", async ({ page }) => {
    // Initially in login mode
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByText("No account?")).toBeVisible();

    // Switch to signup
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
    await expect(page.getByPlaceholder(/Create a password/i)).toBeVisible();
    await expect(page.getByText("Already have an account?")).toBeVisible();

    // Switch back to login
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("should toggle password visibility", async ({ page }) => {
    const passwordInput = page.getByPlaceholder(/Password/i);
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Click the eye toggle button (sibling of password input, inside the same relative div)
    const passwordContainer = page.locator("div.relative").filter({ has: passwordInput });
    await passwordContainer.getByRole("button").click();
    await expect(passwordInput).toHaveAttribute("type", "text");
  });

  test("should show error on invalid login credentials", async ({ page }) => {
    await page.getByPlaceholder("you@company.com").fill("invalid@test.com");
    await page.getByPlaceholder(/Password/i).fill("wrongpassword");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Wait for error message
    await expect(page.locator("text=Invalid login credentials").or(page.locator(".text-red-500"))).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should have Back to homepage link", async ({ page }) => {
    const backLink = page.getByRole("link", { name: /Back to homepage/i });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/");
  });

  test("should not submit form with empty fields", async ({ page }) => {
    // Try submit with empty fields — form should use native validation
    await page.getByRole("button", { name: "Sign In" }).click();
    // Should still be on the auth page
    await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  });
});
