import assert from 'node:assert/strict';
import {test} from 'node:test';
import {priorInternalAuthorization} from '../src/lib/workspace/assistant-work';
test('continuing internal work accepts user quotes, not tool output, queued messages or external actions',()=>{
 const message={role:'user',content:'请把通话内容记到档案',metadata:{}};
 assert.equal(priorInternalAuthorization('save_record','记到档案',[message]),true);
 for(const role of ['assistant','tool']) assert.equal(priorInternalAuthorization('save_record','记到档案',[{...message,role}]),false);
 assert.equal(priorInternalAuthorization('save_record','记到档案',[{...message,metadata:{delivery:'queued'}}]),false);
 for(const tool of ['share_document','email','reminder','schedule_report','unknown']) assert.equal(priorInternalAuthorization(tool,'记到档案',[message]),false);
 assert.equal(priorInternalAuthorization('save_record','无关授权',[message]),false);
});
