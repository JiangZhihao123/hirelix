import { test, expect } from "@playwright/test";
import { load } from "cheerio";
import { publicPages, SITE_URL } from "../src/lib/seo";
import { AGENT_PLAN } from "../src/lib/agent-plan";

test("all public URLs serve indexable English HTML with matching metadata and crawlable links", async ({
  request,
}) => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  const linkedPaths = new Set<string>();
  for (const { path } of publicPages) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const $ = load(await response.text());
    expect($("html").attr("lang"), path).toBe("en");
    expect($("h1").length, path).toBe(1);
    const title = $("title").text();
    const description = $('meta[name="description"]').attr("content")!;
    expect(title.length, path).toBeGreaterThan(10);
    expect(description.length, path).toBeGreaterThan(15);
    expect(titles.has(title), `duplicate title at ${path}`).toBe(false);
    expect(
      descriptions.has(description),
      `duplicate description at ${path}`,
    ).toBe(false);
    titles.add(title);
    descriptions.add(description);
    const canonical = `${SITE_URL}${path === "/" ? "" : path}`;
    expect($('link[rel="canonical"]').attr("href"), path).toBe(canonical);
    expect($('meta[property="og:url"]').attr("content"), path).toBe(canonical);
    expect($('meta[property="og:title"]').attr("content"), path).toBe(title);
    expect($('meta[name="twitter:title"]').attr("content"), path).toBe(title);
    expect($('meta[name="robots"]').attr("content") || "", path).not.toContain(
      "noindex",
    );
    expect(response.headers()["x-robots-tag"] || "", path).not.toContain(
      "noindex",
    );
    $('a[href^="/"]').each((_, link) => {
      linkedPaths.add($(link).attr("href")!.split(/[?#]/)[0]);
    });
    $('script[type="application/ld+json"]').each((_, script) => {
      expect(() => JSON.parse($(script).html()!), path).not.toThrow();
    });
  }
  for (const { path } of publicPages)
    expect(linkedPaths.has(path), `orphan page ${path}`).toBe(true);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = load(await sitemap.text(), { xmlMode: true });
  expect(
    xml("loc")
      .map((_, el) => xml(el).text())
      .get()
      .sort(),
  ).toEqual(
    publicPages
      .map(({ path }) => `${SITE_URL}${path === "/" ? "" : path}`)
      .sort(),
  );
});

test("FAQ structured data matches visible answers and prices come from the paid plan", async ({
  request,
}) => {
  const $ = load(await (await request.get("/")).text());
  const graph = JSON.parse(
    $('script[type="application/ld+json"]').first().html()!,
  )["@graph"];
  const faq = graph.find(
    (item: { "@type": string }) => item["@type"] === "FAQPage",
  );
  for (const question of faq.mainEntity) {
    const details = $("details").filter((_, item) =>
      $(item).find("summary").text().includes(question.name),
    );
    expect(details.length).toBe(1);
    expect(details.find("p").text()).toContain(question.acceptedAnswer.text);
  }
  const app = graph.find(
    (item: { "@type": string }) => item["@type"] === "SoftwareApplication",
  );
  expect(app.offers.map((offer: { price: number }) => offer.price)).toEqual([
    AGENT_PLAN.monthlyCents / 100,
    AGENT_PLAN.annualCents / 100,
  ]);
  const llms = await request.get("/llms.txt");
  expect(llms.headers()["content-type"]).toContain("text/plain");
  expect(await llms.text()).toContain(
    `USD ${AGENT_PLAN.monthlyCents / 100}/month`,
  );
  expect(await llms.text()).toContain("long-term AI assistant");
});

test("private routes, missing pages, crawler rules, and the www redirect have the right boundaries", async ({
  request,
}) => {
  const app = await request.get("/app");
  expect(app.headers()["x-robots-tag"]).toContain("noindex");
  expect(load(await app.text())('link[rel="canonical"]').length).toBe(0);
  const api = await request.get("/api/workspace/people");
  expect([401, 403]).toContain(api.status());
  expect(api.headers()["x-robots-tag"]).toContain("noindex");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /recommendation/");
  expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  expect(robots).not.toMatch(/User-agent: (OAI-SearchBot|PerplexityBot)/);
  expect((await request.get("/guides/not-a-guide")).status()).toBe(404);
  expect((await request.get("/search/new")).status()).toBe(404);
  const redirect = await request.get("/product?utm_source=qa", {
    headers: { host: "www.hirelix.online" },
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe(`${SITE_URL}/product?utm_source=qa`);
});

test("a reader can follow the assistant story to a guide, pricing, and the real sign-in", async ({
  page,
}) => {
  await page.goto("/product?utm_source=perplexity&utm_campaign=seo-qa");
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("hirelix.growth.attribution.v1"),
      ),
    )
    .not.toBeNull();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your work continues.",
  );
  await page.screenshot({ path: "output/seo-geo/product.png", fullPage: true });
  await page
    .getByRole("link", {
      name: "Revisit candidates without starting from scratch",
    })
    .click();
  await expect(page).toHaveURL(/\/guides\/candidate-rediscovery$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Candidate rediscovery",
  );
  await page.screenshot({ path: "output/seo-geo/guide.png", fullPage: true });
  await page
    .getByRole("link", { name: "Pricing and the free trial", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A personal assistant",
  );
  await page.screenshot({ path: "output/seo-geo/pricing.png", fullPage: true });
  await page
    .getByRole("link", { name: "Start free trial", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/plan=agent_monthly/);
  await expect(
    page.getByRole("button", { name: /Continue with Google/ }),
  ).toBeVisible();
  const attribution = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("hirelix.growth.attribution.v1") || "{}"),
  );
  expect(attribution.traffic_source).toBe("perplexity");
  expect(attribution.utm_campaign).toBe("seo-qa");
});
