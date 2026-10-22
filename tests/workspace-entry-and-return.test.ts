import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { firstAssignmentPrompt } from "../src/lib/landing-content";
import { billingSettingsHref, checkoutReturnUrl, workspaceReturnPath } from "../src/lib/workspace/return-path";
import { ConversationAccess } from "../src/components/workspace/conversation-access";
import { ConversationStarters } from "../src/components/workspace/conversation-starters";
import type { AgentAccess } from "../src/lib/agent-plan";
import { canResumeRecentConversation } from "../src/components/workspace/conversation-draft";
Object.assign(globalThis, {React});

const access: AgentAccess = {state:"trial_ready",used:0,limit:200,remaining:200,reserved:0,periodStart:null,periodEnd:null};
const conversation = "/app?conversation=8ac4a939-8438-4195-8cf5-0082596bdea5";

test("ordinary sign-in resumes work while explicit assignments and new work keep their destination", () => {
  for (const query of ["", "entry=signin", "entry=signin&utm_source=example&page_variant=personal-agent"]) assert.equal(canResumeRecentConversation(new URLSearchParams(query)),true,query);
  for (const query of ["entry=free_trial", "plan=agent_annual", ...["conversation","new","role","person","document","prompt"].map(key=>`entry=signin&${key}=selected`)]) assert.equal(canResumeRecentConversation(new URLSearchParams(query)),false,query);
});

test("a selected assignment survives settings and checkout without exposing an external redirect", () => {
  const start = `/app?entry=free_trial&plan=agent_annual&prompt=${encodeURIComponent(firstAssignmentPrompt)}`;
  assert.ok(firstAssignmentPrompt.length <= 500, "The app accepts at most 500 characters from an entry prompt");
  const settings = new URL(billingSettingsHref(start),"http://localhost:3000");
  assert.equal(settings.searchParams.get("plan"),"agent_annual");
  assert.equal(settings.searchParams.get("returnTo"),start);
  const success = new URL(checkoutReturnUrl("http://localhost:3000",settings.searchParams.get("returnTo")));
  assert.equal(success.searchParams.get("checkout"),"pending", "Redirecting must not claim that payment is confirmed");
  const returned = new URL(success.searchParams.get("returnTo")!,"http://localhost:3000");
  assert.equal(returned.searchParams.get("prompt"),firstAssignmentPrompt);
  for (const unsafe of ["https://evil.test/app","//evil.test/app","/app\\@evil.test","/app/settings?returnTo=/app","/application","/app/../auth","javascript:alert(1)","/app\n"]) {
    assert.equal(workspaceReturnPath(unsafe),null,unsafe);
    assert.equal(new URL(checkoutReturnUrl("http://localhost:3000",unsafe)).searchParams.has("returnTo"),false);
  }
  const emailDraft = "/app/submissions/6a79ae7c-7409-447e-ac8f-3cb8db44904d#recommendation-delivery";
  assert.equal(workspaceReturnPath(emailDraft),emailDraft);
  assert.equal(workspaceReturnPath(conversation),conversation);
});

test("changing a billing cycle persists through work, reload and the pending checkout return", () => {
  const start = `/app?conversation=8ac4a939-8438-4195-8cf5-0082596bdea5&plan=agent_monthly&prompt=${encodeURIComponent(firstAssignmentPrompt)}`;
  const selected = new URL(billingSettingsHref(start,"agent_annual"),"http://localhost:3000");
  const back = selected.searchParams.get("returnTo")!;
  const work = new URL(back,"http://localhost:3000");
  assert.equal(work.searchParams.get("conversation"),"8ac4a939-8438-4195-8cf5-0082596bdea5");
  assert.equal(work.searchParams.get("prompt"),firstAssignmentPrompt);
  assert.equal(work.searchParams.get("plan"),"agent_annual");
  assert.equal(new URL(billingSettingsHref(back),"http://localhost:3000").searchParams.get("plan"),"agent_annual");
  const pending = new URL(checkoutReturnUrl("http://localhost:3000",start,"agent_annual"));
  assert.equal(pending.searchParams.get("plan"),"agent_annual");
  assert.equal(pending.searchParams.get("returnTo"),back);
  assert.equal(pending.searchParams.get("checkout"),"pending");
  const document = "/app/submissions/6a79ae7c-7409-447e-ac8f-3cb8db44904d#recommendation-delivery";
  const returnedDocument = new URL(new URL(billingSettingsHref(document,"agent_monthly"),"http://localhost:3000").searchParams.get("returnTo")!,"http://localhost:3000");
  assert.equal(returnedDocument.hash,"#recommendation-delivery");
  assert.equal(new URL(checkoutReturnUrl("http://localhost:3000","https://evil.test/app","agent_annual")).searchParams.has("returnTo"),false);
});

test("trial and exhausted access show clear navigation, while paid normal use has no upsell", () => {
  const render = (value: AgentAccess | null, required=false) => load(renderToStaticMarkup(React.createElement(ConversationAccess,{access:value,required,returnTo:conversation})));
  let $ = render(access);
  assert.match($.text(),/first AI task.*200 AI credits; no card required/);
  assert.equal($("[role=status]").length,0);
  $ = render({...access,state:"trial",remaining:72.5});
  assert.match($.text(),/72.5 AI credits remaining/);
  for (const value of [{...access,state:"expired" as const}, {...access,state:"paid" as const,remaining:0}]) {
    $ = render(value);
    assert.match($("[role=status]").text(),/saved work stays available/);
    assert.equal(new URL($("a").attr("href")!,"http://localhost:3000").searchParams.get("returnTo"),conversation);
  }
  assert.equal(renderToStaticMarkup(React.createElement(ConversationAccess,{access:{...access,state:"paid"},returnTo:conversation})),"");
  assert.match(render(null,true).text(),/View plans/);
});

test("starting points offer editable work requests for first use and continued use", () => {
  for (const returning of [false,true]) {
    const $ = load(renderToStaticMarkup(React.createElement(ConversationStarters,{returning,onChoose:()=>{}})));
    assert.equal($("button").length,3);
    assert.equal($("button[type=submit]").length,0);
    assert.match($.text(),returning ? /Pick up my searches/ : /Compare candidates for a role/);
    assert.match($.text(),/Prepare for a candidate call/);
  }
});
