import { test, expect } from "@playwright/test";
import { AGENT_PLAN } from "../src/lib/agent-plan";
import { firstAssignmentPrompt } from "../src/lib/landing-content";

test.describe("Personal agent landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("explains the first shortlist and continuing recruiting partnership", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "5 minutes to your first shortlist.100 jobs later, it still knows how you work.",
    );
    await expect(page.getByTestId("hero-primary-cta")).toBeEnabled();
    await expect(page.getByTestId("hero-primary-cta")).toHaveAccessibleName(
      "Find Your First Candidates",
    );
    await expect(
      page.getByRole("heading", { name: /The next conversation/ }),
    ).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(
      /profile scan|ranked shortlist|Start Starter|Start Pro|AI sourcing/i,
    );
    await expect(
      page.getByText("Illustrative story · Fictional people & client"),
    ).toBeVisible();
    await expect(page.locator('a[href*="search/new"]')).toHaveCount(0);
  });

  test("landing stays English when the product language is Chinese", async ({
    page,
  }) => {
    await page.evaluate(() =>
      localStorage.setItem("hirelix:ui-language", "zh"),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("hero-primary-cta")).toBeEnabled();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle(
      "Hirelix | Your Personal AI Agent for Headhunting",
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "5 minutes to your first shortlist.100 jobs later, it still knows how you work.",
    );
  });

  test("entry links keep their destination and campaign before JavaScript loads", async ({
    browser, baseURL,
  }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto("/?utm_source=landing-qa&utm_campaign=cold-entry&gclid=qa-click", {
        waitUntil: "domcontentloaded",
      });
      const entries = page.locator('a[href^="/app?"]');
      await expect(entries).toHaveCount(7);
      for (const href of await entries.evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")!),
      )) {
        const url = new URL(href, baseURL);
        expect(url.searchParams.get("utm_source")).toBe("landing-qa");
        expect(url.searchParams.get("utm_campaign")).toBe("cold-entry");
        expect(url.searchParams.get("gclid")).toBe("qa-click");
        const prompt = url.searchParams.get("prompt");
        expect([null, firstAssignmentPrompt]).toContain(prompt);
      }
      const exampleLink = new URL((await page.getByTestId("first-assignment-cta").getAttribute("href"))!, baseURL);
      expect(exampleLink.searchParams.get("prompt")).toBe(firstAssignmentPrompt);
      const plans = await page.locator('.ha-pricing-options a[href^="/app?"]').evaluateAll((links) =>
        links.map((link) => new URL(link.getAttribute("href")!, location.origin).searchParams.get("plan")),
      );
      expect(plans).toEqual(["agent_monthly", "agent_annual"]);
      await expect(page.getByTestId("hero-primary-cta")).toHaveRole("link");
      await page.getByTestId("hero-primary-cta").click();
      await expect(page).toHaveURL(/\/app\?/);
      const destination = new URL(page.url());
      expect(destination.searchParams.get("entry")).toBe("free_trial");
      expect(destination.searchParams.get("utm_campaign")).toBe("cold-entry");
      expect(destination.searchParams.get("prompt")).toBeNull();
    } finally {
      await context.close();
    }
  });

  test("reads the complete recommendation and selected resume without signing in", async ({
    page,
  }) => {
    const summary = page.getByText("Read the complete example", {
      exact: true,
    });
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Evidence and limits" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Questions for the next conversation",
      }),
    ).toBeVisible();
    await page
      .getByText("Selected resume · Mira Chen", { exact: true })
      .click();
    await expect(
      page.getByText("FICTIONAL SAMPLE RESUME", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("This public example does not collect or send feedback."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Professional experience",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("2020–present · B2B workflow software", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Why revisit Mira now", exact: true }),
    ).toBeVisible();
    await summary.click();
    await expect(
      page.getByRole("heading", { name: "Evidence and limits" }),
    ).not.toBeVisible();
  });

  test("keeps trial terms clear and expands detailed billing rules", async ({
    page,
  }) => {
    await expect(page.locator(".ha-hero-copy .ha-hero-caption")).toContainText(
      `${AGENT_PLAN.trialDays} days · ${AGENT_PLAN.trialCredits} AI credits · No card required`,
    );
    await expect(page.locator(".ha-pricing-summary")).toContainText(
      "Paid subscriptions renew until canceled",
    );
    const rules = page.locator(".ha-pricing-details");
    await expect(rules).not.toHaveAttribute("open", "");
    await rules.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(
      rules.getByRole("heading", { name: "Monthly allowances" }),
    ).toBeVisible();
    await expect(
      rules.getByRole("link", { name: "refund policy" }),
    ).toHaveAttribute("href", "/refund-policy");
    await rules.locator("summary").press("Enter");
    await expect(rules).not.toHaveAttribute("open", "");
  });

  test("loads the film only on request and supports playback and seeking", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const video = page.locator("video");
    await expect(video).toHaveAttribute("preload", "none");
    expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(
      true,
    );
    expect(
      await video.evaluate((node: HTMLVideoElement) => node.networkState),
    ).toBe(1);
    await page
      .getByRole("button", { name: "Watch the 35-second story", exact: true })
      .click();
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime), { timeout: 15000 })
      .toBeGreaterThan(0);
    expect(await video.evaluate((node: HTMLVideoElement) => node.muted)).toBe(
      false,
    );
    await expect(video).toHaveAttribute("controls", "");
    expect(
      await video.evaluate((node: HTMLVideoElement) => node.duration),
    ).toBeCloseTo(35.0, 1);
    await video.evaluate((node: HTMLVideoElement) => {
      node.pause();
      node.currentTime = 21;
    });
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState), { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);
    expect(
      await video.evaluate((node: HTMLVideoElement) => node.currentTime),
    ).toBeCloseTo(21, 1);
    await video.evaluate((node: HTMLVideoElement) => {
      node.currentTime = 34.7;
      void node.play();
    });
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.ended), { timeout: 15000 })
      .toBe(true);
    await page
      .getByRole("button", { name: "Watch the 35-second story", exact: true })
      .click();
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
      .toBeLessThan(5);
  });

  test("FAQ opens and closes with the real privacy link", async ({ page }) => {
    const question = page
      .locator("summary")
      .filter({ hasText: "Can I export or delete candidate information?" });
    await question.click();
    const details = page.locator("details").filter({ has: question });
    await expect(details).toHaveAttribute("open", "");
    await expect(
      details.getByRole("link", { name: /Privacy Policy/ }),
    ).toHaveAttribute("href", "/privacy");
    await question.click();
    await expect(details).not.toHaveAttribute("open", "");
  });

  test("primary entry reaches assistant sign-in and preserves campaign attribution", async ({
    page,
  }) => {
    await page.goto("/?utm_source=landing-qa&utm_campaign=personal-agent", {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("hero-primary-cta").click();
    await expect(page).toHaveURL(/\/app\?/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/app");
    expect(url.searchParams.get("utm_source")).toBe("landing-qa");
    expect(url.searchParams.get("utm_campaign")).toBe("personal-agent");
    expect(url.searchParams.get("entry")).toBe("free_trial");
    expect(url.searchParams.get("prompt")).toBeNull();
    await expect(
      page.getByRole("heading", {
        name: "Start with your private AI assistant",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Continue with Google/ }),
    ).toBeVisible();
  });

  test("fits small screens and keeps navigation and demo usable", async ({
    page,
  }) => {
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByTestId("nav-primary-cta")).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(page.locator(".ha-film-player")).toBeVisible();
      expect(
        await page
          .locator(".ha-film-player")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBeTruthy();
      await page
        .getByRole("link", { name: "Hirelix home", exact: true })
        .first()
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    }
  });
});
