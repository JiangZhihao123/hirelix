import { test, expect } from "@playwright/test";

test.describe("Responsive - Landing Page", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("should show the mobile desktop-first guidance card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Best experienced on desktop")).toBeVisible();
    await expect(page.getByTestId("mobile-sample-cta")).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in on this device/i })).toBeVisible();
  });

  test("should hide the desktop-only hero form and shortlist demo on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByPlaceholder("Paste the full JD here. We will keep it ready for you on the next step."),
    ).toBeHidden();
    await expect(page.getByText("James Liu")).toBeHidden();
    await expect(page.getByRole("link", { name: "Sign In" }).first()).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });
});
