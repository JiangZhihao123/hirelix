import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { load } from "cheerio";
import { publicPages, SITE_URL } from "../../src/lib/seo";

async function main() {
  // IndexNow's verification token is intentionally public, not an account credential.
  // Submit only after the production sitemap and key match this checkout.
  const key = (await readFile(new URL("../../public/indexnow-key.txt", import.meta.url), "utf8")).trim();
  assert.match(key, /^[a-zA-Z0-9-]{8,128}$/);
  const keyLocation = `${SITE_URL}/indexnow-key.txt`;
  const expectedUrls = publicPages.map(({ path }) => `${SITE_URL}${path === "/" ? "" : path}`);
  const [keyResponse, sitemapResponse] = await Promise.all([
    fetch(keyLocation, { signal: AbortSignal.timeout(30_000) }),
    fetch(`${SITE_URL}/sitemap.xml`, { signal: AbortSignal.timeout(30_000) }),
  ]);
  assert.equal(keyResponse.status, 200, "The production verification file is unavailable");
  assert.equal((await keyResponse.text()).trim(), key, "The deployed verification token differs");
  assert.equal(sitemapResponse.status, 200, "The production sitemap is unavailable");
  const xml = load(await sitemapResponse.text(), { xmlMode: true });
  const deployedUrls = xml("url > loc").map((_, element) => xml(element).text()).get();
  assert.deepEqual([...deployedUrls].sort(), [...expectedUrls].sort(), "The production sitemap differs from this checkout");

  if (!process.argv.includes("--submit")) {
    console.log(JSON.stringify({ mode: "dry-run", host: new URL(SITE_URL).hostname, urlCount: expectedUrls.length, urls: expectedUrls }, null, 2));
  } else {
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: new URL(SITE_URL).hostname, key, keyLocation, urlList: expectedUrls }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    assert.ok([200, 202].includes(response.status), `IndexNow rejected submission: HTTP ${response.status} ${body}`);
    console.log(JSON.stringify({
      submittedAt: new Date().toISOString(),
      host: new URL(SITE_URL).hostname,
      status: response.status,
      urlCount: expectedUrls.length,
      interpretation: response.status === 202 ? "Received; key validation pending" : "Submission accepted",
      indexingGuaranteed: false,
      body,
    }, null, 2));
  }
}

void main();
