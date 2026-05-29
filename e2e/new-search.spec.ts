import { test, expect } from "@playwright/test";

test.describe("New Search Page (unauthenticated)", () => {
  test("should show the auth gate when accessing /app/search/new directly", async ({ page }) => {
    await page.goto("/app/search/new");
    await expect(page.getByRole("heading", { name: "Sign in to Hirelix" })).toBeVisible();
  });

  test("should show free-trial copy when the first-run CTA opens /app/search/new", async ({ page }) => {
    await page.goto("/app/search/new?entry=free_trial");
    await expect(page.getByRole("heading", { name: "Start your free shortlist" })).toBeVisible();
    await expect(page.getByText("Preview one client role before you pay.")).toBeVisible();
  });

  test("should preserve a prefilled JD at the auth gate", async ({ page }) => {
    await page.goto("/app/search/new?jd=Senior%20Software%20Engineer&intent_path=sample");
    await expect(page.getByRole("heading", { name: "Sign in to open your shortlist" })).toBeVisible();
    await expect(page.getByText("Senior Software Engineer")).toBeVisible();
  });
});

test.describe("New Search Page UI", () => {
  test("should show auth gate for all product routes", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Sign in to Hirelix" })).toBeVisible();

    await page.goto("/app/search/new");
    await expect(page.getByRole("heading", { name: "Sign in to Hirelix" })).toBeVisible();
  });
});
