import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TurnActivity } from "../src/components/workspace/turn-activity";
import { ConversationQuestion } from "../src/components/workspace/conversation-question";
import type { Job } from "../src/lib/workspace/types";
Object.assign(globalThis, { React });
const job = (status: Job["status"]): Pick<Job, "status" | "progress" | "error" | "result"> => ({status, progress:"Reading requirements", error:status === "error" ? "Service unavailable" : null, result:{live_reply:"Already checked the role.",activity:[{label:"Reading requirements",at:"now"}]}});
test("running reply exposes current status; terminal reply has no spinner or activity tail", () => {
  const running = renderToStaticMarkup(React.createElement(TurnActivity, {job:job("running")}));
  assert.match(running,/Already checked the role/); assert.doesNotMatch(running,/Thinking|Reading requirements/);
  const waiting = renderToStaticMarkup(React.createElement(TurnActivity,{job:{...job("running"),result:{}}}));
  assert.match(waiting,/role="status"/);assert.match(waiting,/Thinking/);assert.match(waiting,/animate-spin/);
  for (const status of ["done","cancelled","error"] as const) {
    const html = renderToStaticMarkup(React.createElement(TurnActivity,{job:job(status)}));
    assert.doesNotMatch(html,/animate-spin|View activity|<details/);
    if (status === "cancelled") assert.doesNotMatch(html,/Already checked the role/);
    else assert.match(html,/Already checked the role/);
    if(status === "cancelled") assert.match(html,/Stopped/);
  }
});
test("failed turn retains partial output and exposes recovery in the same reply", () => {
  const html = renderToStaticMarkup(React.createElement(TurnActivity,{job:job("error"),onRetry:async()=>{}}));
  assert.match(html,/role="alert"/); assert.match(html,/Service unavailable/); assert.match(html,/>Retry</); assert.match(html,/saved results are kept/);
});
test("answered clarification stops looking like an outstanding decision", () => {
  const html = renderToStaticMarkup(React.createElement(ConversationQuestion,{question:{question:"Which role?",options:["Cedar","Beacon"],status:"answered"} as Parameters<typeof ConversationQuestion>[0]["question"],onReply:()=>{}}));
  assert.match(html,/Answered/); assert.match(html,/Which role/); assert.doesNotMatch(html,/textarea|Your answer is needed|ws-question-card/);
});

test("thinking resumes between tool steps and ends on text, stop or completion", () => {
  const parts = [{type:"text",text:"I will check the saved roles."},{type:"tool",id:"list",label:"Listing roles",status:"done"}];
  const render = (phase: string, status: Job["status"] = "running") => renderToStaticMarkup(React.createElement(TurnActivity, {job:{...job(status),result:{parts,phase,live_reply:"I will check the saved roles."}}}));
  assert.match(render("thinking"), /Thinking/);
  assert.match(render("thinking"), /animate-spin/);
  for (const phase of ["responding","tools","complete"]) assert.doesNotMatch(render(phase), /Thinking/);
  for (const status of ["done","cancelled","error"] as const) assert.doesNotMatch(render("thinking",status), /Thinking|animate-spin/);
});
