import assert from 'node:assert/strict';
import test from 'node:test';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';
import {DeepReadingView} from '../src/ui/DeepReadingView';
import {buildDeepReadingModel} from '../src/viewmodel/deep-reading';
import {createDefaultSettings} from '../src/state/types';
const item:any={id:'i',descriptor:{author_hint:'op'},latestCapture:{id:'c',result:{canonical_post:{author:'op'},comments:[{comment_id:'q',author:'fan',text:'合成問題？'},{comment_id:'a',parent_comment_id:'q',author:'op',text:'合成作者解釋。'}]}}};
const record:any={status:'complete',itemId:'i',captureId:'c',promptVersion:'v2',model:'gpt-4.1-mini',estimatedCost:null,refs:[{ref:'e2',commentId:'a',author:'op',url:null}],reading:{background:'背景。',takeaway:'結論。',terms:[{term:'測試',plain:'合成定義。',refs:['e2']}],debates:[],evidence:{strong:[],weak:[]},unanswered:[]}};
test('a deep ref without a URL opens its exact local reply and parent, retains author badge; stale capture never substitutes',async()=>{
 const dom=new JSDOM('<div id="root"></div>');const old={window:globalThis.window,document:globalThis.document};Object.assign(globalThis,{window:dom.window,document:dom.window.document});(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 let scrolled:string|null=null;dom.window.HTMLElement.prototype.scrollIntoView=function(){scrolled=this.getAttribute('data-reading-source-target');};
 const {createRoot}=await import('react-dom/client');const container=document.getElementById('root')!;const root=createRoot(container);
 const show=async(capture='c',url:string|null=null)=>{const model=buildDeepReadingModel(item,createDefaultSettings(),{...record,captureId:capture,refs:[{...record.refs[0],url}]},'2026-10-15',false,null,{term:0,debate:null,more:false})!;await act(async()=>root.render(<DeepReadingView model={model} onCommand={()=>{}}/>));};
 try{await show();const ref=container.querySelector<HTMLButtonElement>('button[data-reading-ref="e2"]');assert.ok(ref,'no-permalink sources must remain clickable');await act(async()=>ref.click());assert.match(container.querySelector('[data-reading-source]')!.textContent!,/合成問題.*作者.*合成作者解釋/s);assert.equal(container.querySelector('[data-reading-source-target]')?.getAttribute('data-reading-source-target'),'a');assert.equal(scrolled,'a');assert.equal(document.activeElement?.getAttribute('data-reading-source-target'),'a');
 await show('old');await act(async()=>container.querySelector<HTMLButtonElement>('button[data-reading-ref="e2"]')!.click());assert.match(container.textContent!,/原留言已唔喺最新抓取入面/);assert.equal(container.querySelector('[data-reading-source-target]'),null);
 const savedComments=item.latestCapture.result.comments;item.latestCapture.result.comments=savedComments.filter((c:any)=>c.comment_id!=='a');await show();assert.match(container.querySelector('[data-reading-source]')!.textContent!,/原留言已唔喺最新抓取入面/);assert.equal(container.querySelector('[data-reading-source-target]'),null);item.latestCapture.result.comments=savedComments;
 await show('c','https://www.threads.net/@op/post/source');assert.ok(container.querySelector('button[data-reading-ref="e2"]'));assert.match(container.querySelector('a')!.textContent!,/原站/);
 }finally{await act(async()=>root.unmount());Object.assign(globalThis,old);dom.window.close();}
});

import {TopicReadingView} from '../src/ui/TopicReadingView';
import {buildTopicReadingModel} from '../src/viewmodel/topic-reading';
import {buildTopicReadingInput} from '../src/compare/topic-reading';
test('topic refs from one author retain separate comment destinations and open cited reply rather than only the post',async()=>{
 const dom=new JSDOM('<div id="root"></div>');const old={window:globalThis.window,document:globalThis.document};Object.assign(globalThis,{window:dom.window,document:dom.window.document});(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root')!);
 const topic:any={id:'t',name:'合成研究'};const input=buildTopicReadingInput(topic,[item]);
 const stored:any={status:'complete',topicId:'t',signature:input.signature,question:input.question,promptVersion:'v2',model:'gpt-4.1-mini',inputPostCount:1,estimatedCost:null,reading:{answer:'合成答案。',points:[{text:'作者解釋。',refs:['p1','p1.r2']}],gaps:[]},refs:[{ref:'p1',itemId:'i',captureId:'c',author:'op'},{ref:'p1.r2',itemId:'i',captureId:'c',commentId:'a',author:'op'}]};
 const model=buildTopicReadingModel(topic,[item],createDefaultSettings(),stored,'2026-10-15');let openedPost=false;
 try{await act(async()=>root.render(<TopicReadingView model={model} onRun={()=>{}} onRef={()=>{openedPost=true;}}/>));const source=document.querySelector<HTMLButtonElement>('button[data-reading-ref="p1.r2"]');assert.ok(source,'post and reply from same author must not collapse');await act(async()=>source.click());assert.equal(openedPost,false);assert.match(document.querySelector('[data-reading-source]')!.textContent!,/合成作者解釋/);assert.equal(document.querySelector('[data-reading-source-target]')?.getAttribute('data-reading-source-target'),'a');}
 finally{await act(async()=>root.unmount());Object.assign(globalThis,old);dom.window.close();}
});
