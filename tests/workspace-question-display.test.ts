import assert from "node:assert/strict";
import {test} from "node:test";
import {visibleTurnParts, type TurnPart} from "../src/lib/workspace/turn-progress";
const failed: TurnPart = {type:"tool", id:"first", tool:"ask_user", label:"Waiting for your answer", status:"error"};
test("successful question retry replaces the failed presentation attempt", () => {
 const report: TurnPart = {type:"text", text:"Report"};
 const success: TurnPart = {...failed, id:"retry", status:"done"};
 assert.deepEqual(visibleTurnParts([report, failed, success]), [report]);
});
test("an unresolved question failure and unrelated business failure remain visible", () => {
 assert.deepEqual(visibleTurnParts([failed]), [failed]);
 const business: TurnPart = {...failed, id:"save", tool:"save_candidate"};
 assert.deepEqual(visibleTurnParts([business, {...failed, status:"done"}]), [business]);
});
