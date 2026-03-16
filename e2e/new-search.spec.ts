import { test, expect } from "@playwright/test";

test.describe("New Search Page (unauthenticated)", () => {
  test("should show the auth gate when accessing /app/search/new directly", async ({ page }) => {
    await page.goto("/app/search/new");
    await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  });

  test("should preserve a prefilled JD at the auth gate", async ({ page }) => {
    await page.goto("/app/search/new?jd=Senior%20Software%20Engineer&intent_path=sample");
    await expect(page.getByRole("heading", { name: "Sign in to open this search" })).toBeVisible();
    await expect(page.getByText("Senior Software Engineer")).toBeVisible();
  });
});

test.describe("New Search Page UI", () => {
  test("should show auth gate for all product routes", async ({ page }) => {
    const routes = ["/app", "/app/search/new"];
    for (const route of routes) {
      await page.goto(route);
      const expectedHeading =
        route === "/app"
          ? "Sign in to continue"
          : "Sign in to continue";
      await expect(page.getByRole("heading", { name: expectedHeading })).toBeVisible();
    }
  });
});
