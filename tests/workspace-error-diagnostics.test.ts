import assert from 'node:assert/strict';
import {test} from 'node:test';
import {workErrorDiagnostics} from '../src/lib/workspace/error-diagnostics';
test('database cause and locations survive without SQL parameters or private payloads',()=>{
 const cause=Object.assign(new Error('private document and secret'),{name:'PostgresError',code:'22021'});
 const outer=new Error('Failed query: SQL params: secret',{cause});
 outer.stack='Error: secret\n    at apply (/app/src/lib/workspace/imports.ts:301:9)';
 const result=workErrorDiagnostics(outer);
 assert.equal(result.error_causes[1].code,'22021');
 assert.match(result.error_causes[1].reason!,/NUL/);
 assert.deepEqual(result.error_causes[0].frames,['/src/lib/workspace/imports.ts:301:9']);
 assert.doesNotMatch(JSON.stringify(result),/secret|private document|params/);
 cause.cause=outer;
 assert.equal(workErrorDiagnostics(outer).error_causes.length,2);
 assert.deepEqual(workErrorDiagnostics('secret'),{error_causes:[]});
});
