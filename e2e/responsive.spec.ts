import { test, expect } from "@playwright/test";

test.describe("Responsive - Landing Page", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("should show the mobile landing hero and primary action", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /A day of technical candidate research, done in 15 minutes/i })).toBeVisible();
    await expect(page.getByTestId("hero-sample-link")).toBeVisible();
    await expect(page.getByTestId("hero-product-proof")).toBeVisible();
    await expect(page.getByTestId("nav-primary-cta")).toBeVisible();
    await expect(page.getByTestId("nav-primary-cta")).toHaveText(/Try for free/i);
  });

  test("should keep the JD form and pricing section usable on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByPlaceholder("Paste the full client job description here..."),
    ).toBeVisible();
    await expect(page.getByText("Free", { exact: true })).toBeVisible();
    await expect(page.getByText("Starter", { exact: true })).toBeVisible();
    await expect(page.getByText("Pro", { exact: true })).toBeVisible();
  });

  test("should enter the free-trial flow from the mobile primary action", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-primary-cta").click();
    await expect(page).toHaveURL(/\/app\/search\/new\?.*entry=free_trial/);
    await expect(page.getByTestId("landing-auth-modal")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Start your free shortlist" })).toBeVisible();
  });

  test("should still render the major conversion sections on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /A day of technical candidate research, done in 15 minutes/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "From client role to ranked candidate pool." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Technical sourcing work, compressed into one review surface." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pick the client-role volume you need." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Practical references for technical sourcing." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The first questions before you paste a client role" })).toBeVisible();
  });
});

test.describe("Responsive - Auth Page", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("should display login form correctly on mobile", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Sign in to Hirelix" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use password instead" })).toBeVisible();
    await expect(page.getByText(/No account\?/i)).toHaveCount(0);
  });
});
