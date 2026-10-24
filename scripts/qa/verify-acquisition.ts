/** Local real Chrome + PostgreSQL + auth/collector/admin HTTP. Never sends email. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { createAdminSession, revokeAdminSession, adminCookieName } from "../../src/lib/admin-auth";
import { ATTRIBUTION_COOKIE, readAcquisitionCookie, resolveAcquisition } from "../../src/lib/growth-attribution";
import { recordAcquisitionSignup } from "../../src/lib/growth-signup";

async function main() {
  const database = new URL(process.env.DATABASE_URL!);
  const base = process.env.ANALYTICS_TEST_URL || "http://localhost:3100";
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && /qa|test/.test(database.pathname), "Isolated local QA database required");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  const run = randomUUID().slice(0, 8), source = `qa_acquisition_${run}`, campaign = `qa_campaign_${run}`;
  const users: string[] = [], emails: string[] = [], browsers: string[] = [];
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let token: string | undefined;
  try {
    token = await createAdminSession();
    const read = async (extra: Record<string,string> = {}) => {
      const params = new URLSearchParams({ internal: "1", source, campaign, ...extra });
      const response = await fetch(`${base}/api/ops/analytics?${params}`, { headers: { Cookie: `${adminCookieName()}=${token}` } });
      assert.equal(response.status, 200);
      return response.json();
    };
    const context = await browser.newContext();
    const page = await context.newPage();
    async function touch(page: Page) {
      await expect.poll(() => page.evaluate(() => window.__hirelixGrowthIdentity?.visitor_id), { timeout: 30000 }).toBeTruthy();
      const id = await page.evaluate(() => window.__hirelixGrowthIdentity!.visitor_id);
      if (!browsers.includes(id)) browsers.push(id);
      const cookies = await page.context().cookies(base);
      const acquisition = cookies.find(item => item.name === ATTRIBUTION_COOKIE);
      assert.ok(acquisition);
      return readAcquisitionCookie(`${ATTRIBUTION_COOKIE}=${acquisition.value}`)!;
    }
    async function signIn(page: Page, email?: string) {
      email ||= `${run}-${emails.length}@acquisition-test.invalid`;
      if (!emails.includes(email)) emails.push(email);
      const otp = "735194";
      await db.execute(sql`INSERT INTO verification(id,identifier,value,"expiresAt") VALUES(${randomUUID()},${"sign-in-otp-" + email},${otp + ":0"},now()+interval '5 minutes')`);
      const response = await page.request.post(base + "/api/auth/sign-in/email-otp", { headers: { Origin: base }, data: { email, otp, name: "Acquisition QA" } });
      assert.equal(response.status(), 200, "Real better-auth OTP verification and signup must succeed");
      const result = await response.json();
      assert.ok(result.user?.id);
      if (!users.includes(result.user.id)) users.push(result.user.id);
      return result.user.id as string;
    }
    await page.goto(`${base}/?utm_source=${source}&utm_medium=qa&utm_campaign=${campaign}&utm_content=qa_alpha&private_prompt=never-collect`, { waitUntil: "domcontentloaded" });
    const first = await touch(page);
    await expect.poll(async () => (await read()).traffic.page_views, { timeout: 30000 }).toBe(1);
    await page.getByRole("link", { name: "How recommendations work", exact: true }).click();
    await expect.poll(async () => (await read()).traffic.page_views, { timeout: 30000 }).toBe(2);
    await page.evaluate(url => window.location.assign(url), `${base}/product?utm_source=qa_internal_poison&utm_content=qa_poison`);
    await page.waitForURL("**/product?**");
    assert.equal((await touch(page)).latest.utm_content, "qa_alpha");
    await page.reload();
    assert.deepEqual((await touch(page)).first, first.first);
    assert.equal((await touch(page)).latest.traffic_source, source);
    const firstUser = await signIn(page);
    await page.reload();
    await expect.poll(async () => (await read()).campaigns.find((row: Record<string,unknown>) => row.content === "qa_alpha")?.registrations, { timeout: 30000 }).toBe(1);
    await signIn(page, emails[0]);
    assert.equal((await read()).campaigns[0].registrations, 1, "Repeat login is not registration");
    // Client claims never become a server-verified signup, even when signed in.
    const identity = await page.evaluate(() => window.__hirelixGrowthIdentity!);
    const forgedId = randomUUID();
    const forged = await page.request.post(base + "/api/growth/landing-event", { data: {
      event_type: "signup_success", event_id: forgedId, ...identity, page_url: base + "/product?email=never-collect",
      metadata: { telemetry_version: 2, page_id: randomUUID(), registration_verified: true, user_id: randomUUID(), internal: false, traffic_source: source, utm_campaign: campaign, utm_content: "qa_alpha" },
    } });
    assert.equal(forged.status(), 200);
    const forgedRow = await db.execute(sql`SELECT metadata FROM hirelix_growth_landing_events WHERE id=${forgedId}::uuid`);
    assert.equal((forgedRow[0].metadata as Record<string,unknown>).registration_verified, undefined);
    assert.equal((await read()).campaigns[0].registrations, 1);
    const tab = await context.newPage();
    await tab.goto(base + "/product");
    const directReturn = await touch(tab);
    assert.equal(directReturn.latest.utm_content, "qa_alpha", "Direct return/new tab keeps recent non-direct attribution");
    assert.notEqual(directReturn.session_id, first.session_id);
    await tab.request.post(base + "/api/auth/sign-out", { headers: { Origin: base }, data: {} });
    await tab.goto(`${base}/?utm_source=${source}&utm_medium=qa&utm_campaign=${campaign}&utm_content=qa_beta`, { referer: "https://external.example/" });
    const second = await touch(tab);
    assert.equal(second.first.utm_content, "qa_alpha");
    assert.equal(second.latest.utm_content, "qa_beta");
    await signIn(tab);
    const latest = await read(), firstModel = await read({ attribution: "first" });
    assert.equal(latest.campaigns.find((row: Record<string,unknown>) => row.content === "qa_alpha").registrations, 1);
    assert.equal(latest.campaigns.find((row: Record<string,unknown>) => row.content === "qa_beta").registrations, 1);
    assert.equal(firstModel.campaigns.find((row: Record<string,unknown>) => row.content === "qa_alpha").registrations, 2);
    assert.equal((await read({ content: "qa_beta" })).campaigns.length, 1);
    assert.equal((await read({ campaign: "qa_absent" })).campaigns.length, 0);
    assert.equal((await read({ internal: "0" })).traffic.page_views, 0);
    assert.equal((await read({ internal: "0" })).campaigns.length, 0);
    const directContext = await browser.newContext(), directPage = await directContext.newPage();
    await directPage.goto(base + "/product");
    assert.equal((await touch(directPage)).latest.traffic_source, "direct");
    await signIn(directPage);
    const direct = await read({ source: "direct", campaign: "all" });
    assert.equal(direct.campaigns.find((row: Record<string,unknown>) => row.source === "direct").registrations, 1);
    const stored = await db.execute(sql`SELECT page_url,referrer,email_id,recipient,company,metadata FROM hirelix_growth_landing_events
      WHERE visitor_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(browsers)}::jsonb))`);
    for (const event of stored) {
      assert.ok(!String(event.page_url).includes("?"));
      assert.equal(event.email_id, null); assert.equal(event.recipient, null); assert.equal(event.company, null);
    }
    assert.ok(!JSON.stringify(stored).includes("never-collect"));
    assert.ok(!JSON.stringify(stored).includes("@acquisition-test.invalid"));
    // Aggregate outcome fixtures only: these do not execute an Agent or payment.
    const fixtureUser = randomUUID(), fixtureBrowser = randomUUID(), conversation = randomUUID();
    users.push(fixtureUser); browsers.push(fixtureBrowser);
    const createdAt = new Date(Date.now() - 2 * 86400000);
    await db.execute(sql`INSERT INTO "user"(id,email,name,"createdAt") VALUES(${fixtureUser},${fixtureUser + "@acquisition-test.invalid"},'Outcome fixture',${createdAt.toISOString()}::timestamptz)`);
    const fixtureState = resolveAcquisition(null, { traffic_source: source, utm_campaign: campaign, utm_content: "qa_outcome_fixture" }, true, +createdAt - 1000);
    const fixtureCookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify({ ...fixtureState, visitor_id: fixtureBrowser, session_id: randomUUID() }))}`;
    await recordAcquisitionSignup({ id: fixtureUser, createdAt }, new Headers({ Cookie: fixtureCookie }));
    await db.execute(sql`INSERT INTO hirelix_private_jobs(user_id,kind,status,request_key,created_at,updated_at) VALUES(${fixtureUser}::uuid,'assessment','done',${"qa_" + run},${createdAt.toISOString()}::timestamptz,now())`);
    await db.execute(sql`INSERT INTO hirelix_private_conversations(id,user_id,created_at) VALUES(${conversation}::uuid,${fixtureUser}::uuid,${createdAt.toISOString()}::timestamptz)`);
    await db.execute(sql`INSERT INTO hirelix_agent_messages(user_id,conversation_id,role,content) VALUES(${fixtureUser}::uuid,${conversation}::uuid,'user','Synthetic aggregate fixture')`);
    await db.execute(sql`INSERT INTO hirelix_billing_events(event_id,event_type,user_id,payload) VALUES(${"qa_" + run},'transaction.completed',${fixtureUser}::uuid,'{}'::jsonb)`);
    const outcomes = (await read({ content: "qa_outcome_fixture" })).campaigns[0];
    assert.equal(outcomes.registrations, 1); assert.equal(outcomes.task_accounts, 1); assert.equal(outcomes.returned_accounts, 1); assert.equal(outcomes.transaction_accounts, 1);
    // Read the concrete protected UI with the same filter controls operators use.
    const adminContext = await browser.newContext();
    await adminContext.addCookies([{ name: adminCookieName(), value: token, url: base, httpOnly: true, sameSite: "Strict" }]);
    const admin = await adminContext.newPage();
    await admin.goto(base + "/admin");
    await admin.getByRole("heading", { name: "网站流量与产品使用", exact: true }).waitFor();
    await admin.getByLabel("包含内部 / 本地测试", { exact: true }).check();
    await admin.getByLabel("来源", { exact: true }).fill(source);
    await admin.getByLabel("活动 campaign", { exact: true }).fill(campaign);
    await admin.getByLabel("内容 content", { exact: true }).fill("qa_beta");
    await admin.getByRole("button", { name: "应用筛选", exact: true }).click();
    await expect(admin.getByRole("button", { name: "刷新", exact: true })).toBeEnabled({ timeout: 30000 });
    await admin.getByRole("button", { name: "来源与页面", exact: true }).click();
    await expect(admin.getByRole("cell", { name: "qa_beta", exact: true })).toBeVisible();
    await expect(admin.getByRole("columnheader", { name: "新注册账号", exact: true })).toBeVisible();
    await mkdir("output/acquisition", { recursive: true });
    await admin.screenshot({ path: "output/acquisition/campaign-report.png", fullPage: true });
    await writeFile("output/acquisition/evidence.json", JSON.stringify({ environment: "local isolated QA", database: database.pathname.slice(1), source, campaign, latest: latest.campaigns, first: firstModel.campaigns, direct: direct.campaigns, outcomeFixtures: outcomes, firstUserRegistered: Boolean(firstUser), productionTested: false }, null, 2));
    console.log("PASS local real Chrome + DB + HTTP: landing, routing, internal UTM, refresh, new tab/direct return, first/latest models, real OTP account creation, repeat login, forged-signup rejection, no-UTM signup, internal exclusion, campaign/content filters, privacy and protected dashboard.");
    console.log("PASS aggregate fixtures only: completed business job, >=24h return message and transaction.completed callback. No Agent, email delivery, Google OAuth or real payment executed.");
  } finally {
    await browser.close();
    if (token) await revokeAdminSession(token);
    for (const id of users) {
      await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${id}::uuid`);
      await db.execute(sql`DELETE FROM hirelix_agent_messages WHERE user_id=${id}::uuid`);
      await db.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id=${id}::uuid`);
      await db.execute(sql`DELETE FROM hirelix_billing_events WHERE user_id=${id}::uuid`);
      await db.execute(sql`DELETE FROM "user" WHERE id=${id}`);
    }
    for (const email of emails) await db.execute(sql`DELETE FROM verification WHERE identifier=${"sign-in-otp-" + email}`);
    await db.execute(sql`DELETE FROM hirelix_growth_landing_events WHERE visitor_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(browsers)}::jsonb))`);
    await closeDb();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Acquisition verification failed"); process.exitCode = 1; });
