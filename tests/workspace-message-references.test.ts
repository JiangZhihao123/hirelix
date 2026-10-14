import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MessageCandidateReferences} from '../src/components/workspace/message-candidate-references';
import {MessageRoleReference} from '../src/components/workspace/message-role-reference';
Object.assign(globalThis,{React});
test('message references render individual named candidate buttons and no empty strip',()=>{
 const html=renderToStaticMarkup(React.createElement(MessageCandidateReferences,{references:[{id:'a',name:'Mira'},{id:'b',name:'Rowan'}],onOpen:()=>{}}));
 assert.match(html,/Mira/);assert.match(html,/Rowan/);assert.equal((html.match(/<button/g)||[]).length,2);assert.match(html,/Candidate/);
 assert.equal(renderToStaticMarkup(React.createElement(MessageCandidateReferences,{references:[],onOpen:()=>{}})),'');
});
test('role references show the client and JD beside the message and omit missing selections',()=>{
 const html=renderToStaticMarkup(React.createElement(MessageRoleReference,{reference:{id:'role-a',title:'AI Engineer',client_name:'Client A'},onOpen:()=>{}}));
 assert.match(html,/Client A · AI Engineer/);assert.match(html,/Role.*JD/);
 assert.match(html,/ws-message-references/);
 assert.equal(renderToStaticMarkup(React.createElement(MessageRoleReference,{reference:undefined,onOpen:()=>{}})), '');
});
