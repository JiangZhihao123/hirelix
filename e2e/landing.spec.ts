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
    await expect(page.getByRole("link", { name: "Hirelix home" })).toHaveAttribute("href", "/");
    await expect(page.getByText("No setup required")).toHaveCount(0);
    await expect(page.getByText("Beta access")).toHaveCount(0);
    await expect(page.getByText("Invite-only beta")).toHaveCount(0);
    const hero = page.locator("#product");
    await expect(hero.getByText("Real profiles", { exact: true })).toBeVisible();
    await expect(hero.getByText("Public evidence research", { exact: true })).toBeVisible();
    await expect(hero.getByText("Outreach drafts included", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "#how-it-works");
    await expect(page.getByRole("link", { name: "Features" })).toHaveAttribute("href", "#features");
    await expect(page.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "#pricing");
    await expect(page.getByRole("link", { name: "Resources" })).toHaveAttribute("href", "#resources");
    await expect(page.getByRole("heading", { name: "From client role to ranked shortlist." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Technical sourcing work, compressed into one review surface." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with one role preview." })).toBeVisible();
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
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use password instead" })).toBeVisible();
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
    await expect(page).toHaveURL(/\/app\?.*entry=signin/);
    await expect(page.getByRole("heading", { name: "Sign in to Hirelix" })).toBeVisible();
    await page.getByRole("button", { name: /Continue with Google/i }).click();

    await expect.poll(() => signInPayloads.length).toBe(1);
    const payload = signInPayloads[0];
    expect(payload).toMatchObject({
      provider: "google",
    });
    expect(String(payload.callbackURL)).toContain("/app");
    expect(String(payload.callbackURL)).toContain("entry=signin");
  });

  test("nav Try for free should enter the free-trial flow", async ({ page }) => {
    await page.getByTestId("nav-primary-cta").click();

    await expect(page).toHaveURL(/\/app\/search\/new\?.*entry=free_trial/);
    await expect(page.getByTestId("landing-auth-modal")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Start your free shortlist" })).toBeVisible();
    await expect(page.getByText("Try one role with targeted profile scans before you pay.")).toBeVisible();
  });

  test("pricing CTAs should enter product sign-up and billing flows", async ({ page }) => {
    await page.getByRole("heading", { name: "Start with one role preview." }).scrollIntoViewIfNeeded();
    const pricing = page.locator("#pricing");
    await expect(pricing.getByText("Free first run")).toBeVisible();
    await expect(pricing.getByText("Try one role with targeted profile scans before you pay.")).toBeVisible();
    await expect(pricing.getByText("No candidate email lookup")).toHaveCount(0);
    await expect(pricing.getByText("email lookups per month")).toHaveCount(2);
    await expect(pricing.getByText("CSV export and client-ready briefs")).toHaveCount(2);

    await pricing.getByRole("button", { name: "Try for free" }).click();

    await expect(page).toHaveURL(/\/app\/search\/new\?.*entry=free_trial/);
    await expect(page.getByTestId("landing-auth-modal")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Start your free shortlist" })).toBeVisible();

    await page.goto("/");
    await page.getByRole("heading", { name: "Start with one role preview." }).scrollIntoViewIfNeeded();
    await page.locator("#pricing").getByRole("button", { name: "Start annual" }).click();

    await expect(page).toHaveURL(/\/app\/settings\?.*plan=starter_annual.*section=billing/);
    await expect(page.getByRole("heading", { name: "Sign in to Hirelix" })).toBeVisible();
  });

  test("public landing should not ask visitors to compare pricing plans", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start free" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start annual Pro" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start Solo" })).toHaveCount(0);
    await expect(page.getByTestId("landing-auth-modal")).toHaveCount(0);
  });

  test("section anchors should not leave a large blank gap below the fixed nav", async ({ page }) => {
    await page.getByRole("link", { name: "Features" }).click();
    await expect(page).toHaveURL(/#features$/);

    await expect
      .poll(async () => {
        const navBox = await page.locator("nav").boundingBox();
        const sectionBox = await page.locator("#features").boundingBox();
        const eyebrowBox = await page.locator("#features").getByText("Features", { exact: true }).boundingBox();

        if (!navBox || !sectionBox || !eyebrowBox) {
          return Number.POSITIVE_INFINITY;
        }

        return Math.max(sectionBox.y - navBox.height, eyebrowBox.y - navBox.height);
      })
      .toBeLessThanOrEqual(64);
  });

  test("nav sections should fill the viewport below the fixed nav", async ({ page }) => {
    await page.getByRole("link", { name: "How it works" }).click();
    await expect(page).toHaveURL(/#how-it-works$/);

    await expect
      .poll(async () => {
        const navBox = await page.locator("nav").boundingBox();
        const sectionBox = await page.locator("#how-it-works").boundingBox();
        const nextSectionBox = await page.locator("#features").boundingBox();

        if (!navBox || !sectionBox || !nextSectionBox) {
          return Number.NEGATIVE_INFINITY;
        }

        const viewportHeight = page.viewportSize()?.height ?? 0;
        const sectionBottom = sectionBox.y + sectionBox.height;
        return Math.min(sectionBottom - viewportHeight, nextSectionBox.y - viewportHeight);
      })
      .toBeGreaterThanOrEqual(0);
  });

  test("Home and logo links should reload the landing root", async ({ page }) => {
    await page.getByRole("link", { name: "Features" }).click();
    await expect(page).toHaveURL(/#features$/);

    await page.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL("/");

    await page.getByRole("link", { name: "Features" }).click();
    await expect(page).toHaveURL(/#features$/);

    await page.getByRole("link", { name: "Hirelix home" }).click();
    await expect(page).toHaveURL("/");
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
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
  });

  test("should keep mobile pricing focused on the first run", async ({ page }) => {
    await page.getByRole("heading", { name: "Start with one role preview." }).scrollIntoViewIfNeeded();
    const pricing = page.locator("#pricing");

    await expect(pricing.getByText("Free first run")).toBeVisible();
    await expect(pricing.getByText("150 targeted profile scans")).toBeVisible();
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
