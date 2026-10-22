import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { TurnParts } from "../src/components/workspace/turn-parts";
import { ConversationMessage } from "../src/components/workspace/conversation-message";
import type { TurnPart } from "../src/lib/workspace/turn-progress";
import type { Message } from "../src/lib/workspace/types";
Object.assign(globalThis, {React});

test("a finished answer leads, with inspectable execution history and prominent failures", () => {
  const parts: TurnPart[] = [
    {type:"text", text:"I am reading the profiles."},
    {type:"tool",id:"read",tool:"read_candidate",label:"Reading candidate details",status:"done",href:"/app/candidates?person=a",target:"Alex"},
    {type:"tool",id:"failed",tool:"web_search",label:"Searching the web",status:"error"},
    {type:"text",text:"Alex has relevant billing ownership. The external search failed."},
  ];
  const $ = load(renderToStaticMarkup(React.createElement(TurnParts, {parts})));
  const history = $("details.ws-turn-history");
  assert.equal(history.length, 1);
  assert.equal(history.attr("open"), undefined);
  assert.match(history.text(), /reading the profiles/);
  assert.equal(history.find('a[href="/app/candidates?person=a"]').length, 1);
  assert.match($(".ws-turn-parts").first().children().first().text(), /Searching the web/);
  assert.equal(history.find(".ws-tool-error").length, 0);
  assert.match($(".ws-message-prose").not(history.find(".ws-message-prose")).text(), /Alex has relevant billing ownership/);
});

test("running work, interruptions and partial search warnings remain visible", () => {
  const parts: TurnPart[] = [
    {type:"tool",id:"done",tool:"read_candidate",label:"Reading candidate details",status:"done"},
    {type:"tool",id:"active",tool:"prepare_document",label:"Preparing your document",status:"running"},
    {type:"tool",id:"partial",tool:"web_search",label:"Searching the web",status:"done",warning:"Partial results",sources:[{title:"Source",href:"https://example.com/"}]},
  ];
  for (const running of [true, false]) {
    const $ = load(renderToStaticMarkup(React.createElement(TurnParts, {parts,running})));
    const history = $("details.ws-turn-history");
    assert.doesNotMatch(history.text(), /Preparing your document|Some searches failed/);
    assert.ok($(`.ws-tool-status[aria-label="${running ? "In progress" : "Interrupted"}"]`).length > 0);
    assert.equal($(".ws-tool-partial").length, 1);
    assert.equal(history.find(".ws-tool-partial").length, 0);
  }
});

test("saved objects are compact while an unresolved action stays directly actionable", () => {
  const action = {id:"a",kind:"update_candidate",title:"Saved Alex",status:"saved",person_id:"alex",role_id:null,fields:{},href:"/app/candidates?person=alex"};
  const message = {id:"m",conversation_id:"c",role:"assistant",content:"Profile updated.",created_at:"2026-10-22T10:00:00Z",metadata:{actions:[action,{...action,id:"b",title:"Updated Alex"},{...action,id:"pending",title:"Review Casey",status:"pending",href:undefined}]}} as unknown as Message;
  const $ = load(renderToStaticMarkup(React.createElement(ConversationMessage, {message,laterScheduleIds:[],onReady:()=>{},onRevise:()=>{},onMemories:()=>{},onSource:()=>{},onReview:()=>{},onCopy:()=>{},copiedId:null})));
  assert.equal($("details.ws-saved-items").attr("open"), undefined);
  assert.equal($("details.ws-saved-items li").length, 1);
  assert.match($("details.ws-saved-items").text(), /Updated Alex/);
  assert.match($(".ws-action-proposal").text(), /Review Casey/);
  assert.match($(".ws-action-proposal button").text(), /Review &amp; save|Review & save/);
  assert.match($(".ws-message-prose").text(), /Profile updated/);
});

test("editing an existing document delivers an openable saved result even without export or preparation", () => {
  const document = {id:"3c6c8bee-7507-47fe-823d-06f2bdf75b6e",title:"Internal recommendation",version:2,href:"/app/submissions/3c6c8bee-7507-47fe-823d-06f2bdf75b6e"};
  const message = {id:"m",conversation_id:"c",role:"assistant",content:"Updated using the screening call.",created_at:"2026-10-22T10:00:00Z",metadata:{document_edits:[document,{...document,version:3}]}} as unknown as Message;
  const render = (value:Message, running=false) => load(renderToStaticMarkup(React.createElement(ConversationMessage,{message:value,laterScheduleIds:[],onReady:()=>{},onRevise:()=>{},onMemories:()=>{},onSource:()=>{},onReview:()=>{},onCopy:()=>{},copiedId:null,...(running ? {activeJob:{status:"running",progress:"",error:null,result:{}}} : {})})));
  const $=render(message);
  assert.equal($(".ws-document-reference button").length,1);
  assert.match($(".ws-document-reference").text(),/Saved document · v3Internal recommendation/);
  assert.equal($("details .ws-document-reference").length,0,"The result is available without opening tool history");
  assert.equal(render(message,true)(".ws-document-reference").length,0);
  assert.equal(render({...message,metadata:{...message.metadata,exports:{document_id:document.id,formats:["pdf"]}}})(".ws-document-reference").length,0,"An export card already provides access to this result");
});
