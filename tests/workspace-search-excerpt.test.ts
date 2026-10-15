import assert from 'node:assert/strict';
import {test} from 'node:test';
import {semanticExcerpt} from '../src/lib/workspace/search-excerpt';
test('experience result shows nested source evidence instead of repeating identity',()=>{
 const text=semanticExcerpt('Candidate: QA\n'+JSON.stringify({name:'QA',headline:'Product Director',location:'London',profile:{summary:'Built warehouse products',experience:[{company:'Fictional Logistics',description:'Reduced exception resolution from nine hours to four.'}]},skills:['Logistics']}));
 assert.match(text,/Built warehouse products/);assert.match(text,/nine hours to four/);assert.doesNotMatch(text,/Product Director|London/);
});
test('record excerpts preserve prose or nested source fields and incomplete chunks stay unreadable',()=>{
 assert.equal(semanticExcerpt('Candidate: QA\n'+JSON.stringify({content:'Actual call note'})),'Actual call note');
 assert.equal(semanticExcerpt('Candidate: QA\n'+JSON.stringify({content:JSON.stringify({profile:{summary:'Exact source text'}})})),'Exact source text');
 assert.equal(semanticExcerpt('Candidate: QA\n{"profile":'),'');
});
