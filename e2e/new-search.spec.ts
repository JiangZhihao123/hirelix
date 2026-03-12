import { test, expect } from "@playwright/test";

test.describe("New Search Page (unauthenticated)", () => {
  test("should redirect to login when accessing /app/search/new", async ({ page }) => {
    await page.goto("/app/search/new");
    // Should show login because user is not authenticated
    await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  });
});

test.describe("New Search Page UI", () => {
  // These tests verify the page structure by checking what loads at /app
  // Since auth is required, we can only test the login gate

  test("should show auth gate for all product routes", async ({ page }) => {
    const routes = ["/app", "/app/search/new"];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
    }
  });
});
