/** Local real PostgreSQL, HTTP and Chrome verification. No outbound email. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import {
  createAdminSession,
  revokeAdminSession,
  adminCookieName,
} from "../../src/lib/admin-auth";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname.startsWith("/hirelix_workspace_qa_"),
  );
  const base = "http://localhost:3000",
    user = randomUUID(),
    id = randomUUID();
  let token: string | undefined;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await db.execute(
      sql`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(${user},'Feedback QA',${user + "@example.test"},true,now(),now())`,
    );
    const png = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#136348" },
    })
      .png()
      .toBuffer();
    await db.execute(
      sql`INSERT INTO hirelix_product_feedback(id,user_id,request_key,email,category,message,page_path,app_version,screenshot,notification_status) VALUES(${id}::uuid,${user},${randomUUID()}::uuid,${user + "@example.test"},'other','Fictional admin separation QA','/app','qa',decode(${png.toString("base64")},'base64'),'sent')`,
    );
    token = await createAdminSession();
    const cookie = adminCookieName() + "=" + token;
    for (const path of [
      "/api/admin/feedback",
      "/api/admin/feedback/" + id + "/screenshot",
    ])
      assert.equal((await fetch(base + path)).status, 401);
    assert.equal(
      (await fetch(base + "/api/workspace/feedback?access=1")).status,
      405,
    );
    assert.equal((await fetch(base + "/app/feedback")).status, 404);
    const request = (method: string, origin = base) =>
      fetch(base + "/api/admin/feedback", {
        method,
        headers: {
          Cookie: cookie,
          Origin: origin,
          "Content-Type": "application/json",
        },
        ...(method === "PATCH"
          ? { body: JSON.stringify({ id, status: "in_progress" }) }
          : {}),
      });
    assert.equal((await request("GET")).status, 200);
    assert.equal(
      (await request("PATCH", "https://invalid.example")).status,
      403,
    );
    assert.equal((await request("PATCH")).status, 200);
    const image = await fetch(
      base + "/api/admin/feedback/" + id + "/screenshot",
      { headers: { Cookie: cookie } },
    );
    assert.equal(image.status, 200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: adminCookieName(),
        value: token,
        url: base,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    const page = await context.newPage();
    await page.goto(base + "/admin/feedback?report=" + id);
    await page.getByRole("heading", { name: "用户反馈" }).waitFor();
    assert.equal(
      await page.getByText("Candidates & CVs", { exact: true }).count(),
      0,
    );
    await page.getByRole("combobox").selectOption("replied");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.waitForTimeout(700);
    await page.reload();
    assert.equal(await page.getByRole("combobox").inputValue(), "replied");
    const state = await db.execute(
      sql`SELECT status FROM hirelix_product_feedback WHERE id=${id}::uuid`,
    );
    assert.equal(state[0].status, "replied");
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await page.getByRole("heading", { name: "用户反馈" }).waitFor();
    await page.screenshot({
      path: "/tmp/hirelix-admin-feedback.png",
      fullPage: true,
    });
    await revokeAdminSession(token);
    assert.equal((await request("GET")).status, 401);
    await page.reload();
    assert.equal(new URL(page.url()).pathname, "/admin");
    console.log(
      "PASS: real DB + HTTP + Chrome: independent admin session, product route removal, screenshot bytes, CSRF rejection, status save/reload, revoked-session denial",
    );
  } finally {
    await revokeAdminSession(token);
    await db.execute(sql`DELETE FROM "user" WHERE id=${user}`);
    await browser.close();
    await closeDb();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
