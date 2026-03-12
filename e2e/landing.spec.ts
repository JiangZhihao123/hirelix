import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display the navigation bar with logo and CTA", async ({ page }) => {
    // Logo
    await expect(page.getByAltText("Hirelix").first()).toBeVisible();
    // Nav links (desktop)
    await expect(page.locator("nav a[href='#how-it-works']")).toBeVisible();
    await expect(page.locator("nav a[href='#product']")).toBeVisible();
    // CTA button
    await expect(page.getByRole("link", { name: "Try It Free" })).toBeVisible();
  });

  test("should display hero section with headline and CTA", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Paste a JD.*Get candidates/i })).toBeVisible();
    await expect(page.getByText("AI reads your job description")).toBeVisible();
    await expect(page.getByRole("link", { name: /Start Sourcing/i }).first()).toBeVisible();
    await expect(page.getByText("No credit card")).toBeVisible();
  });

  test("should display the product demo section with candidate rows", async ({ page }) => {
    await expect(page.getByText("Senior Frontend Engineer").first()).toBeVisible();
    await expect(page.getByText("James Liu")).toBeVisible();
    await expect(page.getByText("Anika Nair")).toBeVisible();
    await expect(page.getByText("Marco Rossi")).toBeVisible();
  });

  test("should display How It Works section with 3 steps", async ({ page }) => {
    const section = page.locator("#how-it-works");
    await expect(section.getByRole("heading", { name: "How it works" })).toBeVisible();
    await expect(section.getByText("Paste your job description")).toBeVisible();
    await expect(section.getByText("AI finds real people")).toBeVisible();
    await expect(section.getByText("Review and reach out")).toBeVisible();
  });

  test("should display What You Get section with feature cards", async ({ page }) => {
    const section = page.locator("#product");
    await expect(section.getByRole("heading", { name: "What you get" })).toBeVisible();
    await expect(section.getByText("AI JD Parsing")).toBeVisible();
    await expect(section.getByText("270M+ Real Profiles")).toBeVisible();
    await expect(section.getByText("Match Scoring")).toBeVisible();
    await expect(section.getByText("Outreach Emails")).toBeVisible();
    await expect(section.getByText("CSV Export")).toBeVisible();
  });

  test("should display comparison section", async ({ page }) => {
    await expect(page.getByText("Manual sourcing takes hours.")).toBeVisible();
    await expect(page.getByText("Without Hirelix", { exact: true })).toBeVisible();
    await expect(page.getByText("With Hirelix", { exact: true })).toBeVisible();
    await expect(page.getByText(/3.4 hours/)).toBeVisible();
    await expect(page.getByText(/< 5 minutes/)).toBeVisible();
  });

  test("should display final CTA section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Try it with your next open role/i })).toBeVisible();
  });

  test("should display footer with PDL attribution", async ({ page }) => {
    await expect(page.getByText("Candidate data powered by People Data Labs.")).toBeVisible();
  });

  test("CTA buttons should link to /app", async ({ page }) => {
    const ctaLinks = page.getByRole("link", { name: /Start Sourcing/i });
    const count = await ctaLinks.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      await expect(ctaLinks.nth(i)).toHaveAttribute("href", "/app");
    }
  });

  test("should navigate to /app when clicking Try It Free", async ({ page }) => {
    await page.getByRole("link", { name: "Try It Free" }).click();
    await expect(page).toHaveURL(/\/app/);
  });
});
