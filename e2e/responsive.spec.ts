import { test, expect } from "@playwright/test";

test.describe("Responsive - Landing Page", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("should show the mobile landing hero and primary action", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Turn a client JD into an evidence-backed shortlist/i })).toBeVisible();
    await expect(page.getByTestId("hero-primary-cta")).toBeVisible();
    await expect(page.getByTestId("hero-sample-link")).toBeVisible();
    await expect(page.getByTestId("nav-primary-cta")).toBeVisible();
  });

  test("should keep the JD form and shortlist preview usable on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByPlaceholder("Paste the full client job description here..."),
    ).toBeVisible();
    await expect(page.getByText("James Liu")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free" })).toBeVisible();
  });

  test("should focus the JD form from the mobile primary action", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-primary-cta").click();
    await expect(page.getByTestId("landing-auth-modal")).toHaveCount(0);
    await expect(page.getByPlaceholder("Paste the full client job description here...")).toBeFocused();
  });

  test("should still render the major conversion sections on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Turn a client JD into an evidence-backed shortlist/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "From client JD to first outreach in one flow" })).toBeVisible();
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
    await expect(page.getByPlaceholder("you@company.com")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue with email" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Use password instead" })).toHaveCount(0);
    await expect(page.getByText(/No account\?/i)).toHaveCount(0);
  });
});
