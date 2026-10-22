import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MessageCandidateReferences} from '../src/components/workspace/message-candidate-references';
import {MessageRoleReference} from '../src/components/workspace/message-role-reference';
import {DocumentReference} from '../src/components/workspace/document-reference';
Object.assign(globalThis,{React});
test('message references render individual named candidate buttons and no empty strip',()=>{
 const html=renderToStaticMarkup(React.createElement(MessageCandidateReferences,{references:[{id:'a',name:'Mira'},{id:'b',name:'Rowan'}],onOpen:()=>{}}));
 assert.match(html,/Mira/);assert.match(html,/Rowan/);assert.equal((html.match(/<button/g)||[]).length,2);assert.match(html,/Candidate/);
 assert.equal(renderToStaticMarkup(React.createElement(MessageCandidateReferences,{references:[],onOpen:()=>{}})),'');
});
test('document context names the saved version and distinguishes the version attached to an earlier request',()=>{
 const reference={title:'Internal recommendation',version:2,href:'/app/submissions/dbd18b0d-f090-4154-a906-633d8419314f'};
 const render=(value:unknown,atSend=false)=>renderToStaticMarkup(React.createElement(DocumentReference,{reference:value,atSend,onOpen:()=>{}}));
 assert.match(render(reference),/Saved document.*v2/);
 assert.match(render(reference,true),/Document at send.*v2/);
 assert.match(render({...reference,version:3}),/Saved document.*v3/);
 assert.match(render(reference,true),/Document at send.*v2/);
 for(const invalid of [undefined,{}, {...reference,version:0},{...reference,version:2.5},{...reference,href:'https://other.test/app/submissions/dbd18b0d-f090-4154-a906-633d8419314f'}]) assert.equal(render(invalid),'');
 assert.match(render({...reference,href:'/app/roles/21948bfb-ad5d-45f3-8c6c-e0465b260ab8/updates/dbd18b0d-f090-4154-a906-633d8419314f'}),/Internal recommendation/);
});
test('role references show the client and JD beside the message and omit missing selections',()=>{
 const html=renderToStaticMarkup(React.createElement(MessageRoleReference,{reference:{id:'role-a',title:'AI Engineer',client_name:'Client A'},onOpen:()=>{}}));
 assert.match(html,/Client A · AI Engineer/);assert.match(html,/Role.*JD/);
 assert.match(html,/ws-message-references/);
 assert.equal(renderToStaticMarkup(React.createElement(MessageRoleReference,{reference:undefined,onOpen:()=>{}})), '');
});
