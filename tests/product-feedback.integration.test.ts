import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import {
  saveFeedback,
  listFeedback,
  updateFeedback,
} from "../src/lib/product-feedback";
import { createAdminSession, revokeAdminSession } from "../src/lib/admin-auth";
import { hashAdminPassword } from "../src/lib/admin-password";
test(
  "real PG feedback: atomic deduplication, limits, screenshot validation and admin isolation",
  { skip: process.env.FEEDBACK_INTEGRATION !== "true" },
  async () => {
    const url = new URL(process.env.DATABASE_URL!);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.pathname.startsWith("/hirelix_workspace_qa_"),
    );
    const owner = {
      id: randomUUID(),
      email: `feedback-${randomUUID()}@example.test`,
    };
    const admin = {
      id: randomUUID(),
      email: `admin-${randomUUID()}@example.test`,
    };
    const previous = {
      username: process.env.ADMIN_USERNAME,
      hash: process.env.ADMIN_PASSWORD_HASH,
    };
    process.env.ADMIN_USERNAME = "feedback-qa";
    process.env.ADMIN_PASSWORD_HASH = await hashAdminPassword(
      "feedback-qa-password",
    );
    let token: string | undefined;
    try {
      for (const user of [owner, admin])
        await db.execute(
          sql`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(${user.id},'Feedback QA',${user.email},true,now(),now())`,
        );
      token = await createAdminSession();
      const input = {
        request_key: randomUUID(),
        message: "Fictional feedback privacy test",
        category: "problem",
        page_path: "/app",
      };
      const results = await Promise.all(
        Array.from({ length: 5 }, () => saveFeedback(owner, input)),
      );
      assert.equal(new Set(results.map((x) => x.id)).size, 1);
      await assert.rejects(
        saveFeedback(owner, { ...input, message: "Changed content" }),
        /different feedback/,
      );
      await assert.rejects(listFeedback(undefined), /Not authorized/);
      await assert.rejects(
        updateFeedback(undefined, { id: results[0].id, status: "replied" }),
        /Not authorized/,
      );
      const list = await listFeedback(token, null, results[0].id);
      assert.equal(list.length, 1);
      assert.equal(list[0].notification_status, "pending");
      await updateFeedback(token, { id: results[0].id, status: "in_progress" });
      assert.equal(
        (await listFeedback(token, null, results[0].id))[0].status,
        "in_progress",
      );
      await assert.rejects(
        saveFeedback(
          owner,
          { ...input, request_key: randomUUID() },
          new File(["not an image"], "bad.png", { type: "image/png" }),
        ),
        /could not be opened/,
      );
      await assert.rejects(
        saveFeedback(
          owner,
          { ...input, request_key: randomUUID() },
          new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" }),
        ),
        /Choose a PNG/,
      );
      for (let i = 0; i < 9; i++)
        await saveFeedback(owner, { ...input, request_key: randomUUID() });
      await assert.rejects(
        saveFeedback(owner, { ...input, request_key: randomUUID() }),
        /10 reports/,
      );
      assert.equal(
        (await saveFeedback(owner, input)).id,
        results[0].id,
        "retry remains safe after rate limit",
      );
      await db.execute(
        sql`INSERT INTO hirelix_product_feedback(user_id,request_key,email,category,message,page_path,app_version,created_at) SELECT ${admin.id},gen_random_uuid(),${admin.email},'other','Pagination fixture '||i,'/app','test',now() FROM generate_series(1,55) i`,
      );
      const first = await listFeedback(token);
      const second = await listFeedback(token, first.at(-1)!.id);
      const fixtureIds = [...first, ...second]
        .filter((item) => item.message.startsWith("Pagination fixture "))
        .map((item) => item.id);
      assert.equal(
        fixtureIds.length,
        55,
        "equal timestamps do not hide reports across pages",
      );
      assert.equal(new Set(fixtureIds).size, 55);
    } finally {
      for (const user of [owner, admin])
        await db.execute(sql`DELETE FROM "user" WHERE id=${user.id}`);
      await revokeAdminSession(token);
      if (previous.username === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = previous.username;
      if (previous.hash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
      else process.env.ADMIN_PASSWORD_HASH = previous.hash;
      await closeDb();
    }
  },
);
