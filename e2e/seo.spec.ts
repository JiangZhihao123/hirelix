import { test, expect } from "@playwright/test";
import { load } from "cheerio";
import { publicPages, SITE_URL } from "../src/lib/seo";
import { AGENT_PLAN } from "../src/lib/agent-plan";
import { recruitingGuides } from "../src/lib/recruiting-guides";

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
  for (const guide of recruitingGuides) {
    const node = xml("url").filter((_, element) =>
      xml(element).find("loc").text() === `${SITE_URL}/guides/${guide.slug}`,
    );
    expect(node.find("lastmod").text()).toBe(guide.updatedOn);
  }
});

test("guides have visible evidence guidance, real update dates and matching linked article entities", async ({ request }) => {
  const hub = await request.get("/guides");
  expect(hub.status()).toBe(200);
  const index = load(await hub.text());
  const collection = index('script[type="application/ld+json"]').toArray()
    .flatMap((element) => JSON.parse(index(element).html()!)["@graph"])
    .find((entity) => entity["@type"] === "CollectionPage");
  expect(collection.mainEntity.itemListElement).toHaveLength(recruitingGuides.length);
  for (const guide of recruitingGuides) {
    const path = `/guides/${guide.slug}`;
    expect(index(`main a[href="${path}"]`).length).toBeGreaterThan(0);
    const response = await request.get(path);
    const $ = load(await response.text());
    expect($("h1").text()).toBe(guide.title);
    expect($("time").attr("datetime")).toBe(guide.updatedOn);
    expect($("#key-points").length).toBe(1);
    expect($("#example-request").text()).toContain(guide.examplePrompt);
    expect($('a[href="/contact"]').length).toBeGreaterThan(0);
    const entities = $('script[type="application/ld+json"]').toArray()
      .flatMap((element) => JSON.parse($(element).html()!)["@graph"]);
    const article = entities.find((entity) => entity["@type"] === "Article");
    expect(article.headline).toBe(guide.title);
    expect(article.dateModified).toBe(guide.updatedOn);
    expect(entities.find((entity) => entity["@id"] === article.author["@id"]).name).toBe("Hirelix");
    const breadcrumbs = entities.find((entity) => entity["@type"] === "BreadcrumbList");
    expect(breadcrumbs.itemListElement.map((item: { item: string }) => item.item))
      .toEqual([SITE_URL, `${SITE_URL}/guides`, `${SITE_URL}${path}`]);
    for (const anchor of $('nav[aria-label="In this guide"] a').toArray()) {
      expect($($(anchor).attr("href")!).length).toBe(1);
    }
    for (const related of guide.relatedSlugs) {
      expect(related).not.toBe(guide.slug);
      expect(recruitingGuides.some((item) => item.slug === related)).toBe(true);
      expect($(`a[href="/guides/${related}"]`).length).toBeGreaterThan(0);
    }
  }
});

test("product and pricing expose the same truthful product identity and offers as the homepage", async ({ request }) => {
  for (const path of ["/", "/product", "/pricing"]) {
    const $ = load(await (await request.get(path)).text());
    const entities = $('script[type="application/ld+json"]').toArray()
      .flatMap((element) => JSON.parse($(element).html()!)["@graph"]);
    const app = entities.find((entity) => entity["@type"] === "SoftwareApplication");
    expect(app["@id"]).toBe(`${SITE_URL}/#application`);
    expect(app.offers.map((offer: { price: number }) => offer.price))
      .toEqual([AGENT_PLAN.monthlyCents / 100, AGENT_PLAN.annualCents / 100]);
    expect(entities.some((entity) => entity.aggregateRating || entity.review)).toBe(false);
    expect($('meta[name="robots"]').attr("content")).toContain("max-image-preview:large");
  }
});

test("search and AI crawler requests receive public content without special access", async ({ request }) => {
  for (const userAgent of ["Googlebot", "bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"]) {
    const response = await request.get("/guides/public-web-candidate-research", { headers: { "User-Agent": userAgent } });
    expect(response.status(), userAgent).toBe(200);
    const $ = load(await response.text());
    expect($("h1").text(), userAgent).toContain("Public-web candidate research");
    expect($('link[rel="canonical"]').attr("href")).toBe(`${SITE_URL}/guides/public-web-candidate-research`);
    expect(response.headers()["x-robots-tag"] || "").not.toContain("noindex");
  }
  const key = await request.get("/indexnow-key.txt");
  expect(key.status()).toBe(200);
  expect((await key.text()).trim()).toMatch(/^[a-zA-Z0-9-]{8,128}$/);
});

test("guides can be discovered, read and followed to pricing without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/product");
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Guides", exact: true }).click();
    await expect(page).toHaveURL(/\/guides$/);
    await page.getByRole("heading", { name: "How to compare candidates against a job description", exact: true }).getByRole("link").click();
    await expect(page).toHaveURL(/\/guides\/candidate-jd-comparison$/);
    await page.getByRole("link", { name: "A request you can adapt", exact: true }).click();
    await expect(page.locator("#example-request")).toBeInViewport();
    await page.getByRole("link", { name: "Pricing and the free trial", exact: true }).click();
    await expect(page).toHaveURL(/\/pricing$/);
  } finally {
    await context.close();
  }
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
  expect(await llms.text()).toContain("AI recruiting assistant");
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
    "Your business needs you.",
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
    "Your AI recruiting assistant.",
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

test("current product facts and practical feedback guide are crawlable without JavaScript", async ({ request }) => {
  const $ = load(await (await request.get("/")).text());
  expect($("#first-assignment").text()).toContain("Start with work that is taking up your time");
  expect($('a[href="/guides/candidate-feedback"]').length).toBeGreaterThan(0);
  expect($("details").text()).toContain("Gmail inbox reading is not currently available");
  const guide = await request.get("/guides/candidate-feedback");
  expect(guide.status()).toBe(200);
  const content = load(await guide.text());
  expect(content("h1").text()).toContain("Track client feedback");
  expect(content("article").text()).toContain("Coordinating six colleagues does not establish six direct reports");
  const llms = await (await request.get("/llms.txt")).text();
  expect(llms).toContain(`${SITE_URL}/guides/candidate-feedback`);
  expect(llms).toContain("Gmail inbox reading is not currently available");
  const auth = await request.get("/auth/retry");
  expect(auth.headers()["x-robots-tag"]).toContain("noindex");
});

for (const [referrer, source] of [
  ["https://www.google.co.uk/search?q=headhunter", "google_organic"],
  ["https://example.org/?next=https://google.com/", "referral"],
  ["https://reddit.com.example.org/", "referral"],
]) {
  test(`browser source attribution: ${referrer}`, async ({ page }) => {
    await page.goto("/product", { referer: referrer });
    await expect.poll(() => page.evaluate(() => {
      const stored = sessionStorage.getItem("hirelix.growth.attribution.v1");
      return stored ? JSON.parse(stored).traffic_source : null;
    })).toBe(source);
    await page.getByRole("link", { name: "Revisit candidates without starting from scratch" }).click();
    await expect(page).toHaveURL(/candidate-rediscovery$/);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("hirelix.growth.attribution.v1") || "{}").traffic_source)).toBe(source);
  });
}
