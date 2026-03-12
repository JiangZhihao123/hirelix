import { test, expect } from "@playwright/test";

test.describe("Responsive - Landing Page", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("should show sticky mobile CTA on small screens", async ({ page }) => {
    await page.goto("/");
    // Sticky mobile CTA at the bottom
    await expect(
      page.getByRole("link", { name: /Start Sourcing — Free/i })
    ).toBeVisible();
  });

  test("should hide desktop-only nav links on mobile", async ({ page }) => {
    await page.goto("/");
    // "How It Works" and "Product" nav links should be hidden (sm:block)
    await expect(page.locator("nav a[href='#how-it-works']")).toBeHidden();
    await expect(page.locator("nav a[href='#product']")).toBeHidden();
    // But Try It Free should still be visible
    await expect(page.getByRole("link", { name: "Try It Free" })).toBeVisible();
  });

  test("should still render all major sections on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Paste a JD/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What you get" })).toBeVisible();
    await expect(page.getByText("Manual sourcing takes hours.")).toBeVisible();
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
