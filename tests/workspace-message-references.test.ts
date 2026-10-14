import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MessageCandidateReferences} from '../src/components/workspace/message-candidate-references';
import {ConversationContext} from '../src/components/workspace/conversation-context';
Object.assign(globalThis,{React});
test('message references render individual named candidate buttons and no empty strip',()=>{
 const html=renderToStaticMarkup(React.createElement(MessageCandidateReferences,{references:[{id:'a',name:'Mira'},{id:'b',name:'Rowan'}],onOpen:()=>{}}));
 assert.match(html,/Mira/);assert.match(html,/Rowan/);assert.equal((html.match(/<button/g)||[]).length,2);assert.match(html,/Candidate/);
 assert.equal(renderToStaticMarkup(React.createElement(MessageCandidateReferences,{references:[],onOpen:()=>{}})),'');
});
test('candidate results do not become conversation-level references',()=>{
 const html=renderToStaticMarkup(React.createElement(ConversationContext,{messages:[{id:'m',role:'assistant',content:'Read Mira',conversation_id:'c',created_at:'',metadata:{sources:[{title:'Mira',href:'/app/candidates?person=550e8400-e29b-41d4-a716-446655440000'}]}}],onSource:()=>{}}));assert.equal(html,'');
});
