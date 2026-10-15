import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import { listPeople, peopleFilters } from "../src/lib/workspace/people";
import { listRolesPage } from "../src/lib/workspace/roles";
import { roleListOptions } from "../src/lib/workspace/list-options";

test(
  "real PostgreSQL list search, filters, full-dataset sorting, pagination and owner isolation",
  { skip: process.env.WORKSPACE_LIST_INTEGRATION !== "true" },
  async () => {
    const url = new URL(process.env.DATABASE_URL || "");
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.pathname.startsWith("/hirelix_workspace_qa_"),
    );
    const owner = randomUUID(),
      other = randomUUID();
    try {
      await db.execute(
        sql`INSERT INTO hirelix_agent_people(user_id,name,location,skills,updated_at) SELECT ${owner}::uuid,'Person '||lpad(i::text,3,'0'),'New York',ARRAY['TypeScript'],now()-i*interval '1 minute' FROM generate_series(1,55) i`,
      );
      await db.execute(
        sql`INSERT INTO hirelix_agent_people(user_id,name,location,skills) VALUES(${other}::uuid,'Private outsider','London',ARRAY['Secret skill'])`,
      );
      const [person] = await db.execute(
        sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid AND name='Person 055'`,
      );
      await db.execute(
        sql`INSERT INTO hirelix_private_records(user_id,person_id,kind,title,occurred_at) VALUES(${owner}::uuid,${person.id}::uuid,'call','Call',now())`,
      );
      const first = await listPeople(
        owner,
        "",
        1,
        "york",
        "script",
        "name",
        "desc",
      );
      assert.equal(first.total, 55);
      assert.equal(first.people.length, 50);
      assert.equal(first.people[0].name, "Person 055");
      const second = await listPeople(
        owner,
        "",
        2,
        "york",
        "script",
        "name",
        "desc",
      );
      assert.deepEqual(
        second.people.map((p) => p.name),
        ["Person 005", "Person 004", "Person 003", "Person 002", "Person 001"],
      );
      assert.equal((await listPeople(owner, "055", 1)).total, 1);
      assert.equal(
        (await listPeople(owner, "%", 1)).total,
        0,
        "wildcards are literal search text",
      );
      for (const direction of ["asc", "desc"])
        assert.equal(
          (await listPeople(owner, "", 1, "", "", "contact", direction))
            .people[0].name,
          "Person 055",
        );
      assert.deepEqual(await peopleFilters(owner), {
        locations: ["New York"],
        skills: ["TypeScript"],
      });
      await db.execute(
        sql`INSERT INTO hirelix_private_roles(user_id,title,client_name,jd_text,status) SELECT ${owner}::uuid,'Role '||lpad(i::text,3,'0'),'Client','JD',CASE WHEN i=55 THEN 'paused' ELSE 'active' END FROM generate_series(1,55) i`,
      );
      await db.execute(
        sql`INSERT INTO hirelix_private_roles(user_id,title,client_name,jd_text) VALUES(${other}::uuid,'Private role','Client','JD')`,
      );
      const roles = await listRolesPage(
        owner,
        roleListOptions.parse({ sort: "title", direction: "desc", page: 2 }),
      );
      assert.equal(roles.total, 55);
      assert.deepEqual(
        roles.roles.map((r) => r.title),
        ["Role 005", "Role 004", "Role 003", "Role 002", "Role 001"],
      );
      const paused = await listRolesPage(
        owner,
        roleListOptions.parse({ status: "paused", q: "client" }),
      );
      assert.equal(paused.total, 1);
      assert.equal(paused.roles[0].title, "Role 055");
      assert.equal(
        (
          await listRolesPage(
            owner,
            roleListOptions.parse({ status: "active", q: "055" }),
          )
        ).total,
        0,
      );
    } finally {
      await db.execute(
        sql`DELETE FROM hirelix_private_records WHERE user_id IN (${owner}::uuid,${other}::uuid)`,
      );
      await db.execute(
        sql`DELETE FROM hirelix_private_roles WHERE user_id IN (${owner}::uuid,${other}::uuid)`,
      );
      await db.execute(
        sql`DELETE FROM hirelix_agent_people WHERE user_id IN (${owner}::uuid,${other}::uuid)`,
      );
      await closeDb();
    }
  },
);
