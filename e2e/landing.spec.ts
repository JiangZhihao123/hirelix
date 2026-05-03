import { test, expect } from "@playwright/test";

const validJd =
  "We need a senior software engineer with API, distributed systems, PostgreSQL, cloud infrastructure, observability, and strong product engineering experience for a fast-moving SaaS team.";

test.describe("Landing Page", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop-only landing assertions are covered in responsive tests.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display the core landing sections and CTAs", async ({ page }) => {
    await expect(page.getByAltText("Hirelix").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Paste a JD\./i })).toBeVisible();
    await expect(page.getByTestId("hero-primary-cta")).toHaveText(/Get ranked shortlist/i);
    await expect(page.getByTestId("hero-sample-link")).toBeVisible();
    await expect(page.getByText("James Liu")).toBeVisible();
    await expect(page.getByText("Anika Nair")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Why teams switch from manual sourcing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Objections answered up front" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with the role already on your desk." })).toBeVisible();
    await expect(page.getByText("AI-powered candidate sourcing from real LinkedIn profiles.")).toBeVisible();
  });

  test("hero CTA should clearly communicate the disabled state", async ({ page }) => {
    const cta = page.getByTestId("hero-primary-cta");

    await expect(cta).toBeDisabled();
    await expect(page.getByText("No JD handy? Try a sample:")).toBeVisible();

    await page.getByPlaceholder("Paste the full job description here...").fill("Too short");

    await expect(cta).toBeDisabled();
    await expect(page.getByText("Paste at least 50 characters to continue.")).toBeVisible();
  });

  test("desktop primary CTA should open an accessible landing auth modal", async ({ page }) => {
    await page.getByPlaceholder("Paste the full job description here...").fill(validJd);

    await expect(page.getByTestId("hero-primary-cta")).toBeEnabled();
    await page.getByTestId("hero-primary-cta").click();

    const modal = page.getByTestId("landing-auth-modal");
    await expect(page).toHaveURL("/");
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute("role", "dialog");
    await expect(modal).toHaveAttribute("aria-modal", "true");
    await expect(page.getByRole("heading", { name: "One more step to open your shortlist." })).toBeVisible();
    await expect(page.getByTestId("landing-auth-preview-title")).toContainText("senior software engineer");
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use password instead" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Close sign in dialog" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId("hero-primary-cta")).toBeFocused();
  });

  test("sample path should open the landing auth modal with a prefilled JD", async ({ page }) => {
    await page.getByTestId("hero-sample-link").click();

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("landing-auth-modal")).toBeVisible();
    await expect(page.getByRole("heading", { name: "One more step to open your shortlist." })).toBeVisible();
    await expect(page.getByTestId("landing-auth-preview-title")).toHaveText("Senior Software Engineer");
  });

  test("pricing CTAs should preserve plan intent before sign in", async ({ page }) => {
    await page.getByRole("button", { name: "Start free" }).click();
    await expect(page.getByTestId("landing-auth-modal")).toHaveAttribute("data-selected-plan", "free");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Start annual" }).click();
    await expect(page.getByTestId("landing-auth-modal")).toHaveAttribute("data-selected-plan", "pro_annual");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Start Business" }).click();
    await expect(page.getByTestId("landing-auth-modal")).toHaveAttribute("data-selected-plan", "business_monthly");
  });

  test("Agency contact should remain a mailto link instead of opening auth", async ({ page }) => {
    const agencyContact = page.getByRole("link", { name: /Contact us/i }).first();

    await expect(agencyContact).toHaveAttribute(
      "href",
      "mailto:support@hirelix.online?subject=Agency%20Plan%20Inquiry",
    );
    await expect(page.getByTestId("landing-auth-modal")).toHaveCount(0);
  });
});

test.describe("Landing Page mobile responsiveness", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should show a compact saved-JD auth modal on mobile", async ({ page }) => {
    await page.getByPlaceholder("Paste the full job description here...").fill(validJd);
    await page.getByTestId("hero-primary-cta").click();

    await expect(page.getByTestId("landing-auth-modal")).toBeVisible();
    await expect(page.getByTestId("landing-auth-modal").getByText("Your JD is saved", { exact: true })).toBeVisible();
    await expect(page.getByTestId("landing-auth-preview-title")).toContainText("senior software engineer");
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
  });

  test("should keep mobile pricing focused on primary plans", async ({ page }) => {
    await page.getByRole("heading", { name: "Start free. Upgrade when sourcing gets busy." }).scrollIntoViewIfNeeded();

    await expect(page.getByRole("button", { name: "Start free" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start annual" })).toBeVisible();
    await expect(page.getByText("Team plans and add-ons")).toBeVisible();
    await expect(page.getByText("Need more in a heavy month?")).toBeHidden();
  });
});
