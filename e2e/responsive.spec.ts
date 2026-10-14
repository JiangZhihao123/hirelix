import { test, expect } from "@playwright/test";

test.describe("Responsive - Landing Page", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("shows the personal agent hero and usable primary actions", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your personal AI agent for headhunting.");
    await expect(page.getByTestId("hero-primary-cta")).toBeVisible();
    await expect(page.getByTestId("nav-primary-cta")).toHaveText(/Get started/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("shows current monthly and annual plans without retired sourcing forms", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#pricing").getByRole("heading", { name: "Personal Agent", exact: true })).toHaveCount(2);
    await expect(page.locator("#pricing").getByRole("button", { name: /Start free trial/ })).toHaveCount(2);
    await expect(page.getByPlaceholder("Paste a real client job description here...")).toHaveCount(0);
    await expect(page.locator('a[href*="search/new"]')).toHaveCount(0);
  });

  test("enters the assistant trial from the mobile primary action", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("nav-primary-cta").click();
    await expect(page).toHaveURL(/\/app\?.*entry=free_trial/);
    await expect(page.getByRole("heading", { name: "Start with your private AI assistant" })).toBeVisible();
  });

  test("keeps workflow examples and FAQs usable on mobile", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "What’s on your desk?" })).toBeVisible();
    const faq = page.locator("summary").filter({ hasText: "Can I export or delete candidate information?" });
    await faq.click();
    await expect(page.locator("details").filter({ has: faq })).toHaveAttribute("open", "");
    await expect(page.getByRole("heading", { name: /Ten years of relationships/ })).toBeVisible();
  });
});

test.describe("Responsive - Auth Page", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("should display login form correctly on mobile", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Sign in to Hirelix" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use password instead" })).toBeVisible();
    await expect(page.getByText(/No account\?/i)).toHaveCount(0);
  });
});
