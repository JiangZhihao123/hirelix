import { test, expect } from "@playwright/test";

test.describe("Personal agent landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("explains the personal agent without advertising external sourcing", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your Personal Agent.Built for headhunters.",
    );
    await expect(page.getByTestId("hero-primary-cta")).toBeEnabled();
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
      "Your Personal Agent.Built for headhunters.",
    );
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
      page.getByText("FICTIONAL RESUME EXCERPT", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("This public example does not collect or send feedback."),
    ).toBeVisible();
    await summary.click();
    await expect(
      page.getByRole("heading", { name: "Evidence and limits" }),
    ).not.toBeVisible();
  });

  test("loads the film only on request and supports playback and seeking", async ({
    page,
  }) => {
    const video = page.locator("video");
    await expect(video).toHaveAttribute("preload", "none");
    expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(
      true,
    );
    expect(
      await video.evaluate((node: HTMLVideoElement) => node.networkState),
    ).toBe(1);
    await page
      .getByRole("button", { name: "Watch the 31-second story", exact: true })
      .click();
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
      .toBeGreaterThan(0);
    expect(await video.evaluate((node: HTMLVideoElement) => node.muted)).toBe(
      false,
    );
    await expect(video).toHaveAttribute("controls", "");
    expect(
      await video.evaluate((node: HTMLVideoElement) => node.duration),
    ).toBeCloseTo(31.2, 1);
    await video.evaluate((node: HTMLVideoElement) => {
      node.pause();
      node.currentTime = 21;
    });
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState))
      .toBeGreaterThanOrEqual(2);
    expect(
      await video.evaluate((node: HTMLVideoElement) => node.currentTime),
    ).toBeCloseTo(21, 1);
    await video.evaluate((node: HTMLVideoElement) => {
      node.currentTime = 30.9;
      return node.play();
    });
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.ended))
      .toBe(true);
    await page
      .getByRole("button", { name: "Watch the 31-second story", exact: true })
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
