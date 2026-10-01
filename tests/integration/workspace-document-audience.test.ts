import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { createPerson } from "../../src/lib/workspace/people";
import { createRole, linkPerson } from "../../src/lib/workspace/roles";
import { generateDeliverable, markSubmitted, prepareDeliverable } from "../../src/lib/workspace/deliverables";
import { applyRevision, generateRevision, requestRevision } from "../../src/lib/workspace/revisions";
import { enqueue, json, owned, WorkspaceError } from "../../src/lib/workspace/database";
import { assessCandidate } from "../../src/lib/workspace/assessment";
import type { Deliverable } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["127.0.0.1", "localhost"].includes(database.hostname) ||
    !database.pathname.startsWith("/hirelix_workspace_qa_") ||
    process.env.WORKSPACE_REAL_AI_TEST !== "true")
  throw new Error("Use an isolated local QA database and real AI");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("real AI respects internal purpose, preserves it on revision, and defaults to a client email", { timeout: 360000 }, async () => {
  const role = await createRole(owner, {
    title: "VP Product", client_name: "QA Lakeside",
    jd_text: "Enterprise SaaS product leader in London, leading at least ten product managers, two office days per week, GBP 165k–180k budget.",
    brief: {
      priorities: ["At least ten product managers led", "Enterprise SaaS", "London-based / able to work in the office two days a week", "Client-confirmed GBP 165k–180k budget"],
      flexible: [],
      unknowns: ["Whether the two-days-in-office requirement is negotiable", "Whether the budget is base salary or total package"],
    },
  });
  const person = await createPerson(owner, {
    name: "QA Morgan Reed", location: "London",
    headline: "Led twelve product managers at Atlas Software, 2021–2025, enterprise B2B SaaS",
    profile: { summary: "Compensation expectations, availability, interest, office willingness and sharing permission are unconfirmed." },
  });
  await linkPerson(owner, role.id, person.id);
  const assessmentJob = await enqueue(owner, "assessment", randomUUID(), { role_id: role.id, person_id: person.id });
  const assessment = await assessCandidate(assessmentJob, async () => {});
  const assessmentResult = assessment.result.assessment as {
    summary: string; gaps: Array<{ text: string }>; unconfirmed: string[];
  };
  assert.doesNotMatch(assessmentResult.summary, /(?:three|3)\s+(?:of\s+(?:the\s+)?(?:four|4)|(?:out\s+of\s+)?(?:four|4))[^.]{0,100}(?:met|match)|(?:met|match)[^.]{0,100}(?:three|3)\s+of\s+(?:the\s+)?(?:four|4)/i);
  assert.match(assessmentResult.gaps.map((gap) => gap.text).join("\n"), /office/i);
  assert.match(assessmentResult.unconfirmed.join("\n"), /office/i);
  await db.transaction(async (tx) => assessment.apply?.(tx));
  async function draft(kind: "submission" | "search_update", instructions: string) {
    const job = await prepareDeliverable(owner, {
      kind, role_id: role.id, person_ids: [person.id], record_ids: [], file_ids: [],
      period_start: null, period_end: null,
      language: "en", instructions, request_key: randomUUID(),
      ...(kind === "search_update" ? {
        period_start: "2026-10-01T00:00:00Z", period_end: "2026-10-01T23:59:59Z",
        period_local_start: "2026-10-01", period_local_end: "2026-10-01", report_timezone: "UTC",
      } : {}),
    });
    const generated = await generateDeliverable(job, async () => {});
    const result = await db.transaction(async (tx) => generated.apply?.(tx));
    assert(result?.deliverable_id);
    return owned<Deliverable>(owner, "deliverable", String(result.deliverable_id));
  }
  const internal = await draft("submission", "Concise internal review. Explicitly keep compensation expectations, availability, interest, office willingness and sharing permission unconfirmed. Do not send anything.");
  assert.equal(internal.source_snapshot.audience, "internal");
  assert.match(internal.title, /internal|review/i);
  assert.doesNotMatch(internal.content, /^(?:Dear|Hello|Hi)\b|\[Your name\]/im);
  for (const fact of [/compensation/i, /availability/i, /interest/i, /office/i, /permission|consent/i])
    assert.match(internal.content, fact);
  assert.match(internal.content, /unconfirmed|unknown|not confirmed/i);
  assert.doesNotMatch(internal.content, /(?:office|expectation|requirement)[^.!\n]{0,100}(?:not fixed|optional|may be flexible|might be flexible)/i);
  await assert.rejects(() => markSubmitted(owner, internal.id, {
    expected_version: 1, submitted_at: new Date().toISOString(), submission_note: "Must not record internal work as client delivery",
  }), (error: unknown) => error instanceof WorkspaceError && error.status === 409);
  const revision = await requestRevision(owner, internal.id, {
    expected_version: 1, instructions: "Make this shorter and more positive. Keep all unknowns visible.", request_key: randomUUID(),
  });
  const proposed = await generateRevision(revision, async () => {});
  assert.equal(proposed.result.audience, "internal");
  assert.equal((await owned<Deliverable>(owner, "deliverable", internal.id)).version, 1);
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='done',result=${json(proposed.result)} WHERE id=${revision.id}::uuid`);
  const revised = await applyRevision(owner, internal.id, { job_id: revision.id, expected_version: 1 });
  assert.equal(revised.version, 2);
  assert.equal(revised.source_snapshot.audience, "internal");
  assert.doesNotMatch(revised.content, /^(?:Dear|Hello|Hi)\b|\[Your name\]/im);
  const conversion = await requestRevision(owner, internal.id, {
    expected_version: 2, instructions: "Convert this internal review into a concise client recommendation email. Keep every unknown explicit. Do not imply this email has been sent or approved to share.", request_key: randomUUID(),
  });
  const converted = await generateRevision(conversion, async () => {});
  assert.equal(converted.result.audience, "client");
  assert.match(String(converted.result.content), /^(?:Dear|Hello|Hi|Good morning|Good afternoon)\b/i);
  assert.doesNotMatch(String(converted.result.content), /internal review|end of draft|^Subject:|not approved to share|draft for internal/im);
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='done',result=${json(converted.result)} WHERE id=${conversion.id}::uuid`);
  const clientRevision = await applyRevision(owner, internal.id, { job_id: conversion.id, expected_version: 2 });
  assert.equal(clientRevision.source_snapshot.audience, "client");
  assert.equal(clientRevision.version, 3);
  assert.doesNotMatch(clientRevision.content, /(?:office|expectation|requirement)[^.!\n]{0,100}(?:not fixed|optional|may be flexible|might be flexible)/i);
  const client = await draft("submission", "Concise recommendation for the client. This is a fictional QA exercise.");
  assert.equal(client.source_snapshot.audience, "client");
  assert.match(client.content, /^(?:Dear|Hello|Hi|Good morning|Good afternoon)\b/im);
  assert.match(client.content, /\[Your name\]/);
  const update = await draft("search_update", "Internal review of the selected evidence for the period. Do not address the client.");
  assert.equal(update.source_snapshot.audience, "internal");
  assert.doesNotMatch(update.content, /London[- ]based\s+or\s+(?:able|willing)|(?:either|alternatively)[^.\n]{0,80}(?:London|office)/i);
  assert.doesNotMatch(update.content, /^(?:Dear|Hello|Hi)\b/im);
});
