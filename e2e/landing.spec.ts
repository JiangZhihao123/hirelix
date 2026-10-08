import { test, expect } from "@playwright/test";

test.describe("Personal agent landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("explains the personal agent without advertising external sourcing", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your personal AI agent for headhunting.",
    );
    await expect(page.getByTestId("hero-primary-cta")).toBeEnabled();
    await expect(
      page.getByRole("heading", { name: /Ten years of relationships/ }),
    ).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(
      /profile scan|ranked shortlist|Start Starter|Start Pro|AI sourcing/i,
    );
    await expect(
      page.getByText("PRODUCT WALKTHROUGH · FICTIONAL EXAMPLE"),
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
      "Your personal AI agent for headhunting.",
    );
  });

  test("switches complete workflow examples with clicks and keyboard", async ({
    page,
  }) => {
    const roleTab = page.getByRole("tab", { name: /Keep a role moving/ });
    await roleTab.click();
    await expect(roleTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText(
      "Awaiting your review",
    );
    await roleTab.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: /Prepare client work/ }),
    ).toBeFocused();
    await expect(page.getByRole("tabpanel")).toContainText(
      "Client email · Draft",
    );
    await page.getByRole("tab", { name: /Prepare client work/ }).press("Home");
    await expect(page.getByRole("tabpanel")).toContainText(
      "Confirm her current interest",
    );
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
      page.getByRole("heading", { name: "Start with your private AI assistant" }),
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
      await page.getByRole("tab", { name: /Prepare client work/ }).click();
      await expect(page.getByRole("tabpanel")).toContainText(
        "Client email · Draft",
      );
      expect(
        await page
          .getByRole("tabpanel")
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
