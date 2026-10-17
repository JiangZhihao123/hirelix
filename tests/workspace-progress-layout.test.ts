import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { TurnActivity } from '../src/components/workspace/turn-activity';

Object.assign(globalThis, { React });
const css = readFileSync('src/components/workspace/workspace.css', 'utf8');

test('repeated tool counts and thinking handoffs keep the same row geometry', {skip:process.env.WORKSPACE_LAYOUT_TEST!=='true'}, async () => {
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
  const page=await browser.newPage();
  await page.setContent(`<style>*{box-sizing:border-box}${css}</style><main class="private-workspace" style="width:520px"><div id="turn"></div><div id="anchor">Next content</div></main>`);
  let baseline: {height:number; anchor:number; arrow:number} | undefined;
  for (const count of [1,2,9,10,14,99,100]) {
    for (const phase of ['tools','thinking']) {
      const parts = Array.from({length:count}, (_,i) => ({type:'tool',id:`read-${i}`,tool:'read_candidate',label:'Reading candidate details',target:'A candidate with a long source name',href:'/app/candidates?person=test',status:phase==='tools' && i===count-1?'running':'done'}));
      const html=renderToStaticMarkup(React.createElement(TurnActivity,{job:{status:'running',progress:'',error:null,result:{parts,phase}}}));
      await page.locator('#turn').evaluate((node, markup) => {node.innerHTML=markup;},html);
      assert.equal((await page.locator('.ws-tool-count').innerText()).trim(),`× ${count}`);
      const geometry=await page.evaluate(()=>({height:document.querySelector('#turn')!.getBoundingClientRect().height,anchor:document.querySelector('#anchor')!.getBoundingClientRect().top,arrow:document.querySelector('.ws-tool-chevron')!.getBoundingClientRect().x}));
      baseline ??= geometry;
      assert.deepEqual(geometry,baseline,`${count} calls during ${phase}`);
    }
  }
  } finally {await browser.close();}
});
