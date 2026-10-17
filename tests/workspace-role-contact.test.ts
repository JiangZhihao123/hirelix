import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailRecipient,type ConversationEmail} from '../src/lib/workspace/email-contract';
import {roleInput} from '../src/lib/workspace/types';
const pending:ConversationEmail={status:'review',request_key:'preview',snapshot:{from:'sender@example.com',to:'temporary@example.com',title:'Recommendation',content:'Text',files:[],document_id:'document-a',document_version:1}};
test('role can be saved before contact details are known',()=>{
 const role=roleInput.parse({title:'Product manager',client_name:'Client',jd_text:'Requirements'});
 assert.equal(role.client_contact.email,'');
});
test('recommendation defaults to the saved client contact',()=>assert.equal(emailRecipient(null,undefined,'document-a','client@example.com'),'client@example.com'));
test('explicit recipient overrides preview and role without modifying either',()=>{
 const before=structuredClone(pending);
 assert.equal(emailRecipient('once@example.com',pending,'document-a','client@example.com'),'once@example.com');
 assert.deepEqual(pending,before);
});
test('content revisions keep the same reviewed recipient even after contact changes',()=>assert.equal(emailRecipient(null,pending,'document-a','changed@example.com'),'temporary@example.com'));
test('switching recommendations never reuses another document recipient',()=>{
 assert.equal(emailRecipient(null,pending,'document-b','other-client@example.com'),'other-client@example.com');
 assert.equal(emailRecipient(null,pending,'document-b',null),null);
 assert.equal(emailRecipient(null,pending,null,null),null);
});
test('historical or cancelled email does not override current role contact',()=>{
 for(const status of ['cancelled','superseded','sent','sending','unknown','failed'] as const){
  const history={...pending,status};
  assert.equal(emailRecipient(null,history,'document-a','current@example.com'),'current@example.com');
  assert.equal(history.snapshot.to,'temporary@example.com');
 }
});
