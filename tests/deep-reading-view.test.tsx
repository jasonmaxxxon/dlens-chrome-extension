import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import { DeepReadingView } from '../src/ui/DeepReadingView.tsx';
import { buildDeepReadingModel, toggleDeepDisclosure, EMPTY_DEEP_DISCLOSURE, type DeepCommand } from '../src/viewmodel/deep-reading.ts';
import { buildDeepReadingInput, parseDeepReadingResponse } from '../src/compare/deep-reading.ts';
import { createDefaultSettings } from '../src/state/types.ts';
import type { DeepReadingRecord } from '../src/compare/deep-reading-storage.ts';
// Synthetic content only: no reference crawl text in the repository.
const item={id:'i',status:'succeeded',descriptor:{author_hint:'op',text_snippet:'RAG'},latestCapture:{id:'c',result:{comments:[{comment_id:'x',author:'fan',text:'RAG?',url:'https://www.threads.net/@fan/post/abc'}]}}} as any;
const input=buildDeepReadingInput(item)!;
const payload={background:'背景。作者解釋。',takeaway:'按場景理解。',terms:[{term:'RAG',plain:'先搵資料。',refs:['e1']}],debates:[0,1].map(i=>({question:`問題${i}`,status:'open',sides:[{who:'fan',claim:'試過',basis:'experience',note:'自述',refs:['e1']}]})),evidence:{strong:[{text:'自述',refs:['e1']}],weak:[]},unanswered:[]};
const record:DeepReadingRecord={status:'complete',itemId:'i',captureId:'c',promptVersion:'v1',model:'gemini-3.8-flash',inputReplyCount:1,estimatedCost:null,generatedAt:'2026-10-13',refs:input.refs,reading:parseDeepReadingResponse(JSON.stringify(payload),input)!};
test('term chip toggles, only one debate expands, and more starts folded',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://dlens.test'});const prior={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement};const g=globalThis as any;const priorAct=g.IS_REACT_ACT_ENVIRONMENT;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement});g.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=await import('react-dom/client');const container=document.getElementById('root')!;const root=createRoot(container);
 function Harness(){const [d,setD]=useState(EMPTY_DEEP_DISCLOSURE);const model=buildDeepReadingModel(item,createDefaultSettings(),record,'2026-10-13',false,null,d)!;return <DeepReadingView model={model} onCommand={(c:DeepCommand)=>{if(c.type!=='run')setD(v=>toggleDeepDisclosure(v,c));}}/>;}
 const click=async(selector:string)=>act(async()=>{container.querySelector<HTMLButtonElement>(selector)!.click();});
 try{await act(async()=>root.render(<Harness/>));assert.equal(container.querySelector('[data-deep-definition]'),null);assert.equal(container.querySelector('[data-deep-evidence]'),null);
 await click('[data-deep-term="0"]');assert.match(container.querySelector('[data-deep-definition]')!.textContent!,/先搵資料/);assert.match(container.querySelector('a')!.href,/threads.net/);await click('[data-deep-term="0"]');assert.equal(container.querySelector('[data-deep-definition]'),null);
 await click('[data-deep-debate="0"]');await click('[data-deep-debate="1"]');assert.equal(container.querySelectorAll('[data-deep-side]').length,1);assert.equal(container.querySelector('[data-deep-debate="0"]')!.getAttribute('aria-expanded'),'false');await click('[data-deep-more]');assert.ok(container.querySelector('[data-deep-evidence]'));
 }finally{await act(async()=>root.unmount());Object.assign(globalThis,prior);g.IS_REACT_ACT_ENVIRONMENT=priorAct;dom.window.close();}
});


import { renderToStaticMarkup } from 'react-dom/server';
test('reader state surfaces show the command, skeleton, result, stale and error',()=>{
  const settings=createDefaultSettings();
  const scenarios=[
    [buildDeepReadingModel(item,settings,undefined,'2026-10-13'),/深入解讀/],
    [buildDeepReadingModel(item,settings,undefined,'2026-10-13',true),/讀緊 1 則留言/],
    [buildDeepReadingModel(item,settings,record,'2026-10-13'),/你可以點理解/],
    [buildDeepReadingModel({...item,latestCapture:{...item.latestCapture,id:'new'}},settings,record,'2026-10-13'),/爬到新留言/],
    [buildDeepReadingModel(item,settings,undefined,'2026-10-13',false,'quota'),/quota/]
  ] as const;
  for(const [model,expected] of scenarios){const html=renderToStaticMarkup(<DeepReadingView model={model!} onCommand={()=>{}}/>);assert.match(html,expected);assert.match(html,new RegExp(`data-deep-reading="${model!.state}"`));}
  const noUrl={...record,refs:record.refs.map(r=>({...r,url:null}))};
  const opened=buildDeepReadingModel(item,settings,noUrl,'2026-10-13',false,null,{term:0,debate:null,more:false})!;
  assert.doesNotMatch(renderToStaticMarkup(<DeepReadingView model={opened} onCommand={()=>{}}/>),/href=/);
});
