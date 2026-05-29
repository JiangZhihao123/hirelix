import { test, expect } from "@playwright/test";

test.describe("Authentication Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app");
  });

  test("should show login form when not authenticated", async ({ page }) => {
    // Should show sign-in page with logo
    await expect(page.getByRole("heading", { name: "Sign in to Hirelix" })).toBeVisible();
    await expect(page.getByText("Use Google or email to continue into the next shortlist flow.")).toHaveCount(0);
    await expect(page.getByText("Continue to Hirelix")).toHaveCount(0);
    await expect(page.getByText("Use Google or email to continue without starting over.")).toHaveCount(0);
  });

  test("should display Google and email sign-in channels", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use password instead" })).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toHaveCount(0);
  });

  test("should not expose email-password sign up UI", async ({ page }) => {
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
    await expect(page.getByRole("heading", { name: "Sign in to Hirelix" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeEnabled();
  });

  test("should frame the free-trial entry as a first shortlist", async ({ page }) => {
    await page.goto("/app/search/new?entry=free_trial");

    await expect(page.getByRole("heading", { name: "Start your free shortlist" })).toBeVisible();
    await expect(page.getByText("Try one role with targeted profile scans before you pay.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
  });

  test("should send and verify an email sign-in code", async ({ page }) => {
    const sendOtpPayloads: Array<Record<string, unknown>> = [];
    const signInPayloads: Array<Record<string, unknown>> = [];

    await page.route("**/api/auth/email-otp/send-verification-otp", async (route) => {
      sendOtpPayloads.push(JSON.parse(route.request().postData() || "{}") as Record<string, unknown>);
      await route.fulfill({ json: { success: true } });
    });
    await page.route("**/api/auth/sign-in/email-otp", async (route) => {
      signInPayloads.push(JSON.parse(route.request().postData() || "{}") as Record<string, unknown>);
      await route.fulfill({
        json: {
          token: "test-token",
          user: {
            id: "user_123",
            email: "recruiter@example.com",
            emailVerified: true,
            name: "recruiter",
            image: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });
    });

    await page.getByPlaceholder("you@company.com").fill("Recruiter@Example.com ");
    await page.getByRole("button", { name: "Continue with email" }).click();

    await expect.poll(() => sendOtpPayloads.length).toBe(1);
    expect(sendOtpPayloads[0]).toMatchObject({
      email: "recruiter@example.com",
      type: "sign-in",
    });
    await expect(page.getByText("We sent a code to recruiter@example.com.")).toBeVisible();

    await page.getByPlaceholder("6-digit code").fill("123456");
    await page.getByRole("button", { name: "Verify code" }).click();

    await expect.poll(() => signInPayloads.length).toBe(1);
    expect(signInPayloads[0]).toMatchObject({
      email: "recruiter@example.com",
      otp: "123456",
      name: "recruiter",
    });
    await expect(page).toHaveURL(/\/app$/);
  });

  test("should sign in with email and password when selected", async ({ page }) => {
    const passwordPayloads: Array<Record<string, unknown>> = [];

    await page.route("**/api/auth/sign-in/email", async (route) => {
      passwordPayloads.push(JSON.parse(route.request().postData() || "{}") as Record<string, unknown>);
      await route.fulfill({
        json: {
          redirect: false,
          token: "test-token",
          url: null,
          user: {
            id: "user_123",
            email: "recruiter@example.com",
            emailVerified: true,
            name: "recruiter",
            image: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });
    });

    await page.getByRole("button", { name: "Use password instead" }).click();
    await expect(page.getByPlaceholder("Password")).toBeVisible();

    await page.getByPlaceholder("you@company.com").fill("Recruiter@Example.com ");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in with password" }).click();

    await expect.poll(() => passwordPayloads.length).toBe(1);
    expect(passwordPayloads[0]).toMatchObject({
      email: "recruiter@example.com",
      password: "password123",
    });
    await expect(page).toHaveURL(/\/app$/);
  });
});
