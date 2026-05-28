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
    await expect(page.getByTestId("nav-primary-cta")).toHaveText(/Try for free/i);
    await expect(page.getByRole("heading", { name: /A day of technical candidate research, done in 15 minutes/i })).toBeVisible();
    await expect(page.getByTestId("hero-primary-cta")).toHaveText(/Build shortlist/i);
    await expect(page.getByTestId("hero-sample-link")).toBeVisible();
    await expect(page.getByText("No setup required")).toHaveCount(0);
    await expect(page.getByText("Beta access")).toHaveCount(0);
    await expect(page.getByText("Invite-only beta")).toHaveCount(0);
    const hero = page.locator("#product");
    await expect(hero.getByText("Real profiles", { exact: true })).toBeVisible();
    await expect(hero.getByText("Public evidence research", { exact: true })).toBeVisible();
    await expect(hero.getByText("Outreach drafts included", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "#how-it-works");
    await expect(page.getByRole("link", { name: "Features" })).toHaveAttribute("href", "#features");
    await expect(page.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "#pricing");
    await expect(page.getByRole("link", { name: "Resources" })).toHaveAttribute("href", "#resources");
    await expect(page.getByRole("heading", { name: "From client role to ranked shortlist." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Technical sourcing work, compressed into one review surface." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with one complete shortlist." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Practical references for technical sourcing." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The first questions before you paste a client role" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with the role already on your desk." })).toBeVisible();
    await expect(page.getByText("Hirelix's AI agents search, score, and research real profiles")).toBeVisible();
    await expect(page.locator("#features").getByText("GitHub, papers, technical blogs")).toBeVisible();
    await expect(page.getByText("patent")).toHaveCount(0);
    await expect(page.getByText("news reporting")).toHaveCount(0);
  });

  test("hero CTA should clearly communicate the disabled state", async ({ page }) => {
    const cta = page.getByTestId("hero-primary-cta");

    await expect(cta).toBeDisabled();
    await expect(page.getByText("No client role handy? View a sample:")).toBeVisible();

    await page.getByPlaceholder("Paste the full client job description here...").fill("Too short");

    await expect(cta).toBeDisabled();
    await expect(page.getByText("Paste at least 50 characters to continue.")).toBeVisible();
  });

  test("desktop primary CTA should open an accessible landing auth modal", async ({ page }) => {
    await page.getByPlaceholder("Paste the full client job description here...").fill(validJd);

    await expect(page.getByTestId("hero-primary-cta")).toBeEnabled();
    await page.getByTestId("hero-primary-cta").click();

    const modal = page.getByTestId("landing-auth-modal");
    await expect(page).toHaveURL("/");
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute("role", "dialog");
    await expect(modal).toHaveAttribute("aria-modal", "true");
    await expect(page.getByRole("heading", { name: "One more step to build your shortlist." })).toBeVisible();
    await expect(page.getByTestId("landing-auth-preview-title")).toContainText("senior software engineer");
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Use password instead" })).toHaveCount(0);
    await expect(modal.getByRole("button", { name: "Close sign in dialog" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId("hero-primary-cta")).toBeFocused();
  });

  test("sample path should reveal the static shortlist without opening auth", async ({ page }) => {
    await page.getByTestId("hero-sample-link").click();

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("landing-auth-modal")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "What a technical headhunter reviews after a client JD." })).toBeVisible();
    const sampleShortlist = page.locator("#sample-shortlist");
    await expect(sampleShortlist.getByText("James Liu")).toBeVisible();
    await expect(sampleShortlist.getByText("Client brief")).toHaveCount(3);
  });

  test("Google OAuth should request better-auth social sign in with the intended callback", async ({ page }) => {
    const signInPayloads: Array<Record<string, unknown>> = [];
    await page.route("**/api/auth/sign-in/social", async (route) => {
      signInPayloads.push(JSON.parse(route.request().postData() || "{}") as Record<string, unknown>);
      await route.fulfill({ json: { redirect: false, url: null } });
    });

    await page.getByRole("button", { name: /Sign in/i }).first().click();
    await page.getByRole("button", { name: /Continue with Google/i }).click();

    await expect.poll(() => signInPayloads.length).toBe(1);
    const payload = signInPayloads[0];
    expect(payload).toMatchObject({
      provider: "google",
    });
    expect(String(payload.callbackURL)).toContain("/app/search/new");
  });

  test("pricing CTA should return focus to the JD form", async ({ page }) => {
    await page.getByRole("heading", { name: "Start with one complete shortlist." }).scrollIntoViewIfNeeded();
    const pricing = page.locator("#pricing");
    await expect(pricing.getByText("Free first run")).toBeVisible();
    await expect(pricing.getByText("Run one complete 25-profile shortlist before you pay.")).toBeVisible();
    await expect(pricing.getByText("No candidate email lookup")).toHaveCount(0);
    await expect(pricing.getByText("email lookups per month")).toHaveCount(2);
    await expect(pricing.getByText("Export and client-ready briefs included")).toHaveCount(2);

    await pricing.getByRole("button", { name: "Try for free" }).click();

    await expect(page.getByTestId("landing-auth-modal")).toHaveCount(0);
    await expect(page.getByPlaceholder("Paste the full client job description here...")).toBeFocused();
  });

  test("public landing should not ask visitors to compare pricing plans", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start free" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start annual Pro" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start Solo" })).toHaveCount(0);
    await expect(page.getByTestId("landing-auth-modal")).toHaveCount(0);
  });
});

test.describe("Landing Page mobile responsiveness", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should show a compact saved-JD auth modal on mobile", async ({ page }) => {
    await page.getByPlaceholder("Paste the full client job description here...").fill(validJd);
    await page.getByTestId("hero-primary-cta").click();

    await expect(page.getByTestId("landing-auth-modal")).toBeVisible();
    await expect(page.getByTestId("landing-auth-modal").getByText("Your JD is saved", { exact: true })).toBeVisible();
    await expect(page.getByTestId("landing-auth-preview-title")).toContainText("senior software engineer");
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toHaveCount(0);
  });

  test("should keep mobile pricing focused on the first run", async ({ page }) => {
    await page.getByRole("heading", { name: "Start with one complete shortlist." }).scrollIntoViewIfNeeded();
    const pricing = page.locator("#pricing");

    await expect(pricing.getByText("Free first run")).toBeVisible();
    await expect(pricing.getByText("Ranked 25-profile shortlist")).toBeVisible();
    await expect(pricing.getByText("Fit evidence and risks")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free" })).toHaveCount(0);
  });
});

test.describe("Auth routes", () => {
  test("should expose better-auth session endpoint instead of a legacy callback bridge", async ({ request }) => {
    const response = await request.get("/api/auth/get-session");

    expect([200, 401]).toContain(response.status());
  });
});
