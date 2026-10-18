import assert from 'node:assert/strict';
import {test} from 'node:test';
import {recommendationSections,recommendationCover} from '../src/lib/workspace/recommendation-presentation';
test('candidate sections use exact structural headings and retain unstructured documents intact',()=>{
 const people=[{id:'a',name:'Avery'},{id:'b',name:'Mira'}];
 const result=recommendationSections('Overview\n\n## Avery\nEvidence A\n### Unknowns\nDiscuss scope\n## Mira\nEvidence B\n## Additional notes\nShared closing',people);
 assert.equal(result.overview,'Overview');assert.ok(result.closing.includes('Shared closing'));assert.ok(!result.sections.b.includes('Shared closing'));assert.ok(result.sections.a.includes('Discuss scope'));assert.ok(!result.sections.a.includes('Evidence B'));
 for(const content of ['Avery and Mira are recommended.','## Avery\nEvidence A']) assert.deepEqual(recommendationSections(content,people),{overview:content,closing:"",sections:{},headings:{}});
 assert.equal(recommendationSections('## Avery\nSomething',[{id:'a',name:'Avery'},{id:'b',name:'Avery'}]).overview,'## Avery\nSomething');
});
test('cover identifies the recommendation without inventing candidate assessments or claiming attachments',()=>{
 const text=recommendationCover({language:'en',role:'Product Director',people:[{name:'Avery'},{name:'Mira'}]});
 assert.ok(text.includes('Product Director')&&text.includes('Avery, Mira'));assert.ok(!text.includes('attached'));
});


test('decorated candidate headings retain their text and bind evidence to the exact unique name',()=>{
 const people=[{id:'a',name:'Avery'},{id:'b',name:'Mira'}];
 const content='Overview\n## Avery — Product Lead\nOnly Avery evidence\n## Mira — Senior PM\nOnly Mira evidence\n## Next steps\nShared closing';
 const result=recommendationSections(content,people);
 assert.equal(result.overview,'Overview');
 assert.equal(result.headings.a,'Avery — Product Lead');
 assert.equal(result.sections.a.trim(),'Only Avery evidence');
 assert.equal(result.sections.b.trim(),'Only Mira evidence');
 assert.match(result.closing,/Shared closing/);
 for(const people of [[{id:'a',name:'Avery'},{id:'b',name:'Avery — Product Lead'}],[{id:'a',name:'Avery'},{id:'b',name:'Avery'}]]) {
   assert.deepEqual(recommendationSections(content,people).sections,{});
 }
 assert.deepEqual(recommendationSections('## Averyson — Product Lead\nNot Avery', [{id:'a',name:'Avery'}]).sections,{});
});
