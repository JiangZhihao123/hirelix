import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toolResultList } from "../src/lib/workspace/tool-result-view";
import { TurnParts } from "../src/components/workspace/turn-parts";
Object.assign(globalThis, { React });

test("lists preserve inspectable results without leaking raw tool data", () => {
  const list = toolResultList("list_roles", {roles:[{title:"Engineering Lead",client_name:"Cedar",href:"/app/roles/role-id",private_notes:"not for display"}],returned:1,total:51,has_more:true});
  assert.equal(list?.items[0].detail,"Cedar");
  assert.equal(JSON.stringify(list).includes("not for display"),false);
  const html = renderToStaticMarkup(React.createElement(TurnParts, {parts:[{type:"tool",id:"roles",tool:"list_roles",label:"Listing roles",status:"done",list}]}));
  assert.match(html,/Engineering Lead/); assert.match(html,/href="\/app\/roles\/role-id"/);
  assert.match(html,/1 items returned/); assert.match(html,/51/); assert.match(html,/next page/);
});

test("empty and semantic results have explicit, bounded display data", () => {
  const empty = toolResultList("find_candidates",{matches:[],returned:0});
  const html = renderToStaticMarkup(React.createElement(TurnParts, {parts:[{type:"tool",id:"empty",tool:"find_candidates",label:"Finding candidates",status:"done",list:empty}]}));
  assert.match(html,/No items returned/);
  const list = toolResultList("find_candidates",{matches:[{person:{name:"Alex",headline:"Engineer",email:"private"},source_href:"/app/candidates?person=alex",content:"private CV"}],returned:1});
  assert.deepEqual(list?.items,[{title:"Alex",detail:"Engineer",href:"/app/candidates?person=alex"}]);
  assert.equal(toolResultList("read_candidate",{person:{name:"Alex"}}),undefined);
});
