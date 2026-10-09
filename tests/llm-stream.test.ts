import assert from "node:assert/strict";
import {test} from "node:test";
import {partialAnswer, readCompletionStream} from "../src/lib/llm-stream";

test("answer preview excludes JSON actions and handles incomplete escapes", () => {
  assert.equal(partialAnswer('{"answer":"Hello'),"Hello");
  assert.equal(partialAnswer('{"answer":"Line\\nTwo\\u4f60'),"Line\nTwo你");
  assert.equal(partialAnswer('{"answer":"Line\\u4f'),"Line");
  assert.equal(partialAnswer('{"answer":"Quote: \\"'), 'Quote: "');
  assert.equal(partialAnswer('{"answer":"Done","actions":[{"secret":"hidden"}]}'),"Done");
  assert.equal(partialAnswer('{"actions":[{"answer":"not prose"}]}'), "");
  assert.equal(partialAnswer('{"answer":"A\\ud83d'),"A");
});
function response(text: string) {
  const bytes=new TextEncoder().encode(text);
  return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=3) controller.enqueue(bytes.slice(i,i+3)); controller.close();}}));
}
test("SSE parser streams content across byte boundaries and retains usage, never reasoning",async()=>{
  const frames=[{choices:[{delta:{reasoning_content:"private reasoning"}}]}, {choices:[{delta:{content:"你"}}]}, {choices:[{delta:{content:"好"}}]}, {choices:[],usage:{prompt_tokens:10,completion_tokens:2,total_tokens:12}}];
  const seen:string[]=[];
  const result=await readCompletionStream(response(': keepalive\r\n'+frames.map(x=>'data: '+JSON.stringify(x)+'\r\n\r\n').join('')+'data: [DONE]\n\n'),async text=>{seen.push(text);});
  assert.deepEqual(seen,["你","你好"]); assert.equal(result.choices[0].message.content,"你好"); assert.deepEqual(result.usage,frames[3].usage);
});
test("truncated, error and missing-usage streams fail instead of becoming completed answers",async()=>{
  await assert.rejects(()=>readCompletionStream(response('data: {"choices":[]}\n'),async()=>{}),/before completion/);
  await assert.rejects(()=>readCompletionStream(response('data: {"error":{"message":"fail"}}\n'),async()=>{}),/stream failed/);
  await assert.rejects(()=>readCompletionStream(response('data: [DONE]\n'),async()=>{}),/no usage/);
});
