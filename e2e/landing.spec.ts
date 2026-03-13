import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display the navigation bar with logo and secondary sign-in CTA", async ({ page }) => {
    await expect(page.getByAltText("Hirelix").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In" }).first()).toBeVisible();
  });

  test("should display hero section with a single desktop primary CTA", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Paste a JD\./i })).toBeVisible();
    await expect(page.getByText(/turns a job description into real candidate profiles/i)).toBeVisible();
    await expect(page.getByTestId("hero-primary-cta")).toBeVisible();
    await expect(page.getByTestId("hero-sample-link")).toBeVisible();
  });

  test("should display the desktop shortlist demo", async ({ page }) => {
    await expect(page.getByText("What the shortlist looks like")).toBeVisible();
    await expect(page.getByText("James Liu")).toBeVisible();
    await expect(page.getByText("Anika Nair")).toBeVisible();
    await expect(page.getByText("Marco Rossi")).toBeVisible();
  });

  test("should display proof and objection sections for high-intent visitors", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "What happens after the click" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Why teams switch from manual sourcing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Objections answered up front" })).toBeVisible();
  });

  test("should display the final CTA and footer", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Bring your next open role." })).toBeVisible();
    await expect(page.getByText("AI-powered candidate sourcing from real LinkedIn profiles.")).toBeVisible();
  });

  test("desktop primary CTA should carry the JD into the auth gate", async ({ page }) => {
    await page
      .getByPlaceholder("Paste the full JD here. We will keep it ready for you on the next step.")
      .fill("We need a senior frontend engineer with React, TypeScript, Next.js, design systems, and product analytics experience.");

    await expect(page.getByTestId("hero-primary-cta")).toBeEnabled();
    await page.getByTestId("hero-primary-cta").click();

    await expect(page).toHaveURL(/\/app\/search\/new\?/);
    await expect(page.getByRole("heading", { name: "Your job description is ready" })).toBeVisible();
    await expect(page.getByText(/senior frontend engineer/i)).toBeVisible();
  });

  test("sample path should route to the auth gate with a prefilled JD", async ({ page }) => {
    await expect(page.getByTestId("hero-sample-link")).toBeVisible();
    await page.getByTestId("hero-sample-link").click();

    await expect(page).toHaveURL(/\/app\/search\/new\?/);
    await expect(page.getByRole("heading", { name: "Your job description is ready" })).toBeVisible();
    await expect(page.getByText("Senior Frontend Engineer")).toBeVisible();
  });
});
