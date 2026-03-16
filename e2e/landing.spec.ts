import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop-only landing assertions are covered in responsive tests.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display the navigation bar with logo and secondary sign-in CTA", async ({ page }) => {
    await expect(page.getByAltText("Hirelix").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" }).first()).toBeVisible();
  });

  test("should display hero section with a single desktop primary CTA", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Paste a JD\./i })).toBeVisible();
    await expect(page.getByText(/real linkedin candidates, ranked match reasons, and outreach-ready drafts in minutes/i)).toBeVisible();
    await expect(page.getByTestId("hero-primary-cta")).toHaveText(/See Matching Candidates/i);
    await expect(page.getByText("Under 5 minutes", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("hero-sample-link")).toBeVisible();
  });

  test("should display the desktop shortlist demo", async ({ page }) => {
    await expect(page.getByText("Preview the shortlist")).toBeVisible();
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

  test("desktop primary CTA should open the landing auth modal", async ({ page }) => {
    await page
      .getByPlaceholder("Paste the full JD here. We will keep it ready for you on the next step.")
      .fill("We need a senior software engineer with API, distributed systems, cloud infrastructure, and strong product engineering experience.");

    await expect(page.getByTestId("hero-primary-cta")).toBeEnabled();
    await page.getByTestId("hero-primary-cta").click();

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("landing-auth-modal")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in to run this shortlist." })).toBeVisible();
    await expect(page.getByTestId("landing-auth-preview-title")).toContainText("senior software engineer");
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use password instead" })).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByText(/Code sent to/i)).toHaveCount(0);
    await expect(page.getByText(/No account\?/i)).toHaveCount(0);
  });

  test("sample path should open the landing auth modal with a prefilled JD", async ({ page }) => {
    await expect(page.getByTestId("hero-sample-link")).toBeVisible();
    await page.getByTestId("hero-sample-link").click();

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("landing-auth-modal")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in to run this shortlist." })).toBeVisible();
    await expect(page.getByTestId("landing-auth-preview-title")).toHaveText("Senior Software Engineer");
  });

  test("navigation sign-in should open the generic landing auth modal", async ({ page }) => {
    await page.getByRole("button", { name: "Sign In" }).first().click();

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("landing-auth-modal")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in to continue to Hirelix." })).toBeVisible();
    await expect(page.getByText("Return to your sourcing workspace instantly")).toBeVisible();
    await expect(page.getByTestId("landing-auth-preview-title")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use password instead" })).toBeVisible();
  });
});
