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
    await expect(page.getByRole("heading", { name: /Turn a client JD into an evidence-backed technical shortlist/i })).toBeVisible();
    await expect(page.getByTestId("hero-primary-cta")).toHaveText(/Build shortlist/i);
    await expect(page.getByTestId("hero-sample-link")).toBeVisible();
    await expect(page.getByText("James Liu")).toBeVisible();
    await expect(page.getByText("Anika Nair")).toBeVisible();
    await expect(page.getByRole("heading", { name: "A shortlist a solo headhunter can act on" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Why solo headhunters stop reviewing every profile manually" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Try one client role before comparing plans." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The first questions before you paste a client role" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with the role already on your desk." })).toBeVisible();
    await expect(page.getByText("Paste the role, get ranked candidates")).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "What a solo headhunter reviews after a client JD." })).toBeVisible();
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

  test("beta access CTA should return focus to the JD form instead of opening pricing", async ({ page }) => {
    await page.getByRole("heading", { name: "Try one client role before comparing plans." }).scrollIntoViewIfNeeded();
    const betaAccess = page.locator("#beta-access");
    await expect(page.getByText("Invite-only beta")).toBeVisible();
    await expect(page.getByText("1 real shortlist preview included")).toBeVisible();
    await expect(page.getByText("Limited monthly beta seats")).toBeVisible();

    await betaAccess.getByRole("button", { name: "Build shortlist" }).click();

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

  test("should keep mobile beta access focused on the preview offer", async ({ page }) => {
    await page.getByRole("heading", { name: "Try one client role before comparing plans." }).scrollIntoViewIfNeeded();

    await expect(page.getByText("Invite-only beta")).toBeVisible();
    await expect(page.getByText("1 real shortlist preview included")).toBeVisible();
    await expect(page.getByText("Limited monthly beta seats")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free" })).toHaveCount(0);
  });
});

test.describe("Auth routes", () => {
  test("should expose better-auth session endpoint instead of a legacy callback bridge", async ({ request }) => {
    const response = await request.get("/api/auth/get-session");

    expect([200, 401]).toContain(response.status());
  });
});
