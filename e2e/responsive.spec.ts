import { test, expect } from "@playwright/test";

test.describe("Responsive - Landing Page", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("should show the mobile desktop-first guidance card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Best experienced on desktop")).toBeVisible();
    await expect(page.getByTestId("mobile-sample-cta")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in on this device/i })).toBeVisible();
  });

  test("should hide the desktop-only hero form and shortlist demo on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByPlaceholder("Paste the full JD here. We will keep it ready for you on the next step."),
    ).toBeHidden();
    await expect(page.getByText("James Liu")).toBeHidden();
    await expect(page.getByRole("button", { name: "Sign In" }).first()).toBeVisible();
  });

  test("should open the generic auth modal from the mobile sign-in action", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Sign in on this device/i }).click();
    await expect(page.getByTestId("landing-auth-modal")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in and keep moving." })).toBeVisible();
    await expect(page.getByTestId("landing-auth-preview-title")).toHaveCount(0);
  });

  test("should still render the major conversion sections on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Paste a JD/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What happens after the click" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Why teams switch from manual sourcing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Objections answered up front" })).toBeVisible();
  });
});

test.describe("Responsive - Auth Page", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("should display login form correctly on mobile", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Sign in to keep moving" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use password instead" })).toBeVisible();
    await expect(page.getByText(/No account\?/i)).toHaveCount(0);
  });
});
