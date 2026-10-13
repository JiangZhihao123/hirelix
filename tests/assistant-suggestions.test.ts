import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assistantSegments} from '../src/lib/workspace/assistant-suggestions';

test('ordinary suggestions remain ordinary text',()=>{
 assert.deepEqual(assistantSegments('建议先核实经历。'),[{kind:'text',text:'建议先核实经历。'}]);
});
test('explicit suggestions preserve order during streaming and after completion',()=>{
 const prefix='分析结果。\n:::assistant-suggestion\n建议与理由';
 assert.deepEqual(assistantSegments(prefix),[{kind:'text',text:'分析结果。\n'},{kind:'suggestion',text:'建议与理由'}]);
 assert.equal(assistantSegments(prefix+'\n::')[1].kind,'suggestion');
 assert.deepEqual(assistantSegments(prefix+'\n:::\n继续。').map(p=>p.kind),['text','suggestion','text']);
 for(const tail of [':','::',':::assistant-sug']) assert.equal(assistantSegments('正文\n'+tail).length,1);
});
